from django.contrib import admin

from .models import CustomFood, MealEntry, NutritionProfile, SavedMeal, SavedMealItem, WeightEntry


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
