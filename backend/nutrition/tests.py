from __future__ import annotations

import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from billing.models import AccessPass, Customer, Subscription, SubscriptionItem, Tool
from nutrition.models import CustomFood, MealEntry, WeightEntry

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
        payload = {
            "entry_date": entry_date,
            "meal_type": "breakfast",
            "food_source": "demo",
            "external_food_id": "banana",
            "food_name": "Banana",
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
