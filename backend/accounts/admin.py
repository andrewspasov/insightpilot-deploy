from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("Profile", {"fields": ("avatar",)}),
        ("Subscription Info", {"fields": ("subscription_tier", "stripe_customer_id")}),
    )

    list_display = ("username", "email", "subscription_tier")
