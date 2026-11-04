from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from nutrition import plans as plan_service
from nutrition.exercise_matching import match_exercise
from nutrition.models import Exercise, MealEntry, Plan, WeightEntry
from nutrition.planning import PlanInputError, normalize_weekly_training, pick_option
from nutrition.program_templates import SPLITS, ProgramBuilder

from .models import InsightAIAction
from .services import InsightAIError


class InsightAIActionError(InsightAIError):
    status_code = 400


class PlanProposalError(InsightAIActionError):
    """The AI proposed an action the app rejected; reported back in the chat reply."""


GOAL_NAMES = {"gain": "Bulk", "lose": "Cut", "maintain": "Maintain"}


MEAL_LOG_PATTERN = re.compile(
    r"\blog\s+(?P<quantity>\d+(?:\.\d+)?)\s*(?P<unit>g|gram|grams|oz|ounce|ounces|serving|servings|piece|pieces)\s+"
    r"(?P<food>.+?)\s+(?:for|to)\s+(?P<meal_type>breakfast|lunch|dinner|snacks?)"
    r"(?:\s+(?P<date_word>today|tomorrow|yesterday|\d{4}-\d{2}-\d{2}))?\b",
    re.IGNORECASE,
)

GENERIC_MACROS_PER_100G = {
    "chicken breast": {
        "calories": 165.0,
        "protein_grams": 31.0,
        "carbs_grams": 0.0,
        "fat_grams": 3.6,
        "fiber_grams": 0.0,
        "sugar_grams": 0.0,
        "sodium_mg": 74.0,
    },
    "cooked chicken breast": {
        "calories": 165.0,
        "protein_grams": 31.0,
        "carbs_grams": 0.0,
        "fat_grams": 3.6,
        "fiber_grams": 0.0,
        "sugar_grams": 0.0,
        "sodium_mg": 74.0,
    },
}


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed


def _format_number(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:g}"


def _normalize_unit(value: Any) -> str:
    unit = str(value or "serving").strip().lower()
    aliases = {
        "gram": "g",
        "grams": "g",
        "ounce": "oz",
        "ounces": "oz",
        "servings": "serving",
        "pieces": "piece",
    }
    return aliases.get(unit, unit or "serving")


def _parse_entry_date(value: Any) -> date:
    if not value:
        return timezone.localdate()
    try:
        parsed = date.fromisoformat(str(value))
    except ValueError as exc:
        raise InsightAIActionError("The AI action used an invalid meal date.") from exc

    # AI models sometimes hallucinate the year (e.g. logging "today" as a date
    # years in the past). If the date is far outside a plausible logging
    # window, fall back to today.
    today = timezone.localdate()
    if abs((parsed - today).days) > 30:
        return today
    return parsed


def _date_from_word(value: str | None) -> str:
    today = timezone.localdate()
    if not value or value.lower() == "today":
        return today.isoformat()
    if value.lower() == "tomorrow":
        return (today + timedelta(days=1)).isoformat()
    if value.lower() == "yesterday":
        return (today - timedelta(days=1)).isoformat()
    return value


def _date_from_relative_word_in_message(message: str | None) -> str | None:
    if not message:
        return None
    lowered = message.lower()
    for word in ("today", "tomorrow", "yesterday"):
        if re.search(rf"\b{word}\b", lowered):
            return _date_from_word(word)
    return None


def _estimate_macros(food_name: str, quantity: float, unit: str) -> dict[str, float]:
    normalized_food = " ".join(food_name.lower().split())
    per_100g = GENERIC_MACROS_PER_100G.get(normalized_food)
    if not per_100g:
        return {
            "calories": 0.0,
            "protein_grams": 0.0,
            "carbs_grams": 0.0,
            "fat_grams": 0.0,
            "fiber_grams": 0.0,
            "sugar_grams": 0.0,
            "sodium_mg": 0.0,
        }

    unit_normalized = unit.lower()
    grams = quantity
    if unit_normalized in {"oz", "ounce", "ounces"}:
        grams = quantity * 28.3495
    if unit_normalized not in {"g", "gram", "grams", "oz", "ounce", "ounces"}:
        grams = 100.0 * quantity

    multiplier = grams / 100.0
    return {key: round(value * multiplier, 2) for key, value in per_100g.items()}


def _normalize_log_meal_payload(payload: dict[str, Any], message: str | None = None) -> dict[str, Any]:
    food_name = str(payload.get("food_name") or "").strip()
    if not food_name:
        raise InsightAIActionError("The AI action is missing a food name.")

    meal_type = str(payload.get("meal_type") or "").strip().lower()
    allowed_meal_types = {choice[0] for choice in MealEntry.MEAL_CHOICES}
    if meal_type not in allowed_meal_types:
        raise InsightAIActionError("The AI action is missing a valid meal type.")

    quantity = _as_float(payload.get("quantity") or payload.get("servings"), default=0.0)
    if quantity <= 0:
        raise InsightAIActionError("The AI action is missing a valid quantity.")

    unit = _normalize_unit(payload.get("unit") or payload.get("measurement_unit") or "serving")

    relative_entry_date = _date_from_relative_word_in_message(message)
    entry_date = _parse_entry_date(relative_entry_date or payload.get("entry_date"))
    normalized = {
        "entry_date": entry_date.isoformat(),
        "meal_type": meal_type,
        "food_name": food_name[:200],
        "brand_name": str(payload.get("brand_name") or "").strip()[:200],
        "quantity": round(quantity, 4),
        "unit": unit[:40],
        "calories": round(_as_float(payload.get("calories")), 2),
        "protein_grams": round(_as_float(payload.get("protein_grams")), 2),
        "carbs_grams": round(_as_float(payload.get("carbs_grams")), 2),
        "fat_grams": round(_as_float(payload.get("fat_grams")), 2),
        "fiber_grams": round(_as_float(payload.get("fiber_grams")), 2),
        "sugar_grams": round(_as_float(payload.get("sugar_grams")), 2),
        "sodium_mg": round(_as_float(payload.get("sodium_mg")), 2),
    }
    return normalized


def _default_log_meal_summary(payload: dict[str, Any]) -> str:
    return (
        f"Log {_format_number(payload['quantity'])}{payload['unit']} {payload['food_name']} "
        f"to {payload['meal_type']} on {payload['entry_date']}."
    )


def serialize_action(action: InsightAIAction | None) -> dict[str, Any] | None:
    if action is None:
        return None
    return {
        "id": action.id,
        "action_type": action.action_type,
        "status": action.status,
        "summary": action.summary,
        "payload": action.payload,
        "result_payload": action.result_payload,
        "error_message": action.error_message,
        "expires_at": action.expires_at.isoformat(),
        "resolved_at": action.resolved_at.isoformat() if action.resolved_at else None,
        "created_at": action.created_at.isoformat(),
        "updated_at": action.updated_at.isoformat(),
    }


CARDIO_NAMES = {"running": "Running", "cycling": "Cycling", "walking": "Walking", "swimming": "Swimming", "hiit": "HIIT"}


def _add_missing_cardio(days: list[dict[str, Any]], weekly_training: list[dict]) -> list[dict[str, Any]]:
    """Make sure each cardio session the calories count for is also on the program."""
    by_weekday = {day["weekday"]: day for day in days}
    library = None
    for session in weekly_training or []:
        name = CARDIO_NAMES.get(session.get("activity"))
        weekday = session.get("weekday")
        if not name or weekday is None:
            continue
        day = by_weekday.get(weekday)
        if day is None:
            day = {"weekday": weekday, "title": name, "exercises": []}
            by_weekday[weekday] = day
            days.append(day)
        if any(e["kind"] == "cardio" for e in day["exercises"]):
            continue
        library = library if library is not None else list(Exercise.objects.all())
        match = match_exercise(name, library=library)
        day["exercises"].append(
            {
                "name": name,
                "kind": "cardio",
                "sets": 1,
                "rep_min": 1,
                "rep_max": 1,
                "duration_min": int(session.get("duration_min") or 30),
                "exercise_id": match.id if match else None,
                "image_urls": match.image_urls if match else [],
            }
        )
    return sorted(days, key=lambda d: d["weekday"])


# Ready-made split to fall back on for each number of lifting days.
SPLIT_FOR_DAY_COUNT = {1: "full_body_2", 2: "full_body_2", 3: "ppl_3", 4: "upper_lower_4", 5: "ppl_ul_5", 6: "ppl_6", 7: "ppl_6"}


def _fill_lifting_days(
    user, days: list[dict[str, Any]], weekly_training: list[dict], goal: str, equipment: str = ""
) -> list[dict[str, Any]]:
    """Give every weights session a workout, even when the AI left the day out or empty.

    Missing exercises come from the built-in program builder: from the day's
    title when it names muscles, otherwise from a split for that many days.
    """
    lifting = sorted({s["weekday"] for s in weekly_training or [] if s.get("activity") == "weights"})
    by_weekday = {day["weekday"]: day for day in days}
    empty = [wd for wd in lifting if not any(e["kind"] == "strength" for e in by_weekday.get(wd, {}).get("exercises", []))]
    if not empty:
        return days
    profile = plan_service.get_or_create_profile(user)
    builder = ProgramBuilder(equipment or profile.equipment, goal, profile.home_gear)
    _, _, template = SPLITS[SPLIT_FOR_DAY_COUNT[len(lifting)]]
    library: dict[int, Exercise] = {}
    for weekday in empty:
        day = by_weekday.get(weekday)
        if day is None:
            day = {"weekday": weekday, "title": "", "exercises": []}
            by_weekday[weekday] = day
            days.append(day)
        built = builder.build_from_title(day["title"], include_abs=profile.include_abs) if day["title"] else None
        if not built:
            title, groups, heavy = template[lifting.index(weekday) % len(template)]
            day["title"] = day["title"] or title
            built = builder.build_day(groups, heavy=heavy, include_abs=profile.include_abs)
        missing_ids = {e["exercise_id"] for e in built} - library.keys()
        library.update({e.id: e for e in Exercise.objects.filter(id__in=missing_ids)})
        strength = [
            {
                "name": e["name"],
                "kind": "strength",
                "sets": e["sets"],
                "rep_min": e["rep_min"],
                "rep_max": e["rep_max"],
                "duration_min": None,
                "exercise_id": e["exercise_id"],
                "image_urls": library[e["exercise_id"]].image_urls if e["exercise_id"] in library else [],
            }
            for e in built
        ]
        day["exercises"] = strength + day["exercises"]
    return sorted(days, key=lambda d: d["weekday"])


def _resolve_workout_days(raw_days: Any) -> list[dict[str, Any]]:
    """Normalize the AI's program and match each exercise to the library (for images)."""
    if not isinstance(raw_days, list):
        return []
    library = list(Exercise.objects.all())
    days = []
    seen = set()
    for raw_day in raw_days:
        if not isinstance(raw_day, dict):
            continue
        try:
            weekday = int(raw_day.get("weekday"))
        except (TypeError, ValueError):
            continue
        if not 0 <= weekday <= 6 or weekday in seen:
            continue
        seen.add(weekday)
        exercises = []
        for raw in (raw_day.get("exercises") or [])[: plan_service.MAX_EXERCISES_PER_DAY]:
            if not isinstance(raw, dict) or not str(raw.get("name") or "").strip():
                continue
            kind = "cardio" if raw.get("kind") == "cardio" else "strength"
            match = match_exercise(
                str(raw["name"]), str(raw.get("primary_muscle") or ""), str(raw.get("equipment") or ""), library
            )
            exercises.append(
                {
                    "name": str(raw["name"]).strip()[:200],
                    "kind": kind,
                    "sets": int(_as_float(raw.get("sets"), 3) or 3),
                    "rep_min": int(_as_float(raw.get("rep_min"), 8) or 8),
                    "rep_max": int(_as_float(raw.get("rep_max"), 12) or 12),
                    "duration_min": int(_as_float(raw.get("duration_min"), 30) or 30) if kind == "cardio" else None,
                    "exercise_id": match.id if match else None,
                    "image_urls": match.image_urls if match else [],
                }
            )
        days.append({"weekday": weekday, "title": str(raw_day.get("title") or "Workout")[:200], "exercises": exercises})
    return sorted(days, key=lambda d: d["weekday"])


def _create_plan_action(user, proposed_action: dict[str, Any]) -> InsightAIAction:
    raw = proposed_action.get("payload") or {}
    inputs = {
        key: raw.get(key)
        for key in ("goal_type", "sex", "age", "height_cm", "weight_kg", "target_weight_kg", "job_activity")
    }
    # The AI sometimes adds placeholder sessions of 0 minutes; they aren't real training.
    inputs["weekly_training"] = [
        session
        for session in raw.get("weekly_training") or []
        if not isinstance(session, dict) or _as_float(session.get("duration_min"), 1) > 0
    ]
    try:
        preview = plan_service.preview_plan(user, inputs)
    except PlanInputError as exc:
        raise PlanProposalError(str(exc)) from exc

    workout_days = _fill_lifting_days(
        user,
        _resolve_workout_days(raw.get("workout_days")),
        preview["weekly_training"],
        preview["goal_type"],
        str(raw.get("equipment") or ""),
    )
    workout_days = _add_missing_cardio(workout_days, preview["weekly_training"])
    payload = {
        "inputs": {**preview["inputs"], "goal_type": preview["goal_type"], "weekly_training": preview["weekly_training"]},
        "equipment": str(raw.get("equipment") or "")[:200],
        "explanation": str(raw.get("explanation") or "")[:2000],
        "food_preferences": raw.get("food_preferences"),
        "workout_days": workout_days,
        "preview": {
            "bmr": preview["bmr"],
            "maintenance_calories": preview["maintenance_calories"],
            "training_calories_per_day": preview["training_calories_per_day"],
            "options": preview["options"],
        },
    }
    goal = GOAL_NAMES[preview["goal_type"]]
    weights = f"{preview['inputs']['weight_kg']:g} kg"
    if preview["goal_type"] != "maintain":
        weights += f" → {preview['inputs']['target_weight_kg']:g} kg"
    summary = f"{goal} plan: {weights}, {len(workout_days)} training days."
    # An adjusted proposal replaces any earlier card that was never confirmed.
    InsightAIAction.objects.filter(
        user=user, action_type=InsightAIAction.TYPE_CREATE_PLAN, status=InsightAIAction.STATUS_PENDING
    ).update(status=InsightAIAction.STATUS_CANCELLED, resolved_at=timezone.now())
    return InsightAIAction.objects.create(
        user=user,
        action_type=InsightAIAction.TYPE_CREATE_PLAN,
        status=InsightAIAction.STATUS_PENDING,
        summary=summary[:300],
        payload=payload,
        expires_at=timezone.now() + timedelta(hours=24),
    )


def _update_program_action(user, proposed_action: dict[str, Any]) -> InsightAIAction:
    plan = Plan.objects.filter(owner=user, status=Plan.STATUS_ACTIVE).first()
    if plan is None:
        raise PlanProposalError("There's no active plan to change. Create a plan first.")
    raw = proposed_action.get("payload") or {}
    workout_days = _resolve_workout_days(raw.get("workout_days"))
    if not workout_days:
        raise PlanProposalError("The new program had no training days.")
    weekly_training = raw.get("weekly_training")
    new_target = None
    if weekly_training is not None:
        try:
            weekly_training = normalize_weekly_training(weekly_training)
        except PlanInputError as exc:
            raise PlanProposalError(str(exc)) from exc
        if weekly_training == plan.weekly_training:
            weekly_training = None
    sessions = weekly_training if weekly_training is not None else plan.weekly_training
    workout_days = _fill_lifting_days(user, workout_days, sessions, plan.goal_type, plan.equipment)
    workout_days = _add_missing_cardio(workout_days, sessions)
    if weekly_training is not None:
        preview = plan_service.calculate_plan(
            plan_service.PlanInputs(
                goal_type=plan.goal_type,
                sex=plan.sex,
                age=plan.age,
                height_cm=plan.height_cm,
                weight_kg=plan.start_weight_kg,
                target_weight_kg=plan.target_weight_kg,
                job_activity=plan.job_activity,
                weekly_training=weekly_training,
                start_date=plan.start_date,
            )
        )
        new_target = plan_service.pick_option(preview, plan.pace)["daily_calorie_target"]

    summary = str(proposed_action.get("summary") or "").strip() or f"Update your program to {len(workout_days)} training days."
    return InsightAIAction.objects.create(
        user=user,
        action_type=InsightAIAction.TYPE_UPDATE_PROGRAM,
        status=InsightAIAction.STATUS_PENDING,
        summary=summary[:300],
        payload={
            "plan_id": plan.id,
            "workout_days": workout_days,
            "weekly_training": weekly_training,
            "current_calorie_target": plan.daily_calorie_target,
            "new_calorie_target": new_target,
        },
        expires_at=timezone.now() + timedelta(hours=24),
    )


def _pending(user, action_type: str, summary: str, payload: dict[str, Any]) -> InsightAIAction:
    return InsightAIAction.objects.create(
        user=user,
        action_type=action_type,
        status=InsightAIAction.STATUS_PENDING,
        summary=summary[:300],
        payload=payload,
        expires_at=timezone.now() + timedelta(hours=24),
    )


def _active_plan_or_error(user) -> Plan:
    plan = plan_service.get_active_plan(user)
    if plan is None:
        raise PlanProposalError("You don't have an active plan.")
    return plan


def _delete_plan_action(user) -> InsightAIAction:
    plan = _active_plan_or_error(user)
    goal = GOAL_NAMES.get(plan.goal_type, "Current")
    return _pending(
        user,
        InsightAIAction.TYPE_DELETE_PLAN,
        f"End your {goal} plan ({plan.daily_calorie_target} kcal/day). Your logged foods, weights and workouts stay.",
        {"plan_id": plan.id, "goal_type": plan.goal_type, "daily_calorie_target": plan.daily_calorie_target},
    )


def _update_plan_action(user, proposed_action: dict[str, Any]) -> InsightAIAction:
    plan = _active_plan_or_error(user)
    available = [o["pace"] for o in plan.pace_options or []]
    pace = str((proposed_action.get("payload") or {}).get("pace") or "").strip().lower()
    if pace not in available:
        raise PlanProposalError(f"Choose one of these paces: {', '.join(available)}.")
    if pace == plan.pace:
        raise PlanProposalError(f"Your plan is already at the {pace} pace.")
    new_target = pick_option({"options": plan.pace_options}, pace)["daily_calorie_target"]
    return _pending(
        user,
        InsightAIAction.TYPE_UPDATE_PLAN,
        f"Switch your plan to the {pace} pace: {plan.daily_calorie_target} → {new_target} kcal/day.",
        {
            "plan_id": plan.id,
            "pace": pace,
            "current_calorie_target": plan.daily_calorie_target,
            "new_calorie_target": new_target,
        },
    )


def _entry_label(entry: MealEntry) -> str:
    return f"{entry.food_name} ({entry.meal_type}, {entry.entry_date.isoformat()})"


def _edit_diary_action(user, proposed_action: dict[str, Any]) -> InsightAIAction:
    raw = proposed_action.get("payload") or {}
    try:
        adds = [_normalize_log_meal_payload(item) for item in (raw.get("add") or [])[:20] if isinstance(item, dict)]
    except InsightAIActionError as exc:
        raise PlanProposalError(str(exc)) from exc

    def entry_ids(items) -> list[int]:
        ids = []
        for item in items or []:
            value = item.get("entry_id") if isinstance(item, dict) else item
            try:
                ids.append(int(value))
            except (TypeError, ValueError):
                continue
        return ids

    delete_ids = list(dict.fromkeys(entry_ids(raw.get("delete"))))
    raw_updates = [u for u in raw.get("update") or [] if isinstance(u, dict)]
    wanted = set(delete_ids) | set(entry_ids(raw_updates))
    entries = {e.id: e for e in MealEntry.objects.filter(owner=user, id__in=wanted)}
    if wanted - entries.keys():
        raise PlanProposalError("I couldn't find one of those diary entries. Ask me to look at that day again.")

    allowed_meal_types = {choice[0] for choice in MealEntry.MEAL_CHOICES}
    updates = []
    lines = [
        f"Add {_format_number(a['quantity'])} {a['unit']} {a['food_name']} to {a['meal_type']} "
        f"({a['entry_date']}), {round(a['calories'])} kcal"
        for a in adds
    ]
    for raw_update in raw_updates:
        entry = entries[int(raw_update["entry_id"])]
        if entry.id in delete_ids:
            continue
        change: dict[str, Any] = {}
        quantity = _as_float(raw_update.get("quantity"))
        if quantity > 0 and round(quantity, 4) != round(entry.servings, 4):
            change["quantity"] = round(quantity, 4)
        meal_type = str(raw_update.get("meal_type") or "").strip().lower()
        if meal_type in allowed_meal_types and meal_type != entry.meal_type:
            change["meal_type"] = meal_type
        if raw_update.get("entry_date"):
            try:
                entry_date = _parse_entry_date(raw_update["entry_date"])
            except InsightAIActionError as exc:
                raise PlanProposalError(str(exc)) from exc
            if entry_date != entry.entry_date:
                change["entry_date"] = entry_date.isoformat()
        if not change:
            continue
        described = []
        if "quantity" in change:
            described.append(
                f"{_format_number(entry.servings)} → {_format_number(change['quantity'])} {entry.measurement_unit}"
            )
        if "meal_type" in change:
            described.append(f"move to {change['meal_type']}")
        if "entry_date" in change:
            described.append(f"move to {change['entry_date']}")
        updates.append({"entry_id": entry.id, **change})
        lines.append(f"Change {_entry_label(entry)}: {', '.join(described)}")
    lines += [f"Delete {_entry_label(entries[entry_id])}" for entry_id in delete_ids]

    if not lines:
        raise PlanProposalError("There was nothing to change in your diary.")
    counts = [
        f"add {len(adds)}" if adds else "",
        f"change {len(updates)}" if updates else "",
        f"delete {len(delete_ids)}" if delete_ids else "",
    ]
    summary = "Diary: " + ", ".join(c for c in counts if c) + (" food" if len(lines) == 1 else " foods") + "."
    return _pending(
        user,
        InsightAIAction.TYPE_EDIT_DIARY,
        summary,
        {"add": adds, "update": updates, "delete": delete_ids, "lines": lines},
    )


def _log_weight_action(user, proposed_action: dict[str, Any]) -> InsightAIAction:
    raw = proposed_action.get("payload") or {}
    weight = round(_as_float(raw.get("weight_kg")), 2)
    if not 20 <= weight <= 400:
        raise PlanProposalError("That weight doesn't look right. Tell me your weight again.")
    try:
        entry_date = _parse_entry_date(raw.get("entry_date"))
    except InsightAIActionError as exc:
        raise PlanProposalError(str(exc)) from exc
    existing = WeightEntry.objects.filter(owner=user, entry_date=entry_date).first()
    summary = f"Log your weight: {weight:g} kg on {entry_date.isoformat()}"
    if existing:
        summary += f" (replaces {existing.weight_kg:g} kg)"
    return _pending(
        user,
        InsightAIAction.TYPE_LOG_WEIGHT,
        summary + ".",
        {"entry_date": entry_date.isoformat(), "weight_kg": weight},
    )


def create_pending_action(user, proposed_action: dict[str, Any] | None, message: str | None = None) -> InsightAIAction | None:
    if not proposed_action:
        return None

    action_type = str(proposed_action.get("type") or proposed_action.get("action_type") or "").strip()
    if action_type == InsightAIAction.TYPE_CREATE_PLAN:
        return _create_plan_action(user, proposed_action)
    if action_type == InsightAIAction.TYPE_UPDATE_PROGRAM:
        return _update_program_action(user, proposed_action)
    if action_type == InsightAIAction.TYPE_DELETE_PLAN:
        return _delete_plan_action(user)
    if action_type == InsightAIAction.TYPE_UPDATE_PLAN:
        return _update_plan_action(user, proposed_action)
    if action_type == InsightAIAction.TYPE_EDIT_DIARY:
        return _edit_diary_action(user, proposed_action)
    if action_type == InsightAIAction.TYPE_LOG_WEIGHT:
        return _log_weight_action(user, proposed_action)
    if action_type != InsightAIAction.TYPE_LOG_MEAL:
        return None

    payload = proposed_action.get("payload")
    if not isinstance(payload, dict):
        raise InsightAIActionError("The AI action is missing its meal payload.")

    normalized_payload = _normalize_log_meal_payload(payload, message=message)
    summary = str(proposed_action.get("summary") or "").strip()[:300]
    if not summary:
        summary = _default_log_meal_summary(normalized_payload)

    return InsightAIAction.objects.create(
        user=user,
        action_type=InsightAIAction.TYPE_LOG_MEAL,
        status=InsightAIAction.STATUS_PENDING,
        summary=summary,
        payload=normalized_payload,
        expires_at=timezone.now() + timedelta(hours=24),
    )


def infer_log_meal_action_from_message(message: str) -> dict[str, Any] | None:
    match = MEAL_LOG_PATTERN.search(message)
    if not match:
        return None

    quantity = _as_float(match.group("quantity"))
    unit = match.group("unit").lower()
    food_name = " ".join(match.group("food").strip().split())
    meal_type = match.group("meal_type").lower()
    if meal_type == "snack":
        meal_type = "snacks"
    macros = _estimate_macros(food_name, quantity, unit)
    entry_date = _date_from_word(match.group("date_word"))

    return {
        "type": InsightAIAction.TYPE_LOG_MEAL,
        "summary": f"Log {_format_number(quantity)}{unit} {food_name} to {meal_type} on {entry_date}.",
        "payload": {
            "entry_date": entry_date,
            "meal_type": meal_type,
            "food_name": food_name,
            "brand_name": "",
            "quantity": quantity,
            "unit": "g" if unit in {"gram", "grams"} else unit,
            **macros,
        },
    }


def _macro_per_unit(total: float, quantity: float) -> float:
    if quantity <= 0:
        return 0.0
    return round(total / quantity, 4)


def _create_meal_entry(user, payload: dict[str, Any]) -> MealEntry:
    quantity = _as_float(payload["quantity"])
    unit = _normalize_unit(payload["unit"])
    is_grams = unit == "g"
    return MealEntry.objects.create(
        owner=user,
        entry_date=_parse_entry_date(payload["entry_date"]),
        meal_type=payload["meal_type"],
        food_source=MealEntry.SOURCE_CUSTOM,
        external_food_id="insight-ai",
        food_name=payload["food_name"],
        brand_name=payload.get("brand_name", ""),
        serving_description=unit,
        measurement_unit=unit,
        servings=quantity,
        grams_per_unit=1.0 if is_grams else None,
        serving_calories=_macro_per_unit(_as_float(payload.get("calories")), quantity),
        serving_protein_grams=_macro_per_unit(_as_float(payload.get("protein_grams")), quantity),
        serving_carbs_grams=_macro_per_unit(_as_float(payload.get("carbs_grams")), quantity),
        serving_fat_grams=_macro_per_unit(_as_float(payload.get("fat_grams")), quantity),
        serving_fiber_grams=_macro_per_unit(_as_float(payload.get("fiber_grams")), quantity),
        serving_sugar_grams=_macro_per_unit(_as_float(payload.get("sugar_grams")), quantity),
        serving_sodium_mg=_macro_per_unit(_as_float(payload.get("sodium_mg")), quantity),
    )


def _execute_log_meal(action: InsightAIAction) -> dict[str, Any]:
    entry = _create_meal_entry(action.user, action.payload)
    return {
        "entry": {
            "id": entry.id,
            "entry_date": entry.entry_date.isoformat(),
            "meal_type": entry.meal_type,
            "food_name": entry.food_name,
            "quantity": entry.servings,
            "measurement_unit": entry.measurement_unit,
            "calories": entry.calories,
            "protein_grams": entry.protein_grams,
            "carbs_grams": entry.carbs_grams,
            "fat_grams": entry.fat_grams,
        }
    }


def _get_pending_action(user, action_id: int) -> InsightAIAction:
    action = get_object_or_404(InsightAIAction, id=action_id, user=user)
    if action.status != InsightAIAction.STATUS_PENDING:
        raise InsightAIActionError("This InsightPilot AI action is no longer pending.")
    if action.expires_at <= timezone.now():
        action.status = InsightAIAction.STATUS_EXPIRED
        action.resolved_at = timezone.now()
        action.save(update_fields=["status", "resolved_at", "updated_at"])
        raise InsightAIActionError("This InsightPilot AI action expired. Ask the AI to prepare it again.")
    return action


def _execute_create_plan(action: InsightAIAction, options: dict[str, Any]) -> dict[str, Any]:
    payload = action.payload
    available = [o["pace"] for o in payload["preview"]["options"]]
    pace = str(options.get("pace") or ("middle" if "middle" in available else available[0])).strip().lower()
    if pace not in available:
        raise InsightAIActionError(f"Choose one of: {', '.join(available)}.")
    data = {
        **payload["inputs"],
        "pace": pace,
        "equipment": payload.get("equipment", ""),
        "explanation": payload.get("explanation", ""),
        "workout_days": payload.get("workout_days", []),
    }
    if payload.get("food_preferences") is not None:
        data["food_preferences"] = payload["food_preferences"]
    # Inputs were checked when the card was made, but the start date may have moved on.
    data.pop("start_date", None)
    try:
        plan = plan_service.create_plan(action.user, data)
    except PlanInputError as exc:
        raise InsightAIActionError(str(exc)) from exc
    return {"plan_id": plan.id, "pace": plan.pace, "daily_calorie_target": plan.daily_calorie_target}


def _execute_update_program(action: InsightAIAction) -> dict[str, Any]:
    payload = action.payload
    plan = Plan.objects.filter(id=payload.get("plan_id"), owner=action.user, status=Plan.STATUS_ACTIVE).first()
    if plan is None:
        raise InsightAIActionError("That plan is no longer active, so this change can't be applied.")
    try:
        plan = plan_service.replace_program(plan, payload["workout_days"], payload.get("weekly_training"))
    except PlanInputError as exc:
        raise InsightAIActionError(str(exc)) from exc
    return {"plan_id": plan.id, "daily_calorie_target": plan.daily_calorie_target}


def _plan_for_action(action: InsightAIAction) -> Plan:
    plan = Plan.objects.filter(id=action.payload.get("plan_id"), owner=action.user, status=Plan.STATUS_ACTIVE).first()
    if plan is None:
        raise InsightAIActionError("That plan is no longer active, so this change can't be applied.")
    return plan


def _execute_delete_plan(action: InsightAIAction) -> dict[str, Any]:
    plan = plan_service.archive_plan(_plan_for_action(action))
    return {"plan_id": plan.id, "status": plan.status}


def _execute_update_plan(action: InsightAIAction) -> dict[str, Any]:
    try:
        plan = plan_service.set_plan_pace(_plan_for_action(action), action.payload["pace"])
    except PlanInputError as exc:
        raise InsightAIActionError(str(exc)) from exc
    return {"plan_id": plan.id, "pace": plan.pace, "daily_calorie_target": plan.daily_calorie_target}


def _execute_edit_diary(action: InsightAIAction) -> dict[str, Any]:
    payload = action.payload
    delete_ids = payload.get("delete") or []
    updates = payload.get("update") or []
    wanted = set(delete_ids) | {u["entry_id"] for u in updates}
    entries = {e.id: e for e in MealEntry.objects.filter(owner=action.user, id__in=wanted)}
    if wanted - entries.keys():
        raise InsightAIActionError("Some of these diary entries were already removed. Ask the AI to prepare it again.")
    for update in updates:
        entry = entries[update["entry_id"]]
        if "quantity" in update:
            entry.servings = update["quantity"]
        if "meal_type" in update:
            entry.meal_type = update["meal_type"]
        if "entry_date" in update:
            entry.entry_date = date.fromisoformat(update["entry_date"])
        entry.save()
    MealEntry.objects.filter(owner=action.user, id__in=delete_ids).delete()
    added = [_create_meal_entry(action.user, item).id for item in payload.get("add") or []]
    return {"added_ids": added, "updated": len(updates), "deleted": len(delete_ids)}


def _execute_log_weight(action: InsightAIAction) -> dict[str, Any]:
    entry, _ = WeightEntry.objects.update_or_create(
        owner=action.user,
        entry_date=date.fromisoformat(action.payload["entry_date"]),
        defaults={"weight_kg": action.payload["weight_kg"]},
    )
    return {"weight_entry_id": entry.id, "entry_date": entry.entry_date.isoformat(), "weight_kg": entry.weight_kg}


EXECUTORS = {
    InsightAIAction.TYPE_DELETE_PLAN: _execute_delete_plan,
    InsightAIAction.TYPE_UPDATE_PLAN: _execute_update_plan,
    InsightAIAction.TYPE_EDIT_DIARY: _execute_edit_diary,
    InsightAIAction.TYPE_LOG_WEIGHT: _execute_log_weight,
}


def confirm_pending_action(user, action_id: int, options: dict[str, Any] | None = None) -> InsightAIAction:
    options = options or {}
    with transaction.atomic():
        action = _get_pending_action(user, action_id)
        try:
            if action.action_type == InsightAIAction.TYPE_LOG_MEAL:
                result = _execute_log_meal(action)
            elif action.action_type == InsightAIAction.TYPE_CREATE_PLAN:
                result = _execute_create_plan(action, options)
            elif action.action_type == InsightAIAction.TYPE_UPDATE_PROGRAM:
                result = _execute_update_program(action)
            elif action.action_type in EXECUTORS:
                result = EXECUTORS[action.action_type](action)
            else:
                raise InsightAIActionError("Unsupported InsightPilot AI action.")
        except InsightAIError as exc:
            action.status = InsightAIAction.STATUS_FAILED
            action.error_message = str(exc)
            action.resolved_at = timezone.now()
            action.save(update_fields=["status", "error_message", "resolved_at", "updated_at"])
            raise

        action.status = InsightAIAction.STATUS_CONFIRMED
        action.result_payload = result
        action.resolved_at = timezone.now()
        action.save(update_fields=["status", "result_payload", "resolved_at", "updated_at"])
        return action


def cancel_pending_action(user, action_id: int) -> InsightAIAction:
    action = _get_pending_action(user, action_id)
    action.status = InsightAIAction.STATUS_CANCELLED
    action.resolved_at = timezone.now()
    action.save(update_fields=["status", "resolved_at", "updated_at"])
    return action
