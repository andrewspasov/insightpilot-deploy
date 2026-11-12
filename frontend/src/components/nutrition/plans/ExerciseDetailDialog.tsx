import { Minus, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLibraryExercise, type PlanExercisePatch } from "@/hooks/use-plans";
import { setsLabel, titleCase } from "@/lib/plan-format";
import type { PlanExercise } from "@/types/plans";

import { ExerciseImage } from "./ExerciseImage";
import { confirmDialog } from "@/lib/dialogs";

type Props = {
  planExercise: PlanExercise | null;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
  busy?: boolean;
  onUpdate?: (patch: PlanExercisePatch) => void;
  onSwap?: () => void;
  onRemove?: () => void;
};

export function ExerciseDetailDialog({ planExercise, onOpenChange, readOnly, busy, onUpdate, onSwap, onRemove }: Props) {
  const details = useLibraryExercise(planExercise?.exercise?.id);
  const ex = planExercise;

  return (
    <Dialog open={!!ex} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        {ex && (
          <>
            <DialogHeader>
              <DialogTitle>{ex.name}</DialogTitle>
            </DialogHeader>
            <ExerciseImage
              imageUrls={ex.exercise?.image_urls ?? []}
              alt={ex.name}
              animate
              className="mx-auto h-72 w-72 max-w-full shrink-0"
            />

            {!readOnly && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target</span>
                  <span className="font-semibold text-primary">{setsLabel(ex)}</span>
                </div>
                {ex.kind === "cardio" ? (
                  <Stepper label="Minutes" value={ex.duration_min ?? 30} step={5} min={5} disabled={busy}
                    onChange={(v) => onUpdate?.({ duration_min: v })} />
                ) : (
                  <>
                    <Stepper label="Sets" value={ex.sets} min={1} disabled={busy} onChange={(v) => onUpdate?.({ sets: v })} />
                    <Stepper label="Min reps" value={ex.rep_min} min={1} disabled={busy}
                      onChange={(v) => onUpdate?.({ rep_min: v, rep_max: Math.max(v, ex.rep_max) })} />
                    <Stepper label="Max reps" value={ex.rep_max} min={ex.rep_min} disabled={busy}
                      onChange={(v) => onUpdate?.({ rep_max: v })} />
                  </>
                )}
              </div>
            )}

            {ex.exercise && (
              <div className="text-sm">
                <p>
                  <span className="text-muted-foreground">Muscles: </span>
                  {ex.exercise.primary_muscles.map(titleCase).join(", ")}
                  {details.data?.secondary_muscles.length
                    ? ` (also ${details.data.secondary_muscles.map(titleCase).join(", ")})`
                    : ""}
                </p>
                {ex.exercise.equipment && (
                  <p>
                    <span className="text-muted-foreground">Equipment: </span>
                    {titleCase(ex.exercise.equipment)}
                  </p>
                )}
              </div>
            )}

            {details.data?.instructions.length ? (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {details.data.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            ) : null}

            {!readOnly && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={onSwap} disabled={busy}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Swap exercise
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    if (await confirmDialog({ title: `Remove "${ex.name}" from this day?`, confirmLabel: "Remove", destructive: true })) onRemove?.();
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Remove
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ label, value, step = 1, min = 0, disabled, onChange }: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-3">
        <Button size="icon" variant="outline" className="h-8 w-8" disabled={disabled || value - step < min}
          onClick={() => onChange(value - step)} aria-label={`Decrease ${label}`}>
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-8 text-center font-semibold tabular-nums">{value}</span>
        <Button size="icon" variant="outline" className="h-8 w-8" disabled={disabled}
          onClick={() => onChange(value + step)} aria-label={`Increase ${label}`}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
