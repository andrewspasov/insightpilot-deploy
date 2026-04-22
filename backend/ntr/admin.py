import json
from django.contrib import admin
from django.utils.html import format_html
from .models import Track, NtrSettings, TrendSnapshot, AlertRule, NotificationEvent


@admin.register(Track)
class TrackAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "owner",
        "platform",
        "country",
        "language",
        "market_region",
        "status",
        "frequency",
        "created_at",
    )
    # Make both the track name and owner clickable for easy navigation
    list_display_links = ("name", "owner")
    list_select_related = ("owner",)
    list_filter = ("status", "market_region", "frequency", "owner", "platform")
    search_fields = ("name", "category", "keywords", "owner__username", "platform", "country", "language")

@admin.register(NtrSettings)
class NtrSettingsAdmin(admin.ModelAdmin):
    """
    One row of settings per user (platforms + sources).
    This lets you see, per user, which marketplaces / sources they turned on.
    """
    list_display = (
        "owner",
        "platforms_display",
        "sources_display",
        "created_at",
        "updated_at",
    )
    search_fields = ("owner__email", "owner__username")

    # Nice, human-readable columns
    def platforms_display(self, obj):
        # obj.platforms is a list → join it as a comma-separated string
        return ", ".join(obj.platforms or [])

    platforms_display.short_description = "Platforms"

    def sources_display(self, obj):
        return ", ".join(obj.sources or [])

    sources_display.short_description = "Sources"


@admin.register(TrendSnapshot)
class TrendSnapshotAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "track",
        "platform",
        "source",
        "run_at",
        "created_at",
    )
    list_select_related = ("track", "track__owner")
    list_filter = ("platform", "source", "run_at", "created_at", "track__owner")
    search_fields = ("track__name", "track__owner__username", "platform", "source", "summary")

    readonly_fields = ("pretty_metrics", "run_at", "created_at")
    fields = ("track", "platform", "source", "run_at", "pretty_metrics", "summary", "created_at")

    def pretty_metrics(self, obj):
        """
        Render metrics JSON as formatted, read-only HTML for easier admin viewing.
        """
        if not obj or not obj.metrics:
            return "(empty)"
        pretty = json.dumps(obj.metrics, indent=2, sort_keys=True)
        return format_html(
            "<pre style='background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;"
            "white-space:pre-wrap;overflow-x:auto;'>{}</pre>",
            pretty,
        )

    pretty_metrics.short_description = "Metrics"


@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "track",
        "rule_type",
        "threshold_value",
        "enabled",
        "cooldown_minutes",
        "last_triggered_at",
    )
    list_filter = ("rule_type", "enabled")
    search_fields = ("track__name", "user__email", "user__username")


@admin.register(NotificationEvent)
class NotificationEventAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "event_type",
        "user",
        "track",
        "status",
        "created_at",
        "sent_at",
    )
    list_filter = ("event_type", "status", "created_at")
    search_fields = ("user__email", "track__name")
