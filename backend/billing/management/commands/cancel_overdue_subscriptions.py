from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone

from billing import stripe_service
from billing.models import BillingEvent, Subscription, SubscriptionNote
from billing.permissions import grace_expired
from billing.sync import sync_subscription_from_stripe


class Command(BaseCommand):
    help = "Cancel subscriptions that exceeded the grace period."

    def handle(self, *args, **options):
        now = timezone.now()
        overdue = Subscription.objects.filter(
            status=Subscription.STATUS_ON_HOLD,
            grace_until__isnull=False,
            grace_until__lt=now,
        )
        canceled = 0
        for subscription in overdue:
            if not grace_expired(subscription):
                continue
            stripe_subscription = stripe_service.cancel_subscription(subscription.stripe_subscription_id)
            sync_subscription_from_stripe(stripe_subscription, source="system")
            BillingEvent.objects.create(
                event_type="subscription.auto_canceled",
                source=BillingEvent.SOURCE_SYSTEM,
                payload={"subscription_id": subscription.stripe_subscription_id},
                subscription=subscription,
                customer=subscription.customer,
            )
            SubscriptionNote.objects.create(
                subscription=subscription,
                author_type=SubscriptionNote.AUTHOR_SYSTEM,
                category=SubscriptionNote.CATEGORY_STATUS,
                note="Subscription auto-canceled after grace period.",
            )
            canceled += 1

        self.stdout.write(self.style.SUCCESS(f"Canceled {canceled} subscription(s)."))
