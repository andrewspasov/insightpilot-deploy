import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { kindStyle } from "@/components/notifications/notificationKinds";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMarkNotificationsRead, useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

export default function Notifications() {
  const { data, isLoading, isError } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();
  const items = data?.notifications ?? [];
  const unread = data?.unread_count ?? 0;

  const open = (n: AppNotification) => {
    if (!n.read) markRead.mutate({ ids: [n.id] });
    if (n.link) navigate(n.link);
  };

  return (
    <div className="space-y-6 animate-in">
      <PageHeader
        title="Notifications"
        description="Payments, pass changes, reports and account updates."
        icon={Bell}
        action={
          <Button variant="outline" onClick={() => markRead.mutate({ all: true })} disabled={!unread || markRead.isPending}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark all as read
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading notifications…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Couldn't load notifications. Reload the page to try again.</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No notifications yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Payments, pass changes, reports and account updates will show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {items.map((n) => {
              const { icon: Icon, tone } = kindStyle(n.kind);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => open(n)}
                  className={cn(
                    "flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    !n.read && "bg-primary/[0.06]",
                  )}
                >
                  <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn("font-medium", !n.read && "text-foreground")}>{n.title}</span>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" aria-label="Unread" />}
                    </span>
                    {n.body && <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
