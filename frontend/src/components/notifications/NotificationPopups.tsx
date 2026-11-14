import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { ToastAction } from "@/components/ui/toast";
import { useMarkNotificationsRead, useNotifications } from "@/hooks/use-notifications";
import { useToast } from "@/hooks/use-toast";

const SEEN_KEY = "notifications-last-popped-id";

function readSeen(): number | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw === null ? null : Number(raw) || 0;
  } catch {
    return null;
  }
}

function writeSeen(id: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    // Private mode etc.: pop-ups may repeat after a reload, nothing worse.
  }
}

/**
 * Pops up notifications that arrive while the app is open (checked every
 * minute). On the very first visit nothing pops up; the list is on the
 * Notifications page.
 */
export function NotificationPopups() {
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const { toast } = useToast();
  const navigate = useNavigate();
  const seenRef = useRef<number | null>(readSeen());

  useEffect(() => {
    const items = data?.notifications;
    if (!items) return;
    const newest = items.reduce((max, n) => Math.max(max, n.id), 0);
    if (seenRef.current === null) {
      seenRef.current = newest;
      writeSeen(newest);
      return;
    }
    const fresh = items.filter((n) => n.id > (seenRef.current ?? 0) && !n.read).slice(0, 3).reverse();
    fresh.forEach((n) =>
      toast({
        title: n.title,
        description: n.body || undefined,
        variant: n.kind === "payment_failed" ? "destructive" : "default",
        action: n.link ? (
          <ToastAction
            altText="Open"
            onClick={() => {
              markRead.mutate({ ids: [n.id] });
              navigate(n.link);
            }}
          >
            Open
          </ToastAction>
        ) : undefined,
      }),
    );
    if (newest > (seenRef.current ?? 0)) {
      seenRef.current = newest;
      writeSeen(newest);
    }
  }, [data?.notifications, markRead, navigate, toast]);

  return null;
}
