"""Fitness replaces NicheTrendRadar; Gold and Platinum become "Coming soon".

- Adds the Fitness tool. Anyone who had NicheTrendRadar selected gets Fitness
  in that slot instead, so slot counts stay the same.
- Removes the NicheTrendRadar tool, its database tables (all `ntr_*`), its
  migration records and its content types. The `ntr` app itself is gone from
  the code.
- Marks Gold and Platinum as coming soon (listed, not for sale).
"""

from django.db import migrations


def forwards(apps, schema_editor):
    Tool = apps.get_model("billing", "Tool")
    SubscriptionItem = apps.get_model("billing", "SubscriptionItem")
    AccessPass = apps.get_model("billing", "AccessPass")

    fitness, _ = Tool.objects.update_or_create(
        key="fitness",
        defaults={
            "name": "Fitness",
            "description": "Workouts and training (coming soon).",
            "is_active": True,
            "sort_order": 2,
        },
    )
    Tool.objects.filter(key="nutrition").update(
        sort_order=1, description="Track meals, macros, and weight in one nutrition diary."
    )

    ntr = Tool.objects.filter(key="ntr").first()
    if ntr:
        for item in SubscriptionItem.objects.filter(tool=ntr):
            if SubscriptionItem.objects.filter(subscription=item.subscription, tool=fitness).exists():
                item.delete()
            else:
                item.tool = fitness
                item.save(update_fields=["tool"])
        ntr.delete()

    AccessPass.objects.filter(key__in=["gold", "platinum"]).update(coming_soon=True)

    # NicheTrendRadar's own tables, if this database ever had them.
    connection = schema_editor.connection
    cascade = " CASCADE" if connection.vendor == "postgresql" else ""
    with connection.cursor() as cursor:
        tables = [t for t in connection.introspection.table_names(cursor) if t.startswith("ntr_")]
    for table in tables:
        schema_editor.execute(f"DROP TABLE IF EXISTS {schema_editor.quote_name(table)}{cascade}")
    schema_editor.execute("DELETE FROM django_migrations WHERE app = 'ntr'")
    ContentType = apps.get_model("contenttypes", "ContentType")
    ContentType.objects.filter(app_label="ntr").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0009_accesspass_coming_soon"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    # Removing data and tables can't be undone automatically.
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
