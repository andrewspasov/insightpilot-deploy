from django.db import migrations


def forget_misses(apps, schema_editor):
    # Foods cached as "no photo" are looked up again with the shorter fallback
    # searches (e.g. "pepperoni pizza" for "Domino's Pepperoni Pizza").
    apps.get_model("nutrition", "FoodImage").objects.filter(image_url="").delete()


class Migration(migrations.Migration):
    dependencies = [("nutrition", "0016_food_image_credit_links")]

    operations = [migrations.RunPython(forget_misses, migrations.RunPython.noop)]
