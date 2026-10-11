"""Photo meal analysis: send a food photo to the configured AI provider and
get back a structured list of detected foods with estimated portions/macros.
"""

from __future__ import annotations

import json
from typing import Any

import requests

from .models import InsightAIUsage
from .services import (
    AIProviderRequestError,
    _extract_gemini_text,
    _extract_gemini_usage,
    _extract_openai_text,
    _extract_openai_usage,
    _preview,
    _setting_int,
    get_ai_model,
    get_ai_provider,
    get_api_key,
)

PHOTO_PROMPT = """You are a nutrition analysis assistant. Look at this photo of food and identify every distinct food item visible.

Respond with ONLY a JSON object in this exact shape, no other text:
{
  "foods": [
    {
      "name": "food name",
      "estimated_grams": 150,
      "calories": 250,
      "protein_grams": 20,
      "carbs_grams": 30,
      "fat_grams": 8,
      "fiber_grams": 3,
      "sugar_grams": 5,
      "sodium_mg": 400
    }
  ],
  "notes": "one short sentence about confidence or assumptions"
}

Estimate realistic portion sizes from the photo. Nutrition values must be for the WHOLE estimated portion, not per 100g. If the image contains no food, return {"foods": [], "notes": "No food detected."}."""


def _parse_photo_response(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end <= start:
            raise AIProviderRequestError("The AI response could not be parsed.")
        try:
            data = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise AIProviderRequestError("The AI response could not be parsed.") from exc

    foods = data.get("foods")
    if not isinstance(foods, list):
        raise AIProviderRequestError("The AI response had no food list.")

    normalized = []
    for item in foods:
        if not isinstance(item, dict) or not item.get("name"):
            continue
        normalized.append(
            {
                "name": str(item.get("name"))[:200],
                "estimated_grams": _safe_float(item.get("estimated_grams"), 100),
                "calories": _safe_float(item.get("calories")),
                "protein_grams": _safe_float(item.get("protein_grams")),
                "carbs_grams": _safe_float(item.get("carbs_grams")),
                "fat_grams": _safe_float(item.get("fat_grams")),
                "fiber_grams": _safe_float(item.get("fiber_grams")),
                "sugar_grams": _safe_float(item.get("sugar_grams")),
                "sodium_mg": _safe_float(item.get("sodium_mg")),
            }
        )
    return {"foods": normalized, "notes": str(data.get("notes") or "")[:300]}


def _safe_float(value, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return max(round(result, 2), 0.0)


def analyze_food_photo(user, image_base64: str, mime_type: str = "image/jpeg") -> dict[str, Any]:
    provider = get_ai_provider()
    model = get_ai_model(provider)
    timeout = _setting_int("INSIGHT_AI_TIMEOUT_SECONDS", 45)

    if provider == "openai":
        url = "https://api.openai.com/v1/responses"
        headers = {
            "Authorization": f"Bearer {get_api_key('openai')}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "input": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": PHOTO_PROMPT},
                        {
                            "type": "input_image",
                            "image_url": f"data:{mime_type};base64,{image_base64}",
                        },
                    ],
                }
            ],
        }
    else:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent"
        )
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": get_api_key("gemini"),
        }
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": PHOTO_PROMPT},
                        {"inline_data": {"mime_type": mime_type, "data": image_base64}},
                    ]
                }
            ]
        }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=timeout)
    except requests.RequestException as exc:
        InsightAIUsage.objects.create(
            user=user,
            provider=provider,
            model=model,
            status=InsightAIUsage.STATUS_ERROR,
            message_preview="[photo analysis]",
            error_message=str(exc),
        )
        raise AIProviderRequestError("Could not reach the AI provider.") from exc

    if response.status_code >= 400:
        InsightAIUsage.objects.create(
            user=user,
            provider=provider,
            model=model,
            status=InsightAIUsage.STATUS_ERROR,
            message_preview="[photo analysis]",
            error_message=response.text[:1000],
        )
        raise AIProviderRequestError("The AI provider rejected the photo analysis request.")

    data = response.json()
    if provider == "openai":
        text = _extract_openai_text(data)
        usage = _extract_openai_usage(data)
    else:
        text = _extract_gemini_text(data)
        usage = _extract_gemini_usage(data)

    result = _parse_photo_response(text)

    InsightAIUsage.objects.create(
        user=user,
        provider=provider,
        model=model,
        status=InsightAIUsage.STATUS_SUCCESS,
        message_preview="[photo analysis]",
        response_preview=_preview(text),
        prompt_tokens=usage["prompt_tokens"],
        completion_tokens=usage["completion_tokens"],
        total_tokens=usage["total_tokens"],
    )
    return result
