from __future__ import annotations

import shutil
import tempfile
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from billing.models import AccessPass, Customer, Subscription, SubscriptionItem, Tool
from nutrition.models import CustomFood, MealEntry, SavedMeal, WeightEntry

User = get_user_model()


class NutritionApiTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_root = tempfile.mkdtemp(prefix="insightpilot_nutrition_media_")
        cls._override = override_settings(MEDIA_ROOT=cls._media_root)
        cls._override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override.disable()
        shutil.rmtree(cls._media_root, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.user = User.objects.create_user(
            username="nutrition-user",
            email="nutrition@example.com",
            password="secure-pass-123",
        )
        self.client.force_authenticate(user=self.user)
        self._grant_tool_access(self.user)

    def _grant_tool_access(self, user):
        tool, _ = Tool.objects.get_or_create(
            key="nutrition",
            defaults={
                "name": "Nutrition",
                "description": "Nutrition tool",
                "sort_order": 2,
            },
        )
        access_pass, _ = AccessPass.objects.update_or_create(
            key=AccessPass.KEY_BRONZE,
            defaults={
                "name": "Bronze",
                "monthly_price_cents": 2900,
                "tool_limit": 1,
                "sort_order": 1,
            },
        )
        customer = Customer.objects.create(
            user=user,
            stripe_customer_id=f"cus_{user.id}",
        )
        subscription = Subscription.objects.create(
            user=user,
            customer=customer,
            access_pass=access_pass,
            stripe_subscription_id=f"sub_{user.id}",
            status=Subscription.STATUS_ACTIVE,
        )
        SubscriptionItem.objects.create(subscription=subscription, tool=tool)

    def _demo_entry_payload(self, entry_date, meal_type="breakfast", food_name="Banana"):
        return {
            "entry_date": str(entry_date),
            "meal_type": meal_type,
            "food_source": "demo",
            "external_food_id": food_name.lower(),
            "food_name": food_name,
            "brand_name": "",
            "serving_description": "g",
            "measurement_unit": "g",
            "quantity": 200,
            "grams_per_unit": 1.0,
            "serving_calories": 0.89,
            "serving_protein_grams": 0.011,
            "serving_carbs_grams": 0.228,
            "serving_fat_grams": 0.003,
            "serving_fiber_grams": 0.026,
            "serving_sugar_grams": 0.122,
            "serving_sodium_mg": 0.01,
        }

    def test_profile_and_overview_create_defaults(self):
        profile_response = self.client.get("/api/nutrition/profile/")
        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
        self.assertEqual(profile_response.data["goal_type"], "track")
        self.assertEqual(profile_response.data["daily_calorie_target"], 2000)

        overview_response = self.client.get("/api/nutrition/overview/")
        self.assertEqual(overview_response.status_code, status.HTTP_200_OK)
        self.assertEqual(overview_response.data["entries_count"], 0)
        self.assertEqual(len(overview_response.data["meal_sections"]), 4)
        self.assertEqual(overview_response.data["remaining"]["calories"], 2000.0)

    def test_food_search_returns_fallback_results_without_usda_key(self):
        response = self.client.get("/api/nutrition/foods/search/?query=banana")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["count"], 1)
        first_result = response.data["results"][0]
        self.assertIn("default_unit_key", first_result)
        self.assertTrue(first_result["available_units"])
        self.assertTrue(
            any(unit["key"] in {"g", "serving"} for unit in first_result["available_units"])
        )

    def test_entry_create_updates_overview_totals(self):
        entry_date = str(timezone.localdate())
        payload = self._demo_entry_payload(entry_date)

        create_response = self.client.post("/api/nutrition/entries/", payload, format="json")
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_response.data["calories"], 178.0)
        self.assertEqual(create_response.data["total_grams"], 200.0)
        self.assertEqual(MealEntry.objects.count(), 1)

        overview_response = self.client.get(f"/api/nutrition/overview/?date={entry_date}")
        self.assertEqual(overview_response.status_code, status.HTTP_200_OK)
        self.assertEqual(overview_response.data["totals"]["calories"], 178.0)
        breakfast = overview_response.data["meal_sections"][0]
        self.assertEqual(breakfast["meal_type"], "breakfast")
        self.assertEqual(len(breakfast["entries"]), 1)
        self.assertEqual(breakfast["entries"][0]["measurement_unit"], "g")

    def test_copy_meal_duplicates_previous_day_entries(self):
        today = timezone.localdate()
        yesterday = today - timedelta(days=1)
        create_response = self.client.post(
            "/api/nutrition/entries/",
            self._demo_entry_payload(yesterday, meal_type="lunch"),
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        copy_response = self.client.post(
            "/api/nutrition/entries/copy-meal/",
            {
                "source_date": str(yesterday),
                "target_date": str(today),
                "source_meal_type": "lunch",
                "target_meal_type": "lunch",
            },
            format="json",
        )

        self.assertEqual(copy_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(copy_response.data), 1)
        copied = MealEntry.objects.get(owner=self.user, entry_date=today, meal_type="lunch")
        self.assertEqual(copied.food_name, "Banana")
        self.assertEqual(copied.calories, 178.0)
        self.assertEqual(copied.total_grams, 200.0)

    def test_copy_entries_copies_chosen_foods_to_any_date_and_meal(self):
        source = date(2026, 10, 3)
        target = date(2026, 10, 15)
        banana = self.client.post(
            "/api/nutrition/entries/", self._demo_entry_payload(source, meal_type="breakfast"), format="json"
        ).data
        yogurt = self.client.post(
            "/api/nutrition/entries/",
            self._demo_entry_payload(source, meal_type="lunch", food_name="Greek Yogurt"),
            format="json",
        ).data
        self.client.post(
            "/api/nutrition/entries/", self._demo_entry_payload(source, meal_type="dinner", food_name="Rice"), format="json"
        )

        response = self.client.post(
            "/api/nutrition/entries/copy-entries/",
            {"entry_ids": [banana["id"], yogurt["id"]], "target_date": str(target)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        copied = MealEntry.objects.filter(owner=self.user, entry_date=target)
        self.assertEqual(
            sorted(copied.values_list("food_name", "meal_type")), [("Banana", "breakfast"), ("Greek Yogurt", "lunch")]
        )

        into_snacks = self.client.post(
            "/api/nutrition/entries/copy-entries/",
            {"entry_ids": [yogurt["id"]], "target_date": str(target), "target_meal_type": "snacks"},
            format="json",
        )
        self.assertEqual(into_snacks.data[0]["meal_type"], "snacks")

        other = User.objects.create_user(username="other", email="other@example.com", password="secure-pass-123")
        self._grant_tool_access(other)
        self.client.force_authenticate(user=other)
        theirs = self.client.post("/api/nutrition/entries/", self._demo_entry_payload(source), format="json").data
        self.client.force_authenticate(user=self.user)
        stolen = self.client.post(
            "/api/nutrition/entries/copy-entries/",
            {"entry_ids": [theirs["id"]], "target_date": str(target)},
            format="json",
        )
        self.assertEqual(stolen.status_code, status.HTTP_400_BAD_REQUEST)

    def test_calendar_lists_logged_days_in_the_month(self):
        for day, meal in ((date(2026, 10, 3), "breakfast"), (date(2026, 10, 3), "lunch"), (date(2026, 10, 20), "dinner")):
            self.client.post("/api/nutrition/entries/", self._demo_entry_payload(day, meal_type=meal), format="json")
        self.client.post("/api/nutrition/entries/", self._demo_entry_payload(date(2026, 11, 1)), format="json")

        response = self.client.get("/api/nutrition/entries/calendar/?month=2026-10")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["days"],
            [{"date": "2026-10-03", "calories": 356, "entries": 2}, {"date": "2026-10-20", "calories": 178, "entries": 1}],
        )
        self.assertEqual(self.client.get("/api/nutrition/entries/calendar/?month=oct").status_code, 400)

    def test_custom_foods_can_be_found_by_barcode(self):
        self.client.post(
            "/api/nutrition/custom-foods/",
            {"name": "Oat bar", "barcode": "5901234123457", "base_amount": 100, "base_unit": "g", "calories": 410},
            format="json",
        )
        self.client.post("/api/nutrition/custom-foods/", {"name": "Homemade soup"}, format="json")
        found = self.client.get("/api/nutrition/custom-foods/?barcode=5901234123457").data
        self.assertEqual([f["name"] for f in found], ["Oat bar"])
        self.assertEqual(len(self.client.get("/api/nutrition/custom-foods/").data), 2)

    def test_saved_meal_can_be_created_from_diary_and_logged(self):
        today = timezone.localdate()
        tomorrow = today + timedelta(days=1)
        create_response = self.client.post(
            "/api/nutrition/entries/",
            self._demo_entry_payload(today, meal_type="breakfast", food_name="Greek Yogurt"),
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        save_response = self.client.post(
            "/api/nutrition/saved-meals/save-from-diary/",
            {
                "name": "Protein breakfast",
                "entry_date": str(today),
                "meal_type": "breakfast",
            },
            format="json",
        )
        self.assertEqual(save_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(save_response.data["name"], "Protein breakfast")
        self.assertEqual(save_response.data["item_count"], 1)
        self.assertEqual(save_response.data["totals"]["calories"], 178.0)
        self.assertEqual(SavedMeal.objects.count(), 1)

        log_response = self.client.post(
            f"/api/nutrition/saved-meals/{save_response.data['id']}/log/",
            {
                "entry_date": str(tomorrow),
                "meal_type": "snacks",
            },
            format="json",
        )
        self.assertEqual(log_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(log_response.data), 1)
        logged = MealEntry.objects.get(owner=self.user, entry_date=tomorrow, meal_type="snacks")
        self.assertEqual(logged.food_name, "Greek Yogurt")
        self.assertEqual(logged.calories, 178.0)

    def test_custom_food_supports_units_and_image_inputs(self):
        image_file = SimpleUploadedFile(
            "almond-butter.gif",
            (
                b"GIF87a\x01\x00\x01\x00\x80\x00\x00"
                b"\x00\x00\x00\xff\xff\xff!\xf9\x04"
                b"\x01\x00\x00\x00\x00,\x00\x00\x00"
                b"\x00\x01\x00\x01\x00\x00\x02\x02D"
                b"\x01\x00;"
            ),
            content_type="image/gif",
        )
        response = self.client.post(
            "/api/nutrition/custom-foods/",
            {
                "name": "Almond Butter",
                "brand_name": "Homemade",
                "base_amount": "1",
                "base_unit": "tbsp",
                "gram_weight": "16",
                "calories": "",
                "protein_grams": "",
                "carbs_grams": "3",
                "fat_grams": "9",
                "external_image_url": "https://example.com/almond-butter.png",
                "image": image_file,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["base_unit"], "tbsp")
        self.assertEqual(response.data["calories"], 0.0)
        self.assertTrue(response.data["image_url"])
        self.assertTrue(any(unit["key"] == "g" for unit in response.data["available_units"]))
        self.assertEqual(CustomFood.objects.count(), 1)

    def test_weight_entries_upsert_and_insights_show_weight_change(self):
        today = timezone.localdate()
        yesterday = today - timedelta(days=1)

        yesterday_response = self.client.post(
            "/api/nutrition/weights/",
            {"entry_date": str(yesterday), "weight_kg": 80.0},
            format="json",
        )
        self.assertEqual(yesterday_response.status_code, status.HTTP_201_CREATED)

        first_today_response = self.client.post(
            "/api/nutrition/weights/",
            {"entry_date": str(today), "weight_kg": 79.8},
            format="json",
        )
        self.assertEqual(first_today_response.status_code, status.HTTP_201_CREATED)

        update_today_response = self.client.post(
            "/api/nutrition/weights/",
            {"entry_date": str(today), "weight_kg": 79.5, "note": "Updated"},
            format="json",
        )
        self.assertEqual(update_today_response.status_code, status.HTTP_200_OK)
        self.assertEqual(WeightEntry.objects.filter(owner=self.user).count(), 2)

        insights_response = self.client.get("/api/nutrition/insights/?days=7")
        self.assertEqual(insights_response.status_code, status.HTTP_200_OK)
        self.assertEqual(insights_response.data["weight_change_kg"], -0.5)
        self.assertEqual(len(insights_response.data["weight_series"]), 2)
