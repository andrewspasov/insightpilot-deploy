from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.http import HttpRequest
from django.views.decorators.csrf import csrf_exempt
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

try:
    import stripe
except ModuleNotFoundError:  # pragma: no cover - handled at runtime
    stripe = None

from . import stripe_service, sync
from .models import AccessPass, BillingEvent, Customer, Order, Subscription, SubscriptionNote, Tool
from .permissions import get_current_subscription


def _serialize_pass(access_pass: AccessPass | None):
    if not access_pass:
        return None
    return {
        "key": access_pass.key,
        "name": access_pass.name,
        "tool_limit": access_pass.tool_limit,
        "monthly_price_cents": access_pass.monthly_price_cents,
    }


def _local_number(value: int | None) -> str:
    if value is None:
        return ""
    return str(value).zfill(5)


def _serialize_line_item(line: dict) -> dict:
    period = line.get("period") or {}
    return {
        "description": line.get("description") or "",
        "amount_cents": int(line.get("amount") or 0),
        "currency": line.get("currency") or "",
        "quantity": int(line.get("quantity") or 1),
        "period_start": sync._ts_to_dt(period.get("start")) if isinstance(period, dict) else None,
        "period_end": sync._ts_to_dt(period.get("end")) if isinstance(period, dict) else None,
    }


def _serialize_order(order: Order) -> dict:
    return {
        "id": order.id,
        "local_number": _local_number(order.id),
        "invoice_number": order.invoice_number,
        "stripe_invoice_id": order.stripe_invoice_id,
        "status": order.status,
        "currency": order.currency,
        "amount_due_cents": order.amount_due_cents,
        "amount_paid_cents": order.amount_paid_cents,
        "amount_remaining_cents": order.amount_remaining_cents,
        "stripe_created_at": order.stripe_created_at,
        "hosted_invoice_url": order.hosted_invoice_url,
        "invoice_pdf_url": order.invoice_pdf_url,
    }


def _serialize_order_detail(order: Order) -> dict:
    payload = order.payload or {}
    lines = (payload.get("lines") or {}).get("data", []) if isinstance(payload, dict) else []
    subscription = order.subscription
    access_pass = subscription.access_pass if subscription else None
    return {
        **_serialize_order(order),
        "billing_reason": order.billing_reason,
        "period_start": order.period_start,
        "period_end": order.period_end,
        "due_date": order.due_date,
        "paid_at": order.paid_at,
        "stripe_payment_intent_id": order.stripe_payment_intent_id,
        "stripe_charge_id": order.stripe_charge_id,
        "subscription": {
            "id": subscription.id,
            "local_number": _local_number(subscription.id),
            "status": subscription.effective_status,
            "access_pass": _serialize_pass(access_pass),
        }
        if subscription
        else None,
        "line_items": [
            _serialize_line_item(line)
            for line in lines
            if isinstance(line, dict)
        ],
    }


def _sync_latest_invoice_order(stripe_subscription, subscription: Subscription, source: str) -> None:
    latest_invoice = getattr(stripe_subscription, "latest_invoice", None)
    if not latest_invoice:
        return
    invoice_obj = latest_invoice
    if isinstance(latest_invoice, str):
        invoice_obj = stripe_service.retrieve_invoice(latest_invoice)
    sync.sync_order_from_stripe_invoice(
        invoice_obj,
        source=source,
        fallback_subscription=subscription,
    )


def _summary_payload(user) -> dict:
    subscription = get_current_subscription(user)
    customer = Customer.objects.filter(user=user).first()

    status_value = subscription.effective_status if subscription else Subscription.STATUS_CANCELED
    read_only = subscription.is_read_only if subscription else False
    selected_keys = set()
    if subscription:
        selected_keys = set(subscription.items.values_list("tool__key", flat=True))

    entitled_keys = set()
    if subscription and subscription.effective_status in {
        Subscription.STATUS_ACTIVE,
        Subscription.STATUS_ON_HOLD,
    }:
        entitled_keys = selected_keys

    tools = Tool.objects.filter(is_active=True).order_by("sort_order", "name")
    items = [
        {
            "key": tool.key,
            "name": tool.name,
            "description": tool.description,
            "entitled": tool.key in entitled_keys,
            "selected": tool.key in selected_keys,
        }
        for tool in tools
    ]

    orders_qs = Order.objects.none()
    if customer:
        orders_qs = customer.orders.all().order_by("-stripe_created_at", "-created_at")
    elif subscription:
        orders_qs = subscription.orders.all().order_by("-stripe_created_at", "-created_at")
    recent_orders = [
        _serialize_order(order)
        for order in orders_qs[:25]
    ]

    return {
        "status": status_value,
        "is_read_only": read_only,
        "current_period_end": subscription.current_period_end if subscription else None,
        "next_billing_date": subscription.current_period_end if subscription else None,
        "current_pass": _serialize_pass(subscription.access_pass if subscription else None),
        "scheduled_pass": _serialize_pass(subscription.scheduled_access_pass if subscription else None),
        "scheduled_change_effective_at": (
            subscription.scheduled_change_effective_at if subscription else None
        ),
        "selected_tools_count": len(selected_keys),
        "selected_tool_keys": sorted(selected_keys),
        "tools": items,
        "orders": recent_orders,
        "stripe_customer_id": customer.stripe_customer_id if customer else "",
        "internal_discount_note": subscription.internal_discount_note if subscription else "",
    }


def _normalize_tool_keys(raw_value) -> list[str]:
    if raw_value is None:
        return []
    if isinstance(raw_value, str):
        return [item.strip() for item in raw_value.split(",") if item.strip()]
    if isinstance(raw_value, (list, tuple)):
        result: list[str] = []
        for item in raw_value:
            text = str(item).strip()
            if text:
                result.append(text)
        return result
    return []


def _validate_tool_selection(tool_keys: list[str], max_tools: int) -> tuple[list[Tool], str | None]:
    deduped_keys: list[str] = []
    seen: set[str] = set()
    for key in tool_keys:
        if key in seen:
            continue
        seen.add(key)
        deduped_keys.append(key)

    if not deduped_keys:
        return [], "Select at least one tool."
    if len(deduped_keys) > max_tools:
        return [], f"This pass allows up to {max_tools} tool(s)."

    tools = list(Tool.objects.filter(is_active=True, key__in=deduped_keys))
    found_keys = {tool.key for tool in tools}
    missing = [key for key in deduped_keys if key not in found_keys]
    if missing:
        return [], f"Unknown or inactive tools: {', '.join(missing)}."
    return tools, None


def _get_or_create_customer_for_user(user) -> Customer:
    customer = Customer.objects.filter(user=user).first()
    stripe_customer_id = ""
    if customer and customer.stripe_customer_id:
        stripe_customer_id = customer.stripe_customer_id
    elif getattr(user, "stripe_customer_id", None):
        stripe_customer_id = user.stripe_customer_id

    if not stripe_customer_id:
        stripe_customer = stripe_service.create_customer(user)
        stripe_customer_id = stripe_customer.id

    if customer:
        if customer.stripe_customer_id != stripe_customer_id:
            customer.stripe_customer_id = stripe_customer_id
            customer.save(update_fields=["stripe_customer_id", "updated_at"])
    else:
        customer = Customer.objects.create(user=user, stripe_customer_id=stripe_customer_id)

    if getattr(user, "stripe_customer_id", None) != stripe_customer_id:
        user.stripe_customer_id = stripe_customer_id
        user.save(update_fields=["stripe_customer_id"])

    return customer


class BillingSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(_summary_payload(request.user), status=status.HTTP_200_OK)


class BillingPassesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        passes = AccessPass.objects.filter(is_active=True).order_by("sort_order", "monthly_price_cents")
        payload = [
            {
                "key": access_pass.key,
                "name": access_pass.name,
                "tool_limit": access_pass.tool_limit,
                "monthly_price_cents": access_pass.monthly_price_cents,
            }
            for access_pass in passes
        ]
        return Response({"passes": payload}, status=status.HTTP_200_OK)


class BillingOrderDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, order_id: int):
        order = (
            Order.objects.select_related("customer__user", "subscription__access_pass")
            .filter(id=order_id)
            .first()
        )
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        owns_order = bool(
            (order.customer and order.customer.user_id == request.user.id)
            or (order.subscription and order.subscription.user_id == request.user.id)
        )
        if not owns_order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response(_serialize_order_detail(order), status=status.HTTP_200_OK)


class CreateSubscriptionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        current_subscription = get_current_subscription(request.user)
        if current_subscription and current_subscription.effective_status in {
            Subscription.STATUS_PENDING,
            Subscription.STATUS_ACTIVE,
            Subscription.STATUS_ON_HOLD,
        }:
            return Response(
                {"detail": "You already have a subscription in progress. Complete or manage it in Billing."},
                status=status.HTTP_409_CONFLICT,
            )

        target_key = str(request.data.get("target_pass_key", "")).strip().lower()
        access_pass = AccessPass.objects.filter(key=target_key, is_active=True).first()
        if not access_pass:
            return Response({"detail": "Invalid access pass."}, status=status.HTTP_400_BAD_REQUEST)
        if not access_pass.stripe_price_id:
            return Response(
                {"detail": f"Pass '{access_pass.name}' is missing Stripe price id."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            customer = _get_or_create_customer_for_user(request.user)
            stripe_subscription = stripe_service.create_subscription(
                customer.stripe_customer_id,
                access_pass.stripe_price_id,
                metadata={"user_id": str(request.user.id), "access_pass_key": access_pass.key},
            )
            synced = sync.sync_subscription_from_stripe(stripe_subscription, source="api")
            if not synced:
                return Response(
                    {"detail": "Subscription created in Stripe but local sync failed."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            if synced.access_pass_id != access_pass.id:
                synced.access_pass = access_pass
                synced.save(update_fields=["access_pass", "updated_at"])

            _sync_latest_invoice_order(stripe_subscription, synced, source="api")

            latest_invoice = getattr(stripe_subscription, "latest_invoice", None)
            hosted_invoice_url = None
            payment_intent_status = None
            if latest_invoice:
                invoice_obj = latest_invoice
                if isinstance(latest_invoice, str):
                    invoice_obj = stripe_service.retrieve_invoice(latest_invoice)
                hosted_invoice_url = getattr(invoice_obj, "hosted_invoice_url", None)
                payment_intent = getattr(invoice_obj, "payment_intent", None)
                payment_intent_status = getattr(payment_intent, "status", None) if payment_intent else None

            return Response(
                {
                    "status": "pending_payment" if hosted_invoice_url else "created",
                    "payment_action_required": bool(hosted_invoice_url),
                    "payment_url": hosted_invoice_url,
                    "payment_intent_status": payment_intent_status,
                    "summary": _summary_payload(request.user),
                },
                status=status.HTTP_200_OK,
            )
        except Exception as exc:  # noqa: BLE001 - expose safe, user-readable errors
            if stripe and isinstance(exc, stripe.error.InvalidRequestError):
                detail = getattr(exc, "user_message", None) or str(exc)
                return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)
            return Response(
                {"detail": f"Stripe create failed: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


class ChangePassView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        subscription = get_current_subscription(request.user)
        if not subscription:
            return Response({"detail": "No subscription found."}, status=status.HTTP_404_NOT_FOUND)
        if subscription.effective_status != Subscription.STATUS_ACTIVE:
            return Response(
                {"detail": "Plan changes are only allowed for active subscriptions."},
                status=status.HTTP_409_CONFLICT,
            )
        if not subscription.access_pass:
            return Response(
                {"detail": "Current subscription has no access pass configured."},
                status=status.HTTP_409_CONFLICT,
            )

        target_key = str(request.data.get("target_pass_key", "")).strip().lower()
        effective_mode = str(request.data.get("effective_mode", "")).strip().lower()
        raw_tool_keys = request.data.get("selected_tool_keys")
        selected_tool_keys = _normalize_tool_keys(raw_tool_keys)
        if not selected_tool_keys:
            selected_tool_keys = list(subscription.items.values_list("tool__key", flat=True))

        target_pass = AccessPass.objects.filter(key=target_key, is_active=True).first()
        if not target_pass:
            return Response({"detail": "Invalid target pass."}, status=status.HTTP_400_BAD_REQUEST)
        if not target_pass.stripe_price_id:
            return Response(
                {"detail": f"Pass '{target_pass.name}' is missing Stripe price id."},
                status=status.HTTP_409_CONFLICT,
            )

        tools, selection_error = _validate_tool_selection(selected_tool_keys, target_pass.tool_limit)
        if selection_error:
            return Response({"detail": selection_error}, status=status.HTTP_400_BAD_REQUEST)

        current_pass = subscription.access_pass
        if target_pass.id == current_pass.id:
            sync.set_selected_tools(subscription, tools)
            return Response(
                {
                    "status": "tools_updated",
                    "summary": _summary_payload(request.user),
                },
                status=status.HTTP_200_OK,
            )

        is_upgrade = target_pass.monthly_price_cents > current_pass.monthly_price_cents
        if is_upgrade and effective_mode != "immediate":
            return Response(
                {"detail": "Upgrades must use effective_mode='immediate'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not is_upgrade and effective_mode != "next_cycle":
            return Response(
                {"detail": "Downgrades must use effective_mode='next_cycle'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            if is_upgrade:
                stripe_subscription, payment_url, payment_intent_status = (
                    stripe_service.change_subscription_pass_immediate(
                        subscription.stripe_subscription_id,
                        target_pass.stripe_price_id,
                    )
                )
                synced = sync.sync_subscription_from_stripe(stripe_subscription, source="api")
                if not synced:
                    return Response(
                        {"detail": "Could not sync subscription after Stripe update."},
                        status=status.HTTP_502_BAD_GATEWAY,
                    )

                upgraded_now = synced.access_pass_id == target_pass.id
                payment_action_required = not upgraded_now
                if upgraded_now:
                    sync.set_selected_tools(synced, tools)
                    _sync_latest_invoice_order(stripe_subscription, synced, source="api")

                response_payload = {
                    "status": "upgraded" if upgraded_now else "pending_payment",
                    "payment_action_required": payment_action_required,
                    "payment_url": payment_url,
                    "payment_intent_status": payment_intent_status,
                    "summary": _summary_payload(request.user),
                }
                return Response(response_payload, status=status.HTTP_200_OK)

            stripe_subscription = stripe_service.schedule_subscription_pass_downgrade(
                subscription.stripe_subscription_id,
                target_pass.stripe_price_id,
            )
            synced = sync.sync_subscription_from_stripe(stripe_subscription, source="api")
            if not synced:
                return Response(
                    {"detail": "Could not sync subscription after Stripe update."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            synced.scheduled_access_pass = target_pass
            synced.scheduled_change_effective_at = synced.current_period_end
            synced.scheduled_tool_keys = [tool.key for tool in tools]
            synced.save(
                update_fields=[
                    "scheduled_access_pass",
                    "scheduled_change_effective_at",
                    "scheduled_tool_keys",
                    "updated_at",
                ]
            )
            return Response(
                {
                    "status": "downgrade_scheduled",
                    "summary": _summary_payload(request.user),
                },
                status=status.HTTP_200_OK,
            )
        except Exception as exc:  # noqa: BLE001 - expose safe, user-readable errors
            if stripe and isinstance(exc, stripe.error.InvalidRequestError):
                detail = getattr(exc, "user_message", None) or str(exc)
                return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)
            return Response(
                {"detail": f"Stripe update failed: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


class SelectToolsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        subscription = get_current_subscription(request.user)
        if not subscription:
            return Response({"detail": "No subscription found."}, status=status.HTTP_404_NOT_FOUND)
        if subscription.effective_status != Subscription.STATUS_ACTIVE:
            return Response(
                {"detail": "Tool selection is only allowed for active subscriptions."},
                status=status.HTTP_409_CONFLICT,
            )
        if not subscription.access_pass:
            return Response(
                {"detail": "Current subscription has no access pass configured."},
                status=status.HTTP_409_CONFLICT,
            )

        selected_tool_keys = _normalize_tool_keys(request.data.get("selected_tool_keys"))
        tools, selection_error = _validate_tool_selection(
            selected_tool_keys,
            subscription.access_pass.tool_limit,
        )
        if selection_error:
            return Response({"detail": selection_error}, status=status.HTTP_400_BAD_REQUEST)

        sync.set_selected_tools(subscription, tools)
        return Response({"summary": _summary_payload(request.user)}, status=status.HTTP_200_OK)


class StripeWebhookView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @csrf_exempt
    def post(self, request: HttpRequest):
        if stripe is None:
            return Response(
                {"detail": "stripe package is not installed."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        payload = request.body
        sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")
        webhook_secret = getattr(settings, "STRIPE_WEBHOOK_SECRET", "").strip()

        if not webhook_secret:
            return Response(
                {"detail": "Stripe webhook secret not configured."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            event = stripe.Webhook.construct_event(
                payload=payload,
                sig_header=sig_header,
                secret=webhook_secret,
            )
        except ValueError:
            return Response({"detail": "Invalid payload."}, status=status.HTTP_400_BAD_REQUEST)
        except stripe.error.SignatureVerificationError:
            return Response({"detail": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST)

        if BillingEvent.objects.filter(stripe_event_id=event.id).exists():
            return Response({"status": "duplicate"}, status=status.HTTP_200_OK)

        with transaction.atomic():
            BillingEvent.objects.create(
                stripe_event_id=event.id,
                event_type=event.type,
                source=BillingEvent.SOURCE_STRIPE,
                payload=event.to_dict(),
            )

            subscription = None
            order = None
            if event.type.startswith("customer.subscription"):
                subscription_id = event.data["object"].get("id")
                if subscription_id:
                    stripe_subscription = stripe_service.retrieve_subscription(subscription_id)
                    subscription = sync.sync_subscription_from_stripe(stripe_subscription, source="stripe")
                else:
                    subscription = sync.sync_subscription_from_stripe(event.data["object"], source="stripe")
                latest_invoice = None
                if subscription_id:
                    invoice_ref = event.data["object"].get("latest_invoice")
                    if isinstance(invoice_ref, str):
                        latest_invoice = stripe_service.retrieve_invoice(invoice_ref)
                    elif isinstance(invoice_ref, dict):
                        latest_invoice = invoice_ref
                if latest_invoice:
                    order = sync.sync_order_from_stripe_invoice(
                        latest_invoice,
                        source="stripe",
                        fallback_subscription=subscription,
                    )

            if event.type in {"invoice.payment_succeeded", "invoice.payment_failed"}:
                invoice = event.data.get("object", {})
                stripe_subscription_id = invoice.get("subscription")
                if stripe_subscription_id:
                    stripe_subscription = stripe_service.retrieve_subscription(stripe_subscription_id)
                    subscription = sync.sync_subscription_from_stripe(stripe_subscription, source="stripe")
                order = sync.sync_order_from_stripe_invoice(
                    invoice,
                    source="stripe",
                    fallback_subscription=subscription,
                )

            if event.type.startswith("invoice.") and event.type not in {
                "invoice.payment_succeeded",
                "invoice.payment_failed",
            }:
                invoice = event.data.get("object", {})
                if isinstance(invoice, dict) and invoice.get("object") == "invoice":
                    order = sync.sync_order_from_stripe_invoice(
                        invoice,
                        source="stripe",
                        fallback_subscription=subscription,
                    )

            if event.type.startswith("invoice_payment."):
                invoice_payment = event.data.get("object", {})
                invoice_ref = invoice_payment.get("invoice") if isinstance(invoice_payment, dict) else None
                invoice_id = ""
                if isinstance(invoice_ref, str):
                    invoice_id = invoice_ref
                elif isinstance(invoice_ref, dict):
                    invoice_id = invoice_ref.get("id") or ""
                if invoice_id:
                    invoice = stripe_service.retrieve_invoice(invoice_id)
                    order = sync.sync_order_from_stripe_invoice(
                        invoice,
                        source="stripe",
                        fallback_subscription=subscription,
                    )

            if subscription:
                self._create_note_from_event(subscription, event.type)

        return Response({"status": "ok"}, status=status.HTTP_200_OK)

    def _create_note_from_event(self, subscription: Subscription, event_type: str) -> None:
        category = SubscriptionNote.CATEGORY_STATUS
        note = f"Stripe event: {event_type}"
        if event_type == "invoice.payment_succeeded":
            category = SubscriptionNote.CATEGORY_PAYMENT
            note = "Invoice paid successfully."
        elif event_type == "invoice.payment_failed":
            category = SubscriptionNote.CATEGORY_PAYMENT
            note = "Invoice payment failed. Subscription moved to grace period."
        elif event_type == "customer.subscription.deleted":
            note = "Subscription canceled in Stripe."

        SubscriptionNote.objects.create(
            subscription=subscription,
            author_type=SubscriptionNote.AUTHOR_SYSTEM,
            category=category,
            note=note,
        )
