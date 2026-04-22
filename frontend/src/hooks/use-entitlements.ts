import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type {
  BillingPassActionResponse,
  BillingPassesResponse,
  BillingOrderDetail,
  BillingSummary,
  BillingTool,
} from "@/types/billing";

export function useEntitlements() {
  return useQuery<BillingSummary>({
    queryKey: ["billing-summary"],
    queryFn: () => apiGet<BillingSummary>("/billing/summary/"),
    staleTime: 30_000,
  });
}

export function useToolAccess(toolKey: string) {
  const query = useEntitlements();
  const tool: BillingTool | undefined = query.data?.tools.find(
    (item) => item.key === toolKey,
  );

  return {
    ...query,
    tool,
    hasAccess: Boolean(tool?.entitled),
    isReadOnly: query.data?.is_read_only ?? false,
    status: query.data?.status,
  };
}

export function useAccessPasses() {
  return useQuery<BillingPassesResponse>({
    queryKey: ["billing-passes"],
    queryFn: () => apiGet<BillingPassesResponse>("/billing/passes/"),
    staleTime: 30_000,
  });
}

export function useBillingOrder(orderId: string | number | undefined) {
  return useQuery<BillingOrderDetail>({
    queryKey: ["billing-order", orderId],
    queryFn: () => apiGet<BillingOrderDetail>(`/billing/orders/${orderId}/`),
    enabled: Boolean(orderId),
    staleTime: 30_000,
  });
}

type ChangePassInput = {
  target_pass_key: string;
  selected_tool_keys: string[];
  effective_mode: "immediate" | "next_cycle";
};

type CreateSubscriptionInput = {
  target_pass_key: string;
};

type SelectToolsInput = {
  selected_tool_keys: string[];
};

export function useChangePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChangePassInput) =>
      apiPost<ChangePassInput, BillingPassActionResponse>("/billing/change-pass/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
    },
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSubscriptionInput) =>
      apiPost<CreateSubscriptionInput, BillingPassActionResponse>(
        "/billing/create-subscription/",
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
    },
  });
}

export function useSelectTools() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SelectToolsInput) =>
      apiPost<SelectToolsInput, any>("/billing/select-tools/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
    },
  });
}
