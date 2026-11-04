import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(file, globals = {}, modules = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../src/${file}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const require = (name) => modules[name] ?? load(name.startsWith("@/") ? name.slice(2) : `lib/${name.replace("./", "")}`, globals, modules, cache);
  runInNewContext(outputText, { exports, require, Float32Array, ...globals });
  return exports;
}
const timeline = load("lib/nutrition-cinematic-timeline");

test("six angle weights blend continuously, sum to one, and retain full-body framing", () => {
  for (let progress = 0; progress <= 5; progress += 0.03125) {
    const sample = timeline.sampleNutritionTimeline(progress);
    assert.ok(Math.abs(sample.weights.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(sample.weights.every((weight) => weight >= 0 && weight <= 1));
    assert.ok(sample.weights.filter((weight) => weight > 0).length <= 2);
    assert.ok(sample.zoom >= 0.64 && sample.zoom <= 1);
    assert.ok(Math.abs(sample.shift) <= 3);
  }
  assert.equal(timeline.sampleNutritionTimeline(5).weights[5], 1);
  const middle = timeline.sampleNutritionTimeline(2.5);
  assert.equal(middle.weights[2], 0.5);
  assert.equal(middle.weights[3], 0.5);
});

test("the visual timeline eases toward a selected chapter instead of jumping", () => {
  const controller = timeline.createNutritionTimelineController();
  controller.seek(1);
  assert.equal(controller.target, 1);
  const sample = controller.tick(16, true);
  assert.ok(sample.progress > 0 && sample.progress < 1);
  assert.equal(sample.stageIndex, 0);
  controller.seek(3);
  const next = controller.tick(16, true);
  assert.ok(next.progress > sample.progress && next.progress < 3);
});

test("pause snaps directly, reverse scrolling works, and invalid or excess input is bounded", () => {
  const controller = timeline.createNutritionTimelineController();
  controller.seek(3);
  assert.equal(controller.tick(0, false).progress, 3);
  controller.nudge(-650);
  assert.equal(controller.tick(0, false).progress, 2);
  controller.nudge(Infinity);
  assert.equal(controller.target, 2);
  controller.seek(100);
  assert.equal(controller.tick(0, false).progress, 5);
  controller.seek(-100);
  assert.equal(controller.tick(0, false).progress, 0);
  assert.equal(timeline.sampleNutritionTimeline(NaN).progress, 0);
});

test("camera easing converges without overshoot or frame-rate dependent jumps", () => {
  const controller = timeline.createNutritionTimelineController();
  controller.seek(5);
  let previous = 0;
  for (let step = 0; step < 200; step++) {
    const sample = controller.tick(16, true);
    assert.ok(sample.progress >= previous && sample.progress <= 5);
    previous = sample.progress;
  }
  assert.equal(controller.position, 5);
  assert.equal(controller.settled, true);
});

function hookHarness({ motion = true } = {}) {
  const effects = [], refs = [];
  const frames = new Map();
  const events = new Map();
  const documentEvents = new Map();
  const styles = new Map();
  const chapters = [];
  let now = 0;
  let frameId = 0;
  let publishedFrames = 0;
  let refIndex = 0, effectIndex = 0, stage = 0, dirty = false;
  class Element {
    constructor({ interactive = false, panel = null } = {}) { this.interactive = interactive; this.panel = panel; }
    closest(selector) { return selector === ".n-content" ? this.panel : this.interactive ? this : null; }
  }
  const page = {
    dataset: {}, style: { setProperty: (name, value) => styles.set(name, value) },
    dispatchEvent: () => publishedFrames++,
    addEventListener: (name, callback) => events.set(name, callback), removeEventListener: (name) => events.delete(name),
  };
  const document = { hidden: false, addEventListener: (name, callback) => documentEvents.set(name, callback), removeEventListener: (name) => documentEvents.delete(name) };
  const window = { innerHeight: 800, requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame: (id) => frames.delete(id) };
  const react = {
    useRef: value => refs[refIndex++] ??= { current: value },
    useEffect: (effect, deps) => {
      const index = effectIndex++;
      const previous = effects[index];
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) effects[index] = { effect, deps, cleanup: previous?.cleanup, pending: true };
    },
  };
  const hook = load("hooks/use-nutrition-cinematic-timeline", { Element, Event: class {}, window, document, performance: { now: () => now } }, { react });
  const pageRef = { current: page };
  const onStage = index => { chapters.push(index); stage = index; dirty = true; };
  const render = () => {
    dirty = false; refIndex = 0; effectIndex = 0;
    hook.useNutritionCinematicTimeline(pageRef, stage, onStage, motion);
    for (const entry of effects) {
      if (entry.pending) { entry.pending = false; entry.cleanup?.(); entry.cleanup = entry.effect(); }
    }
  };
  render();
  return {
    page, styles, chapters, frames, events, Element, documentEvents,
    emit(name, options = {}) {
      const event = { target: new Element(), ctrlKey: false, metaKey: false, altKey: false, repeat: false, deltaX: 0, deltaY: 130, deltaMode: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...options };
      events.get(name)?.(event); if (dirty) render(); return event;
    },
    flush(count = 1) { for (let index = 0; index < count; index++) { now += 16; const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(now)); if (dirty) render(); } },
    advance(milliseconds) { now += milliseconds; },
    select(index) { stage = index; render(); },
    motion(active) { motion = active; render(); },
    get stage() { return stage; },
    hidden(value) { document.hidden = value; documentEvents.get("visibilitychange")?.(); },
    get publishedFrames() { return publishedFrames; },
    cleanup: () => [...effects].reverse().forEach((entry) => entry.cleanup?.()),
  };
}

test("one scroll selects exactly one chapter while the visual timeline still eases", () => {
  const h = hookHarness();
  h.flush();
  h.emit("wheel");
  assert.equal(h.stage, 1);
  assert.deepEqual(h.chapters, [1]);
  h.flush();
  assert.ok(Number(h.page.dataset.scenePosition) > 0 && Number(h.page.dataset.scenePosition) < 1);
  h.flush(200);
  assert.equal(Number(h.page.dataset.scenePosition), 1);
  assert.equal(Number(h.styles.get("--shot-0")), 0);
  assert.equal(Number(h.styles.get("--shot-1")), 1);
  assert.deepEqual(h.chapters, [1]);
  assert.equal(h.frames.size, 0);
  h.emit("wheel", { deltaY: 650 });
  h.flush(200);
  assert.deepEqual(h.chapters, [1, 2]);
  assert.equal(Number(h.page.dataset.scenePosition), 2);
  h.emit("wheel", { deltaY: -650 });
  h.flush(200);
  assert.deepEqual(h.chapters, [1, 2, 1]);
  h.cleanup();
});

test("one long momentum tail cannot skip chapters, but a reverse gesture responds immediately", () => {
  const h = hookHarness();
  h.emit("wheel", { deltaY: 1800 });
  for (let index = 0; index < 25; index++) {
    h.advance(60); h.emit("wheel", { deltaY: 120 }); h.flush();
  }
  assert.deepEqual(h.chapters, [1]);
  h.emit("wheel", { deltaY: -120 }); h.flush(200);
  assert.deepEqual(h.chapters, [1, 0]);
  assert.equal(Number(h.page.dataset.scenePosition), 0);
  h.cleanup();
});

test("small deltas accumulate into a complete step, not a stranded fractional pose", () => {
  const h = hookHarness({ motion: false });
  h.emit("wheel", { deltaY: 24 });
  assert.equal(h.stage, 0); assert.equal(Number(h.page.dataset.scenePosition), 0);
  h.emit("wheel", { deltaY: 24 });
  assert.equal(h.stage, 1); assert.equal(Number(h.page.dataset.scenePosition), 1);
  h.cleanup();
});

test("button jumps never republish intermediate chapters or fight the selected destination", () => {
  const h = hookHarness();
  h.select(5); h.flush(12);
  assert.equal(h.stage, 5);
  assert.deepEqual(h.chapters, []);
  h.select(1); h.flush(200);
  assert.equal(h.stage, 1); assert.equal(Number(h.page.dataset.scenePosition), 1);
  assert.deepEqual(h.chapters, []);
  h.cleanup();
});

test("clicking a step during wheel momentum retains the click until a fresh gesture", () => {
  const h = hookHarness();
  h.emit("wheel"); h.flush(); h.select(4);
  h.emit("wheel"); h.flush(200);
  assert.equal(h.stage, 4); assert.equal(Number(h.page.dataset.scenePosition), 4);
  assert.deepEqual(h.chapters, [1]);
  h.emit("wheel"); h.flush(200);
  assert.deepEqual(h.chapters, [1, 5]);
  h.cleanup();
});

test("pausing midway settles at the selected step without rewinding its label", () => {
  const h = hookHarness();
  h.emit("wheel"); h.flush(2); h.motion(false);
  assert.equal(h.stage, 1); assert.equal(Number(h.page.dataset.scenePosition), 1);
  assert.equal(h.frames.size, 0); assert.deepEqual(h.chapters, [1]);
  h.cleanup();
});

test("scrolling is bounded at the first and last chapters in both directions", () => {
  const h = hookHarness({ motion: false });
  h.emit("wheel", { deltaY: -120 });
  assert.equal(h.stage, 0);
  h.select(5); h.advance(250); h.emit("wheel");
  assert.equal(h.stage, 5);
  assert.equal(h.chapters.length, 0);
  h.emit("wheel", { deltaY: -120 });
  assert.equal(h.stage, 4); assert.deepEqual(h.chapters, [4]);
  h.cleanup();
});

test("reduced motion still supports direct scrolling and keyboard navigation with no RAF loop", () => {
  const h = hookHarness({ motion: false });
  h.emit("wheel", { deltaY: 650 });
  assert.equal(Number(h.page.dataset.scenePosition), 1);
  h.emit("keydown", { key: "PageDown" });
  assert.equal(Number(h.page.dataset.scenePosition), 2);
  h.emit("keydown", { key: " ", shiftKey: true });
  assert.equal(Number(h.page.dataset.scenePosition), 1);
  assert.equal(h.frames.size, 0);
  h.cleanup();
});

test("step navigation preserves form controls, pinch zoom, horizontal gestures and text scrolling", () => {
  const h = hookHarness();
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { deltaX: 200 }, { target: new h.Element({ interactive: true }) }, { target: new h.Element({ panel: { scrollTop: 100, scrollHeight: 900, clientHeight: 400 } }) }]) {
    assert.equal(h.emit("wheel", options).defaultPrevented, false);
  }
  h.flush(200);
  assert.equal(Number(h.page.dataset.scenePosition), 0);
  h.cleanup();
});

test("one touch swipe selects one step only on release; cancelled gestures never navigate", () => {
  const h = hookHarness({ motion: false });
  h.emit("touchstart", { touches: [{ clientX: 10, clientY: 400 }] });
  h.emit("touchmove", { touches: [{ clientX: 10, clientY: 300 }] });
  assert.equal(Number(h.page.dataset.scenePosition), 0);
  h.emit("touchmove", { touches: [{ clientX: 10, clientY: 200 }] });
  h.emit("touchend", { changedTouches: [{ clientX: 10, clientY: 200 }] });
  assert.equal(Number(h.page.dataset.scenePosition), 1);
  const position = h.page.dataset.scenePosition;
  h.emit("touchcancel");
  h.emit("touchmove", { touches: [{ clientX: 10, clientY: 200 }] });
  assert.equal(h.page.dataset.scenePosition, position);
  h.emit("touchstart", { touches: [{ clientX: 10, clientY: 300 }] });
  h.emit("touchmove", { touches: [{ clientX: 170, clientY: 280 }] });
  h.emit("touchend", { changedTouches: [{ clientX: 170, clientY: 280 }] });
  assert.equal(h.page.dataset.scenePosition, position);
  h.emit("touchstart", { touches: [{ clientX: 10, clientY: 200 }, { clientX: 20, clientY: 200 }] });
  h.emit("touchmove", { touches: [{ clientX: 10, clientY: 100 }] });
  assert.equal(h.page.dataset.scenePosition, position);
  h.cleanup();
});

test("hidden tabs suspend timeline work and unmount clears every scheduled frame and event", () => {
  const h = hookHarness();
  h.emit("wheel", { deltaY: 650 });
  h.hidden(true);
  assert.equal(h.frames.size, 0);
  h.hidden(false);
  assert.equal(h.frames.size, 1);
  h.cleanup();
  for (const collection of [h.frames, h.events, h.documentEvents]) assert.equal(collection.size, 0);
});

test("the spatial field has deterministic finite particles and actual 3D orbital lines", () => {
  const { buildNutritionSpatialField } = load("lib/nutrition-spatial-renderer");
  const first = buildNutritionSpatialField();
  const second = buildNutritionSpatialField();
  assert.equal(first.particleCount, 1100);
  assert.equal(first.lineCount, 960);
  assert.equal(first.vertices.length, 7 * (1100 + 960));
  assert.ok(first.vertices.every(Number.isFinite));
  assert.deepEqual(first.vertices, second.vertices);
});
