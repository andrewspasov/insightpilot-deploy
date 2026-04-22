import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isAuthenticated, logout } from "@/lib/auth";

const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const MIN_RESET_INTERVAL_MS = 1000; // avoid resetting on every mousemove tick

type UseIdleLogoutOptions = {
  timeoutMs?: number;
};

export function useIdleLogout(options: UseIdleLogoutOptions = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const navigate = useNavigate();
  const location = useLocation();

  const logoutTimerIdRef = useRef<number | null>(null);
  const lastResetAtRef = useRef<number>(0);

  const clearLogoutTimer = useCallback(() => {
    if (logoutTimerIdRef.current !== null) {
      window.clearTimeout(logoutTimerIdRef.current);
      logoutTimerIdRef.current = null;
    }
  }, []);

  const scheduleLogout = useCallback(() => {
    clearLogoutTimer();

    logoutTimerIdRef.current = window.setTimeout(() => {
      logout();
      navigate("/login", { replace: true, state: { from: location, reason: "idle" } });
    }, timeoutMs);
  }, [clearLogoutTimer, location, navigate, timeoutMs]);

  const resetIdleTimer = useCallback(() => {
    if (!isAuthenticated()) return;

    const now = Date.now();
    if (now - lastResetAtRef.current < MIN_RESET_INTERVAL_MS) return;
    lastResetAtRef.current = now;

    scheduleLogout();
  }, [scheduleLogout]);

  useEffect(() => {
    resetIdleTimer();

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "focus",
    ];

    const handleActivity = () => resetIdleTimer();
    events.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") resetIdleTimer();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearLogoutTimer();
      events.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearLogoutTimer, resetIdleTimer]);
}

