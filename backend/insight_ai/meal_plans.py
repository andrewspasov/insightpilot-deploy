"""Generate example meals for a plan's daily targets with the configured AI provider."""

from __future__ import annotations

from typing import Any

import requests
from django.db import transaction

from nutrition.models import NutritionProfile, Plan
from nutrition.planning import PlanInputError
from nutrition.meal_library import AVOID_OPTIONS, LIKE_OPTIONS, MEAL_SPLIT, scale_to_target
from nutrition.plans import replace_meal_options

from .models import InsightAIUsage
from .services import (
    AIProviderRequestError,
    _extract_gemini_text,
    _extract_gemini_usage,
    _extract_openai_text,
    _extract_openai_usage,
    _load_json_object,
    _preview,
    _setting_int,
    get_ai_model,
    get_ai_provider,
    get_api_key,
)

USAGE_LABEL = "[plan example meals]"


def _meal_targets(plan: Plan) -> dict[str, dict[str, int]]:
    return {
        meal: {
            "calories": round(plan.daily_calorie_target * share),
            "protein_grams": round(plan.protein_target_grams * share),
            "carbs_grams": round(plan.carbs_target_grams * share),
            "fat_grams": round(plan.fat_target_grams * share),
        }
        for meal, share in MEAL_SPLIT.items()
    }


def _labels(keys: list[str], options: list[tuple[str, str]]) -> str:
    names = dict(options)
    return ", ".join(names.get(k, k) for k in keys)


def build_prompt(plan: Plan, food_preferences: str, liked: list[str] | None = None, avoided: list[str] | None = None) -> str:
    targets = _meal_targets(plan)
    lines = [
        "Create example meals for someone following this nutrition plan.",
        f"Goal: {plan.get_goal_type_display()}. Daily target: {plan.daily_calorie_target} kcal, "
        f"protein {plan.protein_target_grams:g} g, carbs {plan.carbs_target_grams:g} g, fat {plan.fat_target_grams:g} g.",
        "Give exactly 3 different options for each of breakfast, lunch, dinner and snacks (12 meals in total). Each option should land close "
        "to that meal's target below, so any breakfast + lunch + dinner + snack combination hits the day:",
    ]
    for meal, t in targets.items():
        lines.append(
            f"- {meal}: about {t['calories']} kcal, P {t['protein_grams']} g, C {t['carbs_grams']} g, F {t['fat_grams']} g"
        )
    lines += [
        "Use common, affordable whole foods and simple preparation. List every ingredient as its own item with a "
        "realistic quantity in g, ml or pieces, and that item's calories and macros for the whole quantity.",
        f"Diet and allergies: {_labels(avoided or [], AVOID_OPTIONS) or 'none'}. "
        f"Other foods to avoid: {food_preferences.strip() or 'none'}. Never include anything the user avoids.",
        f"Foods they enjoy (use these often): {_labels(liked or [], LIKE_OPTIONS) or 'no preference'}.",
        "Give each option a short appetising name and a one-sentence description.",
    ]
    return "\n".join(lines)


def _response_schema() -> dict[str, Any]:
    item = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "food_name": {"type": "string"},
            "quantity": {"type": "number"},
            "unit": {"type": "string"},
            "calories": {"type": "number"},
            "protein_grams": {"type": "number"},
            "carbs_grams": {"type": "number"},
            "fat_grams": {"type": "number"},
        },
        "required": ["food_name", "quantity", "unit", "calories", "protein_grams", "carbs_grams", "fat_grams"],
    }
    meal = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "name": {"type": "string"},
            "description": {"type": "string"},
            "items": {"type": "array", "items": item},
        },
        "required": ["name", "description", "items"],
    }
    # One required list per meal type so the model can't stop after breakfast.
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {meal_type: {"type": "array", "items": meal} for meal_type in MEAL_SPLIT},
        "required": list(MEAL_SPLIT),
    }


def _request(provider: str, prompt: str) -> tuple[str, dict[str, int]]:
    model = get_ai_model(provider)
    max_tokens = _setting_int("INSIGHT_AI_MEALS_MAX_OUTPUT_TOKENS", 6000)
    timeout = _setting_int("INSIGHT_AI_MEALS_TIMEOUT_SECONDS", 90)
    if provider == "openai":
        response = requests.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {get_api_key('openai')}", "Content-Type": "application/json"},
            json={
                "model": model,
                "input": [{"role": "user", "content": prompt}],
                "text": {
                    "format": {
                        "type": "json_schema",
                        "name": "plan_example_meals",
                        "strict": True,
                        "schema": _response_schema(),
                    }
                },
                "max_output_tokens": max_tokens,
                "store": False,
            },
            timeout=timeout,
        )
    else:
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"Content-Type": "application/json", "x-goog-api-key": get_api_key("gemini")},
            json={
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "text": prompt
                                + '\nRespond with JSON only: {"breakfast": [meal, meal, meal], "lunch": [...], '
                                '"dinner": [...], "snacks": [...]} where meal is {"name", "description", '
                                '"items": [{"food_name", "quantity", "unit", "calories", "protein_grams", '
                                '"carbs_grams", "fat_grams"}]}'
                            }
                        ],
                    }
                ],
                "generationConfig": {
                    "temperature": 0.7,
                    "maxOutputTokens": max_tokens,
                    "responseMimeType": "application/json",
                },
            },
            timeout=timeout,
        )
    if response.status_code >= 400:
        raise AIProviderRequestError(f"The AI provider returned an error ({response.status_code}).")
    data = response.json()
    if provider == "openai":
        return _extract_openai_text(data), _extract_openai_usage(data)
    return _extract_gemini_text(data), _extract_gemini_usage(data)


def generate_meal_options(user, plan: Plan) -> Plan:
    """Ask the AI for example meals and store them on the plan (replacing old ones)."""
    profile = NutritionProfile.objects.filter(owner=user).first()
    prompt = build_prompt(
        plan,
        profile.food_preferences if profile else "",
        profile.liked_foods if profile else [],
        profile.avoided_foods if profile else [],
    )
    provider = get_ai_provider()
    model = get_ai_model(provider)

    try:
        text, usage = _request(provider, prompt)
    except (requests.RequestException, AIProviderRequestError) as exc:
        InsightAIUsage.objects.create(
            user=user,
            provider=provider,
            model=model,
            status=InsightAIUsage.STATUS_ERROR,
            message_preview=USAGE_LABEL,
            error_message=str(exc)[:1000],
        )
        raise AIProviderRequestError("Could not generate example meals. Please try again.") from exc

    InsightAIUsage.objects.create(
        user=user,
        provider=provider,
        model=model,
        status=InsightAIUsage.STATUS_SUCCESS,
        message_preview=USAGE_LABEL,
        response_preview=_preview(text),
        prompt_tokens=usage["prompt_tokens"],
        completion_tokens=usage["completion_tokens"],
        total_tokens=usage["total_tokens"],
    )

    data = _load_json_object(text) or {}
    targets = _meal_targets(plan)
    meals = [
        scale_to_target({**meal, "meal_type": meal_type}, targets[meal_type]["calories"])
        for meal_type in MEAL_SPLIT
        for meal in (data.get(meal_type) or [])[:3]
        if isinstance(meal, dict) and meal.get("items")
    ]
    if not meals:
        raise AIProviderRequestError("The AI didn't return any meals. Please try again.")
    try:
        with transaction.atomic():
            replace_meal_options(plan, meals)
    except PlanInputError as exc:
        raise AIProviderRequestError(f"The AI returned meals the app couldn't use: {exc}") from exc
    return plan

