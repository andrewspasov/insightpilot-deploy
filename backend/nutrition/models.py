from __future__ import annotations

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


def default_entry_date():
    return timezone.localdate()


CUSTOM_UNIT_CHOICES = [
    ("g", "g"),
    ("oz", "oz"),
    ("ml", "mL"),
    ("cup", "cup"),
    ("tbsp", "tbsp"),
    ("tsp", "tsp"),
    ("piece", "piece"),
    ("serving", "serving"),
]


class NutritionProfile(models.Model):
    GOAL_TRACK = "track"
    GOAL_MAINTAIN = "maintain"
    GOAL_LOSE = "lose"
    GOAL_GAIN = "gain"

    GOAL_CHOICES = [
        (GOAL_TRACK, "Track"),
        (GOAL_MAINTAIN, "Maintain"),
        (GOAL_LOSE, "Lose"),
        (GOAL_GAIN, "Gain"),
    ]

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nutrition_profile",
    )
    goal_type = models.CharField(
        max_length=20,
        choices=GOAL_CHOICES,
        default=GOAL_TRACK,
    )
    daily_calorie_target = models.PositiveIntegerField(default=2000)
    protein_target_grams = models.FloatField(default=150.0)
    carbs_target_grams = models.FloatField(default=250.0)
    fat_target_grams = models.FloatField(default=70.0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Nutrition profile"
        verbose_name_plural = "Nutrition profiles"

    def __str__(self) -> str:
        return f"Nutrition profile for {self.owner}"


class CustomFood(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nutrition_custom_foods",
    )
    name = models.CharField(max_length=200)
    brand_name = models.CharField(max_length=200, blank=True, default="")
    serving_description = models.CharField(max_length=120, blank=True, default="")
    base_amount = models.FloatField(default=1.0, validators=[MinValueValidator(0.01)])
    base_unit = models.CharField(
        max_length=20,
        choices=CUSTOM_UNIT_CHOICES,
        default="serving",
    )
    gram_weight = models.FloatField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0.01)],
        help_text="Optional gram weight for the base amount.",
    )
    calories = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    protein_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    carbs_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    fat_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    fiber_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    sugar_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    sodium_mg = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    image = models.ImageField(upload_to="nutrition_foods/", blank=True, null=True)
    external_image_url = models.URLField(blank=True, default="")
    is_favorite = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "name"]
        indexes = [
            models.Index(fields=["owner", "name"], name="nutrition_food_owner_name_idx"),
        ]

    def __str__(self) -> str:
        brand = f" ({self.brand_name})" if self.brand_name else ""
        return f"{self.name}{brand}"

    def save(self, *args, **kwargs):
        if not self.serving_description:
            amount = int(self.base_amount) if float(self.base_amount).is_integer() else self.base_amount
            self.serving_description = f"{amount} {self.base_unit}"
        super().save(*args, **kwargs)


class MealEntry(models.Model):
    MEAL_BREAKFAST = "breakfast"
    MEAL_LUNCH = "lunch"
    MEAL_DINNER = "dinner"
    MEAL_SNACKS = "snacks"

    MEAL_CHOICES = [
        (MEAL_BREAKFAST, "Breakfast"),
        (MEAL_LUNCH, "Lunch"),
        (MEAL_DINNER, "Dinner"),
        (MEAL_SNACKS, "Snacks"),
    ]

    SOURCE_USDA = "usda"
    SOURCE_CUSTOM = "custom"
    SOURCE_RECENT = "recent"
    SOURCE_DEMO = "demo"

    SOURCE_CHOICES = [
        (SOURCE_USDA, "USDA"),
        (SOURCE_CUSTOM, "Custom"),
        (SOURCE_RECENT, "Recent"),
        (SOURCE_DEMO, "Demo"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nutrition_meal_entries",
    )
    entry_date = models.DateField(default=default_entry_date)
    meal_type = models.CharField(max_length=20, choices=MEAL_CHOICES)
    food_source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_USDA)
    external_food_id = models.CharField(max_length=120, blank=True, default="")
    food_name = models.CharField(max_length=200)
    brand_name = models.CharField(max_length=200, blank=True, default="")
    serving_description = models.CharField(max_length=120, default="1 serving")
    measurement_unit = models.CharField(max_length=40, blank=True, default="serving")
    servings = models.FloatField(default=1.0, validators=[MinValueValidator(0.01)])
    grams_per_unit = models.FloatField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0.01)],
    )
    total_grams = models.FloatField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0.0)],
    )
    image_url = models.URLField(blank=True, default="")

    serving_calories = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    serving_protein_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    serving_carbs_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    serving_fat_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    serving_fiber_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    serving_sugar_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    serving_sodium_mg = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])

    calories = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    protein_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    carbs_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    fat_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    fiber_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    sugar_grams = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    sodium_mg = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["entry_date", "meal_type", "created_at"]
        indexes = [
            models.Index(fields=["owner", "entry_date"], name="nutrition_entry_owner_date_idx"),
            models.Index(fields=["owner", "meal_type"], name="nutrition_entry_owner_meal_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.owner} {self.entry_date} {self.meal_type}: {self.food_name}"

    def recalculate_totals(self):
        multiplier = float(self.servings or 0)
        self.calories = round(self.serving_calories * multiplier, 2)
        self.protein_grams = round(self.serving_protein_grams * multiplier, 2)
        self.carbs_grams = round(self.serving_carbs_grams * multiplier, 2)
        self.fat_grams = round(self.serving_fat_grams * multiplier, 2)
        self.fiber_grams = round(self.serving_fiber_grams * multiplier, 2)
        self.sugar_grams = round(self.serving_sugar_grams * multiplier, 2)
        self.sodium_mg = round(self.serving_sodium_mg * multiplier, 2)
        if self.grams_per_unit:
            self.total_grams = round(self.grams_per_unit * multiplier, 2)
        else:
            self.total_grams = None

    def save(self, *args, **kwargs):
        self.recalculate_totals()
        super().save(*args, **kwargs)


class WeightEntry(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nutrition_weight_entries",
    )
    entry_date = models.DateField(default=default_entry_date)
    weight_kg = models.FloatField(validators=[MinValueValidator(0.1)])
    note = models.CharField(max_length=240, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-entry_date", "-created_at"]
        indexes = [
            models.Index(fields=["owner", "entry_date"], name="nutr_weight_owner_date_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "entry_date"],
                name="nutr_weight_owner_date_uniq",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.owner} {self.entry_date}: {self.weight_kg} kg"
