from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from nutrition.models import MealEntry, Plan, WeightEntry
from nutrition.plans import create_plan

from .test_plans import AI_SETTINGS, PLAN_PAYLOAD, _openai_response
from .tests import InsightAIViewTests

FOOD = {
    "meal_type": "dinner",
    "food_name": "Rice",
    "brand_name": "",
    "quantity": 150,
    "unit": "g",
    "calories": 195,
    "protein_grams": 4,
    "carbs_grams": 42,
    "fat_grams": 0.4,
    "fiber_grams": 0.6,
    "sugar_grams": 0,
    "sodium_mg": 2,
}


def _body(action_type: str, **fields) -> dict:
    return {
        "reply": "Ready for you to confirm.",
        "action_type": action_type,
        "action_summary": "",
        "meal_payload": None,
        "plan_payload": None,
        "plan_pace": None,
        "diary_payload": None,
        "weight_payload": None,
        **fields,
    }


@override_settings(**AI_SETTINGS)
class InsightAIEditTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="nutrition-ai-user",
            email="nutrition-ai@example.com",
            password="password123",
        )
        self.client.force_authenticate(self.user)
        InsightAIViewTests._grant_nutrition_access(self)
        self.today = timezone.localdate()

    def _card(self, mock_post, body, message="Do it"):
        mock_post.return_value = _openai_response(body)
        response = self.client.post("/api/insight-ai/chat/", {"message": message}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def _confirm(self, card):
        response = self.client.post(f"/api/insight-ai/actions/{card['id']}/confirm/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["action"]

    def _entry(self, name, servings=100.0, days_ago=0, owner=None):
        return MealEntry.objects.create(
            owner=owner or self.user,
            entry_date=self.today - timedelta(days=days_ago),
            meal_type="lunch",
            food_source=MealEntry.SOURCE_CUSTOM,
            food_name=name,
            serving_description="g",
            measurement_unit="g",
            servings=servings,
            grams_per_unit=1.0,
            serving_calories=1.5,
        )

    @patch("insight_ai.services.requests.post")
    def test_delete_plan_archives_it_after_confirming(self, mock_post):
        plan = create_plan(self.user, {**PLAN_PAYLOAD, "pace": "middle"})
        card = self._card(mock_post, _body("delete_plan"), "delete my plan")["pending_action"]
        self.assertEqual(card["action_type"], "delete_plan")
        self.assertIn("End your Bulk plan", card["summary"])
        plan.refresh_from_db()
        self.assertEqual(plan.status, Plan.STATUS_ACTIVE)  # nothing changes before confirming

        self._confirm(card)
        plan.refresh_from_db()
        self.assertEqual(plan.status, Plan.STATUS_ARCHIVED)

    @patch("insight_ai.services.requests.post")
    def test_delete_plan_without_plan_is_explained(self, mock_post):
        data = self._card(mock_post, _body("delete_plan"))
        self.assertIsNone(data["pending_action"])
        self.assertIn("don't have an active plan", data["reply"])

    @patch("insight_ai.services.requests.post")
    def test_update_plan_changes_pace(self, mock_post):
        plan = create_plan(self.user, {**PLAN_PAYLOAD, "pace": "middle"})
        card = self._card(mock_post, _body("update_plan", plan_pace="low"), "slow it down")["pending_action"]
        self.assertLess(card["payload"]["new_calorie_target"], plan.daily_calorie_target)

        self._confirm(card)
        plan.refresh_from_db()
        self.assertEqual(plan.pace, "low")
        self.assertEqual(plan.daily_calorie_target, card["payload"]["new_calorie_target"])

    @patch("insight_ai.services.requests.post")
    def test_edit_diary_adds_changes_and_deletes(self, mock_post):
        oats = self._entry("Oats", servings=80)
        banana = self._entry("Banana", days_ago=1)
        diary = {
            "add": [{**FOOD, "entry_date": str(self.today)}, {**FOOD, "food_name": "Beans", "entry_date": str(self.today)}],
            "update": [{"entry_id": oats.id, "quantity": 100, "meal_type": "breakfast", "entry_date": None}],
            "delete": [banana.id],
        }
        card = self._card(mock_post, _body("edit_diary", diary_payload=diary))["pending_action"]
        self.assertEqual(card["action_type"], "edit_diary")
        self.assertEqual(len(card["payload"]["lines"]), 4)
        self.assertIn("80 → 100 g", card["payload"]["lines"][2])
        self.assertTrue(MealEntry.objects.filter(id=banana.id).exists())

        self._confirm(card)
        oats.refresh_from_db()
        self.assertEqual((oats.servings, oats.meal_type, oats.calories), (100, "breakfast", 150))
        self.assertFalse(MealEntry.objects.filter(id=banana.id).exists())
        self.assertEqual(MealEntry.objects.filter(owner=self.user, food_name__in=["Rice", "Beans"]).count(), 2)

    @patch("insight_ai.services.requests.post")
    def test_edit_diary_cannot_touch_someone_elses_entries(self, mock_post):
        other = get_user_model().objects.create_user(username="other", password="password123")
        theirs = self._entry("Toast", owner=other)
        data = self._card(mock_post, _body("edit_diary", diary_payload={"add": [], "update": [], "delete": [theirs.id]}))
        self.assertIsNone(data["pending_action"])
        self.assertTrue(MealEntry.objects.filter(id=theirs.id).exists())

    @patch("insight_ai.services.requests.post")
    def test_log_weight_replaces_same_day(self, mock_post):
        WeightEntry.objects.create(owner=self.user, entry_date=self.today, weight_kg=80)
        weight = {"entry_date": str(self.today), "weight_kg": 79.4}
        card = self._card(mock_post, _body("log_weight", weight_payload=weight), "I weigh 79.4 today")["pending_action"]
        self.assertIn("replaces 80 kg", card["summary"])

        self._confirm(card)
        self.assertEqual(WeightEntry.objects.get(owner=self.user).weight_kg, 79.4)

    @patch("insight_ai.services.requests.post")
    def test_context_lists_recent_foods_with_ids(self, mock_post):
        recent = self._entry("Oats", days_ago=2)
        old = self._entry("Pizza", days_ago=3)
        self._card(mock_post, _body("none"), "what did I eat?")
        prompt = mock_post.call_args.kwargs["json"]["input"][-1]["content"]
        self.assertIn(f"id {recent.id}", prompt)
        self.assertNotIn(f"id {old.id}", prompt)

    @patch("insight_ai.services.requests.post")
    def test_adjusting_a_proposal_shows_it_to_the_ai_and_replaces_the_card(self, mock_post):
        first = self._card(mock_post, _body("create_plan", plan_payload=PLAN_PAYLOAD))["pending_action"]
        self._card(mock_post, _body("none"), "add an hour of cardio on Saturday")
        prompt = mock_post.call_args.kwargs["json"]["input"][-1]["content"]
        self.assertIn("Plan proposal waiting for the user to confirm", prompt)
        self.assertIn("target_weight_kg 85", prompt)

        saturday = {**PLAN_PAYLOAD, "weekly_training": PLAN_PAYLOAD["weekly_training"]
                    + [{"weekday": 5, "activity": "running", "duration_min": 60}]}
        second = self._card(mock_post, _body("create_plan", plan_payload=saturday))["pending_action"]
        self.assertIn(5, [d["weekday"] for d in second["payload"]["workout_days"]])
        statuses = dict(self.user.insight_ai_actions.values_list("id", "status"))
        self.assertEqual(statuses[first["id"]], "cancelled")
        self.assertEqual(statuses[second["id"]], "pending")

    @patch("insight_ai.services.requests.post")
    def test_ai_sees_more_than_ten_earlier_messages(self, mock_post):
        history = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"message {i}"} for i in range(24)]
        mock_post.return_value = _openai_response(_body("none"))
        self.client.post("/api/insight-ai/chat/", {"message": "hi", "history": history}, format="json")
        sent = mock_post.call_args.kwargs["json"]["input"]
        self.assertEqual(sent[0]["content"], "message 0")

    def test_voice_transcription_is_not_counted_as_a_message(self):
        from .models import InsightAIUsage
        from .services import TRANSCRIPTION_PREVIEW, get_monthly_usage

        InsightAIUsage.objects.create(
            user=self.user, provider="openai", model="x", status=InsightAIUsage.STATUS_SUCCESS,
            message_preview=TRANSCRIPTION_PREVIEW,
        )
        InsightAIUsage.objects.create(
            user=self.user, provider="openai", model="x", status=InsightAIUsage.STATUS_SUCCESS, message_preview="hi",
        )
        self.assertEqual(get_monthly_usage(self.user)["messages"], 1)
