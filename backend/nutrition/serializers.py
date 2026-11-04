from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from . import food_images
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
    RecipeIngredient,
    SavedMeal,
    SavedMealItem,
    WaterEntry,
    WeightEntry,
    WorkoutSession,
    WorkoutSet,
)


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
    age = serializers.IntegerField(required=False, allow_null=True, min_value=14, max_value=100)

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
            "sex",
            "age",
            "birth_year",
            "height_cm",
            "job_activity",
            "food_preferences",
            "liked_foods",
            "avoided_foods",
            "equipment",
            "home_gear",
            "include_abs",
            "units",
            "logging_reminders",
            "daily_report_email",
            "daily_report_hour",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["birth_year", "created_at", "updated_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["age"] = instance.age
        return data

    def validate_liked_foods(self, value):
        from .meal_library import LIKE_OPTIONS

        allowed = {key for key, _ in LIKE_OPTIONS}
        if not isinstance(value, list) or any(k not in allowed for k in value):
            raise serializers.ValidationError("Unknown food category.")
        return value

    def validate_avoided_foods(self, value):
        from .meal_library import AVOID_OPTIONS

        allowed = {key for key, _ in AVOID_OPTIONS}
        if not isinstance(value, list) or any(k not in allowed for k in value):
            raise serializers.ValidationError("Unknown diet or allergy.")
        return value

    def validate_home_gear(self, value):
        from .program_templates import ALL_HOME_GEAR

        if not isinstance(value, list) or any(k not in ALL_HOME_GEAR for k in value):
            raise serializers.ValidationError("Unknown home gear.")
        return value

    def update(self, instance, validated_data):
        # Age is stored as a birth year so it stays correct over time.
        if "age" in validated_data:
            age = validated_data.pop("age")
            instance.birth_year = timezone.localdate().year - age if age else None
        return super().update(instance, validated_data)


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
            "barcode",
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

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Scanned products bring their own photo; other foods use a stock photo.
        if not data.get("image_url"):
            image = _food_image(self, instance.food_name)
            data["image_url"] = image.thumb_url if image else ""
        return data

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
            "is_planned",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_planned", "created_at", "updated_at"]


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


class ExerciseSerializer(serializers.ModelSerializer):
    image_urls = serializers.ListField(child=serializers.CharField(), read_only=True)

    class Meta:
        model = Exercise
        fields = [
            "id",
            "slug",
            "name",
            "category",
            "equipment",
            "level",
            "force",
            "mechanic",
            "primary_muscles",
            "secondary_muscles",
            "instructions",
            "image_urls",
        ]
        read_only_fields = fields


class ExerciseSummarySerializer(serializers.ModelSerializer):
    image_urls = serializers.ListField(child=serializers.CharField(), read_only=True)

    class Meta:
        model = Exercise
        fields = ["id", "slug", "name", "category", "equipment", "primary_muscles", "image_urls"]
        read_only_fields = fields


class PlanExerciseSerializer(serializers.ModelSerializer):
    exercise = ExerciseSummarySerializer(read_only=True)
    exercise_id = serializers.PrimaryKeyRelatedField(
        queryset=Exercise.objects.all(),
        source="exercise",
        write_only=True,
        required=False,
        allow_null=True,
    )
    day = serializers.PrimaryKeyRelatedField(queryset=PlanWorkoutDay.objects.all())

    class Meta:
        model = PlanExercise
        fields = [
            "id",
            "day",
            "order",
            "exercise",
            "exercise_id",
            "name",
            "kind",
            "sets",
            "rep_min",
            "rep_max",
            "duration_min",
            "rest_seconds",
            "notes",
        ]
        read_only_fields = ["id"]
        extra_kwargs = {"name": {"required": False}, "order": {"required": False}}

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            fields["day"].queryset = PlanWorkoutDay.objects.filter(plan__owner=request.user)
        return fields

    def validate(self, attrs):
        exercise = attrs.get("exercise")
        # Swapping the library exercise renames the slot unless a name was given.
        if exercise is not None and "name" not in attrs:
            attrs["name"] = exercise.name
        if self.instance is None and not attrs.get("name"):
            raise serializers.ValidationError("Choose a library exercise or give the exercise a name.")
        rep_min = attrs.get("rep_min", getattr(self.instance, "rep_min", 8))
        rep_max = attrs.get("rep_max", getattr(self.instance, "rep_max", 12))
        if rep_max < rep_min:
            raise serializers.ValidationError("rep_max must be at least rep_min.")
        return attrs

    def create(self, validated_data):
        if "order" not in validated_data:
            validated_data["order"] = validated_data["day"].exercises.count()
        return super().create(validated_data)


class PlanWorkoutDaySerializer(serializers.ModelSerializer):
    exercises = PlanExerciseSerializer(many=True, read_only=True)
    plan = serializers.PrimaryKeyRelatedField(queryset=Plan.objects.all())

    class Meta:
        model = PlanWorkoutDay
        fields = ["id", "plan", "weekday", "title", "notes", "exercises"]
        read_only_fields = ["id", "exercises"]

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            fields["plan"].queryset = Plan.objects.filter(owner=request.user)
        return fields

    def validate(self, attrs):
        plan = attrs.get("plan", getattr(self.instance, "plan", None))
        weekday = attrs.get("weekday", getattr(self.instance, "weekday", None))
        clash = PlanWorkoutDay.objects.filter(plan=plan, weekday=weekday)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("This plan already has a workout on that weekday.")
        return attrs


def _food_image(serializer, name: str):
    """The cached photo for a name: from the view's prefetched map, else the cache only."""
    images = serializer.context.get("food_images")
    if images is None:
        images = food_images.images_for([name], fetch=False)
    return images.get(name)


class PlanMealOptionSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    image_credit = serializers.SerializerMethodField()

    def get_image_url(self, obj):
        image = _food_image(self, obj.name)
        return image.image_url if image else None

    def get_image_credit(self, obj):
        image = _food_image(self, obj.name)
        return food_images.credit(image) if image else None

    class Meta:
        model = PlanMealOption
        fields = [
            "id",
            "meal_type",
            "order",
            "name",
            "description",
            "items",
            "calories",
            "protein_grams",
            "carbs_grams",
            "fat_grams",
            "image_url",
            "image_credit",
        ]
        read_only_fields = fields


class PlanSerializer(serializers.ModelSerializer):
    workout_days = PlanWorkoutDaySerializer(many=True, read_only=True)
    meal_options = PlanMealOptionSerializer(many=True, read_only=True)
    progress = serializers.SerializerMethodField()
    goal_reached = serializers.SerializerMethodField()
    check_in = serializers.SerializerMethodField()

    class Meta:
        model = Plan
        fields = [
            "id",
            "status",
            "goal_type",
            "pace",
            "start_date",
            "start_weight_kg",
            "target_weight_kg",
            "sex",
            "age",
            "height_cm",
            "job_activity",
            "weekly_training",
            "equipment",
            "explanation",
            "bmr",
            "maintenance_calories",
            "daily_calorie_target",
            "protein_target_grams",
            "carbs_target_grams",
            "fat_target_grams",
            "weekly_change_kg",
            "estimated_weeks",
            "projected_end_date",
            "pace_options",
            "goal_reached_at",
            "archived_at",
            "workout_days",
            "meal_options",
            "progress",
            "goal_reached",
            "check_in",
            "last_check_in_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_progress(self, obj):
        from .plans import plan_insights

        return plan_insights(obj)["progress"]

    def get_goal_reached(self, obj):
        from .plans import plan_insights

        return plan_insights(obj)["goal_reached"]

    def get_check_in(self, obj):
        from .plans import plan_insights

        return plan_insights(obj)["check_in"]


class PlanSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = [
            "id",
            "status",
            "goal_type",
            "pace",
            "start_date",
            "start_weight_kg",
            "target_weight_kg",
            "daily_calorie_target",
            "projected_end_date",
            "goal_reached_at",
            "archived_at",
            "created_at",
        ]
        read_only_fields = fields


class WorkoutSetSerializer(serializers.ModelSerializer):
    plan_exercise = serializers.PrimaryKeyRelatedField(
        queryset=PlanExercise.objects.all(), required=False, allow_null=True
    )
    exercise = serializers.PrimaryKeyRelatedField(
        queryset=Exercise.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = WorkoutSet
        fields = [
            "id",
            "plan_exercise",
            "exercise",
            "exercise_name",
            "exercise_order",
            "set_number",
            "reps",
            "weight_kg",
            "duration_min",
            "distance_km",
            "completed",
        ]
        read_only_fields = ["id"]
        extra_kwargs = {"exercise_name": {"required": False}}

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            fields["plan_exercise"].queryset = PlanExercise.objects.filter(day__plan__owner=request.user)
        return fields

    def validate(self, attrs):
        if not attrs.get("exercise_name"):
            source = attrs.get("plan_exercise") or attrs.get("exercise")
            if source is None:
                raise serializers.ValidationError("Each set needs an exercise or exercise_name.")
            attrs["exercise_name"] = source.name
        if attrs.get("plan_exercise") is not None and attrs.get("exercise") is None:
            attrs["exercise"] = attrs["plan_exercise"].exercise
        return attrs


class WorkoutSessionSerializer(serializers.ModelSerializer):
    sets = WorkoutSetSerializer(many=True, required=False)
    plan_day = serializers.PrimaryKeyRelatedField(
        queryset=PlanWorkoutDay.objects.all(), required=False, allow_null=True
    )
    calories_burned = serializers.SerializerMethodField()

    class Meta:
        model = WorkoutSession
        fields = [
            "id",
            "plan",
            "plan_day",
            "entry_date",
            "title",
            "started_at",
            "completed_at",
            "duration_min",
            "notes",
            "calories_burned",
            "sets",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "plan", "completed_at", "calories_burned", "created_at", "updated_at"]
        extra_kwargs = {"title": {"required": False}}

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            fields["plan_day"].queryset = PlanWorkoutDay.objects.filter(plan__owner=request.user)
        return fields

    def get_calories_burned(self, obj):
        return obj.exercise_entry.calories_burned if obj.exercise_entry_id else None

    def validate(self, attrs):
        plan_day = attrs.get("plan_day")
        if plan_day is not None:
            attrs["plan"] = plan_day.plan
            attrs.setdefault("title", plan_day.title)
        if self.instance is None and not attrs.get("title"):
            attrs["title"] = "Workout"
        return attrs

    def create(self, validated_data):
        sets = validated_data.pop("sets", [])
        session = WorkoutSession.objects.create(**validated_data)
        self._write_sets(session, sets)
        return session

    def update(self, instance, validated_data):
        sets = validated_data.pop("sets", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if sets is not None:
            instance.sets.all().delete()
            self._write_sets(instance, sets)
        return instance

    @staticmethod
    def _write_sets(session, sets):
        for item in sets:
            item.pop("id", None)
            WorkoutSet.objects.create(session=session, **item)
