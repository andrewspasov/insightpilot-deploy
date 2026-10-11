from __future__ import annotations

from rest_framework import serializers

from .models import CustomFood, ExerciseEntry, FastingSession, MealEntry, NutritionProfile, Recipe, RecipeIngredient, SavedMeal, SavedMealItem, WaterEntry, WeightEntry


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
            "fiber_target_grams",
            "sugar_limit_grams",
            "sodium_limit_mg",
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
    available_units = serializers.SerializerMethodField()
    default_unit_key = serializers.SerializerMethodField()

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
            "available_units",
            "default_unit_key",
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
            "available_units",
            "default_unit_key",
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

    def get_available_units(self, obj):
        from .services import build_meal_entry_unit_options

        return build_meal_entry_unit_options(obj)

    def get_default_unit_key(self, obj):
        return obj.measurement_unit or "serving"


class SavedMealItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedMealItem
        fields = [
            "id",
            "order",
            "food_source",
            "external_food_id",
            "food_name",
            "brand_name",
            "serving_description",
            "measurement_unit",
            "quantity",
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
        ]
        read_only_fields = fields


class SavedMealSerializer(serializers.ModelSerializer):
    items = SavedMealItemSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()

    class Meta:
        model = SavedMeal
        fields = [
            "id",
            "name",
            "meal_type",
            "item_count",
            "totals",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "item_count", "totals", "items", "created_at", "updated_at"]

    def get_item_count(self, obj):
        return obj.items.count()

    def get_totals(self, obj):
        totals = {
            "calories": 0.0,
            "protein_grams": 0.0,
            "carbs_grams": 0.0,
            "fat_grams": 0.0,
            "fiber_grams": 0.0,
            "sugar_grams": 0.0,
            "sodium_mg": 0.0,
        }
        for item in obj.items.all():
            totals["calories"] += item.calories
            totals["protein_grams"] += item.protein_grams
            totals["carbs_grams"] += item.carbs_grams
            totals["fat_grams"] += item.fat_grams
            totals["fiber_grams"] += item.fiber_grams
            totals["sugar_grams"] += item.sugar_grams
            totals["sodium_mg"] += item.sodium_mg
        return {key: round(value, 2) for key, value in totals.items()}


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


class WaterEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = WaterEntry
        fields = [
            "id",
            "entry_date",
            "total_ml",
            "target_ml",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


INGREDIENT_WRITABLE_FIELDS = [
    "food_source",
    "external_food_id",
    "food_name",
    "brand_name",
    "serving_description",
    "measurement_unit",
    "quantity",
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


class RecipeIngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecipeIngredient
        fields = [
            "id",
            "order",
            *INGREDIENT_WRITABLE_FIELDS,
            "total_grams",
            "calories",
            "protein_grams",
            "carbs_grams",
            "fat_grams",
            "fiber_grams",
            "sugar_grams",
            "sodium_mg",
        ]
        read_only_fields = [
            "id",
            "total_grams",
            "calories",
            "protein_grams",
            "carbs_grams",
            "fat_grams",
            "fiber_grams",
            "sugar_grams",
            "sodium_mg",
        ]


class RecipeSerializer(serializers.ModelSerializer):
    ingredients = RecipeIngredientSerializer(many=True, required=False)
    totals = serializers.SerializerMethodField()
    per_serving = serializers.SerializerMethodField()
    ingredient_count = serializers.SerializerMethodField()

    class Meta:
        model = Recipe
        fields = [
            "id",
            "name",
            "servings_count",
            "note",
            "ingredient_count",
            "totals",
            "per_serving",
            "ingredients",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "ingredient_count",
            "totals",
            "per_serving",
            "created_at",
            "updated_at",
        ]

    def get_ingredient_count(self, obj):
        return obj.ingredients.count()

    def _totals_dict(self, obj):
        totals = {
            "calories": 0.0,
            "protein_grams": 0.0,
            "carbs_grams": 0.0,
            "fat_grams": 0.0,
            "fiber_grams": 0.0,
            "sugar_grams": 0.0,
            "sodium_mg": 0.0,
        }
        for item in obj.ingredients.all():
            totals["calories"] += item.calories
            totals["protein_grams"] += item.protein_grams
            totals["carbs_grams"] += item.carbs_grams
            totals["fat_grams"] += item.fat_grams
            totals["fiber_grams"] += item.fiber_grams
            totals["sugar_grams"] += item.sugar_grams
            totals["sodium_mg"] += item.sodium_mg
        return {key: round(value, 2) for key, value in totals.items()}

    def get_totals(self, obj):
        return self._totals_dict(obj)

    def get_per_serving(self, obj):
        totals = self._totals_dict(obj)
        divisor = float(obj.servings_count or 1) or 1.0
        return {key: round(value / divisor, 2) for key, value in totals.items()}

    def create(self, validated_data):
        ingredients_data = validated_data.pop("ingredients", [])
        recipe = Recipe.objects.create(**validated_data)
        self._write_ingredients(recipe, ingredients_data)
        return recipe

    def update(self, instance, validated_data):
        ingredients_data = validated_data.pop("ingredients", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if ingredients_data is not None:
            instance.ingredients.all().delete()
            self._write_ingredients(instance, ingredients_data)
        return instance

    @staticmethod
    def _write_ingredients(recipe, ingredients_data):
        for index, item in enumerate(ingredients_data):
            item.pop("order", None)
            item.pop("id", None)
            RecipeIngredient.objects.create(recipe=recipe, order=index, **item)


class ExerciseEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciseEntry
        fields = [
            "id",
            "entry_date",
            "name",
            "duration_min",
            "calories_burned",
            "note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FastingSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FastingSession
        fields = [
            "id",
            "started_at",
            "ended_at",
            "target_hours",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
