from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from nutrition import food_images
from nutrition.models import FoodImage, MealEntry, Plan
from nutrition import test_plans

PHOTO = {
    "image_url": "https://images.pexels.com/photos/1/medium.jpeg",
    "thumb_url": "https://images.pexels.com/photos/1/tiny.jpeg",
    "photographer": "Jane Doe",
    "source_url": "https://www.pexels.com/photo/1/",
}


class PlanTestBase(APITestCase):
    # Reuse the plan tests' user and plan payload without inheriting their tests.
    setUp = test_plans.PlanApiTests.setUp
    _plan_payload = test_plans.PlanApiTests._plan_payload
    _create_plan = test_plans.PlanApiTests._create_plan


class NormalizeTests(SimpleTestCase):
    def test_preparation_words_and_brackets_are_dropped(self):
        self.assertEqual(food_images.normalize("Black beans (cooked)"), "black beans")
        self.assertEqual(food_images.normalize("Milk (2%)"), "milk")
        self.assertEqual(food_images.normalize("Tuna in water (drained)"), "tuna")


@override_settings(PEXELS_API_KEY="test-pexels-key", UNSPLASH_ACCESS_KEY="")
class FoodImageApiTests(PlanTestBase):
    @patch("nutrition.food_images._search", return_value=PHOTO)
    def test_diary_entries_get_a_cached_photo(self, mock_search):
        MealEntry.objects.create(owner=self.user, entry_date=self.today, meal_type="dinner", food_name="Black beans (cooked)")
        MealEntry.objects.create(
            owner=self.user, entry_date=self.today, meal_type="dinner", food_name="Scanned bar",
            image_url="https://images.openfoodfacts.org/bar.jpg",
        )

        for _ in range(2):
            response = self.client.get(f"/api/nutrition/overview/?date={self.today}")
            entries = {e["food_name"]: e for e in response.data["meal_sections"][2]["entries"]}
            self.assertEqual(entries["Black beans (cooked)"]["image_url"], PHOTO["thumb_url"])
            # A scanned product keeps its own photo.
            self.assertEqual(entries["Scanned bar"]["image_url"], "https://images.openfoodfacts.org/bar.jpg")
        # Looked up once, then served from the cache.
        mock_search.assert_called_once_with("black beans")

    @patch("nutrition.food_images._search", return_value={})
    def test_misses_are_cached_and_failures_are_not(self, mock_search):
        food_images.images_for(["Mystery stew"])
        food_images.images_for(["Mystery stew"])
        self.assertEqual(mock_search.call_count, 1)
        self.assertEqual(FoodImage.objects.get(query="mystery stew").image_url, "")

        mock_search.side_effect = food_images.requests.ConnectionError("offline")
        self.assertEqual(food_images.images_for(["Something new"]), {})
        self.assertFalse(FoodImage.objects.filter(query="something new").exists())

    @override_settings(PEXELS_API_KEY="", UNSPLASH_ACCESS_KEY="")
    @patch("nutrition.food_images._search")
    def test_no_key_means_no_lookups(self, mock_search):
        self.assertEqual(food_images.images_for(["Banana"]), {})
        mock_search.assert_not_called()

    @patch("nutrition.food_images._search", return_value=PHOTO)
    def test_plan_meals_have_photos(self, _search):
        self._create_plan()
        plan = self.client.get("/api/nutrition/plans/active/").data["plan"]
        option = plan["meal_options"][0]
        self.assertEqual(option["image_url"], PHOTO["image_url"])
        self.assertEqual(option["image_credit"], "Jane Doe / Pexels")


@override_settings(PEXELS_API_KEY="", UNSPLASH_ACCESS_KEY="")
class DailyMealRotationTests(PlanTestBase):
    def _names(self, plan):
        return {o["name"] for o in plan["meal_options"]}

    def test_meals_stay_all_day_and_change_the_next_day(self):
        created = self._create_plan()
        first = self.client.get("/api/nutrition/plans/active/").data["plan"]
        self.assertEqual(self._names(first), self._names(created))
        self.assertEqual(self._names(self.client.get("/api/nutrition/plans/active/").data["plan"]), self._names(first))

        # Pretend the meals were picked yesterday.
        Plan.objects.filter(pk=created["id"]).update(meals_date=self.today - timedelta(days=1))
        next_day = self.client.get("/api/nutrition/plans/active/").data["plan"]
        self.assertEqual(len(next_day["meal_options"]), 12)
        breakfasts = {o["name"] for o in next_day["meal_options"] if o["meal_type"] == "breakfast"}
        self.assertNotIn("Oats and eggs", breakfasts)
        self.assertEqual(Plan.objects.get(pk=created["id"]).meals_date, self.today)

        # And then it holds for the rest of that day, including the detail endpoint.
        detail = self.client.get(f"/api/nutrition/plans/{created['id']}/").data
        self.assertEqual(self._names(detail), self._names(next_day))

    def test_archived_plans_keep_their_meals(self):
        created = self._create_plan()
        Plan.objects.filter(pk=created["id"]).update(
            status=Plan.STATUS_ARCHIVED, meals_date=self.today - timedelta(days=3)
        )
        response = self.client.get(f"/api/nutrition/plans/{created['id']}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._names(response.data), self._names(created))


@override_settings(UNSPLASH_ACCESS_KEY="test-unsplash-key", PEXELS_API_KEY="")
class UnsplashTests(SimpleTestCase):
    @patch("nutrition.food_images.requests.get")
    def test_unsplash_result_is_mapped_with_credit(self, mock_get):
        mock_get.return_value.json.return_value = {
            "results": [
                {
                    "urls": {"small": "https://images.unsplash.com/s", "thumb": "https://images.unsplash.com/t"},
                    "user": {"name": "Ana Lee"},
                    "links": {"html": "https://unsplash.com/photos/abc"},
                }
            ]
        }
        found = food_images._search("banana")
        self.assertEqual(found["thumb_url"], "https://images.unsplash.com/t")
        self.assertEqual(mock_get.call_args.kwargs["headers"]["Authorization"], "Client-ID test-unsplash-key")
        self.assertEqual(food_images.credit(FoodImage(**found)), "Ana Lee / Unsplash")

    @patch("nutrition.food_images.requests.get")
    def test_prefers_a_photo_described_as_the_food(self, mock_get):
        mock_get.return_value.json.return_value = {
            "results": [
                {"alt_description": "white candle in clear glass holder", "urls": {"small": "candle"}, "links": {}},
                {"alt_description": "glass of milk on a table", "urls": {"small": "milk"}, "links": {}},
            ]
        }
        self.assertEqual(food_images._search("milk")["image_url"], "milk")
