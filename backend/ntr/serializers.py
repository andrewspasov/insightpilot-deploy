from rest_framework import serializers
from .models import Track, NtrSettings, TrendSnapshot, AlertRule, NotificationEvent



class TrackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Track
        fields = [
            "id",
            "owner",
            "name",
            "keywords",
            "market_region",
            "category",
            "status",
            "frequency",
            "platform",      # NEW
            "country",       # NEW
            "language",      # NEW
            "last_run_at",
            "next_run_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "last_run_at",
            "next_run_at",
            "created_at",
            "updated_at",
        ]



class NtrSettingsSerializer(serializers.ModelSerializer):
    """
    Serializer for the NTR settings.
    We only expose platforms + sources (and maybe timestamps).
    """

    class Meta:
        model = NtrSettings
        fields = [
            "platforms",  # list of strings
            "sources",    # list of strings
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]
        
        
        
class TrendSnapshotSerializer(serializers.ModelSerializer):
    """
    Convert TrendSnapshot instances to/from JSON.

    This is what the frontend sees when it hits /api/ntr/snapshots/.
    """

    class Meta:
        model = TrendSnapshot
        fields = [
            "id",
            "track",
            "run_at",
            "platform",
            "source",
            "metrics",
            "summary",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class AlertRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertRule
        fields = [
            "id",
            "user",
            "track",
            "enabled",
            "rule_type",
            "threshold_value",
            "cooldown_minutes",
            "last_triggered_at",
            "channels",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "track",
            "last_triggered_at",
            "created_at",
            "updated_at",
        ]


class NotificationEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationEvent
        fields = [
            "id",
            "event_type",
            "status",
            "payload",
            "channels",
            "user",
            "track",
            "rule",
            "snapshot",
            "created_at",
            "sent_at",
        ]
        read_only_fields = ["id", "created_at", "sent_at"]
