from __future__ import annotations

from django.conf import settings

try:
    import stripe
except ModuleNotFoundError:  # pragma: no cover - handled at runtime
    stripe = None


def _init_stripe() -> None:
    if stripe is None:
        raise RuntimeError("stripe package is not installed")
    secret_key = getattr(settings, "STRIPE_SECRET_KEY", "").strip()
    if not secret_key:
        raise RuntimeError("STRIPE_SECRET_KEY is not configured")
    stripe.api_key = secret_key


def create_customer(user):
    _init_stripe()
    return stripe.Customer.create(
        email=user.email,
        name=(user.get_full_name() or user.username),
        metadata={"user_id": str(user.id)},
    )


def retrieve_customer(customer_id: str):
    _init_stripe()
    return stripe.Customer.retrieve(customer_id)


def create_subscription(customer_id: str, pass_price_id: str, metadata: dict | None = None):
    _init_stripe()
    return stripe.Subscription.create(
        customer=customer_id,
        items=[{"price": pass_price_id}],
        payment_behavior="default_incomplete",
        metadata=metadata or {},
        expand=["items.data.price", "latest_invoice.lines"],
    )


def _get_pass_item_id(stripe_subscription) -> str:
    data = stripe_subscription.to_dict() if hasattr(stripe_subscription, "to_dict") else stripe_subscription
    items = (data.get("items") or {}).get("data", [])
    if not items:
        raise RuntimeError("Stripe subscription has no items.")
    return items[0].get("id")


def change_subscription_pass_immediate(subscription_id: str, target_price_id: str):
    _init_stripe()
    stripe_subscription = retrieve_subscription(subscription_id)
    subscription_item_id = _get_pass_item_id(stripe_subscription)
    updated = stripe.Subscription.modify(
        subscription_id,
        items=[{"id": subscription_item_id, "price": target_price_id}],
        proration_behavior="always_invoice",
        payment_behavior="pending_if_incomplete",
        expand=["items.data.price", "latest_invoice.lines", "latest_invoice.payment_intent"],
    )
    latest_invoice = getattr(updated, "latest_invoice", None)
    hosted_invoice_url = None
    payment_intent_status = None
    if latest_invoice:
        hosted_invoice_url = getattr(latest_invoice, "hosted_invoice_url", None)
        payment_intent = getattr(latest_invoice, "payment_intent", None)
        payment_intent_status = getattr(payment_intent, "status", None) if payment_intent else None
    return updated, hosted_invoice_url, payment_intent_status


def schedule_subscription_pass_downgrade(subscription_id: str, target_price_id: str):
    _init_stripe()
    stripe_subscription = retrieve_subscription(subscription_id)
    subscription_item_id = _get_pass_item_id(stripe_subscription)
    return stripe.Subscription.modify(
        subscription_id,
        items=[{"id": subscription_item_id, "price": target_price_id}],
        proration_behavior="none",
        billing_cycle_anchor="unchanged",
        expand=["items.data.price", "latest_invoice.lines"],
    )


def cancel_subscription(subscription_id: str):
    _init_stripe()
    return stripe.Subscription.delete(subscription_id)


def retrieve_subscription(subscription_id: str):
    _init_stripe()
    return stripe.Subscription.retrieve(
        subscription_id,
        expand=["items.data.price", "latest_invoice.lines", "latest_invoice.payment_intent"],
    )


def retrieve_invoice(invoice_id: str):
    _init_stripe()
    return stripe.Invoice.retrieve(
        invoice_id,
        expand=["lines.data", "payment_intent"],
    )


def list_invoices_for_subscription(subscription_id: str, limit: int = 100):
    _init_stripe()
    invoices = stripe.Invoice.list(
        subscription=subscription_id,
        limit=limit,
        expand=["data.lines", "data.payment_intent"],
    )
    return list(getattr(invoices, "data", []) or [])


def migrate_subscription_to_single_price_item(subscription_id: str, target_price_id: str):
    _init_stripe()
    stripe_subscription = retrieve_subscription(subscription_id)
    data = stripe_subscription.to_dict() if hasattr(stripe_subscription, "to_dict") else stripe_subscription
    items = (data.get("items") or {}).get("data", [])
    if not items:
        raise RuntimeError("Subscription has no items to migrate.")

    primary_item_id = items[0]["id"]
    update_items = [{"id": primary_item_id, "price": target_price_id}]
    for item in items[1:]:
        update_items.append({"id": item["id"], "deleted": True})

    return stripe.Subscription.modify(
        subscription_id,
        items=update_items,
        proration_behavior="none",
        billing_cycle_anchor="unchanged",
        expand=["items.data.price", "latest_invoice.lines"],
    )
