import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/nutrition-spline-controller.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});

function setup({ failure = false, pending = false, finePointer = true, missingBot = false } = {}) {
  const frames = new Map(), timers = new Map(), events = new Map(), calls = [];
  let id = 0, clock = 0, finishLoad, beginLoad;
  const loadStarted = new Promise(resolve => { beginLoad = resolve; });
  const canvas = { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  const doc = { hidden: false, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  let resize, disconnected = false;
  class ResizeObserver {
    constructor(fn) { resize = fn; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const exports = {};
  runInNewContext(outputText, { exports, AbortController, ResizeObserver, document: doc, window: {
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: key => frames.delete(key),
    setTimeout: fn => { timers.set(++id, fn); return id; },
    clearTimeout: key => timers.delete(key),
    matchMedia: () => ({ matches: finePointer }),
  } });
  const bot = {
    position: { x: 10, y: 20, z: 30 },
    rotation: { x: 0.1, y: 0.2, z: 0.3 },
    scale: { x: 1.1, y: 0.9, z: 1 },
  };
  class Application {
    constructor() { calls.push(["create"]); }
    async load(url, variables, options) {
      calls.push(["load", url, options.signal]);
      beginLoad();
      if (failure) throw new Error("Network failure");
      if (pending) await new Promise(resolve => { finishLoad = resolve; });
    }
    setGlobalEvents(value) { calls.push(["globalEvents", value]); }
    findObjectByName(name) { calls.push(["find", name]); return missingBot ? undefined : bot; }
    setBackgroundColor(value) { calls.push(["background", value]); }
    setZoom(value) { calls.push(["zoom", value]); }
    setSize(w, h) { calls.push(["size", w, h]); }
    play() { calls.push(["play"]); }
    stop() { calls.push(["stop"]); }
    requestRender() { calls.push(["render"]); }
    dispose() { calls.push(["dispose"]); }
  }
  const statuses = [];
  const controller = exports.createNutritionSplineController(canvas,
    { getBoundingClientRect: () => ({ width: 640, height: 480 }) },
    { position: 0, motionActive: true }, status => statuses.push(status), async () => ({ Application }));
  return { exports, controller, statuses, calls, events, frames, timers, doc, loadStarted, bot,
    resize: () => resize(), disconnected: () => disconnected,
    finishLoad: () => finishLoad(), flush: (elapsed = 16) => { clock += elapsed; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(clock)); },
  };
}

test("Spline uses the exact UI scene and enables its authored head tracking for mouse input", async () => {
  const h = setup(); await h.controller.loaded;
  assert.deepEqual(h.statuses, ["ready"]);
  assert.equal(h.calls.find(c => c[0] === "load")[1], "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode");
  assert.equal(h.calls.filter(c => c[0] === "globalEvents").at(-1)[1], true);
  assert.ok(h.calls.some(c => c[0] === "find" && c[1] === "Bot"));
  assert.ok(h.calls.some(c => c[0] === "background" && c[1] === "rgba(0, 0, 0, 0)"));
  assert.ok(h.calls.some(c => c[0] === "size" && c[1] === 640 && c[2] === 480));
  assert.equal(h.timers.size, 0);
  h.controller.dispose();
});

test("chapter zoom is bounded and is updated on the real runtime", async () => {
  const h = setup(); await h.controller.loaded;
  assert.equal(h.exports.nutritionSplineZoom(-5), h.exports.nutritionSplineZoom(0));
  assert.equal(h.exports.nutritionSplineZoom(Infinity), h.exports.nutritionSplineZoom(0));
  assert.equal(h.exports.nutritionSplineZoom(99), h.exports.nutritionSplineZoom(5));
  h.controller.setPosition(2.5);
  assert.equal(h.calls.filter(c => c[0] === "zoom").at(-1)[1], h.exports.nutritionSplineZoom(2.5));
  h.controller.dispose();
});

test("pause permits one still frame, hidden tabs stop and motion resumes when requested", async () => {
  const h = setup(); await h.controller.loaded;
  h.controller.setMotion(false); assert.equal(h.frames.size, 1); h.flush();
  assert.equal(h.calls.at(-1)[0], "stop");
  h.controller.setPosition(3); h.flush(); assert.equal(h.calls.at(-1)[0], "stop");
  h.doc.hidden = true; h.events.get("visibilitychange")(); assert.equal(h.calls.at(-1)[0], "stop");
  h.doc.hidden = false; h.controller.setMotion(true);
  assert.ok(h.calls.slice(-3).some(c => c[0] === "play"));
  h.flush();
  assert.equal(h.frames.size, 0);
  h.controller.dispose();
});

test("load errors, timeouts and context loss request a retryable fallback without throwing", async () => {
  const error = setup({ failure: true }); await error.controller.loaded;
  assert.deepEqual(error.statuses, ["fallback"]); error.controller.dispose();
  const timeout = setup({ pending: true }); await timeout.loadStarted;
  [...timeout.timers.values()][0](); assert.deepEqual(timeout.statuses, ["fallback"]);
  timeout.finishLoad(); await timeout.controller.loaded;
  assert.equal(timeout.statuses.includes("ready"), false); timeout.controller.dispose();
  const context = setup(); await context.controller.loaded;
  context.events.get("webglcontextlost")({ preventDefault() {} });
  assert.equal(context.statuses.at(-1), "fallback"); context.controller.dispose();
});

test("unmount aborts pending loading and releases observers, listeners, timers and GPU resources", async () => {
  const h = setup({ pending: true }); await h.loadStarted;
  const signal = h.calls.find(c => c[0] === "load")[2];
  h.controller.dispose();
  assert.equal(signal.aborted, true);
  assert.equal(h.disconnected(), true);
  assert.equal(h.events.size, 0); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
  h.finishLoad(); await h.controller.loaded;
  assert.equal(h.statuses.length, 0);
  assert.ok(h.calls.some(c => c[0] === "dispose"));
});

test("all six chapter poses differ, stay bounded, and interpolate continuously", async () => {
  const h = setup(); await h.controller.loaded;
  const sample = h.exports.sampleNutritionRobotPose;
  const poses = Array.from({ length: 6 }, (_, index) => sample(index));
  assert.equal(new Set(poses.map(pose => JSON.stringify(pose))).size, 6);
  for (let position = -1; position <= 6; position += 0.025) {
    const pose = sample(position);
    for (const value of Object.values(pose)) assert.equal(Number.isFinite(value), true);
    assert.ok(Math.abs(pose.x) <= 30 && Math.abs(pose.yaw) <= 0.46);
    assert.ok(pose.scale >= 0.93 && pose.scale <= 1);
  }
  for (const invalid of [NaN, Infinity, -Infinity]) assert.equal(JSON.stringify(sample(invalid)), JSON.stringify(poses[0]));
  assert.equal(JSON.stringify(sample(99)), JSON.stringify(poses[5]));
  const before = sample(2 - 1e-5), after = sample(2 + 1e-5);
  for (const key of Object.keys(before)) assert.ok(Math.abs(before[key] - after[key]) < 1e-5);
  h.controller.dispose();
});

test("pose easing is frame-rate independent, reverses cleanly, and never overshoots", async () => {
  const h = setup(); await h.controller.loaded;
  const sample = h.exports.sampleNutritionRobotPose, ease = h.exports.easeNutritionRobotPose;
  const start = sample(0), target = sample(1);
  let slow = start, fast = start;
  for (let i = 0; i < 30; i++) slow = ease(slow, target, 1000 / 30);
  for (let i = 0; i < 120; i++) fast = ease(fast, target, 1000 / 120);
  for (const key of Object.keys(start)) {
    assert.ok(Math.abs(slow[key] - fast[key]) < 1e-8);
    assert.ok(slow[key] >= Math.min(start[key], target[key]) && slow[key] <= Math.max(start[key], target[key]));
  }
  const reversed = ease(slow, start, 16);
  assert.ok(Math.abs(reversed.yaw) < Math.abs(slow.yaw));
  h.controller.dispose();
});

test("chapter changes animate the real Bot transform instead of a CSS image wrapper", async () => {
  const h = setup(); await h.controller.loaded; h.flush();
  const initialX = h.bot.position.x, initialYaw = h.bot.rotation.y;
  h.controller.setPosition(1);
  assert.equal(h.bot.position.x, initialX);
  h.flush();
  assert.ok(h.bot.position.x < initialX && h.bot.position.x > -20);
  assert.ok(h.bot.rotation.y < initialYaw);
  for (let i = 0; i < 250 && h.frames.size; i++) h.flush();
  assert.ok(Math.abs(h.bot.position.x - (-20)) < 1e-4);
  assert.ok(Math.abs(h.bot.rotation.y - (-0.22)) < 1e-4);
  assert.equal(h.frames.size, 0);
  h.controller.dispose();
});

test("touch never enables global cursor tracking and paused chapters update without tweening", async () => {
  const h = setup({ finePointer: false }); await h.controller.loaded;
  assert.equal(h.calls.some(c => c[0] === "globalEvents" && c[1] === true), false);
  h.controller.setMotion(false); h.flush();
  h.controller.setPosition(2);
  assert.equal(h.bot.position.x, 28);
  assert.equal(h.bot.position.y, 16);
  assert.equal(h.bot.position.z, 42);
  assert.equal(h.bot.scale.z, 1);
  h.flush(); assert.equal(h.frames.size, 0);
  h.controller.dispose();
});

test("pausing and hidden tabs disable cursor tracking, and unmount cancels pose transitions", async () => {
  const h = setup(); await h.controller.loaded;
  h.controller.setPosition(4); h.flush();
  h.controller.setMotion(false);
  assert.equal(h.calls.filter(c => c[0] === "globalEvents").at(-1)[1], false);
  h.flush();
  h.controller.setMotion(true);
  assert.equal(h.calls.filter(c => c[0] === "globalEvents").at(-1)[1], true);
  h.doc.hidden = true; h.events.get("visibilitychange")();
  assert.equal(h.calls.filter(c => c[0] === "globalEvents").at(-1)[1], false);
  assert.equal(h.frames.size, 0);
  h.doc.hidden = false; h.events.get("visibilitychange")();
  h.controller.setPosition(0);
  h.controller.dispose();
  assert.equal(h.frames.size, 0); assert.equal(h.events.size, 0);
});

test("missing optional Bot group leaves the scene and nutrition controls operational", async () => {
  const h = setup({ missingBot: true }); await h.controller.loaded;
  assert.deepEqual(h.statuses, ["ready"]);
  h.controller.setPosition(3); assert.equal(h.frames.size, 0);
  h.controller.dispose();
});

test("the Spline component follows timeline frames only, not competing React step targets", () => {
  const componentSource = readFileSync(new URL("../src/components/nutrition/NutritionSplineRobot.tsx", import.meta.url), "utf8");
  const { outputText: componentCode } = ts.transpileModule(componentSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  const refs = [], effects = [], events = new Map(), positions = [], initial = [];
  let refIndex = 0, effectIndex = 0, disposed = false;
  const react = {
    useRef: value => refs[refIndex++] ??= { current: value },
    useState: value => [value, () => {}],
    useEffect(effect, deps) {
      const index = effectIndex++, previous = effects[index];
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) effects[index] = { effect, deps, cleanup: previous?.cleanup, pending: true };
    },
  };
  const page = { dataset: { scenePosition: "0.45" }, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  const pageRef = { current: page };
  const exports = {};
  runInNewContext(componentCode, { exports, require: name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === "lucide-react") return { RotateCcw: () => null };
    if (name.endsWith("NutritionRobotCinematic")) return { default: () => null };
    if (name.endsWith("nutrition-spline-controller")) return {
      createNutritionSplineController: (canvas, container, options) => {
        initial.push(options.position);
        return { setPosition: value => positions.push(value), setMotion() {}, dispose() { disposed = true; } };
      },
    };
    throw new Error(`Unexpected module: ${name}`);
  } });
  const render = stageIndex => {
    refIndex = 0; effectIndex = 0;
    exports.default({ stageIndex, motionActive: true, pageRef });
    refs[0].current ??= {};
    refs[1].current ??= {};
    for (const entry of effects) if (entry.pending) { entry.pending = false; entry.cleanup?.(); entry.cleanup = entry.effect(); }
  };
  render(1);
  assert.deepEqual(initial, [0.45]);
  page.dataset.scenePosition = "0.6";
  render(2);
  assert.deepEqual(positions, []);
  events.get("nutrition-scene-frame")();
  assert.deepEqual(positions, [0.6]);
  [...effects].reverse().forEach(entry => entry.cleanup?.());
  assert.equal(disposed, true); assert.equal(events.size, 0);
});
