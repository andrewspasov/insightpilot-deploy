from __future__ import annotations

from rest_framework import serializers

from .models import CustomFood, MealEntry, NutritionProfile, WeightEntry


def _resolve_image_url(obj, request=None):
    image_field = getattr(obj, "image", None)
    if image_field:
        try:
            raw_url = image_field.url
        except ValueError:
            raw_url = None
        if raw_url:
            if request is None:
                return raw_url
            return request.build_absolute_uri(raw_url)

    external_image_url = getattr(obj, "external_image_url", "") or getattr(obj, "image_url", "")
    return external_image_url or None


class ZeroDefaultFloatField(serializers.FloatField):
    def to_internal_value(self, data):
        if data in ("", None):
            return 0.0
        return super().to_internal_value(data)


class NullableFloatField(serializers.FloatField):
    def to_internal_value(self, data):
        if data in ("", None):
            return None
        return super().to_internal_value(data)


class NutritionProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = NutritionProfile
        fields = [
            "goal_type",
            "daily_calorie_target",
            "protein_target_grams",
            "carbs_target_grams",
            "fat_target_grams",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class CustomFoodSerializer(serializers.ModelSerializer):
    base_amount = NullableFloatField(required=False, default=1.0, min_value=0.01)
    gram_weight = NullableFloatField(required=False, allow_null=True, min_value=0.01)
    calories = ZeroDefaultFloatField(required=False, default=0.0, min_value=0.0)
    protein_grams = ZeroDefaultFloatField(required=False, default=0.0, min_value=0.0)
    carbs_grams = ZeroDefaultFloatField(required=False, default=0.0, min_value=0.0)
    fat_grams = ZeroDefaultFloatField(required=False, default=0.0, min_value=0.0)
    fiber_grams = ZeroDefaultFloatField(required=False, default=0.0, min_value=0.0)
    sugar_grams = ZeroDefaultFloatField(required=False, default=0.0, min_value=0.0)
    sodium_mg = ZeroDefaultFloatField(required=False, default=0.0, min_value=0.0)
    image = serializers.ImageField(required=False, allow_null=True, write_only=True)
    image_url = serializers.SerializerMethodField()
    available_units = serializers.SerializerMethodField()
    default_unit_key = serializers.SerializerMethodField()

    class Meta:
        model = CustomFood
        fields = [
            "id",
            "name",
            "brand_name",
            "serving_description",
            "base_amount",
            "base_unit",
            "gram_weight",
            "calories",
            "protein_grams",
            "carbs_grams",
            "fat_grams",
            "fiber_grams",
            "sugar_grams",
            "sodium_mg",
            "image",
            "image_url",
            "external_image_url",
            "is_favorite",
            "available_units",
            "default_unit_key",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        if not attrs.get("serving_description"):
            base_amount = attrs.get("base_amount")
            if base_amount is None and self.instance is not None:
                base_amount = self.instance.base_amount
            base_unit = attrs.get("base_unit")
            if not base_unit and self.instance is not None:
                base_unit = self.instance.base_unit
            if base_amount and base_unit:
                amount = int(base_amount) if float(base_amount).is_integer() else base_amount
                attrs["serving_description"] = f"{amount} {base_unit}"
        return attrs

    def get_image_url(self, obj):
        request = self.context.get("request")
        return _resolve_image_url(obj, request)

    def get_available_units(self, obj):
        from .services import build_custom_food_unit_options

        return build_custom_food_unit_options(obj)

    def get_default_unit_key(self, obj):
        from .services import get_default_unit_key

        return get_default_unit_key(self.get_available_units(obj))


class MealEntrySerializer(serializers.ModelSerializer):
    quantity = serializers.FloatField(source="servings", required=False, min_value=0.01)

    class Meta:
        model = MealEntry
        fields = [
            "id",
            "entry_date",
            "meal_type",
            "food_source",
            "external_food_id",
            "food_name",
            "brand_name",
            "serving_description",
            "measurement_unit",
            "quantity",
            "servings",
            "grams_per_unit",
            "total_grams",
            "image_url",
            "serving_calories",
            "serving_protein_grams",
            "serving_carbs_grams",
            "serving_fat_grams",
            "serving_fiber_grams",
            "serving_sugar_grams",
            "serving_sodium_mg",
            "calories",
            "protein_grams",
            "carbs_grams",
            "fat_grams",
            "fiber_grams",
            "sugar_grams",
            "sodium_mg",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "servings",
            "calories",
            "protein_grams",
            "carbs_grams",
            "fat_grams",
            "fiber_grams",
            "sugar_grams",
            "sodium_mg",
            "total_grams",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        if not attrs.get("measurement_unit") and attrs.get("serving_description"):
            attrs["measurement_unit"] = attrs["serving_description"]
        return attrs

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("quantity must be greater than 0.")
        return value


class WeightEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = WeightEntry
        fields = [
            "id",
            "entry_date",
            "weight_kg",
            "note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
