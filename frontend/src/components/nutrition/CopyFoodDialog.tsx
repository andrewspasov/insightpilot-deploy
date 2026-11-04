import { useEffect, useState } from "react";

import { DiaryCalendar } from "@/components/nutrition/DiaryCalendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCopyNutritionDay, useCopyNutritionEntries, useCopyNutritionMeal } from "@/hooks/use-nutrition";
import { useToast } from "@/hooks/use-toast";
import { formatIsoDate, MEAL_LABELS, shiftIsoDate } from "@/lib/nutrition";
import type { NutritionMealType } from "@/types/nutrition";

export type CopyScope =
  | { kind: "day" }
  | { kind: "meal"; meal: NutritionMealType }
  | { kind: "entries"; ids: number[] };

type Props = {
  scope: CopyScope | null;
  onOpenChange: (open: boolean) => void;
  // The diary day being viewed.
  currentDate: string;
  // After copying: the day that received the food.
  onCopied: (targetDate: string) => void;
};

/** Copy a day, a meal or chosen foods into this day from another date, or from this day to another. */
export function CopyFoodDialog({ scope, onOpenChange, currentDate, onCopied }: Props) {
  const { toast } = useToast();
  const copyDay = useCopyNutritionDay();
  const copyMeal = useCopyNutritionMeal();
  const copyEntries = useCopyNutritionEntries();
  const [direction, setDirection] = useState<"from" | "to">("from");
  const [otherDate, setOtherDate] = useState(shiftIsoDate(currentDate, -1));
  const [targetMeal, setTargetMeal] = useState<NutritionMealType | "">("");

  useEffect(() => {
    if (!scope) return;
    setDirection(scope.kind === "entries" ? "to" : "from");
    setOtherDate(shiftIsoDate(currentDate, scope.kind === "entries" ? 1 : -1));
    setTargetMeal("");
  }, [scope, currentDate]);

  const what =
    scope?.kind === "meal"
      ? MEAL_LABELS[scope.meal].toLowerCase()
      : scope?.kind === "entries"
        ? `${scope.ids.length} food${scope.ids.length === 1 ? "" : "s"}`
        : "the whole day";
  const [source, target] = direction === "from" ? [otherDate, currentDate] : [currentDate, otherDate];
  const pending = copyDay.isPending || copyMeal.isPending || copyEntries.isPending;

  const handleCopy = async () => {
    if (!scope) return;
    try {
      const entries =
        scope.kind === "day"
          ? await copyDay.mutateAsync({ source_date: source, target_date: target })
          : scope.kind === "meal"
            ? await copyMeal.mutateAsync({
                source_date: source,
                target_date: target,
                source_meal_type: scope.meal,
                target_meal_type: scope.meal,
              })
            : await copyEntries.mutateAsync({
                entry_ids: scope.ids,
                target_date: target,
                target_meal_type: targetMeal || undefined,
              });
      toast({
        title: "Copied",
        description: `${entries.length} entr${entries.length === 1 ? "y" : "ies"} added to ${formatIsoDate(target)}.`,
      });
      onCopied(target);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not copy",
        description: error instanceof Error ? error.message : "Nothing to copy on that day.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={!!scope} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Copy {what}</DialogTitle>
          <DialogDescription>
            {direction === "from"
              ? `Pick the date to copy ${what} from; it is added to ${formatIsoDate(currentDate)}.`
              : `Pick the date to copy ${what} to.`}
          </DialogDescription>
        </DialogHeader>

        {scope?.kind !== "entries" && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant={direction === "from" ? "default" : "outline"} onClick={() => setDirection("from")}>
              Into this day
            </Button>
            <Button variant={direction === "to" ? "default" : "outline"} onClick={() => setDirection("to")}>
              To another day
            </Button>
          </div>
        )}

        <div className="flex justify-center rounded-xl border border-border">
          <DiaryCalendar selected={otherDate} onSelect={setOtherDate} disabledDate={currentDate} />
        </div>

        {scope?.kind === "entries" && (
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Into which meal?</span>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={targetMeal}
              onChange={(event) => setTargetMeal(event.target.value as NutritionMealType | "")}
            >
              <option value="">Keep their meals</option>
              {(Object.keys(MEAL_LABELS) as NutritionMealType[]).map((meal) => (
                <option key={meal} value={meal}>
                  {MEAL_LABELS[meal]}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCopy} disabled={pending || otherDate === currentDate}>
            {pending ? "Copying…" : `Copy ${direction === "from" ? `from ${formatIsoDate(otherDate)}` : `to ${formatIsoDate(otherDate)}`}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
