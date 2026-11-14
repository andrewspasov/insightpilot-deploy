import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost } from "@/lib/api";

export type AppNotification = {
  id: number;
  kind: "welcome" | "security" | "payment" | "payment_failed" | "pass" | "tools" | "report" | string;
  title: string;
  body: string;
  link: string;
  created_at: string;
  read: boolean;
};

type NotificationsResponse = { unread_count: number; notifications: AppNotification[] };

// Checked every minute while the app is open, so new ones can pop up.
export function useNotifications() {
  return useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: () => apiGet<NotificationsResponse>("/notifications/"),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { ids?: number[]; all?: boolean }) =>
      apiPost<typeof payload, { marked: number }>("/notifications/read/", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
