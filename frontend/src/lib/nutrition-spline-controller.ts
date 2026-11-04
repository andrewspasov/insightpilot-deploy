import type { Application, SPEObject } from "@splinetool/runtime";

// The same public scene used by UI/frontend/src/components/SplineSceneDemo.tsx.
export const NUTRITION_SPLINE_SCENE = "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode";
export type SplineStatus = "loading" | "ready" | "fallback";

type RobotPose = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number; scale: number };

// Offsets from the exported Bot group's transform, not from its individual parts.
const ROBOT_POSES: readonly RobotPose[] = [
  { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 0.93 },
  { x: -30, y: 1, z: 0, yaw: -0.42, pitch: 0.025, roll: -0.015, scale: 0.96 },
  { x: 18, y: -4, z: 12, yaw: 0.32, pitch: -0.025, roll: 0.01, scale: 1 },
  { x: -20, y: 3, z: 0, yaw: -0.28, pitch: 0.02, roll: -0.02, scale: 0.96 },
  { x: 24, y: 6, z: -8, yaw: 0.46, pitch: 0, roll: 0.015, scale: 0.94 },
  { x: 0, y: 0, z: 4, yaw: -0.08, pitch: 0, roll: 0, scale: 0.98 },
];
const poseKeys = Object.keys(ROBOT_POSES[0]) as (keyof RobotPose)[];
const boundPosition = (position: number) => Math.max(0, Math.min(5, Number.isFinite(position) ? position : 0));

export function sampleNutritionRobotPose(position: number): RobotPose {
  const progress = boundPosition(position);
  const lower = Math.floor(progress);
  const start = ROBOT_POSES[lower];
  const end = ROBOT_POSES[Math.min(5, lower + 1)];
  const amount = progress - lower;
  const eased = amount * amount * (3 - 2 * amount);
  const pose = { ...start };
  poseKeys.forEach(key => { pose[key] += (end[key] - start[key]) * eased; });
  return pose;
}

export function easeNutritionRobotPose(current: RobotPose, target: RobotPose, elapsed: number) {
  const delta = Number.isFinite(elapsed) ? Math.max(0, Math.min(64, elapsed)) : 16;
  const amount = 1 - Math.exp(-delta / 190);
  const pose = { ...current };
  poseKeys.forEach(key => {
    const difference = target[key] - current[key];
    pose[key] = Math.abs(difference) < 0.0001 ? target[key] : current[key] + difference * amount;
  });
  return pose;
}

export function nutritionSplineZoom(position: number) {
  const progress = boundPosition(position);
  return 0.27 + progress * 0.015;
}

export function createNutritionSplineController(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  initial: { position: number; motionActive: boolean },
  onStatus: (status: SplineStatus) => void,
  loadRuntime = () => import("@splinetool/runtime"),
) {
  let app: Application | null = null;
  let ready = false;
  let disposed = false;
  let failed = false;
  let position = initial.position;
  let motionActive = initial.motionActive;
  let stopFrame = 0;
  let poseFrame = 0;
  let poseTime = 0;
  let bot: SPEObject | undefined;
  let base: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } } | undefined;
  let currentPose = sampleNutritionRobotPose(position);
  let globalEvents = false;
  const abort = new AbortController();
  const cancelPose = () => {
    window.cancelAnimationFrame(poseFrame);
    poseFrame = 0;
    poseTime = 0;
  };
  const release = () => {
    cancelPose();
    window.cancelAnimationFrame(stopFrame);
    stopFrame = 0;
    app?.dispose();
    app = null;
    bot = undefined;
    base = undefined;
  };
  const fail = () => {
    if (disposed || failed) return;
    failed = true;
    ready = false;
    abort.abort();
    release();
    onStatus("fallback");
  };
  const applyPose = (pose: RobotPose) => {
    if (!bot || !base) return;
    bot.position.x = base.position.x + pose.x;
    bot.position.y = base.position.y + pose.y;
    bot.position.z = base.position.z + pose.z;
    bot.rotation.x = base.rotation.x + pose.pitch;
    bot.rotation.y = base.rotation.y + pose.yaw;
    bot.rotation.z = base.rotation.z + pose.roll;
    bot.scale.x = base.scale.x * pose.scale;
    bot.scale.y = base.scale.y * pose.scale;
    bot.scale.z = base.scale.z * pose.scale;
  };
  const animatePose = (time: number) => {
    poseFrame = 0;
    if (!app || !ready || disposed || failed || !motionActive || document.hidden) return;
    const target = sampleNutritionRobotPose(position);
    currentPose = easeNutritionRobotPose(currentPose, target, poseTime ? time - poseTime : 16);
    poseTime = time;
    applyPose(currentPose);
    app.requestRender();
    if (poseKeys.some(key => currentPose[key] !== target[key])) poseFrame = window.requestAnimationFrame(animatePose);
    else poseTime = 0;
  };
  const schedulePose = () => {
    if (!poseFrame && bot && ready && motionActive && !document.hidden) poseFrame = window.requestAnimationFrame(animatePose);
  };
  const updateMotion = () => {
    if (!app || !ready || disposed || failed) return;
    window.cancelAnimationFrame(stopFrame);
    stopFrame = 0;
    // The scene's authored LookAt events smoothly track both head and upper body.
    // Only enable global cursor tracking for a real mouse, never touch scrolling.
    const trackPointer = motionActive && !document.hidden && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (trackPointer !== globalEvents) { app.setGlobalEvents(trackPointer); globalEvents = trackPointer; }
    if (document.hidden) { cancelPose(); app.stop(); return; }
    app.play();
    app.setZoom(nutritionSplineZoom(position));
    app.requestRender();
    if (motionActive) schedulePose();
    else {
      cancelPose();
      currentPose = sampleNutritionRobotPose(position);
      applyPose(currentPose);
      // Allow one updated still frame when changing chapters while paused.
      stopFrame = window.requestAnimationFrame(() => { app?.stop(); stopFrame = 0; });
    }
  };
  const resize = () => {
    if (!app || !ready) return;
    const { width, height } = container.getBoundingClientRect();
    if (width > 0 && height > 0) app.setSize(width, height);
    updateMotion();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  const contextLost = (event: Event) => { event.preventDefault(); fail(); };
  canvas.addEventListener("webglcontextlost", contextLost);
  document.addEventListener("visibilitychange", updateMotion);
  const timeout = window.setTimeout(fail, 30000);

  const loaded = (async () => {
    try {
      const { Application: SplineApplication } = await loadRuntime();
      if (disposed || failed) return;
      const application = new SplineApplication(canvas, { renderMode: "auto" });
      app = application;
      await application.load(NUTRITION_SPLINE_SCENE, undefined, { signal: abort.signal });
      if (disposed || failed || !app) { application.dispose(); return; }
      app.setGlobalEvents(false);
      app.setBackgroundColor("rgba(0, 0, 0, 0)");
      bot = app.findObjectByName("Bot");
      if (bot) {
        base = {
          position: { x: bot.position.x, y: bot.position.y, z: bot.position.z },
          rotation: { x: bot.rotation.x, y: bot.rotation.y, z: bot.rotation.z },
          scale: { x: bot.scale.x, y: bot.scale.y, z: bot.scale.z },
        };
        currentPose = sampleNutritionRobotPose(position);
        applyPose(currentPose);
      }
      ready = true;
      resize();
      onStatus("ready");
    } catch { fail(); }
    finally { window.clearTimeout(timeout); }
  })();

  return {
    loaded,
    setPosition(next: number) { position = next; updateMotion(); },
    setMotion(active: boolean) { motionActive = active; updateMotion(); },
    dispose() {
      disposed = true;
      abort.abort();
      window.clearTimeout(timeout);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", updateMotion);
      release();
    },
  };
}
