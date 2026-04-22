from __future__ import annotations

from datetime import date, timedelta

from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from billing.permissions import ToolAccessPermission
from .models import CustomFood, MealEntry, NutritionProfile, WeightEntry
from .serializers import (
    CustomFoodSerializer,
    MealEntrySerializer,
    NutritionProfileSerializer,
    WeightEntrySerializer,
)
from .services import search_foods_for_user


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

        totals = _build_totals(entries)
        remaining = _build_remaining(profile, totals)
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
            },
            status=status.HTTP_200_OK,
        )
