from __future__ import annotations

from django.core.management.base import BaseCommand

from nutrition.exercise_library import import_exercises
from nutrition.models import Exercise


class Command(BaseCommand):
    help = "Create or update the exercise library from the bundled free-exercise-db dataset."

    def handle(self, *args, **options):
        created, updated = import_exercises(Exercise)
        self.stdout.write(self.style.SUCCESS(f"Exercises: {created} created, {updated} updated."))
