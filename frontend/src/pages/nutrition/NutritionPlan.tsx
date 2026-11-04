import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Pencil, Play, Plus, Sparkles, Target, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ExerciseDetailDialog } from "@/components/nutrition/plans/ExerciseDetailDialog";
import { ExerciseImage } from "@/components/nutrition/plans/ExerciseImage";
import { ExercisePickerDialog } from "@/components/nutrition/plans/ExercisePickerDialog";
import { FoodPreferencesDialog } from "@/components/nutrition/plans/FoodPreferencesDialog";
import { useInsightAIStatus } from "@/hooks/use-insight-ai";
import {
  useActivePlan,
  useAddPlanDay,
  useAddPlanExercise,
  useApplyCheckIn,
  useArchivePlan,
  useDeletePlanDay,
  useDeletePlanExercise,
  useGeneratePlanMeals,
  useLogPlanMeal,
  usePlanHistory,
  useSetPlanPace,
  useSuggestPlanExercises,
  useSuggestPlanMeals,
  useSwitchToMaintain,
  useUpdatePlanDay,
  useUpdatePlanExercise,
  useWorkouts,
  type PlanExercisePatch,
} from "@/hooks/use-plans";
import { useToast } from "@/hooks/use-toast";
import { useUnits } from "@/hooks/use-units";
import { MEAL_LABELS, getTodayIsoDate } from "@/lib/nutrition";
import {
  AI_PLAN_PROMPT,
  GOAL_LABELS,
  PACE_LABELS,
  WEEKDAYS,
  formatShortDate,
  formatWeeks,
  formatWeight,
  setsLabel,
  todayWeekday,
} from "@/lib/plan-format";
import type { NutritionMealType } from "@/types/nutrition";
import type {
  LibraryExercise,
  NutritionPlanSummary,
  PlanExercise,
  PlanPace,
  PlanWorkoutDay,
  UnitsPreference,
  WorkoutSession,
} from "@/types/plans";

type PickerTarget = { mode: "swap"; slot: PlanExercise } | { mode: "add"; day: PlanWorkoutDay };

const MEAL_TYPES: NutritionMealType[] = ["breakfast", "lunch", "dinner", "snacks"];

function useErrorToast() {
  const { toast } = useToast();
  return (title: string, error: unknown) =>
    toast({ title, description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
}

export default function NutritionPlan() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const showError = useErrorToast();
  const { units, setUnits } = useUnits();
  const today = getTodayIsoDate();

  const planQuery = useActivePlan();
  const historyQuery = usePlanHistory();
  const workoutsQuery = useWorkouts(today);
  const aiStatus = useInsightAIStatus();
  const aiAvailable = !!aiStatus.data?.can_chat;

  const setPace = useSetPlanPace();
  const archive = useArchivePlan();
  const applyCheckIn = useApplyCheckIn();
  const switchToMaintain = useSwitchToMaintain();
  const addDay = useAddPlanDay();
  const deleteDay = useDeletePlanDay();
  const addExercise = useAddPlanExercise();
  const updateExercise = useUpdatePlanExercise();
  const deleteExercise = useDeletePlanExercise();
  const logMeal = useLogPlanMeal();
  const generateMeals = useGeneratePlanMeals();
  const suggestExercises = useSuggestPlanExercises();
  const suggestMeals = useSuggestPlanMeals();
  const updateDay = useUpdatePlanDay();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [suggestingDay, setSuggestingDay] = useState<number | "all" | null>(null);

  const [detail, setDetail] = useState<PlanExercise | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [mealTab, setMealTab] = useState<NutritionMealType>("breakfast");
  const [checkInHidden, setCheckInHidden] = useState(false);

  const plan = planQuery.data;
  const history = (historyQuery.data ?? []).filter((p) => p.status === "archived");

  const guard = async (fn: () => Promise<unknown>, failure: string) => {
    try {
      await fn();
    } catch (error) {
      showError(failure, error);
    }
  };

  const onPicked = (exercise: LibraryExercise) => {
    const target = picker;
    setPicker(null);
    if (!target) return;
    if (target.mode === "swap") {
      guard(() => updateExercise.mutateAsync({ id: target.slot.id, patch: { exercise_id: exercise.id } }), "Could not swap");
    } else {
      guard(
        () =>
          addExercise.mutateAsync({
            dayId: target.day.id,
            input: { exercise_id: exercise.id, sets: 3, rep_min: 8, rep_max: 12 },
          }),
        "Could not add exercise",
      );
    }
  };

  const onUpdateDetail = async (patch: PlanExercisePatch) => {
    if (!detail) return;
    try {
      setDetail(await updateExercise.mutateAsync({ id: detail.id, patch }));
    } catch (error) {
      showError("Could not update", error);
    }
  };

  // Built-in suggestions (no AI).
  const runSuggest = async (target: number | "all", replace: boolean) => {
    if (!planQuery.data) return;
    setSuggestingDay(target);
    try {
      const result = await suggestExercises.mutateAsync({
        planId: planQuery.data.id,
        dayIds: target === "all" ? undefined : [target],
        replace,
      });
      if (result.unrecognized.length) {
        const names = result.plan.workout_days.filter((d) => result.unrecognized.includes(d.id)).map((d) => `"${d.title}"`);
        toast({
          title: "Couldn't tell the muscles",
          description: `Rename ${names.join(", ")} with the muscles you train, e.g. "Chest & triceps" or "Legs".`,
        });
      } else {
        const parts = result.plan.workout_days
          .filter((d) => result.missing[d.id]?.length)
          .map((d) => `${d.title} (${result.missing[d.id].join(", ")})`);
        if (parts.length) {
          toast({
            title: "Some muscles need gear",
            description: `No exercise with your home gear for ${parts.join("; ")}. Add your own, or pick resistance bands or a pull-up bar next time you create a plan.`,
          });
        }
      }
    } catch (error) {
      showError("Could not suggest exercises", error);
    } finally {
      setSuggestingDay(null);
    }
  };

  const newMealIdeas = async (fresh: boolean) => {
    if (!planQuery.data) return;
    try {
      const result = await suggestMeals.mutateAsync({ planId: planQuery.data.id, fresh });
      if (result.no_options_for.length) {
        toast({
          title: "Some meals have no options",
          description: `Nothing in the meal library fits your preferences for ${result.no_options_for.join(", ")}.`,
        });
      }
    } catch (error) {
      showError("Could not refresh meals", error);
    }
  };

  if (planQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your plan…</p>;
  }

  const header = (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="mb-2 text-3xl font-bold">Plan</h1>
        <p className="text-muted-foreground">
          Calories, macros and a weekly workout program for your bulk, cut or maintenance.
        </p>
      </div>
      <UnitsToggle units={units} onChange={(u) => guard(() => setUnits(u), "Could not change units")} />
    </div>
  );

  if (!plan) {
    return (
      <div className="space-y-6 animate-in">
        {header}
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <Target className="h-10 w-10 text-primary" />
            <div>
              <h2 className="text-xl font-semibold">No active plan</h2>
              <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
                Tell us about your body, goal and training week. You'll get daily calories and macros with three pace
                options and how long each takes, plus a weekly workout program.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={() => navigate("/tools/nutrition/plan/new")}>Create plan</Button>
              {aiAvailable && (
                <Button variant="outline" onClick={() => navigate("/tools/nutrition/ai", { state: { prefill: AI_PLAN_PROMPT } })}>
                  <Sparkles className="mr-2 h-4 w-4" /> Describe it to the AI
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <PastPlans history={history} units={units} />
      </div>
    );
  }

  const progress = plan.progress;
  const weekday = todayWeekday();
  const days = new Map(plan.workout_days.map((d) => [d.weekday, d]));
  const todayDay = days.get(weekday);
  const workoutFor = (day: PlanWorkoutDay) => workoutsQuery.data?.find((w) => w.plan_day === day.id);
  const checkIn = plan.check_in;
  const mealOptions = plan.meal_options.filter((o) => o.meal_type === mealTab);
  // Shown first on phones and in the side column on wide screens.
  const todayCard = (
    <Card className="border-primary">
      <CardHeader>
        <CardDescription>Today · {WEEKDAYS[weekday]}</CardDescription>
        <CardTitle>{todayDay ? todayDay.title : "Rest day"}</CardTitle>
      </CardHeader>
      {todayDay && (
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            {todayDay.exercises.length} exercise{todayDay.exercises.length === 1 ? "" : "s"}
          </p>
          <WorkoutButton
            session={workoutFor(todayDay)}
            onStart={() => navigate(`/tools/nutrition/plan/workout/${todayDay.id}`)}
          />
        </CardContent>
      )}
    </Card>
  );

  return (
    <div className="space-y-6 animate-in">
      {header}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <div className="xl:hidden">{todayCard}</div>
          {plan.goal_reached && (
            <Card className="border-primary">
              <CardHeader>
                <CardTitle>You reached {formatWeight(plan.target_weight_kg, units)}!</CardTitle>
                <CardDescription>
                  Your weight trend has hit your target. Switch to a maintain plan to hold it, with the same workouts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() =>
                    window.confirm("Switch to a maintain plan? Your current plan moves to history.") &&
                    guard(() => switchToMaintain.mutateAsync(plan.id), "Could not switch")
                  }
                >
                  Switch to maintain
                </Button>
              </CardContent>
            </Card>
          )}

          {!checkInHidden && (checkIn.status === "adjust" || checkIn.status === "on_track") && (
            <Card className="border-amber-400">
              <CardHeader>
                <CardDescription>2-week check-in</CardDescription>
                <CardTitle>
                  {checkIn.status === "adjust"
                    ? `New target: ${checkIn.recommended.calories} kcal (${checkIn.difference_kcal > 0 ? "+" : ""}${checkIn.difference_kcal})`
                    : "You're on track"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {checkIn.status === "adjust" ? (
                  <>
                    <p>
                      {checkIn.rationale} Based on what you logged and your weight trend ({checkIn.confidence} confidence).
                    </p>
                    <p>
                      P {checkIn.recommended.protein_grams}g · C {checkIn.recommended.carbs_grams}g · F{" "}
                      {checkIn.recommended.fat_grams}g
                    </p>
                    <div className="flex gap-3">
                      <Button onClick={() => guard(() => applyCheckIn.mutateAsync(plan.id), "Could not apply")}>Apply</Button>
                      <Button variant="ghost" onClick={() => setCheckInHidden(true)}>
                        Not now
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>Your weight trend matches the plan's pace, so your targets stay the same.</p>
                    <Button onClick={() => guard(() => applyCheckIn.mutateAsync(plan.id), "Could not save")}>Got it</Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
          {checkIn.status === "need_data" && (
            <p className="text-sm text-muted-foreground">
              Your 2-week check-in needs more data: log meals on at least 7 days ({checkIn.logged_days} so far) and weigh
              in at least twice ({checkIn.weigh_ins} so far) in the last 4 weeks.
            </p>
          )}

          <Card>
            <CardHeader>
              <CardDescription>
                {GOAL_LABELS[plan.goal_type]}
                {plan.goal_type !== "maintain" ? ` · ${PACE_LABELS[plan.pace]} pace` : ""}
              </CardDescription>
              <CardTitle className="text-2xl">
                {formatWeight(plan.start_weight_kg, units)}
                {plan.goal_type !== "maintain" ? ` → ${formatWeight(plan.target_weight_kg, units)}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.goal_type !== "maintain" && (
                <>
                  <Progress value={progress.percent_complete} className="bg-muted" />
                  <div className="flex justify-between text-sm">
                    <span>
                      {progress.is_trend ? "Trend" : "Now"} {formatWeight(progress.current_weight_kg, units)} (
                      {formatWeight(progress.change_kg, units, true)})
                    </span>
                    <span className="font-medium">{Math.round(progress.percent_complete)}%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Week {Math.floor(progress.weeks_elapsed) + 1} of about {formatWeeks(plan.estimated_weeks)} · done
                    around {formatShortDate(plan.projected_end_date)}
                  </p>
                </>
              )}
              {plan.explanation && <p className="text-sm">{plan.explanation}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Daily target</CardDescription>
              <CardTitle className="text-3xl">{plan.daily_calorie_target} kcal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <Macro label="Protein" grams={plan.protein_target_grams} className="text-sky-500" />
                <Macro label="Carbs" grams={plan.carbs_target_grams} className="text-yellow-500" />
                <Macro label="Fat" grams={plan.fat_target_grams} className="text-orange-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                Maintenance is about {plan.maintenance_calories} kcal/day including your training. Logged planned
                workouts don't add to your food budget; extra activity adds half its estimated burn.
              </p>
              {plan.pace_options.length > 1 && (
                <div className="grid grid-cols-3 gap-2">
                  {plan.pace_options.map((o) => (
                    <Button
                      key={o.pace}
                      variant={o.pace === plan.pace ? "default" : "outline"}
                      className="h-auto flex-col whitespace-normal px-2 py-2"
                      disabled={setPace.isPending}
                      onClick={() =>
                        o.pace !== plan.pace &&
                        window.confirm(`Switch to ${PACE_LABELS[o.pace]} pace? Your daily target becomes ${o.daily_calorie_target} kcal.`) &&
                        guard(() => setPace.mutateAsync({ planId: plan.id, pace: o.pace as PlanPace }), "Could not change pace")
                      }
                    >
                      <span className="font-semibold">{PACE_LABELS[o.pace]}</span>
                      <span className="text-xs opacity-80">{o.daily_calorie_target} kcal</span>
                      <span className="text-xs opacity-80">{formatWeeks(o.estimated_weeks)}</span>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Weekly program</h2>
              {plan.workout_days.some((d) => !d.exercises.some((e) => e.kind === "strength")) && (
                <Button variant="outline" size="sm" disabled={suggestingDay !== null} onClick={() => runSuggest("all", false)}>
                  <Zap className="mr-1 h-4 w-4" /> {suggestingDay === "all" ? "Filling…" : "Fill empty days"}
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {WEEKDAYS.map((name, wd) => {
                const day = days.get(wd);
                if (!day) {
                  return (
                    <div key={name} className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3">
                      <span className="text-sm text-muted-foreground">{name} · Rest</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => guard(() => addDay.mutateAsync({ planId: plan.id, weekday: wd, title: "Workout" }), "Could not add day")}
                      >
                        <Plus className="mr-1 h-4 w-4" /> Training day
                      </Button>
                    </div>
                  );
                }
                return (
                  <Card key={name} className={wd === weekday ? "border-primary" : undefined}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardDescription>{name}</CardDescription>
                          <CardTitle className="text-lg">{day.title}</CardTitle>
                        </div>
                        {day.exercises.length > 0 && (
                          <WorkoutButton
                            session={workoutFor(day)}
                            label={wd === weekday ? undefined : "Do today"}
                            onStart={() => navigate(`/tools/nutrition/plan/workout/${day.id}`)}
                          />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {day.exercises.map((ex) => (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() => setDetail(ex)}
                          className="flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-muted"
                        >
                          <ExerciseImage imageUrls={ex.exercise?.image_urls ?? []} alt={ex.name} className="h-12 w-12 shrink-0" />
                          <span className="flex-1 font-medium">{ex.name}</span>
                          <span className="text-sm font-semibold text-primary">{setsLabel(ex)}</span>
                        </button>
                      ))}
                      {day.exercises.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No exercises yet. Suggest fills this day from its name, or add your own.
                        </p>
                      )}
                      <div className="flex flex-wrap justify-between gap-1 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setPicker({ mode: "add", day })}>
                          <Plus className="mr-1 h-4 w-4" /> Add exercise
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={suggestingDay !== null}
                          onClick={() => {
                            const hasStrength = day.exercises.some((e) => e.kind === "strength");
                            if (!hasStrength || window.confirm(`Replace the exercises on ${day.title}? Cardio stays.`)) {
                              runSuggest(day.id, true);
                            }
                          }}
                        >
                          <Zap className="mr-1 h-4 w-4" /> {suggestingDay === day.id ? "Suggesting…" : "Suggest"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const title = window.prompt(
                              'Name the muscles this day trains, e.g. "Chest, triceps & side delts":',
                              day.title,
                            );
                            if (title?.trim()) guard(() => updateDay.mutateAsync({ id: day.id, title: title.trim() }), "Could not rename");
                          }}
                        >
                          <Pencil className="mr-1 h-4 w-4" /> Rename
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() =>
                            window.confirm(`Make ${name} a rest day? This removes ${day.title} and its exercises.`) &&
                            guard(() => deleteDay.mutateAsync(day.id), "Could not remove day")
                          }
                        >
                          Rest day
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="hidden xl:block">{todayCard}</div>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle>Example meals</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setPrefsOpen(true)}>Food preferences</Button>
              </div>
              <CardDescription>3 options per meal, new ideas every day, sized to your targets. Log any of them to today.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {plan.meal_options.length === 0 ? (
                <Button disabled={suggestMeals.isPending} onClick={() => newMealIdeas(false)}>
                  {suggestMeals.isPending ? "Picking meals…" : "Get example meals"}
                </Button>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {MEAL_TYPES.map((m) => (
                      <Button key={m} size="sm" variant={mealTab === m ? "default" : "outline"} onClick={() => setMealTab(m)}>
                        {MEAL_LABELS[m]}
                      </Button>
                    ))}
                  </div>
                  {mealOptions.map((option) => (
                    <div key={option.id} className="overflow-hidden rounded-lg border">
                      {option.image_url && (
                        <div className="relative">
                          <img
                            src={option.image_url}
                            alt={option.name}
                            loading="lazy"
                            className="h-40 w-full bg-muted object-cover"
                          />
                          {option.image_credit && (
                            <span className="absolute bottom-1.5 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                              Photo: {option.image_credit}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="p-3">
                        <div className="flex justify-between gap-3">
                          <p className="font-medium">{option.name}</p>
                          <p className="font-semibold">{Math.round(option.calories)} kcal</p>
                        </div>
                        {option.description && <p className="text-sm text-muted-foreground">{option.description}</p>}
                        <ul className="mt-2 space-y-0.5 text-sm">
                          {option.items.map((item, i) => (
                            <li key={i}>
                              • {item.quantity} {item.unit} {item.food_name}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            P {Math.round(option.protein_grams)}g · C {Math.round(option.carbs_grams)}g · F{" "}
                            {Math.round(option.fat_grams)}g
                          </span>
                          <Button
                            size="sm"
                            disabled={logMeal.isPending}
                            onClick={() =>
                              guard(async () => {
                                await logMeal.mutateAsync({ id: option.id, entryDate: today });
                                toast({ title: "Logged", description: `${option.name} was added to today's ${option.meal_type}.` });
                              }, "Could not log meal")
                            }
                          >
                            Log today
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" size="sm" disabled={suggestMeals.isPending || generateMeals.isPending}
                      onClick={() => newMealIdeas(true)}>
                      {suggestMeals.isPending ? "Picking meals…" : "New meal ideas"}
                    </Button>
                    {aiAvailable && (
                      <Button variant="ghost" size="sm" disabled={suggestMeals.isPending || generateMeals.isPending}
                        onClick={() => guard(() => generateMeals.mutateAsync(plan.id), "Could not create meals")}>
                        <Sparkles className="mr-1 h-4 w-4" />
                        {generateMeals.isPending ? "Writing meals…" : "Ideas from AI"}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={() =>
                window.confirm("Start a new plan? Your current plan moves to history.") && navigate("/tools/nutrition/plan/new")
              }
            >
              Start a new plan
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() =>
                window.confirm("End this plan? It moves to your history; your current targets stay until you change them.") &&
                guard(() => archive.mutateAsync(plan.id), "Could not end plan")
              }
            >
              End this plan
            </Button>
          </div>

          <PastPlans history={history} units={units} />
        </div>
      </div>

      <ExerciseDetailDialog
        planExercise={detail}
        busy={updateExercise.isPending || deleteExercise.isPending}
        onOpenChange={(open) => !open && setDetail(null)}
        onUpdate={onUpdateDetail}
        onSwap={() => {
          const slot = detail;
          setDetail(null);
          if (slot) setPicker({ mode: "swap", slot });
        }}
        onRemove={() => {
          const slot = detail;
          setDetail(null);
          if (slot) guard(() => deleteExercise.mutateAsync(slot.id), "Could not remove exercise");
        }}
      />
      <FoodPreferencesDialog
        open={prefsOpen}
        onOpenChange={setPrefsOpen}
        onSaved={() => {
          setPrefsOpen(false);
          newMealIdeas(false);
        }}
      />
      <ExercisePickerDialog
        open={!!picker}
        title={picker?.mode === "swap" ? `Swap ${picker.slot.name}` : "Add exercise"}
        initialMuscle={picker?.mode === "swap" ? picker.slot.exercise?.primary_muscles[0] ?? "" : ""}
        onPick={onPicked}
        onOpenChange={(open) => !open && setPicker(null)}
      />
    </div>
  );
}

function WorkoutButton({ session, label, onStart }: { session?: WorkoutSession; label?: string; onStart: () => void }) {
  if (session?.completed_at) {
    return (
      <Badge variant="secondary" className="gap-1 py-1">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        Done · {session.duration_min ?? "?"} min
        {session.calories_burned ? ` · ${Math.round(session.calories_burned)} kcal` : ""}
      </Badge>
    );
  }
  return (
    <Button size="sm" onClick={onStart}>
      <Play className="mr-1 h-4 w-4" />
      {session ? "Resume workout" : label ?? "Start workout"}
    </Button>
  );
}

function Macro({ label, grams, className }: { label: string; grams: number; className: string }) {
  return (
    <div>
      <p className={`text-xl font-bold ${className}`}>{Math.round(grams)}g</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function UnitsToggle({ units, onChange }: { units: UnitsPreference; onChange: (units: UnitsPreference) => void }) {
  return (
    <div className="inline-flex rounded-lg border p-1" role="group" aria-label="Units">
      {(["metric", "us"] as UnitsPreference[]).map((u) => (
        <Button key={u} size="sm" variant={units === u ? "default" : "ghost"} onClick={() => units !== u && onChange(u)}>
          {u === "metric" ? "Metric (kg)" : "US (lb)"}
        </Button>
      ))}
    </div>
  );
}

function PastPlans({ history, units }: { history: NutritionPlanSummary[]; units: UnitsPreference }) {
  if (!history.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Past plans</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {history.map((p) => (
          <div key={p.id} className="rounded-lg border p-3 text-sm">
            <p className="font-medium">
              {GOAL_LABELS[p.goal_type]} · {formatWeight(p.start_weight_kg, units)}
              {p.goal_type !== "maintain" ? ` → ${formatWeight(p.target_weight_kg, units)}` : ""}
            </p>
            <p className="text-muted-foreground">
              {formatShortDate(p.start_date)} – {formatShortDate(p.archived_at ? p.archived_at.slice(0, 10) : null)} ·{" "}
              {p.daily_calorie_target} kcal
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

