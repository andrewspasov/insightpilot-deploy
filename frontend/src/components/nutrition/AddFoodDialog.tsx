import { useDeferredValue, useEffect, useState } from "react";

import { useCreateCustomFood, useCreateNutritionEntry, useNutritionFoodSearch } from "@/hooks/use-nutrition";
import { useToast } from "@/hooks/use-toast";
import { formatNutritionNumber } from "@/lib/nutrition";
import type {
  NutritionFoodSearchResult,
  NutritionMealType,
  NutritionUnitOption,
} from "@/types/nutrition";
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

  const deferredQuery = useDeferredValue(query);
  const searchQuery = useNutritionFoodSearch(deferredQuery, open);
  const createEntry = useCreateNutritionEntry();
  const createCustomFood = useCreateCustomFood();

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
            Search USDA and your saved foods, pick a quantity and unit, or create a custom item.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search foods"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {query.trim()
              ? "Select the result you want, then choose quantity and unit."
              : "Recent foods and saved custom foods appear here when the search box is empty."}
          </p>
          <Button
            variant={customMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => setCustomMode((value) => !value)}
          >
            {customMode ? "Hide custom form" : "Create custom food"}
          </Button>
        </div>

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
      </DialogContent>
    </Dialog>
  );
}
