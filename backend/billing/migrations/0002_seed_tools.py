from django.db import migrations


def seed_tools(apps, schema_editor):
    Tool = apps.get_model("billing", "Tool")
    Tool.objects.update_or_create(
        key="ntr",
        defaults={
            "name": "NicheTrendRadar",
            "description": "Track product niches and detect emerging trends.",
            "sort_order": 1,
        },
    )
    Tool.objects.update_or_create(
        key="nutrition",
        defaults={
            "name": "Nutrition",
            "description": "Nutrition tool (coming soon).",
            "sort_order": 2,
        },
    )


def unseed_tools(apps, schema_editor):
    Tool = apps.get_model("billing", "Tool")
    Tool.objects.filter(key__in=["ntr", "nutrition"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_tools, unseed_tools),
    ]
