from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="InsightAIUsage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("provider", models.CharField(default="gemini", max_length=50)),
                ("model", models.CharField(max_length=120)),
                (
                    "status",
                    models.CharField(
                        choices=[("success", "Success"), ("error", "Error")],
                        default="success",
                        max_length=20,
                    ),
                ),
                ("message_preview", models.TextField(blank=True, default="")),
                ("response_preview", models.TextField(blank=True, default="")),
                ("prompt_tokens", models.PositiveIntegerField(default=0)),
                ("completion_tokens", models.PositiveIntegerField(default=0)),
                ("total_tokens", models.PositiveIntegerField(default=0)),
                ("error_message", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="insight_ai_usage",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="insightaiusage",
            index=models.Index(fields=["user", "created_at"], name="insight_ai_user_created_idx"),
        ),
        migrations.AddIndex(
            model_name="insightaiusage",
            index=models.Index(fields=["status", "created_at"], name="insight_ai_status_created_idx"),
        ),
    ]
