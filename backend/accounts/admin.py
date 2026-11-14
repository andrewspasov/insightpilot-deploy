from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Notification, User

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("Profile", {"fields": ("avatar",)}),
        ("Subscription Info", {"fields": ("subscription_tier", "stripe_customer_id")}),
    )

    list_display = ("username", "email", "subscription_tier")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "title", "created_at", "read_at")
    list_filter = ("kind",)
    search_fields = ("user__username", "user__email", "title")
