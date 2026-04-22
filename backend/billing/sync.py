from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Iterable

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import AccessPass, BillingEvent, Customer, Order, Subscription, SubscriptionItem, Tool


STRIPE_STATUS_MAP = {
    "active": Subscription.STATUS_ACTIVE,
    "trialing": Subscription.STATUS_ACTIVE,
    "past_due": Subscription.STATUS_ON_HOLD,
    "unpaid": Subscription.STATUS_ON_HOLD,
    "incomplete": Subscription.STATUS_PENDING,
    "incomplete_expired": Subscription.STATUS_PENDING,
    "canceled": Subscription.STATUS_CANCELED,
}


def _ts_to_dt(value) -> datetime | None:
    if not value:
        return None
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, tz=dt_timezone.utc)
        if isinstance(value, datetime):
            if timezone.is_naive(value):
                return value.replace(tzinfo=dt_timezone.utc)
            return value.astimezone(dt_timezone.utc)
        if isinstance(value, str):
            try:
                return datetime.fromtimestamp(float(value), tz=dt_timezone.utc)
            except ValueError:
                iso_value = value.replace("Z", "+00:00")
                parsed = datetime.fromisoformat(iso_value)
                if timezone.is_naive(parsed):
                    return parsed.replace(tzinfo=dt_timezone.utc)
                return parsed.astimezone(dt_timezone.utc)
        return None
    except Exception:
        return None


def _get_value(data, key):
    if hasattr(data, "get"):
        return data.get(key)
    return getattr(data, key, None)


def _get_period_from_payload(data) -> tuple[datetime | None, datetime | None]:
    start = _get_value(data, "current_period_start")
    end = _get_value(data, "current_period_end")
    if start or end:
        return _ts_to_dt(start), _ts_to_dt(end)

    current_period = _get_value(data, "current_period")
    if isinstance(current_period, dict):
        return _ts_to_dt(current_period.get("start")), _ts_to_dt(current_period.get("end"))

    items_obj = _get_value(data, "items")
    items: list = []
    if items_obj is not None:
        if hasattr(items_obj, "data"):
            items = items_obj.data or []
        elif isinstance(items_obj, dict):
            items = items_obj.get("data", []) or []
        elif isinstance(items_obj, list):
            items = items_obj
    if isinstance(items, list) and items:
        starts: list[datetime] = []
        ends: list[datetime] = []
        for item in items:
            start_dt = _ts_to_dt(_get_value(item, "current_period_start"))
            end_dt = _ts_to_dt(_get_value(item, "current_period_end"))
            if start_dt:
                starts.append(start_dt)
            if end_dt:
                ends.append(end_dt)
        if starts or ends:
            return (min(starts) if starts else None), (max(ends) if ends else None)

    latest_invoice = _get_value(data, "latest_invoice")
    lines_obj = None
    if latest_invoice is not None:
        if hasattr(latest_invoice, "lines"):
            lines_obj = latest_invoice.lines
        elif isinstance(latest_invoice, dict):
            lines_obj = latest_invoice.get("lines")
    lines: list = []
    if lines_obj is not None:
        if hasattr(lines_obj, "data"):
            lines = lines_obj.data or []
        elif isinstance(lines_obj, dict):
            lines = lines_obj.get("data", []) or []
        elif isinstance(lines_obj, list):
            lines = lines_obj
    if lines:
        starts: list[datetime] = []
        ends: list[datetime] = []
        for line in lines:
            period = _get_value(line, "period") or {}
            start_dt = _ts_to_dt(period.get("start"))
            end_dt = _ts_to_dt(period.get("end"))
            if start_dt:
                starts.append(start_dt)
            if end_dt:
                ends.append(end_dt)
        if starts or ends:
            return (min(starts) if starts else None), (max(ends) if ends else None)

    return None, None


def _extract_price_ids(data) -> list[str]:
    items = (data.get("items") or {}).get("data", []) if isinstance(data, dict) else []
    price_ids: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        price = item.get("price") or {}
        if isinstance(price, dict):
            price_id = price.get("id")
        else:
            price_id = price
        if price_id:
            price_ids.append(str(price_id))
    return price_ids


def _map_price_to_pass(price_ids: list[str]) -> tuple[AccessPass | None, str]:
    if not price_ids:
        return None, ""
    passes_by_price = {
        p.stripe_price_id: p
        for p in AccessPass.objects.filter(stripe_price_id__in=price_ids)
    }
    for price_id in price_ids:
        access_pass = passes_by_price.get(price_id)
        if access_pass:
            return access_pass, price_id
    return None, price_ids[0]


def _fallback_pass_for_selected_tool_count(selected_count: int) -> AccessPass | None:
    if selected_count <= 1:
        key = AccessPass.KEY_BRONZE
    elif selected_count == 2:
        key = AccessPass.KEY_SILVER
    elif selected_count == 3:
        key = AccessPass.KEY_GOLD
    else:
        key = AccessPass.KEY_PLATINUM
    return AccessPass.objects.filter(key=key).first()


def _scheduled_change_due(subscription: Subscription) -> bool:
    if not subscription.scheduled_access_pass_id or not subscription.scheduled_change_effective_at:
        return False
    now = timezone.now()
    if now >= subscription.scheduled_change_effective_at:
        return True
    if (
        subscription.current_period_start
        and subscription.current_period_start >= subscription.scheduled_change_effective_at
    ):
        return True
    return False


def set_selected_tools(subscription: Subscription, tools: Iterable[Tool | str]) -> None:
    normalized_tools: list[Tool] = []
    for tool in tools:
        if isinstance(tool, Tool):
            normalized_tools.append(tool)
        else:
            found = Tool.objects.filter(key=str(tool)).first()
            if found:
                normalized_tools.append(found)

    if subscription.access_pass and len(normalized_tools) > subscription.access_pass.tool_limit:
        raise ValueError(
            f"Selected {len(normalized_tools)} tools but pass allows only "
            f"{subscription.access_pass.tool_limit}."
        )

    existing_by_tool_id = {
        item.tool_id: item for item in SubscriptionItem.objects.filter(subscription=subscription)
    }
    selected_tool_ids = {tool.id for tool in normalized_tools}

    for tool in normalized_tools:
        item = existing_by_tool_id.get(tool.id)
        if item:
            if item.stripe_price_id != (tool.stripe_price_id or ""):
                item.stripe_price_id = tool.stripe_price_id or ""
                item.save(update_fields=["stripe_price_id", "updated_at"])
            continue
        SubscriptionItem.objects.create(
            subscription=subscription,
            tool=tool,
            stripe_subscription_item_id=None,
            stripe_price_id=tool.stripe_price_id or "",
        )

    SubscriptionItem.objects.filter(subscription=subscription).exclude(
        tool_id__in=selected_tool_ids
    ).delete()


def _apply_due_scheduled_change(subscription: Subscription) -> None:
    if not _scheduled_change_due(subscription):
        return
    subscription.access_pass = subscription.scheduled_access_pass
    scheduled_keys = subscription.scheduled_tool_keys or []
    if scheduled_keys:
        tools = list(Tool.objects.filter(key__in=scheduled_keys, is_active=True))
        set_selected_tools(subscription, tools)
    subscription.scheduled_access_pass = None
    subscription.scheduled_change_effective_at = None
    subscription.scheduled_tool_keys = []
    subscription.save(
        update_fields=[
            "access_pass",
            "scheduled_access_pass",
            "scheduled_change_effective_at",
            "scheduled_tool_keys",
            "updated_at",
        ]
    )


def sync_subscription_from_stripe(stripe_subscription, source: str = "stripe") -> Subscription | None:
    data = stripe_subscription.to_dict() if hasattr(stripe_subscription, "to_dict") else stripe_subscription
    stripe_subscription_id = data.get("id")
    stripe_customer_id = data.get("customer")

    customer = Customer.objects.filter(stripe_customer_id=stripe_customer_id).first()
    if not customer:
        User = get_user_model()
        user = User.objects.filter(stripe_customer_id=stripe_customer_id).first()
        if not user:
            BillingEvent.objects.create(
                event_type="subscription.unlinked",
                source=source,
                payload={"subscription_id": stripe_subscription_id, "customer_id": stripe_customer_id},
            )
            return None
        customer = Customer.objects.create(user=user, stripe_customer_id=stripe_customer_id)

    user = customer.user
    if getattr(user, "stripe_customer_id", None) != stripe_customer_id:
        user.stripe_customer_id = stripe_customer_id
        user.save(update_fields=["stripe_customer_id"])

    subscription, _created = Subscription.objects.get_or_create(
        stripe_subscription_id=stripe_subscription_id,
        defaults={
            "user": user,
            "customer": customer,
        },
    )

    stripe_status = data.get("status")
    mapped_status = STRIPE_STATUS_MAP.get(stripe_status, Subscription.STATUS_PENDING)

    subscription.user = user
    subscription.customer = customer
    subscription.status = mapped_status

    raw_start = getattr(stripe_subscription, "current_period_start", None)
    raw_end = getattr(stripe_subscription, "current_period_end", None)
    period_start = _ts_to_dt(raw_start) if raw_start else None
    period_end = _ts_to_dt(raw_end) if raw_end else None
    if not period_start or not period_end:
        alt_start, alt_end = _get_period_from_payload(data)
        period_start = period_start or alt_start
        period_end = period_end or alt_end
    if period_start:
        subscription.current_period_start = period_start
    if period_end:
        subscription.current_period_end = period_end

    subscription.canceled_at = _ts_to_dt(data.get("canceled_at"))
    subscription.cancel_at = _ts_to_dt(data.get("cancel_at"))

    if mapped_status == Subscription.STATUS_ON_HOLD:
        if not subscription.grace_until or subscription.grace_until < timezone.now():
            grace_days = getattr(settings, "STRIPE_GRACE_DAYS", 7)
            subscription.grace_until = timezone.now() + timedelta(days=grace_days)
    else:
        subscription.grace_until = None

    price_ids = _extract_price_ids(data)
    detected_pass, matched_price_id = _map_price_to_pass(price_ids)
    if detected_pass:
        keep_current_until_due = (
            subscription.scheduled_access_pass_id
            and subscription.scheduled_change_effective_at
            and subscription.scheduled_access_pass_id == detected_pass.id
            and subscription.access_pass_id
            and subscription.access_pass_id != detected_pass.id
            and not _scheduled_change_due(subscription)
        )
        if not keep_current_until_due:
            subscription.access_pass = detected_pass
    else:
        selected_count = SubscriptionItem.objects.filter(subscription=subscription).count()
        fallback_pass = _fallback_pass_for_selected_tool_count(selected_count)
        if fallback_pass and not subscription.access_pass_id:
            subscription.access_pass = fallback_pass
        if matched_price_id:
            BillingEvent.objects.create(
                event_type="subscription.unknown_pass_price",
                source=source,
                payload={
                    "subscription_id": stripe_subscription_id,
                    "price_id": matched_price_id,
                },
                subscription=subscription,
                customer=customer,
            )

    subscription.save()
    _apply_due_scheduled_change(subscription)
    return subscription


def sync_order_from_stripe_invoice(
    stripe_invoice,
    source: str = "stripe",
    fallback_subscription: Subscription | None = None,
) -> Order | None:
    data = stripe_invoice.to_dict() if hasattr(stripe_invoice, "to_dict") else stripe_invoice
    if not isinstance(data, dict):
        return None

    stripe_invoice_id = data.get("id")
    if not stripe_invoice_id:
        return None

    stripe_subscription_id = data.get("subscription")
    stripe_customer_id = data.get("customer")

    subscription = None
    if stripe_subscription_id:
        subscription = Subscription.objects.filter(stripe_subscription_id=stripe_subscription_id).first()
    if not subscription:
        subscription = fallback_subscription

    customer = None
    if stripe_customer_id:
        customer = Customer.objects.filter(stripe_customer_id=stripe_customer_id).first()
    if not customer and subscription:
        customer = subscription.customer

    order, _ = Order.objects.get_or_create(
        stripe_invoice_id=stripe_invoice_id,
        defaults={
            "subscription": subscription,
            "customer": customer,
        },
    )

    status = str(data.get("status") or "").strip() or Order.STATUS_DRAFT
    status_values = {choice[0] for choice in Order.STATUS_CHOICES}
    if status not in status_values:
        status = Order.STATUS_OPEN

    due_date = _ts_to_dt(data.get("due_date"))
    paid_at = None
    status_transitions = data.get("status_transitions") or {}
    if isinstance(status_transitions, dict):
        paid_at = _ts_to_dt(status_transitions.get("paid_at"))

    period_start = _ts_to_dt(data.get("period_start"))
    period_end = _ts_to_dt(data.get("period_end"))
    lines = (data.get("lines") or {}).get("data", [])
    if isinstance(lines, list) and lines:
        starts: list[datetime] = []
        ends: list[datetime] = []
        for line in lines:
            if not isinstance(line, dict):
                continue
            period = line.get("period") or {}
            if not isinstance(period, dict):
                continue
            start_dt = _ts_to_dt(period.get("start"))
            end_dt = _ts_to_dt(period.get("end"))
            if start_dt:
                starts.append(start_dt)
            if end_dt:
                ends.append(end_dt)
        if starts:
            period_start = min(starts)
        if ends:
            period_end = max(ends)

    payment_intent = data.get("payment_intent")
    if isinstance(payment_intent, dict):
        payment_intent_id = payment_intent.get("id") or ""
    else:
        payment_intent_id = payment_intent or ""

    order.subscription = subscription
    order.customer = customer
    order.status = status
    order.invoice_number = data.get("number") or ""
    order.currency = data.get("currency") or ""
    order.amount_due_cents = int(data.get("amount_due") or 0)
    order.amount_paid_cents = int(data.get("amount_paid") or 0)
    order.amount_remaining_cents = int(data.get("amount_remaining") or 0)
    order.billing_reason = data.get("billing_reason") or ""
    order.hosted_invoice_url = data.get("hosted_invoice_url") or ""
    order.invoice_pdf_url = data.get("invoice_pdf") or ""
    order.stripe_payment_intent_id = str(payment_intent_id)
    order.stripe_charge_id = str(data.get("charge") or "")
    order.period_start = period_start
    order.period_end = period_end
    order.due_date = due_date
    order.paid_at = paid_at
    order.stripe_created_at = _ts_to_dt(data.get("created"))
    order.payload = data
    order.save()

    if not subscription and stripe_subscription_id:
        BillingEvent.objects.create(
            event_type="order.unlinked_subscription",
            source=source,
            payload={
                "invoice_id": stripe_invoice_id,
                "subscription_id": stripe_subscription_id,
                "customer_id": stripe_customer_id,
            },
            customer=customer,
        )

    return order
