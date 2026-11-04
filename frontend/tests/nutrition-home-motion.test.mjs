import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/hooks/use-nutrition-home-motion.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});

function motionHarness({ reduced = false, enabled = true, hidden = false } = {}) {
  const effects = [];
  const frames = new Map();
  const styles = new Map();
  const pageEvents = new Map();
  const documentEvents = new Map();
  const preferenceEvents = new Map();
  let frameId = 0;
  let stateCalls = 0;
  const page = {
    dataset: {},
    style: { setProperty: (name, value) => styles.set(name, value), removeProperty: (name) => styles.delete(name) },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1440, height: 900 }),
    addEventListener: (name, callback) => pageEvents.set(name, callback),
    removeEventListener: (name) => pageEvents.delete(name),
  };
  const preference = {
    matches: reduced,
    addEventListener: (name, callback) => preferenceEvents.set(name, callback),
    removeEventListener: (name) => preferenceEvents.delete(name),
  };
  const window = {
    matchMedia: () => preference,
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  const document = {
    hidden,
    addEventListener: (name, callback) => documentEvents.set(name, callback),
    removeEventListener: (name) => documentEvents.delete(name),
  };
  const react = {
    useRef: () => ({ current: page }),
    useState: (initial) => [stateCalls++ === 0 ? enabled : typeof initial === "function" ? initial() : initial, () => {}],
    useEffect: (effect) => effects.push(effect),
  };
  const exports = {};
  runInNewContext(outputText, { exports, require: () => react, window, document });
  const result = exports.useNutritionHomeMotion();
  const cleanups = effects.map((effect) => effect());
  return {
    result, frames, styles, pageEvents, documentEvents, preferenceEvents, page,
    move: (clientX, clientY, pointerType = "mouse") => pageEvents.get("pointermove")?.({ clientX, clientY, pointerType }),
    flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback()); },
    visibility: (value) => { document.hidden = value; documentEvents.get("visibilitychange")?.(); },
    cleanup: () => cleanups.reverse().forEach((cleanup) => cleanup?.()),
  };
}

test("pointer movement is RAF-throttled and bounded without a scroll listener", () => {
  const h = motionHarness();
  h.move(1440, 450);
  h.move(5000, 450);
  assert.equal(h.frames.size, 1);
  assert.equal(h.pageEvents.has("scroll"), false);
  h.flush();
  assert.equal(h.styles.get("--pointer-x"), "3deg");
  assert.equal(h.styles.get("--pointer-y"), "0deg");
  h.cleanup();
});

test("touch does not trigger mouse parallax and leaving resets the camera", () => {
  const h = motionHarness();
  h.flush();
  h.move(1400, 20, "touch");
  assert.equal(h.frames.size, 0);
  h.move(1440, 0);
  h.flush();
  assert.equal(h.styles.get("--pointer-y"), "2deg");
  h.pageEvents.get("pointerleave")();
  h.flush();
  assert.equal(h.styles.get("--pointer-x"), "0deg");
  assert.equal(h.styles.get("--pointer-y"), "0deg");
  h.cleanup();
});

test("hidden tabs cancel queued frames and pause environment animations", () => {
  const h = motionHarness();
  h.visibility(true);
  assert.equal(h.frames.size, 0);
  assert.equal(h.page.dataset.hidden, "true");
  h.move(100, 100);
  assert.equal(h.frames.size, 0);
  h.visibility(false);
  assert.equal(h.frames.size, 1);
  h.flush();
  assert.equal(h.styles.get("--pointer-x"), "0deg");
  h.cleanup();
});

test("unmounting removes pointer, visibility and preference listeners and CSS transforms", () => {
  const h = motionHarness();
  h.flush();
  h.move(50, 100);
  h.cleanup();
  for (const collection of [h.frames, h.styles, h.pageEvents, h.documentEvents, h.preferenceEvents]) assert.equal(collection.size, 0);
  assert.equal(h.page.dataset.hidden, undefined);
});

test("reduced motion and manual pause install no animation listeners", () => {
  for (const options of [{ reduced: true }, { enabled: false }]) {
    const h = motionHarness(options);
    assert.equal(h.result.motionActive, false);
    assert.equal(h.frames.size, 0);
    assert.equal(h.pageEvents.size, 0);
    assert.equal(h.documentEvents.size, 0);
    h.cleanup();
  }
});
