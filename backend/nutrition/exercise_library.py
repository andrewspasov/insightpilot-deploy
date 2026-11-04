"""Import the bundled free-exercise-db dataset into the Exercise table."""

from __future__ import annotations

import json
from pathlib import Path

DATASET_PATH = Path(__file__).resolve().parent / "data" / "free_exercise_db.json"


def load_dataset() -> list[dict]:
    with DATASET_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def import_exercises(exercise_model) -> tuple[int, int]:
    """Create or update every exercise in the dataset.

    Takes the model class so data migrations can pass their historical model.
    Returns (created, updated).
    """
    created = updated = 0
    for item in load_dataset():
        _, was_created = exercise_model.objects.update_or_create(
            slug=item["id"],
            defaults={
                "name": item["name"],
                "category": item.get("category") or "",
                "equipment": item.get("equipment") or "",
                "level": item.get("level") or "",
                "force": item.get("force") or "",
                "mechanic": item.get("mechanic") or "",
                "primary_muscles": item.get("primaryMuscles") or [],
                "secondary_muscles": item.get("secondaryMuscles") or [],
                "instructions": item.get("instructions") or [],
                "images": item.get("images") or [],
            },
        )
        if was_created:
            created += 1
        else:
            updated += 1
    return created, updated
