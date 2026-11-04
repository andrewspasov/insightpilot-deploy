import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/nutrition-experience.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const exports = {};
runInNewContext(outputText, { exports });
const { NUTRITION_STAGES, ROBOT_VIEWS, ROBOT_ASSETS, moveNutritionStage, resolveRobotView } = exports;

test("the approved six stages form one finite experience", () => {
  assert.deepEqual(Array.from(NUTRITION_STAGES, (stage) => stage.id), ["intro", "diary", "portions", "meals", "progress", "start"]);
  assert.equal(new Set(NUTRITION_STAGES.map((stage) => stage.id)).size, 6);
  for (const stage of NUTRITION_STAGES) {
    assert.ok(stage.title && stage.accent && stage.description && stage.next);
    assert.ok(ROBOT_VIEWS.includes(stage.view));
  }
});

test("camera approaches progressively and never scales beyond its full-body frame", () => {
  let previous = 0;
  for (const stage of NUTRITION_STAGES) {
    assert.ok(stage.zoom > previous && stage.zoom <= 1);
    assert.ok(Math.abs(stage.shift) <= 3);
    previous = stage.zoom;
  }
  assert.ok(new Set(NUTRITION_STAGES.map((stage) => stage.view)).size >= 3);
});

test("next, back, and invalid stage requests stay inside the experience", () => {
  assert.equal(moveNutritionStage(0, 1), 1);
  assert.equal(moveNutritionStage(3, -1), 2);
  assert.equal(moveNutritionStage(0, -1), 0);
  assert.equal(moveNutritionStage(5, 1), 5);
  assert.equal(moveNutritionStage(2, 100), 5);
  assert.equal(moveNutritionStage(Number.NaN, 1), 0);
  assert.equal(moveNutritionStage(1, Infinity), 0);
});

test("loading and failed angles fall back to an available robot view", () => {
  assert.equal(resolveRobotView("left", []), null);
  assert.equal(resolveRobotView("left", ["front"]), "front");
  assert.equal(resolveRobotView("left", ["front", "left"]), "left");
  assert.equal(resolveRobotView("front", ["right"]), "right");
});

test("every cinematic view uses a preserved local full-resolution PNG", () => {
  for (const view of ROBOT_VIEWS) {
    const file = new URL(`../public${ROBOT_ASSETS[view]}`, import.meta.url);
    assert.ok(statSync(file).size < 2_000_000);
    const bytes = readFileSync(file);
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), 1024);
    assert.equal(bytes.readUInt32BE(20), 1536);
  }
});
