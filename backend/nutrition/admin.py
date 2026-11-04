from django.contrib import admin

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


@admin.register(NutritionProfile)
class NutritionProfileAdmin(admin.ModelAdmin):
    list_display = (
        "owner",
        "goal_type",
        "daily_calorie_target",
        "protein_target_grams",
        "carbs_target_grams",
        "fat_target_grams",
        "updated_at",
    )
    search_fields = ("owner__username", "owner__email")


@admin.register(CustomFood)
class CustomFoodAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "brand_name",
        "owner",
        "base_amount",
        "base_unit",
        "gram_weight",
        "calories",
        "is_favorite",
        "updated_at",
    )
    list_filter = ("is_favorite",)
    search_fields = ("name", "brand_name", "owner__username", "owner__email")


@admin.register(MealEntry)
class MealEntryAdmin(admin.ModelAdmin):
    list_display = (
        "entry_date",
        "meal_type",
        "food_name",
        "owner",
        "servings",
        "measurement_unit",
        "calories",
        "food_source",
    )
    list_filter = ("meal_type", "food_source")
    search_fields = ("food_name", "brand_name", "owner__username", "owner__email")
    date_hierarchy = "entry_date"


class SavedMealItemInline(admin.TabularInline):
    model = SavedMealItem
    extra = 0
    readonly_fields = ("calories", "protein_grams", "carbs_grams", "fat_grams")


@admin.register(SavedMeal)
class SavedMealAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "meal_type", "updated_at")
    list_filter = ("meal_type",)
    search_fields = ("name", "owner__username", "owner__email", "items__food_name")
    inlines = [SavedMealItemInline]


@admin.register(WeightEntry)
class WeightEntryAdmin(admin.ModelAdmin):
    list_display = ("entry_date", "owner", "weight_kg", "updated_at")
    search_fields = ("owner__username", "owner__email", "note")
    date_hierarchy = "entry_date"


@admin.register(WaterEntry)
class WaterEntryAdmin(admin.ModelAdmin):
    list_display = ("entry_date", "owner", "total_ml", "target_ml", "updated_at")
    search_fields = ("owner__username", "owner__email")
    date_hierarchy = "entry_date"


@admin.register(ExerciseEntry)
class ExerciseEntryAdmin(admin.ModelAdmin):
    list_display = ("entry_date", "name", "owner", "duration_min", "calories_burned", "is_planned")
    list_filter = ("is_planned",)
    search_fields = ("name", "note", "owner__username", "owner__email")
    date_hierarchy = "entry_date"


@admin.register(FastingSession)
class FastingSessionAdmin(admin.ModelAdmin):
    list_display = ("started_at", "owner", "ended_at", "target_hours")
    search_fields = ("owner__username", "owner__email")
    date_hierarchy = "started_at"


class RecipeIngredientInline(admin.TabularInline):
    model = RecipeIngredient
    extra = 0
    fields = ("order", "food_name", "brand_name", "quantity", "measurement_unit", "total_grams", "calories")
    readonly_fields = ("calories",)


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "servings_count", "updated_at")
    search_fields = ("name", "owner__username", "owner__email", "ingredients__food_name")
    inlines = [RecipeIngredientInline]


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "equipment", "level")
    list_filter = ("category", "equipment", "level")
    search_fields = ("name", "slug")


class PlanWorkoutDayInline(admin.TabularInline):
    model = PlanWorkoutDay
    extra = 0


class PlanMealOptionInline(admin.TabularInline):
    model = PlanMealOption
    extra = 0
    readonly_fields = ("calories", "protein_grams", "carbs_grams", "fat_grams")


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = (
        "owner",
        "status",
        "goal_type",
        "pace",
        "start_weight_kg",
        "target_weight_kg",
        "daily_calorie_target",
        "start_date",
    )
    list_filter = ("status", "goal_type", "pace")
    search_fields = ("owner__username", "owner__email")
    inlines = [PlanWorkoutDayInline, PlanMealOptionInline]


@admin.register(PlanExercise)
class PlanExerciseAdmin(admin.ModelAdmin):
    list_display = ("name", "day", "kind", "sets", "rep_min", "rep_max")
    search_fields = ("name", "day__plan__owner__email")


class WorkoutSetInline(admin.TabularInline):
    model = WorkoutSet
    extra = 0


@admin.register(WorkoutSession)
class WorkoutSessionAdmin(admin.ModelAdmin):
    list_display = ("entry_date", "owner", "title", "duration_min", "completed_at")
    search_fields = ("title", "owner__username", "owner__email")
    date_hierarchy = "entry_date"
    inlines = [WorkoutSetInline]
