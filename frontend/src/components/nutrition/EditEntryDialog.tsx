import { useEffect, useState } from "react";

import { useDeleteNutritionEntry, useUpdateNutritionEntry } from "@/hooks/use-nutrition";
import { useToast } from "@/hooks/use-toast";
import { formatNutritionNumber, formatQuantityWithUnit } from "@/lib/nutrition";
import type { NutritionEntry, NutritionMealType, NutritionUnitOption } from "@/types/nutrition";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const MEAL_OPTIONS: Array<{ value: NutritionMealType; label: string }> = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snacks", label: "Snacks" },
];

type EditEntryDialogProps = {
  entry: NutritionEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 1;
}

function buildFallbackUnit(entry: NutritionEntry): NutritionUnitOption {
  return {
    key: entry.measurement_unit || "serving",
    label: entry.serving_description || entry.measurement_unit || "serving",
    grams_per_unit: entry.grams_per_unit,
    calories: entry.serving_calories,
    protein_grams: entry.serving_protein_grams,
    carbs_grams: entry.serving_carbs_grams,
    fat_grams: entry.serving_fat_grams,
    fiber_grams: entry.serving_fiber_grams,
    sugar_grams: entry.serving_sugar_grams,
    sodium_mg: entry.serving_sodium_mg,
  };
}

function getSelectedUnit(entry: NutritionEntry, unitKey: string): NutritionUnitOption {
  const units = entry.available_units?.length ? entry.available_units : [buildFallbackUnit(entry)];
  return units.find((unit) => unit.key === unitKey) ?? units[0];
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

export function EditEntryDialog({ entry, open, onOpenChange }: EditEntryDialogProps) {
  const { toast } = useToast();
  const updateEntry = useUpdateNutritionEntry();
  const deleteEntry = useDeleteNutritionEntry();

  const [quantity, setQuantity] = useState("1");
  const [unitKey, setUnitKey] = useState("serving");
  const [mealType, setMealType] = useState<NutritionMealType>("breakfast");
  const [entryDate, setEntryDate] = useState("");

  useEffect(() => {
    if (!entry) {
      return;
    }
    setQuantity(String(entry.quantity));
    setUnitKey(entry.measurement_unit || entry.default_unit_key || "serving");
    setMealType(entry.meal_type);
    setEntryDate(entry.entry_date);
  }, [entry]);

  if (!entry) {
    return null;
  }

  const selectedUnit = getSelectedUnit(entry, unitKey);
  const parsedQuantity = Math.max(0.01, toNumber(quantity));
  const previewTotals = buildPreviewTotals(selectedUnit, parsedQuantity);

  const handleSave = async () => {
    try {
      await updateEntry.mutateAsync({
        id: entry.id,
        payload: {
          quantity: parsedQuantity,
          meal_type: mealType,
          entry_date: entryDate,
          serving_description: selectedUnit.label,
          measurement_unit: selectedUnit.key,
          grams_per_unit: selectedUnit.grams_per_unit,
          serving_calories: selectedUnit.calories,
          serving_protein_grams: selectedUnit.protein_grams,
          serving_carbs_grams: selectedUnit.carbs_grams,
          serving_fat_grams: selectedUnit.fat_grams,
          serving_fiber_grams: selectedUnit.fiber_grams,
          serving_sugar_grams: selectedUnit.sugar_grams,
          serving_sodium_mg: selectedUnit.sodium_mg,
        },
      });
      toast({
        title: "Entry updated",
        description: `${entry.food_name} was updated.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not update entry",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteEntry.mutateAsync(entry.id);
      toast({
        title: "Entry removed",
        description: `${entry.food_name} was deleted from your diary.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not delete entry",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit diary entry</DialogTitle>
          <DialogDescription>
            Adjust quantity, date, or move this food to a different meal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="font-semibold">{entry.food_name}</p>
            <p className="text-sm text-muted-foreground">
              {[entry.brand_name, entry.serving_description].filter(Boolean).join(" • ")}
            </p>
            <p className="text-xs text-muted-foreground">
              Current amount: {formatQuantityWithUnit(entry.quantity, entry.serving_description)}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={unitKey}
              onChange={(event) => setUnitKey(event.target.value)}
            >
              {(entry.available_units?.length ? entry.available_units : [buildFallbackUnit(entry)]).map((unit) => (
                <option key={`${entry.id}-${unit.key}`} value={unit.key}>
                  {unit.label}
                </option>
              ))}
            </select>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={mealType}
              onChange={(event) => setMealType(event.target.value as NutritionMealType)}
            >
              {MEAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={entryDate}
              onChange={(event) => setEntryDate(event.target.value)}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
            <p className="font-medium">
              Total for {formatQuantityWithUnit(parsedQuantity, selectedUnit.label)}:{" "}
              {formatNutritionNumber(previewTotals.calories)} kcal
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

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteEntry.isPending}
            >
              {deleteEntry.isPending ? "Deleting..." : "Delete"}
            </Button>
            <Button onClick={handleSave} disabled={updateEntry.isPending || !entryDate}>
              {updateEntry.isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
