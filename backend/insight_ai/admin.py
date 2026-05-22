from django.contrib import admin

from .models import InsightAIUsage


@admin.register(InsightAIUsage)
class InsightAIUsageAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "provider",
        "model",
        "status",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "created_at",
    )
    list_filter = ("provider", "model", "status", "created_at")
    search_fields = ("user__username", "user__email", "message_preview", "response_preview")
    readonly_fields = (
        "user",
        "provider",
        "model",
        "status",
        "message_preview",
        "response_preview",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "error_message",
        "created_at",
    )
