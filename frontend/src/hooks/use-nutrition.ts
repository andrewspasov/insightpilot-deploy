import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from "@/lib/api";
import type {
  NutritionCustomFood,
  NutritionEntry,
  NutritionEntryPayload,
  NutritionFoodSearchResponse,
  NutritionInsightsResponse,
  NutritionOverviewResponse,
  NutritionProfile,
  WeightEntryPayload,
  NutritionWeightEntry,
} from "@/types/nutrition";

const nutritionKeys = {
  all: ["nutrition"] as const,
  profile: () => ["nutrition", "profile"] as const,
  overview: (date: string) => ["nutrition", "overview", date] as const,
  search: (query: string) => ["nutrition", "search", query] as const,
  insights: (days: number) => ["nutrition", "insights", days] as const,
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
