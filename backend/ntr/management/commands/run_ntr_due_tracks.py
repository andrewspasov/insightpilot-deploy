# backend/ntr/management/commands/run_ntr_due_tracks.py

# BaseCommand is the Django way to define your own "manage.py" commands
from django.core.management.base import BaseCommand

# timezone gives us "now()" with timezone awareness
from django.utils import timezone

# Q helps us build "OR" queries in Django
from django.db.models import Q

# Import your NTR models
from ntr.models import Track, NtrSettings

# Import the shared engine function we created in step 27
from ntr.engine import run_ntr_engine_for_track


class Command(BaseCommand):
    """
    This command will be available as:
        python manage.py run_ntr_due_tracks

    It finds all tracks that:
      - are active
      - AND are "due" (next_run_at <= now OR next_run_at is null)

    For each due track, it:
      - loads the user's NtrSettings
      - calls run_ntr_engine_for_track(track, settings)
      - prints some info in the terminal
    """

    # "help" is shown when you run: python manage.py help run_ntr_due_tracks
    help = "Run NicheTrendRadar engine for all tracks that are due based on next_run_at."

    def handle(self, *args, **options):
        """
        This method is the 'main' of the command.
        Django calls this when you run: python manage.py run_ntr_due_tracks
        """

        # 1) Get the current time
        now = timezone.now()

        # 2) Build a queryset of "due" tracks:
        #    - status is 'active'
        #    - AND (next_run_at is null OR next_run_at <= now)
        due_tracks = Track.objects.filter(
            status="active"
        ).filter(
            Q(next_run_at__isnull=True) | Q(next_run_at__lte=now)
        ).select_related("owner")  # select_related avoids extra DB queries for owner

        # If there is nothing to do, just exit nicely
        if not due_tracks.exists():
            self.stdout.write(self.style.SUCCESS("No due tracks to run."))
            return

        # Counter for how many tracks we actually ran
        ran_count = 0

        # 3) Loop over each due track
        for track in due_tracks:
            # For each track, we need that owner's settings.
            # get_or_create: if settings don't exist yet, Django creates them.
            settings_obj, _created = NtrSettings.objects.get_or_create(
                owner=track.owner
            )

            # Use a try/except so that one failing track does not stop all others
            try:
                # Call the shared engine function from engine.py
                snapshot = run_ntr_engine_for_track(track, settings_obj)

                ran_count += 1

                # Print info to the console so we can see what happened
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✓ Ran track #{track.id} '{track.name}' "
                        f"for user {track.owner_id}, snapshot #{snapshot.id}"
                    )
                )
            except Exception as e:
                # If something goes wrong for this track, we log the error, but keep going
                self.stderr.write(
                    self.style.ERROR(
                        f"⚠ Error running track #{track.id} '{track.name}': {e}"
                    )
                )

        # 4) At the end, print a summary
        self.stdout.write(
            self.style.SUCCESS(f"Done. Ran {ran_count} track(s) that were due.")
        )