from django.conf import settings
from django.db import models


class Track(models.Model):
    """
    One NicheTrendRadar 'track' that monitors a niche or keyword group.

    Example:
    - name: 'Standing desks in EU'
    - keywords: ['standing desk', 'sit stand desk']
    - owner: which user this belongs to
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ntr_tracks",
        help_text="User who owns this trend track.",
    )

    name = models.CharField(
        max_length=200,
        help_text="Name of the trend track, e.g. 'Standing desks in EU'.",
    )

    keywords = models.JSONField(
        default=list,
        blank=True,
        help_text="List of keywords to monitor for this track.",
    )

    market_region = models.CharField(
        max_length=50,
        default="Global",
        help_text="Market region, e.g. 'EU', 'US', or 'Global'.",
    )

    category = models.CharField(
        max_length=100,
        blank=True,
        help_text="Optional category label for grouping tracks.",
    )

    status = models.CharField(
        max_length=10,
        choices=[("active", "Active"), ("paused", "Paused")],
        default="active",
        help_text="Is this track active or paused?",
    )

    frequency = models.CharField(
        max_length=10,
        choices=[("daily", "Daily"), ("weekly", "Weekly")],
        default="daily",
        help_text="How often to refresh trend data for this track.",
    )

    # ---------- NEW FIELDS START HERE ----------

    PLATFORM_CHOICES = [
        ("youtube", "YouTube"),
        ("mercadolibre", "MercadoLibre"),
    ]

    platform = models.CharField(
        max_length=20,
        choices=PLATFORM_CHOICES,
        default="youtube",
        help_text="Which platform this track should monitor (YouTube, MercadoLibre...).",
    )

    country = models.CharField(
        max_length=2,
        blank=True,
        help_text="Optional country code like 'US', 'DE', 'MK' (ISO 3166-1 alpha-2).",
    )

    language = models.CharField(
        max_length=5,
        blank=True,
        help_text="Optional language code like 'en', 'de', 'mk'.",
    )

    # ---------- NEW FIELDS END HERE ----------

    last_run_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the trend automation last ran for this track.",
    )
    next_run_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the trend automation is next scheduled to run.",
    )

    created_at = models.DateTimeField(
        auto_now_add=True, help_text="When this track was created."
    )
    updated_at = models.DateTimeField(
        auto_now=True, help_text="When this track was last updated."
    )

    class Meta:
        indexes = [
            models.Index(
                fields=["owner", "created_at"],
                name="ntr_track_owner_created_idx",
            ),
            models.Index(
                fields=["status", "next_run_at"],
                name="ntr_track_status_next_run_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.market_region})"
    
    
    
    


class NtrSettings(models.Model):
    """
    Stores NicheTrendRadar settings for ONE user.
    Example:
    - platforms = ["youtube", "mercadolibre"]
    - sources   = ["google_trends", "reddit"]
    """

    # Link settings to a single user (1:1)
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ntr_settings",
        help_text="User that owns these NTR settings.",
    )

    # Where the user sells products (your new choice: YouTube, MercadoLibre)
    # We use JSONField so we can store a list of strings.
    platforms = models.JSONField(
        default=list,
        blank=True,
        help_text="List of selling platforms, e.g. ['youtube', 'mercadolibre'].",
    )

    # Where we pull trend data from (Google Trends, TikTok, Reddit)
    sources = models.JSONField(
        default=list,
        blank=True,
        help_text="List of data sources, e.g. ['google_trends', 'tiktok'].",
    )

    mercadolibre_access_token = models.TextField(
        blank=True,
        default="",
        help_text="OAuth access token for MercadoLibre (optional).",
    )
    mercadolibre_refresh_token = models.TextField(
        blank=True,
        default="",
        help_text="OAuth refresh token for MercadoLibre (optional).",
    )
    mercadolibre_token_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the MercadoLibre access token expires.",
    )
    mercadolibre_user_id = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="MercadoLibre user id for the connected account (optional).",
    )

    # Bookkeeping
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When these settings were created.",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="When these settings were last updated.",
    )

    class Meta:
        verbose_name = "NTR setting"
        verbose_name_plural = "NTR settings"

    def __str__(self) -> str:
        # Nice label in Django admin
        return f"NTR Settings for {self.owner.username}"

    def _normalize_platforms(self):
        """
        Normalize platforms to lowercase slugs, map legacy 'amazon' -> 'youtube',
        and legacy 'shopify'/'etsy' -> 'mercadolibre',
        and drop duplicates while preserving order.
        """
        cleaned = []
        seen = set()
        for platform in self.platforms or []:
            slug = str(platform).strip().lower()
            if not slug:
                continue
            if slug == "amazon":
                slug = "youtube"
            if slug == "shopify":
                slug = "mercadolibre"
            if slug == "etsy":
                slug = "mercadolibre"
            if slug in seen:
                continue
            cleaned.append(slug)
            seen.add(slug)
        self.platforms = cleaned

    def save(self, *args, **kwargs):
        self._normalize_platforms()
        super().save(*args, **kwargs)



class TrendSnapshot(models.Model):
    """
    One 'snapshot' of the trend data for a single track.

    Think of this as:
    - "We ran the automation for this track at this time"
    - "Here are the numbers we found (in a JSON blob)"
    """

    # Link back to the track this snapshot belongs to.
    # If the track is deleted, we delete its snapshots too (CASCADE).
    track = models.ForeignKey(
        Track,
        on_delete=models.CASCADE,
        related_name="snapshots",
        help_text="Trend track this snapshot belongs to.",
    )

    # When did this run happen? (the time automation ran)
    run_at = models.DateTimeField(
        help_text="Timestamp when this snapshot was generated.",
    )

    # Which platform this snapshot is about (must align with your choices in Track/platform)
    platform = models.CharField(
        max_length=50,
        help_text="Platform for this snapshot, e.g. 'YouTube' or 'MercadoLibre'.",
    )

    # Optional source (if later you split by 'Reddit', 'Google Trends', etc.)
    source = models.CharField(
        max_length=50,
        blank=True,
        help_text="Optional: data source for this snapshot, e.g. 'google_trends', 'reddit'.",
    )

    # A JSON blob to store metrics.
    # For now we keep it very flexible, because we haven't fully decided the schema.
    metrics = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Flexible structure to store trend metrics, e.g. "
            '{"search_volume": 1234, "mention_count": 456, "trend_direction": "up" }.'
        ),
    )

    # Optional short summary to show in the UI.
    summary = models.TextField(
        blank=True,
        help_text="Short human readable summary of this snapshot.",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When this snapshot row was created in the database.",
    )

    class Meta:
        indexes = [
            models.Index(
                fields=["track", "run_at"],
                name="ntr_snapshot_track_run_idx",
            ),
        ]

    def __str__(self) -> str:
        # This will show nicely in Django admin
        return f"Snapshot for {self.track.name} at {self.run_at}"


class AlertRule(models.Model):
    """
    Per-track alert rule for notifications (evaluated after each run).
    """

    RULE_ENGAGEMENT_GT = "engagement_gt"
    RULE_VIEWS_SPIKE_PCT = "views_spike_pct"
    RULE_VIEWS_DROP_PCT = "views_drop_pct"
    RULE_VIEWS_GT = "views_gt"

    RULE_TYPES = [
        (RULE_ENGAGEMENT_GT, "Engagement > threshold"),
        (RULE_VIEWS_SPIKE_PCT, "Views spike %"),
        (RULE_VIEWS_DROP_PCT, "Views drop %"),
        (RULE_VIEWS_GT, "Views > threshold"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ntr_alert_rules",
    )
    track = models.ForeignKey(
        Track,
        on_delete=models.CASCADE,
        related_name="alert_rules",
    )
    enabled = models.BooleanField(default=True)
    rule_type = models.CharField(max_length=50, choices=RULE_TYPES)
    threshold_value = models.FloatField(default=0.0)
    cooldown_minutes = models.IntegerField(default=60)
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    channels = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["track", "rule_type"], name="ntr_alert_rule_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["track", "rule_type"],
                name="ntr_alert_rule_track_type_uniq",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.rule_type} for {self.track.name}"


class NotificationEvent(models.Model):
    """
    Audit log for alerts/digests emitted by the system.
    """

    STATUS_PENDING = "pending"
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_SENT, "Sent"),
        (STATUS_FAILED, "Failed"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ntr_notification_events",
    )
    track = models.ForeignKey(
        Track,
        on_delete=models.CASCADE,
        related_name="notification_events",
        null=True,
        blank=True,
    )
    rule = models.ForeignKey(
        AlertRule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notification_events",
    )
    snapshot = models.ForeignKey(
        TrendSnapshot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notification_events",
    )
    event_type = models.CharField(max_length=50)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    payload = models.JSONField(default=dict, blank=True)
    channels = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "created_at"], name="ntr_event_user_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["rule", "snapshot"],
                name="ntr_event_rule_snapshot_uniq",
            ),
        ]

    def __str__(self) -> str:
        return f"Event {self.event_type} for user {self.user_id}"
