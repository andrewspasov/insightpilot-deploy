from __future__ import annotations

from datetime import timedelta
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from billing.models import AccessPass, Customer, Subscription, SubscriptionItem, Tool
from nutrition.models import MealEntry

from .models import InsightAIAction, InsightAIUsage


class InsightAIViewTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="nutrition-ai-user",
            email="nutrition-ai@example.com",
            password="password123",
        )
        self.client.force_authenticate(self.user)
        self._grant_nutrition_access()

    def _grant_nutrition_access(self):
        access_pass, _ = AccessPass.objects.update_or_create(
            key=AccessPass.KEY_BRONZE,
            defaults={
                "name": "Bronze",
                "monthly_price_cents": 10000,
                "tool_limit": 1,
            },
        )
        tool, _ = Tool.objects.update_or_create(key="nutrition", defaults={"name": "Nutrition"})
        customer = Customer.objects.create(user=self.user, stripe_customer_id="cus_ai_test")
        subscription = Subscription.objects.create(
            user=self.user,
            customer=customer,
            stripe_subscription_id="sub_ai_test",
            access_pass=access_pass,
            status=Subscription.STATUS_ACTIVE,
        )
        SubscriptionItem.objects.create(subscription=subscription, tool=tool)

    def test_status_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/insight-ai/status/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @override_settings(
        INSIGHT_AI_PROVIDER="gemini",
        INSIGHT_AI_GEMINI_API_KEY="",
        INSIGHT_AI_ALLOWED_EMAILS="nutrition-ai@example.com",
    )
    def test_status_reports_not_configured(self):
        response = self.client.get("/api/insight-ai/status/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["provider"], "gemini")
        self.assertFalse(response.data["configured"])
        self.assertFalse(response.data["can_chat"])

    @override_settings(
        INSIGHT_AI_PROVIDER="gemini",
        INSIGHT_AI_GEMINI_API_KEY="test-key",
        INSIGHT_AI_ALLOWED_EMAILS="someone-else@example.com",
    )
    def test_chat_rejects_non_allowlisted_user(self):
        response = self.client.post(
            "/api/insight-ai/chat/",
            {"message": "How am I doing today?"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("private", response.data["detail"])

    @override_settings(
        INSIGHT_AI_PROVIDER="gemini",
        INSIGHT_AI_GEMINI_API_KEY="test-key",
        INSIGHT_AI_ALLOWED_EMAILS="nutrition-ai@example.com",
        INSIGHT_AI_MODEL="gemini-test",
    )
    @patch("insight_ai.services.requests.post")
    def test_chat_calls_gemini_and_logs_usage(self, mock_post):
        mock_response = Mock(status_code=200)
        mock_response.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "You are under your calorie target and close to your protein target."}
                        ]
                    }
                }
            ],
            "usageMetadata": {
                "promptTokenCount": 42,
                "candidatesTokenCount": 18,
                "totalTokenCount": 60,
            },
        }
        mock_post.return_value = mock_response

        response = self.client.post(
            "/api/insight-ai/chat/",
            {"message": "What should I focus on today?"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("calorie target", response.data["reply"])
        self.assertEqual(response.data["usage"]["total_tokens"], 60)
        self.assertEqual(InsightAIUsage.objects.count(), 1)
        usage = InsightAIUsage.objects.get()
        self.assertEqual(usage.status, InsightAIUsage.STATUS_SUCCESS)
        self.assertEqual(usage.provider, "gemini")
        self.assertEqual(usage.total_tokens, 60)
        mock_post.assert_called_once()
        self.assertEqual(mock_post.call_args.kwargs["headers"]["x-goog-api-key"], "test-key")

    @override_settings(
        INSIGHT_AI_PROVIDER="openai",
        INSIGHT_AI_OPENAI_API_KEY="test-openai-key",
        INSIGHT_AI_OPENAI_MODEL="gpt-test",
        INSIGHT_AI_ALLOWED_EMAILS="nutrition-ai@example.com",
    )
    @patch("insight_ai.services.requests.post")
    def test_chat_calls_openai_and_logs_usage(self, mock_post):
        mock_response = Mock(status_code=200)
        mock_response.json.return_value = {
            "output": [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": "Add Greek yogurt or chicken breast to hit your protein target.",
                        }
                    ],
                }
            ],
            "usage": {
                "input_tokens": 50,
                "output_tokens": 15,
                "total_tokens": 65,
            },
        }
        mock_post.return_value = mock_response

        response = self.client.post(
            "/api/insight-ai/chat/",
            {"message": "What should I eat next to hit protein?"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["provider"], "openai")
        self.assertIn("Greek yogurt", response.data["reply"])
        self.assertIsNone(response.data["pending_action"])
        self.assertEqual(response.data["usage"]["total_tokens"], 65)
        self.assertEqual(InsightAIUsage.objects.count(), 1)
        usage = InsightAIUsage.objects.get()
        self.assertEqual(usage.provider, "openai")
        self.assertEqual(usage.model, "gpt-test")
        self.assertEqual(usage.total_tokens, 65)
        mock_post.assert_called_once()
        self.assertEqual(mock_post.call_args.args[0], "https://api.openai.com/v1/responses")
        self.assertEqual(mock_post.call_args.kwargs["headers"]["Authorization"], "Bearer test-openai-key")
        self.assertEqual(mock_post.call_args.kwargs["json"]["model"], "gpt-test")
        self.assertEqual(mock_post.call_args.kwargs["json"]["text"]["format"]["type"], "json_schema")

    @override_settings(
        INSIGHT_AI_PROVIDER="openai",
        INSIGHT_AI_OPENAI_API_KEY="test-openai-key",
        INSIGHT_AI_OPENAI_MODEL="gpt-test",
        INSIGHT_AI_ALLOWED_EMAILS="nutrition-ai@example.com",
    )
    @patch("insight_ai.services.requests.post")
    def test_chat_creates_pending_log_meal_action_from_structured_output(self, mock_post):
        mock_response = Mock(status_code=200)
        mock_response.json.return_value = {
            "output": [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": (
                                '{"reply":"I prepared this for review.","action_type":"log_meal",'
                                '"action_summary":"Log 200g chicken breast to breakfast today.",'
                                '"meal_payload":{"entry_date":"2026-05-31","meal_type":"breakfast",'
                                '"food_name":"chicken breast","brand_name":"","quantity":200,"unit":"g",'
                                '"calories":330,"protein_grams":62,"carbs_grams":0,"fat_grams":7,'
                                '"fiber_grams":0,"sugar_grams":0,"sodium_mg":120}}'
                            ),
                        }
                    ],
                }
            ],
            "usage": {
                "input_tokens": 75,
                "output_tokens": 45,
                "total_tokens": 120,
            },
        }
        mock_post.return_value = mock_response

        response = self.client.post(
            "/api/insight-ai/chat/",
            {"message": "Log 200g chicken breast for breakfast today."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["reply"], "I prepared this for review.")
        self.assertEqual(MealEntry.objects.count(), 0)
        self.assertEqual(InsightAIAction.objects.count(), 1)
        action = InsightAIAction.objects.get()
        self.assertEqual(action.status, InsightAIAction.STATUS_PENDING)
        self.assertEqual(action.payload["food_name"], "chicken breast")
        self.assertEqual(response.data["pending_action"]["id"], action.id)

    @override_settings(
        INSIGHT_AI_PROVIDER="openai",
        INSIGHT_AI_OPENAI_API_KEY="test-openai-key",
        INSIGHT_AI_OPENAI_MODEL="gpt-test",
        INSIGHT_AI_ALLOWED_EMAILS="nutrition-ai@example.com",
    )
    @patch("insight_ai.services.requests.post")
    def test_chat_uses_local_today_when_model_returns_wrong_year(self, mock_post):
        mock_response = Mock(status_code=200)
        mock_response.json.return_value = {
            "output": [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": (
                                '{"reply":"Sure, I prepared that for review.","action_type":"log_meal",'
                                '"action_summary":"Log 50g rice to dinner today.",'
                                '"meal_payload":{"entry_date":"2023-05-31","meal_type":"dinner",'
                                '"food_name":"rice","brand_name":"","quantity":50,"unit":"g",'
                                '"calories":65,"protein_grams":1.3,"carbs_grams":14.8,"fat_grams":0.1,'
                                '"fiber_grams":0.3,"sugar_grams":0.1,"sodium_mg":1}}'
                            ),
                        }
                    ],
                }
            ],
            "usage": {
                "input_tokens": 75,
                "output_tokens": 45,
                "total_tokens": 120,
            },
        }
        mock_post.return_value = mock_response

        response = self.client.post(
            "/api/insight-ai/chat/",
            {"message": "Can you put in 50 grams of rice for me for dinner today?"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        action = InsightAIAction.objects.get()
        self.assertEqual(action.payload["entry_date"], timezone.localdate().isoformat())
        self.assertEqual(action.payload["meal_type"], "dinner")
        self.assertEqual(action.payload["food_name"], "rice")

    @override_settings(
        INSIGHT_AI_PROVIDER="openai",
        INSIGHT_AI_OPENAI_API_KEY="test-openai-key",
        INSIGHT_AI_OPENAI_MODEL="gpt-test",
        INSIGHT_AI_ALLOWED_EMAILS="nutrition-ai@example.com",
    )
    @patch("insight_ai.services.requests.post")
    def test_chat_falls_back_to_local_log_meal_parser(self, mock_post):
        mock_response = Mock(status_code=200)
        mock_response.json.return_value = {
            "output": [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": (
                                '{"reply":"Please confirm your preferred brand.",'
                                '"action_type":"none","action_summary":"",'
                                '"meal_payload":{"entry_date":"2026-05-31","meal_type":"breakfast",'
                                '"food_name":"","brand_name":"","quantity":0,"unit":"g",'
                                '"calories":0,"protein_grams":0,"carbs_grams":0,"fat_grams":0,'
                                '"fiber_grams":0,"sugar_grams":0,"sodium_mg":0}}'
                            ),
                        }
                    ],
                }
            ],
            "usage": {
                "input_tokens": 75,
                "output_tokens": 20,
                "total_tokens": 95,
            },
        }
        mock_post.return_value = mock_response

        response = self.client.post(
            "/api/insight-ai/chat/",
            {"message": "Log 200g chicken breast for breakfast today"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["reply"], "I prepared this for review using a generic nutrition estimate.")
        self.assertEqual(InsightAIAction.objects.count(), 1)
        action = InsightAIAction.objects.get()
        self.assertEqual(action.payload["food_name"], "chicken breast")
        self.assertEqual(action.payload["calories"], 330)
        self.assertEqual(action.payload["protein_grams"], 62)
        self.assertEqual(response.data["pending_action"]["id"], action.id)

    @override_settings(
        INSIGHT_AI_PROVIDER="openai",
        INSIGHT_AI_OPENAI_API_KEY="test-openai-key",
        INSIGHT_AI_OPENAI_MODEL="gpt-test",
        INSIGHT_AI_ALLOWED_EMAILS="nutrition-ai@example.com",
    )
    @patch("insight_ai.services.requests.post")
    def test_chat_creates_pending_log_meal_action(self, mock_post):
        mock_response = Mock(status_code=200)
        mock_response.json.return_value = {
            "output": [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": (
                                '{"reply":"I prepared this meal for review.",'
                                '"action":{"type":"log_meal","summary":"Log 200g chicken breast to breakfast.",'
                                '"payload":{"entry_date":"2026-05-31","meal_type":"breakfast",'
                                '"food_name":"chicken breast","quantity":200,"unit":"g",'
                                '"calories":330,"protein_grams":62,"carbs_grams":0,"fat_grams":7}}}'
                            ),
                        }
                    ],
                }
            ],
            "usage": {
                "input_tokens": 75,
                "output_tokens": 45,
                "total_tokens": 120,
            },
        }
        mock_post.return_value = mock_response

        response = self.client.post(
            "/api/insight-ai/chat/",
            {"message": "Log 200g chicken breast for breakfast."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["reply"], "I prepared this meal for review.")
        self.assertEqual(MealEntry.objects.count(), 0)
        self.assertEqual(InsightAIAction.objects.count(), 1)
        action = InsightAIAction.objects.get()
        self.assertEqual(action.status, InsightAIAction.STATUS_PENDING)
        self.assertEqual(action.action_type, InsightAIAction.TYPE_LOG_MEAL)
        self.assertEqual(action.payload["meal_type"], "breakfast")
        self.assertEqual(action.payload["quantity"], 200)
        self.assertEqual(response.data["pending_action"]["id"], action.id)

    @override_settings(
        INSIGHT_AI_ALLOWED_EMAILS="nutrition-ai@example.com",
    )
    def test_confirm_pending_log_meal_action_creates_entry(self):
        action = InsightAIAction.objects.create(
            user=self.user,
            action_type=InsightAIAction.TYPE_LOG_MEAL,
            summary="Log 200g chicken breast to breakfast.",
            payload={
                "entry_date": "2026-05-31",
                "meal_type": "breakfast",
                "food_name": "chicken breast",
                "quantity": 200,
                "unit": "g",
                "calories": 330,
                "protein_grams": 62,
                "carbs_grams": 0,
                "fat_grams": 7,
                "fiber_grams": 0,
                "sugar_grams": 0,
                "sodium_mg": 120,
            },
            expires_at=timezone.now() + timedelta(hours=1),
        )

        response = self.client.post(f"/api/insight-ai/actions/{action.id}/confirm/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        action.refresh_from_db()
        self.assertEqual(action.status, InsightAIAction.STATUS_CONFIRMED)
        self.assertEqual(MealEntry.objects.count(), 1)
        entry = MealEntry.objects.get()
        self.assertEqual(entry.food_name, "chicken breast")
        self.assertEqual(entry.meal_type, "breakfast")
        self.assertEqual(entry.serving_description, "g")
        self.assertEqual(entry.servings, 200)
        self.assertEqual(entry.grams_per_unit, 1.0)
        self.assertEqual(entry.calories, 330)
        self.assertEqual(entry.protein_grams, 62)
        self.assertEqual(response.data["action"]["result_payload"]["entry"]["id"], entry.id)

    @override_settings(
        INSIGHT_AI_ALLOWED_EMAILS="nutrition-ai@example.com",
    )
    def test_cancel_pending_action_does_not_create_entry(self):
        action = InsightAIAction.objects.create(
            user=self.user,
            action_type=InsightAIAction.TYPE_LOG_MEAL,
            summary="Log 200g chicken breast to breakfast.",
            payload={
                "entry_date": "2026-05-31",
                "meal_type": "breakfast",
                "food_name": "chicken breast",
                "quantity": 200,
                "unit": "g",
                "calories": 330,
                "protein_grams": 62,
                "carbs_grams": 0,
                "fat_grams": 7,
            },
            expires_at=timezone.now() + timedelta(hours=1),
        )

        response = self.client.post(f"/api/insight-ai/actions/{action.id}/cancel/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        action.refresh_from_db()
        self.assertEqual(action.status, InsightAIAction.STATUS_CANCELLED)
        self.assertEqual(MealEntry.objects.count(), 0)

    @override_settings(
        INSIGHT_AI_ALLOWED_EMAILS="nutrition-ai@example.com",
    )
    def test_user_cannot_confirm_another_users_pending_action(self):
        User = get_user_model()
        other_user = User.objects.create_user(
            username="other-ai-user",
            email="other-ai@example.com",
            password="password123",
        )
        action = InsightAIAction.objects.create(
            user=other_user,
            action_type=InsightAIAction.TYPE_LOG_MEAL,
            summary="Log 200g chicken breast to breakfast.",
            payload={
                "entry_date": "2026-05-31",
                "meal_type": "breakfast",
                "food_name": "chicken breast",
                "quantity": 200,
                "unit": "g",
            },
            expires_at=timezone.now() + timedelta(hours=1),
        )

        response = self.client.post(f"/api/insight-ai/actions/{action.id}/confirm/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(MealEntry.objects.count(), 0)

    @override_settings(
        INSIGHT_AI_PROVIDER="gemini",
        INSIGHT_AI_GEMINI_API_KEY="test-key",
        INSIGHT_AI_ALLOWED_EMAILS="nutrition-ai@example.com",
        INSIGHT_AI_MONTHLY_MESSAGE_LIMIT=1,
    )
    def test_chat_enforces_monthly_message_limit(self):
        InsightAIUsage.objects.create(
            user=self.user,
            model="gemini-test",
            status=InsightAIUsage.STATUS_SUCCESS,
            total_tokens=10,
        )

        response = self.client.post(
            "/api/insight-ai/chat/",
            {"message": "Can I ask another question?"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("limit", response.data["detail"])
