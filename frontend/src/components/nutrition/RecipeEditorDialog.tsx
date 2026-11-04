import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNutritionFoodSearch, useSaveRecipe } from "@/hooks/use-nutrition";
import { useToast } from "@/hooks/use-toast";
import { formatNutritionNumber } from "@/lib/nutrition";
import type { NutritionFoodSearchResult, NutritionRecipe, RecipeIngredientPayload } from "@/types/nutrition";

type DraftIngredient = RecipeIngredientPayload & { key: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // null creates a new recipe.
  recipe: NutritionRecipe | null;
};

function toIngredient(result: NutritionFoodSearchResult, unitKey: string, quantity: number): RecipeIngredientPayload {
  const unit = result.available_units.find((u) => u.key === unitKey) ?? result.available_units[0];
  return {
    food_source: result.food_source,
    external_food_id: result.external_food_id,
    food_name: result.food_name,
    brand_name: result.brand_name,
    serving_description: unit.label,
    measurement_unit: unit.key,
    quantity,
    grams_per_unit: unit.grams_per_unit,
    image_url: result.image_url ?? "",
    serving_calories: unit.calories,
    serving_protein_grams: unit.protein_grams,
    serving_carbs_grams: unit.carbs_grams,
    serving_fat_grams: unit.fat_grams,
    serving_fiber_grams: unit.fiber_grams,
    serving_sugar_grams: unit.sugar_grams,
    serving_sodium_mg: unit.sodium_mg,
  };
}

export function RecipeEditorDialog({ open, onOpenChange, recipe }: Props) {
  const { toast } = useToast();
  const saveRecipe = useSaveRecipe();
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<NutritionFoodSearchResult | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [unitKey, setUnitKey] = useState("");
  const deferredQuery = useDeferredValue(query);
  const search = useNutritionFoodSearch(deferredQuery, open && deferredQuery.trim().length > 0);

  useEffect(() => {
    if (!open) return;
    setName(recipe?.name ?? "");
    setServings(String(recipe?.servings_count ?? 1));
    setIngredients((recipe?.ingredients ?? []).map((ing) => ({ ...ing, key: `existing-${ing.id}` })));
    setQuery("");
    setPicked(null);
  }, [open, recipe]);

  const servingsCount = Math.max(Number(servings) || 1, 0.01);
  const totals = useMemo(
    () =>
      ingredients.reduce(
        (acc, ing) => ({
          calories: acc.calories + ing.serving_calories * ing.quantity,
          protein: acc.protein + ing.serving_protein_grams * ing.quantity,
          carbs: acc.carbs + ing.serving_carbs_grams * ing.quantity,
          fat: acc.fat + ing.serving_fat_grams * ing.quantity,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [ingredients],
  );

  const addPicked = () => {
    const amount = Number(quantity);
    if (!picked || !(amount > 0)) return;
    setIngredients((current) => [
      ...current,
      { ...toIngredient(picked, unitKey, amount), key: `new-${Date.now()}-${current.length}` },
    ]);
    setPicked(null);
    setQuery("");
  };

  const handleSave = async () => {
    try {
      await saveRecipe.mutateAsync({
        id: recipe?.id,
        payload: {
          name: name.trim(),
          servings_count: servingsCount,
          ingredients: ingredients.map(({ key: _key, ...ing }) => ing),
        },
      });
      toast({ title: recipe ? "Recipe updated" : "Recipe saved", description: name.trim() });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not save recipe",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{recipe ? "Edit recipe" : "New recipe"}</DialogTitle>
          <DialogDescription>Add ingredients; the recipe is logged per serving.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <Input placeholder="Recipe name, e.g. Chicken burrito bowl" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            type="number"
            min="0.5"
            step="0.5"
            aria-label="Servings this recipe makes"
            placeholder="Servings"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Ingredients</p>
          {ingredients.length === 0 && <p className="text-sm text-muted-foreground">No ingredients yet.</p>}
          {ingredients.map((ing) => (
            <div key={ing.key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{ing.food_name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {formatNutritionNumber(ing.quantity)} × {ing.serving_description} ·{" "}
                  {formatNutritionNumber(ing.serving_calories * ing.quantity)} kcal
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${ing.food_name}`}
                onClick={() => setIngredients((current) => current.filter((i) => i.key !== ing.key))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-xl border border-border p-3">
          {picked ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_100px_140px_auto] sm:items-center">
              <span className="text-sm font-medium">{picked.food_name}</span>
              <Input type="number" min="0.01" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={unitKey}
                onChange={(e) => setUnitKey(e.target.value)}
              >
                {picked.available_units.map((unit) => (
                  <option key={unit.key} value={unit.key}>
                    {unit.label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button onClick={addPicked}>Add</Button>
                <Button variant="ghost" onClick={() => setPicked(null)}>
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Input placeholder="Search an ingredient to add" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query.trim() && (
                <ScrollArea className="h-48">
                  <div className="space-y-1 pr-3">
                    {search.isLoading && <p className="text-sm text-muted-foreground">Searching…</p>}
                    {search.data?.results.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setPicked(result);
                          setQuantity("1");
                          setUnitKey(result.default_unit_key);
                        }}
                      >
                        <span className="font-medium">{result.food_name}</span>
                        <span className="text-muted-foreground">
                          {result.brand_name ? ` · ${result.brand_name}` : ""} · {result.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </>
          )}
        </div>

        {ingredients.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
            <p className="font-medium">
              Per serving ({formatNutritionNumber(servingsCount)} total): {formatNutritionNumber(totals.calories / servingsCount)} kcal
            </p>
            <p className="text-muted-foreground">
              P {formatNutritionNumber(totals.protein / servingsCount)}g • C {formatNutritionNumber(totals.carbs / servingsCount)}g • F{" "}
              {formatNutritionNumber(totals.fat / servingsCount)}g
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saveRecipe.isPending || !name.trim() || ingredients.length === 0}>
            {saveRecipe.isPending ? "Saving…" : "Save recipe"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
