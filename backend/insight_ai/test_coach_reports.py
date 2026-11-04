from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from nutrition.models import MealEntry, NutritionProfile, WaterEntry, WeightEntry
from nutrition.plans import create_plan

from .coach_reports import send_due_reports
from .models import InsightAIUsage
from .services import get_monthly_usage
from .test_plans import AI_SETTINGS, PLAN_PAYLOAD
from .tests import InsightAIViewTests


def _text_response(text: str) -> Mock:
    response = Mock(status_code=200)
    response.json.return_value = {
        "output": [{"type": "message", "content": [{"type": "output_text", "text": text}]}],
        "usage": {"input_tokens": 300, "output_tokens": 60, "total_tokens": 360},
    }
    return response


@override_settings(**AI_SETTINGS, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class CoachReportTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="nutrition-ai-user",
            email="nutrition-ai@example.com",
            password="password123",
        )
        self.client.force_authenticate(self.user)
        InsightAIViewTests._grant_nutrition_access(self)
        self.today = timezone.localdate()

    def _log_food(self, day, name="Oats", calories=300):
        return MealEntry.objects.create(
            owner=self.user, entry_date=day, meal_type="breakfast", food_name=name, calories=calories,
            protein_grams=10, carbs_grams=50, fat_grams=5,
        )

    def test_no_nudge_when_logged_recently(self):
        self._log_food(self.today - timedelta(days=1))
        data = self.client.get("/api/insight-ai/logging-status/").json()
        self.assertEqual(data["days_since_last_log"], 1)
        self.assertFalse(data["show_nudge"])

    def test_nudge_after_two_days_counts_water_and_ignores_future_days(self):
        self._log_food(self.today - timedelta(days=5))
        WaterEntry.objects.create(owner=self.user, entry_date=self.today - timedelta(days=3), total_ml=500)
        self._log_food(self.today + timedelta(days=1))
        data = self.client.get("/api/insight-ai/logging-status/").json()
        self.assertEqual(data["last_logged_date"], str(self.today - timedelta(days=3)))
        self.assertTrue(data["show_nudge"])
        self.assertIn("3 days", data["message"])

    def test_nudge_mentions_active_plan_and_respects_setting(self):
        create_plan(self.user, {**PLAN_PAYLOAD, "pace": "middle"})
        # Creating the plan logs today's weight; pretend that was two days ago.
        WeightEntry.objects.filter(owner=self.user).update(entry_date=self.today - timedelta(days=2))
        data = self.client.get("/api/insight-ai/logging-status/").json()
        self.assertIn("gain plan", data["message"])

        NutritionProfile.objects.filter(owner=self.user).update(logging_reminders=False)
        data = self.client.get("/api/insight-ai/logging-status/").json()
        self.assertFalse(data["show_nudge"])
        self.assertFalse(data["reminders_enabled"])

    @patch("insight_ai.coach_reports.requests.post")
    def test_email_report_now_with_ai_note(self, mock_post):
        mock_post.return_value = _text_response("Great protein today. Add a glass of water before lunch.")
        self._log_food(self.today, "Greek yogurt", 150)
        WaterEntry.objects.create(owner=self.user, entry_date=self.today, total_ml=750)

        response = self.client.post("/api/insight-ai/daily-report/", {}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["sent_to"], "nutrition-ai@example.com")
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertIn("Greek yogurt", message.body)
        self.assertIn("Great protein today", message.body)
        self.assertIn("750 / 2000 ml", message.alternatives[0][0])
        # The report spends tokens but isn't counted as a chat message.
        self.assertEqual(InsightAIUsage.objects.filter(message_preview="[daily report]").count(), 1)
        usage = get_monthly_usage(self.user)
        self.assertEqual(usage["messages"], 0)
        self.assertEqual(usage["total_tokens"], 360)

    @patch("insight_ai.coach_reports.requests.post")
    def test_report_still_sends_numbers_when_ai_fails(self, mock_post):
        mock_post.return_value = Mock(status_code=500, text="boom")
        response = self.client.post("/api/insight-ai/daily-report/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("No food logged today.", mail.outbox[0].body)
        self.assertNotIn("Coach's note", mail.outbox[0].body)

    @patch("insight_ai.coach_reports.ai_summary", return_value="")
    def test_scheduled_reports_go_once_after_the_report_hour(self, _summary):
        NutritionProfile.objects.update_or_create(owner=self.user, defaults={"daily_report_hour": 20})
        tz = timezone.get_current_timezone()
        evening = timezone.make_aware(datetime.combine(self.today, datetime.min.time()).replace(hour=20, minute=5), tz)
        afternoon = evening.replace(hour=15)

        self.assertEqual(send_due_reports(afternoon), [])
        self.assertEqual(send_due_reports(evening), ["nutrition-ai@example.com"])
        self.assertEqual(send_due_reports(evening + timedelta(hours=1)), [])
        self.assertEqual(len(mail.outbox), 1)

        NutritionProfile.objects.filter(owner=self.user).update(daily_report_email=False, daily_report_last_sent=None)
        self.assertEqual(send_due_reports(evening), [])
