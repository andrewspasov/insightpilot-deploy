import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Maximize2, X } from "lucide-react";

import { CoachMascot } from "./CoachMascot";

const CoachPanelChat = lazy(() => import("./CoachPanelChat"));

// Whether the bubble shows: a setting saved in the browser, plus "hidden until
// the page is reloaded" after a swipe.
const ENABLED_KEY = "coach-bubble-enabled";
let hiddenThisVisit = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function readEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setCoachBubbleEnabled(value: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, value ? "1" : "0");
  } catch {
    // The setting just won't persist.
  }
  if (value) hiddenThisVisit = false;
  notify();
}

export function useCoachBubbleEnabled() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return readEnabled();
}

const SWIPE_AWAY = 70;

// The coach floats in the corner of every nutrition page except the AI page:
// tap to open a chat panel, swipe sideways to hide it.
export function CoachBubble() {
  const enabled = useCoachBubbleEnabled();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState(false);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const close = () => {
    if (!open || closing) return;
    setClosing(true);
    timers.current.push(window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 300));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!enabled || pathname.startsWith("/tools/nutrition/ai")) return null;

  const hide = () => {
    hiddenThisVisit = true;
    setToast(true);
    notify();
    timers.current.push(window.setTimeout(() => setToast(false), 4500));
  };

  return (
    <>
      {!hiddenThisVisit && !open && (
        <button
          type="button"
          aria-label="Open the AI coach. Drag left or right to hide it."
          className="fixed bottom-6 right-6 z-40 cursor-grab touch-none rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          style={{
            transform: `translateX(${dx}px)`,
            opacity: Math.max(0, 1 - Math.abs(dx) / 200),
            transition: dragging ? "none" : "transform .3s ease, opacity .3s ease",
          }}
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const next = event.clientX - drag.current.x;
            if (Math.abs(next) > 6) drag.current.moved = true;
            setDx(next);
          }}
          onPointerUp={() => {
            setDragging(false);
            if (Math.abs(dx) > SWIPE_AWAY) {
              setDx(dx > 0 ? 260 : -520);
              timers.current.push(window.setTimeout(() => {
                hide();
                setDx(0);
              }, 280));
            } else {
              setDx(0);
            }
          }}
          onClick={() => {
            if (drag.current?.moved) {
              drag.current = null;
              return;
            }
            drag.current = null;
            setOpen(true);
          }}
        >
          <CoachMascot size={56} ring={false} />
        </button>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-violet-400/50 bg-card px-4 py-2 shadow-[0_0_20px_rgba(139,92,246,0.35)]"
        >
          <span className="text-sm">Coach hidden until you reload</span>
          <button
            type="button"
            className="rounded-lg bg-violet-400/20 px-3 py-1.5 text-sm text-violet-200"
            onClick={() => {
              hiddenThisVisit = false;
              setToast(false);
              notify();
            }}
          >
            Undo
          </button>
        </div>
      )}

      {open && (
        <>
          <button
            type="button"
            aria-label="Close the coach"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[3px]"
            style={{ animation: `${closing ? "fadeOutBackdrop" : "fadeInBackdrop"} .3s ease both` }}
            onClick={close}
          />
          <div
            role="dialog"
            aria-label="AI coach"
            className="fixed bottom-6 right-4 z-50 flex h-[min(640px,75vh)] w-[min(420px,calc(100vw-2rem))] origin-bottom-right flex-col overflow-hidden rounded-3xl border border-violet-400/60 bg-card shadow-[0_0_40px_rgba(139,92,246,0.45),0_0_80px_rgba(34,211,238,0.15)]"
            style={{ animation: `${closing ? "neon-shrink-out .3s ease-in" : "neon-grow-in .42s cubic-bezier(.2,.9,.2,1.05)"} both` }}
          >
            <div className="flex items-center gap-3 border-b border-violet-400/30 px-4 py-3">
              <CoachMascot size={30} ring={false} />
              <span className="flex-1 text-lg font-bold">Coach</span>
              <Link
                to="/tools/nutrition/ai"
                onClick={() => setOpen(false)}
                aria-label="Open the full chat"
                className="rounded-full p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
              <button type="button" aria-label="Close" onClick={close} className="rounded-full border border-border p-2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
                <CoachPanelChat />
              </Suspense>
            </div>
          </div>
        </>
      )}
    </>
  );
}
