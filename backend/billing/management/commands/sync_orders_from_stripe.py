from __future__ import annotations

from django.core.management.base import BaseCommand

from billing import stripe_service, sync
from billing.models import Subscription


class Command(BaseCommand):
    help = "Backfill local billing orders from Stripe invoices."

    def add_arguments(self, parser):
        parser.add_argument(
            "--subscription",
            dest="subscription_id",
            default="",
            help="Optional Stripe subscription id to sync only one subscription.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=100,
            help="Max invoices per subscription to fetch (default: 100).",
        )

    def handle(self, *args, **options):
        stripe_subscription_id = (options.get("subscription_id") or "").strip()
        limit = int(options.get("limit") or 100)

        subs = Subscription.objects.exclude(stripe_subscription_id="")
        if stripe_subscription_id:
            subs = subs.filter(stripe_subscription_id=stripe_subscription_id)

        total_invoices = 0
        total_synced = 0

        for subscription in subs:
            invoices = stripe_service.list_invoices_for_subscription(
                subscription.stripe_subscription_id,
                limit=limit,
            )
            self.stdout.write(
                f"{subscription.stripe_subscription_id}: fetched {len(invoices)} invoice(s)"
            )
            total_invoices += len(invoices)
            for invoice in invoices:
                order = sync.sync_order_from_stripe_invoice(
                    invoice,
                    source="system",
                    fallback_subscription=subscription,
                )
                if order:
                    total_synced += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Synced {total_synced} order record(s) from {total_invoices} Stripe invoice(s)."
            )
        )
