from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ntr", "0007_switch_shopify_to_mercadolibre"),
    ]

    operations = [
        migrations.AddField(
            model_name="ntrsettings",
            name="mercadolibre_access_token",
            field=models.TextField(
                blank=True,
                default="",
                help_text="OAuth access token for MercadoLibre (optional).",
            ),
        ),
        migrations.AddField(
            model_name="ntrsettings",
            name="mercadolibre_refresh_token",
            field=models.TextField(
                blank=True,
                default="",
                help_text="OAuth refresh token for MercadoLibre (optional).",
            ),
        ),
        migrations.AddField(
            model_name="ntrsettings",
            name="mercadolibre_token_expires_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When the MercadoLibre access token expires.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="ntrsettings",
            name="mercadolibre_user_id",
            field=models.CharField(
                blank=True,
                default="",
                help_text="MercadoLibre user id for the connected account (optional).",
                max_length=64,
            ),
        ),
    ]
