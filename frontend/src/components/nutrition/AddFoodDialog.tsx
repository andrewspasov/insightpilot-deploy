import { useDeferredValue, useEffect, useState } from "react";
import { BookOpen, Camera, FileText, Pencil, Plus, Trash2 } from "lucide-react";

import {
  useCreateCustomFood,
  useCreateNutritionEntry,
  useDeleteRecipe,
  useLogRecipe,
  useLogSavedMeal,
  useNutritionFoodSearch,
  useNutritionRecipes,
  useNutritionSavedMeals,
} from "@/hooks/use-nutrition";
import { useToast } from "@/hooks/use-toast";
import { formatNutritionNumber, formatQuantityWithUnit } from "@/lib/nutrition";
import type {
  NutritionFoodSearchResult,
  NutritionMealType,
  NutritionRecipe,
  NutritionSavedMeal,
  NutritionUnitOption,
} from "@/types/nutrition";
import { RecipeEditorDialog } from "@/components/nutrition/RecipeEditorDialog";
import { ScanFoodDialog, type ScanMode } from "@/components/nutrition/ScanFoodDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const MEAL_LABELS: Record<NutritionMealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

const CUSTOM_BASE_UNIT_OPTIONS = [
  { value: "g", label: "g" },
  { value: "oz", label: "oz" },
  { value: "ml", label: "mL" },
  { value: "cup", label: "cup" },
  { value: "tbsp", label: "tbsp" },
  { value: "tsp", label: "tsp" },
  { value: "piece", label: "piece" },
  { value: "serving", label: "serving" },
];

type AddFoodDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealType: NutritionMealType;
  entryDate: string;
};

type ResultSelectionState = {
  quantity: string;
  unitKey: string;
};

type CustomFoodFormState = {
  name: string;
  brandName: string;
  servingDescription: string;
  baseAmount: string;
  baseUnit: string;
  gramWeight: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  sugar: string;
  sodium: string;
  externalImageUrl: string;
  imageFile: File | null;
};

const EMPTY_CUSTOM_FOOD: CustomFoodFormState = {
  name: "",
  brandName: "",
  servingDescription: "",
  baseAmount: "1",
  baseUnit: "serving",
  gramWeight: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  fiber: "",
  sugar: "",
  sodium: "",
  externalImageUrl: "",
  imageFile: null,
};

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getSelectedUnit(result: NutritionFoodSearchResult, unitKey: string): NutritionUnitOption {
  return (
    result.available_units.find((unit) => unit.key === unitKey) ??
    result.available_units[0]
  );
}

function buildPreviewTotals(unit: NutritionUnitOption, quantity: number) {
  return {
    calories: unit.calories * quantity,
    protein_grams: unit.protein_grams * quantity,
    carbs_grams: unit.carbs_grams * quantity,
    fat_grams: unit.fat_grams * quantity,
    fiber_grams: unit.fiber_grams * quantity,
    sugar_grams: unit.sugar_grams * quantity,
    sodium_mg: unit.sodium_mg * quantity,
    total_grams: unit.grams_per_unit ? unit.grams_per_unit * quantity : null,
  };
}

function buildCustomFoodFormData(form: CustomFoodFormState) {
  const formData = new FormData();

  formData.append("name", form.name.trim());
  formData.append("brand_name", form.brandName.trim());
  formData.append("serving_description", form.servingDescription.trim());
  formData.append("base_amount", String(Math.max(0.01, toNumber(form.baseAmount, 1))));
  formData.append("base_unit", form.baseUnit);

  if (form.gramWeight.trim()) {
    formData.append("gram_weight", String(Math.max(0.01, toNumber(form.gramWeight, 0))));
  }

  const optionalFields = [
    ["calories", form.calories],
    ["protein_grams", form.protein],
    ["carbs_grams", form.carbs],
    ["fat_grams", form.fat],
    ["fiber_grams", form.fiber],
    ["sugar_grams", form.sugar],
    ["sodium_mg", form.sodium],
    ["external_image_url", form.externalImageUrl.trim()],
  ] as const;

  optionalFields.forEach(([key, value]) => {
    formData.append(key, value);
  });

  if (form.imageFile) {
    formData.append("image", form.imageFile);
  }

  return formData;
}

function CardImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-16 w-16 rounded-xl border border-border object-cover"
    />
  );
}

export function AddFoodDialog({
  open,
  onOpenChange,
  mealType,
  entryDate,
}: AddFoodDialogProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customFood, setCustomFood] = useState<CustomFoodFormState>(EMPTY_CUSTOM_FOOD);
  const [resultSelections, setResultSelections] = useState<Record<string, ResultSelectionState>>({});
  const [scanMode, setScanMode] = useState<ScanMode | null>(null);
  // undefined = closed, null = new recipe
  const [editingRecipe, setEditingRecipe] = useState<NutritionRecipe | null | undefined>(undefined);
  const [recipeServings, setRecipeServings] = useState<Record<number, string>>({});

  const deferredQuery = useDeferredValue(query);
  const searchQuery = useNutritionFoodSearch(deferredQuery, open);
  const savedMealsQuery = useNutritionSavedMeals(open);
  const createEntry = useCreateNutritionEntry();
  const createCustomFood = useCreateCustomFood();
  const logSavedMeal = useLogSavedMeal();
  const recipesQuery = useNutritionRecipes(open);
  const logRecipe = useLogRecipe();
  const deleteRecipe = useDeleteRecipe();

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCustomMode(false);
      setCustomFood(EMPTY_CUSTOM_FOOD);
      setResultSelections({});
    }
  }, [open]);

  useEffect(() => {
    const results = searchQuery.data?.results ?? [];
    if (results.length === 0) {
      return;
    }
    setResultSelections((current) => {
      const next = { ...current };
      results.forEach((result) => {
        if (!next[result.id]) {
          next[result.id] = {
            quantity: "1",
            unitKey: result.default_unit_key,
          };
        }
      });
      return next;
    });
  }, [searchQuery.data?.results]);

  const handleAddFood = async (result: NutritionFoodSearchResult) => {
    const selection = resultSelections[result.id] ?? {
      quantity: "1",
      unitKey: result.default_unit_key,
    };
    const selectedUnit = getSelectedUnit(result, selection.unitKey);
    const quantity = Math.max(0.01, toNumber(selection.quantity, 1));

    try {
      await createEntry.mutateAsync({
        entry_date: entryDate,
        meal_type: mealType,
        food_source: result.food_source,
        external_food_id: result.external_food_id,
        food_name: result.food_name,
        brand_name: result.brand_name,
        serving_description: selectedUnit.label,
        measurement_unit: selectedUnit.key,
        quantity,
        grams_per_unit: selectedUnit.grams_per_unit,
        image_url: result.image_url ?? undefined,
        serving_calories: selectedUnit.calories,
        serving_protein_grams: selectedUnit.protein_grams,
        serving_carbs_grams: selectedUnit.carbs_grams,
        serving_fat_grams: selectedUnit.fat_grams,
        serving_fiber_grams: selectedUnit.fiber_grams,
        serving_sugar_grams: selectedUnit.sugar_grams,
        serving_sodium_mg: selectedUnit.sodium_mg,
      });
      toast({
        title: "Food logged",
        description: `${result.food_name} was added to ${MEAL_LABELS[mealType].toLowerCase()}.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not add food",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateCustomFood = async () => {
    try {
      const created = await createCustomFood.mutateAsync(buildCustomFoodFormData(customFood));
      const baseUnitOption =
        created.available_units.find((unit) => unit.key === created.base_unit) ??
        created.available_units[0];
      const quantity = Math.max(0.01, toNumber(customFood.baseAmount, 1));

      await createEntry.mutateAsync({
        entry_date: entryDate,
        meal_type: mealType,
        food_source: "custom",
        external_food_id: String(created.id),
        food_name: created.name,
        brand_name: created.brand_name,
        serving_description: baseUnitOption.label,
        measurement_unit: baseUnitOption.key,
        quantity,
        grams_per_unit: baseUnitOption.grams_per_unit,
        image_url: created.image_url ?? undefined,
        serving_calories: baseUnitOption.calories,
        serving_protein_grams: baseUnitOption.protein_grams,
        serving_carbs_grams: baseUnitOption.carbs_grams,
        serving_fat_grams: baseUnitOption.fat_grams,
        serving_fiber_grams: baseUnitOption.fiber_grams,
        serving_sugar_grams: baseUnitOption.sugar_grams,
        serving_sodium_mg: baseUnitOption.sodium_mg,
      });

      toast({
        title: "Custom food saved",
        description: `${created.name} was saved and logged.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not save custom food",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLogSavedMeal = async (savedMeal: NutritionSavedMeal) => {
    try {
      await logSavedMeal.mutateAsync({
        id: savedMeal.id,
        payload: {
          entry_date: entryDate,
          meal_type: mealType,
        },
      });
      toast({
        title: "Saved meal logged",
        description: `${savedMeal.name} was added to ${MEAL_LABELS[mealType].toLowerCase()}.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not log saved meal",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLogRecipe = async (recipe: NutritionRecipe) => {
    const servings = Math.max(0.01, toNumber(recipeServings[recipe.id] ?? "1", 1));
    try {
      await logRecipe.mutateAsync({ id: recipe.id, entry_date: entryDate, meal_type: mealType, servings });
      toast({
        title: "Recipe logged",
        description: `${recipe.name} was added to ${MEAL_LABELS[mealType].toLowerCase()}.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not log recipe",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRecipe = async (recipe: NutritionRecipe) => {
    if (!window.confirm(`Delete "${recipe.name}"?`)) return;
    try {
      await deleteRecipe.mutateAsync(recipe.id);
    } catch (error) {
      toast({
        title: "Could not delete recipe",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const updateResultSelection = (
    resultId: string,
    updates: Partial<ResultSelectionState>,
  ) => {
    setResultSelections((current) => ({
      ...current,
      [resultId]: {
        ...(current[resultId] ?? { quantity: "1", unitKey: "serving" }),
        ...updates,
      },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add food to {MEAL_LABELS[mealType]}</DialogTitle>
          <DialogDescription>
            Search foods, scan a meal or label, or log one of your recipes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => setScanMode("meal")}>
            <Camera className="h-4 w-4" />
            <span>Meal photo</span>
          </Button>
          <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => setScanMode("label")}>
            <FileText className="h-4 w-4" />
            <span>Nutrition label</span>
          </Button>
          <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => setEditingRecipe(null)}>
            <BookOpen className="h-4 w-4" />
            <span>Create recipe</span>
          </Button>
          <Button
            variant={customMode ? "secondary" : "outline"}
            className="h-auto flex-col gap-1 py-3"
            onClick={() => setCustomMode((value) => !value)}
          >
            <Plus className="h-4 w-4" />
            <span>{customMode ? "Hide custom food" : "Custom food"}</span>
          </Button>
        </div>

        <Input
          placeholder="Search foods"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <p className="text-sm text-muted-foreground">
          {query.trim()
            ? "Select the result you want, then choose quantity and unit."
            : "Your recipes, saved meals, recent foods and custom foods appear here when the search box is empty."}
        </p>

        {customMode && (
          <div className="grid gap-3 rounded-xl border border-border bg-card/60 p-4 md:grid-cols-2">
            <Input
              placeholder="Food name"
              value={customFood.name}
              onChange={(event) =>
                setCustomFood((current) => ({ ...current, name: event.target.value }))
              }
            />
            <Input
              placeholder="Brand name"
              value={customFood.brandName}
              onChange={(event) =>
                setCustomFood((current) => ({ ...current, brandName: event.target.value }))
              }
            />
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Base amount"
              value={customFood.baseAmount}
              onChange={(event) =>
                setCustomFood((current) => ({ ...current, baseAmount: event.target.value }))
              }
            />
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={customFood.baseUnit}
              onChange={(event) =>
                setCustomFood((current) => ({ ...current, baseUnit: event.target.value }))
              }
            >
              {CUSTOM_BASE_UNIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Input
              placeholder="Optional display label"
              value={customFood.servingDescription}
              onChange={(event) =>
                setCustomFood((current) => ({
                  ...current,
                  servingDescription: event.target.value,
                }))
              }
            />
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Optional gram weight for base amount"
              value={customFood.gramWeight}
              onChange={(event) =>
                setCustomFood((current) => ({ ...current, gramWeight: event.target.value }))
              }
            />
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="Calories (optional)"
              value={customFood.calories}
              onChange={(event) =>
                setCustomFood((current) => ({ ...current, calories: event.target.value }))
              }
            />
            <Input
              type="number"
              min="0"
              step="0.1"
              placeholder="Protein (g, optional)"
              value={customFood.protein}
              onChange={(event) =>
                setCustomFood((current) => ({ ...current, protein: event.target.value }))
              }
            />
            <Input
              type="number"
              min="0"
              step="0.1"
              placeholder="Carbs (g, optional)"
              value={customFood.carbs}
              onChange={(event) =>
                setCustomFood((current) => ({ ...current, carbs: event.target.value }))
              }
            />
            <Input
              type="number"
              min="0"
              step="0.1"
              placeholder="Fat (g, optional)"
              value={customFood.fat}
              onChange={(event) =>
                setCustomFood((current) => ({ ...current, fat: event.target.value }))
              }
            />
            <Input
              type="number"
              min="0"
              step="0.1"
              placeholder="Fiber (g, optional)"
              value={customFood.fiber}
              onChange={(event) =>
                setCustomFood((current) => ({ ...current, fiber: event.target.value }))
              }
            />
            <Input
              type="number"
              min="0"
              step="0.1"
              placeholder="Sugar (g, optional)"
              value={customFood.sugar}
              onChange={(event) =>
                setCustomFood((current) => ({ ...current, sugar: event.target.value }))
              }
            />
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="Sodium (mg, optional)"
              value={customFood.sodium}
              onChange={(event) =>
                setCustomFood((current) => ({ ...current, sodium: event.target.value }))
              }
            />
            <Input
              placeholder="Optional image URL"
              value={customFood.externalImageUrl}
              onChange={(event) =>
                setCustomFood((current) => ({
                  ...current,
                  externalImageUrl: event.target.value,
                }))
              }
            />
            <div className="rounded-md border border-input bg-background px-3 py-2">
              <label className="mb-1 block text-sm text-muted-foreground">Upload image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setCustomFood((current) => ({
                    ...current,
                    imageFile: event.target.files?.[0] ?? null,
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-end md:col-span-2">
              <Button
                onClick={handleCreateCustomFood}
                disabled={
                  createCustomFood.isPending ||
                  createEntry.isPending ||
                  customFood.name.trim().length === 0
                }
              >
                {createCustomFood.isPending || createEntry.isPending
                  ? "Saving..."
                  : "Save and log custom food"}
              </Button>
            </div>
          </div>
        )}

        <ScrollArea className="h-[420px] rounded-xl border border-border">
          <div className="space-y-3 p-4">
            {!query.trim() && recipesQuery.data && recipesQuery.data.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">My recipes</p>
                  <p className="text-xs text-muted-foreground">{recipesQuery.data.length} saved</p>
                </div>
                {recipesQuery.data.map((recipe) => (
                  <div key={recipe.id} className="rounded-xl border border-border bg-background/80 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold">{recipe.name}</h3>
                          <Badge variant="secondary">Recipe</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Per serving: {formatNutritionNumber(recipe.per_serving.calories)} kcal • P{" "}
                          {formatNutritionNumber(recipe.per_serving.protein_grams)}g • C{" "}
                          {formatNutritionNumber(recipe.per_serving.carbs_grams)}g • F{" "}
                          {formatNutritionNumber(recipe.per_serving.fat_grams)}g
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {recipe.ingredient_count} ingredient{recipe.ingredient_count === 1 ? "" : "s"} • makes{" "}
                          {formatNutritionNumber(recipe.servings_count)} serving{recipe.servings_count === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          className="w-20"
                          type="number"
                          min="0.25"
                          step="0.25"
                          aria-label={`Servings of ${recipe.name}`}
                          value={recipeServings[recipe.id] ?? "1"}
                          onChange={(event) =>
                            setRecipeServings((current) => ({ ...current, [recipe.id]: event.target.value }))
                          }
                        />
                        <Button onClick={() => handleLogRecipe(recipe)} disabled={logRecipe.isPending}>
                          {logRecipe.isPending ? "Adding..." : "Add"}
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Edit ${recipe.name}`} onClick={() => setEditingRecipe(recipe)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${recipe.name}`}
                          onClick={() => handleDeleteRecipe(recipe)}
                          disabled={deleteRecipe.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!query.trim() && savedMealsQuery.data && savedMealsQuery.data.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Saved meals</p>
                  <p className="text-xs text-muted-foreground">
                    {savedMealsQuery.data.length} saved
                  </p>
                </div>
                {savedMealsQuery.data.map((savedMeal) => (
                  <div
                    key={savedMeal.id}
                    className="rounded-xl border border-border bg-background/80 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold">{savedMeal.name}</h3>
                          <Badge variant="secondary">Saved meal</Badge>
                          {savedMeal.meal_type && (
                            <Badge variant="outline">{MEAL_LABELS[savedMeal.meal_type]}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {savedMeal.item_count} item{savedMeal.item_count === 1 ? "" : "s"} •{" "}
                          {formatNutritionNumber(savedMeal.totals.calories)} kcal • P{" "}
                          {formatNutritionNumber(savedMeal.totals.protein_grams)}g • C{" "}
                          {formatNutritionNumber(savedMeal.totals.carbs_grams)}g • F{" "}
                          {formatNutritionNumber(savedMeal.totals.fat_grams)}g
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {savedMeal.items
                            .slice(0, 3)
                            .map((item) =>
                              formatQuantityWithUnit(item.quantity, item.serving_description),
                            )
                            .join(" • ")}
                          {savedMeal.items.length > 3 ? " • more" : ""}
                        </p>
                      </div>
                      <Button
                        onClick={() => handleLogSavedMeal(savedMeal)}
                        disabled={logSavedMeal.isPending}
                      >
                        {logSavedMeal.isPending ? "Adding..." : "Add meal"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searchQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Loading food results...</p>
            )}

            {!searchQuery.isLoading && searchQuery.data?.results.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No matches yet. Try a different search or create a custom food.
              </div>
            )}

            {searchQuery.data?.results.map((result) => {
              const selection = resultSelections[result.id] ?? {
                quantity: "1",
                unitKey: result.default_unit_key,
              };
              const selectedUnit = getSelectedUnit(result, selection.unitKey);
              const quantity = Math.max(0.01, toNumber(selection.quantity, 1));
              const previewTotals = buildPreviewTotals(selectedUnit, quantity);
              const selectedAmount = formatQuantityWithUnit(quantity, selectedUnit.label);

              return (
                <div
                  key={result.id}
                  className="rounded-xl border border-border bg-background/80 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <CardImage src={result.image_url} alt={result.food_name} />
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold">{result.food_name}</h3>
                          <Badge variant="secondary">{result.label}</Badge>
                          {result.is_favorite && <Badge variant="outline">Favorite</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {[result.brand_name, result.serving_description].filter(Boolean).join(" • ")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Per {selectedUnit.label}: {formatNutritionNumber(selectedUnit.calories)} kcal • P{" "}
                          {formatNutritionNumber(selectedUnit.protein_grams)}g • C{" "}
                          {formatNutritionNumber(selectedUnit.carbs_grams)}g • F{" "}
                          {formatNutritionNumber(selectedUnit.fat_grams)}g
                        </p>
                        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                          <p className="font-medium">
                            Total for {selectedAmount}: {formatNutritionNumber(previewTotals.calories)} kcal
                          </p>
                          <p className="text-muted-foreground">
                            P {formatNutritionNumber(previewTotals.protein_grams)}g • C{" "}
                            {formatNutritionNumber(previewTotals.carbs_grams)}g • F{" "}
                            {formatNutritionNumber(previewTotals.fat_grams)}g
                            {previewTotals.fiber_grams
                              ? ` • Fiber ${formatNutritionNumber(previewTotals.fiber_grams)}g`
                              : ""}
                            {previewTotals.total_grams
                              ? ` • ${formatNutritionNumber(previewTotals.total_grams)}g total`
                              : ""}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[110px_140px_auto] lg:min-w-[360px]">
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={selection.quantity}
                        onChange={(event) =>
                          updateResultSelection(result.id, { quantity: event.target.value })
                        }
                      />
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={selection.unitKey}
                        onChange={(event) =>
                          updateResultSelection(result.id, { unitKey: event.target.value })
                        }
                      >
                        {result.available_units.map((unit) => (
                          <option key={`${result.id}-${unit.key}`} value={unit.key}>
                            {unit.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        onClick={() => handleAddFood(result)}
                        disabled={createEntry.isPending}
                      >
                        {createEntry.isPending ? "Adding..." : "Add food"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <ScanFoodDialog
          mode={scanMode}
          onOpenChange={(isOpen) => !isOpen && setScanMode(null)}
          mealType={mealType}
          entryDate={entryDate}
          onLogged={() => onOpenChange(false)}
        />
        <RecipeEditorDialog
          open={editingRecipe !== undefined}
          onOpenChange={(isOpen) => !isOpen && setEditingRecipe(undefined)}
          recipe={editingRecipe ?? null}
        />
      </DialogContent>
    </Dialog>
  );
}
