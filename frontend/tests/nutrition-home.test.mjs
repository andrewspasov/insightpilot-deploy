import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/nutrition-preview.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const exports = {};
runInNewContext(outputText, { exports });
const { calculateNutritionSample, GRAMS_PER_OUNCE } = exports;

test("the default 150 g chicken preview shows the matching calorie and macro totals", () => {
  const result = calculateNutritionSample("chicken", "150", "g");
  assert.equal(result.valid, true);
  assert.equal(result.grams, 150);
  assert.equal(result.calories, 247.5);
  assert.equal(result.protein, 46.5);
  assert.equal(result.carbs, 0);
  assert.equal(result.fat, 5.4);
});

test("a 50 g rice preview scales all nutrients, not just calories", () => {
  const result = calculateNutritionSample("rice", "50", "g");
  assert.equal(result.calories, 65);
  assert.equal(result.protein, 1.35);
  assert.equal(result.carbs, 14.1);
  assert.equal(result.fat, 0.15);
});

test("ounces use the same gram basis as the food facts", () => {
  const ounces = calculateNutritionSample("egg", "2", "oz");
  const grams = calculateNutritionSample("egg", String(2 * GRAMS_PER_OUNCE), "g");
  for (const nutrient of ["grams", "calories", "protein", "carbs", "fat"]) {
    assert.equal(ounces[nutrient], grams[nutrient]);
  }
});

test("fractional portions retain precision before display rounding", () => {
  const result = calculateNutritionSample("chicken", "12.5", "g");
  assert.equal(result.calories, 20.625);
  assert.equal(result.protein, 3.875);
});

test("invalid and overflowing amounts never produce NaN or infinite previews", () => {
  for (const amount of ["", " ", "0", "-10", "abc", "Infinity", "1e309", "1e308"]) {
    const result = calculateNutritionSample("chicken", amount, "g");
    assert.equal(result.valid, false, `Invalid amount: ${amount}`);
    for (const nutrient of ["grams", "calories", "protein", "carbs", "fat"]) {
      assert.equal(result[nutrient], 0);
    }
  }
});
