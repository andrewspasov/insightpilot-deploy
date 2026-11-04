from __future__ import annotations

from datetime import date, datetime, timedelta

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from billing.permissions import ToolAccessPermission
from .models import (
    CustomFood,
    Exercise,
    ExerciseEntry,
    FastingSession,
    MealEntry,
    NutritionProfile,
    Plan,
    PlanExercise,
    PlanMealOption,
    PlanWorkoutDay,
    Recipe,
    SavedMeal,
    SavedMealItem,
    WaterEntry,
    WeightEntry,
    WorkoutSession,
    WorkoutSet,
)
from .serializers import (
    CustomFoodSerializer,
    ExerciseSerializer,
    MealEntrySerializer,
    NutritionProfileSerializer,
    ExerciseEntrySerializer,
    FastingSessionSerializer,
    PlanExerciseSerializer,
    PlanMealOptionSerializer,
    PlanSerializer,
    PlanSummarySerializer,
    PlanWorkoutDaySerializer,
    RecipeSerializer,
    SavedMealSerializer,
    WaterEntrySerializer,
    WeightEntrySerializer,
    WorkoutSessionSerializer,
)
from .services import search_foods_for_user
from .coach import apply_recommendation, build_coach_report
from . import food_images
from . import plans as plan_service
from .meal_library import AVOID_OPTIONS, LIKE_OPTIONS
from .planning import PlanInputError
from .program_templates import (
    EQUIPMENT_CHOICES,
    HOME_GEAR_CHOICES,
    ProgramError,
    split_summaries,
    suggest_program,
)


MEAL_ORDER = [
    (MealEntry.MEAL_BREAKFAST, "Breakfast"),
    (MealEntry.MEAL_LUNCH, "Lunch"),
    (MealEntry.MEAL_DINNER, "Dinner"),
    (MealEntry.MEAL_SNACKS, "Snacks"),
]


def _parse_date(raw_value: str | None) -> date:
    if not raw_value:
        return timezone.localdate()
    try:
        return date.fromisoformat(raw_value)
    except ValueError as exc:
        raise ValueError("Use YYYY-MM-DD for date values.") from exc


def _default_profile_values() -> dict:
    return {
        "goal_type": NutritionProfile.GOAL_TRACK,
        "daily_calorie_target": 2000,
        "protein_target_grams": 150.0,
        "carbs_target_grams": 250.0,
        "fat_target_grams": 70.0,
    }


def _get_or_create_profile(user):
    profile, _ = NutritionProfile.objects.get_or_create(
        owner=user,
        defaults=_default_profile_values(),
    )
    return profile


def _build_totals(entries) -> dict:
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


def _build_remaining(profile: NutritionProfile, totals: dict) -> dict:
    return {
        "calories": round(profile.daily_calorie_target - totals["calories"], 2),
        "protein_grams": round(profile.protein_target_grams - totals["protein_grams"], 2),
        "carbs_grams": round(profile.carbs_target_grams - totals["carbs_grams"], 2),
        "fat_grams": round(profile.fat_target_grams - totals["fat_grams"], 2),
    }


ENTRY_COPY_FIELDS = [
    "food_source",
    "external_food_id",
    "food_name",
    "brand_name",
    "serving_description",
    "measurement_unit",
    "grams_per_unit",
    "image_url",
    "serving_calories",
    "serving_protein_grams",
    "serving_carbs_grams",
    "serving_fat_grams",
    "serving_fiber_grams",
    "serving_sugar_grams",
    "serving_sodium_mg",
]


def _validate_meal_type(raw_value: str | None, field_name: str = "meal_type") -> str:
    valid_meals = {meal_type for meal_type, _ in MEAL_ORDER}
    if raw_value not in valid_meals:
        raise ValueError(f"{field_name} must be one of {', '.join(sorted(valid_meals))}.")
    return raw_value


def _entry_copy_kwargs(entry: MealEntry, target_date: date, target_meal_type: str) -> dict:
    payload = {field: getattr(entry, field) for field in ENTRY_COPY_FIELDS}
    payload.update(
        {
            "entry_date": target_date,
            "meal_type": target_meal_type,
            "servings": entry.servings,
        }
    )
    return payload


def _saved_item_kwargs(entry: MealEntry, order: int) -> dict:
    payload = {field: getattr(entry, field) for field in ENTRY_COPY_FIELDS}
    payload.update(
        {
            "order": order,
            "quantity": entry.servings,
        }
    )
    return payload


def _entry_from_saved_item_kwargs(item: SavedMealItem, target_date: date, target_meal_type: str) -> dict:
    payload = {field: getattr(item, field) for field in ENTRY_COPY_FIELDS}
    payload.update(
        {
            "entry_date": target_date,
            "meal_type": target_meal_type,
            "servings": item.quantity,
        }
    )
    return payload


class NutritionProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = NutritionProfileSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_object(self):
        return _get_or_create_profile(self.request.user)


class CustomFoodViewSet(viewsets.ModelViewSet):
    serializer_class = CustomFoodSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        queryset = CustomFood.objects.filter(owner=self.request.user).order_by("-is_favorite", "-updated_at")
        barcode = (self.request.query_params.get("barcode") or "").strip()
        return queryset.filter(barcode=barcode) if barcode else queryset

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class MealEntryViewSet(viewsets.ModelViewSet):
    serializer_class = MealEntrySerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        queryset = MealEntry.objects.filter(owner=self.request.user).order_by("-entry_date", "meal_type", "created_at")
        entry_date = self.request.query_params.get("date")
        if entry_date:
            try:
                parsed_date = _parse_date(entry_date)
            except ValueError:
                return queryset.none()
            queryset = queryset.filter(entry_date=parsed_date)
        return queryset

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=["post"], url_path="copy-meal")
    def copy_meal(self, request):
        try:
            source_date = _parse_date(request.data.get("source_date"))
            target_date = _parse_date(request.data.get("target_date"))
            source_meal_type = _validate_meal_type(request.data.get("source_meal_type"), "source_meal_type")
            target_meal_type = _validate_meal_type(
                request.data.get("target_meal_type") or source_meal_type,
                "target_meal_type",
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        source_entries = list(
            MealEntry.objects.filter(
                owner=request.user,
                entry_date=source_date,
                meal_type=source_meal_type,
            ).order_by("created_at")
        )
        if not source_entries:
            return Response(
                {"detail": "No entries found for the selected source meal."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_entries = [
            MealEntry.objects.create(
                owner=request.user,
                **_entry_copy_kwargs(entry, target_date, target_meal_type),
            )
            for entry in source_entries
        ]
        return Response(MealEntrySerializer(created_entries, many=True).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="copy-entries")
    def copy_entries(self, request):
        """Copy chosen entries to a date, into their own meals or all into target_meal_type."""
        try:
            target_date = _parse_date(request.data.get("target_date"))
            target_meal_type = request.data.get("target_meal_type")
            if target_meal_type:
                _validate_meal_type(target_meal_type, "target_meal_type")
            entry_ids = [int(i) for i in request.data.get("entry_ids") or []]
        except (TypeError, ValueError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        source_entries = list(
            MealEntry.objects.filter(owner=request.user, id__in=entry_ids).order_by("meal_type", "created_at")
        )
        if not source_entries:
            return Response({"detail": "Choose at least one food to copy."}, status=status.HTTP_400_BAD_REQUEST)

        created_entries = [
            MealEntry.objects.create(
                owner=request.user,
                **_entry_copy_kwargs(entry, target_date, target_meal_type or entry.meal_type),
            )
            for entry in source_entries
        ]
        return Response(MealEntrySerializer(created_entries, many=True).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="calendar")
    def calendar(self, request):
        """Logged days in a month for the diary calendar: ?month=YYYY-MM."""
        try:
            first = datetime.strptime(str(request.query_params.get("month") or ""), "%Y-%m").date()
        except ValueError:
            return Response({"detail": "month must look like YYYY-MM."}, status=status.HTTP_400_BAD_REQUEST)
        next_month = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
        rows = (
            MealEntry.objects.filter(owner=request.user, entry_date__gte=first, entry_date__lt=next_month)
            .values("entry_date")
            .annotate(calories=Sum("calories"), entries=Count("id"))
            .order_by("entry_date")
        )
        return Response(
            {
                "month": first.strftime("%Y-%m"),
                "days": [
                    {"date": row["entry_date"].isoformat(), "calories": round(row["calories"] or 0), "entries": row["entries"]}
                    for row in rows
                ],
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="copy-day")
    def copy_day(self, request):
        try:
            source_date = _parse_date(request.data.get("source_date"))
            target_date = _parse_date(request.data.get("target_date"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        source_entries = list(
            MealEntry.objects.filter(owner=request.user, entry_date=source_date).order_by("meal_type", "created_at")
        )
        if not source_entries:
            return Response(
                {"detail": "No entries found for the selected source day."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_entries = [
            MealEntry.objects.create(
                owner=request.user,
                **_entry_copy_kwargs(entry, target_date, entry.meal_type),
            )
            for entry in source_entries
        ]
        return Response(MealEntrySerializer(created_entries, many=True).data, status=status.HTTP_201_CREATED)


class SavedMealViewSet(viewsets.ModelViewSet):
    serializer_class = SavedMealSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        return (
            SavedMeal.objects.filter(owner=self.request.user)
            .prefetch_related("items")
            .order_by("-updated_at", "name")
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=["post"], url_path="save-from-diary")
    def save_from_diary(self, request):
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            entry_date = _parse_date(request.data.get("entry_date"))
            meal_type = _validate_meal_type(request.data.get("meal_type"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        source_entries = list(
            MealEntry.objects.filter(
                owner=request.user,
                entry_date=entry_date,
                meal_type=meal_type,
            ).order_by("created_at")
        )
        if not source_entries:
            return Response(
                {"detail": "No diary entries found for that meal."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            saved_meal = SavedMeal.objects.create(
                owner=request.user,
                name=name,
                meal_type=meal_type,
            )
            for index, entry in enumerate(source_entries):
                SavedMealItem.objects.create(
                    saved_meal=saved_meal,
                    **_saved_item_kwargs(entry, index),
                )

        serializer = self.get_serializer(saved_meal)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="log")
    def log(self, request, pk=None):
        saved_meal = self.get_object()
        try:
            entry_date = _parse_date(request.data.get("entry_date"))
            meal_type = _validate_meal_type(request.data.get("meal_type") or saved_meal.meal_type)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        items = list(saved_meal.items.all())
        if not items:
            return Response(
                {"detail": "Saved meal has no items."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_entries = [
            MealEntry.objects.create(
                owner=request.user,
                **_entry_from_saved_item_kwargs(item, entry_date, meal_type),
            )
            for item in items
        ]
        return Response(MealEntrySerializer(created_entries, many=True).data, status=status.HTTP_201_CREATED)


class WeightEntryViewSet(viewsets.ModelViewSet):
    serializer_class = WeightEntrySerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        queryset = WeightEntry.objects.filter(owner=self.request.user).order_by("-entry_date", "-created_at")
        entry_date = self.request.query_params.get("date")
        if entry_date:
            try:
                parsed_date = _parse_date(entry_date)
            except ValueError:
                return queryset.none()
            queryset = queryset.filter(entry_date=parsed_date)
        return queryset

    def create(self, request, *args, **kwargs):
        payload = request.data.copy()
        entry_date = payload.get("entry_date") or str(timezone.localdate())
        existing = WeightEntry.objects.filter(owner=request.user, entry_date=entry_date).first()
        if existing:
            serializer = self.get_serializer(existing, data=payload, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class WaterEntryViewSet(viewsets.ModelViewSet):
    serializer_class = WaterEntrySerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        queryset = WaterEntry.objects.filter(owner=self.request.user).order_by("-entry_date")
        entry_date = self.request.query_params.get("date")
        if entry_date:
            try:
                parsed_date = _parse_date(entry_date)
            except ValueError:
                return queryset.none()
            queryset = queryset.filter(entry_date=parsed_date)
        return queryset

    def create(self, request, *args, **kwargs):
        """Upsert per (owner, date). Supports `add_ml` to increment the daily total."""
        payload = request.data.copy()
        entry_date = payload.get("entry_date") or str(timezone.localdate())
        payload["entry_date"] = entry_date

        add_ml = payload.pop("add_ml", None)
        if isinstance(add_ml, list):
            add_ml = add_ml[0] if add_ml else None

        existing = WaterEntry.objects.filter(owner=request.user, entry_date=entry_date).first()

        if add_ml is not None:
            try:
                delta = int(add_ml)
            except (TypeError, ValueError):
                return Response({"detail": "add_ml must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
            current = existing.total_ml if existing else 0
            payload["total_ml"] = max(current + delta, 0)

        if existing:
            serializer = self.get_serializer(existing, data=payload, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class FoodSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get(self, request):
        query = (request.query_params.get("query") or "").strip()
        limit_raw = request.query_params.get("limit") or "12"
        try:
            limit = max(1, min(int(limit_raw), 25))
        except ValueError:
            return Response(
                {"detail": "limit must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = search_foods_for_user(
            request.user,
            query=query,
            limit=limit,
            request=request,
        )
        return Response(
            {
                "query": query,
                "count": len(results),
                "results": results,
            },
            status=status.HTTP_200_OK,
        )


class NutritionOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get(self, request):
        try:
            selected_date = _parse_date(request.query_params.get("date"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        profile = _get_or_create_profile(request.user)
        entries = list(
            MealEntry.objects.filter(owner=request.user, entry_date=selected_date).order_by("meal_type", "created_at")
        )
        weight_entry = WeightEntry.objects.filter(owner=request.user, entry_date=selected_date).first()
        latest_weight_entry = WeightEntry.objects.filter(owner=request.user).order_by("-entry_date", "-created_at").first()
        recent_weights = list(
            WeightEntry.objects.filter(owner=request.user).order_by("-entry_date", "-created_at")[:7]
        )

        exercise_entries = list(
            ExerciseEntry.objects.filter(owner=request.user, entry_date=selected_date).order_by("created_at")
        )
        exercise_calories = round(sum(item.calories_burned for item in exercise_entries), 2)
        exercise_budget = plan_service.exercise_budget(request.user, exercise_entries)

        totals = _build_totals(entries)
        remaining = _build_remaining(profile, totals)
        # Logged exercise may extend the daily budget (see plans.exercise_budget).
        remaining["calories"] = round(remaining["calories"] + exercise_budget["calories"], 2)
        photos = food_images.images_for(entry.food_name for entry in entries if not entry.image_url)
        entry_serializer = MealEntrySerializer(entries, many=True, context={"food_images": photos})

        entries_by_id = {item["id"]: item for item in entry_serializer.data}
        meal_sections = []
        for meal_type, label in MEAL_ORDER:
            meal_entries = [entry for entry in entries if entry.meal_type == meal_type]
            meal_sections.append(
                {
                    "meal_type": meal_type,
                    "label": label,
                    "totals": _build_totals(meal_entries),
                    "entries": [entries_by_id[entry.id] for entry in meal_entries],
                }
            )

        return Response(
            {
                "date": str(selected_date),
                "profile": NutritionProfileSerializer(profile).data,
                "totals": totals,
                "remaining": remaining,
                "meal_sections": meal_sections,
                "weight_entry": WeightEntrySerializer(weight_entry).data if weight_entry else None,
                "latest_weight_entry": (
                    WeightEntrySerializer(latest_weight_entry).data if latest_weight_entry else None
                ),
                "recent_weights": WeightEntrySerializer(recent_weights, many=True).data,
                "entries_count": len(entries),
                "exercise_entries": ExerciseEntrySerializer(exercise_entries, many=True).data,
                "exercise_calories": exercise_calories,
                "exercise_budget_calories": exercise_budget["calories"],
                "exercise_budget_note": exercise_budget["note"],
            },
            status=status.HTTP_200_OK,
        )


class NutritionInsightsView(APIView):
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get(self, request):
        days_raw = request.query_params.get("days") or "7"
        try:
            days = max(1, min(int(days_raw), 90))
        except ValueError:
            return Response(
                {"detail": "days must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            end_date = _parse_date(request.query_params.get("end_date"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        start_date = end_date - timedelta(days=days - 1)
        profile = _get_or_create_profile(request.user)

        entries = list(
            MealEntry.objects.filter(
                owner=request.user,
                entry_date__gte=start_date,
                entry_date__lte=end_date,
            ).order_by("entry_date", "created_at")
        )
        weights = list(
            WeightEntry.objects.filter(
                owner=request.user,
                entry_date__gte=start_date,
                entry_date__lte=end_date,
            ).order_by("entry_date")
        )

        daily_series = []
        days_with_logs = 0
        days_on_target = 0

        for index in range(days):
            current_date = start_date + timedelta(days=index)
            current_entries = [entry for entry in entries if entry.entry_date == current_date]
            totals = _build_totals(current_entries)
            if current_entries:
                days_with_logs += 1
                calories = totals["calories"]
                lower_bound = profile.daily_calorie_target * 0.9
                upper_bound = profile.daily_calorie_target * 1.1
                if lower_bound <= calories <= upper_bound:
                    days_on_target += 1
            daily_series.append({"date": str(current_date), **totals})

        logged_days = [day for day in daily_series if day["calories"] > 0]
        average_divisor = len(logged_days) or 1
        averages = {
            "calories": round(sum(day["calories"] for day in logged_days) / average_divisor, 2),
            "protein_grams": round(sum(day["protein_grams"] for day in logged_days) / average_divisor, 2),
            "carbs_grams": round(sum(day["carbs_grams"] for day in logged_days) / average_divisor, 2),
            "fat_grams": round(sum(day["fat_grams"] for day in logged_days) / average_divisor, 2),
        }

        weight_change_kg = 0.0
        if len(weights) >= 2:
            weight_change_kg = round(weights[-1].weight_kg - weights[0].weight_kg, 2)

        adherence_pct = round((days_on_target / days_with_logs) * 100, 2) if days_with_logs else 0.0

        # Logging streaks over the last year (independent of the selected window).
        today = timezone.localdate()
        logged_dates = set(
            MealEntry.objects.filter(
                owner=request.user,
                entry_date__gte=today - timedelta(days=365),
                entry_date__lte=today,
            )
            .values_list("entry_date", flat=True)
            .distinct()
        )
        current_streak = 0
        cursor = today if today in logged_dates else today - timedelta(days=1)
        while cursor in logged_dates:
            current_streak += 1
            cursor -= timedelta(days=1)
        best_streak = 0
        run = 0
        for offset in range(365, -1, -1):
            day_cursor = today - timedelta(days=offset)
            if day_cursor in logged_dates:
                run += 1
                best_streak = max(best_streak, run)
            else:
                run = 0
        headline = (
            f"You logged {days_with_logs} of the last {days} day(s) with "
            f"{adherence_pct:.0f}% calorie-target adherence."
            if days_with_logs
            else "Start logging meals to unlock trend insights."
        )

        return Response(
            {
                "days": days,
                "start_date": str(start_date),
                "end_date": str(end_date),
                "profile": NutritionProfileSerializer(profile).data,
                "daily_series": daily_series,
                "averages": averages,
                "days_with_logs": days_with_logs,
                "days_on_target": days_on_target,
                "adherence_pct": adherence_pct,
                "weight_series": WeightEntrySerializer(weights, many=True).data,
                "weight_change_kg": weight_change_kg,
                "headline": headline,
                "current_streak": current_streak,
                "best_streak": best_streak,
            },
            status=status.HTTP_200_OK,
        )


class RecipeViewSet(viewsets.ModelViewSet):
    serializer_class = RecipeSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        return (
            Recipe.objects.filter(owner=self.request.user)
            .prefetch_related("ingredients")
            .order_by("-updated_at", "name")
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=["post"], url_path="log")
    def log(self, request, pk=None):
        """Log a recipe to the diary as a single entry with per-serving macros."""
        recipe = self.get_object()
        try:
            entry_date = _parse_date(request.data.get("entry_date"))
            meal_type = _validate_meal_type(request.data.get("meal_type"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            servings = float(request.data.get("servings") or 1)
        except (TypeError, ValueError):
            return Response({"detail": "servings must be a number."}, status=status.HTTP_400_BAD_REQUEST)
        if servings <= 0:
            return Response({"detail": "servings must be positive."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(recipe)
        per_serving = serializer.data["per_serving"]
        if not recipe.ingredients.exists():
            return Response({"detail": "Recipe has no ingredients."}, status=status.HTTP_400_BAD_REQUEST)

        entry = MealEntry.objects.create(
            owner=request.user,
            entry_date=entry_date,
            meal_type=meal_type,
            food_source=MealEntry.SOURCE_CUSTOM,
            external_food_id=f"recipe-{recipe.id}",
            food_name=recipe.name,
            brand_name="Recipe",
            serving_description="1 serving",
            measurement_unit="serving",
            quantity=servings,
            servings=servings,
            serving_calories=per_serving["calories"],
            serving_protein_grams=per_serving["protein_grams"],
            serving_carbs_grams=per_serving["carbs_grams"],
            serving_fat_grams=per_serving["fat_grams"],
            serving_fiber_grams=per_serving["fiber_grams"],
            serving_sugar_grams=per_serving["sugar_grams"],
            serving_sodium_mg=per_serving["sodium_mg"],
        )
        return Response(MealEntrySerializer(entry).data, status=status.HTTP_201_CREATED)


class ExerciseEntryViewSet(viewsets.ModelViewSet):
    serializer_class = ExerciseEntrySerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        queryset = ExerciseEntry.objects.filter(owner=self.request.user).order_by("-entry_date", "-created_at")
        entry_date = self.request.query_params.get("date")
        if entry_date:
            try:
                parsed_date = _parse_date(entry_date)
            except ValueError:
                return queryset.none()
            queryset = queryset.filter(entry_date=parsed_date)
        return queryset

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class FastingSessionViewSet(viewsets.ModelViewSet):
    serializer_class = FastingSessionSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        return FastingSession.objects.filter(owner=self.request.user).order_by("-started_at")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request):
        active = self.get_queryset().filter(ended_at__isnull=True).first()
        if not active:
            return Response({"active": None}, status=status.HTTP_200_OK)
        return Response({"active": self.get_serializer(active).data}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="start")
    def start(self, request):
        active = self.get_queryset().filter(ended_at__isnull=True).first()
        if active:
            return Response(
                {"detail": "A fast is already running."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            target_hours = float(request.data.get("target_hours") or 16)
        except (TypeError, ValueError):
            return Response({"detail": "target_hours must be a number."}, status=status.HTTP_400_BAD_REQUEST)
        session = FastingSession.objects.create(
            owner=request.user,
            target_hours=max(target_hours, 1.0),
        )
        return Response(self.get_serializer(session).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="stop")
    def stop(self, request):
        active = self.get_queryset().filter(ended_at__isnull=True).first()
        if not active:
            return Response({"detail": "No active fast."}, status=status.HTTP_400_BAD_REQUEST)
        active.ended_at = timezone.now()
        active.save(update_fields=["ended_at", "updated_at"])
        return Response(self.get_serializer(active).data, status=status.HTTP_200_OK)


class NutritionCoachView(APIView):
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get(self, request):
        profile = _get_or_create_profile(request.user)
        return Response(build_coach_report(request.user, profile), status=status.HTTP_200_OK)


class NutritionCoachApplyView(APIView):
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def post(self, request):
        profile = _get_or_create_profile(request.user)
        mode = str(request.data.get("mode") or "coached").strip().lower()
        report = build_coach_report(request.user, profile)
        try:
            profile = apply_recommendation(profile, report, mode)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(NutritionProfileSerializer(profile).data, status=status.HTTP_200_OK)


def _plan_error(exc: Exception) -> Response:
    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class ExerciseLibraryViewSet(viewsets.ReadOnlyModelViewSet):
    """Search the shared exercise library: ?search=&muscle=&equipment=&category=&limit="""

    serializer_class = ExerciseSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        queryset = Exercise.objects.all().order_by("name")
        params = self.request.query_params
        for word in (params.get("search") or "").split():
            queryset = queryset.filter(name__icontains=word)
        muscle = (params.get("muscle") or "").strip().lower()
        if muscle:
            queryset = queryset.filter(
                Q(primary_muscles__icontains=f'"{muscle}"') | Q(secondary_muscles__icontains=f'"{muscle}"')
            )
        for field in ("equipment", "category"):
            value = (params.get(field) or "").strip().lower()
            if value:
                queryset = queryset.filter(**{field: value})
        return queryset

    def list(self, request, *args, **kwargs):
        try:
            limit = max(1, min(int(request.query_params.get("limit") or 50), 200))
        except ValueError:
            return Response({"detail": "limit must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
        queryset = self.get_queryset()
        results = self.get_serializer(queryset[:limit], many=True).data
        return Response({"count": queryset.count(), "results": results}, status=status.HTTP_200_OK)


class PlanViewSet(viewsets.GenericViewSet):
    """Plans: history list, detail, active plan, preview, create, change pace, archive."""

    serializer_class = PlanSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        return (
            Plan.objects.filter(owner=self.request.user)
            .prefetch_related("workout_days__exercises__exercise", "meal_options")
            .order_by("-created_at")
        )

    def get_serializer(self, *args, **kwargs):
        # Look up (and cache) photos for the plan's example meals in one go.
        plan = args[0] if args else kwargs.get("instance")
        if isinstance(plan, Plan):
            context = kwargs.setdefault("context", self.get_serializer_context())
            context["food_images"] = food_images.images_for(option.name for option in plan.meal_options.all())
        return super().get_serializer(*args, **kwargs)

    def list(self, request):
        return Response(PlanSummarySerializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

    def retrieve(self, request, pk=None):
        plan = self.get_object()
        plan_service.ensure_todays_meals(plan)
        return Response(self.get_serializer(self.get_queryset().get(pk=plan.pk)).data, status=status.HTTP_200_OK)

    def create(self, request):
        try:
            plan = plan_service.create_plan(request.user, request.data)
        except PlanInputError as exc:
            return _plan_error(exc)
        plan = self.get_queryset().get(pk=plan.pk)
        return Response(self.get_serializer(plan).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="active")
    def active(self, request):
        plan = self.get_queryset().filter(status=Plan.STATUS_ACTIVE).first()
        if plan and plan.meals_date != timezone.localdate():
            plan_service.ensure_todays_meals(plan)
            plan = self.get_queryset().get(pk=plan.pk)
        return Response(
            {"plan": self.get_serializer(plan).data if plan else None},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="preview")
    def preview(self, request):
        try:
            result = plan_service.preview_plan(request.user, request.data)
        except PlanInputError as exc:
            return _plan_error(exc)
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="set-pace")
    def set_pace(self, request, pk=None):
        plan = self.get_object()
        try:
            plan = plan_service.set_plan_pace(plan, str(request.data.get("pace") or "").strip().lower())
        except PlanInputError as exc:
            return _plan_error(exc)
        return Response(self.get_serializer(plan).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="suggest-exercises")
    def suggest_exercises(self, request, pk=None):
        """Fill days from their titles. Body: day_ids (default: all days), replace, equipment, include_abs, home_gear."""
        plan = self.get_object()
        day_ids = request.data.get("day_ids") or list(plan.workout_days.values_list("id", flat=True))
        include_abs = request.data.get("include_abs")
        home_gear = request.data.get("home_gear")
        result = plan_service.suggest_exercises_for_days(
            plan,
            [int(i) for i in day_ids],
            replace=bool(request.data.get("replace")),
            equipment=request.data.get("equipment") or None,
            include_abs=None if include_abs is None else bool(include_abs),
            home_gear=home_gear if isinstance(home_gear, list) else None,
        )
        plan = self.get_queryset().get(pk=plan.pk)
        return Response({**result, "plan": self.get_serializer(plan).data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="suggest-meals")
    def suggest_meals(self, request, pk=None):
        """Built-in example meals (no AI); fresh=true prefers meals not shown yet."""
        plan = self.get_object()
        empty = plan_service.fill_builtin_meals(plan, fresh=bool(request.data.get("fresh", True)))
        plan = self.get_queryset().get(pk=plan.pk)
        return Response({"no_options_for": empty, "plan": self.get_serializer(plan).data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="apply-check-in")
    def apply_check_in(self, request, pk=None):
        try:
            plan = plan_service.apply_check_in(self.get_object())
        except PlanInputError as exc:
            return _plan_error(exc)
        return Response(self.get_serializer(self.get_queryset().get(pk=plan.pk)).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="switch-to-maintain")
    def switch_to_maintain(self, request, pk=None):
        plan = self.get_object()
        if plan.status != Plan.STATUS_ACTIVE:
            return Response({"detail": "Only the active plan can be switched."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            new_plan = plan_service.switch_to_maintain(plan)
        except PlanInputError as exc:
            return _plan_error(exc)
        return Response(
            self.get_serializer(self.get_queryset().get(pk=new_plan.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="archive")
    def archive(self, request, pk=None):
        plan = plan_service.archive_plan(self.get_object())
        return Response(self.get_serializer(plan).data, status=status.HTTP_200_OK)


class PlanWorkoutDayViewSet(viewsets.ModelViewSet):
    serializer_class = PlanWorkoutDaySerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        return PlanWorkoutDay.objects.filter(plan__owner=self.request.user).prefetch_related(
            "exercises__exercise"
        )


class PlanExerciseViewSet(viewsets.ModelViewSet):
    """Add, swap (PATCH exercise_id), edit or remove exercises in a plan day."""

    serializer_class = PlanExerciseSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        return PlanExercise.objects.filter(day__plan__owner=self.request.user).select_related("exercise")


class PlanMealOptionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PlanMealOptionSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        return PlanMealOption.objects.filter(plan__owner=self.request.user)

    @action(detail=True, methods=["post"], url_path="log")
    def log(self, request, pk=None):
        option = self.get_object()
        try:
            entry_date = _parse_date(request.data.get("entry_date"))
            meal_type = request.data.get("meal_type")
            if meal_type:
                meal_type = _validate_meal_type(meal_type)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        entries = plan_service.log_meal_option(option, entry_date, meal_type)
        return Response(MealEntrySerializer(entries, many=True).data, status=status.HTTP_201_CREATED)


class WorkoutSessionViewSet(viewsets.ModelViewSet):
    serializer_class = WorkoutSessionSerializer
    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get_queryset(self):
        queryset = (
            WorkoutSession.objects.filter(owner=self.request.user)
            .select_related("exercise_entry")
            .prefetch_related("sets")
            .order_by("-entry_date", "-started_at")
        )
        entry_date = self.request.query_params.get("date")
        if entry_date:
            try:
                queryset = queryset.filter(entry_date=_parse_date(entry_date))
            except ValueError:
                return queryset.none()
        return queryset

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_destroy(self, instance):
        # Removing a workout also removes its line in the exercise log.
        if instance.exercise_entry_id:
            instance.exercise_entry.delete()
        instance.delete()

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        session = self.get_object()
        duration = request.data.get("duration_min")
        try:
            duration = int(duration) if duration not in (None, "") else None
        except (TypeError, ValueError):
            return Response({"detail": "duration_min must be a whole number."}, status=status.HTTP_400_BAD_REQUEST)
        session = plan_service.complete_workout(session, duration)
        return Response(self.get_serializer(session).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="last-performance")
    def last_performance(self, request):
        """Sets from the most recent completed workout containing an exercise.

        ?exercise=<library id> or ?plan_exercise=<id>; optional &exclude_session=<id>.
        """
        sets = WorkoutSet.objects.filter(
            session__owner=request.user,
            session__completed_at__isnull=False,
            completed=True,
        )
        exercise_id = request.query_params.get("exercise")
        plan_exercise_id = request.query_params.get("plan_exercise")
        if exercise_id:
            sets = sets.filter(exercise_id=exercise_id)
        elif plan_exercise_id:
            plan_exercise = PlanExercise.objects.filter(
                id=plan_exercise_id, day__plan__owner=request.user
            ).first()
            if plan_exercise is None:
                return Response({"session": None, "sets": []}, status=status.HTTP_200_OK)
            match = Q(plan_exercise=plan_exercise)
            if plan_exercise.exercise_id:
                match |= Q(exercise_id=plan_exercise.exercise_id)
            sets = sets.filter(match)
        else:
            return Response(
                {"detail": "Pass exercise or plan_exercise."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        exclude = request.query_params.get("exclude_session")
        if exclude:
            sets = sets.exclude(session_id=exclude)
        latest = sets.order_by("-session__entry_date", "-session__started_at").first()
        if latest is None:
            return Response({"session": None, "sets": []}, status=status.HTTP_200_OK)
        session_sets = sets.filter(session_id=latest.session_id).order_by("set_number", "id")
        return Response(
            {
                "session": {"id": latest.session_id, "entry_date": str(latest.session.entry_date)},
                "sets": [
                    {
                        "set_number": s.set_number,
                        "reps": s.reps,
                        "weight_kg": s.weight_kg,
                        "duration_min": s.duration_min,
                        "distance_km": s.distance_km,
                    }
                    for s in session_sets
                ],
            },
            status=status.HTTP_200_OK,
        )


class PlanOptionsView(APIView):
    """Choices for the plan form: ready-made splits, equipment and food preferences."""

    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def get(self, request):
        as_list = lambda pairs: [{"key": key, "label": label} for key, label in pairs]  # noqa: E731
        return Response(
            {
                "splits": split_summaries(),
                "equipment": as_list(EQUIPMENT_CHOICES),
                "home_gear": as_list(HOME_GEAR_CHOICES),
                "liked_foods": as_list(LIKE_OPTIONS),
                "avoided_foods": as_list(AVOID_OPTIONS),
            },
            status=status.HTTP_200_OK,
        )


class ProgramSuggestView(APIView):
    """Exercises for a ready-made split or for the user's own day titles (no AI)."""

    permission_classes = [permissions.IsAuthenticated, ToolAccessPermission]
    tool_key = "nutrition"

    def post(self, request):
        profile = plan_service.get_or_create_profile(request.user)
        data = request.data
        try:
            result = suggest_program(
                equipment=data.get("equipment") or profile.equipment,
                goal=str(data.get("goal_type") or NutritionProfile.GOAL_MAINTAIN),
                include_abs=bool(data.get("include_abs", profile.include_abs)),
                gear=data["home_gear"] if isinstance(data.get("home_gear"), list) else profile.home_gear,
                split=data.get("split") or None,
                weekdays=data.get("weekdays") or None,
                days=data.get("days") or None,
            )
        except (ProgramError, TypeError, ValueError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Attach images so the form can show what it picked.
        ids = {e["exercise_id"] for day in result["days"] for e in day["exercises"]}
        library = {e.id: e for e in Exercise.objects.filter(id__in=ids)}
        for day in result["days"]:
            for entry in day["exercises"]:
                exercise = library.get(entry["exercise_id"])
                entry["image_urls"] = exercise.image_urls if exercise else []
                entry["primary_muscles"] = exercise.primary_muscles if exercise else []
        return Response(result, status=status.HTTP_200_OK)
