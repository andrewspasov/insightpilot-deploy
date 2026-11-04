import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost } from "@/lib/api";
import type { PlanPace } from "@/types/plans";
import type {
  InsightAIActionResponse,
  InsightAIChatRequest,
  InsightAIChatResponse,
  InsightAILoggingStatus,
  InsightAIStatus,
} from "@/types/insight-ai";

const insightAIKeys = {
  status: ["insight-ai", "status"] as const,
};

export function useInsightAIStatus() {
  return useQuery<InsightAIStatus>({
    queryKey: insightAIKeys.status,
    queryFn: () => apiGet<InsightAIStatus>("/insight-ai/status/"),
    staleTime: 15_000,
  });
}

export function useInsightAIChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InsightAIChatRequest) =>
      apiPost<InsightAIChatRequest, InsightAIChatResponse>("/insight-ai/chat/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insightAIKeys.status });
    },
  });
}

export function useConfirmInsightAIAction() {
  const queryClient = useQueryClient();
  return useMutation({
    // Plan cards confirm with the chosen pace; meal logs confirm with no options.
    mutationFn: ({ actionId, options }: { actionId: number; options?: { pace?: PlanPace } }) =>
      apiPost<{ pace?: PlanPace }, InsightAIActionResponse>(
        `/insight-ai/actions/${actionId}/confirm/`,
        options ?? {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insightAIKeys.status });
      queryClient.invalidateQueries({ queryKey: ["nutrition"] });
    },
  });
}

export function useCancelInsightAIAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actionId: number) =>
      apiPost<Record<string, never>, InsightAIActionResponse>(
        `/insight-ai/actions/${actionId}/cancel/`,
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insightAIKeys.status });
    },
  });
}

// Under the "nutrition" key so logging anything refreshes it.
export function useLoggingStatus() {
  return useQuery<InsightAILoggingStatus>({
    queryKey: ["nutrition", "logging-status"],
    queryFn: () => apiGet<InsightAILoggingStatus>("/insight-ai/logging-status/"),
    staleTime: 60_000,
  });
}

export function useEmailDailyReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (date?: string) =>
      apiPost<{ date?: string }, { sent_to: string }>("/insight-ai/daily-report/", date ? { date } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insightAIKeys.status });
    },
  });
}
