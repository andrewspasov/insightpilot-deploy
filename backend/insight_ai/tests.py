from __future__ import annotations

from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from billing.models import AccessPass, Customer, Subscription, SubscriptionItem, Tool
from .models import InsightAIUsage


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
