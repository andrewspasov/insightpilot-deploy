from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from billing.models import AccessPass, Customer, Subscription


class CreateSubscriptionViewTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="billing-user",
            email="billing-user@example.com",
            password="password123",
        )
        self.client.force_authenticate(self.user)
        self.access_pass, _ = AccessPass.objects.update_or_create(
            key=AccessPass.KEY_BRONZE,
            defaults={
                "name": "Bronze Access Pass",
                "monthly_price_cents": 10000,
                "tool_limit": 1,
                "stripe_price_id": "price_bronze_test",
                "is_active": True,
            },
        )

    @patch("billing.views._sync_latest_invoice_order")
    @patch("billing.views._summary_payload")
    @patch("billing.views.sync.sync_subscription_from_stripe")
    @patch("billing.views.stripe_service.create_subscription")
    @patch("billing.views._get_or_create_customer_for_user")
    def test_create_subscription_returns_payment_url(
        self,
        mock_get_customer,
        mock_create_subscription,
        mock_sync_subscription,
        mock_summary_payload,
        mock_sync_invoice,
    ):
        customer = Customer.objects.create(user=self.user, stripe_customer_id="cus_test_123")
        mock_get_customer.return_value = customer
        mock_summary_payload.return_value = {"status": "pending"}

        latest_invoice = SimpleNamespace(
            hosted_invoice_url="https://stripe.test/invoice",
            payment_intent=SimpleNamespace(status="requires_payment_method"),
        )
        mock_create_subscription.return_value = SimpleNamespace(latest_invoice=latest_invoice)
        mock_sync_subscription.return_value = SimpleNamespace(
            access_pass_id=self.access_pass.id,
            access_pass=self.access_pass,
        )

        response = self.client.post(
            "/api/billing/create-subscription/",
            {"target_pass_key": self.access_pass.key},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "pending_payment")
        self.assertTrue(response.data["payment_action_required"])
        self.assertEqual(response.data["payment_url"], "https://stripe.test/invoice")
        mock_sync_invoice.assert_called_once()

    def test_create_subscription_rejects_existing_active_subscription(self):
        customer = Customer.objects.create(user=self.user, stripe_customer_id="cus_active_123")
        Subscription.objects.create(
            user=self.user,
            customer=customer,
            stripe_subscription_id="sub_active_123",
            status=Subscription.STATUS_ACTIVE,
            access_pass=self.access_pass,
        )

        response = self.client.post(
            "/api/billing/create-subscription/",
            {"target_pass_key": self.access_pass.key},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("already have a subscription", response.data["detail"])
