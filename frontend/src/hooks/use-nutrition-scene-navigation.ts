import { useEffect, useRef, type RefObject } from "react";

import { createNutritionScrollGesture, nutritionWheelPixels } from "@/lib/nutrition-scene-navigation";

export function useNutritionSceneNavigation(pageRef: RefObject<HTMLDivElement>, move: (direction: number, focus?: boolean) => void) {
  const moveRef = useRef(move);
  useEffect(() => { moveRef.current = move; }, [move]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const gesture = createNutritionScrollGesture();
    let touchStart: { x: number; y: number } | null = null;
    const element = (target: EventTarget | null) => target instanceof Element ? target : null;
    const interactive = (target: EventTarget | null) => !!element(target)?.closest("a, button, input, select, textarea, [contenteditable]:not([contenteditable='false']), [role='slider']");
    const panelCanScroll = (target: EventTarget | null, direction: number) => {
      const panel = element(target)?.closest(".n-content");
      return !!panel && panel.scrollHeight > panel.clientHeight + 1 && (direction > 0
        ? panel.scrollTop + panel.clientHeight < panel.scrollHeight - 1 : panel.scrollTop > 1);
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || interactive(event.target) || Math.abs(event.deltaY) <= Math.abs(event.deltaX) * 1.2) return;
      if (panelCanScroll(event.target, event.deltaY)) return;
      event.preventDefault();
      const direction = gesture.push(nutritionWheelPixels(event.deltaY, event.deltaMode, window.innerHeight), performance.now());
      if (direction) moveRef.current(direction, false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat || interactive(event.target)) return;
      const direction = ["ArrowDown", "PageDown"].includes(event.key) || event.key === " " && !event.shiftKey ? 1
        : ["ArrowUp", "PageUp"].includes(event.key) || event.key === " " && event.shiftKey ? -1 : 0;
      if (!direction || panelCanScroll(event.target, direction)) return;
      event.preventDefault();
      moveRef.current(direction, true);
    };
    const touch = (event: TouchEvent) => {
      touchStart = !interactive(event.target) && event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    };
    const touchMove = (event: TouchEvent) => {
      if (!touchStart || event.touches.length !== 1) { touchStart = null; return; }
      const dy = touchStart.y - event.touches[0].clientY;
      const dx = touchStart.x - event.touches[0].clientX;
      if (panelCanScroll(event.target, dy)) { touchStart = null; return; }
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.2) event.preventDefault();
    };
    const touchEnd = (event: TouchEvent) => {
      if (touchStart && event.changedTouches.length === 1) {
        const dy = touchStart.y - event.changedTouches[0].clientY;
        const dx = touchStart.x - event.changedTouches[0].clientX;
        if (Math.abs(dy) > 65 && Math.abs(dy) > Math.abs(dx) * 1.2) moveRef.current(Math.sign(dy), false);
      }
      touchStart = null;
    };
    const cancelTouch = () => { touchStart = null; };
    page.addEventListener("wheel", wheel, { passive: false });
    page.addEventListener("keydown", key);
    page.addEventListener("touchstart", touch, { passive: true });
    page.addEventListener("touchmove", touchMove, { passive: false });
    page.addEventListener("touchend", touchEnd, { passive: true });
    page.addEventListener("touchcancel", cancelTouch);
    return () => {
      page.removeEventListener("wheel", wheel);
      page.removeEventListener("keydown", key);
      page.removeEventListener("touchstart", touch);
      page.removeEventListener("touchmove", touchMove);
      page.removeEventListener("touchend", touchEnd);
      page.removeEventListener("touchcancel", cancelTouch);
    };
  }, [pageRef]);
}
