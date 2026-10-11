from django.contrib import admin

from .models import InsightAIAction, InsightAIUsage


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


@admin.register(InsightAIAction)
class InsightAIActionAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "action_type",
        "status",
        "summary",
        "created_at",
        "expires_at",
        "resolved_at",
    )
    list_filter = ("action_type", "status", "created_at")
    search_fields = ("user__username", "user__email", "summary")
    readonly_fields = (
        "user",
        "action_type",
        "status",
        "summary",
        "payload",
        "result_payload",
        "error_message",
        "expires_at",
        "resolved_at",
        "created_at",
        "updated_at",
    )
