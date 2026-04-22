from __future__ import annotations

from django.core.management.base import BaseCommand

from billing import stripe_service, sync
from billing.models import AccessPass, BillingEvent, Subscription, SubscriptionNote


class Command(BaseCommand):
    help = "Convert existing Stripe subscriptions from per-tool items to one access-pass price item."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply Stripe mutations. Default is dry-run.",
        )

    def _fallback_access_pass(self, subscription: Subscription) -> AccessPass | None:
        selected_count = subscription.items.count()
        if selected_count <= 1:
            key = AccessPass.KEY_BRONZE
        elif selected_count == 2:
            key = AccessPass.KEY_SILVER
        elif selected_count == 3:
            key = AccessPass.KEY_GOLD
        else:
            key = AccessPass.KEY_PLATINUM
        return AccessPass.objects.filter(key=key).first()

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        subs = Subscription.objects.exclude(stripe_subscription_id="").select_related("access_pass")
        total = subs.count()
        migrated = 0
        skipped = 0
        failed = 0

        for subscription in subs:
            access_pass = subscription.access_pass or self._fallback_access_pass(subscription)
            if not access_pass:
                self.stdout.write(
                    self.style.WARNING(
                        f"[skip] {subscription.stripe_subscription_id}: no access pass."
                    )
                )
                skipped += 1
                continue
            if not access_pass.stripe_price_id:
                self.stdout.write(
                    self.style.WARNING(
                        f"[skip] {subscription.stripe_subscription_id}: pass '{access_pass.key}' missing stripe_price_id."
                    )
                )
                skipped += 1
                continue

            try:
                stripe_subscription = stripe_service.retrieve_subscription(subscription.stripe_subscription_id)
                payload = (
                    stripe_subscription.to_dict()
                    if hasattr(stripe_subscription, "to_dict")
                    else stripe_subscription
                )
                items = (payload.get("items") or {}).get("data", [])
                item_price_ids = []
                for item in items:
                    price = item.get("price") if isinstance(item, dict) else {}
                    price_id = price.get("id") if isinstance(price, dict) else None
                    if price_id:
                        item_price_ids.append(price_id)

                already_migrated = len(items) == 1 and access_pass.stripe_price_id in item_price_ids
                if already_migrated:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"[ok] {subscription.stripe_subscription_id}: already on pass '{access_pass.key}'."
                        )
                    )
                    skipped += 1
                    continue

                if not apply_changes:
                    self.stdout.write(
                        self.style.WARNING(
                            f"[dry-run] {subscription.stripe_subscription_id}: {len(items)} item(s) -> pass '{access_pass.key}' ({access_pass.stripe_price_id})."
                        )
                    )
                    continue

                updated = stripe_service.migrate_subscription_to_single_price_item(
                    subscription.stripe_subscription_id,
                    access_pass.stripe_price_id,
                )
                synced = sync.sync_subscription_from_stripe(updated, source="system")
                if synced and synced.access_pass_id != access_pass.id:
                    synced.access_pass = access_pass
                    synced.save(update_fields=["access_pass", "updated_at"])

                BillingEvent.objects.create(
                    event_type="subscription.migrated_to_access_pass",
                    source=BillingEvent.SOURCE_SYSTEM,
                    payload={
                        "subscription_id": subscription.stripe_subscription_id,
                        "target_pass": access_pass.key,
                        "target_price_id": access_pass.stripe_price_id,
                    },
                    subscription=synced or subscription,
                    customer=(synced.customer if synced else subscription.customer),
                )
                SubscriptionNote.objects.create(
                    subscription=synced or subscription,
                    author_type=SubscriptionNote.AUTHOR_SYSTEM,
                    category=SubscriptionNote.CATEGORY_INTERNAL,
                    note=f"Migrated Stripe subscription to access pass '{access_pass.name}'.",
                )

                migrated += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"[migrated] {subscription.stripe_subscription_id} -> {access_pass.key}"
                    )
                )
            except Exception as exc:  # noqa: BLE001
                failed += 1
                self.stdout.write(
                    self.style.ERROR(
                        f"[failed] {subscription.stripe_subscription_id}: {exc}"
                    )
                )

        mode = "apply" if apply_changes else "dry-run"
        self.stdout.write(
            self.style.SUCCESS(
                f"Done ({mode}). total={total}, migrated={migrated}, skipped={skipped}, failed={failed}"
            )
        )
