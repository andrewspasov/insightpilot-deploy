"""Deterministic calorie and macro calculator for bulk / cut / maintain plans.

The AI collects the inputs and explains the result, but every number comes
from here so plans are consistent and reproducible.

Maintenance = Mifflin-St Jeor BMR x job activity factor
              + planned training averaged over the week.
Target      = maintenance +/- the surplus or deficit for the chosen pace.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta

KCAL_PER_KG = 7700.0
FAT_CALORIE_SHARE = 0.25
DEFAULT_SESSION_MINUTES = 60

GOAL_GAIN = "gain"
GOAL_LOSE = "lose"
GOAL_MAINTAIN = "maintain"

PACE_LOW = "low"
PACE_MIDDLE = "middle"
PACE_EXTREME = "extreme"

# Job activity multipliers on BMR, excluding planned training.
JOB_FACTORS = {
    "desk": 1.2,
    "standing": 1.375,
    "physical": 1.55,
}

# MET values (Compendium of Physical Activities, rounded). Same table the
# app uses for logging exercise, so plan and log estimates agree.
ACTIVITY_METS = {
    "weights": 5.0,
    "running": 9.8,
    "cycling": 7.5,
    "swimming": 8.0,
    "walking": 3.5,
    "hiit": 10.0,
    "yoga": 3.0,
    "other": 5.0,
}

# Weekly body-weight change as a fraction of current weight.
PACE_RATES = {
    GOAL_GAIN: {PACE_LOW: 0.0025, PACE_MIDDLE: 0.005, PACE_EXTREME: 0.0075},
    GOAL_LOSE: {PACE_LOW: 0.005, PACE_MIDDLE: 0.0075, PACE_EXTREME: 0.01},
}

PROTEIN_G_PER_KG = {
    GOAL_GAIN: 2.0,
    GOAL_LOSE: 2.2,
    GOAL_MAINTAIN: 1.8,
}

MIN_CALORIES = {"male": 1500, "female": 1200}

PACE_NOTES = {
    (GOAL_GAIN, PACE_EXTREME): "Fastest gain, but a larger share of it will be fat rather than muscle.",
    (GOAL_GAIN, PACE_LOW): "Slowest and leanest gain; expect a long timeline.",
    (GOAL_LOSE, PACE_EXTREME): "Fastest loss, but harder to sustain and more risk of losing muscle.",
    (GOAL_LOSE, PACE_LOW): "Gentlest deficit; easiest to stick to and best for keeping muscle.",
}


class PlanInputError(ValueError):
    pass


@dataclass
class PlanInputs:
    goal_type: str
    sex: str
    age: int
    height_cm: float
    weight_kg: float
    target_weight_kg: float
    job_activity: str
    weekly_training: list[dict] = field(default_factory=list)
    start_date: date | None = None


def _round_to(value: float, step: int) -> int:
    return int(round(value / step) * step)


def bmr_mifflin_st_jeor(sex: str, weight_kg: float, height_cm: float, age: int) -> float:
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    return base + 5 if sex == "male" else base - 161


def session_calories(activity: str, duration_min: float, weight_kg: float) -> float:
    """Net calories above resting for one session (MET - 1, since BMR already covers rest)."""
    met = ACTIVITY_METS.get(activity, ACTIVITY_METS["other"])
    return max(met - 1.0, 0.0) * weight_kg * (duration_min / 60.0)


def normalize_weekly_training(sessions: list[dict] | None) -> list[dict]:
    normalized = []
    for raw in sessions or []:
        if not isinstance(raw, dict):
            raise PlanInputError("Each training session must be an object.")
        activity = str(raw.get("activity") or "other").strip().lower()
        if activity not in ACTIVITY_METS:
            activity = "other"
        try:
            duration = float(raw.get("duration_min") or DEFAULT_SESSION_MINUTES)
        except (TypeError, ValueError) as exc:
            raise PlanInputError("Training duration must be a number of minutes.") from exc
        if not 1 <= duration <= 300:
            raise PlanInputError("Training sessions must be between 1 and 300 minutes.")
        weekday = raw.get("weekday")
        if weekday is not None:
            try:
                weekday = int(weekday)
            except (TypeError, ValueError) as exc:
                raise PlanInputError("weekday must be 0 (Monday) to 6 (Sunday).") from exc
            if not 0 <= weekday <= 6:
                raise PlanInputError("weekday must be 0 (Monday) to 6 (Sunday).")
        normalized.append({"weekday": weekday, "activity": activity, "duration_min": round(duration)})
    if len(normalized) > 21:
        raise PlanInputError("At most 21 training sessions per week.")
    return normalized


def validate_inputs(inputs: PlanInputs) -> None:
    if inputs.goal_type not in (GOAL_GAIN, GOAL_LOSE, GOAL_MAINTAIN):
        raise PlanInputError("goal_type must be gain, lose or maintain.")
    if inputs.sex not in MIN_CALORIES:
        raise PlanInputError("sex must be male or female.")
    if inputs.job_activity not in JOB_FACTORS:
        raise PlanInputError("job_activity must be desk, standing or physical.")
    if not 14 <= inputs.age <= 100:
        raise PlanInputError("Age must be between 14 and 100.")
    if not 120 <= inputs.height_cm <= 250:
        raise PlanInputError("Height must be between 120 and 250 cm.")
    if not 30 <= inputs.weight_kg <= 300:
        raise PlanInputError("Current weight must be between 30 and 300 kg.")
    if not 30 <= inputs.target_weight_kg <= 300:
        raise PlanInputError("Target weight must be between 30 and 300 kg.")
    if inputs.goal_type == GOAL_GAIN and inputs.target_weight_kg <= inputs.weight_kg:
        raise PlanInputError("For a bulk, the target weight must be above your current weight.")
    if inputs.goal_type == GOAL_LOSE and inputs.target_weight_kg >= inputs.weight_kg:
        raise PlanInputError("For a cut, the target weight must be below your current weight.")


def _macros(goal_type: str, calories: int, weight_kg: float) -> dict:
    protein = round(PROTEIN_G_PER_KG[goal_type] * weight_kg)
    fat = round(calories * FAT_CALORIE_SHARE / 9.0)
    carbs = round(max(calories - protein * 4 - fat * 9, 0) / 4.0)
    return {"protein_grams": float(protein), "carbs_grams": float(carbs), "fat_grams": float(fat)}


def _option(inputs: PlanInputs, maintenance: float, pace: str, start: date) -> dict:
    goal = inputs.goal_type
    rate = PACE_RATES.get(goal, {}).get(pace, 0.0)
    sign = 1 if goal == GOAL_GAIN else -1
    weekly_change_kg = round(sign * rate * inputs.weight_kg, 2)

    raw_target = maintenance + weekly_change_kg * KCAL_PER_KG / 7.0
    floor = MIN_CALORIES[inputs.sex]
    hit_floor = raw_target < floor
    calories = _round_to(max(raw_target, floor), 10)
    if hit_floor:
        # Clamped to the minimum: report the slower pace the floor allows.
        weekly_change_kg = round((calories - maintenance) * 7.0 / KCAL_PER_KG, 2)

    estimated_weeks = None
    projected_end = None
    if goal != GOAL_MAINTAIN and weekly_change_kg:
        distance = abs(inputs.target_weight_kg - inputs.weight_kg)
        estimated_weeks = round(distance / abs(weekly_change_kg), 1)
        projected_end = start + timedelta(days=math.ceil(estimated_weeks * 7))

    note = PACE_NOTES.get((goal, pace), "")
    if hit_floor:
        note = f"Calories were capped at the {floor} kcal minimum, so this pace is slower than usual."

    return {
        "pace": pace,
        "daily_calorie_target": calories,
        **_macros(goal, calories, inputs.weight_kg),
        "weekly_change_kg": weekly_change_kg,
        "estimated_weeks": estimated_weeks,
        "projected_end_date": projected_end.isoformat() if projected_end else None,
        "note": note,
    }


def calculate_plan(inputs: PlanInputs) -> dict:
    """Return maintenance numbers plus one option per pace for the goal."""
    validate_inputs(inputs)
    sessions = normalize_weekly_training(inputs.weekly_training)
    start = inputs.start_date or date.today()

    bmr = bmr_mifflin_st_jeor(inputs.sex, inputs.weight_kg, inputs.height_cm, inputs.age)
    base = bmr * JOB_FACTORS[inputs.job_activity]
    weekly_training_kcal = sum(
        session_calories(s["activity"], s["duration_min"], inputs.weight_kg) for s in sessions
    )
    training_per_day = weekly_training_kcal / 7.0
    maintenance = base + training_per_day

    paces = [PACE_MIDDLE] if inputs.goal_type == GOAL_MAINTAIN else [PACE_LOW, PACE_MIDDLE, PACE_EXTREME]
    return {
        "goal_type": inputs.goal_type,
        "bmr": round(bmr),
        "job_factor": JOB_FACTORS[inputs.job_activity],
        "training_calories_per_day": round(training_per_day),
        "maintenance_calories": _round_to(maintenance, 10),
        "weekly_training": sessions,
        "options": [_option(inputs, maintenance, pace, start) for pace in paces],
    }


def pick_option(result: dict, pace: str) -> dict:
    for option in result["options"]:
        if option["pace"] == pace:
            return option
    raise PlanInputError(f"Pace '{pace}' is not available for this goal.")
