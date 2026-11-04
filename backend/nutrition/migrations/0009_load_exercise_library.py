from django.db import migrations

from nutrition.exercise_library import import_exercises


def load_library(apps, schema_editor):
    import_exercises(apps.get_model("nutrition", "Exercise"))


class Migration(migrations.Migration):

    dependencies = [
        ("nutrition", "0008_plans_workouts_body_stats"),
    ]

    operations = [
        migrations.RunPython(load_library, migrations.RunPython.noop),
    ]
