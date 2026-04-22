from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    
    # Make email unique across users
    email = models.EmailField(unique=True)
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    
    # Stripe customer ID (to link Django user ↔ Stripe)
    stripe_customer_id = models.CharField(max_length=255, blank=True, null=True)

    # Subscription tier (Free / Pro / Enterprise)
    subscription_tier = models.CharField(
        max_length=50,
        default="free",
        choices=[
            ("free", "Free"),
            ("pro", "Pro"),
            ("enterprise", "Enterprise"),
        ],
    )

    # Automation preferences
    daily_trends_enabled = models.BooleanField(default=False)
    weekly_report_enabled = models.BooleanField(default=False)
    price_engine_enabled = models.BooleanField(default=False)

    def __str__(self):
        return self.username
