import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useLoggingStatus } from "@/hooks/use-insight-ai";
import { getTodayIsoDate } from "@/lib/nutrition";

const SHOWN_KEY = "insight-ai-nudge-shown-on";

function shownToday(today: string) {
  try {
    return localStorage.getItem(SHOWN_KEY) === today;
  } catch {
    return false;
  }
}

// The AI coach checks in, at most once a day, when nothing has been logged
// for a couple of days.
export function CoachNudgeDialog() {
  const { data } = useLoggingStatus();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const today = getTodayIsoDate();
    if (!data?.show_nudge || shownToday(today)) return;
    try {
      localStorage.setItem(SHOWN_KEY, today);
    } catch {
      // Without storage the pop-up may show again on reload; that's fine.
    }
    setOpen(true);
  }, [data?.show_nudge]);

  if (!data?.show_nudge) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{data.title}</AlertDialogTitle>
          <AlertDialogDescription>{data.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>Later</AlertDialogCancel>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              navigate("/tools/nutrition/ai", {
                state: { prefill: "I haven't logged for a few days. Help me get back on track today." },
              });
            }}
          >
            Ask the coach
          </Button>
          <AlertDialogAction onClick={() => navigate("/tools/nutrition/logs")}>Log food</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
