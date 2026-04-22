import type { NutritionMealType, NutritionTotals } from "@/types/nutrition";

export const MEAL_LABELS: Record<NutritionMealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

export function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function shiftIsoDate(dateValue: string, deltaDays: number) {
  const next = new Date(`${dateValue}T12:00:00`);
  next.setDate(next.getDate() + deltaDays);
  return next.toISOString().slice(0, 10);
}

export function formatIsoDate(dateValue: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateValue}T12:00:00`));
}

export function percentOfTarget(value: number, target: number) {
  if (!target) {
    return 0;
  }
  return Math.max(0, Math.min(100, (value / target) * 100));
}

export function formatNutritionNumber(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatQuantityWithUnit(quantity: number, unitLabel: string) {
  const cleanLabel = unitLabel.trim();
  if (!cleanLabel) {
    return formatNutritionNumber(quantity);
  }
  return `${formatNutritionNumber(quantity)} ${cleanLabel}`;
}

export function nutritionTotalsToCsvRows(series: Array<{ date: string } & NutritionTotals>) {
  const headers = [
    "date",
    "calories",
    "protein_grams",
    "carbs_grams",
    "fat_grams",
    "fiber_grams",
    "sugar_grams",
    "sodium_mg",
  ];

  return [
    headers.join(","),
    ...series.map((row) =>
      headers
        .map((header) => {
          const value = row[header as keyof typeof row];
          return typeof value === "string" ? value : String(value ?? "");
        })
        .join(","),
    ),
  ].join("\n");
}
