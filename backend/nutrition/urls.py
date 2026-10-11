from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CustomFoodViewSet,
    ExerciseEntryViewSet,
    FastingSessionViewSet,
    FoodSearchView,
    MealEntryViewSet,
    NutritionInsightsView,
    NutritionOverviewView,
    NutritionCoachApplyView,
    NutritionCoachView,
    NutritionProfileView,
    RecipeViewSet,
    SavedMealViewSet,
    WaterEntryViewSet,
    WeightEntryViewSet,
)

router = DefaultRouter()
router.register("custom-foods", CustomFoodViewSet, basename="nutrition-custom-foods")
router.register("entries", MealEntryViewSet, basename="nutrition-entries")
router.register("saved-meals", SavedMealViewSet, basename="nutrition-saved-meals")
router.register("weights", WeightEntryViewSet, basename="nutrition-weights")
router.register("water", WaterEntryViewSet, basename="nutrition-water")
router.register("recipes", RecipeViewSet, basename="nutrition-recipes")
router.register("exercise", ExerciseEntryViewSet, basename="nutrition-exercise")
router.register("fasting", FastingSessionViewSet, basename="nutrition-fasting")

urlpatterns = [
    path("", include(router.urls)),
    path("profile/", NutritionProfileView.as_view(), name="nutrition-profile"),
    path("foods/search/", FoodSearchView.as_view(), name="nutrition-food-search"),
    path("overview/", NutritionOverviewView.as_view(), name="nutrition-overview"),
    path("insights/", NutritionInsightsView.as_view(), name="nutrition-insights"),
    path("coach/", NutritionCoachView.as_view(), name="nutrition-coach"),
    path("coach/apply/", NutritionCoachApplyView.as_view(), name="nutrition-coach-apply"),
]
