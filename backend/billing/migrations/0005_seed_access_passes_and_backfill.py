from django.db import migrations


PASS_DEFINITIONS = [
    {
        "key": "bronze",
        "name": "Bronze Access Pass",
        "monthly_price_cents": 10000,
        "tool_limit": 1,
        "sort_order": 1,
    },
    {
        "key": "silver",
        "name": "Silver Access Pass",
        "monthly_price_cents": 20000,
        "tool_limit": 2,
        "sort_order": 2,
    },
    {
        "key": "gold",
        "name": "Gold Access Pass",
        "monthly_price_cents": 30000,
        "tool_limit": 3,
        "sort_order": 3,
    },
    {
        "key": "platinum",
        "name": "Platinum Access Pass",
        "monthly_price_cents": 40000,
        "tool_limit": 4,
        "sort_order": 4,
    },
]


def _pass_key_for_tool_count(count: int) -> str:
    if count <= 1:
        return "bronze"
    if count == 2:
        return "silver"
    if count == 3:
        return "gold"
    return "platinum"


def seed_access_passes_and_backfill(apps, schema_editor):
    AccessPass = apps.get_model("billing", "AccessPass")
    Subscription = apps.get_model("billing", "Subscription")
    SubscriptionItem = apps.get_model("billing", "SubscriptionItem")

    for definition in PASS_DEFINITIONS:
        AccessPass.objects.update_or_create(
            key=definition["key"],
            defaults=definition,
        )

    passes_by_key = {p.key: p for p in AccessPass.objects.all()}
    for subscription in Subscription.objects.all():
        if subscription.access_pass_id:
            continue
        selected_count = SubscriptionItem.objects.filter(subscription_id=subscription.id).count()
        pass_key = _pass_key_for_tool_count(selected_count)
        access_pass = passes_by_key.get(pass_key)
        if not access_pass:
            continue
        subscription.access_pass_id = access_pass.id
        subscription.save(update_fields=["access_pass"])


def unseed_access_passes(apps, schema_editor):
    AccessPass = apps.get_model("billing", "AccessPass")
    AccessPass.objects.filter(key__in=[d["key"] for d in PASS_DEFINITIONS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0004_accesspass_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_access_passes_and_backfill, unseed_access_passes),
    ]
