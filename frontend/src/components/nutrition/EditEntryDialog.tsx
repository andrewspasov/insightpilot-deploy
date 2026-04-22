import { useEffect, useState } from "react";

import { useDeleteNutritionEntry, useUpdateNutritionEntry } from "@/hooks/use-nutrition";
import { useToast } from "@/hooks/use-toast";
import { formatQuantityWithUnit } from "@/lib/nutrition";
import type { NutritionEntry, NutritionMealType } from "@/types/nutrition";
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

export function EditEntryDialog({ entry, open, onOpenChange }: EditEntryDialogProps) {
  const { toast } = useToast();
  const updateEntry = useUpdateNutritionEntry();
  const deleteEntry = useDeleteNutritionEntry();

  const [quantity, setQuantity] = useState("1");
  const [mealType, setMealType] = useState<NutritionMealType>("breakfast");

  useEffect(() => {
    if (!entry) {
      return;
    }
    setQuantity(String(entry.quantity));
    setMealType(entry.meal_type);
  }, [entry]);

  if (!entry) {
    return null;
  }

  const handleSave = async () => {
    try {
      await updateEntry.mutateAsync({
        id: entry.id,
        payload: {
          quantity: Math.max(0.01, toNumber(quantity)),
          meal_type: mealType,
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
            Adjust quantity or move this food to a different meal.
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
              value={mealType}
              onChange={(event) => setMealType(event.target.value as NutritionMealType)}
            >
              {MEAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteEntry.isPending}
            >
              {deleteEntry.isPending ? "Deleting..." : "Delete"}
            </Button>
            <Button onClick={handleSave} disabled={updateEntry.isPending}>
              {updateEntry.isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
