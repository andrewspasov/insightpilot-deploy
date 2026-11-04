import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, Plus, X, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ExerciseImage } from "@/components/nutrition/plans/ExerciseImage";
import { ExercisePickerDialog } from "@/components/nutrition/plans/ExercisePickerDialog";
import { FoodPreferencesFields } from "@/components/nutrition/plans/FoodPreferencesFields";
import { useNutritionOverview, useNutritionProfile } from "@/hooks/use-nutrition";
import { suggestProgram, useCreatePlan, usePlanOptions, usePreviewPlan } from "@/hooks/use-plans";
import { getTodayIsoDate } from "@/lib/nutrition";
import {
  CARDIO_ACTIVITIES,
  GOAL_LABELS,
  JOB_LABELS,
  PACE_LABELS,
  WEEKDAYS,
  cmToFeetInches,
  displayToKg,
  feetInchesToCm,
  formatShortDate,
  formatWeeks,
  formatWeight,
  kgToDisplay,
  weightUnit,
} from "@/lib/plan-format";
import { cn } from "@/lib/utils";
import type {
  Equipment,
  HomeGear,
  ProgramSuggestion,
  JobActivity,
  LibraryExercise,
  SuggestedExercise,
  NutritionSex,
  PlanExerciseInput,
  PlanGoalType,
  PlanInputPayload,
  PlanPace,
  PlanPreview,
  TrainingActivity,
  TrainingSession,
} from "@/types/plans";

type DraftExercise = {
  exercise_id: number;
  name: string;
  image_urls: string[];
  sets: number;
  rep_min: number;
  rep_max: number;
  rest_seconds?: number;
  notes?: string;
};

const OWN_SPLIT = "own";

const fromLibrary = (e: LibraryExercise): DraftExercise => ({
  exercise_id: e.id, name: e.name, image_urls: e.image_urls, sets: 3, rep_min: 8, rep_max: 12,
});

const fromSuggestion = (e: SuggestedExercise): DraftExercise => ({
  exercise_id: e.exercise_id, name: e.name, image_urls: e.image_urls, sets: e.sets,
  rep_min: e.rep_min, rep_max: e.rep_max, rest_seconds: e.rest_seconds, notes: e.notes,
});
type DayDraft = {
  title: string;
  liftMinutes: string;
  cardio: TrainingActivity | "";
  cardioMinutes: string;
  exercises: DraftExercise[];
};

const STEPS = ["About you", "Goal", "Training week", "Choose pace"];
const newDay = (): DayDraft => ({ title: "", liftMinutes: "60", cardio: "", cardioMinutes: "30", exercises: [] });

const toNumber = (text: string) => {
  const value = parseFloat(text.replace(",", "."));
  return Number.isFinite(value) ? value : NaN;
};

export default function NutritionPlanBuilder() {
  const navigate = useNavigate();
  const profileQuery = useNutritionProfile();
  const overviewQuery = useNutritionOverview(getTodayIsoDate());
  const preview = usePreviewPlan();
  const planOptions = usePlanOptions();
  const create = useCreatePlan();
  const units = profileQuery.data?.units ?? "metric";

  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  const [sex, setSex] = useState<NutritionSex | "">("");
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weight, setWeight] = useState("");
  const [job, setJob] = useState<JobActivity | "">("");
  const [goal, setGoal] = useState<PlanGoalType | "">("");
  const [target, setTarget] = useState("");
  const [foodNotes, setFoodNotes] = useState("");
  const [liked, setLiked] = useState<string[]>([]);
  const [avoided, setAvoided] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<Equipment>("gym");
  const [homeGear, setHomeGear] = useState<HomeGear[]>([]);
  const [includeAbs, setIncludeAbs] = useState(true);
  const [split, setSplit] = useState(OWN_SPLIT);
  const [suggesting, setSuggesting] = useState(false);
  const [notice, setNotice] = useState("");
  const [days, setDays] = useState<Record<number, DayDraft>>({});
  const [pickerDay, setPickerDay] = useState<number | null>(null);
  const [result, setResult] = useState<PlanPreview | null>(null);
  const [pace, setPace] = useState<PlanPace>("middle");

  // Pre-fill from what the app already knows, once both requests are in.
  useEffect(() => {
    const profile = profileQuery.data;
    if (prefilled || !profile || overviewQuery.isLoading) return;
    if (profile.sex) setSex(profile.sex);
    if (profile.age) setAge(String(profile.age));
    if (profile.height_cm) {
      setHeightCm(String(Math.round(profile.height_cm)));
      const { feet, inches } = cmToFeetInches(profile.height_cm);
      setHeightFt(String(feet));
      setHeightIn(String(inches));
    }
    if (profile.job_activity) setJob(profile.job_activity);
    if (profile.food_preferences) setFoodNotes(profile.food_preferences);
    setLiked(profile.liked_foods ?? []);
    setAvoided(profile.avoided_foods ?? []);
    if (profile.equipment) setEquipment(profile.equipment);
    setHomeGear(profile.home_gear ?? []);
    setIncludeAbs(profile.include_abs ?? true);
    const latest = overviewQuery.data?.latest_weight_entry;
    if (latest) setWeight(String(kgToDisplay(latest.weight_kg, profile.units ?? "metric")));
    setPrefilled(true);
  }, [prefilled, profileQuery.data, overviewQuery.isLoading, overviewQuery.data]);

  const heightInCm = () =>
    units === "us" ? feetInchesToCm(toNumber(heightFt), toNumber(heightIn || "0")) : toNumber(heightCm);

  const weeklyTraining = (): TrainingSession[] =>
    Object.entries(days).flatMap(([wd, day]) => {
      const sessions: TrainingSession[] = [];
      const lift = toNumber(day.liftMinutes);
      if (lift > 0) sessions.push({ weekday: Number(wd), activity: "weights", duration_min: lift });
      const cardio = toNumber(day.cardioMinutes);
      if (day.cardio && cardio > 0) sessions.push({ weekday: Number(wd), activity: day.cardio, duration_min: cardio });
      return sessions;
    });

  const inputs = (): PlanInputPayload => ({
    goal_type: goal as PlanGoalType,
    sex: sex as NutritionSex,
    age: Math.round(toNumber(age)),
    height_cm: Math.round(heightInCm() * 10) / 10,
    weight_kg: Math.round(displayToKg(toNumber(weight), units) * 100) / 100,
    target_weight_kg: goal === "maintain" ? undefined : Math.round(displayToKg(toNumber(target), units) * 100) / 100,
    job_activity: job as JobActivity,
    weekly_training: weeklyTraining(),
  });

  const validate = () => {
    if (step === 0) {
      if (!sex) return "Choose male or female.";
      const a = toNumber(age);
      if (!(a >= 14 && a <= 100)) return "Enter an age between 14 and 100.";
      const h = heightInCm();
      if (!(h >= 120 && h <= 250)) return "Enter a valid height.";
      if (!(toNumber(weight) > 0)) return "Enter your current weight.";
      if (!job) return "Choose how active you are outside the gym.";
    }
    if (step === 1) {
      if (!goal) return "Choose bulk, cut or maintain.";
      if (goal !== "maintain") {
        const t = toNumber(target);
        if (!(t > 0)) return "Enter your target weight.";
        if (goal === "gain" && t <= toNumber(weight)) return "For a bulk, the target must be above your current weight.";
        if (goal === "lose" && t >= toNumber(weight)) return "For a cut, the target must be below your current weight.";
      }
    }
    if (step === 2) {
      for (const [wd, day] of Object.entries(days)) {
        const lift = toNumber(day.liftMinutes || "0");
        const cardio = day.cardio ? toNumber(day.cardioMinutes || "0") : 0;
        if (!(lift > 0) && !(cardio > 0)) return `${WEEKDAYS[Number(wd)]}: add weights minutes or cardio, or make it a rest day.`;
      }
    }
    return "";
  };

  const next = async () => {
    const problem = validate();
    setError(problem);
    if (problem) return;
    if (step === 2) {
      try {
        const res = await preview.mutateAsync(inputs());
        setResult(res);
        setPace(res.options.length === 1 ? res.options[0].pace : "middle");
        setStep(3);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not calculate the plan.");
      }
      return;
    }
    setStep(step + 1);
  };

  const submit = async () => {
    setError("");
    try {
      await create.mutateAsync({
        ...inputs(),
        pace,
        food_preferences: foodNotes.trim(),
        liked_foods: liked,
        avoided_foods: avoided,
        equipment,
        home_gear: homeGear,
        include_abs: includeAbs,
        workout_days: Object.entries(days)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([wd, day]) => {
            const exercises: PlanExerciseInput[] = day.exercises.map((e) => ({
              exercise_id: e.exercise_id,
              sets: e.sets,
              rep_min: e.rep_min,
              rep_max: e.rep_max,
              rest_seconds: e.rest_seconds,
              notes: e.notes,
            }));
            const cardioMinutes = toNumber(day.cardioMinutes);
            if (day.cardio && cardioMinutes > 0) {
              const activity = CARDIO_ACTIVITIES.find((c) => c.key === day.cardio);
              exercises.push({
                exercise_slug: activity?.slug,
                name: activity?.label ?? "Cardio",
                kind: "cardio",
                duration_min: cardioMinutes,
              });
            }
            const fallback = toNumber(day.liftMinutes) > 0 ? "Workout" : "Cardio";
            return { weekday: Number(wd), title: day.title.trim() || fallback, exercises };
          }),
      });
      navigate("/tools/nutrition/plan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the plan.");
    }
  };

  const updateDay = (wd: number, patch: Partial<DayDraft>) =>
    setDays((prev) => ({ ...prev, [wd]: { ...prev[wd], ...patch } }));
  const toggleDay = (wd: number) =>
    setDays((prev) => {
      const copy = { ...prev };
      if (copy[wd]) delete copy[wd];
      else copy[wd] = newDay();
      return copy;
    });

  const wu = weightUnit(units);
  const busy = preview.isPending || create.isPending || suggesting;

  // Ready-made programs and "Suggest exercises" use the built-in rules (no AI).
  const applySplit = async (key: string) => {
    setNotice("");
    if (key === OWN_SPLIT) {
      setSplit(OWN_SPLIT);
      return;
    }
    const filled = Object.values(days).some((d) => d.exercises.length);
    if (filled && !window.confirm("Replace the exercises you've already set up?")) return;
    setSuggesting(true);
    try {
      const result = await suggestProgram({
        split: key, equipment, home_gear: homeGear, include_abs: includeAbs, goal_type: (goal || "maintain") as PlanGoalType,
      });
      setDays((prev) => {
        const next: Record<number, DayDraft> = {};
        for (const day of result.days) {
          next[day.weekday] = { ...(prev[day.weekday] ?? newDay()), title: day.title, exercises: day.exercises.map(fromSuggestion) };
        }
        return next;
      });
      setSplit(key);
      reportMissing(result);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not build the program.");
    } finally {
      setSuggesting(false);
    }
  };

  const reportMissing = (result: ProgramSuggestion) => {
    const parts = result.days.filter((d) => d.missing.length).map((d) => `${WEEKDAYS[d.weekday]} (${d.missing.join(", ")})`);
    if (parts.length) {
      setNotice(`No exercise with your home gear for ${parts.join("; ")}. Add resistance bands or a pull-up bar above, or add your own exercises.`);
    }
  };

  const suggestDays = async (weekdays: number[]) => {
    setNotice("");
    const targets = weekdays.filter((wd) => days[wd]);
    const untitled = targets.filter((wd) => !days[wd].title.trim());
    if (untitled.length) {
      setNotice(`Give ${untitled.map((wd) => WEEKDAYS[wd]).join(", ")} a focus like "Chest & triceps", "Legs" or "Upper body" first.`);
      return;
    }
    const filled = targets.filter((wd) => days[wd].exercises.length).map((wd) => WEEKDAYS[wd]);
    if (filled.length && !window.confirm(`Replace the exercises on ${filled.join(", ")}?`)) return;
    setSuggesting(true);
    try {
      const result = await suggestProgram({
        equipment, home_gear: homeGear, include_abs: includeAbs, goal_type: (goal || "maintain") as PlanGoalType,
        days: targets.map((wd) => ({ weekday: wd, title: days[wd].title })),
      });
      setDays((prev) => {
        const next = { ...prev };
        for (const day of result.days) next[day.weekday] = { ...next[day.weekday], exercises: day.exercises.map(fromSuggestion) };
        return next;
      });
      if (result.unrecognized.length) {
        setNotice(`Couldn't tell which muscles ${result.unrecognized.map((wd) => WEEKDAYS[wd]).join(", ")} trains. Name them, e.g. "Back & biceps" or "Legs".`);
      } else {
        reportMissing(result);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not suggest exercises.");
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-in">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => (step ? setStep(step - 1) : navigate("/tools/nutrition/plan"))}>
          <ArrowLeft className="mr-1 h-4 w-4" /> {step ? "Back" : "Plan"}
        </Button>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="text-3xl font-bold">{STEPS[step]}</h1>
        <Progress className="mt-3 bg-muted" value={((step + 1) / STEPS.length) * 100} />
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          {step === 0 && (
            <>
              <Field label="Sex">
                <Chips value={sex} onChange={(v) => setSex(v as NutritionSex)}
                  options={[{ key: "male", label: "Male" }, { key: "female", label: "Female" }]} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Age">
                  <Input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 27" />
                </Field>
                <Field label="Height">
                  {units === "us" ? (
                    <div className="flex gap-2">
                      <Input inputMode="numeric" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} placeholder="ft" />
                      <Input inputMode="numeric" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} placeholder="in" />
                    </div>
                  ) : (
                    <Input inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="cm" />
                  )}
                </Field>
                <Field label={`Current weight (${wu})`}>
                  <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={wu} />
                </Field>
              </div>
              <Field label="Daily activity outside the gym">
                <Chips value={job} onChange={(v) => setJob(v as JobActivity)}
                  options={(Object.keys(JOB_LABELS) as JobActivity[]).map((k) => ({ key: k, label: JOB_LABELS[k] }))} />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="What do you want to do?">
                <Chips value={goal} onChange={(v) => setGoal(v as PlanGoalType)}
                  options={(["gain", "lose", "maintain"] as PlanGoalType[]).map((k) => ({ key: k, label: GOAL_LABELS[k] }))} />
              </Field>
              {goal && goal !== "maintain" && (
                <Field label={`Target weight (${wu})`}>
                  <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)}
                    placeholder={`Current: ${weight || "?"} ${wu}`} />
                </Field>
              )}
              {planOptions.data && (
                <FoodPreferencesFields
                  likeOptions={planOptions.data.liked_foods}
                  avoidOptions={planOptions.data.avoided_foods}
                  liked={liked}
                  avoided={avoided}
                  notes={foodNotes}
                  onChange={(next) => {
                    if (next.liked) setLiked(next.liked);
                    if (next.avoided) setAvoided(next.avoided);
                    if (next.notes !== undefined) setFoodNotes(next.notes);
                  }}
                />
              )}
              <p className="text-xs text-muted-foreground">Your example meals favour what you like and skip what you avoid.</p>
            </>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Field label="Where do you train?">
                <Chips value={equipment} onChange={(v) => setEquipment(v as Equipment)}
                  options={(planOptions.data?.equipment ?? []).map((o) => ({ key: o.key, label: o.label }))} />
              </Field>
              {equipment === "home" && (
                <Field label="What do you have at home?">
                  <Chips value={homeGear}
                    onChange={(v) => setHomeGear((prev) =>
                      prev.includes(v as HomeGear) ? prev.filter((g) => g !== v) : [...prev, v as HomeGear])}
                    options={(planOptions.data?.home_gear ?? []).map((o) => ({ key: o.key, label: o.label }))} />
                  <p className="mt-1 text-xs text-muted-foreground">Leave both off for bodyweight only (floor, a wall and a chair).</p>
                </Field>
              )}
              <Field label="Add abs to each workout?">
                <Chips value={includeAbs ? "yes" : "no"} onChange={(v) => setIncludeAbs(v === "yes")}
                  options={[{ key: "yes", label: "Yes" }, { key: "no", label: "No" }]} />
              </Field>
              <Field label="Program">
                <Chips small value={split} onChange={applySplit}
                  options={[{ key: OWN_SPLIT, label: "My own split" },
                    ...(planOptions.data?.splits ?? []).map((sp) => ({ key: sp.key, label: sp.name }))]} />
              </Field>
              <p className="text-sm text-muted-foreground">
                {split === OWN_SPLIT
                  ? "Click the days you train and name each one (e.g. \"Chest, triceps, middle delts\"), then Suggest exercises or add your own."
                  : `${planOptions.data?.splits.find((sp) => sp.key === split)?.description ?? ""} Days are placed on a default schedule; click a day to switch it between training and rest.`}{" "}
                Your training is included in your calorie target, so be realistic.
              </p>
              {notice && <p className="text-sm text-amber-600 dark:text-amber-400">{notice}</p>}
              {Object.keys(days).length > 0 && (
                <Button disabled={busy} onClick={() => suggestDays(Object.keys(days).map(Number))}>
                  <Zap className="mr-2 h-4 w-4" /> Suggest exercises for all training days
                </Button>
              )}
              {WEEKDAYS.map((name, wd) => {
                const day = days[wd];
                return (
                  <div key={name} className={cn("rounded-lg border", day && "border-primary/60")}>
                    <button type="button" className="flex w-full items-center justify-between px-4 py-3" onClick={() => toggleDay(wd)}>
                      <span className="font-medium">{name}</span>
                      <span className={cn("text-sm", day ? "text-primary" : "text-muted-foreground")}>{day ? "Training" : "Rest"}</span>
                    </button>
                    {day && (
                      <div className="space-y-3 border-t px-4 py-3">
                        <Input value={day.title} onChange={(e) => updateDay(wd, { title: e.target.value })}
                          placeholder="Focus, e.g. Chest, triceps & side delts" />
                        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">
                          <Field label="Weights (min)">
                            <Input inputMode="numeric" value={day.liftMinutes} onChange={(e) => updateDay(wd, { liftMinutes: e.target.value })} />
                          </Field>
                          <Field label="Cardio">
                            <Chips small value={day.cardio} onChange={(v) => updateDay(wd, { cardio: v as TrainingActivity | "" })}
                              options={[{ key: "", label: "None" }, ...CARDIO_ACTIVITIES.map((c) => ({ key: c.key, label: c.label }))]} />
                          </Field>
                          <Field label="Cardio (min)">
                            <Input inputMode="numeric" disabled={!day.cardio} value={day.cardio ? day.cardioMinutes : ""}
                              onChange={(e) => updateDay(wd, { cardioMinutes: e.target.value })} />
                          </Field>
                        </div>
                        {day.exercises.map((e, i) => (
                          <div key={`${e.exercise_id}-${i}`} className="flex items-center gap-3 rounded-lg bg-muted/50 p-2">
                            <ExerciseImage imageUrls={e.image_urls} alt={e.name} className="h-10 w-10 shrink-0" />
                            <span className="flex-1 text-sm font-medium">{e.name}</span>
                            <span className="text-xs text-muted-foreground">{e.sets} × {e.rep_min}–{e.rep_max}</span>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove exercise"
                              onClick={() => updateDay(wd, { exercises: day.exercises.filter((_, j) => j !== i) })}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setPickerDay(wd)}>
                            <Plus className="mr-1 h-4 w-4" /> Add exercise
                          </Button>
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => suggestDays([wd])}>
                            <Zap className="mr-1 h-4 w-4" /> Suggest exercises
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">You can add, swap or remove exercises later on the Plan page.</p>
            </div>
          )}

          {step === 3 && result && (
            <div className="space-y-3">
              <div className="rounded-lg border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your maintenance</p>
                <p className="text-2xl font-bold">{result.maintenance_calories} kcal/day</p>
                <p className="text-sm text-muted-foreground">
                  Resting {result.bmr} kcal × {result.job_factor} daily activity + {result.training_calories_per_day} kcal
                  training (weekly average)
                </p>
              </div>
              {result.options.map((o) => {
                const selected = o.pace === pace;
                return (
                  <button key={o.pace} type="button" onClick={() => setPace(o.pace)}
                    className={cn("w-full rounded-lg border p-4 text-left transition-colors", selected ? "border-primary bg-primary/5" : "hover:bg-muted")}>
                    <div className="flex items-center justify-between">
                      <span className={cn("font-semibold", selected && "text-primary")}>
                        {result.options.length === 1 ? "Maintain" : PACE_LABELS[o.pace]}
                      </span>
                      {selected ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <p className="mt-1 text-2xl font-bold">{o.daily_calorie_target} kcal/day</p>
                    <p className="text-sm text-muted-foreground">P {o.protein_grams}g · C {o.carbs_grams}g · F {o.fat_grams}g</p>
                    {o.weekly_change_kg !== 0 && (
                      <p className="mt-1 text-sm">
                        {formatWeight(o.weekly_change_kg, units, true)}/week · {formatWeeks(o.estimated_weeks)} · done around{" "}
                        {formatShortDate(o.projected_end_date)}
                      </p>
                    )}
                    {o.note && <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">{o.note}</p>}
                  </button>
                );
              })}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end">
            <Button disabled={busy} onClick={step === 3 ? submit : next}>
              {busy ? "Working…" : step === 3 ? "Create plan" : step === 2 ? "See my numbers" : "Continue"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ExercisePickerDialog
        open={pickerDay !== null}
        title={pickerDay !== null ? `Add to ${WEEKDAYS[pickerDay]}` : undefined}
        onOpenChange={(open) => !open && setPickerDay(null)}
        onPick={(exercise) => {
          if (pickerDay === null) return;
          updateDay(pickerDay, { exercises: [...days[pickerDay].exercises, fromLibrary(exercise)] });
          setPickerDay(null);
        }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Chips({ options, value, onChange, small }: {
  options: { key: string; label: string }[];
  // An array makes it multi-select: each click toggles one key.
  value: string | string[];
  onChange: (key: string) => void;
  small?: boolean;
}) {
  const isActive = (key: string) => (Array.isArray(value) ? value.includes(key) : value === key);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Button key={o.key || "none"} type="button" size={small ? "sm" : "default"}
          variant={isActive(o.key) ? "default" : "outline"} aria-pressed={isActive(o.key)} onClick={() => onChange(o.key)}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}
