"""Adaptive expenditure estimation and target coaching.

Estimates the user's true daily energy expenditure (TDEE) from logged food
intake and the smoothed weight trend over a rolling window, then recommends
calorie/macro targets that move the user toward their goal at a safe rate.
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from .models import MealEntry, NutritionProfile, WeightEntry

WINDOW_DAYS = 28
KCAL_PER_KG = 7700.0
EWMA_ALPHA = 0.25
PROTEIN_G_PER_KG = 1.8
FAT_CALORIE_SHARE = 0.25

# Weekly body-weight change rates by goal (fraction of body weight).
GOAL_WEEKLY_RATES = {
    NutritionProfile.GOAL_LOSE: -0.005,
    NutritionProfile.GOAL_GAIN: 0.0025,
    NutritionProfile.GOAL_MAINTAIN: 0.0,
    NutritionProfile.GOAL_TRACK: 0.0,
}

MIN_CALORIES = 1200


def build_coach_report(user, profile: NutritionProfile) -> dict:
    today = timezone.localdate()
    start = today - timedelta(days=WINDOW_DAYS - 1)

    # Daily intake in window
    entries = MealEntry.objects.filter(
        owner=user, entry_date__gte=start, entry_date__lte=today
    ).values_list("entry_date", "calories")
    intake_by_day: dict = {}
    for entry_date, calories in entries:
        intake_by_day[entry_date] = intake_by_day.get(entry_date, 0.0) + float(calories)
    logged_days = {d for d, kcal in intake_by_day.items() if kcal > 0}

    # Weights: include the most recent weigh-in before the window as a seed
    weights_in_window = list(
        WeightEntry.objects.filter(
            owner=user, entry_date__gte=start, entry_date__lte=today
        ).order_by("entry_date")
    )
    seed = (
        WeightEntry.objects.filter(owner=user, entry_date__lt=start)
        .order_by("-entry_date")
        .first()
    )
    weight_by_day = {w.entry_date: w.weight_kg for w in weights_in_window}

    # Smoothed trend: EWMA day by day, carrying the trend through gaps
    trend_series = []
    trend = seed.weight_kg if seed else None
    for offset in range(WINDOW_DAYS):
        day = start + timedelta(days=offset)
        observed = weight_by_day.get(day)
        if observed is not None:
            trend = observed if trend is None else (
                EWMA_ALPHA * observed + (1 - EWMA_ALPHA) * trend
            )
        if trend is not None:
            trend_series.append(
                {
                    "date": str(day),
                    "weight": observed,
                    "trend": round(trend, 2),
                }
            )

    weigh_in_count = len(weights_in_window)
    logged_count = len(logged_days)

    # Expenditure estimate
    expenditure = None
    confidence = "insufficient"
    trend_change = None
    if logged_count >= 7 and weigh_in_count >= 2 and len(trend_series) >= 2:
        first_trend = trend_series[0]["trend"]
        last_trend = trend_series[-1]["trend"]
        first_date = trend_series[0]["date"]
        last_date = trend_series[-1]["date"]
        span_days = max(
            (timezone.datetime.fromisoformat(last_date).date()
             - timezone.datetime.fromisoformat(first_date).date()).days,
            1,
        )
        trend_change = round(last_trend - first_trend, 2)
        avg_intake = sum(intake_by_day[d] for d in logged_days) / logged_count
        expenditure = avg_intake - (trend_change * KCAL_PER_KG) / span_days
        expenditure = round(max(expenditure, MIN_CALORIES), 0)
        if logged_count >= 20 and weigh_in_count >= 10:
            confidence = "high"
        elif logged_count >= 12 and weigh_in_count >= 4:
            confidence = "medium"
        else:
            confidence = "low"

    latest_trend_weight = trend_series[-1]["trend"] if trend_series else None

    # Recommendation
    recommendation = None
    if expenditure is not None and profile.goal_type in GOAL_WEEKLY_RATES:
        weekly_rate = GOAL_WEEKLY_RATES[profile.goal_type]
        weight_for_rate = latest_trend_weight or 75.0
        weekly_change_kg = round(weekly_rate * weight_for_rate, 2)
        daily_adjustment = (weekly_change_kg * KCAL_PER_KG) / 7.0
        target_calories = int(round(max(expenditure + daily_adjustment, MIN_CALORIES)))

        protein_g = round(PROTEIN_G_PER_KG * weight_for_rate, 0)
        fat_g = round((target_calories * FAT_CALORIE_SHARE) / 9.0, 0)
        carbs_g = round(
            max(target_calories - protein_g * 4 - fat_g * 9, 0) / 4.0, 0
        )

        if profile.goal_type == NutritionProfile.GOAL_LOSE:
            rationale = (
                f"Your estimated expenditure is {int(expenditure)} kcal/day. "
                f"To lose about {abs(weekly_change_kg)} kg/week, eat around "
                f"{target_calories} kcal/day."
            )
        elif profile.goal_type == NutritionProfile.GOAL_GAIN:
            rationale = (
                f"Your estimated expenditure is {int(expenditure)} kcal/day. "
                f"To gain about {abs(weekly_change_kg)} kg/week (lean bulk), eat around "
                f"{target_calories} kcal/day."
            )
        else:
            rationale = (
                f"Your estimated expenditure is {int(expenditure)} kcal/day. "
                f"To maintain your weight, eat around {target_calories} kcal/day."
            )

        recommendation = {
            "calories": target_calories,
            "protein_grams": protein_g,
            "carbs_grams": carbs_g,
            "fat_grams": fat_g,
            "weekly_change_kg": weekly_change_kg,
            "rationale": rationale,
        }

    return {
        "window_days": WINDOW_DAYS,
        "expenditure": expenditure,
        "confidence": confidence,
        "data": {
            "logged_days": logged_count,
            "weigh_ins": weigh_in_count,
        },
        "trend_series": trend_series,
        "trend_change_kg": trend_change,
        "latest_trend_weight": latest_trend_weight,
        "current_target": profile.daily_calorie_target,
        "goal_type": profile.goal_type,
        "recommendation": recommendation,
    }


def apply_recommendation(profile: NutritionProfile, report: dict, mode: str) -> NutritionProfile:
    """Apply the recommended targets.

    coached: replace calories and macros with the recommendation.
    collaborative: apply recommended calories but scale the user's existing
    macro ratios to fit them.
    """
    rec = report.get("recommendation")
    if not rec:
        raise ValueError("No recommendation available yet — keep logging meals and weigh-ins.")

    if mode == "coached":
        profile.daily_calorie_target = rec["calories"]
        profile.protein_target_grams = rec["protein_grams"]
        profile.carbs_target_grams = rec["carbs_grams"]
        profile.fat_target_grams = rec["fat_grams"]
    elif mode == "collaborative":
        old_calories = (
            profile.protein_target_grams * 4
            + profile.carbs_target_grams * 4
            + profile.fat_target_grams * 9
        )
        scale = rec["calories"] / old_calories if old_calories > 0 else 1.0
        profile.daily_calorie_target = rec["calories"]
        profile.protein_target_grams = round(profile.protein_target_grams * scale, 0)
        profile.carbs_target_grams = round(profile.carbs_target_grams * scale, 0)
        profile.fat_target_grams = round(profile.fat_target_grams * scale, 0)
    else:
        raise ValueError("mode must be 'coached' or 'collaborative'.")

    profile.save(
        update_fields=[
            "daily_calorie_target",
            "protein_target_grams",
            "carbs_target_grams",
            "fat_target_grams",
            "updated_at",
        ]
    )
    return profile
