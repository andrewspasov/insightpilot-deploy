from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("ntr", "0009_add_indexes"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AlertRule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("enabled", models.BooleanField(default=True)),
                ("rule_type", models.CharField(choices=[("engagement_gt", "Engagement > threshold"), ("views_spike_pct", "Views spike %"), ("views_gt", "Views > threshold")], max_length=50)),
                ("threshold_value", models.FloatField(default=0.0)),
                ("cooldown_minutes", models.IntegerField(default=60)),
                ("last_triggered_at", models.DateTimeField(blank=True, null=True)),
                ("channels", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("track", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="alert_rules", to="ntr.track")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ntr_alert_rules", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "indexes": [
                    models.Index(fields=["track", "rule_type"], name="ntr_alert_rule_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="NotificationEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("event_type", models.CharField(max_length=50)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("sent", "Sent"), ("failed", "Failed")], default="pending", max_length=20)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("channels", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                ("rule", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="notification_events", to="ntr.alertrule")),
                ("snapshot", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="notification_events", to="ntr.trendsnapshot")),
                ("track", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="notification_events", to="ntr.track")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ntr_notification_events", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "indexes": [
                    models.Index(fields=["user", "created_at"], name="ntr_event_user_idx"),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name="alertrule",
            constraint=models.UniqueConstraint(fields=("track", "rule_type"), name="ntr_alert_rule_track_type_uniq"),
        ),
        migrations.AddConstraint(
            model_name="notificationevent",
            constraint=models.UniqueConstraint(fields=("rule", "snapshot"), name="ntr_event_rule_snapshot_uniq"),
        ),
    ]
