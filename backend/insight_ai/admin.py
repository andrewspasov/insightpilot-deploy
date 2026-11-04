from django.contrib import admin
from django.utils.html import format_html_join

from .models import InsightAIAction, InsightAIChat, InsightAIUsage


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


@admin.register(InsightAIChat)
class InsightAIChatAdmin(admin.ModelAdmin):
    list_display = ("user", "message_count", "updated_at")
    search_fields = ("user__username", "user__email")
    readonly_fields = ("user", "transcript", "updated_at")
    exclude = ("messages",)

    @admin.display(description="Messages")
    def message_count(self, obj):
        return len(obj.messages)

    @admin.display(description="Conversation")
    def transcript(self, obj):
        return format_html_join(
            "",
            "<p><strong>{}</strong>: {}</p>",
            ((m.get("role", ""), m.get("content", "")) for m in obj.messages),
        )
