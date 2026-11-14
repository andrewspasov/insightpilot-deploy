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


class Notification(models.Model):
    """A message for one user, shown on the Notifications page and as a pop-up."""

    KIND_WELCOME = "welcome"
    KIND_SECURITY = "security"
    KIND_PAYMENT = "payment"
    KIND_PAYMENT_FAILED = "payment_failed"
    KIND_PASS = "pass"
    KIND_TOOLS = "tools"
    KIND_REPORT = "report"
    KIND_CHOICES = [
        (KIND_WELCOME, "Welcome"),
        (KIND_SECURITY, "Security"),
        (KIND_PAYMENT, "Payment"),
        (KIND_PAYMENT_FAILED, "Payment failed"),
        (KIND_PASS, "Pass"),
        (KIND_TOOLS, "Tools"),
        (KIND_REPORT, "Report"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=30, choices=KIND_CHOICES)
    title = models.CharField(max_length=160)
    body = models.CharField(max_length=500, blank=True, default="")
    # Where clicking it goes on the website, e.g. "/dashboard/billing".
    link = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.user} · {self.title}"
