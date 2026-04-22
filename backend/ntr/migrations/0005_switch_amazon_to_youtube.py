from django.db import migrations, models


def forwards(apps, schema_editor):
    Track = apps.get_model("ntr", "Track")
    TrendSnapshot = apps.get_model("ntr", "TrendSnapshot")
    NtrSettings = apps.get_model("ntr", "NtrSettings")

    Track.objects.filter(platform="amazon").update(platform="youtube")
    TrendSnapshot.objects.filter(platform="amazon").update(platform="youtube")

    for settings in NtrSettings.objects.all():
        platforms = settings.platforms or []
        if "amazon" in platforms:
            settings.platforms = ["youtube" if p == "amazon" else p for p in platforms]
            settings.save()


def backwards(apps, schema_editor):
    Track = apps.get_model("ntr", "Track")
    TrendSnapshot = apps.get_model("ntr", "TrendSnapshot")
    NtrSettings = apps.get_model("ntr", "NtrSettings")

    Track.objects.filter(platform="youtube").update(platform="amazon")
    TrendSnapshot.objects.filter(platform="youtube").update(platform="amazon")

    for settings in NtrSettings.objects.all():
        platforms = settings.platforms or []
        if "youtube" in platforms:
            settings.platforms = ["amazon" if p == "youtube" else p for p in platforms]
            settings.save()


class Migration(migrations.Migration):
    dependencies = [
        ("ntr", "0004_alter_ntrsettings_options_trendsnapshot"),
    ]

    operations = [
        migrations.AlterField(
            model_name="track",
            name="platform",
            field=models.CharField(
                choices=[("youtube", "YouTube"), ("shopify", "Shopify"), ("etsy", "Etsy")],
                default="youtube",
                help_text="Which platform this track should monitor (YouTube, Shopify, Etsy...).",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="ntrsettings",
            name="platforms",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="List of selling platforms, e.g. ['youtube', 'shopify'].",
            ),
        ),
        migrations.AlterField(
            model_name="trendsnapshot",
            name="platform",
            field=models.CharField(
                help_text="Platform for this snapshot, e.g. 'YouTube', 'Shopify', or 'Etsy'.",
                max_length=50,
            ),
        ),
        migrations.RunPython(forwards, backwards),
    ]
