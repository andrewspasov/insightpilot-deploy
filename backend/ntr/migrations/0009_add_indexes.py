from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ntr", "0008_add_mercadolibre_tokens"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="track",
            index=models.Index(
                fields=["owner", "created_at"],
                name="ntr_track_owner_created_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="track",
            index=models.Index(
                fields=["status", "next_run_at"],
                name="ntr_track_status_next_run_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="trendsnapshot",
            index=models.Index(
                fields=["track", "run_at"],
                name="ntr_snapshot_track_run_idx",
            ),
        ),
    ]
