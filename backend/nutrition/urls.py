from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CustomFoodViewSet,
    FoodSearchView,
    MealEntryViewSet,
    NutritionInsightsView,
    NutritionOverviewView,
    NutritionProfileView,
    WeightEntryViewSet,
)

router = DefaultRouter()
router.register("custom-foods", CustomFoodViewSet, basename="nutrition-custom-foods")
router.register("entries", MealEntryViewSet, basename="nutrition-entries")
router.register("weights", WeightEntryViewSet, basename="nutrition-weights")

urlpatterns = [
    path("", include(router.urls)),
    path("profile/", NutritionProfileView.as_view(), name="nutrition-profile"),
    path("foods/search/", FoodSearchView.as_view(), name="nutrition-food-search"),
    path("overview/", NutritionOverviewView.as_view(), name="nutrition-overview"),
    path("insights/", NutritionInsightsView.as_view(), name="nutrition-insights"),
]
