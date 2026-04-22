from django.db import migrations


def forwards(apps, schema_editor):
    NtrSettings = apps.get_model("ntr", "NtrSettings")

    for settings in NtrSettings.objects.all():
        platforms = settings.platforms or []
        cleaned = []
        seen = set()
        for platform in platforms:
            slug = str(platform).strip().lower()
            if not slug:
                continue
            if slug == "amazon":
                slug = "youtube"
            if slug in seen:
                continue
            cleaned.append(slug)
            seen.add(slug)
        settings.platforms = cleaned
        settings.save(update_fields=["platforms"])


def backwards(apps, schema_editor):
    # No-op: we don't want to reintroduce duplicates or legacy values.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("ntr", "0005_switch_amazon_to_youtube"),
    ]

    operations = [
        migrations.RunPython(forwards, reverse_code=backwards),
    ]
