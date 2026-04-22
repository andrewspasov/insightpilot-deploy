from django.db import migrations


def forwards(apps, schema_editor):
    Track = apps.get_model("ntr", "Track")
    TrendSnapshot = apps.get_model("ntr", "TrendSnapshot")
    NtrSettings = apps.get_model("ntr", "NtrSettings")

    Track.objects.filter(platform__in=["shopify", "etsy"]).update(platform="mercadolibre")
    TrendSnapshot.objects.filter(platform__in=["shopify", "etsy"]).update(platform="mercadolibre")

    for settings in NtrSettings.objects.all():
        platforms = settings.platforms or []
        cleaned = []
        seen = set()
        for platform in platforms:
            slug = "mercadolibre" if platform in ["shopify", "etsy"] else platform
            if slug in seen:
                continue
            cleaned.append(slug)
            seen.add(slug)
        settings.platforms = cleaned
        settings.save(update_fields=["platforms"])


def backwards(apps, schema_editor):
    # No-op: we don't want to reintroduce legacy values.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("ntr", "0006_normalize_platforms"),
    ]

    operations = [
        migrations.RunPython(forwards, reverse_code=backwards),
    ]
