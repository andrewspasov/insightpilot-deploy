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


@override_settings(UNSPLASH_ACCESS_KEY="test-unsplash-key", PEXELS_API_KEY="")
class RateLimitPauseTests(APITestCase):
    def setUp(self):
        from django.core.cache import cache

        cache.delete(food_images.PAUSE_CACHE_KEY)
        self.addCleanup(cache.delete, food_images.PAUSE_CACHE_KEY)

    @staticmethod
    def _rate_limited():
        import requests

        response = requests.Response()
        response.status_code = 403
        return requests.HTTPError("403 Client Error: Rate Limit Exceeded", response=response)

    @patch("nutrition.food_images.requests.get")
    def test_rate_limit_pauses_lookups_and_is_not_cached_as_a_miss(self, mock_get):
        mock_get.return_value.raise_for_status.side_effect = self._rate_limited()
        with self.assertLogs("nutrition.food_images", level="WARNING") as logs:
            self.assertEqual(food_images.images_for(["French fries"]), {})
        self.assertIn("paused", logs.output[0])
        self.assertIn("Unsplash", logs.output[0])
        self.assertFalse(FoodImage.objects.filter(query="french fries").exists())

        # The next page load doesn't ask Unsplash again while paused.
        calls = mock_get.call_count
        food_images.images_for(["French fries", "Banana"])
        self.assertEqual(mock_get.call_count, calls)

    @patch("nutrition.food_images.requests.get")
    def test_lookups_resume_after_the_pause(self, mock_get):
        from django.core.cache import cache

        cache.set(food_images.PAUSE_CACHE_KEY, True, 60)
        food_images.images_for(["Banana"])
        mock_get.assert_not_called()

        cache.delete(food_images.PAUSE_CACHE_KEY)
        mock_get.return_value.json.return_value = {
            "results": [{"alt_description": "banana", "urls": {"small": "s", "thumb": "t"}, "links": {}}]
        }
        self.assertEqual(food_images.images_for(["Banana"])["Banana"].image_url, "s")


UNSPLASH_PHOTO = {
    "image_url": "https://images.unsplash.com/s",
    "thumb_url": "https://images.unsplash.com/t",
    "photographer": "Ana Lee",
    "source_url": "https://unsplash.com/photos/abc",
    "photographer_url": "https://unsplash.com/@analee",
    "download_location": "https://api.unsplash.com/photos/abc/download?ixid=1",
}


@override_settings(UNSPLASH_ACCESS_KEY="test-unsplash-key", PEXELS_API_KEY="", UNSPLASH_APP_NAME="insightpilot")
class UnsplashGuidelineTests(PlanTestBase):
    def setUp(self):
        super().setUp()
        from django.core.cache import cache

        cache.delete(food_images.PAUSE_CACHE_KEY)

    @patch("nutrition.food_images.requests.get")
    def test_search_keeps_the_profile_and_download_links(self, mock_get):
        mock_get.return_value.json.return_value = {
            "results": [
                {
                    "alt_description": "banana",
                    "urls": {"small": "s", "thumb": "t"},
                    "user": {"name": "Ana Lee", "links": {"html": "https://unsplash.com/@analee"}},
                    "links": {"html": "https://unsplash.com/photos/abc", "download_location": UNSPLASH_PHOTO["download_location"]},
                }
            ]
        }
        found = food_images._search("banana")
        self.assertEqual(found["photographer_url"], "https://unsplash.com/@analee")
        self.assertEqual(found["download_location"], UNSPLASH_PHOTO["download_location"])

    @patch("nutrition.food_images._track_download")
    @patch("nutrition.food_images._search", return_value=UNSPLASH_PHOTO)
    def test_a_new_photo_is_reported_to_unsplash_once(self, mock_search, mock_track):
        food_images.images_for(["Banana"])
        food_images.images_for(["Banana"])
        mock_track.assert_called_once_with(UNSPLASH_PHOTO["download_location"])

    def test_attribution_links_carry_the_referral_tags(self):
        credit = food_images.attribution(FoodImage(query="banana", **UNSPLASH_PHOTO))
        self.assertEqual(credit["photographer"], "Ana Lee")
        self.assertEqual(credit["photographer_url"], "https://unsplash.com/@analee?utm_source=insightpilot&utm_medium=referral")
        self.assertEqual(credit["provider"], "Unsplash")
        self.assertEqual(credit["provider_url"], "https://unsplash.com/?utm_source=insightpilot&utm_medium=referral")

    @patch("nutrition.food_images._track_download")
    @patch("nutrition.food_images._search", return_value=UNSPLASH_PHOTO)
    def test_diary_rows_get_a_linked_credit_but_scanned_products_dont(self, mock_search, mock_track):
        MealEntry.objects.create(owner=self.user, entry_date=self.today, meal_type="lunch", food_name="Banana")
        MealEntry.objects.create(
            owner=self.user, entry_date=self.today, meal_type="lunch", food_name="Scanned bar",
            image_url="https://images.openfoodfacts.org/bar.jpg",
        )
        response = self.client.get(f"/api/nutrition/overview/?date={self.today}")
        entries = {e["food_name"]: e for e in response.data["meal_sections"][1]["entries"]}
        self.assertEqual(entries["Banana"]["image_attribution"]["provider"], "Unsplash")
        self.assertIn("utm_medium=referral", entries["Banana"]["image_attribution"]["photographer_url"])
        self.assertIsNone(entries["Scanned bar"]["image_attribution"])


@override_settings(UNSPLASH_ACCESS_KEY="test-unsplash-key", PEXELS_API_KEY="")
class FallbackSearchTests(SimpleTestCase):
    def test_possessive_leftovers_are_dropped(self):
        self.assertEqual(food_images.normalize("Domino’s Pepperoni Pizza"), "domino pepperoni pizza")

    @patch("nutrition.food_images._search_unsplash")
    def test_brand_names_fall_back_to_the_dish(self, mock_search):
        mock_search.side_effect = lambda q: UNSPLASH_PHOTO if q == "pepperoni pizza" else {}
        self.assertEqual(food_images._search("domino pepperoni pizza"), UNSPLASH_PHOTO)
        self.assertEqual([c.args[0] for c in mock_search.call_args_list], ["domino pepperoni pizza", "pepperoni pizza"])

    @patch("nutrition.food_images._search_unsplash", return_value={})
    def test_gives_up_after_the_last_word(self, mock_search):
        self.assertEqual(food_images._search("mystery stew"), {})
        self.assertEqual([c.args[0] for c in mock_search.call_args_list], ["mystery stew", "stew"])
