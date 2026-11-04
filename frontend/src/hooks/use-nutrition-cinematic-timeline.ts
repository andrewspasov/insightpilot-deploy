import { useEffect, useRef, type RefObject } from "react";

import { createNutritionTimelineController, LAST_NUTRITION_SHOT, sampleNutritionTimeline } from "@/lib/nutrition-cinematic-timeline";
import { createNutritionScrollGesture, nutritionWheelPixels } from "@/lib/nutrition-scene-navigation";

export function useNutritionCinematicTimeline(pageRef: RefObject<HTMLDivElement>, stageIndex: number, onStage: (index: number) => void, motionActive: boolean) {
  const timeline = useRef(createNutritionTimelineController(stageIndex));
  const selectedStage = useRef(stageIndex);
  const gesture = useRef(createNutritionScrollGesture());
  const onStageRef = useRef(onStage);
  const scheduleRef = useRef<(() => void) | null>(null);
  useEffect(() => { onStageRef.current = onStage; }, [onStage]);
  useEffect(() => {
    // Buttons select a destination once; in-between frames never change the selection.
    if (stageIndex !== selectedStage.current) {
      selectedStage.current = stageIndex;
      gesture.current.consume();
      timeline.current.seek(stageIndex);
      scheduleRef.current?.();
    }
  }, [stageIndex]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const controller = timeline.current;
    let frame = 0;
    let lastTime = 0;
    let touch: { x: number; y: number } | null = null;
    const publish = (sample: ReturnType<typeof sampleNutritionTimeline>) => {
      page.style.setProperty("--camera-zoom", String(sample.zoom));
      page.style.setProperty("--camera-shift", `${sample.shift}%`);
      page.style.setProperty("--grid-angle", `${sample.angle}deg`);
      page.style.setProperty("--world-yaw", `${sample.yaw}deg`);
      page.style.setProperty("--world-depth", `${sample.depth}px`);
      page.style.setProperty("--stage-progress", `${(sample.progress + 1) / 6 * 100}%`);
      sample.weights.forEach((weight, index) => page.style.setProperty(`--shot-${index}`, String(weight)));
      page.dataset.scenePosition = String(sample.progress);
      page.dispatchEvent(new Event("nutrition-scene-frame"));
    };
    const render = (time: number) => {
      frame = 0;
      publish(controller.tick(lastTime ? time - lastTime : 16, motionActive));
      lastTime = time;
      if (!controller.settled && !document.hidden) frame = window.requestAnimationFrame(render);
    };
    const schedule = () => {
      if (!motionActive) { publish(controller.tick(0, false)); return; }
      if (!frame && !document.hidden) { lastTime = 0; frame = window.requestAnimationFrame(render); }
    };
    scheduleRef.current = schedule;
    const moveStep = (direction: number) => {
      const next = Math.max(0, Math.min(LAST_NUTRITION_SHOT, selectedStage.current + direction));
      if (next === selectedStage.current) return;
      selectedStage.current = next;
      controller.seek(next);
      onStageRef.current(next);
      schedule();
    };
    const interactive = (target: EventTarget | null) => target instanceof Element && !!target.closest("a, button, input, select, textarea, [contenteditable]:not([contenteditable='false']), [role='slider']");
    const panelCanScroll = (target: EventTarget | null, direction: number) => {
      const panel = target instanceof Element ? target.closest(".n-content") : null;
      return !!panel && panel.scrollHeight > panel.clientHeight + 1 && (direction > 0
        ? panel.scrollTop + panel.clientHeight < panel.scrollHeight - 1 : panel.scrollTop > 1);
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || interactive(event.target) || Math.abs(event.deltaY) <= Math.abs(event.deltaX) * 1.2 || panelCanScroll(event.target, event.deltaY)) return;
      event.preventDefault();
      const direction = gesture.current.push(nutritionWheelPixels(event.deltaY, event.deltaMode, window.innerHeight), performance.now());
      if (direction) moveStep(direction);
    };
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat || interactive(event.target)) return;
      const direction = ["ArrowDown", "PageDown"].includes(event.key) || event.key === " " && !event.shiftKey ? 1
        : ["ArrowUp", "PageUp"].includes(event.key) || event.key === " " && event.shiftKey ? -1 : 0;
      if (!direction || panelCanScroll(event.target, direction)) return;
      event.preventDefault();
      gesture.current.consume();
      moveStep(direction);
    };
    const touchStart = (event: TouchEvent) => {
      touch = event.touches.length === 1 && !interactive(event.target) ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    };
    const touchMove = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1) { touch = null; return; }
      const x = event.touches[0].clientX;
      const y = event.touches[0].clientY;
      const delta = touch.y - y;
      if (panelCanScroll(event.target, delta)) { touch = null; return; }
      if (Math.abs(delta) > 12 && Math.abs(delta) > Math.abs(touch.x - x) * 1.2) event.preventDefault();
    };
    const touchEnd = (event: TouchEvent) => {
      if (touch && event.changedTouches.length === 1) {
        const delta = touch.y - event.changedTouches[0].clientY;
        const horizontal = touch.x - event.changedTouches[0].clientX;
        if (Math.abs(delta) >= 65 && Math.abs(delta) > Math.abs(horizontal) * 1.2) {
          gesture.current.consume();
          moveStep(Math.sign(delta));
        }
      }
      touch = null;
    };
    const cancelTouch = () => { touch = null; };
    const visibility = () => {
      if (document.hidden) { window.cancelAnimationFrame(frame); frame = 0; }
      else schedule();
    };
    page.addEventListener("wheel", wheel, { passive: false });
    page.addEventListener("keydown", key);
    page.addEventListener("touchstart", touchStart, { passive: true });
    page.addEventListener("touchmove", touchMove, { passive: false });
    page.addEventListener("touchend", touchEnd);
    page.addEventListener("touchcancel", cancelTouch);
    document.addEventListener("visibilitychange", visibility);
    publish(controller.tick(0, motionActive));
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      scheduleRef.current = null;
      page.removeEventListener("wheel", wheel);
      page.removeEventListener("keydown", key);
      page.removeEventListener("touchstart", touchStart);
      page.removeEventListener("touchmove", touchMove);
      page.removeEventListener("touchend", touchEnd);
      page.removeEventListener("touchcancel", cancelTouch);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [pageRef, motionActive]);
}
