from __future__ import annotations

from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from billing.permissions import ToolAccessPermission
from .models import CustomFood, ExerciseEntry, FastingSession, MealEntry, NutritionProfile, Recipe, SavedMeal, SavedMealItem, WaterEntry, WeightEntry
from .serializers import (
    CustomFoodSerializer,
    MealEntrySerializer,
    NutritionProfileSerializer,
    ExerciseEntrySerializer,
    FastingSessionSerializer,
    RecipeSerializer,
    SavedMealSerializer,
    WaterEntrySerializer,
    WeightEntrySerializer,
)
from .services import search_foods_for_user
from .coach import apply_recommendation, build_coach_report


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
        return CustomFood.objects.filter(owner=self.request.user).order_by("-is_favorite", "-updated_at")

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

        totals = _build_totals(entries)
        remaining = _build_remaining(profile, totals)
        # Calories burned through exercise extend the daily budget.
        remaining["calories"] = round(remaining["calories"] + exercise_calories, 2)
        entry_serializer = MealEntrySerializer(entries, many=True)

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
