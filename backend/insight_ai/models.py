from __future__ import annotations

from django.conf import settings
from django.db import models


class InsightAIUsage(models.Model):
    STATUS_SUCCESS = "success"
    STATUS_ERROR = "error"

    STATUS_CHOICES = [
        (STATUS_SUCCESS, "Success"),
        (STATUS_ERROR, "Error"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="insight_ai_usage",
    )
    provider = models.CharField(max_length=50, default="gemini")
    model = models.CharField(max_length=120)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_SUCCESS)
    message_preview = models.TextField(blank=True, default="")
    response_preview = models.TextField(blank=True, default="")
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "created_at"], name="insight_ai_user_created_idx"),
            models.Index(fields=["status", "created_at"], name="insight_ai_status_created_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} {self.model} {self.status} {self.total_tokens}"


class InsightAIAction(models.Model):
    STATUS_PENDING = "pending"
    STATUS_CONFIRMED = "confirmed"
    STATUS_CANCELLED = "cancelled"
    STATUS_EXPIRED = "expired"
    STATUS_FAILED = "failed"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_CONFIRMED, "Confirmed"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_EXPIRED, "Expired"),
        (STATUS_FAILED, "Failed"),
    ]

    TYPE_LOG_MEAL = "log_meal"

    ACTION_TYPE_CHOICES = [
        (TYPE_LOG_MEAL, "Log meal"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="insight_ai_actions",
    )
    action_type = models.CharField(max_length=60, choices=ACTION_TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    summary = models.CharField(max_length=300)
    payload = models.JSONField(default=dict)
    result_payload = models.JSONField(blank=True, default=dict)
    error_message = models.TextField(blank=True, default="")
    expires_at = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status", "created_at"], name="insight_ai_action_user_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} {self.action_type} {self.status}"
