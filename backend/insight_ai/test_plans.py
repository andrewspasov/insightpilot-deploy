from __future__ import annotations

import json
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from nutrition.models import Exercise, NutritionProfile, Plan, PlanMealOption, WeightEntry
from nutrition.plans import create_plan

from .models import InsightAIAction, InsightAIUsage
from .tests import InsightAIViewTests

AI_SETTINGS = dict(
    INSIGHT_AI_PROVIDER="openai",
    INSIGHT_AI_OPENAI_API_KEY="test-openai-key",
    INSIGHT_AI_OPENAI_MODEL="gpt-test",
    INSIGHT_AI_ALLOWED_EMAILS="nutrition-ai@example.com",
)

PLAN_PAYLOAD = {
    "goal_type": "gain",
    "sex": "male",
    "age": 27,
    "height_cm": 180,
    "weight_kg": 80,
    "target_weight_kg": 85,
    "job_activity": "desk",
    "equipment": "Full gym",
    "food_preferences": "No fish",
    "explanation": "Five-day split hitting each muscle hard once a week.",
    "weekly_training": [{"weekday": d, "activity": "weights", "duration_min": 70} for d in range(5)]
    + [{"weekday": d, "activity": "running", "duration_min": 30} for d in range(5)],
    "workout_days": [
        {
            "weekday": 0,
            "title": "Chest, triceps & side delts",
            "exercises": [
                {"name": "Barbell Bench Press", "primary_muscle": "chest", "equipment": "barbell",
                 "kind": "strength", "sets": 4, "rep_min": 6, "rep_max": 10, "duration_min": None},
                {"name": "Dumbbell Lateral Raise", "primary_muscle": "shoulders", "equipment": "dumbbell",
                 "kind": "strength", "sets": 3, "rep_min": 12, "rep_max": 15, "duration_min": None},
                {"name": "Running", "primary_muscle": "quadriceps", "equipment": "",
                 "kind": "cardio", "sets": None, "rep_min": None, "rep_max": None, "duration_min": 30},
            ],
        },
        {
            "weekday": 2,
            "title": "Legs",
            "exercises": [
                {"name": "Back Squat", "primary_muscle": "quadriceps", "equipment": "barbell",
                 "kind": "strength", "sets": 4, "rep_min": 6, "rep_max": 8, "duration_min": None},
            ],
        },
    ],
}


def _openai_response(body: dict) -> Mock:
    response = Mock(status_code=200)
    response.json.return_value = {
        "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(body)}]}],
        "usage": {"input_tokens": 900, "output_tokens": 600, "total_tokens": 1500},
    }
    return response


def _chat_body(action_type: str, plan_payload: dict | None, reply: str = "Here is your plan.") -> dict:
    return {
        "reply": reply,
        "action_type": action_type,
        "action_summary": "",
        "meal_payload": None,
        "plan_payload": plan_payload,
    }


@override_settings(**AI_SETTINGS)
class InsightAIPlanTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="nutrition-ai-user",
            email="nutrition-ai@example.com",
            password="password123",
        )
        self.client.force_authenticate(self.user)
        InsightAIViewTests._grant_nutrition_access(self)

    def _chat(self, mock_post, body, message="Build my bulking plan"):
        mock_post.return_value = _openai_response(body)
        return self.client.post("/api/insight-ai/chat/", {"message": message}, format="json")

    @patch("insight_ai.services.requests.post")
    def test_chat_prepares_create_plan_card_with_calculated_options(self, mock_post):
        response = self._chat(mock_post, _chat_body("create_plan", PLAN_PAYLOAD))
        self.assertEqual(response.status_code, 200, response.data)
        card = response.data["pending_action"]
        self.assertEqual(card["action_type"], "create_plan")
        self.assertEqual(Plan.objects.count(), 0)  # nothing saved before confirming

        options = card["payload"]["preview"]["options"]
        self.assertEqual([o["pace"] for o in options], ["low", "middle", "extreme"])
        self.assertEqual(card["payload"]["preview"]["maintenance_calories"], 2670)

        day = card["payload"]["workout_days"][0]
        bench = day["exercises"][0]
        self.assertEqual(bench["exercise_id"], Exercise.objects.get(slug="Barbell_Bench_Press_-_Medium_Grip").id)
        self.assertTrue(bench["image_urls"])
        self.assertEqual(day["exercises"][2]["kind"], "cardio")
        self.assertIn("Bulk plan: 80 kg → 85 kg", card["summary"])

        sent = mock_post.call_args.kwargs["json"]
        self.assertIn("create_plan", json.dumps(sent["text"]["format"]["schema"]))
        self.assertGreaterEqual(sent["max_output_tokens"], 3000)

    @patch("insight_ai.services.requests.post")
    def test_invalid_plan_proposal_is_explained_not_failed(self, mock_post):
        bad = {**PLAN_PAYLOAD, "target_weight_kg": 75}
        response = self._chat(mock_post, _chat_body("create_plan", bad))
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["pending_action"])
        self.assertIn("couldn't prepare that", response.data["reply"])
        self.assertIn("target weight must be above", response.data["reply"])

    @patch("insight_ai.services.requests.post")
    def test_confirming_with_a_pace_creates_the_plan(self, mock_post):
        card = self._chat(mock_post, _chat_body("create_plan", PLAN_PAYLOAD)).data["pending_action"]

        bad = self.client.post(f"/api/insight-ai/actions/{card['id']}/confirm/", {"pace": "turbo"}, format="json")
        self.assertEqual(bad.status_code, 400)

        ok = self.client.post(f"/api/insight-ai/actions/{card['id']}/confirm/", {"pace": "extreme"}, format="json")
        self.assertEqual(ok.status_code, 200, ok.data)
        plan = Plan.objects.get(owner=self.user)
        self.assertEqual(plan.status, "active")
        self.assertEqual(plan.pace, "extreme")
        self.assertEqual(ok.data["action"]["result_payload"]["plan_id"], plan.id)
        # The AI only wrote Monday and Wednesday; the other lifting days get built-in
        # workouts (here the Pull day of the 5-day split), keeping the runs at the end.
        self.assertEqual(plan.workout_days.count(), 5)
        tuesday = plan.workout_days.get(weekday=1)
        self.assertEqual(tuesday.title, "Pull")
        exercises = list(tuesday.exercises.all())
        self.assertGreaterEqual(len([e for e in exercises if e.kind == "strength"]), 5)
        self.assertEqual((exercises[-1].name, exercises[-1].kind, exercises[-1].duration_min), ("Running", "cardio", 30))
        monday = plan.workout_days.get(weekday=0)
        self.assertEqual(monday.title, PLAN_PAYLOAD["workout_days"][0]["title"])
        self.assertEqual(plan.equipment, "Full gym")
        profile = NutritionProfile.objects.get(owner=self.user)
        self.assertEqual(profile.daily_calorie_target, plan.daily_calorie_target)
        self.assertEqual(profile.food_preferences, "No fish")
        self.assertTrue(WeightEntry.objects.filter(owner=self.user, weight_kg=80).exists())

    @patch("insight_ai.services.requests.post")
    def test_named_but_empty_days_get_exercises_for_their_muscles(self, mock_post):
        payload = {
            **PLAN_PAYLOAD,
            "weekly_training": [{"weekday": d, "activity": "weights", "duration_min": 60} for d in (0, 3)],
            "workout_days": [{"weekday": 3, "title": "Back & biceps", "exercises": []}],
        }
        card = self._chat(mock_post, _chat_body("create_plan", payload)).data["pending_action"]
        days = {d["weekday"]: d for d in card["payload"]["workout_days"]}
        self.assertEqual(sorted(days), [0, 3])
        thursday = [e["name"] for e in days[3]["exercises"]]
        self.assertTrue(any("Row" in name or "Pull" in name for name in thursday))
        self.assertTrue(any("Curl" in name for name in thursday))
        self.assertEqual(days[0]["title"], "Full body A")
        self.assertTrue(all(e["image_urls"] for d in days.values() for e in d["exercises"]))

    @patch("insight_ai.services.requests.post")
    def test_update_program_replaces_days_and_recalculates_targets(self, mock_post):
        plan = create_plan(self.user, {**PLAN_PAYLOAD, "pace": "middle"})
        old_target = plan.daily_calorie_target
        fewer_sessions = [{"weekday": d, "activity": "weights", "duration_min": 60} for d in range(4)]
        new_program = {
            **{key: None for key in ("goal_type", "sex", "age", "height_cm", "weight_kg", "target_weight_kg",
                                      "job_activity", "equipment", "food_preferences", "explanation")},
            "weekly_training": fewer_sessions,
            "workout_days": [
                {"weekday": d, "title": f"Day {d + 1}", "exercises": PLAN_PAYLOAD["workout_days"][0]["exercises"][:1]}
                for d in range(4)
            ],
        }
        card = self._chat(mock_post, _chat_body("update_program", new_program), "Switch me to 4 days").data[
            "pending_action"
        ]
        self.assertEqual(card["action_type"], "update_program")
        self.assertLess(card["payload"]["new_calorie_target"], old_target)

        ok = self.client.post(f"/api/insight-ai/actions/{card['id']}/confirm/", {}, format="json")
        self.assertEqual(ok.status_code, 200, ok.data)
        plan.refresh_from_db()
        self.assertEqual(plan.workout_days.count(), 4)
        self.assertEqual(plan.daily_calorie_target, card["payload"]["new_calorie_target"])
        self.assertEqual(NutritionProfile.objects.get(owner=self.user).daily_calorie_target, plan.daily_calorie_target)

    @patch("insight_ai.services.requests.post")
    def test_update_program_without_plan_is_explained(self, mock_post):
        body = _chat_body("update_program", {**PLAN_PAYLOAD, "weekly_training": None})
        response = self._chat(mock_post, body, "Swap bench for dumbbell press")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["pending_action"])
        self.assertIn("no active plan", response.data["reply"])

    @patch("insight_ai.services.requests.post")
    def test_context_includes_body_stats_and_active_plan(self, mock_post):
        create_plan(self.user, {**PLAN_PAYLOAD, "pace": "middle"})
        self._chat(mock_post, _chat_body("none", None, "Sure."), "What do I train on Monday?")
        sent = json.dumps(mock_post.call_args.kwargs["json"]["input"])
        self.assertIn("Body stats: male, age 27, 180.0 cm", sent)
        self.assertIn("Active plan: gain at middle pace", sent)
        self.assertIn("Chest, triceps & side delts", sent)

    @patch("insight_ai.meal_plans.requests.post")
    def test_generate_meals_stores_options_and_logs_usage(self, mock_post):
        plan = create_plan(self.user, {**PLAN_PAYLOAD, "pace": "middle"})
        item = {"food_name": "Oats", "quantity": 150, "unit": "g", "calories": 583,
                "protein_grams": 25, "carbs_grams": 99, "fat_grams": 10}
        meals = {
            meal: [{"name": f"{meal} {i}", "description": "Tasty.", "items": [item]} for i in range(4)]
            for meal in ("breakfast", "lunch", "dinner", "snacks")
        }
        meals["brunch"] = [{"name": "ignored", "description": "", "items": [item]}]
        mock_post.return_value = _openai_response(meals)

        response = self.client.post(f"/api/insight-ai/plans/{plan.id}/generate-meals/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data["meal_options"]), 12)
        self.assertEqual(PlanMealOption.objects.filter(plan=plan, meal_type="breakfast").count(), 3)
        # Portions are scaled toward each meal's share of the day (breakfast = 25%).
        breakfast = PlanMealOption.objects.filter(plan=plan, meal_type="breakfast").first()
        self.assertAlmostEqual(breakfast.calories, plan.daily_calorie_target * 0.25, delta=25)
        self.assertEqual(breakfast.items[0]["quantity"] % 5, 0)
        prompt = mock_post.call_args.kwargs["json"]["input"][0]["content"]
        self.assertIn("No fish", prompt)
        self.assertIn(f"{plan.daily_calorie_target} kcal", prompt)
        self.assertTrue(InsightAIUsage.objects.filter(user=self.user, message_preview="[plan example meals]").exists())

        # Regenerating replaces the old options.
        self.client.post(f"/api/insight-ai/plans/{plan.id}/generate-meals/", {}, format="json")
        self.assertEqual(PlanMealOption.objects.filter(plan=plan).count(), 12)

    def test_scaling_is_capped_and_rounds_count_units(self):
        from .meal_plans import scale_to_target

        meal = {"items": [{"food_name": "Eggs", "quantity": 2, "unit": "piece", "calories": 140,
                           "protein_grams": 12, "carbs_grams": 1, "fat_grams": 10}]}
        scaled = scale_to_target(meal, 1400)["items"][0]
        self.assertEqual(scaled["quantity"], 4.0)  # capped at 2x
        self.assertEqual(scaled["calories"], 280)
        halved = scale_to_target(meal, 105)["items"][0]
        self.assertEqual(halved["quantity"], 1.5)  # 0.75x, rounded to a half piece

    def test_generate_meals_for_someone_elses_plan_is_404(self):
        other = type(self.user).objects.create_user(username="other", email="other@example.com", password="pw-123456")
        plan = create_plan(other, {**PLAN_PAYLOAD, "pace": "middle"})
        response = self.client.post(f"/api/insight-ai/plans/{plan.id}/generate-meals/", {}, format="json")
        self.assertEqual(response.status_code, 404)

