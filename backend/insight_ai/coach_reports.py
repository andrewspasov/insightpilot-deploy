"""The AI coach reaching out: a nudge after days without logging, and a daily email report."""

from __future__ import annotations

import logging
from datetime import date
from html import escape

import requests
from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Max
from django.utils import timezone

from nutrition.models import ExerciseEntry, MealEntry, NutritionProfile, WaterEntry, WeightEntry

from .models import InsightAIUsage
from .services import (
    AIProviderRequestError,
    REPORT_PREVIEW,
    InsightAIError,
    _entry_totals,
    _extract_openai_text,
    _extract_openai_usage,
    _get_or_create_profile,
    _plan_context,
    _preview,
    _setting_int,
    assert_chat_allowed,
    get_ai_model,
    get_ai_provider,
    get_api_key,
    user_has_nutrition_access,
)

logger = logging.getLogger(__name__)

# Nudge once nothing has been logged for this many days.
NUDGE_AFTER_DAYS = 2

MEAL_LABELS = {
    MealEntry.MEAL_BREAKFAST: "Breakfast",
    MealEntry.MEAL_LUNCH: "Lunch",
    MealEntry.MEAL_DINNER: "Dinner",
    MealEntry.MEAL_SNACKS: "Snacks",
}


def last_logged_date(user, today: date | None = None) -> date | None:
    """The newest day with any food, water, weight or exercise logged (future days ignored)."""
    today = today or timezone.localdate()
    dates = [
        model.objects.filter(owner=user, entry_date__lte=today).aggregate(last=Max("entry_date"))["last"]
        for model in (MealEntry, WeightEntry, ExerciseEntry)
    ]
    dates.append(
        WaterEntry.objects.filter(owner=user, entry_date__lte=today, total_ml__gt=0).aggregate(
            last=Max("entry_date")
        )["last"]
    )
    dates = [d for d in dates if d]
    return max(dates) if dates else None


def logging_status(user) -> dict:
    """What the app needs to show the 'you haven't logged' pop-up and schedule phone reminders."""
    today = timezone.localdate()
    profile = _get_or_create_profile(user)
    last = last_logged_date(user, today)
    if last:
        days = (today - last).days
    else:
        days = (today - timezone.localtime(profile.created_at).date()).days

    show = profile.logging_reminders and days >= NUDGE_AFTER_DAYS
    return {
        "reminders_enabled": profile.logging_reminders,
        "last_logged_date": str(last) if last else None,
        "days_since_last_log": days,
        "show_nudge": show,
        "title": "We miss you!" if show else "",
        "message": _nudge_message(user, last, days) if show else "",
    }


def _nudge_message(user, last: date | None, days: int) -> str:
    if last is None:
        opening = "You haven't logged anything yet."
    elif days == NUDGE_AFTER_DAYS:
        opening = f"You haven't logged anything since {last.strftime('%A')}."
    else:
        opening = f"You haven't logged anything for {days} days."
    plan = _plan_context(user)
    if plan:
        goal = f"your {plan['goal_type']} plan" if plan.get("goal_type") else "your plan"
        return f"{opening} A quick log keeps {goal} on track. Want to add today's meals?"
    return f"{opening} A quick log keeps your progress visible. Want to add today's meals?"


def build_daily_report(user, day: date) -> dict:
    profile = _get_or_create_profile(user)
    entries = list(MealEntry.objects.filter(owner=user, entry_date=day).order_by("meal_type", "created_at"))
    water = WaterEntry.objects.filter(owner=user, entry_date=day).first()
    exercises = list(ExerciseEntry.objects.filter(owner=user, entry_date=day).order_by("created_at"))
    weight = WeightEntry.objects.filter(owner=user, entry_date=day).order_by("-created_at").first()

    meals = []
    for meal_type, label in MEAL_LABELS.items():
        items = [e for e in entries if e.meal_type == meal_type]
        if items:
            meals.append(
                {
                    "label": label,
                    "calories": round(sum(e.calories for e in items)),
                    "foods": [e.food_name for e in items],
                }
            )

    return {
        "date": day,
        "logged_anything": bool(entries or exercises or weight or (water and water.total_ml)),
        "totals": _entry_totals(entries),
        "targets": {
            "calories": profile.daily_calorie_target,
            "protein_grams": profile.protein_target_grams,
            "carbs_grams": profile.carbs_target_grams,
            "fat_grams": profile.fat_target_grams,
        },
        "meals": meals,
        "water_ml": water.total_ml if water else 0,
        "water_target_ml": water.target_ml if water else 2000,
        "exercises": [
            {"name": e.name, "minutes": e.duration_min, "calories": round(e.calories_burned)} for e in exercises
        ],
        "weight_kg": weight.weight_kg if weight else None,
        "plan": _plan_context(user),
    }


def _vs_target(value: float, target: float, unit: str) -> str:
    if not target:
        return "no target"
    percent = round(value / target * 100)
    gap = round(abs(target - value))
    if 90 <= percent <= 110:
        return f"{percent}% of target, on target"
    return f"{percent}% of target, {gap} {unit} {'under' if value < target else 'over'}"


def _report_as_text(report: dict) -> str:
    t, g = report["totals"], report["targets"]
    lines = [
        f"Date: {report['date'].strftime('%A %Y-%m-%d')}",
        f"Calories: {round(t['calories'])} of {g['calories']} kcal ({_vs_target(t['calories'], g['calories'], 'kcal')})",
        f"Protein: {round(t['protein_grams'])} of {round(g['protein_grams'])} g "
        f"({_vs_target(t['protein_grams'], g['protein_grams'], 'g')})",
        f"Carbs: {round(t['carbs_grams'])} of {round(g['carbs_grams'])} g",
        f"Fat: {round(t['fat_grams'])} of {round(g['fat_grams'])} g",
        f"Water: {report['water_ml']} of {report['water_target_ml']} ml",
    ]
    for meal in report["meals"]:
        lines.append(f"{meal['label']} ({meal['calories']} kcal): {', '.join(meal['foods'])}")
    if not report["meals"]:
        lines.append("No food logged.")
    for ex in report["exercises"]:
        lines.append(f"Exercise: {ex['name']}, {ex['minutes']} min, {ex['calories']} kcal")
    if report["weight_kg"]:
        lines.append(f"Weight: {report['weight_kg']} kg")
    if report["plan"]:
        plan = report["plan"]
        lines.append(f"Active plan: {plan['goal_type']}, {plan['daily_calorie_target']} kcal a day")
        workout = next(
            (d for d in plan["workout_days"] if d["weekday"] == report["date"].weekday()), None
        )
        lines.append(f"Planned workout today: {workout['title']}" if workout else "Planned: rest day")
    return "\n".join(lines)


def ai_summary(user, report: dict) -> str:
    """A few sentences of coaching on the day. Empty when the AI is unavailable."""
    if get_ai_provider() != "openai":
        return ""
    try:
        assert_chat_allowed(user)
    except InsightAIError:
        return ""

    model = get_ai_model("openai")
    prompt = (
        "You are InsightPilot, a friendly nutrition coach. Write 2-3 short sentences for the user's end-of-day "
        "email: one thing that went well, and one concrete tip for tomorrow based on the numbers. "
        "Be honest about the targets: only call the day on target when calories are within 10% of the target; "
        "otherwise say how far under or over it was. "
        "If nothing was logged, gently encourage logging tomorrow. Plain text, no greeting, no lists.\n\n"
        + _report_as_text(report)
    )
    try:
        response = requests.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {get_api_key('openai')}", "Content-Type": "application/json"},
            json={
                "model": model,
                "input": [{"role": "user", "content": prompt}],
                "max_output_tokens": _setting_int("INSIGHT_AI_REPORT_MAX_OUTPUT_TOKENS", 1500),
                "store": False,
            },
            timeout=_setting_int("INSIGHT_AI_TIMEOUT_SECONDS", 30),
        )
        if response.status_code >= 400:
            raise AIProviderRequestError(f"OpenAI error ({response.status_code}): {response.text[:500]}")
        data = response.json()
        text = _extract_openai_text(data)
    except (requests.RequestException, ValueError, AIProviderRequestError) as exc:
        InsightAIUsage.objects.create(
            user=user,
            provider="openai",
            model=model,
            status=InsightAIUsage.STATUS_ERROR,
            message_preview=REPORT_PREVIEW,
            error_message=str(exc)[:1000],
        )
        return ""

    usage = _extract_openai_usage(data)
    InsightAIUsage.objects.create(
        user=user,
        provider="openai",
        model=model,
        status=InsightAIUsage.STATUS_SUCCESS,
        message_preview=REPORT_PREVIEW,
        response_preview=_preview(text),
        **usage,
    )
    return text


def _render_email(report: dict, summary: str) -> tuple[str, str]:
    t, g = report["totals"], report["targets"]
    rows = [
        ("Calories", f"{round(t['calories'])} / {g['calories']} kcal"),
        ("Protein", f"{round(t['protein_grams'])} / {round(g['protein_grams'])} g"),
        ("Carbs", f"{round(t['carbs_grams'])} / {round(g['carbs_grams'])} g"),
        ("Fat", f"{round(t['fat_grams'])} / {round(g['fat_grams'])} g"),
        ("Water", f"{report['water_ml']} / {report['water_target_ml']} ml"),
    ]
    if report["weight_kg"]:
        rows.append(("Weight", f"{report['weight_kg']} kg"))
    burned = sum(ex["calories"] for ex in report["exercises"])
    if report["exercises"]:
        rows.append(("Exercise", f"{len(report['exercises'])} session(s), {burned} kcal burned"))

    meals_html = "".join(
        f"<p style='margin:0 0 8px'><strong>{escape(m['label'])}</strong> · {m['calories']} kcal<br>"
        f"<span style='color:#475569'>{escape(', '.join(m['foods']))}</span></p>"
        for m in report["meals"]
    ) or "<p style='margin:0;color:#475569'>No food logged today.</p>"
    exercise_html = "".join(
        f"<li>{escape(ex['name'])} · {ex['minutes']} min · {ex['calories']} kcal</li>" for ex in report["exercises"]
    )
    rows_html = "".join(
        f"<tr><td style='padding:6px 0;color:#475569'>{label}</td>"
        f"<td style='padding:6px 0;text-align:right;font-weight:600'>{value}</td></tr>"
        for label, value in rows
    )
    summary_html = (
        f"<div style='background:#ecfdf5;border-radius:12px;padding:14px 16px;margin:0 0 20px;color:#065f46'>"
        f"<strong>Coach's note</strong><br>{escape(summary)}</div>"
        if summary
        else ""
    )
    day_label = report["date"].strftime("%A, %B %-d")
    html = f"""
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 4px">Your day in nutrition</h2>
        <p style="margin:0 0 20px;color:#64748b">{day_label}</p>
        {summary_html}
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px">{rows_html}</table>
        <h3 style="margin:0 0 10px;font-size:16px">Meals</h3>
        {meals_html}
        {f"<h3 style='margin:16px 0 8px;font-size:16px'>Exercise</h3><ul>{exercise_html}</ul>" if exercise_html else ""}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="margin:0;font-size:12px;color:#94a3b8">
          You get this from InsightPilot. Turn it off in Nutrition settings.
        </p>
      </div>
    </div>
    """

    text_lines = [f"Your day in nutrition – {day_label}", ""]
    if summary:
        text_lines += [f"Coach's note: {summary}", ""]
    text_lines += [f"{label}: {value}" for label, value in rows]
    text_lines.append("")
    text_lines += [f"{m['label']} ({m['calories']} kcal): {', '.join(m['foods'])}" for m in report["meals"]] or [
        "No food logged today."
    ]
    text_lines += ["", "Turn this email off in Nutrition settings."]
    return "\n".join(text_lines), html


def send_daily_report(user, day: date | None = None) -> str:
    """Email the user a report of the day. Returns the address it was sent to."""
    if not user.email:
        raise ValueError("Your account has no email address.")
    day = day or timezone.localdate()
    report = build_daily_report(user, day)
    summary = ai_summary(user, report)
    text, html = _render_email(report, summary)
    send_mail(
        f"Your InsightPilot day: {day.strftime('%a %b %-d')}",
        text,
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
        fail_silently=False,
        html_message=html,
    )
    return user.email


def send_due_reports(now=None) -> list[str]:
    """Send today's report to everyone whose report hour has passed and who hasn't had it yet."""
    now = timezone.localtime(now)
    today = now.date()
    profiles = (
        NutritionProfile.objects.select_related("owner")
        .filter(daily_report_email=True, daily_report_hour__lte=now.hour, owner__is_active=True)
        .exclude(owner__email="")
        .exclude(daily_report_last_sent=today)
    )
    sent = []
    for profile in profiles:
        if not user_has_nutrition_access(profile.owner):
            continue
        try:
            send_daily_report(profile.owner, today)
        except Exception:
            # One bad address must not stop everyone else's report; retried next run.
            logger.exception("Daily report failed for user %s", profile.owner_id)
            continue
        profile.daily_report_last_sent = today
        profile.save(update_fields=["daily_report_last_sent"])
        sent.append(profile.owner.email)
    return sent
