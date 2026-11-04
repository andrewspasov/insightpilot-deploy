from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import requests
from django.conf import settings
from django.db.models import Sum
from django.utils import timezone

from billing.permissions import has_tool_access
from nutrition.models import MealEntry, NutritionProfile, Plan, WeightEntry

from .models import InsightAIAction, InsightAIUsage


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
    proposed_action: dict[str, Any] | None = None


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
        return getattr(settings, "INSIGHT_AI_OPENAI_MODEL", "gpt-5.4-nano") or "gpt-5.4-nano"
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


TRANSCRIPTION_PREVIEW = "[voice transcription]"
# Daily report emails use tokens but aren't chat messages.
REPORT_PREVIEW = "[daily report]"


def month_start(now=None):
    current = now or timezone.now()
    return current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def get_monthly_usage(user) -> dict[str, int]:
    # A voice message is transcribed and then sent as chat, so count it once.
    queryset = InsightAIUsage.objects.filter(
        user=user,
        status=InsightAIUsage.STATUS_SUCCESS,
        created_at__gte=month_start(),
    ).exclude(message_preview=TRANSCRIPTION_PREVIEW)
    totals = queryset.aggregate(
        prompt_tokens=Sum("prompt_tokens"),
        completion_tokens=Sum("completion_tokens"),
        total_tokens=Sum("total_tokens"),
    )
    return {
        "messages": queryset.exclude(message_preview=REPORT_PREVIEW).count(),
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
    # The last few days of foods carry their ids so the AI can edit or delete them.
    recent_start = today - timedelta(days=2)
    recent_entries = [entry for entry in entries if entry.entry_date >= recent_start]
    return {
        "today": str(today),
        "weekday": today.strftime("%A"),
        "profile": {
            "goal_type": profile.goal_type,
            "daily_calorie_target": profile.daily_calorie_target,
            "protein_target_grams": profile.protein_target_grams,
            "carbs_target_grams": profile.carbs_target_grams,
            "fat_target_grams": profile.fat_target_grams,
            "sex": profile.sex,
            "age": profile.age,
            "height_cm": profile.height_cm,
            "job_activity": profile.job_activity,
            "food_preferences": profile.food_preferences,
            "liked_foods": profile.liked_foods,
            "avoided_foods": profile.avoided_foods,
            "equipment": profile.equipment,
            "home_gear": profile.home_gear,
        },
        "active_plan": _plan_context(user),
        "proposed_plan": _proposed_plan_context(user),
        "today_totals": _entry_totals(today_entries),
        "recent_foods": [
            {
                "id": entry.id,
                "date": str(entry.entry_date),
                "meal_type": entry.meal_type,
                "food_name": entry.food_name,
                "quantity": entry.servings,
                "unit": entry.measurement_unit or entry.serving_description,
                "calories": entry.calories,
                "protein_grams": entry.protein_grams,
                "carbs_grams": entry.carbs_grams,
                "fat_grams": entry.fat_grams,
            }
            for entry in sorted(recent_entries, key=lambda e: e.entry_date, reverse=True)[:60]
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


def _plan_context(user) -> dict[str, Any] | None:
    plan = (
        Plan.objects.filter(owner=user, status=Plan.STATUS_ACTIVE)
        .prefetch_related("workout_days__exercises")
        .first()
    )
    if plan is None:
        return None
    return {
        "goal_type": plan.goal_type,
        "pace": plan.pace,
        "start_weight_kg": plan.start_weight_kg,
        "target_weight_kg": plan.target_weight_kg,
        "daily_calorie_target": plan.daily_calorie_target,
        "equipment": plan.equipment,
        "weekly_training": plan.weekly_training,
        "workout_days": [
            {
                "weekday": day.weekday,
                "title": day.title,
                "exercises": [
                    (
                        f"{ex.name} ({ex.duration_min} min)"
                        if ex.kind == "cardio"
                        else f"{ex.name} {ex.sets}x{ex.rep_min}-{ex.rep_max}"
                    )
                    for ex in day.exercises.all()
                ],
            }
            for day in plan.workout_days.all()
        ],
    }


def _proposed_plan_context(user) -> dict[str, Any] | None:
    """The newest plan card still waiting for the user, so the AI can adjust it before it is saved."""
    action = (
        InsightAIAction.objects.filter(
            user=user,
            action_type=InsightAIAction.TYPE_CREATE_PLAN,
            status=InsightAIAction.STATUS_PENDING,
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )
    if action is None:
        return None
    payload = action.payload
    return {
        "inputs": payload.get("inputs") or {},
        "equipment": payload.get("equipment") or "",
        "food_preferences": payload.get("food_preferences"),
        "workout_days": [
            {
                "weekday": day["weekday"],
                "title": day["title"],
                "exercises": [
                    (
                        f"{ex['name']} ({ex.get('duration_min')} min)"
                        if ex.get("kind") == "cardio"
                        else f"{ex['name']} {ex.get('sets')}x{ex.get('rep_min')}-{ex.get('rep_max')}"
                    )
                    for ex in day.get("exercises") or []
                ],
            }
            for day in payload.get("workout_days") or []
        ],
    }


PLAN_INSTRUCTIONS = (
    "PLANS: You can build a bulk (goal_type gain), cut (lose) or maintain plan with a weekly workout program. "
    "Never calculate calories or macros yourself; the app calculates them from the inputs and shows the user "
    "three pace options. Before building a plan, interview the user like a good coach, in short rounds of at most "
    "four questions each (a numbered list), one round per message, skipping anything already known from the "
    "context or conversation (never ask to confirm known values; convert pounds, feet and inches to metric). "
    "Round 1, basics: goal (bulk, cut or maintain), sex (male or female only), age, height, current weight, "
    "target weight (not for maintain) and how active they are outside training (desk, standing or physical job). "
    "Round 2, training, the most important round, so dig deeper here and use a second training round if needed: "
    "how many days a week they lift and on which weekdays; their split or what each day trains (if they don't have "
    "one, suggest one that fits their days, e.g. full body, upper/lower, push/pull/legs, push/pull/legs + "
    "upper/lower, Arnold split); how long a session lasts; gym or home (and at home, whether they have resistance "
    "bands or a pull-up bar); whether to add abs. If they do cardio: what type, how many times a week, on which "
    "days, how long, how hard (easy, moderate or intervals) and whether it is on lifting days. "
    "Round 3, food, keep it to one brief general question: foods they like and want to keep, foods they avoid, and "
    "any diet or allergies; accept 'nothing' and don't follow up. "
    "If the user says to decide for them, pick sensible defaults and say what you chose. Never build the plan while "
    "training days, split, session length or cardio details are unknown. "
    "Once everything is known set action_type create_plan and fill plan_payload; do not say you will do it later. "
    "With create_plan, reply in two or three sentences summing up the plan (split and cardio) and asking them to "
    "pick a pace below. "
    "meal_payload and plan_payload must be null unless that action is being prepared. weekday is 0 for Monday, 1 Tuesday, 2 Wednesday, 3 Thursday, 4 Friday, 5 Saturday and 6 Sunday. weekly_training lists every "
    "session: activity weights for lifting (include ab work in its minutes) and running, cycling, swimming, walking "
    "or hiit for cardio. workout_days has exactly one entry for every lifting day in weekly_training, never fewer; "
    "each gets a title naming the muscles (e.g. Push: chest, shoulders, triceps) and 5 to 7 strength exercises using standard gym "
    "names with equipment (e.g. Barbell Bench Press, Dumbbell Lateral Raise, Cable Crunch), each with primary_muscle "
    "and equipment, plus one or two ab exercises when the user trains abs, plus every cardio session that day as kind "
    "cardio with duration_min. Choose sensible sets and rep ranges for the goal. "
    "Put a two or three sentence explanation of the training approach in explanation. If the user already has an "
    "active plan and asks to change exercises or training days, set action_type update_program and give the "
    "complete new workout_days (and weekly_training only if session days or durations change, otherwise null); "
    "set body stat fields to null. If they want a different goal or target, use create_plan. "
    "update_program only changes an active (saved) plan. If the context shows a plan proposal waiting for "
    "confirmation and the user asks to change anything in it, set action_type create_plan (never update_program) straight away with every detail of that proposal plus the change (the new card "
    "replaces the old one); never ask again for anything the proposal or conversation already gives. "
    "Never say you prepared a plan or any other change unless action_type is set to that action in this reply."
)


EDIT_INSTRUCTIONS = (
    " EDITING: You can change any of the user's app data; never say you can't, prepare the action instead and the "
    "user confirms it on a card. To end, delete or remove the active plan use delete_plan (the plan is archived; "
    "logged foods, weights and workouts stay), with no payload. To change only how fast the plan goes (slower, "
    "faster, middle pace) use update_plan with plan_pace low (slowest), middle or extreme (fastest). "
    "To add one food use log_meal; it holds a single food only. When the user names two or more foods in one "
    "message (even for the same meal) always use edit_diary with every food in add, never log_meal. To add several foods, change a logged food or delete logged foods use edit_diary "
    "with diary_payload: add lists new foods (same fields as meal_payload), update lists changes to logged foods "
    "(entry_id from the food list, quantity in that entry's own unit, meal_type and entry_date; null for anything "
    "that stays the same) and delete lists entry ids to remove. Only use ids from the food list; if the user means "
    "a food that isn't listed, say you can only see the last 3 days. To copy foods to another day, add them again "
    "with the new date. To log body weight use log_weight with weight_payload (weight_kg in kilograms, converting "
    "pounds, and entry_date). Set every payload to null unless its action is being prepared. When the request is "
    "clear, prepare the action straight away using sensible estimates instead of asking about details. In the reply "
    "say what you prepared and that they can confirm it below; never say it is already done."
)


def _system_instruction() -> str:
    return (
        "You are InsightPilot AI, a private AI assistant inside the InsightPilot nutrition app. "
        "Use the provided nutrition context to answer clearly and practically. "
        "You can prepare app actions, but the app will only save changes after the user confirms. "
        "Never claim that you logged, edited, deleted, or changed app data until the user confirms. "
        "Do not provide medical diagnosis or emergency advice. "
        "If the user asks for medical or clinical guidance, suggest talking to a qualified professional. "
        "Keep answers concise, specific, and action-oriented. "
        "Always return JSON matching the provided response schema. "
        "Use meal_type breakfast, lunch, dinner, or snacks. Use total nutrition values for the full quantity. "
        "For common foods, estimate reasonable generic nutrition values and prepare the action for review. "
        "Do not ask the user to provide calories or macros for common foods. "
        "When the user asks to log a meal and gives enough detail, set action_type to log_meal and fill meal_payload. "
        "If the food, quantity, or meal type is missing, ask a short clarifying question and set action_type to none. "
        "If the user attaches a photo, describe the food you see and estimate the portion size. "
        "If they ask you to log it, set action_type to log_meal using your estimate from the image; "
        "if the meal type is unclear, infer it from the time of day and say which one you assumed. "
        + PLAN_INSTRUCTIONS
        + EDIT_INSTRUCTIONS
    )


WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _day_name(weekday: Any) -> str:
    try:
        return f"{WEEKDAY_NAMES[int(weekday)]} (weekday {int(weekday)})"
    except (TypeError, ValueError, IndexError):
        return f"weekday {weekday}"


def _sessions_text(sessions: list[dict[str, Any]]) -> str:
    """Spell out the days: the AI mixes up bare weekday numbers."""
    by_day: dict[int, list[str]] = {}
    for session in sessions or []:
        by_day.setdefault(int(session.get("weekday", 0)), []).append(
            f"{session.get('activity')} {session.get('duration_min')} min"
        )
    if not by_day:
        return "none"
    return "; ".join(f"{_day_name(day)}: {', '.join(items)}" for day, items in sorted(by_day.items()))


def _context_as_text(context: dict[str, Any]) -> str:
    lines = [
        f"Today: {context['today']} ({context.get('weekday', '')})",
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

    if context["recent_foods"]:
        lines.append("Foods logged in the last 3 days (id, date, meal, food, amount):")
        for food in context["recent_foods"]:
            lines.append(
                f"- id {food['id']}, {food['date']}, {food['meal_type']}: {food['food_name']}, "
                f"{food['quantity']:g} {food['unit']} ({food['calories']} kcal, P {food['protein_grams']}g, "
                f"C {food['carbs_grams']}g, F {food['fat_grams']}g)"
            )
    else:
        lines.append("Foods logged in the last 3 days: none")

    profile = context["profile"]
    stats = []
    if profile.get("sex"):
        stats.append(profile["sex"])
    if profile.get("age"):
        stats.append(f"age {profile['age']}")
    if profile.get("height_cm"):
        stats.append(f"{profile['height_cm']} cm")
    if profile.get("job_activity"):
        stats.append(f"job activity {profile['job_activity']}")
    if stats:
        lines.append("Body stats: " + ", ".join(stats))
    if profile.get("avoided_foods"):
        lines.append(f"Diet/allergies: {', '.join(profile['avoided_foods'])}")
    if profile.get("food_preferences"):
        lines.append(f"Foods avoided: {profile['food_preferences']}")
    if profile.get("liked_foods"):
        lines.append(f"Foods liked: {', '.join(profile['liked_foods'])}")
    if profile.get("equipment"):
        if profile["equipment"] == "home":
            gear = {"bands": "resistance bands", "pull_up_bar": "pull-up bar"}
            owned = [gear[k] for k in profile.get("home_gear") or [] if k in gear]
            lines.append(f"Training equipment: home/bodyweight, with {', '.join(owned) or 'no extra gear'}")
        else:
            lines.append("Training equipment: full gym")

    plan = context.get("active_plan")
    if plan:
        lines.append(
            f"Active plan: {plan['goal_type']} at {plan['pace']} pace, "
            f"{plan['start_weight_kg']} kg -> {plan['target_weight_kg']} kg, "
            f"{plan['daily_calorie_target']} kcal/day, equipment: {plan['equipment'] or 'not specified'}"
        )
        lines.append(f"Plan training sessions: {_sessions_text(plan['weekly_training'])}")
        for day in plan["workout_days"]:
            lines.append(f"- {_day_name(day['weekday'])} {day['title']}: {'; '.join(day['exercises'])}")
    else:
        lines.append("Active plan: none")

    proposal = context.get("proposed_plan")
    if proposal:
        inputs = proposal["inputs"]
        lines.append(
            "Plan proposal waiting for the user to confirm (not saved yet): "
            + ", ".join(
                f"{key} {inputs.get(key)}"
                for key in ("goal_type", "sex", "age", "height_cm", "weight_kg", "target_weight_kg", "job_activity")
            )
            + f", equipment: {proposal['equipment'] or 'not specified'}"
            + f", food preferences: {proposal['food_preferences'] or 'none'}"
        )
        lines.append(f"Proposal training sessions: {_sessions_text(inputs.get('weekly_training') or [])}")
        for day in proposal["workout_days"]:
            lines.append(f"- {_day_name(day['weekday'])} {day['title']}: {'; '.join(day['exercises'])}")

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


def _history_limit() -> int:
    # Plan interviews run long; the AI must still see the early answers.
    return _setting_int("INSIGHT_AI_HISTORY_MESSAGES", 30)


def _chat_max_output_tokens() -> int:
    # Any chat turn can turn into a full plan, so the ceiling must fit one.
    # It is only a cap: ordinary replies stay short and cost the same.
    return max(
        _setting_int("INSIGHT_AI_MAX_OUTPUT_TOKENS", 700),
        _setting_int("INSIGHT_AI_PLAN_MAX_OUTPUT_TOKENS", 3000),
    )


def _sanitize_gemini_history(history: list[dict[str, str]]) -> list[dict[str, Any]]:
    contents = []
    for item in history[-_history_limit():]:
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


GEMINI_SHAPE_HINT = (
    " Respond with one JSON object with keys reply, action_type (none, log_meal, create_plan, update_program, "
    "delete_plan, update_plan, edit_diary or log_weight), action_summary, meal_payload (object or null), "
    "plan_payload (object or null), plan_pace (string or null), diary_payload (object or null) and weight_payload "
    "(object or null). diary_payload keys: add [meal_payload objects], update [{entry_id, quantity, meal_type, "
    "entry_date}], delete [entry ids]. weight_payload keys: entry_date, weight_kg. "
    "meal_payload keys: entry_date, meal_type, food_name, brand_name, quantity, unit, calories, protein_grams, "
    "carbs_grams, fat_grams, fiber_grams, sugar_grams, sodium_mg. plan_payload keys: goal_type, sex, age, "
    "height_cm, weight_kg, target_weight_kg, job_activity, equipment, food_preferences, explanation, "
    "weekly_training [{weekday, activity, duration_min}], workout_days [{weekday, title, exercises: [{name, "
    "primary_muscle, equipment, kind, sets, rep_min, rep_max, duration_min}]}]."
)


def _build_gemini_payload(
    message: str,
    history: list[dict[str, str]],
    context: dict[str, Any],
    image_base64: str = "",
    mime_type: str = "image/jpeg",
) -> dict[str, Any]:
    context_text = _context_as_text(context)
    current_message = (
        "Current nutrition context from InsightPilot:\n"
        f"{context_text}\n\n"
        "User message:\n"
        f"{message or '(the user sent an image without text)'}"
    )
    parts: list[dict[str, Any]] = [{"text": current_message}]
    if image_base64:
        parts.append({"inline_data": {"mime_type": mime_type, "data": image_base64}})
    return {
        "system_instruction": {"parts": {"text": _system_instruction() + GEMINI_SHAPE_HINT}},
        "contents": [
            *_sanitize_gemini_history(history),
            {"role": "user", "parts": parts},
        ],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": _chat_max_output_tokens(),
            "responseMimeType": "application/json",
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
    for item in history[-_history_limit():]:
        role = item.get("role")
        text = (item.get("content") or "").strip()
        if role not in {"user", "assistant"} or not text:
            continue
        contents.append({"role": role, "content": text[:3000]})
    return contents


def _build_openai_payload(
    message: str,
    history: list[dict[str, str]],
    context: dict[str, Any],
    image_base64: str = "",
    mime_type: str = "image/jpeg",
) -> dict[str, Any]:
    context_text = _context_as_text(context)
    current_message = (
        "Current nutrition context from InsightPilot:\n"
        f"{context_text}\n\n"
        "User message:\n"
        f"{message or '(the user sent an image without text)'}"
    )
    if image_base64:
        user_content: Any = [
            {"type": "input_text", "text": current_message},
            {
                "type": "input_image",
                "image_url": f"data:{mime_type};base64,{image_base64}",
            },
        ]
    else:
        user_content = current_message
    return {
        "model": get_ai_model("openai"),
        "instructions": _system_instruction(),
        "input": [
            *_sanitize_openai_history(history),
            {"role": "user", "content": user_content},
        ],
        "text": {"format": _openai_response_format()},
        "max_output_tokens": _chat_max_output_tokens(),
        "store": False,
    }


def _openai_response_format() -> dict[str, Any]:
    return {
        "type": "json_schema",
        "name": "insight_ai_response",
        "description": "InsightPilot AI chat reply and optional nutrition action.",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "reply": {
                    "type": "string",
                    "description": "Short user-facing assistant message.",
                },
                "action_type": {
                    "type": "string",
                    "enum": [
                        "none",
                        "log_meal",
                        "create_plan",
                        "update_program",
                        "delete_plan",
                        "update_plan",
                        "edit_diary",
                        "log_weight",
                    ],
                    "description": (
                        "log_meal when enough detail exists to log a meal; create_plan once every plan input "
                        "is known; update_program to change the active plan's workout program; delete_plan to "
                        "end the active plan; update_plan to change its pace; edit_diary to add several foods "
                        "or change or delete logged foods; log_weight to log body weight."
                    ),
                },
                "action_summary": {
                    "type": "string",
                    "description": "Human-readable action review summary, or empty string when action_type is none.",
                },
                "meal_payload": {**_meal_item_schema(), "type": ["object", "null"]},
                "plan_payload": {
                    "anyOf": [_plan_payload_schema(), {"type": "null"}],
                    "description": "Plan inputs for create_plan or update_program, otherwise null.",
                },
                "plan_pace": {
                    **_nullable("string", enum=["low", "middle", "extreme", None]),
                    "description": "New pace for update_plan, otherwise null.",
                },
                "diary_payload": {
                    "anyOf": [_diary_payload_schema(), {"type": "null"}],
                    "description": "Diary changes for edit_diary, otherwise null.",
                },
                "weight_payload": {
                    "type": ["object", "null"],
                    "additionalProperties": False,
                    "properties": {
                        "entry_date": {"type": "string", "description": "ISO date YYYY-MM-DD."},
                        "weight_kg": {"type": "number"},
                    },
                    "required": ["entry_date", "weight_kg"],
                },
            },
            "required": [
                "reply",
                "action_type",
                "action_summary",
                "meal_payload",
                "plan_payload",
                "plan_pace",
                "diary_payload",
                "weight_payload",
            ],
        },
    }


def _nullable(type_name: str, **extra) -> dict[str, Any]:
    return {"type": [type_name, "null"], **extra}


MEAL_TYPES = ["breakfast", "lunch", "dinner", "snacks"]


def _meal_item_schema() -> dict[str, Any]:
    number_fields = [
        "quantity",
        "calories",
        "protein_grams",
        "carbs_grams",
        "fat_grams",
        "fiber_grams",
        "sugar_grams",
        "sodium_mg",
    ]
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "entry_date": {
                "type": "string",
                "description": "ISO date YYYY-MM-DD. Use today's date from context when the user says today.",
            },
            "meal_type": {"type": "string", "enum": MEAL_TYPES},
            "food_name": {"type": "string"},
            "brand_name": {"type": "string"},
            "unit": {"type": "string"},
            **{field: {"type": "number"} for field in number_fields},
        },
        "required": ["entry_date", "meal_type", "food_name", "brand_name", "unit", *number_fields],
    }


def _diary_payload_schema() -> dict[str, Any]:
    update = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "entry_id": {"type": "integer"},
            "quantity": _nullable("number"),
            "meal_type": _nullable("string", enum=[*MEAL_TYPES, None]),
            "entry_date": _nullable("string"),
        },
        "required": ["entry_id", "quantity", "meal_type", "entry_date"],
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "add": {"type": "array", "items": _meal_item_schema()},
            "update": {"type": "array", "items": update},
            "delete": {"type": "array", "items": {"type": "integer"}},
        },
        "required": ["add", "update", "delete"],
    }


def _plan_payload_schema() -> dict[str, Any]:
    exercise = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "name": {"type": "string"},
            "primary_muscle": {"type": "string"},
            "equipment": {"type": "string"},
            "kind": {"type": "string", "enum": ["strength", "cardio"]},
            "sets": _nullable("integer"),
            "rep_min": _nullable("integer"),
            "rep_max": _nullable("integer"),
            "duration_min": _nullable("integer"),
        },
        "required": ["name", "primary_muscle", "equipment", "kind", "sets", "rep_min", "rep_max", "duration_min"],
    }
    session = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "weekday": {"type": "integer"},
            "activity": {
                "type": "string",
                "enum": ["weights", "running", "cycling", "swimming", "walking", "hiit", "yoga", "other"],
            },
            "duration_min": {"type": "integer"},
        },
        "required": ["weekday", "activity", "duration_min"],
    }
    day = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "weekday": {"type": "integer", "description": "0 = Monday ... 6 = Sunday"},
            "title": {"type": "string"},
            "exercises": {"type": "array", "items": exercise},
        },
        "required": ["weekday", "title", "exercises"],
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "goal_type": _nullable("string", enum=["gain", "lose", "maintain", None]),
            "sex": _nullable("string", enum=["male", "female", None]),
            "age": _nullable("integer"),
            "height_cm": _nullable("number"),
            "weight_kg": _nullable("number"),
            "target_weight_kg": _nullable("number"),
            "job_activity": _nullable("string", enum=["desk", "standing", "physical", None]),
            "equipment": _nullable("string"),
            "food_preferences": _nullable("string"),
            "explanation": _nullable("string"),
            "weekly_training": {"anyOf": [{"type": "array", "items": session}, {"type": "null"}]},
            "workout_days": {"type": "array", "items": day},
        },
        "required": [
            "goal_type",
            "sex",
            "age",
            "height_cm",
            "weight_kg",
            "target_weight_kg",
            "job_activity",
            "equipment",
            "food_preferences",
            "explanation",
            "weekly_training",
            "workout_days",
        ],
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


def _load_json_object(text: str) -> dict[str, Any] | None:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()

    candidates = [stripped]
    first_brace = stripped.find("{")
    last_brace = stripped.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        candidates.append(stripped[first_brace : last_brace + 1])

    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            return data
    return None


def _parse_agent_response(text: str) -> tuple[str, dict[str, Any] | None]:
    data = _load_json_object(text)
    if not data or "reply" not in data:
        return text, None

    reply = str(data.get("reply") or "").strip() or text

    action_type = str(data.get("action_type") or "none").strip()
    plan_payload = data.get("plan_payload")
    if action_type in {"create_plan", "update_program"} and isinstance(plan_payload, dict):
        return reply, {
            "type": action_type,
            "summary": str(data.get("action_summary") or "").strip(),
            "payload": plan_payload,
        }
    if action_type == "delete_plan":
        return reply, {"type": action_type, "summary": "", "payload": {}}
    if action_type == "update_plan":
        return reply, {"type": action_type, "summary": "", "payload": {"pace": data.get("plan_pace")}}
    for kind, key in (("edit_diary", "diary_payload"), ("log_weight", "weight_payload")):
        if action_type == kind and isinstance(data.get(key), dict):
            return reply, {"type": kind, "summary": "", "payload": data[key]}
    meal_payload = data.get("meal_payload")
    if action_type == "log_meal" and isinstance(meal_payload, dict):
        return reply, {
            "type": "log_meal",
            # Built from the payload so the card never lists foods that won't be logged.
            "summary": "",
            "payload": meal_payload,
        }

    action = data.get("action")
    if not isinstance(action, dict):
        return reply, None
    return reply, action


def _preview(text: str, limit: int = 600) -> str:
    cleaned = " ".join(text.split())
    return cleaned[:limit]


def call_gemini(
    user,
    message: str,
    history: list[dict[str, str]],
    image_base64: str = "",
    mime_type: str = "image/jpeg",
) -> AIProviderResult:
    model = get_ai_model("gemini")
    payload = _build_gemini_payload(
        message, history, build_nutrition_context(user), image_base64, mime_type
    )
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
    reply_text, proposed_action = _parse_agent_response(text)
    usage = _extract_gemini_usage(data)

    InsightAIUsage.objects.create(
        user=user,
        provider="gemini",
        model=model,
        status=InsightAIUsage.STATUS_SUCCESS,
        message_preview=_preview(message),
        response_preview=_preview(reply_text),
        prompt_tokens=usage["prompt_tokens"],
        completion_tokens=usage["completion_tokens"],
        total_tokens=usage["total_tokens"],
    )

    return AIProviderResult(
        text=reply_text,
        raw_usage=data.get("usageMetadata") or {},
        proposed_action=proposed_action,
        **usage,
    )


def call_openai(
    user,
    message: str,
    history: list[dict[str, str]],
    image_base64: str = "",
    mime_type: str = "image/jpeg",
) -> AIProviderResult:
    model = get_ai_model("openai")
    payload = _build_openai_payload(
        message, history, build_nutrition_context(user), image_base64, mime_type
    )
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
    reply_text, proposed_action = _parse_agent_response(text)
    usage = _extract_openai_usage(data)

    InsightAIUsage.objects.create(
        user=user,
        provider="openai",
        model=model,
        status=InsightAIUsage.STATUS_SUCCESS,
        message_preview=_preview(message),
        response_preview=_preview(reply_text),
        prompt_tokens=usage["prompt_tokens"],
        completion_tokens=usage["completion_tokens"],
        total_tokens=usage["total_tokens"],
    )

    return AIProviderResult(
        text=reply_text,
        raw_usage=data.get("usage") or {},
        proposed_action=proposed_action,
        **usage,
    )


def call_ai(
    user,
    message: str,
    history: list[dict[str, str]],
    image_base64: str = "",
    mime_type: str = "image/jpeg",
) -> AIProviderResult:
    if get_ai_provider() == "openai":
        return call_openai(user, message, history, image_base64, mime_type)
    return call_gemini(user, message, history, image_base64, mime_type)
