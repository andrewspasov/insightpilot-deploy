"""Rule-based workout programs, so every plan can get a program without the AI.

Ready-made splits (or the user's own day titles, like "Chest, triceps, middle
delts") are turned into exercises from the library for the chosen equipment.
Exercises rotate through each muscle's list, so a muscle trained twice a week
gets different movements on each day.
"""

from __future__ import annotations

import re

from .models import Exercise, NutritionProfile, PlanExercise

EQUIPMENT_GYM = "gym"
EQUIPMENT_HOME = "home"
EQUIPMENT_CHOICES = [(EQUIPMENT_GYM, "Full gym"), (EQUIPMENT_HOME, "Home / bodyweight")]

GEAR_BANDS = "bands"
GEAR_PULL_UP_BAR = "pull_up_bar"
HOME_GEAR_CHOICES = [(GEAR_BANDS, "Resistance bands"), (GEAR_PULL_UP_BAR, "Pull-up bar")]
ALL_HOME_GEAR = [key for key, _ in HOME_GEAR_CHOICES]

# Library slugs per muscle group, compound movements first. Home lists use
# bodyweight first, then bands and pull-up bar moves (see NEEDS_GEAR).
POOLS: dict[str, dict[str, list[str]]] = {
    "chest": {
        "gym": ["Barbell_Bench_Press_-_Medium_Grip", "Incline_Dumbbell_Press", "Dumbbell_Bench_Press",
                "Barbell_Incline_Bench_Press_-_Medium_Grip", "Machine_Bench_Press", "Cable_Crossover",
                "Dumbbell_Flyes", "Butterfly", "Incline_Cable_Flye"],
        "home": ["Pushups", "Push-Ups_With_Feet_Elevated", "Push-Up_Wide", "Incline_Push-Up",
                 "Decline_Push-Up", "Dips_-_Chest_Version", "Bench_Press_-_With_Bands", "Cross_Over_-_With_Bands"],
    },
    "shoulders": {
        "gym": ["Dumbbell_Shoulder_Press", "Standing_Military_Press", "Arnold_Dumbbell_Press",
                "Machine_Shoulder_Military_Press"],
        "home": ["Shoulder_Press_-_With_Bands", "Handstand_Push-Ups", "Push_Up_to_Side_Plank"],
    },
    "side_delts": {
        "gym": ["Side_Lateral_Raise", "Cable_Seated_Lateral_Raise", "One-Arm_Side_Laterals", "Seated_Side_Lateral_Raise"],
        "home": ["Lateral_Raise_-_With_Bands"],
    },
    "rear_delts": {
        "gym": ["Face_Pull", "Cable_Rear_Delt_Fly", "Reverse_Machine_Flyes",
                "Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench"],
        "home": ["Band_Pull_Apart", "Back_Flyes_-_With_Bands"],
    },
    "triceps": {
        "gym": ["Triceps_Pushdown_-_Rope_Attachment", "Close-Grip_Barbell_Bench_Press",
                "Cable_Rope_Overhead_Triceps_Extension", "Dips_-_Triceps_Version", "EZ-Bar_Skullcrusher",
                "Triceps_Pushdown"],
        "home": ["Push-Ups_-_Close_Triceps_Position", "Bench_Dips", "Dips_-_Triceps_Version", "Body_Tricep_Press",
                 "Band_Skull_Crusher", "Speed_Band_Overhead_Triceps"],
    },
    "biceps": {
        "gym": ["Barbell_Curl", "Dumbbell_Bicep_Curl", "Hammer_Curls", "Incline_Dumbbell_Curl", "Preacher_Curl",
                "Cable_Hammer_Curls_-_Rope_Attachment", "EZ-Bar_Curl"],
        "home": ["Chin-Up", "Inverted_Row"],
    },
    "back": {
        "gym": ["Wide-Grip_Lat_Pulldown", "Bent_Over_Barbell_Row", "Seated_Cable_Rows", "Pullups",
                "One-Arm_Dumbbell_Row", "Close-Grip_Front_Lat_Pulldown", "T-Bar_Row_with_Handle",
                "Straight-Arm_Pulldown"],
        "home": ["Pullups", "Inverted_Row", "Chin-Up", "Bodyweight_Mid_Row", "V-Bar_Pullup", "Superman"],
    },
    "traps": {
        "gym": ["Dumbbell_Shrug", "Barbell_Shrug"],
        "home": ["Scapular_Pull-Up", "Upright_Row_-_With_Bands"],
    },
    "quads": {
        "gym": ["Barbell_Squat", "Leg_Press", "Hack_Squat", "Dumbbell_Lunges", "Barbell_Walking_Lunge",
                "Leg_Extensions"],
        "home": ["Bodyweight_Squat", "Bodyweight_Walking_Lunge", "Freehand_Jump_Squat", "Step-up_with_Knee_Raise",
                 "Squats_-_With_Bands"],
    },
    "hamstrings": {
        "gym": ["Romanian_Deadlift", "Lying_Leg_Curls", "Stiff-Legged_Dumbbell_Deadlift", "Seated_Leg_Curl",
                "Good_Morning"],
        "home": ["Natural_Glute_Ham_Raise", "Floor_Glute-Ham_Raise", "Single_Leg_Glute_Bridge"],
    },
    "glutes": {
        "gym": ["Barbell_Hip_Thrust", "Barbell_Glute_Bridge", "Pull_Through"],
        "home": ["Single_Leg_Glute_Bridge", "Butt_Lift_Bridge", "Glute_Kickback", "Hip_Extension_with_Bands"],
    },
    "calves": {
        "gym": ["Standing_Calf_Raises", "Seated_Calf_Raise", "Calf_Press_On_The_Leg_Press_Machine"],
        "home": ["Calf_Raises_-_With_Bands"],
    },
    "abs": {
        "gym": ["Cable_Crunch", "Hanging_Leg_Raise", "Plank", "Ab_Roller", "Russian_Twist"],
        "home": ["Plank", "Crunches", "Flat_Bench_Lying_Leg_Raise", "Russian_Twist", "Dead_Bug", "Air_Bike"],
    },
}

# Home exercises that need gear beyond the floor, a wall and a chair or bench.
NEEDS_GEAR: dict[str, str] = {
    **{slug: GEAR_BANDS for slug in [
        "Bench_Press_-_With_Bands", "Cross_Over_-_With_Bands", "Shoulder_Press_-_With_Bands",
        "Lateral_Raise_-_With_Bands", "Band_Pull_Apart", "Back_Flyes_-_With_Bands", "Band_Skull_Crusher",
        "Speed_Band_Overhead_Triceps", "Upright_Row_-_With_Bands", "Squats_-_With_Bands",
        "Hip_Extension_with_Bands", "Calf_Raises_-_With_Bands",
    ]},
    **{slug: GEAR_PULL_UP_BAR for slug in [
        "Pullups", "Chin-Up", "V-Bar_Pullup", "Inverted_Row", "Bodyweight_Mid_Row", "Scapular_Pull-Up",
    ]},
}

MUSCLE_LABELS = {
    "chest": "Chest", "shoulders": "Shoulders", "side_delts": "Side delts", "rear_delts": "Rear delts", "triceps": "Triceps",
    "biceps": "Biceps", "back": "Back", "traps": "Traps", "quads": "Quads", "hamstrings": "Hamstrings",
    "glutes": "Glutes", "calves": "Calves", "abs": "Abs",
}

# Small muscles always get lighter, higher-rep work, whatever the library calls the movement.
ISOLATION_GROUPS = {"side_delts", "rear_delts", "biceps", "calves", "traps"}

# Exercises held for time rather than counted.
TIMED = {"Plank", "Push_Up_to_Side_Plank"}

PUSH = [("chest", 2), ("shoulders", 1), ("side_delts", 1), ("triceps", 2)]
PULL = [("back", 3), ("rear_delts", 1), ("biceps", 2)]
LEGS = [("quads", 2), ("hamstrings", 2), ("glutes", 1), ("calves", 1)]
UPPER = [("chest", 2), ("back", 2), ("shoulders", 1), ("biceps", 1), ("triceps", 1)]
LOWER = [("quads", 2), ("hamstrings", 2), ("glutes", 1), ("calves", 1)]
FULL = [("quads", 1), ("chest", 1), ("back", 2), ("shoulders", 1), ("hamstrings", 1), ("biceps", 1), ("triceps", 1)]

# key: (name, description, [(day title, groups, heavy)])
SPLITS: dict[str, tuple[str, str, list[tuple[str, list, bool]]]] = {
    "full_body_2": ("Full body · 2 days", "Whole body twice a week. Good when time is short.",
                    [("Full body A", FULL, False), ("Full body B", FULL, False)]),
    "full_body_3": ("Full body · 3 days", "Whole body three times a week. Great for beginners.",
                    [("Full body A", FULL, False), ("Full body B", FULL, False), ("Full body C", FULL, False)]),
    "upper_lower_4": ("Upper / Lower · 4 days", "Upper and lower body, each twice a week.",
                      [("Upper A", UPPER, False), ("Lower A", LOWER, False),
                       ("Upper B", UPPER, False), ("Lower B", LOWER, False)]),
    "ppl_3": ("Push / Pull / Legs · 3 days", "Each muscle once a week with plenty of volume.",
              [("Push", PUSH, False), ("Pull", PULL, False), ("Legs", LEGS, False)]),
    "ppl_6": ("Push / Pull / Legs · 6 days", "Each muscle twice a week. High volume.",
              [("Push A", PUSH, False), ("Pull A", PULL, False), ("Legs A", LEGS, False),
               ("Push B", PUSH, False), ("Pull B", PULL, False), ("Legs B", LEGS, False)]),
    "body_part_5": ("Body-part split · 5 days", "One muscle group per day.",
                    [("Chest", [("chest", 4), ("triceps", 1)], False),
                     ("Back", [("back", 4), ("traps", 1)], False),
                     ("Shoulders", [("shoulders", 2), ("side_delts", 2), ("rear_delts", 1)], False),
                     ("Legs", [("quads", 3), ("hamstrings", 2), ("calves", 1)], False),
                     ("Arms", [("biceps", 3), ("triceps", 3)], False)]),
    "arnold_6": ("Arnold split · 6 days", "Chest + back, shoulders + arms, legs, twice a week.",
                 [("Chest & back A", [("chest", 3), ("back", 3)], False),
                  ("Shoulders & arms A", [("shoulders", 1), ("side_delts", 1), ("rear_delts", 1), ("biceps", 2), ("triceps", 2)], False),
                  ("Legs A", LEGS, False),
                  ("Chest & back B", [("chest", 3), ("back", 3)], False),
                  ("Shoulders & arms B", [("shoulders", 1), ("side_delts", 1), ("rear_delts", 1), ("biceps", 2), ("triceps", 2)], False),
                  ("Legs B", LEGS, False)]),
    "phul_4": ("PHUL · 4 days", "Power and hypertrophy, upper and lower: heavy days and volume days.",
               [("Upper power", [("chest", 1), ("back", 2), ("shoulders", 1), ("biceps", 1), ("triceps", 1)], True),
                ("Lower power", [("quads", 2), ("hamstrings", 1), ("calves", 1)], True),
                ("Upper hypertrophy", [("chest", 2), ("back", 2), ("side_delts", 1), ("biceps", 1), ("triceps", 1)], False),
                ("Lower hypertrophy", [("quads", 2), ("hamstrings", 2), ("glutes", 1), ("calves", 1)], False)]),
    "ppl_ul_5": ("Push / Pull / Legs + Upper / Lower · 5 days", "PPL plus an upper and a lower day.",
                 [("Push", PUSH, False), ("Pull", PULL, False), ("Legs", LEGS, False),
                  ("Upper", UPPER, False), ("Lower", LOWER, False)]),
}

# Default weekdays (0 = Monday) for each number of training days.
DEFAULT_WEEKDAYS = {
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5],
}

# Words in a day title and the muscle groups they mean. Longer phrases first.
TITLE_KEYWORDS: list[tuple[str, list[str]]] = [
    (r"full[\s-]*body", [g for g, _ in FULL]),
    (r"rear[\s-]*delts?", ["rear_delts"]),
    (r"(middle|side|lateral)[\s-]*delts?", ["side_delts"]),
    (r"front[\s-]*delts?", ["shoulders"]),
    (r"upper", [g for g, _ in UPPER]),
    (r"lower", [g for g, _ in LOWER]),
    (r"push", [g for g, _ in PUSH]),
    (r"pull", [g for g, _ in PULL]),
    (r"legs?", ["quads", "hamstrings", "calves"]),
    (r"arms?", ["biceps", "triceps"]),
    (r"chest|pecs?", ["chest"]),
    (r"backs?|lats?", ["back"]),
    (r"shoulders?|delts?", ["shoulders", "side_delts"]),
    (r"triceps?|tri'?s", ["triceps"]),
    (r"biceps?|bi'?s", ["biceps"]),
    (r"quads?|quadriceps", ["quads"]),
    (r"hamstrings?|hams", ["hamstrings"]),
    (r"glutes?|butt", ["glutes"]),
    (r"calf|calves", ["calves"]),
    (r"traps?", ["traps"]),
    (r"abs|abdominals?|core", ["abs"]),
]

BIG_GROUPS = {"chest", "back", "quads", "hamstrings"}
TARGET_EXERCISES = 6
MAX_EXERCISES = 7
# Dropped when a day names too many muscles for one session: the first five
# (optional small muscles) before any big muscle loses its second exercise.
TRIM_ORDER = ["traps", "rear_delts", "glutes", "calves", "side_delts", "biceps", "triceps", "shoulders"]


class ProgramError(ValueError):
    pass


def normalize_equipment(value: str | None) -> str:
    text = (value or "").lower()
    if text in (EQUIPMENT_HOME,) or "home" in text or "bodyweight" in text or "body weight" in text:
        return EQUIPMENT_HOME
    return EQUIPMENT_GYM


def normalize_gear(value) -> list[str]:
    """Known home gear keys from a list, in a stable order."""
    chosen = set(value) if isinstance(value, (list, tuple, set)) else set()
    return [key for key in ALL_HOME_GEAR if key in chosen]


def groups_from_title(title: str) -> list[str]:
    """Muscle groups named in a day title, in the order they appear."""
    text = f" {title.lower()} "
    found: list[tuple[int, str]] = []
    for pattern, groups in TITLE_KEYWORDS:
        for match in re.finditer(rf"\b(?:{pattern})\b", text):
            found.extend((match.start(), g) for g in groups)
            text = text[: match.start()] + " " * (match.end() - match.start()) + text[match.end():]
    ordered: list[str] = []
    for _, group in sorted(found, key=lambda pair: pair[0]):
        if group not in ordered:
            ordered.append(group)
    return ordered


def counts_for_groups(groups: list[str]) -> list[tuple[str, int]]:
    """Spread about six exercises over the named groups, more for big muscles."""
    strength = [g for g in groups if g != "abs"]
    counts = {g: (2 if g in BIG_GROUPS else 1) for g in strength}
    if len(strength) == 1:
        counts[strength[0]] = 4 if strength[0] in BIG_GROUPS else 3
    while strength and sum(counts.values()) < TARGET_EXERCISES:
        group = min(
            (g for g in strength if counts[g] < 4),
            key=lambda g: (counts[g] / (2 if g in BIG_GROUPS else 1), strength.index(g)),
            default=None,
        )
        if group is None:
            break
        counts[group] += 1
    while sum(counts.values()) > MAX_EXERCISES:
        optional = [g for g in TRIM_ORDER[:5] if counts.get(g)]
        doubled = [g for g in strength if counts[g] > 1]
        if optional:
            counts[optional[0]] = 0
        elif doubled:
            counts[max(doubled, key=lambda g: (counts[g], -strength.index(g)))] -= 1
        else:
            droppable = [g for g in TRIM_ORDER if counts.get(g)]
            if not droppable:
                break
            counts[droppable[0]] = 0
    return [(g, counts[g]) for g in strength if counts[g]]


def _prescription(exercise: Exercise, goal: str, heavy: bool, is_abs: bool, group: str = "") -> dict:
    if is_abs:
        if exercise.slug in TIMED:
            return {"sets": 3, "rep_min": 30, "rep_max": 60, "rest_seconds": 60, "notes": "Seconds per set"}
        return {"sets": 3, "rep_min": 12, "rep_max": 20, "rest_seconds": 60, "notes": ""}
    compound = exercise.mechanic == "compound" and group not in ISOLATION_GROUPS
    if exercise.slug in TIMED:
        return {"sets": 3, "rep_min": 20, "rep_max": 40, "rest_seconds": 60, "notes": "Seconds per side"}
    if heavy and compound:
        return {"sets": 4, "rep_min": 4, "rep_max": 6, "rest_seconds": 180, "notes": ""}
    if compound:
        sets = 4 if goal == NutritionProfile.GOAL_GAIN else 3
        return {"sets": sets, "rep_min": 6, "rep_max": 10, "rest_seconds": 120, "notes": ""}
    return {"sets": 3, "rep_min": 10, "rep_max": 15, "rest_seconds": 75, "notes": ""}


class ProgramBuilder:
    """Picks exercises, rotating per muscle so repeats in a week use new movements.

    At home only exercises the user's gear allows are used (gear=None means all);
    muscles left with no exercise are collected in `missing`.
    """

    def __init__(self, equipment: str, goal: str, gear: list[str] | None = None):
        self.equipment = normalize_equipment(equipment)
        self.goal = goal
        self.gear = set(ALL_HOME_GEAR if gear is None else normalize_gear(gear))
        self.cursor: dict[str, int] = {}
        self.missing: list[str] = []
        slugs = {slug for pools in POOLS.values() for slug in pools[self.equipment] if self._allowed(slug)}
        self.library = {e.slug: e for e in Exercise.objects.filter(slug__in=slugs)}

    def _allowed(self, slug: str) -> bool:
        return self.equipment != EQUIPMENT_HOME or NEEDS_GEAR.get(slug, "") in self.gear | {""}

    def _take(self, group: str, count: int, used: set[str]) -> list[Exercise]:
        pool = [s for s in POOLS[group][self.equipment] if s in self.library]
        if not pool and count and MUSCLE_LABELS[group] not in self.missing:
            self.missing.append(MUSCLE_LABELS[group])
        picked: list[Exercise] = []
        start = self.cursor.get(group, 0)
        for offset in range(len(pool)):
            if len(picked) >= count:
                break
            slug = pool[(start + offset) % len(pool)]
            if slug in used:
                continue
            used.add(slug)
            picked.append(self.library[slug])
        if pool:
            self.cursor[group] = (start + max(len(picked), 1)) % len(pool)
        return picked

    def build_day(
        self,
        groups: list[tuple[str, int]],
        heavy: bool = False,
        include_abs: bool = True,
        abs_count: int = 1,
    ) -> list[dict]:
        self.missing = []
        used: set[str] = set()
        compounds: list[dict] = []
        isolations: list[dict] = []
        for group, count in groups:
            for exercise in self._take(group, count, used):
                prescription = _prescription(exercise, self.goal, heavy, is_abs=False, group=group)
                entry = {
                    "exercise_id": exercise.id,
                    "name": exercise.name,
                    "kind": PlanExercise.KIND_STRENGTH,
                    **prescription,
                }
                # Heavier work first, then the higher-rep isolation work.
                (compounds if prescription["rep_min"] < 10 else isolations).append(entry)
        exercises = compounds + isolations
        if include_abs:
            for exercise in self._take("abs", abs_count, used):
                exercises.append(
                    {
                        "exercise_id": exercise.id,
                        "name": exercise.name,
                        "kind": PlanExercise.KIND_STRENGTH,
                        **_prescription(exercise, self.goal, heavy, is_abs=True),
                    }
                )
        return exercises

    def build_from_title(self, title: str, include_abs: bool = True) -> list[dict] | None:
        groups = groups_from_title(title)
        if not groups:
            return None
        wants_abs = include_abs or "abs" in groups
        strength = counts_for_groups(groups)
        if not strength:
            # A dedicated core day.
            return self.build_day([], include_abs=True, abs_count=3)
        return self.build_day(strength, include_abs=wants_abs)


def split_summaries() -> list[dict]:
    return [
        {
            "key": key,
            "name": name,
            "description": description,
            "days_per_week": len(days),
            "day_titles": [title for title, _, _ in days],
            "default_weekdays": DEFAULT_WEEKDAYS[len(days)],
        }
        for key, (name, description, days) in SPLITS.items()
    ]


def suggest_program(
    *,
    equipment: str,
    goal: str,
    include_abs: bool = True,
    gear: list[str] | None = None,
    split: str | None = None,
    weekdays: list[int] | None = None,
    days: list[dict] | None = None,
) -> dict:
    """Return {"days": [{weekday, title, exercises, missing}], "unrecognized": [weekday, ...]}.

    With a split, its days are placed on `weekdays` (or the defaults). Without
    one, each of `days` ({weekday, title}) gets exercises for the muscles its
    title names. `missing` lists muscles the home gear has no exercise for.
    """
    builder = ProgramBuilder(equipment, goal, gear)
    result: list[dict] = []
    unrecognized: list[int] = []
    if split:
        if split not in SPLITS:
            raise ProgramError("Unknown split.")
        _, _, template_days = SPLITS[split]
        chosen = sorted(set(weekdays or [])) or DEFAULT_WEEKDAYS[len(template_days)]
        if len(chosen) != len(template_days):
            raise ProgramError(f"This split needs {len(template_days)} training days.")
        for weekday, (title, groups, heavy) in zip(chosen, template_days):
            result.append(
                {
                    "weekday": weekday,
                    "title": title,
                    "exercises": builder.build_day(groups, heavy=heavy, include_abs=include_abs),
                    "missing": builder.missing,
                }
            )
    else:
        for raw in sorted(days or [], key=lambda d: int(d.get("weekday", 0))):
            title = str(raw.get("title") or "").strip()
            exercises = builder.build_from_title(title, include_abs=include_abs) if title else None
            if exercises is None:
                unrecognized.append(int(raw.get("weekday", 0)))
                continue
            result.append(
                {"weekday": int(raw["weekday"]), "title": title, "exercises": exercises, "missing": builder.missing}
            )
    return {"days": result, "unrecognized": unrecognized}
