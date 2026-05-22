import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost } from "@/lib/api";
import type {
  InsightAIChatRequest,
  InsightAIChatResponse,
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
