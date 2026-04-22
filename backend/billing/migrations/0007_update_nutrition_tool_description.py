from django.db import migrations


def update_nutrition_tool(apps, schema_editor):
    Tool = apps.get_model("billing", "Tool")
    Tool.objects.update_or_create(
        key="nutrition",
        defaults={
            "name": "Nutrition",
            "description": "Track meals, macros, and weight in one nutrition diary.",
            "sort_order": 2,
        },
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0006_order"),
    ]

    operations = [
        migrations.RunPython(update_nutrition_tool, noop_reverse),
    ]
