import { useEffect, useRef, useState } from "react";

export function useNutritionHomeMotion() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const motionActive = motionEnabled && !reducedMotion;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page || !motionActive) return;
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const update = () => {
      frame = 0;
      page.style.setProperty("--pointer-x", `${pointerX * 6}deg`);
      page.style.setProperty("--pointer-y", `${pointerY * -4}deg`);
    };
    const schedule = () => {
      if (!frame && !document.hidden) frame = window.requestAnimationFrame(update);
    };
    const resetPointer = () => { pointerX = 0; pointerY = 0; schedule(); };
    const movePointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const bounds = page.getBoundingClientRect();
      const bounded = (value: number) => Math.max(-0.5, Math.min(0.5, value));
      pointerX = bounded((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5);
      pointerY = bounded((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5);
      schedule();
    };
    const visibilityChanged = () => {
      page.dataset.hidden = String(document.hidden);
      if (document.hidden) { window.cancelAnimationFrame(frame); frame = 0; }
      else resetPointer();
    };

    page.addEventListener("pointermove", movePointer, { passive: true });
    page.addEventListener("pointerleave", resetPointer);
    document.addEventListener("visibilitychange", visibilityChanged);
    visibilityChanged();
    return () => {
      window.cancelAnimationFrame(frame);
      page.removeEventListener("pointermove", movePointer);
      page.removeEventListener("pointerleave", resetPointer);
      document.removeEventListener("visibilitychange", visibilityChanged);
      delete page.dataset.hidden;
      ["--pointer-x", "--pointer-y"].forEach((property) => page.style.removeProperty(property));
    };
  }, [motionActive]);

  return { pageRef, motionActive, reducedMotion, toggleMotion: () => setMotionEnabled((enabled) => !enabled) };
}
