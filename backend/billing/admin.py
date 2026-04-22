from __future__ import annotations

from django import forms
from django.contrib import admin, messages
from django.contrib.admin.helpers import ActionForm
from django.urls import reverse
from django.utils.html import format_html

try:
    import stripe
except ModuleNotFoundError:  # pragma: no cover - handled at runtime
    stripe = None

from . import stripe_service, sync
from .models import (
    AccessPass,
    BillingEvent,
    Customer,
    Order,
    Subscription,
    SubscriptionItem,
    SubscriptionNote,
    Tool,
)

CURRENCY_SYMBOLS = {
    "usd": "$",
    "eur": "€",
    "gbp": "£",
    "mkd": "MKD ",
}


def _parse_tool_keys_csv(text: str) -> list[str]:
    return [item.strip() for item in (text or "").split(",") if item.strip()]


def _resolve_tools_or_error(tool_keys: list[str], max_allowed: int) -> tuple[list[Tool], str | None]:
    deduped: list[str] = []
    seen: set[str] = set()
    for key in tool_keys:
        if key in seen:
            continue
        seen.add(key)
        deduped.append(key)

    if not deduped:
        return [], "Provide at least one tool key."
    if len(deduped) > max_allowed:
        return [], f"This pass allows up to {max_allowed} tool(s)."

    tools = list(Tool.objects.filter(is_active=True, key__in=deduped))
    missing = [key for key in deduped if key not in {tool.key for tool in tools}]
    if missing:
        return [], f"Unknown or inactive tools: {', '.join(missing)}."
    return tools, None


def _sync_latest_invoice_order(stripe_subscription, subscription: Subscription, source: str = "admin") -> None:
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


def _local_number(value: int | None) -> str:
    if value is None:
        return "-"
    return str(value).zfill(5)


def _user_admin_url(user) -> str:
    return reverse(
        f"admin:{user._meta.app_label}_{user._meta.model_name}_change",
        args=[user.pk],
    )


def _format_price(cents: int | None, currency: str | None) -> str:
    amount = (cents or 0) / 100
    currency_code = (currency or "").lower()
    symbol_or_prefix = CURRENCY_SYMBOLS.get(currency_code)
    if symbol_or_prefix:
        return f"{symbol_or_prefix}{amount:,.2f}"
    fallback_code = (currency or "").upper().strip()
    if fallback_code:
        return f"{amount:,.2f} {fallback_code}"
    return f"{amount:,.2f}"


class CustomerPassActionForm(ActionForm):
    access_pass = forms.ModelChoiceField(
        queryset=AccessPass.objects.filter(is_active=True).order_by("sort_order", "monthly_price_cents"),
        required=False,
        help_text="Pass used for new subscription creation.",
    )
    tool_keys_csv = forms.CharField(
        required=False,
        help_text="Comma-separated tool keys, e.g. ntr,nutrition",
    )


class SubscriptionPassActionForm(ActionForm):
    access_pass = forms.ModelChoiceField(
        queryset=AccessPass.objects.filter(is_active=True).order_by("sort_order", "monthly_price_cents"),
        required=False,
        help_text="Target pass for change action.",
    )
    effective_mode = forms.ChoiceField(
        required=False,
        choices=[
            ("immediate", "Immediate (upgrade with proration)"),
            ("next_cycle", "Next cycle (downgrade, no proration)"),
        ],
        help_text="Required for pass changes.",
    )
    tool_keys_csv = forms.CharField(
        required=False,
        help_text="Comma-separated tool keys, e.g. ntr,nutrition",
    )


@admin.register(AccessPass)
class AccessPassAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "monthly_price_cents", "tool_limit", "is_active", "stripe_price_id")
    list_filter = ("is_active",)
    search_fields = ("name", "key", "stripe_price_id")


@admin.register(Tool)
class ToolAdmin(admin.ModelAdmin):
    list_display = ("key", "name", "is_active", "sort_order", "stripe_price_id")
    list_filter = ("is_active",)
    search_fields = ("key", "name")


class SubscriptionItemInline(admin.TabularInline):
    model = SubscriptionItem
    extra = 0
    can_delete = False
    readonly_fields = ("tool", "stripe_subscription_item_id", "stripe_price_id", "created_at")


class SubscriptionNoteInline(admin.TabularInline):
    model = SubscriptionNote
    extra = 0
    fields = ("author", "author_type", "category", "note", "created_at")
    readonly_fields = ("created_at",)


class BillingEventInline(admin.TabularInline):
    model = BillingEvent
    extra = 0
    can_delete = False
    fields = ("event_type", "source", "stripe_event_id", "created_at")
    readonly_fields = ("event_type", "source", "stripe_event_id", "created_at")


class OrderInline(admin.TabularInline):
    model = Order
    extra = 0
    can_delete = False
    fields = (
        "invoice_number",
        "status",
        "amount_due_cents",
        "amount_paid_cents",
        "currency",
        "stripe_invoice_id",
        "stripe_created_at",
    )
    readonly_fields = fields


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("user", "stripe_customer_id", "created_at")
    search_fields = ("user__username", "user__email", "stripe_customer_id")
    actions = ("create_subscription_with_pass",)
    action_form = CustomerPassActionForm
    readonly_fields = ("user_admin_link",)

    @admin.display(description="User record")
    def user_admin_link(self, obj):
        if not obj or not obj.user_id:
            return "-"
        return format_html(
            '<a href="{}">{}</a>',
            _user_admin_url(obj.user),
            obj.user.get_username(),
        )

    def save_model(self, request, obj, form, change):
        if not obj.stripe_customer_id:
            stripe_customer = stripe_service.create_customer(obj.user)
            obj.stripe_customer_id = stripe_customer.id
        super().save_model(request, obj, form, change)
        if obj.user.stripe_customer_id != obj.stripe_customer_id:
            obj.user.stripe_customer_id = obj.stripe_customer_id
            obj.user.save(update_fields=["stripe_customer_id"])

    @admin.action(description="Create subscription with pass (Stripe)")
    def create_subscription_with_pass(self, request, queryset):
        selected_pass = request.POST.get("access_pass")
        if not selected_pass:
            self.message_user(request, "Select an access pass.", level=messages.ERROR)
            return
        access_pass = AccessPass.objects.filter(pk=selected_pass, is_active=True).first()
        if not access_pass:
            self.message_user(request, "Invalid access pass.", level=messages.ERROR)
            return
        if not access_pass.stripe_price_id:
            self.message_user(request, "Pass is missing Stripe price id.", level=messages.ERROR)
            return
        if queryset.count() != 1:
            self.message_user(request, "Select exactly one customer.", level=messages.ERROR)
            return
        customer = queryset.first()
        existing = Subscription.objects.filter(customer=customer).order_by("-created_at").first()
        if existing and existing.status in {Subscription.STATUS_ACTIVE, Subscription.STATUS_PENDING, Subscription.STATUS_ON_HOLD}:
            self.message_user(
                request,
                "Customer already has a subscription. Use change-pass actions on the subscription.",
                level=messages.ERROR,
            )
            return

        tools, tools_error = _resolve_tools_or_error(
            _parse_tool_keys_csv(request.POST.get("tool_keys_csv", "")),
            access_pass.tool_limit,
        )
        if tools_error:
            self.message_user(request, tools_error, level=messages.ERROR)
            return

        try:
            stripe_subscription = stripe_service.create_subscription(
                customer.stripe_customer_id,
                access_pass.stripe_price_id,
                metadata={"user_id": str(customer.user_id), "access_pass_key": access_pass.key},
            )
        except Exception as exc:  # noqa: BLE001
            detail = getattr(exc, "user_message", None) or str(exc)
            self.message_user(request, f"Stripe subscription create failed: {detail}", level=messages.ERROR)
            return

        updated = sync.sync_subscription_from_stripe(stripe_subscription, source="admin")
        if not updated:
            self.message_user(request, "Subscription created in Stripe but local sync failed.", level=messages.ERROR)
            return

        if updated.access_pass_id != access_pass.id:
            updated.access_pass = access_pass
            updated.save(update_fields=["access_pass", "updated_at"])
        sync.set_selected_tools(updated, tools)
        _sync_latest_invoice_order(stripe_subscription, updated, source="admin")

        SubscriptionNote.objects.create(
            subscription=updated,
            author=request.user,
            author_type=SubscriptionNote.AUTHOR_ADMIN,
            category=SubscriptionNote.CATEGORY_INTERNAL,
            note=f"Admin created subscription with pass {access_pass.name}.",
        )

        latest_invoice = getattr(stripe_subscription, "latest_invoice", None)
        hosted_invoice_url = getattr(latest_invoice, "hosted_invoice_url", None) if latest_invoice else None
        if hosted_invoice_url:
            self.message_user(
                request,
                f"Subscription created. Customer must complete payment: {hosted_invoice_url}",
                level=messages.WARNING,
            )
        else:
            self.message_user(request, "Subscription created and synced.")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "subscription_number",
        "user",
        "status",
        "effective_status",
        "access_pass",
        "current_period_end",
        "grace_until",
        "created_at",
    )
    list_filter = ("status", "is_override", "access_pass")
    search_fields = ("=id", "stripe_subscription_id", "user__username", "user__email")
    list_select_related = ("user", "access_pass")
    inlines = (SubscriptionItemInline, OrderInline, SubscriptionNoteInline, BillingEventInline)
    readonly_fields = (
        "stripe_subscription_id",
        "status",
        "current_period_start",
        "current_period_end",
        "canceled_at",
        "cancel_at",
        "grace_until",
    )
    actions = (
        "sync_from_stripe",
        "sync_orders_from_stripe",
        "change_pass",
        "set_selected_tools",
        "clear_status_override",
        "debug_stripe_period_fields",
    )
    action_form = SubscriptionPassActionForm

    fieldsets = (
        ("Stripe", {"fields": ("stripe_subscription_id", "status", "access_pass")}),
        (
            "Period",
            {
                "fields": (
                    "current_period_start",
                    "current_period_end",
                    "cancel_at",
                    "canceled_at",
                    "grace_until",
                )
            },
        ),
        (
            "Scheduled change",
            {
                "fields": (
                    "scheduled_access_pass",
                    "scheduled_change_effective_at",
                    "scheduled_tool_keys",
                )
            },
        ),
        (
            "Override",
            {
                "fields": (
                    "is_override",
                    "override_status",
                    "override_reason",
                )
            },
        ),
        (
            "Internal discount",
            {
                "fields": (
                    "internal_discount_percent",
                    "internal_discount_amount",
                    "internal_discount_note",
                )
            },
        ),
    )

    def save_model(self, request, obj, form, change):
        if change and ("is_override" in form.changed_data or "override_status" in form.changed_data):
            SubscriptionNote.objects.create(
                subscription=obj,
                author=request.user,
                author_type=SubscriptionNote.AUTHOR_ADMIN,
                category=SubscriptionNote.CATEGORY_INTERNAL,
                note=f"Admin override set to {obj.override_status or 'none'}.",
            )
        super().save_model(request, obj, form, change)

    @admin.display(description="Subscription #", ordering="id")
    def subscription_number(self, obj):
        return _local_number(obj.id)

    @admin.action(description="Sync subscription from Stripe")
    def sync_from_stripe(self, request, queryset):
        if queryset.count() != 1:
            self.message_user(request, "Select exactly one subscription.", level=messages.ERROR)
            return
        subscription = queryset.first()
        stripe_subscription = stripe_service.retrieve_subscription(subscription.stripe_subscription_id)
        sync.sync_subscription_from_stripe(stripe_subscription, source="admin")
        self.message_user(request, "Subscription synced from Stripe.")

    @admin.action(description="Sync related orders (invoices) from Stripe")
    def sync_orders_from_stripe(self, request, queryset):
        if queryset.count() != 1:
            self.message_user(request, "Select exactly one subscription.", level=messages.ERROR)
            return
        subscription = queryset.first()
        invoices = stripe_service.list_invoices_for_subscription(subscription.stripe_subscription_id, limit=100)
        synced_count = 0
        for invoice in invoices:
            order = sync.sync_order_from_stripe_invoice(
                invoice,
                source="admin",
                fallback_subscription=subscription,
            )
            if order:
                synced_count += 1
        self.message_user(request, f"Synced {synced_count} order(s) from Stripe.")

    @admin.action(description="Change pass (Stripe)")
    def change_pass(self, request, queryset):
        if queryset.count() != 1:
            self.message_user(request, "Select exactly one subscription.", level=messages.ERROR)
            return
        subscription = queryset.first()
        if subscription.status != Subscription.STATUS_ACTIVE:
            self.message_user(request, "Pass changes require an active subscription.", level=messages.ERROR)
            return
        if not subscription.access_pass:
            self.message_user(request, "Subscription is missing current access pass.", level=messages.ERROR)
            return

        selected_pass = request.POST.get("access_pass")
        if not selected_pass:
            self.message_user(request, "Select a target pass.", level=messages.ERROR)
            return
        target_pass = AccessPass.objects.filter(pk=selected_pass, is_active=True).first()
        if not target_pass:
            self.message_user(request, "Invalid access pass.", level=messages.ERROR)
            return
        if not target_pass.stripe_price_id:
            self.message_user(request, "Pass is missing Stripe price id.", level=messages.ERROR)
            return

        current_pass = subscription.access_pass
        if target_pass.id == current_pass.id:
            self.message_user(request, "Target pass is the same as current pass.", level=messages.ERROR)
            return

        tool_keys = _parse_tool_keys_csv(request.POST.get("tool_keys_csv", ""))
        if not tool_keys:
            tool_keys = list(subscription.items.values_list("tool__key", flat=True))

        tools, tools_error = _resolve_tools_or_error(tool_keys, target_pass.tool_limit)
        if tools_error:
            self.message_user(request, tools_error, level=messages.ERROR)
            return

        effective_mode = (request.POST.get("effective_mode") or "").strip()
        is_upgrade = target_pass.monthly_price_cents > current_pass.monthly_price_cents
        if is_upgrade and effective_mode != "immediate":
            self.message_user(request, "Upgrades require mode 'immediate'.", level=messages.ERROR)
            return
        if not is_upgrade and effective_mode != "next_cycle":
            self.message_user(request, "Downgrades require mode 'next_cycle'.", level=messages.ERROR)
            return

        try:
            if is_upgrade:
                stripe_subscription, payment_url, _payment_status = (
                    stripe_service.change_subscription_pass_immediate(
                        subscription.stripe_subscription_id,
                        target_pass.stripe_price_id,
                    )
                )
                updated = sync.sync_subscription_from_stripe(stripe_subscription, source="admin")
                if not updated:
                    self.message_user(
                        request,
                        "Stripe updated but local sync failed.",
                        level=messages.ERROR,
                    )
                    return

                if updated.access_pass_id == target_pass.id:
                    sync.set_selected_tools(updated, tools)
                    _sync_latest_invoice_order(stripe_subscription, updated, source="admin")
                    SubscriptionNote.objects.create(
                        subscription=updated,
                        author=request.user,
                        author_type=SubscriptionNote.AUTHOR_ADMIN,
                        category=SubscriptionNote.CATEGORY_INTERNAL,
                        note=f"Admin upgraded pass to {target_pass.name}.",
                    )
                    self.message_user(request, "Pass upgraded.")
                    return

                msg = "Upgrade requires payment confirmation before pass changes apply."
                if payment_url:
                    msg = f"{msg} Payment URL: {payment_url}"
                self.message_user(request, msg, level=messages.WARNING)
                return

            stripe_subscription = stripe_service.schedule_subscription_pass_downgrade(
                subscription.stripe_subscription_id,
                target_pass.stripe_price_id,
            )
            updated = sync.sync_subscription_from_stripe(stripe_subscription, source="admin")
            if not updated:
                self.message_user(
                    request,
                    "Stripe updated but local sync failed.",
                    level=messages.ERROR,
                )
                return

            updated.scheduled_access_pass = target_pass
            updated.scheduled_change_effective_at = updated.current_period_end
            updated.scheduled_tool_keys = [tool.key for tool in tools]
            updated.save(
                update_fields=[
                    "scheduled_access_pass",
                    "scheduled_change_effective_at",
                    "scheduled_tool_keys",
                    "updated_at",
                ]
            )
            SubscriptionNote.objects.create(
                subscription=updated,
                author=request.user,
                author_type=SubscriptionNote.AUTHOR_ADMIN,
                category=SubscriptionNote.CATEGORY_INTERNAL,
                note=f"Admin scheduled downgrade to {target_pass.name}.",
            )
            self.message_user(request, "Downgrade scheduled for next billing cycle.")
        except Exception as exc:  # noqa: BLE001
            if stripe and isinstance(exc, stripe.error.InvalidRequestError):
                detail = getattr(exc, "user_message", None) or str(exc)
                self.message_user(request, f"Stripe rejected the request: {detail}", level=messages.ERROR)
                return
            self.message_user(request, f"Stripe update failed: {exc}", level=messages.ERROR)

    @admin.action(description="Set selected tools")
    def set_selected_tools(self, request, queryset):
        if queryset.count() != 1:
            self.message_user(request, "Select exactly one subscription.", level=messages.ERROR)
            return
        subscription = queryset.first()
        if subscription.status != Subscription.STATUS_ACTIVE:
            self.message_user(
                request,
                "Tool selection changes require an active subscription.",
                level=messages.ERROR,
            )
            return
        if not subscription.access_pass:
            self.message_user(request, "Subscription is missing access pass.", level=messages.ERROR)
            return
        tools, tools_error = _resolve_tools_or_error(
            _parse_tool_keys_csv(request.POST.get("tool_keys_csv", "")),
            subscription.access_pass.tool_limit,
        )
        if tools_error:
            self.message_user(request, tools_error, level=messages.ERROR)
            return
        sync.set_selected_tools(subscription, tools)
        SubscriptionNote.objects.create(
            subscription=subscription,
            author=request.user,
            author_type=SubscriptionNote.AUTHOR_ADMIN,
            category=SubscriptionNote.CATEGORY_INTERNAL,
            note=f"Admin updated selected tools: {', '.join(tool.key for tool in tools)}.",
        )
        self.message_user(request, "Selected tools updated.")

    @admin.action(description="Clear status override")
    def clear_status_override(self, request, queryset):
        updated = queryset.update(is_override=False, override_status=None, override_reason="")
        for subscription in queryset:
            SubscriptionNote.objects.create(
                subscription=subscription,
                author=request.user,
                author_type=SubscriptionNote.AUTHOR_ADMIN,
                category=SubscriptionNote.CATEGORY_INTERNAL,
                note="Admin cleared status override.",
            )
        self.message_user(request, f"Cleared override on {updated} subscription(s).")

    @admin.action(description="Debug: log Stripe period fields")
    def debug_stripe_period_fields(self, request, queryset):
        if queryset.count() != 1:
            self.message_user(request, "Select exactly one subscription.", level=messages.ERROR)
            return
        subscription = queryset.first()
        stripe_subscription = stripe_service.retrieve_subscription(subscription.stripe_subscription_id)
        payload = (
            stripe_subscription.to_dict()
            if hasattr(stripe_subscription, "to_dict")
            else stripe_subscription
        )
        items = (payload.get("items") or {}).get("data", []) if isinstance(payload, dict) else []
        first_item = items[0] if items else {}
        latest_invoice = payload.get("latest_invoice") if isinstance(payload, dict) else {}
        lines = (latest_invoice.get("lines") or {}).get("data", []) if isinstance(latest_invoice, dict) else []
        first_line = lines[0] if lines else {}
        period = first_line.get("period") if isinstance(first_line, dict) else {}
        debug_payload = {
            "attr_current_period_start": getattr(stripe_subscription, "current_period_start", None),
            "attr_current_period_end": getattr(stripe_subscription, "current_period_end", None),
            "dict_current_period_start": payload.get("current_period_start") if isinstance(payload, dict) else None,
            "dict_current_period_end": payload.get("current_period_end") if isinstance(payload, dict) else None,
            "item_current_period_start": first_item.get("current_period_start") if isinstance(first_item, dict) else None,
            "item_current_period_end": first_item.get("current_period_end") if isinstance(first_item, dict) else None,
            "line_period_start": period.get("start") if isinstance(period, dict) else None,
            "line_period_end": period.get("end") if isinstance(period, dict) else None,
        }
        BillingEvent.objects.create(
            event_type="admin.debug.period",
            source=BillingEvent.SOURCE_ADMIN,
            payload=debug_payload,
            subscription=subscription,
            customer=subscription.customer,
        )
        self.message_user(request, "Saved period debug payload to Billing Events.")


@admin.register(SubscriptionItem)
class SubscriptionItemAdmin(admin.ModelAdmin):
    list_display = ("subscription", "tool", "stripe_subscription_item_id")
    search_fields = ("stripe_subscription_item_id", "subscription__stripe_subscription_id")


@admin.register(SubscriptionNote)
class SubscriptionNoteAdmin(admin.ModelAdmin):
    list_display = ("subscription", "category", "author_type", "created_at")
    search_fields = ("subscription__stripe_subscription_id", "note")
    list_filter = ("category", "author_type")


@admin.register(BillingEvent)
class BillingEventAdmin(admin.ModelAdmin):
    list_display = ("event_type", "source", "stripe_event_id", "created_at")
    list_filter = ("source",)
    search_fields = ("event_type", "stripe_event_id")


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number_display",
        "status_display",
        "subscription_number_link",
        "customer_links",
        "price_display",
        "stripe_created_at",
    )
    list_filter = ("status",)
    list_select_related = ("subscription", "customer", "customer__user")
    search_fields = (
        "=id",
        "invoice_number",
        "stripe_invoice_id",
        "=subscription__id",
        "subscription__stripe_subscription_id",
        "customer__stripe_customer_id",
        "customer__user__username",
        "customer__user__email",
    )
    readonly_fields = (
        "stripe_invoice_id",
        "invoice_number",
        "subscription",
        "customer",
        "status",
        "currency",
        "amount_due_cents",
        "amount_paid_cents",
        "amount_remaining_cents",
        "billing_reason",
        "hosted_invoice_url",
        "invoice_pdf_url",
        "stripe_payment_intent_id",
        "stripe_charge_id",
        "period_start",
        "period_end",
        "due_date",
        "paid_at",
        "stripe_created_at",
        "payload",
        "created_at",
        "updated_at",
    )

    @admin.display(description="Order #", ordering="id")
    def order_number_display(self, obj):
        return _local_number(obj.id)

    @admin.display(description="Status", ordering="status")
    def status_display(self, obj):
        return obj.get_status_display()

    @admin.display(description="Subscription", ordering="subscription__id")
    def subscription_number_link(self, obj):
        if not obj.subscription_id:
            return "-"
        url = reverse("admin:billing_subscription_change", args=[obj.subscription_id])
        return format_html('<a href="{}">{}</a>', url, _local_number(obj.subscription_id))

    @admin.display(description="Customer", ordering="customer__user__username")
    def customer_links(self, obj):
        customer = obj.customer
        if not customer:
            return "-"
        username = customer.user.get_username() if customer.user_id else f"customer-{customer.id}"
        customer_url = reverse("admin:billing_customer_change", args=[customer.id])
        if not customer.user_id:
            return format_html('<a href="{}">{}</a>', customer_url, username)

        user_url = _user_admin_url(customer.user)
        return format_html(
            '<a href="{}">{}</a> <span class="quiet">|</span> <a href="{}">user</a>',
            customer_url,
            username,
            user_url,
        )

    @admin.display(description="Price", ordering="amount_due_cents")
    def price_display(self, obj):
        return _format_price(obj.amount_due_cents, obj.currency)
