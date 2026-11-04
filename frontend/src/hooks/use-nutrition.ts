import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from "@/lib/api";
import type {
  CopyNutritionDayPayload,
  CopyNutritionEntriesPayload,
  CopyNutritionMealPayload,
  DiaryCalendarMonth,
  LabelScanResponse,
  NutritionRecipe,
  PhotoAnalysisResponse,
  RecipePayload,
  LogSavedMealPayload,
  NutritionCustomFood,
  NutritionEntry,
  NutritionEntryPayload,
  NutritionFoodSearchResponse,
  NutritionInsightsResponse,
  NutritionOverviewResponse,
  NutritionProfile,
  NutritionSavedMeal,
  SaveMealFromDiaryPayload,
  WeightEntryPayload,
  NutritionWeightEntry,
} from "@/types/nutrition";

const nutritionKeys = {
  all: ["nutrition"] as const,
  profile: () => ["nutrition", "profile"] as const,
  overview: (date: string) => ["nutrition", "overview", date] as const,
  search: (query: string) => ["nutrition", "search", query] as const,
  savedMeals: () => ["nutrition", "saved-meals"] as const,
  insights: (days: number) => ["nutrition", "insights", days] as const,
  calendar: (month: string) => ["nutrition", "calendar", month] as const,
  recipes: () => ["nutrition", "recipes"] as const,
};

export function useNutritionProfile() {
  return useQuery<NutritionProfile>({
    queryKey: nutritionKeys.profile(),
    queryFn: () => apiGet<NutritionProfile>("/nutrition/profile/"),
    staleTime: 30_000,
  });
}

export function useNutritionOverview(date: string) {
  return useQuery<NutritionOverviewResponse>({
    queryKey: nutritionKeys.overview(date),
    queryFn: () => apiGet<NutritionOverviewResponse>(`/nutrition/overview/?date=${date}`),
    staleTime: 10_000,
  });
}

export function useNutritionFoodSearch(query: string, enabled = true) {
  return useQuery<NutritionFoodSearchResponse>({
    queryKey: nutritionKeys.search(query),
    queryFn: () =>
      apiGet<NutritionFoodSearchResponse>(
        `/nutrition/foods/search/?query=${encodeURIComponent(query)}`,
      ),
    enabled,
    staleTime: 10_000,
  });
}

export function useNutritionInsights(days: number) {
  return useQuery<NutritionInsightsResponse>({
    queryKey: nutritionKeys.insights(days),
    queryFn: () => apiGet<NutritionInsightsResponse>(`/nutrition/insights/?days=${days}`),
    staleTime: 30_000,
  });
}

export function useNutritionSavedMeals(enabled = true) {
  return useQuery<NutritionSavedMeal[]>({
    queryKey: nutritionKeys.savedMeals(),
    queryFn: () => apiGet<NutritionSavedMeal[]>("/nutrition/saved-meals/"),
    enabled,
    staleTime: 20_000,
  });
}

export function useUpdateNutritionProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<NutritionProfile>) =>
      apiPatch<Partial<NutritionProfile>, NutritionProfile>("/nutrition/profile/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all });
    },
  });
}

export function useCreateNutritionEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: NutritionEntryPayload) =>
      apiPost<NutritionEntryPayload, NutritionEntry>("/nutrition/entries/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all });
    },
  });
}

export function useUpdateNutritionEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<NutritionEntryPayload> }) =>
      apiPatch<Partial<NutritionEntryPayload>, NutritionEntry>(
        `/nutrition/entries/${id}/`,
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all });
    },
  });
}

export function useDeleteNutritionEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/nutrition/entries/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all });
    },
  });
}

export function useCopyNutritionMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CopyNutritionMealPayload) =>
      apiPost<CopyNutritionMealPayload, NutritionEntry[]>(
        "/nutrition/entries/copy-meal/",
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all });
    },
  });
}

export function useCopyNutritionDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CopyNutritionDayPayload) =>
      apiPost<CopyNutritionDayPayload, NutritionEntry[]>(
        "/nutrition/entries/copy-day/",
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all });
    },
  });
}

export function useCreateWeightEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WeightEntryPayload) =>
      apiPost<WeightEntryPayload, NutritionWeightEntry>("/nutrition/weights/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all });
    },
  });
}

export function useCreateCustomFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FormData) =>
      apiPostForm<NutritionCustomFood>("/nutrition/custom-foods/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all });
    },
  });
}

export function useSaveMealFromDiary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveMealFromDiaryPayload) =>
      apiPost<SaveMealFromDiaryPayload, NutritionSavedMeal>(
        "/nutrition/saved-meals/save-from-diary/",
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all });
    },
  });
}

export function useLogSavedMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: LogSavedMealPayload }) =>
      apiPost<LogSavedMealPayload, NutritionEntry[]>(
        `/nutrition/saved-meals/${id}/log/`,
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all });
    },
  });
}

export function useCopyNutritionEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CopyNutritionEntriesPayload) =>
      apiPost<CopyNutritionEntriesPayload, NutritionEntry[]>("/nutrition/entries/copy-entries/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all });
    },
  });
}

// Logged days of a month (YYYY-MM) for the diary calendar.
export function useDiaryCalendar(month: string) {
  return useQuery({
    queryKey: nutritionKeys.calendar(month),
    queryFn: () => apiGet<DiaryCalendarMonth>(`/nutrition/entries/calendar/?month=${month}`),
  });
}

export function useNutritionRecipes(enabled = true) {
  return useQuery({
    queryKey: nutritionKeys.recipes(),
    queryFn: () => apiGet<NutritionRecipe[]>("/nutrition/recipes/"),
    enabled,
  });
}

export function useSaveRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id?: number; payload: RecipePayload }) =>
      id
        ? apiPatch<RecipePayload, NutritionRecipe>(`/nutrition/recipes/${id}/`, payload)
        : apiPost<RecipePayload, NutritionRecipe>("/nutrition/recipes/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recipes() });
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/nutrition/recipes/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recipes() });
    },
  });
}

export function useLogRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; entry_date: string; meal_type: string; servings: number }) =>
      apiPost<typeof body, NutritionEntry>(`/nutrition/recipes/${id}/log/`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all });
    },
  });
}

type PhotoBody = { image_base64: string; mime_type: string; mode?: "label" };

// Each scan counts as one AI message.
export function useAnalyzeMealPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<PhotoBody, "mode">) =>
      apiPost<PhotoBody, PhotoAnalysisResponse>("/insight-ai/photo/", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insight-ai"] }),
  });
}

export function useScanNutritionLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<PhotoBody, "mode">) =>
      apiPost<PhotoBody, LabelScanResponse>("/insight-ai/photo/", { ...body, mode: "label" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insight-ai"] }),
  });
}
