import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock, Info, Minus, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ExerciseDetailDialog } from "@/components/nutrition/plans/ExerciseDetailDialog";
import { ExerciseImage } from "@/components/nutrition/plans/ExerciseImage";
import {
  completeWorkout,
  deleteWorkout,
  getLastPerformance,
  getWorkout,
  getWorkouts,
  saveWorkoutSets,
  startWorkout,
  useActivePlan,
  useUpdatePlanExercise,
} from "@/hooks/use-plans";
import { useToast } from "@/hooks/use-toast";
import { useUnits } from "@/hooks/use-units";
import { getTodayIsoDate } from "@/lib/nutrition";
import {
  displayToKg,
  displayToKm,
  distanceUnit,
  kgToDisplay,
  kmToDisplay,
  setsLabel,
  weightStep,
  weightUnit,
} from "@/lib/plan-format";
import { cn } from "@/lib/utils";
import type {
  LastPerformance,
  PlanExercise,
  PlanWorkoutDay,
  UnitsPreference,
  WorkoutSession,
  WorkoutSet,
} from "@/types/plans";
import { confirmDialog } from "@/lib/dialogs";

type SetRow = { weight: string; reps: string; minutes: string; distance: string; done: boolean };
type ExerciseBlock = { slot: PlanExercise; rows: SetRow[]; last: LastPerformance | null };

const SAVE_DELAY_MS = 800;

const num = (text: string) => {
  const value = parseFloat(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
};
const trim = (value: number) => String(Math.round(value * 100) / 100);

function formatClock(totalSeconds: number) {
  const s = Math.max(Math.round(totalSeconds), 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function emptyRows(slot: PlanExercise, last: LastPerformance | null, units: UnitsPreference): SetRow[] {
  if (slot.kind === "cardio") {
    const prev = last?.sets[0];
    return [{
      weight: "",
      reps: "",
      minutes: String(prev?.duration_min ?? slot.duration_min ?? 30),
      distance: prev?.distance_km ? trim(kmToDisplay(prev.distance_km, units)) : "",
      done: false,
    }];
  }
  // Start from last time's numbers so logging is mostly ticking boxes.
  return Array.from({ length: slot.sets }, (_, i) => {
    const prev = last?.sets[i] ?? last?.sets[last.sets.length - 1];
    return {
      weight: prev?.weight_kg != null ? trim(kgToDisplay(prev.weight_kg, units)) : "",
      reps: String(prev?.reps ?? slot.rep_max),
      minutes: "",
      distance: "",
      done: false,
    };
  });
}

function rowsFromSession(slot: PlanExercise, sets: WorkoutSet[], units: UnitsPreference): SetRow[] {
  return sets
    .filter((s) => s.plan_exercise === slot.id)
    .sort((a, b) => a.set_number - b.set_number)
    .map((s) => ({
      weight: s.weight_kg != null ? trim(kgToDisplay(s.weight_kg, units)) : "",
      reps: s.reps != null ? String(s.reps) : "",
      minutes: s.duration_min != null ? trim(s.duration_min) : "",
      distance: s.distance_km != null ? trim(kmToDisplay(s.distance_km, units)) : "",
      done: s.completed,
    }));
}

function lastLabel(block: ExerciseBlock, units: UnitsPreference): string | null {
  const sets = block.last?.sets ?? [];
  if (!sets.length) return null;
  if (block.slot.kind === "cardio") {
    const s = sets[0];
    const dist = s.distance_km ? ` · ${trim(kmToDisplay(s.distance_km, units))} ${distanceUnit(units)}` : "";
    return `Last time: ${s.duration_min ?? "?"} min${dist}`;
  }
  return (
    "Last time: " +
    sets.map((s) => (s.weight_kg != null ? `${trim(kgToDisplay(s.weight_kg, units))}×${s.reps ?? "?"}` : `${s.reps ?? "?"} reps`)).join(", ") +
    (sets[0]?.weight_kg != null ? ` ${weightUnit(units)}` : "")
  );
}

export default function NutritionWorkout() {
  const { dayId } = useParams();
  const planDayId = Number(dayId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { units } = useUnits();
  const planQuery = useActivePlan();
  const updateExercise = useUpdatePlanExercise();

  const [day, setDay] = useState<PlanWorkoutDay | null>(null);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [detail, setDetail] = useState<PlanExercise | null>(null);
  const started = useRef(false);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resume today's unfinished session for this day, or start one.
  useEffect(() => {
    const plan = planQuery.data;
    if (started.current || planQuery.isLoading) return;
    started.current = true;
    (async () => {
      try {
        const planDay = plan?.workout_days.find((d) => d.id === planDayId);
        if (!planDay) throw new Error("This workout is no longer in your plan.");
        setDay(planDay);
        const today = getTodayIsoDate();
        const todays = await getWorkouts(today);
        const open = todays.find((w) => w.plan_day === planDayId && !w.completed_at);
        const current = open ? await getWorkout(open.id) : await startWorkout(planDayId, today);
        setSession(current);
        const lasts = await Promise.all(
          planDay.exercises.map((slot) => getLastPerformance(slot.id, current.id).catch(() => null)),
        );
        setBlocks(
          planDay.exercises.map((slot, i) => {
            const resumed = rowsFromSession(slot, current.sets, units);
            return { slot, last: lasts[i], rows: resumed.length ? resumed : emptyRows(slot, lasts[i], units) };
          }),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the workout.");
      }
    })();
  }, [planQuery.data, planQuery.isLoading, planDayId, units]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const restLeft = restEndsAt ? Math.ceil((restEndsAt - now) / 1000) : null;
  useEffect(() => {
    if (restLeft !== null && restLeft <= 0) {
      setRestEndsAt(null);
      navigator.vibrate?.([400, 200, 400]);
      toast({ title: "Rest over", description: "Time for your next set." });
    }
  }, [restLeft, toast]);

  const toPayload = useCallback(
    (onlyDone: boolean): WorkoutSet[] =>
      blocks.flatMap((block, order) =>
        block.rows
          .map((row, i) => ({ row, i }))
          .filter(({ row }) => !onlyDone || row.done)
          .map(({ row, i }) => {
            const cardio = block.slot.kind === "cardio";
            const weight = num(row.weight);
            const distance = num(row.distance);
            const reps = num(row.reps);
            return {
              plan_exercise: block.slot.id,
              exercise: block.slot.exercise?.id ?? null,
              exercise_name: block.slot.name,
              exercise_order: order,
              set_number: i + 1,
              reps: cardio || reps === null ? null : Math.round(reps),
              weight_kg: cardio || weight === null ? null : Math.round(displayToKg(weight, units) * 100) / 100,
              duration_min: cardio ? num(row.minutes) : null,
              distance_km: cardio && distance !== null ? Math.round(displayToKm(distance, units) * 1000) / 1000 : null,
              completed: row.done,
            };
          }),
      ),
    [blocks, units],
  );

  // Autosave so nothing is lost if the tab closes mid-workout.
  useEffect(() => {
    if (!session || !dirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveWorkoutSets(session.id, toPayload(false)).catch(() => {});
    }, SAVE_DELAY_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [blocks, session, toPayload]);

  const updateRow = (bi: number, ri: number, patch: Partial<SetRow>) => {
    dirty.current = true;
    setBlocks((prev) =>
      prev.map((b, i) => (i !== bi ? b : { ...b, rows: b.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)) })),
    );
  };

  const toggleDone = (bi: number, ri: number) => {
    const block = blocks[bi];
    const row = block.rows[ri];
    updateRow(bi, ri, { done: !row.done });
    if (!row.done && block.slot.kind === "strength") setRestEndsAt(Date.now() + block.slot.rest_seconds * 1000);
  };

  const addSet = (bi: number) => {
    dirty.current = true;
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== bi) return b;
        const lastRow = b.rows[b.rows.length - 1] ?? emptyRows(b.slot, null, units)[0];
        return { ...b, rows: [...b.rows, { ...lastRow, done: false }] };
      }),
    );
  };

  const removeSet = (bi: number) => {
    dirty.current = true;
    setBlocks((prev) => prev.map((b, i) => (i === bi ? { ...b, rows: b.rows.slice(0, -1) } : b)));
  };

  const changeRest = (bi: number, delta: number) => {
    const slot = blocks[bi].slot;
    const rest = Math.max(slot.rest_seconds + delta, 15);
    setBlocks((prev) => prev.map((b, i) => (i === bi ? { ...b, slot: { ...b.slot, rest_seconds: rest } } : b)));
    // Saved on the plan so the next session uses it too.
    updateExercise.mutate({ id: slot.id, patch: { rest_seconds: rest } });
  };

  const finish = async () => {
    if (!session) return;
    const done = toPayload(true);
    if (!done.length) {
      toast({ title: "Nothing logged yet", description: "Tick off at least one set before finishing." });
      return;
    }
    const unfinished = toPayload(false).length - done.length;
    if (
      unfinished &&
      !(await confirmDialog({
        title: "Finish anyway?",
        description: `${unfinished} set(s) aren't ticked off and won't be saved.`,
        confirmLabel: "Finish workout",
      }))
    )
      return;
    setFinishing(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saveWorkoutSets(session.id, done);
      const minutes = Math.max(Math.round((Date.now() - Date.parse(session.started_at)) / 60000), 1);
      const result = await completeWorkout(session.id, minutes);
      await queryClient.invalidateQueries({ queryKey: ["nutrition"] });
      toast({
        title: "Workout saved",
        description: `${result.duration_min ?? minutes} min · about ${Math.round(result.calories_burned ?? 0)} kcal. It's already counted in your plan's calorie target.`,
      });
      navigate("/tools/nutrition/plan");
    } catch (e) {
      toast({ title: "Could not save", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setFinishing(false);
    }
  };

  const discard = async () => {
    if (
      !session ||
      !(await confirmDialog({
        title: "Discard this workout?",
        description: "Everything logged in it will be deleted.",
        confirmLabel: "Discard",
        destructive: true,
      }))
    )
      return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await deleteWorkout(session.id).catch(() => {});
    await queryClient.invalidateQueries({ queryKey: ["nutrition"] });
    navigate("/tools/nutrition/plan");
  };

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => navigate("/tools/nutrition/plan")}>Back to plan</Button>
      </div>
    );
  }
  if (!day || !session) return <p className="text-sm text-muted-foreground">Starting workout…</p>;

  const elapsed = (now - Date.parse(session.started_at)) / 1000;
  const wu = weightUnit(units);
  const step = weightStep(units);

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24 animate-in">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tools/nutrition/plan")} aria-label="Back to plan">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{day.title}</h1>
          <p className="text-sm text-muted-foreground">{formatClock(elapsed)} elapsed · saves automatically</p>
        </div>
        <Button onClick={finish} disabled={finishing}>{finishing ? "Saving…" : "Finish workout"}</Button>
      </div>

      {blocks.map((block, bi) => {
        const cardio = block.slot.kind === "cardio";
        const last = lastLabel(block, units);
        return (
          <Card key={block.slot.id}>
            <CardContent className="space-y-3 pt-4">
              <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setDetail(block.slot)}>
                <ExerciseImage imageUrls={block.slot.exercise?.image_urls ?? []} alt={block.slot.name} className="h-14 w-14 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold">{block.slot.name}</p>
                  <p className="text-sm font-medium text-primary">Target {setsLabel(block.slot)}</p>
                  {last && <p className="text-sm text-muted-foreground">{last}</p>}
                </div>
                <Info className="h-4 w-4 text-muted-foreground" />
              </button>

              <div className="grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Set</span>
                <span>{cardio ? "Minutes" : wu}</span>
                <span>{cardio ? distanceUnit(units) : "Reps"}</span>
                <span />
              </div>
              {block.rows.map((row, ri) => (
                <div key={ri} className={cn("grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2 rounded-lg p-1", row.done && "bg-primary/10")}>
                  <span className="text-center font-semibold text-muted-foreground">{ri + 1}</span>
                  {cardio ? (
                    <>
                      <Input className="text-center" inputMode="decimal" value={row.minutes} placeholder="min"
                        onChange={(e) => updateRow(bi, ri, { minutes: e.target.value })} />
                      <Input className="text-center" inputMode="decimal" value={row.distance} placeholder="optional"
                        onChange={(e) => updateRow(bi, ri, { distance: e.target.value })} />
                    </>
                  ) : (
                    <>
                      <Stepper value={row.weight} placeholder={wu} step={step} label="weight"
                        onChange={(t) => updateRow(bi, ri, { weight: t })} />
                      <Stepper value={row.reps} placeholder="reps" step={1} integer label="reps"
                        onChange={(t) => updateRow(bi, ri, { reps: t })} />
                    </>
                  )}
                  <Button size="icon" variant={row.done ? "default" : "outline"} onClick={() => toggleDone(bi, ri)}
                    aria-label={row.done ? `Untick set ${ri + 1}` : `Tick off set ${ri + 1}`}>
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => addSet(bi)}>+ Set</Button>
                {block.rows.length > 1 && (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeSet(bi)}>− Set</Button>
                )}
                {!cardio && (
                  <div className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Shorter rest" onClick={() => changeRest(bi, -15)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    Rest {block.slot.rest_seconds}s
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Longer rest" onClick={() => changeRest(bi, 15)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex justify-center">
        <Button variant="ghost" className="text-destructive" onClick={discard}>Discard workout</Button>
      </div>

      {restLeft !== null && restLeft > 0 && (
        <div className="fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg"
          role="timer" aria-live="polite">
          <Clock className="h-5 w-5" />
          <span className="flex-1 text-lg font-bold tabular-nums">Rest {formatClock(restLeft)}</span>
          <Button size="sm" variant="secondary" onClick={() => setRestEndsAt((t) => (t ? Math.max(t - 15000, Date.now()) : t))}>−15</Button>
          <Button size="sm" variant="secondary" onClick={() => setRestEndsAt((t) => (t ? t + 15000 : t))}>+15</Button>
          <Button size="sm" variant="secondary" onClick={() => setRestEndsAt(null)}>Skip</Button>
        </div>
      )}

      <ExerciseDetailDialog planExercise={detail} readOnly onOpenChange={(open) => !open && setDetail(null)} />
    </div>
  );
}

function Stepper({ value, placeholder, step, integer, label, onChange }: {
  value: string;
  placeholder: string;
  step: number;
  integer?: boolean;
  label: string;
  onChange: (text: string) => void;
}) {
  const bump = (direction: 1 | -1) => {
    const next = Math.max((num(value) ?? 0) + direction * step, 0);
    onChange(integer ? String(Math.round(next)) : trim(next));
  };
  return (
    <div className="flex items-center rounded-md border">
      <Button variant="ghost" size="icon" className="h-9 w-8 shrink-0" onClick={() => bump(-1)} aria-label={`Decrease ${label}`}>
        <Minus className="h-3 w-3" />
      </Button>
      <input className="w-full min-w-0 bg-transparent text-center text-sm outline-none" inputMode={integer ? "numeric" : "decimal"}
        value={value} placeholder={placeholder} aria-label={label} onChange={(e) => onChange(e.target.value)} />
      <Button variant="ghost" size="icon" className="h-9 w-8 shrink-0" onClick={() => bump(1)} aria-label={`Increase ${label}`}>
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
