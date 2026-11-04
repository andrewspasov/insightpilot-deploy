import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown, ChevronUp, Sparkles, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUnits } from "@/hooks/use-units";
import {
  GOAL_LABELS,
  PACE_LABELS,
  WEEKDAYS,
  formatShortDate,
  formatWeeks,
  formatWeight,
  setsLabel,
} from "@/lib/plan-format";
import { cn } from "@/lib/utils";
import type { InsightAIAction } from "@/types/insight-ai";
import type { PlanPace, PlanPaceOption } from "@/types/plans";

import { ExerciseImage } from "./ExerciseImage";

// Payload shapes the backend prepares for plan cards (insight_ai/actions.py).
type ProposedExercise = {
  name: string;
  kind: "strength" | "cardio";
  sets: number;
  rep_min: number;
  rep_max: number;
  duration_min: number | null;
  exercise_id: number | null;
  image_urls: string[];
};
type ProposedDay = { weekday: number; title: string; exercises: ProposedExercise[] };
type CreatePlanPayload = {
  inputs: { goal_type: "gain" | "lose" | "maintain"; weight_kg: number; target_weight_kg: number };
  explanation: string;
  workout_days: ProposedDay[];
  preview: { maintenance_calories: number; training_calories_per_day: number; options: PlanPaceOption[] };
};
type UpdateProgramPayload = {
  workout_days: ProposedDay[];
  current_calorie_target: number;
  new_calorie_target: number | null;
};

type ConfirmFn = (actionId: number, options?: { pace?: PlanPace }) => Promise<InsightAIAction | null>;

export function PlanProposalCard({ action, disabled, onConfirm, onCancel }: {
  action: InsightAIAction;
  disabled: boolean;
  onConfirm: ConfirmFn;
  onCancel: (actionId: number) => void;
}) {
  const navigate = useNavigate();
  const { units } = useUnits();
  const payload = action.payload as unknown as CreatePlanPayload;
  const options = payload.preview.options;
  const [pace, setPace] = useState<PlanPace>(options.some((o) => o.pace === "middle") ? "middle" : options[0].pace);
  const goal = payload.inputs.goal_type;

  // The plan comes with built-in example meals; "Ideas from AI" on the Plan page adds AI ones.
  const confirm = () => onConfirm(action.id, { pace });

  return (
    <CardShell title={`${GOAL_LABELS[goal]} plan`}>
      <p className="text-lg font-semibold">
        {formatWeight(payload.inputs.weight_kg, units)}
        {goal !== "maintain" ? ` → ${formatWeight(payload.inputs.target_weight_kg, units)}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        Maintenance about {payload.preview.maintenance_calories} kcal/day, including {payload.preview.training_calories_per_day} kcal
        of training (weekly average).
      </p>
      <div className="mt-3 space-y-2">
        {options.map((o) => {
          const selected = o.pace === pace;
          return (
            <button key={o.pace} type="button" disabled={action.status !== "pending"} onClick={() => setPace(o.pace)}
              className={cn("w-full rounded-xl border p-3 text-left text-sm", selected ? "border-primary bg-primary/5" : "hover:bg-muted")}>
              <div className="flex justify-between font-semibold">
                <span className={cn(selected && "text-primary")}>{goal === "maintain" ? "Maintain" : PACE_LABELS[o.pace]}</span>
                <span>{o.daily_calorie_target} kcal</span>
              </div>
              <p className="text-xs text-muted-foreground">
                P {o.protein_grams}g · C {o.carbs_grams}g · F {o.fat_grams}g
                {o.weekly_change_kg
                  ? ` · ${formatWeight(o.weekly_change_kg, units, true)}/wk · ${formatWeeks(o.estimated_weeks)} (${formatShortDate(o.projected_end_date)})`
                  : ""}
              </p>
              {selected && o.note && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{o.note}</p>}
            </button>
          );
        })}
      </div>
      {payload.explanation && <p className="mt-3 text-sm">{payload.explanation}</p>}
      <ProgramPreview days={payload.workout_days} />

      {action.status === "pending" ? (
        <Buttons disabled={disabled} confirmLabel="Create plan" onConfirm={confirm} onCancel={() => onCancel(action.id)} />
      ) : action.status === "confirmed" ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium text-emerald-600">
            Plan created at {PACE_LABELS[(action.result_payload.pace as PlanPace) ?? "middle"]} pace ·{" "}
            {String(action.result_payload.daily_calorie_target)} kcal/day
          </p>
          <p className="text-xs text-muted-foreground">Your program and example meals are ready on the Plan page.</p>
          <Button size="sm" onClick={() => navigate("/tools/nutrition/plan")}>Open my plan</Button>
        </div>
      ) : (
        <Status action={action} />
      )}
    </CardShell>
  );
}

export function ProgramUpdateCard({ action, disabled, onConfirm, onCancel }: {
  action: InsightAIAction;
  disabled: boolean;
  onConfirm: ConfirmFn;
  onCancel: (actionId: number) => void;
}) {
  const navigate = useNavigate();
  const payload = action.payload as unknown as UpdateProgramPayload;
  const calorieChange = payload.new_calorie_target !== null && payload.new_calorie_target !== payload.current_calorie_target;
  return (
    <CardShell title="Update program">
      <p className="text-sm">{action.summary}</p>
      {calorieChange && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Your training week changes, so your daily target goes from {payload.current_calorie_target} to{" "}
          {payload.new_calorie_target} kcal.
        </p>
      )}
      <ProgramPreview days={payload.workout_days} />
      {action.status === "pending" ? (
        <Buttons disabled={disabled} confirmLabel="Update program" onConfirm={() => onConfirm(action.id)} onCancel={() => onCancel(action.id)} />
      ) : action.status === "confirmed" ? (
        <Button size="sm" className="mt-3" onClick={() => navigate("/tools/nutrition/plan")}>Program updated · open plan</Button>
      ) : (
        <Status action={action} />
      )}
    </CardShell>
  );
}

function CardShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3 rounded-2xl border border-primary/40 bg-background p-4 text-left shadow-sm">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
        <Sparkles className="h-3.5 w-3.5" /> {title}
      </p>
      {children}
    </div>
  );
}

function Buttons({ disabled, confirmLabel, onConfirm, onCancel }: {
  disabled: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" disabled={disabled} onClick={onConfirm}>
        <CheckCircle2 className="mr-2 h-4 w-4" /> {confirmLabel}
      </Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={onCancel}>
        <XCircle className="mr-2 h-4 w-4" /> Cancel
      </Button>
    </div>
  );
}

function Status({ action }: { action: InsightAIAction }) {
  return (
    <p className={cn("mt-3 text-xs font-medium", action.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
      {action.status === "failed" ? action.error_message || "Failed." : `Action ${action.status}.`}
    </p>
  );
}

function ProgramPreview({ days }: { days: ProposedDay[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="mt-3 divide-y rounded-xl border">
      {days.map((day) => (
        <div key={day.weekday}>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
            onClick={() => setOpen(open === day.weekday ? null : day.weekday)}>
            <span className="font-semibold text-primary">{WEEKDAYS[day.weekday].slice(0, 3)}</span>
            <span className="flex-1 truncate">{day.title}</span>
            <span className="text-xs text-muted-foreground">{day.exercises.length}</span>
            {open === day.weekday ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {open === day.weekday && (
            <div className="space-y-1 px-3 pb-3">
              {day.exercises.map((ex, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <ExerciseImage imageUrls={ex.image_urls} alt={ex.name} className="h-8 w-8 shrink-0" />
                  <span className="flex-1 truncate">{ex.name}</span>
                  <span className="font-medium text-primary">{setsLabel(ex)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
