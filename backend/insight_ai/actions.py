from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from nutrition.models import MealEntry

from .models import InsightAIAction
from .services import InsightAIError


class InsightAIActionError(InsightAIError):
    status_code = 400


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


def create_pending_action(user, proposed_action: dict[str, Any] | None, message: str | None = None) -> InsightAIAction | None:
    if not proposed_action:
        return None

    action_type = str(proposed_action.get("type") or proposed_action.get("action_type") or "").strip()
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


def _execute_log_meal(action: InsightAIAction) -> dict[str, Any]:
    payload = action.payload
    quantity = _as_float(payload["quantity"])
    unit = _normalize_unit(payload["unit"])
    is_grams = unit == "g"
    entry = MealEntry.objects.create(
        owner=action.user,
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


def confirm_pending_action(user, action_id: int) -> InsightAIAction:
    with transaction.atomic():
        action = _get_pending_action(user, action_id)
        try:
            if action.action_type == InsightAIAction.TYPE_LOG_MEAL:
                result = _execute_log_meal(action)
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
