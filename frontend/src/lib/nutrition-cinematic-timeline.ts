import { NUTRITION_STAGES } from "./nutrition-experience";

export const LAST_NUTRITION_SHOT = NUTRITION_STAGES.length - 1;
const bounded = (value: number) => Math.max(0, Math.min(LAST_NUTRITION_SHOT, Number.isFinite(value) ? value : 0));

export function sampleNutritionTimeline(position: number) {
  const progress = bounded(position);
  const lower = Math.floor(progress);
  const upper = Math.min(LAST_NUTRITION_SHOT, lower + 1);
  const amount = progress - lower;
  const fade = amount * amount * (3 - 2 * amount);
  const weights = NUTRITION_STAGES.map(() => 0);
  weights[lower] = 1 - fade;
  if (upper !== lower) weights[upper] = fade;
  const start = NUTRITION_STAGES[lower];
  const end = NUTRITION_STAGES[upper];
  const interpolate = (a: number, b: number) => a + (b - a) * amount;
  return {
    progress, stageIndex: Math.round(progress), weights,
    zoom: interpolate(start.zoom, end.zoom), shift: interpolate(start.shift, end.shift),
    angle: interpolate(start.angle, end.angle), yaw: (progress / LAST_NUTRITION_SHOT - 0.5) * 24,
    depth: progress * 42,
  };
}

export function createNutritionTimelineController(initial = 0) {
  let current = bounded(initial);
  let target = current;
  return {
    get position() { return current; },
    get target() { return target; },
    get settled() { return Math.abs(target - current) < 0.0005; },
    seek(value: number) { target = bounded(value); },
    nudge(pixels: number) { if (Number.isFinite(pixels)) target = bounded(target + pixels / 650); },
    tick(milliseconds: number, animate: boolean) {
      const elapsed = Number.isFinite(milliseconds) ? Math.max(0, Math.min(64, milliseconds)) : 16;
      current = animate ? current + (target - current) * (1 - Math.exp(-elapsed / 130)) : target;
      if (Math.abs(target - current) < 0.0005) current = target;
      return sampleNutritionTimeline(current);
    },
  };
}
