export const ROBOT_VIEWS = ["profile-left", "left", "frontal", "front", "right", "profile-right"] as const;
export type RobotView = typeof ROBOT_VIEWS[number];
export const ROBOT_ASSETS: Record<RobotView, string> = {
  "profile-left": "/nutrition-scene/robot-profile-left-v2.png",
  left: "/nutrition-scene/robot-left.png",
  frontal: "/nutrition-scene/robot-frontal-v2.png",
  front: "/nutrition-scene/robot-front.png",
  right: "/nutrition-scene/robot-right.png",
  "profile-right": "/nutrition-scene/robot-profile-right-v2.png",
};

type NutritionStage = {
  id: string; label: string; kicker: string; title: string; accent: string;
  description: string; detailLabel: string; detail: string; next: string; signal: string;
  view: RobotView; zoom: number; shift: number; angle: number; cameraYaw: number; cameraPitch: number;
};

export const NUTRITION_STAGES: readonly NutritionStage[] = [
  {
    id: "intro", label: "Introduction", kicker: "MEET YOUR CO-PILOT", title: "Every bite.", accent: "A new perspective.",
    description: "Step into your nutrition. A clearer food diary, live macros, and a little less guesswork. Explore at your own pace.",
    detailLabel: "MISSION 01", detail: "Understand your everyday.", next: "Explore the diary", signal: "COMPANION ONLINE",
    view: "profile-left", zoom: 0.64, shift: 0, angle: -8, cameraYaw: -0.18, cameraPitch: 0.1,
  },
  {
    id: "diary", label: "Food diary", kicker: "YOUR DAY, IN FOCUS", title: "Real food.", accent: "One clear picture.",
    description: "Find your food. Choose your meal. See calories and macros come together across breakfast, lunch, dinner, and snacks.",
    detailLabel: "FOOD INTELLIGENCE", detail: "USDA search + your custom foods.", next: "Try a portion", signal: "DIARY INTERFACE READY",
    view: "left", zoom: 0.73, shift: 2, angle: 7, cameraYaw: 0.5, cameraPitch: 0.05,
  },
  {
    id: "portions", label: "Portions & macros", kicker: "LIVE PORTION LAB", title: "Your portion.", accent: "Your numbers.",
    description: "Change the amount below. Watch every macro respond before anything is logged.",
    detailLabel: "LIVE DEMO", detail: "Flexible portions. Instant feedback.", next: "Make it repeatable", signal: "PORTION SCAN ACTIVE",
    view: "frontal", zoom: 0.8, shift: -3, angle: -15, cameraYaw: -0.55, cameraPitch: 0.13,
  },
  {
    id: "meals", label: "Saved meals", kicker: "LESS REPETITION", title: "Your usual.", accent: "Without the effort.",
    description: "Save your go-to meals. Copy food entries from any date. Keep the routine, skip the repetitive logging.",
    detailLabel: "RECALL SYSTEM", detail: "Saved meals. Any day, again.", next: "See your progress", signal: "MEAL RECALL CONNECTED",
    view: "front", zoom: 0.87, shift: 1, angle: 12, cameraYaw: 0.16, cameraPitch: -0.03,
  },
  {
    id: "progress", label: "Progress", kicker: "THE BIGGER PICTURE", title: "Small habits.", accent: "More perspective.",
    description: "Explore calorie and macro trends. Log weight if you want to. See patterns over time, not just a single day.",
    detailLabel: "YOUR DIRECTION", detail: "Daily clarity. Long-term insights.", next: "Enter your workspace", signal: "PROGRESS VIEW CONNECTED",
    view: "right", zoom: 0.93, shift: -1, angle: -5, cameraYaw: -0.65, cameraPitch: 0.08,
  },
  {
    id: "start", label: "Start tracking", kicker: "READY WHEN YOU ARE", title: "Your everyday.", accent: "Upgraded.",
    description: "Make this your own. Open your diary or create an InsightPilot account to begin your nutrition journey.",
    detailLabel: "ONE PLATFORM", detail: "InsightPilot. Your nutrition workspace.", next: "Start tracking", signal: "YOUR NEXT MOVE",
    view: "profile-right", zoom: 1, shift: 0, angle: 0, cameraYaw: 0.32, cameraPitch: 0.02,
  },
];

export function moveNutritionStage(index: number, direction: number) {
  const next = index + direction;
  return Number.isFinite(next) ? Math.max(0, Math.min(NUTRITION_STAGES.length - 1, Math.trunc(next))) : 0;
}

// Keep a loaded view visible while the requested angle downloads, or if it fails.
export function resolveRobotView(preferred: RobotView, loaded: readonly RobotView[]): RobotView | null {
  if (loaded.includes(preferred)) return preferred;
  return ROBOT_VIEWS.find((view) => loaded.includes(view)) ?? null;
}
