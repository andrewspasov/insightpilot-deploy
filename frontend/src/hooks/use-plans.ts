import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  CreatePlanPayload,
  LastPerformance,
  LibraryExercise,
  NutritionPlan,
  NutritionPlanSummary,
  PlanExercise,
  PlanExerciseInput,
  PlanInputPayload,
  PlanMealOption,
  PlanOptions,
  PlanPace,
  PlanPreview,
  PlanWorkoutDay,
  ProgramSuggestRequest,
  ProgramSuggestion,
  WorkoutSession,
  WorkoutSet,
} from "@/types/plans";
import type { NutritionEntry } from "@/types/nutrition";

export const planKeys = {
  all: ["nutrition", "plans"] as const,
  active: () => ["nutrition", "plans", "active"] as const,
  history: () => ["nutrition", "plans", "history"] as const,
  library: (search: string, muscle: string) => ["nutrition", "exercise-library", search, muscle] as const,
  workouts: (date: string) => ["nutrition", "workouts", date] as const,
  workout: (id: number) => ["nutrition", "workout", id] as const,
  last: (planExerciseId: number, sessionId?: number) =>
    ["nutrition", "last-performance", planExerciseId, sessionId ?? 0] as const,
};

/** Invalidates plans and everything derived from targets (overview, profile). */
function useInvalidatePlans() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["nutrition"] });
}

export function useActivePlan() {
  return useQuery({
    queryKey: planKeys.active(),
    queryFn: () => apiGet<{ plan: NutritionPlan | null }>("/nutrition/plans/active/"),
    select: (data) => data.plan,
    staleTime: 10_000,
  });
}

export function usePlanHistory() {
  return useQuery({
    queryKey: planKeys.history(),
    queryFn: () => apiGet<NutritionPlanSummary[]>("/nutrition/plans/"),
    staleTime: 30_000,
  });
}

export function usePreviewPlan() {
  return useMutation({
    mutationFn: (payload: PlanInputPayload) =>
      apiPost<PlanInputPayload, PlanPreview>("/nutrition/plans/preview/", payload),
  });
}

export function useCreatePlan() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (payload: CreatePlanPayload) =>
      apiPost<CreatePlanPayload, NutritionPlan>("/nutrition/plans/", payload),
    onSuccess: invalidate,
  });
}

function usePlanAction<TVars>(path: (vars: TVars) => string, body?: (vars: TVars) => object) {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (vars: TVars) => apiPost<object, NutritionPlan>(path(vars), body ? body(vars) : {}),
    onSuccess: invalidate,
  });
}

export const useSetPlanPace = () =>
  usePlanAction<{ planId: number; pace: PlanPace }>(
    ({ planId }) => `/nutrition/plans/${planId}/set-pace/`,
    ({ pace }) => ({ pace }),
  );
export const useArchivePlan = () => usePlanAction<number>((id) => `/nutrition/plans/${id}/archive/`);
export const useApplyCheckIn = () => usePlanAction<number>((id) => `/nutrition/plans/${id}/apply-check-in/`);
export const useSwitchToMaintain = () =>
  usePlanAction<number>((id) => `/nutrition/plans/${id}/switch-to-maintain/`);

export function useAddPlanDay() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (vars: { planId: number; weekday: number; title: string }) =>
      apiPost<object, PlanWorkoutDay>("/nutrition/plan-days/", {
        plan: vars.planId,
        weekday: vars.weekday,
        title: vars.title,
      }),
    onSuccess: invalidate,
  });
}

export function useDeletePlanDay() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/nutrition/plan-days/${id}/`),
    onSuccess: invalidate,
  });
}

export function useAddPlanExercise() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (vars: { dayId: number; input: PlanExerciseInput }) =>
      apiPost<object, PlanExercise>("/nutrition/plan-exercises/", { day: vars.dayId, ...vars.input }),
    onSuccess: invalidate,
  });
}

export type PlanExercisePatch = Partial<
  Pick<PlanExercise, "sets" | "rep_min" | "rep_max" | "duration_min" | "rest_seconds" | "notes">
> & { exercise_id?: number };

export function useUpdatePlanExercise() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (vars: { id: number; patch: PlanExercisePatch }) =>
      apiPatch<PlanExercisePatch, PlanExercise>(`/nutrition/plan-exercises/${vars.id}/`, vars.patch),
    onSuccess: invalidate,
  });
}

export function useDeletePlanExercise() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/nutrition/plan-exercises/${id}/`),
    onSuccess: invalidate,
  });
}

export function useLogPlanMeal() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (vars: { id: number; entryDate: string }) =>
      apiPost<object, NutritionEntry[]>(`/nutrition/plan-meals/${vars.id}/log/`, { entry_date: vars.entryDate }),
    onSuccess: invalidate,
  });
}

export function useGeneratePlanMeals() {
  const invalidate = useInvalidatePlans();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: number) =>
      apiPost<object, { meal_options: PlanMealOption[] }>(`/insight-ai/plans/${planId}/generate-meals/`, {}),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["insight-ai", "status"] });
    },
  });
}

export function useExerciseLibrary(search: string, muscle: string, enabled = true) {
  return useQuery({
    queryKey: planKeys.library(search, muscle),
    queryFn: () => {
      const qs = new URLSearchParams({ limit: "40" });
      if (search) qs.set("search", search);
      if (muscle) qs.set("muscle", muscle);
      return apiGet<{ count: number; results: LibraryExercise[] }>(`/nutrition/exercise-library/?${qs}`);
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useLibraryExercise(id: number | null | undefined) {
  return useQuery({
    queryKey: ["nutrition", "exercise-library", "detail", id],
    queryFn: () => apiGet<LibraryExercise>(`/nutrition/exercise-library/${id}/`),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

// Workouts
export function useWorkouts(date: string) {
  return useQuery({
    queryKey: planKeys.workouts(date),
    queryFn: () => apiGet<WorkoutSession[]>(`/nutrition/workouts/?date=${date}`),
    staleTime: 5_000,
  });
}

export function getWorkouts(date: string) {
  return apiGet<WorkoutSession[]>(`/nutrition/workouts/?date=${date}`);
}

export function getWorkout(id: number) {
  return apiGet<WorkoutSession>(`/nutrition/workouts/${id}/`);
}

export function startWorkout(planDayId: number, entryDate: string) {
  return apiPost<object, WorkoutSession>("/nutrition/workouts/", {
    plan_day: planDayId,
    entry_date: entryDate,
    sets: [],
  });
}

export function saveWorkoutSets(id: number, sets: WorkoutSet[]) {
  return apiPatch<{ sets: WorkoutSet[] }, WorkoutSession>(`/nutrition/workouts/${id}/`, { sets });
}

export function completeWorkout(id: number, durationMin: number) {
  return apiPost<object, WorkoutSession>(`/nutrition/workouts/${id}/complete/`, { duration_min: durationMin });
}

export function deleteWorkout(id: number) {
  return apiDelete(`/nutrition/workouts/${id}/`);
}

export function getLastPerformance(planExerciseId: number, excludeSessionId?: number) {
  const qs = new URLSearchParams({ plan_exercise: String(planExerciseId) });
  if (excludeSessionId) qs.set("exclude_session", String(excludeSessionId));
  return apiGet<LastPerformance>(`/nutrition/workouts/last-performance/?${qs}`);
}

// Built-in (no AI) programs and meals
export function usePlanOptions() {
  return useQuery({
    queryKey: ["nutrition", "plan-options"],
    queryFn: () => apiGet<PlanOptions>("/nutrition/plan-options/"),
    staleTime: 5 * 60_000,
  });
}

export function suggestProgram(request: ProgramSuggestRequest) {
  return apiPost<ProgramSuggestRequest, ProgramSuggestion>("/nutrition/program-templates/suggest/", request);
}

type SuggestExercisesResult = {
  filled: number[];
  skipped: number[];
  unrecognized: number[];
  missing: Record<string, string[]>;
  plan: NutritionPlan;
};

export function useSuggestPlanExercises() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (vars: { planId: number; dayIds?: number[]; replace?: boolean }) =>
      apiPost<object, SuggestExercisesResult>(`/nutrition/plans/${vars.planId}/suggest-exercises/`, {
        day_ids: vars.dayIds,
        replace: !!vars.replace,
      }),
    onSuccess: invalidate,
  });
}

export function useSuggestPlanMeals() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (vars: { planId: number; fresh?: boolean }) =>
      apiPost<object, { no_options_for: string[]; plan: NutritionPlan }>(
        `/nutrition/plans/${vars.planId}/suggest-meals/`,
        { fresh: vars.fresh ?? true },
      ),
    onSuccess: invalidate,
  });
}

export function useUpdatePlanDay() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (vars: { id: number; title: string }) =>
      apiPatch<object, PlanWorkoutDay>(`/nutrition/plan-days/${vars.id}/`, { title: vars.title }),
    onSuccess: invalidate,
  });
}
