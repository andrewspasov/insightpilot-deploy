from __future__ import annotations

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
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

    SEX_MALE = "male"
    SEX_FEMALE = "female"
    SEX_CHOICES = [
        (SEX_MALE, "Male"),
        (SEX_FEMALE, "Female"),
    ]

    JOB_DESK = "desk"
    JOB_STANDING = "standing"
    JOB_PHYSICAL = "physical"
    JOB_ACTIVITY_CHOICES = [
        (JOB_DESK, "Desk job / mostly sitting"),
        (JOB_STANDING, "On your feet most of the day"),
        (JOB_PHYSICAL, "Physical labour"),
    ]

    UNITS_METRIC = "metric"
    UNITS_US = "us"
    UNITS_CHOICES = [
        (UNITS_METRIC, "Metric"),
        (UNITS_US, "US"),
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
    fiber_target_grams = models.FloatField(default=30.0)
    sugar_limit_grams = models.FloatField(default=50.0)
    sodium_limit_mg = models.FloatField(default=2300.0)

    # Body stats used by the plan calculator. All stored in metric.
    sex = models.CharField(max_length=10, choices=SEX_CHOICES, blank=True, default="")
    birth_year = models.PositiveIntegerField(null=True, blank=True)
    height_cm = models.FloatField(null=True, blank=True, validators=[MinValueValidator(50.0)])
    job_activity = models.CharField(
        max_length=20,
        choices=JOB_ACTIVITY_CHOICES,
        blank=True,
        default="",
    )
    food_preferences = models.TextField(
        blank=True,
        default="",
        help_text="Free-text notes on foods the user avoids, dislikes or is allergic to.",
    )
    liked_foods = models.JSONField(default=list, blank=True, help_text="Food categories to favour in meals.")
    avoided_foods = models.JSONField(default=list, blank=True, help_text="Diet/allergen tags to exclude.")
    EQUIPMENT_GYM = "gym"
    EQUIPMENT_HOME = "home"
    EQUIPMENT_CHOICES = [(EQUIPMENT_GYM, "Full gym"), (EQUIPMENT_HOME, "Home / bodyweight")]
    equipment = models.CharField(max_length=10, choices=EQUIPMENT_CHOICES, default=EQUIPMENT_GYM)
    home_gear = models.JSONField(
        default=list, blank=True, help_text="Home gear the user has: bands, pull_up_bar."
    )
    include_abs = models.BooleanField(default=True, help_text="Add an ab exercise to suggested workouts.")
    units = models.CharField(max_length=10, choices=UNITS_CHOICES, default=UNITS_METRIC)

    # The AI coach nudges after a couple of days without logging and emails a
    # report of the day in the evening.
    logging_reminders = models.BooleanField(default=True)
    daily_report_email = models.BooleanField(default=True)
    daily_report_hour = models.PositiveSmallIntegerField(
        default=20, validators=[MaxValueValidator(23)], help_text="Local hour (0-23) the daily report is sent."
    )
    daily_report_last_sent = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def age(self) -> int | None:
        if not self.birth_year:
            return None
        return timezone.localdate().year - self.birth_year

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
    barcode = models.CharField(
        max_length=32, blank=True, default="", db_index=True, help_text="EAN/UPC, so a scanned product is found again."
    )
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


class SavedMeal(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nutrition_saved_meals",
    )
    name = models.CharField(max_length=200)
    meal_type = models.CharField(
        max_length=20,
        choices=MealEntry.MEAL_CHOICES,
        blank=True,
        default="",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "name"]
        indexes = [
            models.Index(fields=["owner", "name"], name="nutrition_saved_meal_name_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.owner}: {self.name}"


class SavedMealItem(models.Model):
    saved_meal = models.ForeignKey(
        SavedMeal,
        on_delete=models.CASCADE,
        related_name="items",
    )
    order = models.PositiveIntegerField(default=0)

    food_source = models.CharField(max_length=20, choices=MealEntry.SOURCE_CHOICES, default=MealEntry.SOURCE_USDA)
    external_food_id = models.CharField(max_length=120, blank=True, default="")
    food_name = models.CharField(max_length=200)
    brand_name = models.CharField(max_length=200, blank=True, default="")
    serving_description = models.CharField(max_length=120, default="1 serving")
    measurement_unit = models.CharField(max_length=40, blank=True, default="serving")
    quantity = models.FloatField(default=1.0, validators=[MinValueValidator(0.01)])
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

    class Meta:
        ordering = ["order", "id"]
        indexes = [
            models.Index(fields=["saved_meal", "order"], name="nutrition_saved_item_order_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.saved_meal.name}: {self.food_name}"

    def recalculate_totals(self):
        multiplier = float(self.quantity or 0)
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


class WaterEntry(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nutrition_water_entries",
    )
    entry_date = models.DateField(default=default_entry_date)
    total_ml = models.PositiveIntegerField(default=0)
    target_ml = models.PositiveIntegerField(default=2000)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-entry_date"]
        verbose_name_plural = "Water entries"
        indexes = [
            models.Index(fields=["owner", "entry_date"], name="nutr_water_owner_date_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "entry_date"],
                name="nutr_water_owner_date_uniq",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.owner} {self.entry_date}: {self.total_ml} ml"


class Recipe(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nutrition_recipes",
    )
    name = models.CharField(max_length=200)
    servings_count = models.FloatField(default=1.0, validators=[MinValueValidator(0.1)])
    note = models.CharField(max_length=500, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "name"]
        indexes = [
            models.Index(fields=["owner", "name"], name="nutrition_recipe_name_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.owner}: {self.name}"


class RecipeIngredient(models.Model):
    recipe = models.ForeignKey(
        Recipe,
        on_delete=models.CASCADE,
        related_name="ingredients",
    )
    order = models.PositiveIntegerField(default=0)

    food_source = models.CharField(max_length=20, choices=MealEntry.SOURCE_CHOICES, default=MealEntry.SOURCE_USDA)
    external_food_id = models.CharField(max_length=120, blank=True, default="")
    food_name = models.CharField(max_length=200)
    brand_name = models.CharField(max_length=200, blank=True, default="")
    serving_description = models.CharField(max_length=120, default="1 serving")
    measurement_unit = models.CharField(max_length=40, blank=True, default="serving")
    quantity = models.FloatField(default=1.0, validators=[MinValueValidator(0.01)])
    grams_per_unit = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0.01)])
    total_grams = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0.0)])
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

    class Meta:
        ordering = ["order", "id"]
        indexes = [
            models.Index(fields=["recipe", "order"], name="nutrition_recipe_ing_order_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.recipe.name}: {self.food_name}"

    def recalculate_totals(self):
        multiplier = float(self.quantity or 0)
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


class ExerciseEntry(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nutrition_exercise_entries",
    )
    entry_date = models.DateField(default=default_entry_date)
    name = models.CharField(max_length=200)
    duration_min = models.PositiveIntegerField(default=30)
    calories_burned = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    note = models.CharField(max_length=240, blank=True, default="")
    # Planned sessions are already counted in the plan's calorie target, so
    # they never extend the daily food budget.
    is_planned = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-entry_date", "-created_at"]
        verbose_name_plural = "Exercise entries"
        indexes = [
            models.Index(fields=["owner", "entry_date"], name="nutr_exercise_owner_date_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.owner} {self.entry_date}: {self.name} ({self.calories_burned} kcal)"



class FastingSession(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nutrition_fasting_sessions",
    )
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    target_hours = models.FloatField(default=16.0, validators=[MinValueValidator(1.0)])

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["owner", "started_at"], name="nutr_fast_owner_start_idx"),
        ]

    def __str__(self) -> str:
        state = "active" if self.ended_at is None else "done"
        return f"{self.owner} fast {self.started_at:%Y-%m-%d %H:%M} ({state})"


# free-exercise-db (public domain), pinned so image paths never shift under us.
EXERCISE_DB_COMMIT = "f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5"
EXERCISE_IMAGE_BASE_URL = (
    f"https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@{EXERCISE_DB_COMMIT}/exercises/"
)


class Exercise(models.Model):
    """Shared exercise library imported from free-exercise-db."""

    slug = models.CharField(max_length=120, unique=True)
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=40, blank=True, default="")
    equipment = models.CharField(max_length=40, blank=True, default="")
    level = models.CharField(max_length=20, blank=True, default="")
    force = models.CharField(max_length=20, blank=True, default="")
    mechanic = models.CharField(max_length=20, blank=True, default="")
    primary_muscles = models.JSONField(default=list, blank=True)
    secondary_muscles = models.JSONField(default=list, blank=True)
    instructions = models.JSONField(default=list, blank=True)
    images = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"], name="nutr_exercise_lib_name_idx"),
        ]

    def __str__(self) -> str:
        return self.name

    @property
    def image_urls(self) -> list[str]:
        return [f"{EXERCISE_IMAGE_BASE_URL}{path}" for path in self.images]


class Plan(models.Model):
    STATUS_ACTIVE = "active"
    STATUS_ARCHIVED = "archived"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_ARCHIVED, "Archived"),
    ]

    GOAL_CHOICES = [
        (NutritionProfile.GOAL_GAIN, "Bulk"),
        (NutritionProfile.GOAL_LOSE, "Cut"),
        (NutritionProfile.GOAL_MAINTAIN, "Maintain"),
    ]

    PACE_LOW = "low"
    PACE_MIDDLE = "middle"
    PACE_EXTREME = "extreme"
    PACE_CHOICES = [
        (PACE_LOW, "Low"),
        (PACE_MIDDLE, "Middle"),
        (PACE_EXTREME, "Extreme"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nutrition_plans",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    goal_type = models.CharField(max_length=20, choices=GOAL_CHOICES)
    pace = models.CharField(max_length=20, choices=PACE_CHOICES, default=PACE_MIDDLE)
    start_date = models.DateField(default=default_entry_date)
    start_weight_kg = models.FloatField(validators=[MinValueValidator(20.0)])
    target_weight_kg = models.FloatField(validators=[MinValueValidator(20.0)])

    # Snapshot of the inputs the numbers were calculated from.
    sex = models.CharField(max_length=10, choices=NutritionProfile.SEX_CHOICES)
    age = models.PositiveIntegerField()
    height_cm = models.FloatField(validators=[MinValueValidator(50.0)])
    job_activity = models.CharField(max_length=20, choices=NutritionProfile.JOB_ACTIVITY_CHOICES)
    weekly_training = models.JSONField(
        default=list,
        blank=True,
        help_text="Sessions used for the calculation: [{weekday, activity, duration_min}].",
    )
    equipment = models.CharField(max_length=200, blank=True, default="")
    explanation = models.TextField(blank=True, default="")

    # Calculated targets for the chosen pace.
    bmr = models.PositiveIntegerField(default=0)
    maintenance_calories = models.PositiveIntegerField(default=0)
    daily_calorie_target = models.PositiveIntegerField(default=0)
    protein_target_grams = models.FloatField(default=0.0)
    carbs_target_grams = models.FloatField(default=0.0)
    fat_target_grams = models.FloatField(default=0.0)
    weekly_change_kg = models.FloatField(default=0.0)
    estimated_weeks = models.FloatField(null=True, blank=True)
    projected_end_date = models.DateField(null=True, blank=True)
    pace_options = models.JSONField(default=list, blank=True)

    goal_reached_at = models.DateField(null=True, blank=True)
    # The day the example meals were picked; a new day brings a fresh set.
    meals_date = models.DateField(null=True, blank=True)
    last_check_in_at = models.DateField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "status"], name="nutr_plan_owner_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["owner"],
                condition=models.Q(status="active"),
                name="nutr_plan_one_active_per_owner",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.owner} {self.get_goal_type_display()} {self.start_weight_kg}->{self.target_weight_kg} kg ({self.status})"


class FoodImage(models.Model):
    """A cached food photo per normalised food or meal name (url empty = nothing found)."""

    query = models.CharField(max_length=200, unique=True)
    image_url = models.URLField(max_length=500, blank=True, default="")
    thumb_url = models.URLField(max_length=500, blank=True, default="")
    photographer = models.CharField(max_length=200, blank=True, default="")
    source_url = models.URLField(max_length=500, blank=True, default="")
    # The photographer's profile page, linked in the photo credit.
    photographer_url = models.URLField(max_length=500, blank=True, default="")
    # Unsplash asks apps to call this once when a photo is chosen for use.
    download_location = models.URLField(max_length=500, blank=True, default="")
    fetched_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.query}: {self.thumb_url or '(none)'}"


class PlanMealOption(models.Model):
    """One example meal (e.g. breakfast option 2) suggested for a plan."""

    plan = models.ForeignKey(Plan, on_delete=models.CASCADE, related_name="meal_options")
    meal_type = models.CharField(max_length=20, choices=MealEntry.MEAL_CHOICES)
    order = models.PositiveIntegerField(default=0)
    name = models.CharField(max_length=200)
    description = models.CharField(max_length=500, blank=True, default="")
    # [{food_name, quantity, unit, calories, protein_grams, carbs_grams, fat_grams, ...}]
    items = models.JSONField(default=list, blank=True)
    calories = models.FloatField(default=0.0)
    protein_grams = models.FloatField(default=0.0)
    carbs_grams = models.FloatField(default=0.0)
    fat_grams = models.FloatField(default=0.0)

    class Meta:
        ordering = ["plan", "meal_type", "order", "id"]

    def __str__(self) -> str:
        return f"{self.plan_id} {self.meal_type}: {self.name}"


class PlanWorkoutDay(models.Model):
    MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY = range(7)
    WEEKDAY_CHOICES = [
        (MONDAY, "Monday"),
        (TUESDAY, "Tuesday"),
        (WEDNESDAY, "Wednesday"),
        (THURSDAY, "Thursday"),
        (FRIDAY, "Friday"),
        (SATURDAY, "Saturday"),
        (SUNDAY, "Sunday"),
    ]

    plan = models.ForeignKey(Plan, on_delete=models.CASCADE, related_name="workout_days")
    weekday = models.PositiveSmallIntegerField(choices=WEEKDAY_CHOICES)
    title = models.CharField(max_length=200)
    notes = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        ordering = ["plan", "weekday"]
        constraints = [
            models.UniqueConstraint(fields=["plan", "weekday"], name="nutr_plan_day_unique_weekday"),
        ]

    def __str__(self) -> str:
        return f"{self.plan_id} {self.get_weekday_display()}: {self.title}"


class PlanExercise(models.Model):
    KIND_STRENGTH = "strength"
    KIND_CARDIO = "cardio"
    KIND_CHOICES = [
        (KIND_STRENGTH, "Strength"),
        (KIND_CARDIO, "Cardio"),
    ]

    day = models.ForeignKey(PlanWorkoutDay, on_delete=models.CASCADE, related_name="exercises")
    order = models.PositiveIntegerField(default=0)
    exercise = models.ForeignKey(
        Exercise,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="plan_exercises",
    )
    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_STRENGTH)
    sets = models.PositiveSmallIntegerField(default=3)
    rep_min = models.PositiveSmallIntegerField(default=8)
    rep_max = models.PositiveSmallIntegerField(default=12)
    duration_min = models.PositiveIntegerField(null=True, blank=True)
    rest_seconds = models.PositiveIntegerField(default=90)
    notes = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        ordering = ["day", "order", "id"]

    def __str__(self) -> str:
        return f"{self.day} - {self.name}"


class WorkoutSession(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nutrition_workouts",
    )
    plan = models.ForeignKey(Plan, on_delete=models.SET_NULL, null=True, blank=True, related_name="workouts")
    plan_day = models.ForeignKey(
        PlanWorkoutDay,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workouts",
    )
    entry_date = models.DateField(default=default_entry_date)
    title = models.CharField(max_length=200)
    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_min = models.PositiveIntegerField(null=True, blank=True)
    notes = models.CharField(max_length=500, blank=True, default="")
    exercise_entry = models.OneToOneField(
        ExerciseEntry,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workout",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-entry_date", "-started_at"]
        indexes = [
            models.Index(fields=["owner", "entry_date"], name="nutr_workout_owner_date_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.owner} {self.entry_date}: {self.title}"


class WorkoutSet(models.Model):
    session = models.ForeignKey(WorkoutSession, on_delete=models.CASCADE, related_name="sets")
    plan_exercise = models.ForeignKey(
        PlanExercise,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logged_sets",
    )
    exercise = models.ForeignKey(
        Exercise,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logged_sets",
    )
    exercise_name = models.CharField(max_length=200)
    exercise_order = models.PositiveIntegerField(default=0)
    set_number = models.PositiveSmallIntegerField(default=1)
    reps = models.PositiveSmallIntegerField(null=True, blank=True)
    weight_kg = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0.0)])
    duration_min = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0.0)])
    distance_km = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0.0)])
    completed = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["session", "exercise_order", "set_number", "id"]

    def __str__(self) -> str:
        return f"{self.exercise_name} set {self.set_number}: {self.reps} x {self.weight_kg} kg"
