from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User
from ntr.models import NtrSettings


class NtrSettingsInline(admin.StackedInline):
    model = NtrSettings
    can_delete = False
    extra = 0
    max_num = 1
    fk_name = "owner"
    verbose_name_plural = "NTR settings"
    fields = ("platforms", "sources", "created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    inlines = (NtrSettingsInline,)
    fieldsets = UserAdmin.fieldsets + (
        ("Profile", {"fields": ("avatar",)}),
        ("Subscription Info", {"fields": ("subscription_tier", "stripe_customer_id")}),
        ("Automations", {"fields": ("daily_trends_enabled", "weekly_report_enabled", "price_engine_enabled")}),
    )

    list_display = ("username", "email", "subscription_tier", "daily_trends_enabled")
