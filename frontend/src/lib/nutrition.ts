import type { NutritionMealType, NutritionTotals } from "@/types/nutrition";

export const MEAL_LABELS: Record<NutritionMealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

export function getTodayIsoDate() {
  return localDateToIsoDate(new Date());
}

export function isoDateToLocalDate(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`);
}

export function localDateToIsoDate(dateValue: Date) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftIsoDate(dateValue: string, deltaDays: number) {
  const next = isoDateToLocalDate(dateValue);
  next.setDate(next.getDate() + deltaDays);
  return localDateToIsoDate(next);
}

export function formatIsoDate(dateValue: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(isoDateToLocalDate(dateValue));
}

export function formatIsoDateLong(dateValue: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(isoDateToLocalDate(dateValue));
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

function normalizeQuantityUnitLabel(quantity: number, unitLabel: string) {
  const cleanLabel = unitLabel.trim();
  const match = cleanLabel.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!match) {
    return cleanLabel;
  }

  const [, labelQuantity, labelUnit] = match;
  if (Number(labelQuantity) !== Number(formatNutritionNumber(quantity))) {
    return cleanLabel;
  }
  return labelUnit.trim();
}

export function formatQuantityWithUnit(quantity: number, unitLabel: string) {
  const cleanLabel = normalizeQuantityUnitLabel(quantity, unitLabel);
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
