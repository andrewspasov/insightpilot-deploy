from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import requests
from django.conf import settings
from django.db.models import Sum
from django.utils import timezone

from billing.permissions import has_tool_access
from nutrition.models import MealEntry, NutritionProfile, WeightEntry

from .models import InsightAIUsage


class InsightAIError(Exception):
    status_code = 400


class InsightAIConfigError(InsightAIError):
    status_code = 503


class InsightAIAccessError(InsightAIError):
    status_code = 403


class InsightAILimitError(InsightAIError):
    status_code = 429


class AIProviderRequestError(InsightAIError):
    status_code = 502


@dataclass(frozen=True)
class AIProviderResult:
    text: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    raw_usage: dict[str, Any]


VALID_AI_PROVIDERS = {"gemini", "openai"}


def _setting_int(name: str, default: int) -> int:
    value = getattr(settings, name, default)
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def get_ai_provider() -> str:
    provider = str(getattr(settings, "INSIGHT_AI_PROVIDER", "gemini") or "gemini").strip().lower()
    if provider not in VALID_AI_PROVIDERS:
        return "gemini"
    return provider


def get_ai_model(provider: str | None = None) -> str:
    selected_provider = provider or get_ai_provider()
    if selected_provider == "openai":
        return getattr(settings, "INSIGHT_AI_OPENAI_MODEL", "gpt-4.1-nano") or "gpt-4.1-nano"
    return getattr(settings, "INSIGHT_AI_MODEL", "gemini-2.5-flash-lite") or "gemini-2.5-flash-lite"


def get_api_key(provider: str | None = None) -> str:
    selected_provider = provider or get_ai_provider()
    if selected_provider == "openai":
        api_key = getattr(settings, "INSIGHT_AI_OPENAI_API_KEY", "") or getattr(settings, "OPENAI_API_KEY", "")
        return str(api_key).strip()
    return str(getattr(settings, "INSIGHT_AI_GEMINI_API_KEY", "")).strip()


def get_allowed_emails() -> set[str]:
    raw = getattr(settings, "INSIGHT_AI_ALLOWED_EMAILS", "")
    if isinstance(raw, str):
        values = raw.split(",")
    else:
        values = raw or []
    return {str(value).strip().lower() for value in values if str(value).strip()}


def is_configured() -> bool:
    return bool(get_api_key())


def user_has_private_ai_access(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True
    allowed_emails = get_allowed_emails()
    return bool(user.email and user.email.lower() in allowed_emails)


def user_has_nutrition_access(user) -> bool:
    return has_tool_access(user, "nutrition")


def month_start(now=None):
    current = now or timezone.now()
    return current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def get_monthly_usage(user) -> dict[str, int]:
    queryset = InsightAIUsage.objects.filter(
        user=user,
        status=InsightAIUsage.STATUS_SUCCESS,
        created_at__gte=month_start(),
    )
    totals = queryset.aggregate(
        prompt_tokens=Sum("prompt_tokens"),
        completion_tokens=Sum("completion_tokens"),
        total_tokens=Sum("total_tokens"),
    )
    return {
        "messages": queryset.count(),
        "prompt_tokens": int(totals["prompt_tokens"] or 0),
        "completion_tokens": int(totals["completion_tokens"] or 0),
        "total_tokens": int(totals["total_tokens"] or 0),
    }


def get_limits() -> dict[str, int]:
    return {
        "monthly_messages": _setting_int("INSIGHT_AI_MONTHLY_MESSAGE_LIMIT", 100),
        "monthly_tokens": _setting_int("INSIGHT_AI_MONTHLY_TOKEN_LIMIT", 100000),
    }


def assert_chat_allowed(user) -> None:
    if not is_configured():
        provider_name = "OpenAI" if get_ai_provider() == "openai" else "Gemini"
        raise InsightAIConfigError(
            f"InsightPilot AI is not configured. Add the {provider_name} API key on the backend."
        )
    if not user_has_nutrition_access(user):
        raise InsightAIAccessError("Nutrition access is required to use InsightPilot AI.")
    if not user_has_private_ai_access(user):
        raise InsightAIAccessError("InsightPilot AI is private for testing. Add this user's email to the allowlist.")

    limits = get_limits()
    usage = get_monthly_usage(user)
    if usage["messages"] >= limits["monthly_messages"]:
        raise InsightAILimitError("Monthly InsightPilot AI message limit reached.")
    if usage["total_tokens"] >= limits["monthly_tokens"]:
        raise InsightAILimitError("Monthly InsightPilot AI token limit reached.")


def _default_profile_values() -> dict[str, float | int | str]:
    return {
        "goal_type": NutritionProfile.GOAL_TRACK,
        "daily_calorie_target": 2000,
        "protein_target_grams": 150.0,
        "carbs_target_grams": 250.0,
        "fat_target_grams": 70.0,
    }


def _get_or_create_profile(user) -> NutritionProfile:
    profile, _ = NutritionProfile.objects.get_or_create(
        owner=user,
        defaults=_default_profile_values(),
    )
    return profile


def _entry_totals(entries: list[MealEntry]) -> dict[str, float]:
    totals = {
        "calories": 0.0,
        "protein_grams": 0.0,
        "carbs_grams": 0.0,
        "fat_grams": 0.0,
        "fiber_grams": 0.0,
        "sugar_grams": 0.0,
        "sodium_mg": 0.0,
    }
    for entry in entries:
        totals["calories"] += entry.calories
        totals["protein_grams"] += entry.protein_grams
        totals["carbs_grams"] += entry.carbs_grams
        totals["fat_grams"] += entry.fat_grams
        totals["fiber_grams"] += entry.fiber_grams
        totals["sugar_grams"] += entry.sugar_grams
        totals["sodium_mg"] += entry.sodium_mg
    return {key: round(value, 2) for key, value in totals.items()}


def build_nutrition_context(user) -> dict[str, Any]:
    today = timezone.localdate()
    start_date = today - timedelta(days=6)
    profile = _get_or_create_profile(user)
    entries = list(
        MealEntry.objects.filter(
            owner=user,
            entry_date__gte=start_date,
            entry_date__lte=today,
        ).order_by("entry_date", "meal_type", "created_at")
    )
    weights = list(WeightEntry.objects.filter(owner=user).order_by("-entry_date", "-created_at")[:7])

    daily_totals = []
    for offset in range(7):
        current_date = start_date + timedelta(days=offset)
        day_entries = [entry for entry in entries if entry.entry_date == current_date]
        daily_totals.append(
            {
                "date": str(current_date),
                "entries_count": len(day_entries),
                "totals": _entry_totals(day_entries),
            }
        )

    today_entries = [entry for entry in entries if entry.entry_date == today]
    return {
        "today": str(today),
        "profile": {
            "goal_type": profile.goal_type,
            "daily_calorie_target": profile.daily_calorie_target,
            "protein_target_grams": profile.protein_target_grams,
            "carbs_target_grams": profile.carbs_target_grams,
            "fat_target_grams": profile.fat_target_grams,
        },
        "today_totals": _entry_totals(today_entries),
        "today_foods": [
            {
                "meal_type": entry.meal_type,
                "food_name": entry.food_name,
                "servings": entry.servings,
                "calories": entry.calories,
                "protein_grams": entry.protein_grams,
                "carbs_grams": entry.carbs_grams,
                "fat_grams": entry.fat_grams,
            }
            for entry in today_entries[:20]
        ],
        "last_7_days": daily_totals,
        "recent_weights": [
            {
                "date": str(weight.entry_date),
                "weight_kg": weight.weight_kg,
                "note": weight.note,
            }
            for weight in weights
        ],
    }


def _system_instruction() -> str:
    return (
        "You are InsightPilot AI, a private AI assistant inside the InsightPilot nutrition app. "
        "Use the provided nutrition context to answer clearly and practically. "
        "You are read-only: do not claim that you logged, edited, deleted, or changed app data. "
        "Do not provide medical diagnosis or emergency advice. "
        "If the user asks for medical or clinical guidance, suggest talking to a qualified professional. "
        "Keep answers concise, specific, and action-oriented."
    )


def _context_as_text(context: dict[str, Any]) -> str:
    lines = [
        f"Today: {context['today']}",
        "User nutrition targets:",
        (
            f"- Calories: {context['profile']['daily_calorie_target']}, "
            f"protein: {context['profile']['protein_target_grams']}g, "
            f"carbs: {context['profile']['carbs_target_grams']}g, "
            f"fat: {context['profile']['fat_target_grams']}g"
        ),
        "Today's totals:",
        (
            f"- Calories: {context['today_totals']['calories']}, "
            f"protein: {context['today_totals']['protein_grams']}g, "
            f"carbs: {context['today_totals']['carbs_grams']}g, "
            f"fat: {context['today_totals']['fat_grams']}g"
        ),
    ]

    if context["today_foods"]:
        lines.append("Foods logged today:")
        for food in context["today_foods"]:
            lines.append(
                f"- {food['meal_type']}: {food['food_name']} "
                f"({food['calories']} kcal, P {food['protein_grams']}g, "
                f"C {food['carbs_grams']}g, F {food['fat_grams']}g)"
            )
    else:
        lines.append("Foods logged today: none")

    lines.append("Last 7 days:")
    for day in context["last_7_days"]:
        totals = day["totals"]
        lines.append(
            f"- {day['date']}: {totals['calories']} kcal, "
            f"P {totals['protein_grams']}g, C {totals['carbs_grams']}g, "
            f"F {totals['fat_grams']}g, entries {day['entries_count']}"
        )

    if context["recent_weights"]:
        lines.append("Recent weights:")
        for weight in context["recent_weights"]:
            note = f", note: {weight['note']}" if weight["note"] else ""
            lines.append(f"- {weight['date']}: {weight['weight_kg']} kg{note}")

    return "\n".join(lines)


def _sanitize_gemini_history(history: list[dict[str, str]]) -> list[dict[str, Any]]:
    contents = []
    for item in history[-10:]:
        role = item.get("role")
        text = (item.get("content") or "").strip()
        if not text:
            continue
        if role == "assistant":
            role = "model"
        if role not in {"user", "model"}:
            continue
        contents.append({"role": role, "parts": [{"text": text[:3000]}]})
    return contents


def _build_gemini_payload(message: str, history: list[dict[str, str]], context: dict[str, Any]) -> dict[str, Any]:
    context_text = _context_as_text(context)
    current_message = (
        "Current nutrition context from InsightPilot:\n"
        f"{context_text}\n\n"
        "User message:\n"
        f"{message}"
    )
    return {
        "system_instruction": {"parts": {"text": _system_instruction()}},
        "contents": [
            *_sanitize_gemini_history(history),
            {"role": "user", "parts": [{"text": current_message}]},
        ],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": _setting_int("INSIGHT_AI_MAX_OUTPUT_TOKENS", 700),
            "candidateCount": 1,
        },
    }


def _extract_gemini_text(data: dict[str, Any]) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        raise AIProviderRequestError("Gemini did not return a response candidate.")

    parts = ((candidates[0].get("content") or {}).get("parts")) or []
    text_parts = [part.get("text", "") for part in parts if isinstance(part, dict) and part.get("text")]
    text = "\n".join(text_parts).strip()
    if not text:
        finish_reason = candidates[0].get("finishReason") or "unknown"
        raise AIProviderRequestError(f"Gemini returned no text. Finish reason: {finish_reason}.")
    return text


def _extract_gemini_usage(data: dict[str, Any]) -> dict[str, int]:
    usage = data.get("usageMetadata") or {}
    prompt_tokens = int(usage.get("promptTokenCount") or 0)
    completion_tokens = int(usage.get("candidatesTokenCount") or 0)
    total_tokens = int(usage.get("totalTokenCount") or (prompt_tokens + completion_tokens))
    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }


def _extract_gemini_error_message(response: requests.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return "Gemini returned an error the backend could not read."

    error_data = data.get("error") if isinstance(data, dict) else None
    if isinstance(error_data, dict) and error_data.get("message"):
        return str(error_data["message"])
    return "Gemini returned an error."


def _sanitize_openai_history(history: list[dict[str, str]]) -> list[dict[str, str]]:
    contents = []
    for item in history[-10:]:
        role = item.get("role")
        text = (item.get("content") or "").strip()
        if role not in {"user", "assistant"} or not text:
            continue
        contents.append({"role": role, "content": text[:3000]})
    return contents


def _build_openai_payload(message: str, history: list[dict[str, str]], context: dict[str, Any]) -> dict[str, Any]:
    context_text = _context_as_text(context)
    current_message = (
        "Current nutrition context from InsightPilot:\n"
        f"{context_text}\n\n"
        "User message:\n"
        f"{message}"
    )
    return {
        "model": get_ai_model("openai"),
        "instructions": _system_instruction(),
        "input": [
            *_sanitize_openai_history(history),
            {"role": "user", "content": current_message},
        ],
        "max_output_tokens": _setting_int("INSIGHT_AI_MAX_OUTPUT_TOKENS", 700),
        "store": False,
    }


def _extract_openai_text(data: dict[str, Any]) -> str:
    direct_text = data.get("output_text")
    if isinstance(direct_text, str) and direct_text.strip():
        return direct_text.strip()

    text_parts = []
    for item in data.get("output") or []:
        if not isinstance(item, dict):
            continue
        for part in item.get("content") or []:
            if isinstance(part, dict) and part.get("text"):
                text_parts.append(str(part["text"]))

    text = "\n".join(text_parts).strip()
    if not text:
        raise AIProviderRequestError("OpenAI did not return text.")
    return text


def _extract_openai_usage(data: dict[str, Any]) -> dict[str, int]:
    usage = data.get("usage") or {}
    prompt_tokens = int(usage.get("input_tokens") or 0)
    completion_tokens = int(usage.get("output_tokens") or 0)
    total_tokens = int(usage.get("total_tokens") or (prompt_tokens + completion_tokens))
    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }


def _extract_openai_error_message(response: requests.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return "OpenAI returned an error the backend could not read."

    error_data = data.get("error") if isinstance(data, dict) else None
    if isinstance(error_data, dict) and error_data.get("message"):
        return str(error_data["message"])
    return "OpenAI returned an error."


def _preview(text: str, limit: int = 600) -> str:
    cleaned = " ".join(text.split())
    return cleaned[:limit]


def call_gemini(user, message: str, history: list[dict[str, str]]) -> AIProviderResult:
    model = get_ai_model("gemini")
    payload = _build_gemini_payload(message, history, build_nutrition_context(user))
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    timeout = _setting_int("INSIGHT_AI_TIMEOUT_SECONDS", 30)

    try:
        response = requests.post(
            url,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": get_api_key("gemini"),
            },
            json=payload,
            timeout=timeout,
        )
    except requests.RequestException as exc:
        InsightAIUsage.objects.create(
            user=user,
            provider="gemini",
            model=model,
            status=InsightAIUsage.STATUS_ERROR,
            message_preview=_preview(message),
            error_message=str(exc),
        )
        raise AIProviderRequestError("Could not reach Gemini. Check your network and API key.") from exc

    if response.status_code >= 400:
        error_message = response.text[:1000]
        safe_message = _extract_gemini_error_message(response)
        InsightAIUsage.objects.create(
            user=user,
            provider="gemini",
            model=model,
            status=InsightAIUsage.STATUS_ERROR,
            message_preview=_preview(message),
            error_message=error_message,
        )
        raise AIProviderRequestError(f"Gemini error: {safe_message}")

    try:
        data = response.json()
    except ValueError as exc:
        InsightAIUsage.objects.create(
            user=user,
            provider="gemini",
            model=model,
            status=InsightAIUsage.STATUS_ERROR,
            message_preview=_preview(message),
            error_message=response.text[:1000],
        )
        raise AIProviderRequestError("Gemini returned a response the backend could not read.") from exc
    text = _extract_gemini_text(data)
    usage = _extract_gemini_usage(data)

    InsightAIUsage.objects.create(
        user=user,
        provider="gemini",
        model=model,
        status=InsightAIUsage.STATUS_SUCCESS,
        message_preview=_preview(message),
        response_preview=_preview(text),
        prompt_tokens=usage["prompt_tokens"],
        completion_tokens=usage["completion_tokens"],
        total_tokens=usage["total_tokens"],
    )

    return AIProviderResult(text=text, raw_usage=data.get("usageMetadata") or {}, **usage)


def call_openai(user, message: str, history: list[dict[str, str]]) -> AIProviderResult:
    model = get_ai_model("openai")
    payload = _build_openai_payload(message, history, build_nutrition_context(user))
    timeout = _setting_int("INSIGHT_AI_TIMEOUT_SECONDS", 30)

    try:
        response = requests.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {get_api_key('openai')}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=timeout,
        )
    except requests.RequestException as exc:
        InsightAIUsage.objects.create(
            user=user,
            provider="openai",
            model=model,
            status=InsightAIUsage.STATUS_ERROR,
            message_preview=_preview(message),
            error_message=str(exc),
        )
        raise AIProviderRequestError("Could not reach OpenAI. Check your network and API key.") from exc

    if response.status_code >= 400:
        error_message = response.text[:1000]
        safe_message = _extract_openai_error_message(response)
        InsightAIUsage.objects.create(
            user=user,
            provider="openai",
            model=model,
            status=InsightAIUsage.STATUS_ERROR,
            message_preview=_preview(message),
            error_message=error_message,
        )
        raise AIProviderRequestError(f"OpenAI error: {safe_message}")

    try:
        data = response.json()
    except ValueError as exc:
        InsightAIUsage.objects.create(
            user=user,
            provider="openai",
            model=model,
            status=InsightAIUsage.STATUS_ERROR,
            message_preview=_preview(message),
            error_message=response.text[:1000],
        )
        raise AIProviderRequestError("OpenAI returned a response the backend could not read.") from exc

    text = _extract_openai_text(data)
    usage = _extract_openai_usage(data)

    InsightAIUsage.objects.create(
        user=user,
        provider="openai",
        model=model,
        status=InsightAIUsage.STATUS_SUCCESS,
        message_preview=_preview(message),
        response_preview=_preview(text),
        prompt_tokens=usage["prompt_tokens"],
        completion_tokens=usage["completion_tokens"],
        total_tokens=usage["total_tokens"],
    )

    return AIProviderResult(text=text, raw_usage=data.get("usage") or {}, **usage)


def call_ai(user, message: str, history: list[dict[str, str]]) -> AIProviderResult:
    if get_ai_provider() == "openai":
        return call_openai(user, message, history)
    return call_gemini(user, message, history)
