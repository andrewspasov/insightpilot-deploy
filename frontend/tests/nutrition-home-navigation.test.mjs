import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(file, require, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  runInNewContext(outputText, { exports, require, ...globals });
  return exports;
}
const navigation = load("lib/nutrition-scene-navigation.ts");

test("wheel deltas accumulate, reverse intent resets, and invalid values do not navigate", () => {
  const gesture = navigation.createNutritionScrollGesture();
  for (const delta of [NaN, Infinity, -Infinity, 0, 0.1]) assert.equal(gesture.push(delta, 0), 0);
  assert.equal(gesture.push(24, 0), 0);
  assert.equal(gesture.push(-24, 30), 0);
  assert.equal(gesture.push(-24, 60), -1);
});

test("one continuous trackpad gesture advances once, even beyond the transition cooldown", () => {
  const gesture = navigation.createNutritionScrollGesture();
  assert.equal(gesture.push(120, 0), 1);
  for (let time = 100; time < 2500; time += 100) assert.equal(gesture.push(120, time), 0);
  assert.equal(gesture.push(120, 2800), 1);
});

test("fresh gestures and deliberate reversals respond without a long cooldown", () => {
  const gesture = navigation.createNutritionScrollGesture();
  assert.equal(gesture.push(120, 0), 1);
  assert.equal(gesture.push(120, 220), 1);
  assert.equal(gesture.push(-120, 250), -1);
  assert.equal(gesture.push(-120, 300), 0);
});

test("tiny opposite-direction jitter does not reverse a consumed gesture", () => {
  const gesture = navigation.createNutritionScrollGesture();
  assert.equal(gesture.push(120, 0), 1);
  assert.equal(gesture.push(-5, 30), 0);
  assert.equal(gesture.push(-10, 60), 0);
  assert.equal(gesture.push(20, 90), 0);
  assert.equal(gesture.push(-24, 120), 0);
  assert.equal(gesture.push(-24, 150), -1);
});

test("manual navigation consumes leftover wheel input without blocking the next gesture", () => {
  const gesture = navigation.createNutritionScrollGesture();
  assert.equal(gesture.push(24, 0), 0);
  gesture.consume();
  assert.equal(gesture.push(120, 50), 0);
  assert.equal(gesture.push(120, 300), 1);
});

test("pixel, line and page wheel modes use consistent distances", () => {
  assert.equal(navigation.nutritionWheelPixels(5, 0, 800), 5);
  assert.equal(navigation.nutritionWheelPixels(5, 1, 800), 80);
  assert.equal(navigation.nutritionWheelPixels(1, 2, 800), 800);
});

function harness() {
  const events = new Map();
  const effects = [];
  const moves = [];
  let now = 0;
  class Element {
    constructor({ interactive = false, panel = null } = {}) { this.interactive = interactive; this.panel = panel; }
    closest(selector) { return selector === ".n-content" ? this.panel : this.interactive ? this : null; }
  }
  const page = {
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name) => events.delete(name),
  };
  const react = { useRef: (value) => ({ current: value }), useEffect: (effect) => effects.push(effect) };
  const hook = load("hooks/use-nutrition-scene-navigation.ts", (name) => name === "react" ? react : navigation, {
    Element, window: { innerHeight: 800 }, performance: { now: () => now },
  });
  hook.useNutritionSceneNavigation({ current: page }, (...args) => moves.push(args));
  const cleanups = effects.map((effect) => effect());
  return {
    events, moves, Element,
    fire: (name, data = {}, time = 0) => {
      now = time;
      const event = { target: new Element(), ctrlKey: false, metaKey: false, altKey: false, repeat: false, defaultPrevented: false, deltaX: 0, deltaY: 120, deltaMode: 0, preventDefault() { this.defaultPrevented = true; }, ...data };
      events.get(name)?.(event);
      return event;
    },
    cleanup: () => cleanups.reverse().forEach((cleanup) => cleanup?.()),
  };
}

test("vertical wheels advance without moving keyboard focus", () => {
  const h = harness();
  assert.equal(h.fire("wheel").defaultPrevented, true);
  assert.deepEqual(h.moves, [[1, false]]);
  h.cleanup();
});

test("pinch zoom, horizontal gestures and form controls are never intercepted", () => {
  const h = harness();
  for (const data of [{ ctrlKey: true }, { metaKey: true }, { deltaX: 200 }, { target: new h.Element({ interactive: true }) }]) {
    assert.equal(h.fire("wheel", data).defaultPrevented, false);
  }
  assert.equal(h.moves.length, 0);
  h.cleanup();
});

test("overflowing text scrolls normally until the panel's directional boundary", () => {
  const h = harness();
  const panel = { scrollHeight: 900, clientHeight: 400, scrollTop: 100 };
  const target = new h.Element({ panel });
  assert.equal(h.fire("wheel", { target }).defaultPrevented, false);
  assert.equal(h.fire("wheel", { target, deltaY: -120 }).defaultPrevented, false);
  assert.equal(h.moves.length, 0);
  panel.scrollTop = 500;
  assert.equal(h.fire("wheel", { target }, 500).defaultPrevented, true);
  assert.deepEqual(h.moves, [[1, false]]);
  h.cleanup();
});

test("keyboard navigation focuses the next heading but ignores edits and repeats", () => {
  const h = harness();
  h.fire("keydown", { key: "PageDown" });
  h.fire("keydown", { key: " ", shiftKey: true });
  h.fire("keydown", { key: "ArrowDown", repeat: true });
  h.fire("keydown", { key: "ArrowDown", target: new h.Element({ interactive: true }) });
  assert.deepEqual(h.moves, [[1, true], [-1, true]]);
  h.cleanup();
});

test("vertical touch swipes advance, horizontal swipes and multi-touch do not", () => {
  const h = harness();
  h.fire("touchstart", { touches: [{ clientX: 10, clientY: 200 }] });
  assert.equal(h.fire("touchmove", { touches: [{ clientX: 12, clientY: 100 }] }).defaultPrevented, true);
  h.fire("touchend", { changedTouches: [{ clientX: 12, clientY: 100 }] });
  h.fire("touchstart", { touches: [{ clientX: 10, clientY: 200 }] });
  h.fire("touchend", { changedTouches: [{ clientX: 200, clientY: 180 }] });
  h.fire("touchstart", { touches: [{ clientX: 10, clientY: 200 }, { clientX: 20, clientY: 200 }] });
  h.fire("touchend", { changedTouches: [{ clientX: 10, clientY: 0 }] });
  assert.deepEqual(h.moves, [[1, false]]);
  h.cleanup();
});

test("touch scrolling inside the text panel and cancellation do not change chapters", () => {
  const h = harness();
  const target = new h.Element({ panel: { scrollHeight: 900, clientHeight: 400, scrollTop: 100 } });
  h.fire("touchstart", { target, touches: [{ clientX: 10, clientY: 200 }] });
  assert.equal(h.fire("touchmove", { target, touches: [{ clientX: 10, clientY: 100 }] }).defaultPrevented, false);
  h.fire("touchend", { target, changedTouches: [{ clientX: 10, clientY: 100 }] });
  h.fire("touchstart", { touches: [{ clientX: 10, clientY: 200 }] });
  h.fire("touchcancel");
  h.fire("touchend", { changedTouches: [{ clientX: 10, clientY: 100 }] });
  assert.equal(h.moves.length, 0);
  h.cleanup();
});

test("unmounting removes every wheel, keyboard and touch listener", () => {
  const h = harness();
  assert.equal(h.events.size, 6);
  h.cleanup();
  assert.equal(h.events.size, 0);
});
