"""Match free-text exercise names (e.g. from the AI) to the exercise library."""

from __future__ import annotations

import re

from .models import Exercise

STOPWORDS = {"the", "with", "and", "a", "an", "on", "of", "to", "for", "exercise"}
ALIASES = {
    "db": "dumbbell",
    "dumbbells": "dumbbell",
    "bb": "barbell",
    "kb": "kettlebell",
    "kettlebells": "kettlebell",
    "bicep": "biceps",
    "tricep": "triceps",
    "pulldowns": "pulldown",
    "pushdown": "pushdown",
    "situps": "sit-up",
    "pullups": "pullup",
    "pull-up": "pullup",
    "pull-ups": "pullup",
    "chin-up": "chinup",
    "chin-ups": "chinup",
    "push-up": "pushup",
    "push-ups": "pushup",
    "pushups": "pushup",
    "rdl": "romanian deadlift",
    "ohp": "overhead press",
    "abs": "ab",
    "jogging": "jog",
    "running": "run",
    "treadmill": "treadmill",
}

# Grip/variant words that shouldn't decide between an exercise's variants.
NOISE_WORDS = {"medium", "grip", "version", "attachment"}

# The standard variant for names people (and models) use most often.
CANONICAL = {
    "bench press": "Barbell_Bench_Press_-_Medium_Grip",
    "barbell bench press": "Barbell_Bench_Press_-_Medium_Grip",
    "flat bench press": "Barbell_Bench_Press_-_Medium_Grip",
    "incline bench press": "Barbell_Incline_Bench_Press_-_Medium_Grip",
    "incline barbell bench press": "Barbell_Incline_Bench_Press_-_Medium_Grip",
    "dumbbell bench press": "Dumbbell_Bench_Press",
    "lat pulldown": "Wide-Grip_Lat_Pulldown",
    "wide grip lat pulldown": "Wide-Grip_Lat_Pulldown",
    "barbell row": "Bent_Over_Barbell_Row",
    "bent over row": "Bent_Over_Barbell_Row",
    "bent over barbell row": "Bent_Over_Barbell_Row",
    "dumbbell row": "One-Arm_Dumbbell_Row",
    "one arm dumbbell row": "One-Arm_Dumbbell_Row",
    "t bar row": "T-Bar_Row_with_Handle",
    "overhead press": "Standing_Military_Press",
    "military press": "Standing_Military_Press",
    "barbell overhead press": "Standing_Military_Press",
    "shoulder press": "Dumbbell_Shoulder_Press",
    "dumbbell shoulder press": "Dumbbell_Shoulder_Press",
    "lateral raise": "Side_Lateral_Raise",
    "dumbbell lateral raise": "Side_Lateral_Raise",
    "side lateral raise": "Side_Lateral_Raise",
    "cable lateral raise": "Cable_Seated_Lateral_Raise",
    "cable fly": "Cable_Crossover",
    "cable flye": "Cable_Crossover",
    "cable crossover": "Cable_Crossover",
    "chest fly": "Dumbbell_Flyes",
    "dumbbell fly": "Dumbbell_Flyes",
    "pec deck": "Butterfly",
    "pec fly": "Butterfly",
    "overhead tricep extension": "Cable_Rope_Overhead_Triceps_Extension",
    "overhead triceps extension": "Cable_Rope_Overhead_Triceps_Extension",
    "skull crusher": "EZ-Bar_Skullcrusher",
    "skull crushers": "EZ-Bar_Skullcrusher",
    "squat": "Barbell_Squat",
    "back squat": "Barbell_Squat",
    "barbell squat": "Barbell_Squat",
    "push up": "Pushups",
    "push ups": "Pushups",
    "crunch": "Crunches",
    "crunches": "Crunches",
    "tricep dips": "Dips_-_Triceps_Version",
    "triceps dips": "Dips_-_Triceps_Version",
    "dips": "Dips_-_Triceps_Version",
    "chest dips": "Dips_-_Chest_Version",
    "bulgarian split squat": "Split_Squat_with_Dumbbells",
    "lunges": "Dumbbell_Lunges",
    "dumbbell lunges": "Dumbbell_Lunges",
    "shrugs": "Dumbbell_Shrug",
    "dumbbell shrug": "Dumbbell_Shrug",
    "running": "Running_Treadmill",
    "run": "Running_Treadmill",
    "jogging": "Jogging_Treadmill",
    "cycling": "Bicycling",
    "walking": "Walking_Treadmill",
    "rowing": "Rowing_Stationary",
    "jump rope": "Rope_Jumping",
}

EQUIPMENT_WORDS = {"barbell", "dumbbell", "cable", "machine", "kettlebell", "smith", "band", "bands"}
MIN_SCORE = 0.34


def _stem(word: str) -> str:
    if len(word) > 4 and word.endswith("es") and not word.endswith("ses"):
        return word[:-2] if word.endswith("ches") else word[:-1]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def tokenize(text: str) -> set[str]:
    words = re.split(r"[^a-z0-9\-]+", text.lower())
    tokens: set[str] = set()
    for word in words:
        word = word.strip("-")
        if not word or word in STOPWORDS:
            continue
        expanded = ALIASES.get(word, word)
        for part in expanded.replace("-", " ").split():
            if part and part not in STOPWORDS and part not in NOISE_WORDS:
                tokens.add(_stem(part))
    return tokens


def _canonical_key(text: str) -> str:
    return " ".join(re.split(r"[^a-z0-9]+", text.lower())).strip()


def _score(query: set[str], exercise: Exercise, tokens: set[str], muscle: str, equipment: str) -> float:
    shared = query & tokens
    # Sharing only an equipment word ("dumbbell") is not a match.
    if not shared - EQUIPMENT_WORDS:
        return 0.0
    score = len(shared) / len(query | tokens)
    if muscle and muscle in exercise.primary_muscles:
        score += 0.15
    if equipment and exercise.equipment == equipment:
        score += 0.1
    if exercise.category == "stretching" and "stretch" not in query:
        score -= 0.3
    return score


def match_exercise(name: str, muscle: str = "", equipment: str = "", library: list[Exercise] | None = None) -> Exercise | None:
    """Best library exercise for a free-text name, or None when nothing is close enough."""
    query = tokenize(name)
    if not query:
        return None
    canonical = CANONICAL.get(_canonical_key(name))
    if canonical:
        if library is None:
            found = Exercise.objects.filter(slug=canonical).first()
        else:
            found = next((e for e in library if e.slug == canonical), None)
        if found:
            return found
    muscle = (muscle or "").strip().lower()
    equipment = (equipment or "").strip().lower()
    if library is None:
        library = list(Exercise.objects.all())

    best: Exercise | None = None
    best_score = 0.0
    for exercise in library:
        tokens = tokenize(exercise.name)
        if tokens == query:
            return exercise
        score = _score(query, exercise, tokens, muscle, equipment)
        if score > best_score:
            best, best_score = exercise, score
    return best if best_score >= MIN_SCORE else None
