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
