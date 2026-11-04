// Units and labels for plans. Mirrors mobile/src/screens/nutrition/planUtils.ts.
import type {
  JobActivity,
  PlanGoalType,
  PlanPace,
  TrainingActivity,
  UnitsPreference,
} from "@/types/plans";

// Everything is stored in metric; these convert for display and input only.
const LB_PER_KG = 2.20462;
const CM_PER_INCH = 2.54;

export function kgToDisplay(kg: number, units: UnitsPreference): number {
  return units === "us" ? Math.round(kg * LB_PER_KG * 10) / 10 : Math.round(kg * 10) / 10;
}

export function displayToKg(value: number, units: UnitsPreference): number {
  return units === "us" ? value / LB_PER_KG : value;
}

export function weightUnit(units: UnitsPreference): string {
  return units === "us" ? "lb" : "kg";
}

export function formatWeight(kg: number, units: UnitsPreference, signed = false): string {
  const value = kgToDisplay(kg, units);
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value} ${weightUnit(units)}`;
}

const ML_PER_FL_OZ = 29.5735;
const KM_PER_MILE = 1.60934;

export function formatWater(ml: number, units: UnitsPreference): string {
  if (units === "us") return `${Math.round(ml / ML_PER_FL_OZ)} fl oz`;
  return ml >= 1000 ? `${(ml / 1000).toFixed(1)} L` : `${Math.round(ml)} ml`;
}

/** Quick-add water amounts, in ml, that are round numbers in the user's units. */
export function waterQuickAdds(units: UnitsPreference): { label: string; ml: number }[] {
  if (units === "us") {
    return [8, 16, 24].map((oz) => ({ label: `+${oz} oz`, ml: Math.round(oz * ML_PER_FL_OZ) }));
  }
  return [250, 500, 750].map((ml) => ({ label: `+${ml}ml`, ml }));
}

export function distanceUnit(units: UnitsPreference): string {
  return units === "us" ? "mi" : "km";
}

export function kmToDisplay(km: number, units: UnitsPreference): number {
  return Math.round((units === "us" ? km / KM_PER_MILE : km) * 100) / 100;
}

export function displayToKm(value: number, units: UnitsPreference): number {
  return units === "us" ? value * KM_PER_MILE : value;
}

/** Plate-friendly step for the +/- weight buttons: 2.5 kg or 5 lb. */
export function weightStep(units: UnitsPreference): number {
  return units === "us" ? 5 : 2.5;
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH;
}

export function formatHeight(cm: number, units: UnitsPreference): string {
  if (units === "us") {
    const { feet, inches } = cmToFeetInches(cm);
    return `${feet}'${inches}"`;
  }
  return `${Math.round(cm)} cm`;
}

export const GOAL_LABELS: Record<PlanGoalType, string> = {
  gain: "Bulk",
  lose: "Cut",
  maintain: "Maintain",
};

export const PACE_LABELS: Record<PlanPace, string> = {
  low: "Low",
  middle: "Middle",
  extreme: "Extreme",
};

export const JOB_LABELS: Record<JobActivity, string> = {
  desk: "Desk job",
  standing: "On my feet",
  physical: "Physical work",
};

export const CARDIO_ACTIVITIES: { key: TrainingActivity; label: string; slug?: string }[] = [
  { key: "running", label: "Running", slug: "Running_Treadmill" },
  { key: "cycling", label: "Cycling", slug: "Bicycling" },
  { key: "walking", label: "Walking", slug: "Walking_Treadmill" },
  { key: "swimming", label: "Swimming" },
  { key: "hiit", label: "HIIT" },
];

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Today's weekday in the backend's numbering (0 = Monday). */
export function todayWeekday(): number {
  return (new Date().getDay() + 6) % 7;
}

export function formatWeeks(weeks: number | null): string {
  if (weeks === null) return "Ongoing";
  if (weeks < 1) return "< 1 week";
  return `${weeks % 1 === 0 ? weeks : weeks.toFixed(1)} weeks`;
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "–";
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function setsLabel(ex: {
  kind: string;
  sets: number;
  rep_min: number;
  rep_max: number;
  duration_min: number | null;
}): string {
  if (ex.kind === "cardio") return `${ex.duration_min ?? 30} min`;
  const reps = ex.rep_min === ex.rep_max ? `${ex.rep_min}` : `${ex.rep_min}–${ex.rep_max}`;
  return `${ex.sets} × ${reps}`;
}

export function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Starter message for building a plan in the AI chat; the user fills in the brackets. */
export const AI_PLAN_PROMPT =
  "Build me a plan. Goal: (bulk / cut / maintain) to (target weight). I'm (age), (height), (weight), " +
  "(male/female), (desk job / on my feet / physical job). I train: (days and what each day is), " +
  "sessions about (minutes), cardio: (type and minutes). Equipment: (gym/home). Foods I avoid: (none).";
