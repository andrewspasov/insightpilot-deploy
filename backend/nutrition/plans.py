"""Creating, updating and using plans: the persistence side of planning.py."""

from __future__ import annotations

from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone

from .models import (
    Exercise,
    ExerciseEntry,
    MealEntry,
    NutritionProfile,
    Plan,
    PlanExercise,
    PlanMealOption,
    PlanWorkoutDay,
    WeightEntry,
    WorkoutSession,
)
from .exercise_matching import match_exercise
from .meal_library import AVOID_OPTIONS, LIKE_OPTIONS, MEAL_SPLIT, pick_meals, scale_to_target
from .program_templates import ProgramBuilder, normalize_equipment, normalize_gear
from .planning import (
    ACTIVITY_METS,
    PlanInputError,
    PlanInputs,
    calculate_plan,
    pick_option,
)

MEAL_TYPES = {choice[0] for choice in MealEntry.MEAL_CHOICES}
MAX_MEAL_OPTIONS_PER_TYPE = 3
MAX_EXERCISES_PER_DAY = 15


def get_or_create_profile(user) -> NutritionProfile:
    profile, _ = NutritionProfile.objects.get_or_create(
        owner=user,
        defaults={
            "goal_type": NutritionProfile.GOAL_TRACK,
            "daily_calorie_target": 2000,
            "protein_target_grams": 150.0,
            "carbs_target_grams": 250.0,
            "fat_target_grams": 70.0,
        },
    )
    return profile


def get_active_plan(user) -> Plan | None:
    return Plan.objects.filter(owner=user, status=Plan.STATUS_ACTIVE).first()


def _float(value, name: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise PlanInputError(f"{name} must be a number.") from exc


def build_inputs(user, payload: dict) -> PlanInputs:
    """Merge request values with what the profile and weight log already know."""
    profile = get_or_create_profile(user)

    weight = payload.get("weight_kg")
    if weight in (None, ""):
        latest = WeightEntry.objects.filter(owner=user).order_by("-entry_date", "-created_at").first()
        weight = latest.weight_kg if latest else None
    if weight in (None, ""):
        raise PlanInputError("Current weight is required.")

    age = payload.get("age")
    if age in (None, ""):
        age = profile.age
    if age in (None, ""):
        raise PlanInputError("Age is required.")

    height = payload.get("height_cm")
    if height in (None, ""):
        height = profile.height_cm
    if height in (None, ""):
        raise PlanInputError("Height is required.")

    sex = str(payload.get("sex") or profile.sex or "").strip().lower()
    job_activity = str(payload.get("job_activity") or profile.job_activity or "").strip().lower()
    goal_type = str(payload.get("goal_type") or "").strip().lower()
    weight = _float(weight, "Current weight")

    target = payload.get("target_weight_kg")
    if target in (None, "") and goal_type == NutritionProfile.GOAL_MAINTAIN:
        target = weight
    if target in (None, ""):
        raise PlanInputError("Target weight is required.")

    start_date = payload.get("start_date")
    if start_date:
        try:
            start_date = date.fromisoformat(str(start_date))
        except ValueError as exc:
            raise PlanInputError("start_date must be YYYY-MM-DD.") from exc
    else:
        start_date = timezone.localdate()

    try:
        age = int(age)
    except (TypeError, ValueError) as exc:
        raise PlanInputError("Age must be a whole number.") from exc

    return PlanInputs(
        goal_type=goal_type,
        sex=sex,
        age=age,
        height_cm=_float(height, "Height"),
        weight_kg=weight,
        target_weight_kg=_float(target, "Target weight"),
        job_activity=job_activity,
        weekly_training=payload.get("weekly_training") or [],
        start_date=start_date,
    )


def preview_plan(user, payload: dict) -> dict:
    inputs = build_inputs(user, payload)
    result = calculate_plan(inputs)
    result["inputs"] = {
        "sex": inputs.sex,
        "age": inputs.age,
        "height_cm": inputs.height_cm,
        "weight_kg": inputs.weight_kg,
        "target_weight_kg": inputs.target_weight_kg,
        "job_activity": inputs.job_activity,
        "start_date": inputs.start_date.isoformat(),
    }
    return result


def _apply_targets(plan: Plan, option: dict) -> None:
    plan.pace = option["pace"]
    plan.daily_calorie_target = option["daily_calorie_target"]
    plan.protein_target_grams = option["protein_grams"]
    plan.carbs_target_grams = option["carbs_grams"]
    plan.fat_target_grams = option["fat_grams"]
    plan.weekly_change_kg = option["weekly_change_kg"]
    plan.estimated_weeks = option["estimated_weeks"]
    plan.projected_end_date = (
        date.fromisoformat(option["projected_end_date"]) if option["projected_end_date"] else None
    )


def sync_profile_targets(plan: Plan) -> NutritionProfile:
    profile = get_or_create_profile(plan.owner)
    profile.goal_type = plan.goal_type
    profile.daily_calorie_target = plan.daily_calorie_target
    profile.protein_target_grams = plan.protein_target_grams
    profile.carbs_target_grams = plan.carbs_target_grams
    profile.fat_target_grams = plan.fat_target_grams
    profile.save(
        update_fields=[
            "goal_type",
            "daily_calorie_target",
            "protein_target_grams",
            "carbs_target_grams",
            "fat_target_grams",
            "updated_at",
        ]
    )
    return profile


def _resolve_exercise(raw: dict, library: list[Exercise] | None = None) -> Exercise | None:
    exercise_id = raw.get("exercise_id")
    if exercise_id:
        return Exercise.objects.filter(id=exercise_id).first()
    slug = raw.get("exercise_slug")
    if slug:
        return Exercise.objects.filter(slug=slug).first()
    # Free-text names (from the AI) are matched against the library.
    name = str(raw.get("name") or "").strip()
    if name:
        return match_exercise(name, raw.get("primary_muscle") or "", raw.get("equipment") or "", library)
    return None


def add_plan_exercise(
    day: PlanWorkoutDay,
    raw: dict,
    order: int | None = None,
    library: list[Exercise] | None = None,
) -> PlanExercise:
    exercise = _resolve_exercise(raw, library)
    name = str(raw.get("name") or (exercise.name if exercise else "")).strip()[:200]
    if not name:
        raise PlanInputError("Each exercise needs a library exercise or a name.")
    kind = raw.get("kind") or (
        PlanExercise.KIND_CARDIO if exercise and exercise.category == "cardio" else PlanExercise.KIND_STRENGTH
    )
    if kind not in (PlanExercise.KIND_STRENGTH, PlanExercise.KIND_CARDIO):
        raise PlanInputError("kind must be strength or cardio.")
    if order is None:
        order = day.exercises.count()
    rep_min = int(raw.get("rep_min") or 8)
    rep_max = max(int(raw.get("rep_max") or 12), rep_min)
    return PlanExercise.objects.create(
        day=day,
        order=order,
        exercise=exercise,
        name=name,
        kind=kind,
        sets=max(int(raw.get("sets") or 3), 1),
        rep_min=rep_min,
        rep_max=rep_max,
        duration_min=raw.get("duration_min") or None,
        rest_seconds=int(raw.get("rest_seconds") or 90),
        notes=str(raw.get("notes") or "")[:300],
    )


def _create_workout_days(plan: Plan, days: list[dict]) -> None:
    seen = set()
    library: list[Exercise] | None = None
    for raw_day in days or []:
        try:
            weekday = int(raw_day.get("weekday"))
        except (TypeError, ValueError) as exc:
            raise PlanInputError("Each workout day needs a weekday from 0 (Monday) to 6 (Sunday).") from exc
        if not 0 <= weekday <= 6 or weekday in seen:
            raise PlanInputError("Workout days must use distinct weekdays from 0 to 6.")
        seen.add(weekday)
        day = PlanWorkoutDay.objects.create(
            plan=plan,
            weekday=weekday,
            title=str(raw_day.get("title") or "Workout").strip()[:200],
            notes=str(raw_day.get("notes") or "")[:500],
        )
        exercises = raw_day.get("exercises") or []
        if len(exercises) > MAX_EXERCISES_PER_DAY:
            raise PlanInputError(f"At most {MAX_EXERCISES_PER_DAY} exercises per day.")
        if library is None and any(not (e.get("exercise_id") or e.get("exercise_slug")) for e in exercises):
            library = list(Exercise.objects.all())
        for index, raw_exercise in enumerate(exercises):
            add_plan_exercise(day, raw_exercise, order=index, library=library)


def _meal_item(raw: dict) -> dict:
    food_name = str(raw.get("food_name") or "").strip()[:200]
    if not food_name:
        raise PlanInputError("Each meal item needs a food name.")
    quantity = _float(raw.get("quantity") or 1, "Meal item quantity")
    if quantity <= 0:
        raise PlanInputError("Meal item quantity must be positive.")
    item = {
        "food_name": food_name,
        "quantity": round(quantity, 2),
        "unit": str(raw.get("unit") or "serving").strip()[:40] or "serving",
    }
    for key in ("calories", "protein_grams", "carbs_grams", "fat_grams"):
        item[key] = round(max(_float(raw.get(key) or 0, key), 0.0), 1)
    return item


def replace_meal_options(plan: Plan, meals: list[dict]) -> None:
    per_type: dict[str, int] = {}
    plan.meal_options.all().delete()
    for raw in meals or []:
        meal_type = str(raw.get("meal_type") or "").strip().lower()
        if meal_type not in MEAL_TYPES:
            raise PlanInputError("Meal options need meal_type breakfast, lunch, dinner or snacks.")
        order = per_type.get(meal_type, 0)
        if order >= MAX_MEAL_OPTIONS_PER_TYPE:
            continue
        per_type[meal_type] = order + 1
        items = [_meal_item(item) for item in raw.get("items") or []]
        if not items:
            raise PlanInputError("Each meal option needs at least one food item.")
        PlanMealOption.objects.create(
            plan=plan,
            meal_type=meal_type,
            order=order,
            name=str(raw.get("name") or "Meal").strip()[:200],
            description=str(raw.get("description") or "").strip()[:500],
            items=items,
            calories=round(sum(i["calories"] for i in items), 1),
            protein_grams=round(sum(i["protein_grams"] for i in items), 1),
            carbs_grams=round(sum(i["carbs_grams"] for i in items), 1),
            fat_grams=round(sum(i["fat_grams"] for i in items), 1),
        )
    plan.meals_date = timezone.localdate()
    plan.save(update_fields=["meals_date"])


@transaction.atomic
def create_plan(user, payload: dict) -> Plan:
    """Calculate, save and activate a plan, archiving any previously active one.

    payload: the calculator inputs plus pace, equipment, explanation, food_preferences,
    workout_days [{weekday, title, exercises: [...]}] and meal_options [...].
    """
    inputs = build_inputs(user, payload)
    result = calculate_plan(inputs)
    pace = str(payload.get("pace") or "middle").strip().lower()
    option = pick_option(result, pace)

    now = timezone.now()
    Plan.objects.filter(owner=user, status=Plan.STATUS_ACTIVE).update(
        status=Plan.STATUS_ARCHIVED,
        archived_at=now,
        updated_at=now,
    )

    plan = Plan(
        owner=user,
        status=Plan.STATUS_ACTIVE,
        goal_type=inputs.goal_type,
        start_date=inputs.start_date,
        start_weight_kg=inputs.weight_kg,
        target_weight_kg=inputs.target_weight_kg,
        sex=inputs.sex,
        age=inputs.age,
        height_cm=inputs.height_cm,
        job_activity=inputs.job_activity,
        weekly_training=result["weekly_training"],
        equipment=str(payload.get("equipment") or "")[:200],
        explanation=str(payload.get("explanation") or ""),
        bmr=result["bmr"],
        maintenance_calories=result["maintenance_calories"],
        pace_options=result["options"],
    )
    _apply_targets(plan, option)
    plan.save()

    _create_workout_days(plan, payload.get("workout_days") or [])
    replace_meal_options(plan, payload.get("meal_options") or [])

    profile = get_or_create_profile(user)
    profile.sex = inputs.sex
    profile.birth_year = timezone.localdate().year - inputs.age
    profile.height_cm = inputs.height_cm
    profile.job_activity = inputs.job_activity
    if "food_preferences" in payload:
        profile.food_preferences = str(payload.get("food_preferences") or "")
    _apply_food_choices(profile, payload)
    if payload.get("equipment") in (NutritionProfile.EQUIPMENT_GYM, NutritionProfile.EQUIPMENT_HOME):
        profile.equipment = payload["equipment"]
    if "home_gear" in payload:
        profile.home_gear = normalize_gear(payload["home_gear"])
    if "include_abs" in payload:
        profile.include_abs = bool(payload["include_abs"])
    profile.save()
    sync_profile_targets(plan)

    # Every plan gets a meal plan; the AI can add more ideas later.
    if not plan.meal_options.exists():
        fill_builtin_meals(plan, profile=profile)

    # The weight the plan starts from becomes today's weigh-in if none exists.
    today = timezone.localdate()
    if inputs.start_date == today:
        WeightEntry.objects.get_or_create(
            owner=user,
            entry_date=today,
            defaults={"weight_kg": inputs.weight_kg, "note": "Plan start"},
        )
    return plan


def _recalculate(plan: Plan, weekly_training: list[dict]) -> None:
    """Re-run the calculator from the plan's snapshot with a new training week."""
    result = calculate_plan(
        PlanInputs(
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
    plan.weekly_training = result["weekly_training"]
    plan.bmr = result["bmr"]
    plan.maintenance_calories = result["maintenance_calories"]
    plan.pace_options = result["options"]
    _apply_targets(plan, pick_option(result, plan.pace))


@transaction.atomic
def replace_program(plan: Plan, workout_days: list[dict], weekly_training: list[dict] | None = None) -> Plan:
    """Swap in a whole new weekly program; recalculate targets if the training week changed."""
    plan.workout_days.all().delete()
    _create_workout_days(plan, workout_days)
    if weekly_training is not None:
        _recalculate(plan, weekly_training)
        plan.save()
        if plan.status == Plan.STATUS_ACTIVE:
            sync_profile_targets(plan)
    else:
        plan.save(update_fields=["updated_at"])
    return plan


@transaction.atomic
def set_plan_pace(plan: Plan, pace: str) -> Plan:
    option = pick_option({"options": plan.pace_options}, pace)
    _apply_targets(plan, option)
    plan.save()
    if plan.status == Plan.STATUS_ACTIVE:
        sync_profile_targets(plan)
    return plan


def archive_plan(plan: Plan) -> Plan:
    if plan.status != Plan.STATUS_ARCHIVED:
        plan.status = Plan.STATUS_ARCHIVED
        plan.archived_at = timezone.now()
        plan.save(update_fields=["status", "archived_at", "updated_at"])
    return plan


def log_meal_option(option: PlanMealOption, entry_date: date, meal_type: str | None = None) -> list[MealEntry]:
    """Add every item of an example meal to the diary as its own entry."""
    meal_type = meal_type or option.meal_type
    entries = []
    for item in option.items:
        quantity = float(item.get("quantity") or 1) or 1.0
        unit = item.get("unit") or "serving"
        per_unit = lambda key: round(float(item.get(key) or 0) / quantity, 4)  # noqa: E731
        entries.append(
            MealEntry.objects.create(
                owner=option.plan.owner,
                entry_date=entry_date,
                meal_type=meal_type,
                food_source=MealEntry.SOURCE_CUSTOM,
                external_food_id=f"plan-meal-{option.id}",
                food_name=item["food_name"],
                serving_description=unit,
                measurement_unit=unit,
                servings=quantity,
                grams_per_unit=1.0 if unit == "g" else None,
                serving_calories=per_unit("calories"),
                serving_protein_grams=per_unit("protein_grams"),
                serving_carbs_grams=per_unit("carbs_grams"),
                serving_fat_grams=per_unit("fat_grams"),
            )
        )
    return entries


LIKE_KEYS = {key for key, _ in LIKE_OPTIONS}
AVOID_KEYS = {key for key, _ in AVOID_OPTIONS}


def _apply_food_choices(profile: NutritionProfile, payload: dict) -> None:
    if "liked_foods" in payload:
        profile.liked_foods = [k for k in payload.get("liked_foods") or [] if k in LIKE_KEYS]
    if "avoided_foods" in payload:
        profile.avoided_foods = [k for k in payload.get("avoided_foods") or [] if k in AVOID_KEYS]


def fill_builtin_meals(plan: Plan, fresh: bool = False, profile: NutritionProfile | None = None) -> list[str]:
    """Pick example meals from the built-in library, sized to the plan's targets.

    fresh=True prefers meals the plan isn't showing yet ("new meal ideas").
    Returns the meal types that had no options left after the user's exclusions.
    """
    profile = profile or get_or_create_profile(plan.owner)
    current = set(plan.meal_options.values_list("name", flat=True)) if fresh else set()
    meals, empty = pick_meals(profile.liked_foods, profile.avoided_foods, profile.food_preferences, current)
    scaled = [scale_to_target(m, plan.daily_calorie_target * MEAL_SPLIT[m["meal_type"]]) for m in meals]
    with transaction.atomic():
        replace_meal_options(plan, scaled)
    return empty


def ensure_todays_meals(plan: Plan | None) -> None:
    """Swap in a fresh set of built-in example meals once per day for the active plan."""
    if plan is None or plan.status != Plan.STATUS_ACTIVE or plan.meals_date == timezone.localdate():
        return
    fill_builtin_meals(plan, fresh=True)


def plan_equipment(plan: Plan) -> str:
    """The plan's equipment as gym/home (AI plans store free text like "Full gym")."""
    return normalize_equipment(plan.equipment or get_or_create_profile(plan.owner).equipment)


@transaction.atomic
def suggest_exercises_for_days(
    plan: Plan,
    day_ids: list[int],
    replace: bool = False,
    equipment: str | None = None,
    include_abs: bool | None = None,
    home_gear: list[str] | None = None,
) -> dict:
    """Fill plan days with exercises for the muscles their titles name.

    Days that already have strength exercises are skipped unless replace=True;
    cardio on a day is always kept. Returns which days were filled/skipped/not
    understood, and per day the muscles the home gear has no exercise for.
    """
    profile = get_or_create_profile(plan.owner)
    gear = profile.home_gear if home_gear is None else home_gear
    builder = ProgramBuilder(equipment or plan_equipment(plan), plan.goal_type, gear)
    abs_on = profile.include_abs if include_abs is None else include_abs
    filled, skipped, unrecognized = [], [], []
    missing: dict[int, list[str]] = {}
    for day in plan.workout_days.filter(id__in=day_ids).order_by("weekday"):
        strength = day.exercises.filter(kind=PlanExercise.KIND_STRENGTH)
        if strength.exists() and not replace:
            skipped.append(day.id)
            continue
        exercises = builder.build_from_title(day.title, include_abs=abs_on)
        if exercises is None:
            unrecognized.append(day.id)
            continue
        if builder.missing:
            missing[day.id] = builder.missing
        if not exercises:
            # Nothing the user's gear allows; keep what the day already has.
            continue
        cardio = list(day.exercises.filter(kind=PlanExercise.KIND_CARDIO).order_by("order"))
        strength.delete()
        for index, raw in enumerate(exercises):
            add_plan_exercise(day, raw, order=index)
        for offset, slot in enumerate(cardio):
            slot.order = len(exercises) + offset
            slot.save(update_fields=["order"])
        filled.append(day.id)
    return {"filled": filled, "skipped": skipped, "unrecognized": unrecognized, "missing": missing}


def cardio_activity_for(name: str) -> str:
    lowered = name.lower()
    if "run" in lowered or "jog" in lowered or "sprint" in lowered:
        return "running"
    if "bik" in lowered or "bicycl" in lowered or "cycl" in lowered:
        return "cycling"
    if "walk" in lowered:
        return "walking"
    if "swim" in lowered:
        return "swimming"
    return "other"


def workout_calories(session: WorkoutSession, weight_kg: float) -> tuple[float, int]:
    """Estimate (calories, minutes) for a session: cardio sets by activity, the rest as weights."""
    cardio_minutes = 0.0
    calories = 0.0
    for workout_set in session.sets.all():
        if workout_set.duration_min:
            cardio_minutes += workout_set.duration_min
            activity = cardio_activity_for(workout_set.exercise_name)
            # Gross MET here (not net) to match how manually logged exercise is estimated.
            calories += ACTIVITY_METS[activity] * 3.5 * weight_kg / 200 * workout_set.duration_min
    total_minutes = session.duration_min
    if not total_minutes and session.completed_at:
        total_minutes = round((session.completed_at - session.started_at).total_seconds() / 60)
    total_minutes = int(total_minutes or 0)
    strength_minutes = max(total_minutes - cardio_minutes, 0)
    if session.sets.filter(duration_min__isnull=True).exists():
        calories += ACTIVITY_METS["weights"] * 3.5 * weight_kg / 200 * strength_minutes
    return round(calories), max(total_minutes, round(cardio_minutes))


@transaction.atomic
def complete_workout(session: WorkoutSession, duration_min: int | None = None) -> WorkoutSession:
    """Mark a workout done and record it in the exercise log as planned activity."""
    if duration_min:
        session.duration_min = int(duration_min)
    session.completed_at = session.completed_at or timezone.now()
    latest = WeightEntry.objects.filter(owner=session.owner).order_by("-entry_date", "-created_at").first()
    calories, minutes = workout_calories(session, latest.weight_kg if latest else 75.0)
    session.duration_min = session.duration_min or minutes or None

    entry = session.exercise_entry
    if entry is None:
        entry = ExerciseEntry(owner=session.owner)
    entry.entry_date = session.entry_date
    entry.name = session.title[:200]
    entry.duration_min = minutes or 1
    entry.calories_burned = calories
    entry.is_planned = session.plan_id is not None
    entry.note = "Logged from workout tracker"
    entry.save()
    session.exercise_entry = entry
    session.save()
    return session


def exercise_budget(user, exercise_entries: list[ExerciseEntry]) -> dict:
    """How much logged exercise extends today's food budget.

    With an active plan, planned training is already in the target, and extra
    activity counts at half because burn estimates tend to run high.
    Without a plan, every logged workout counts in full (previous behaviour).
    """
    total = sum(e.calories_burned for e in exercise_entries)
    if get_active_plan(user) is None:
        return {"calories": round(total, 2), "note": ""}
    extra = sum(e.calories_burned for e in exercise_entries if not e.is_planned)
    planned = total - extra
    budget = round(extra * 0.5, 2)
    if planned and extra:
        note = "Planned training is already in your target; extra activity adds half its estimated burn."
    elif planned:
        note = "Training is already included in your plan target."
    elif extra:
        note = "Extra activity adds half its estimated burn to your budget."
    else:
        note = ""
    return {"calories": budget, "note": note}


CHECK_IN_DAYS = 14
CHECK_IN_MIN_DIFF_KCAL = 100


def plan_insights(plan: Plan) -> dict:
    """Progress (on the smoothed weight trend), goal status and the coach check-in, from one coach report."""
    cached = getattr(plan, "_insights", None)
    if cached is not None:
        return cached
    from .coach import build_coach_report

    profile = get_or_create_profile(plan.owner)
    report = build_coach_report(plan.owner, profile, plan)
    today = timezone.localdate()

    latest = (
        WeightEntry.objects.filter(owner=plan.owner, entry_date__gte=plan.start_date)
        .order_by("-entry_date", "-created_at")
        .first()
    )
    # The trend smooths day-to-day water swings; fall back to the raw weigh-in early on.
    current = report["latest_trend_weight"] or (latest.weight_kg if latest else plan.start_weight_kg)
    distance = plan.target_weight_kg - plan.start_weight_kg
    pct = max(min((current - plan.start_weight_kg) / distance * 100, 100), 0) if distance else 100.0
    weeks_elapsed = max((today - plan.start_date).days, 0) / 7

    goal_reached = plan.goal_reached_at is not None or (
        latest is not None
        and (
            (plan.goal_type == NutritionProfile.GOAL_GAIN and current >= plan.target_weight_kg)
            or (plan.goal_type == NutritionProfile.GOAL_LOSE and current <= plan.target_weight_kg)
        )
    )
    if goal_reached and plan.goal_reached_at is None and plan.status == Plan.STATUS_ACTIVE:
        plan.goal_reached_at = today
        plan.save(update_fields=["goal_reached_at", "updated_at"])

    since = plan.last_check_in_at or plan.start_date
    next_date = since + timedelta(days=CHECK_IN_DAYS)
    rec = report["recommendation"]
    if today < next_date:
        check_in = {"status": "too_early", "next_date": next_date.isoformat()}
    elif rec is None:
        check_in = {
            "status": "need_data",
            "next_date": next_date.isoformat(),
            "logged_days": report["data"]["logged_days"],
            "weigh_ins": report["data"]["weigh_ins"],
        }
    else:
        diff = rec["calories"] - plan.daily_calorie_target
        check_in = {
            "status": "adjust" if abs(diff) >= CHECK_IN_MIN_DIFF_KCAL else "on_track",
            "next_date": next_date.isoformat(),
            "expenditure": report["expenditure"],
            "confidence": report["confidence"],
            "recommended": {
                "calories": rec["calories"],
                "protein_grams": rec["protein_grams"],
                "carbs_grams": rec["carbs_grams"],
                "fat_grams": rec["fat_grams"],
            },
            "difference_kcal": diff,
            "rationale": rec["rationale"],
        }

    insights = {
        "progress": {
            "current_weight_kg": round(current, 2),
            "change_kg": round(current - plan.start_weight_kg, 2),
            "remaining_kg": round(plan.target_weight_kg - current, 2),
            "percent_complete": round(pct, 1),
            "weeks_elapsed": round(weeks_elapsed, 1),
            "expected_change_kg": round(plan.weekly_change_kg * weeks_elapsed, 2),
            "is_trend": report["latest_trend_weight"] is not None,
        },
        "goal_reached": goal_reached and plan.goal_type != NutritionProfile.GOAL_MAINTAIN,
        "check_in": check_in,
    }
    plan._insights = insights
    return insights


def plan_progress(plan: Plan) -> dict:
    return plan_insights(plan)["progress"]


@transaction.atomic
def apply_check_in(plan: Plan) -> Plan:
    """Accept the coach's adjusted targets (or acknowledge being on track) and restart the 2-week clock."""
    check_in = plan_insights(plan)["check_in"]
    if check_in["status"] not in ("adjust", "on_track"):
        raise PlanInputError("There's no check-in ready yet.")
    if check_in["status"] == "adjust":
        rec = check_in["recommended"]
        plan.daily_calorie_target = rec["calories"]
        plan.protein_target_grams = rec["protein_grams"]
        plan.carbs_target_grams = rec["carbs_grams"]
        plan.fat_target_grams = rec["fat_grams"]
        if check_in.get("expenditure"):
            plan.maintenance_calories = int(check_in["expenditure"])
    plan.last_check_in_at = timezone.localdate()
    plan.save()
    plan._insights = None
    if plan.status == Plan.STATUS_ACTIVE:
        sync_profile_targets(plan)
    return plan


def program_as_input(plan: Plan) -> list[dict]:
    return [
        {
            "weekday": day.weekday,
            "title": day.title,
            "notes": day.notes,
            "exercises": [
                {
                    "exercise_id": ex.exercise_id,
                    "name": ex.name,
                    "kind": ex.kind,
                    "sets": ex.sets,
                    "rep_min": ex.rep_min,
                    "rep_max": ex.rep_max,
                    "duration_min": ex.duration_min,
                    "rest_seconds": ex.rest_seconds,
                    "notes": ex.notes,
                }
                for ex in day.exercises.all()
            ],
        }
        for day in plan.workout_days.all()
    ]


def switch_to_maintain(plan: Plan) -> Plan:
    """Start a maintain plan at the current (trend) weight, keeping the same training program."""
    profile = get_or_create_profile(plan.owner)
    current = plan_insights(plan)["progress"]["current_weight_kg"]
    return create_plan(
        plan.owner,
        {
            "goal_type": NutritionProfile.GOAL_MAINTAIN,
            "pace": "middle",
            "sex": plan.sex,
            "age": profile.age or plan.age,
            "height_cm": plan.height_cm,
            "weight_kg": current,
            "job_activity": plan.job_activity,
            "weekly_training": plan.weekly_training,
            "equipment": plan.equipment,
            "workout_days": program_as_input(plan),
        },
    )
