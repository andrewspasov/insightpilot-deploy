import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../src/", import.meta.url);

// Render each state offline. This checks markup/handlers, not browser layout or animation.
function renderStage(stageIndex = 0, { spline = "ready" } = {}) {
  let stateCalls = 0;
  let currentStage = stageIndex;
  const links = [];
  const mockedReact = {
    ...React,
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useState: (initial) => {
      const call = stateCalls++;
      const value = call === 0 ? currentStage : initial === "loading" ? spline : typeof initial === "function" ? initial() : initial;
      return [value, (next) => { if (call === 0) currentStage = typeof next === "function" ? next(currentStage) : next; }];
    },
  };
  const cache = new Map();
  const load = (file) => {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const { outputText } = ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    });
    const moduleRequire = (name) => {
      if (name === "react") return mockedReact;
      if (name.endsWith(".css")) return {};
      if (name === "@/hooks/use-nutrition-home-motion") return {
        useNutritionHomeMotion: () => ({ pageRef: { current: null }, motionActive: false, reducedMotion: false, toggleMotion: () => {} }),
      };
      if (name === "@/hooks/use-nutrition-cinematic-timeline") return { useNutritionCinematicTimeline: () => {} };
      if (name === "react-router-dom") return {
        Link: ({ to, state, children, ...props }) => {
          links.push({ to, state });
          return React.createElement("a", { ...props, href: to }, children);
        },
      };
      if (name.startsWith("@/")) {
        const file = `${name.slice(2)}.ts`;
        return load(existsSync(new URL(file, root)) ? file : `${file}x`);
      }
      return require(name);
    };
    runInNewContext(outputText, { exports, require: moduleRequire });
    return exports;
  };
  const page = load("pages/NutritionHome.tsx").default();
  const html = renderToStaticMarkup(page);
  const nodes = [];
  const visit = (node) => {
    if (!React.isValidElement(node)) return;
    nodes.push(node);
    React.Children.forEach(node.props.children, visit);
  };
  visit(page);
  return { html, links, nodes, currentStage: () => currentStage };
}

test("all stages render one main scene and six step controls, not stacked sections", () => {
  for (let index = 0; index < 6; index++) {
    const { html } = renderStage(index);
    assert.equal((html.match(/<main\b/g) ?? []).length, 1);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.equal((html.match(/<section\b/g) ?? []).length, 0);
    assert.equal((html.match(/aria-label="Step \d:/g) ?? []).length, 6);
    assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
    assert.ok(html.includes(`Step ${index + 1} of 6`));
  }
});

test("primary actions, robot hotspots, back, direct steps and restart navigate correctly", () => {
  const h = renderStage(1);
  const find = (name) => h.nodes.find((node) => node.type === "button" && node.props.className === name);
  find("n-primary").props.onClick();
  assert.equal(h.currentStage(), 2);
  find("n-hotspot").props.onClick();
  assert.equal(h.currentStage(), 3);
  find("n-back").props.onClick();
  assert.equal(h.currentStage(), 2);
  h.nodes.find((node) => node.props["aria-label"] === "Step 6: Start tracking").props.onClick();
  assert.equal(h.currentStage(), 5);
  h.nodes.find((node) => node.props["aria-label"] === "Restart experience").props.onClick();
  assert.equal(h.currentStage(), 0);
});

test("login, signup and diary connections preserve the nutrition destination", () => {
  const h = renderStage(5);
  for (const path of ["/login", "/signup"]) {
    const link = h.links.find((item) => item.to === path);
    assert.equal(link.state.from.pathname, "/tools/nutrition/logs");
  }
  assert.ok(h.links.some((item) => item.to === "/tools/nutrition/logs"));
  assert.ok(h.links.some((item) => item.to === "/"));
  assert.equal(h.nodes.some((node) => node.props.className === "n-hotspot"), false);
});

test("the portion stage displays quantity, units and all four live totals", () => {
  const { html } = renderStage(2);
  for (const label of ["Sample food", "Quantity", "Unit", "Calories", "Protein", "Carbs", "Fat", "247.5", "46.5", "5.4"]) assert.ok(html.includes(label), label);
  assert.ok(html.includes("Grams (g)"));
  assert.ok(html.includes("Ounces (oz)"));
  assert.ok(html.includes("Nothing is logged"));
});

test("failed 3D shows a retry message without restoring the original robot", () => {
  const h = renderStage(0, { spline: "fallback" });
  assert.ok(h.html.includes("3D companion unavailable. Please retry."));
  assert.ok(h.html.includes("Retry 3D companion"));
  assert.equal((h.html.match(/<img\b/g) ?? []).length, 0);
  assert.equal(h.html.includes("/nutrition-scene/robot-"), false);
  h.nodes.find((node) => node.props.className === "n-primary").props.onClick();
  assert.equal(h.currentStage(), 1);
});

test("all six stages show the Spline canvas without image crossfades or video when ready", () => {
  for (let index = 0; index < 6; index++) {
    const { html } = renderStage(index);
    assert.equal((html.match(/<canvas\b/g) ?? []).length, 2);
    assert.equal((html.match(/<video\b/g) ?? []).length, 0);
    assert.equal((html.match(/<img\b/g) ?? []).length, 0);
    assert.ok(html.includes('data-render-status="ready"'));
    assert.ok(html.includes("3D Spline robot companion"));
    assert.ok(html.includes("SCROLL OR CLICK TO EXPLORE"));
    assert.equal(html.includes("CINEMATIC IMAGE EXPERIENCE"), false);
    assert.ok(html.includes("n-floating-world"));
  }
});

test("loading 3D shows only a loading message, never the original robot artwork", () => {
  const { html } = renderStage(0, { spline: "loading" });
  assert.ok(html.includes("Loading 3D companion"));
  assert.equal((html.match(/<img\b/g) ?? []).length, 0);
  assert.equal(html.includes("/nutrition-scene/robot-"), false);
  assert.equal(html.includes("CINEMATIC IMAGE EXPERIENCE"), false);
  assert.ok(html.includes('aria-label="3D Spline robot companion" aria-hidden="true"'));
  assert.equal(html.includes("INTERACTIVE 3D"), false);
  assert.equal(html.includes("Drag to orbit"), false);
});
