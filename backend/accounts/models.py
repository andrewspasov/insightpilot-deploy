from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    
    # Make email unique across users
    email = models.EmailField(unique=True)
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)  # old uploads; no longer written
    # The profile photo itself: a small JPEG as a data URL, kept in the
    # database so it survives deploys (Render's disk is wiped on each one).
    avatar_data = models.TextField(blank=True, default="")
    
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

    def __str__(self):
        return self.username
