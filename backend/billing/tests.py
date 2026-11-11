from types import SimpleNamespace
from unittest.mock import patch

import stripe
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from billing.models import AccessPass, Customer, Order, Subscription


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


class PriceToPassMappingTests(APITestCase):
    def test_old_and_new_prices_both_map_to_the_pass(self):
        from billing.sync import _map_price_to_pass

        bronze, _ = AccessPass.objects.update_or_create(
            key=AccessPass.KEY_BRONZE,
            defaults={
                "name": "Bronze",
                "monthly_price_cents": 500,
                "tool_limit": 1,
                "stripe_price_id": "price_new",
                "previous_stripe_price_ids": ["price_old"],
            },
        )

        self.assertEqual(_map_price_to_pass(["price_new"]), (bronze, "price_new"))
        self.assertEqual(_map_price_to_pass(["price_old"]), (bronze, "price_old"))
        self.assertEqual(_map_price_to_pass(["price_unknown"]), (None, "price_unknown"))


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_test")
class StripeWebhookInvoiceTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="webhook-user",
            email="webhook-user@example.com",
            password="password123",
        )
        self.customer = Customer.objects.create(user=self.user, stripe_customer_id="cus_hook_123")
        self.subscription = Subscription.objects.create(
            user=self.user,
            customer=self.customer,
            stripe_subscription_id="sub_hook_123",
            status=Subscription.STATUS_PENDING,
        )

    @patch("billing.views.stripe_service.retrieve_subscription")
    @patch("billing.views.stripe.Webhook.construct_event")
    def test_invoice_paid_with_basil_payload_activates_subscription(self, mock_construct, mock_retrieve):
        # Snapshot payloads from API 2025-03-31.basil+ have no top-level invoice.subscription
        mock_construct.return_value = stripe.Event.construct_from(
            {
                "id": "evt_hook_123",
                "object": "event",
                "type": "invoice.paid",
                "data": {
                    "object": {
                        "id": "in_hook_123",
                        "object": "invoice",
                        "customer": "cus_hook_123",
                        "status": "paid",
                        "parent": {
                            "type": "subscription_details",
                            "subscription_details": {"subscription": "sub_hook_123"},
                        },
                    }
                },
            },
            "sk_test",
        )
        mock_retrieve.return_value = {
            "id": "sub_hook_123",
            "customer": "cus_hook_123",
            "status": "active",
            "items": {"data": []},
        }

        response = self.client.post(
            "/api/billing/stripe/webhook/",
            data="{}",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="t=1,v1=test",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_retrieve.assert_called_once_with("sub_hook_123")
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, Subscription.STATUS_ACTIVE)
        self.assertEqual(Order.objects.get(stripe_invoice_id="in_hook_123").subscription, self.subscription)
