from __future__ import annotations

from django.conf import settings
from django.db import models


class AccessPass(models.Model):
    KEY_BRONZE = "bronze"
    KEY_SILVER = "silver"
    KEY_GOLD = "gold"
    KEY_PLATINUM = "platinum"

    KEY_CHOICES = [
        (KEY_BRONZE, "Bronze"),
        (KEY_SILVER, "Silver"),
        (KEY_GOLD, "Gold"),
        (KEY_PLATINUM, "Platinum"),
    ]

    key = models.CharField(max_length=20, unique=True, choices=KEY_CHOICES)
    name = models.CharField(max_length=120)
    monthly_price_cents = models.PositiveIntegerField()
    tool_limit = models.PositiveSmallIntegerField()
    stripe_price_id = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "monthly_price_cents", "name"]

    def __str__(self) -> str:
        return f"{self.name} (${self.monthly_price_cents / 100:.2f}/month)"


class Tool(models.Model):
    key = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    stripe_product_id = models.CharField(max_length=255, blank=True, default="")
    # Legacy field kept for compatibility with historical per-tool Stripe setup.
    stripe_price_id = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.key})"


class Customer(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="billing_customer",
    )
    stripe_customer_id = models.CharField(max_length=255, unique=True, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        username = getattr(self.user, "username", "") or f"user-{self.user_id}"
        stripe_id = self.stripe_customer_id or "unassigned"
        return f"{username} ({stripe_id})"


class Subscription(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUS_ON_HOLD = "on_hold"
    STATUS_CANCELED = "canceled"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_ON_HOLD, "On hold"),
        (STATUS_CANCELED, "Canceled"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )
    stripe_subscription_id = models.CharField(max_length=255, unique=True)
    access_pass = models.ForeignKey(
        AccessPass,
        on_delete=models.PROTECT,
        related_name="subscriptions",
        null=True,
        blank=True,
    )
    scheduled_access_pass = models.ForeignKey(
        AccessPass,
        on_delete=models.PROTECT,
        related_name="scheduled_subscriptions",
        null=True,
        blank=True,
    )
    scheduled_change_effective_at = models.DateTimeField(null=True, blank=True)
    scheduled_tool_keys = models.JSONField(default=list, blank=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )

    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    canceled_at = models.DateTimeField(null=True, blank=True)
    cancel_at = models.DateTimeField(null=True, blank=True)
    grace_until = models.DateTimeField(null=True, blank=True)

    is_override = models.BooleanField(default=False)
    override_status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        null=True,
        blank=True,
    )
    override_reason = models.TextField(blank=True, default="")

    internal_discount_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )
    internal_discount_amount = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
    )
    internal_discount_note = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Subscription {self.stripe_subscription_id} ({self.user_id})"

    @property
    def effective_status(self) -> str:
        if self.is_override and self.override_status:
            return self.override_status
        return self.status

    @property
    def is_read_only(self) -> bool:
        return self.effective_status == self.STATUS_ON_HOLD


class SubscriptionItem(models.Model):
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.CASCADE,
        related_name="items",
    )
    tool = models.ForeignKey(
        Tool,
        on_delete=models.PROTECT,
        related_name="subscription_items",
    )
    # Legacy Stripe item id from old per-tool Stripe setup; optional in access-pass mode.
    stripe_subscription_item_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    stripe_price_id = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["subscription", "tool"],
                name="billing_subscription_tool_unique",
            )
        ]

    def __str__(self) -> str:
        return f"{self.subscription_id}:{self.tool.key}"


class BillingEvent(models.Model):
    SOURCE_STRIPE = "stripe"
    SOURCE_ADMIN = "admin"
    SOURCE_SYSTEM = "system"

    SOURCE_CHOICES = [
        (SOURCE_STRIPE, "Stripe"),
        (SOURCE_ADMIN, "Admin"),
        (SOURCE_SYSTEM, "System"),
    ]

    stripe_event_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    event_type = models.CharField(max_length=200)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_STRIPE)
    payload = models.JSONField(blank=True, default=dict)

    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.event_type} ({self.created_at:%Y-%m-%d %H:%M:%S})"


class Order(models.Model):
    STATUS_DRAFT = "draft"
    STATUS_OPEN = "open"
    STATUS_PAID = "paid"
    STATUS_UNCOLLECTIBLE = "uncollectible"
    STATUS_VOID = "void"

    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_OPEN, "Open"),
        (STATUS_PAID, "Paid"),
        (STATUS_UNCOLLECTIBLE, "Uncollectible"),
        (STATUS_VOID, "Void"),
    ]

    stripe_invoice_id = models.CharField(max_length=255, unique=True)
    invoice_number = models.CharField(max_length=120, blank=True, default="")

    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
    )

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    currency = models.CharField(max_length=10, blank=True, default="")
    amount_due_cents = models.IntegerField(default=0)
    amount_paid_cents = models.IntegerField(default=0)
    amount_remaining_cents = models.IntegerField(default=0)

    billing_reason = models.CharField(max_length=80, blank=True, default="")
    hosted_invoice_url = models.URLField(blank=True, default="")
    invoice_pdf_url = models.URLField(blank=True, default="")

    stripe_payment_intent_id = models.CharField(max_length=255, blank=True, default="")
    stripe_charge_id = models.CharField(max_length=255, blank=True, default="")

    period_start = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)
    due_date = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    stripe_created_at = models.DateTimeField(null=True, blank=True)

    payload = models.JSONField(blank=True, default=dict)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-stripe_created_at", "-created_at"]

    def __str__(self) -> str:
        return f"Order {self.invoice_number or self.stripe_invoice_id} ({self.status})"


class SubscriptionNote(models.Model):
    AUTHOR_ADMIN = "admin"
    AUTHOR_SYSTEM = "system"

    AUTHOR_CHOICES = [
        (AUTHOR_ADMIN, "Admin"),
        (AUTHOR_SYSTEM, "System"),
    ]

    CATEGORY_PAYMENT = "payment"
    CATEGORY_STATUS = "status"
    CATEGORY_CUSTOMER = "customer_request"
    CATEGORY_INTERNAL = "internal"

    CATEGORY_CHOICES = [
        (CATEGORY_PAYMENT, "Payment"),
        (CATEGORY_STATUS, "Status"),
        (CATEGORY_CUSTOMER, "Customer request"),
        (CATEGORY_INTERNAL, "Internal"),
    ]

    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.CASCADE,
        related_name="notes",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    author_type = models.CharField(
        max_length=20,
        choices=AUTHOR_CHOICES,
        default=AUTHOR_SYSTEM,
    )
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
        default=CATEGORY_INTERNAL,
    )
    note = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.category} note ({self.created_at:%Y-%m-%d})"
