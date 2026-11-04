from __future__ import annotations

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from nutrition.models import (
    Exercise,
    ExerciseEntry,
    MealEntry,
    NutritionProfile,
    Plan,
    PlanExercise,
    WeightEntry,
)
from nutrition.planning import PlanInputError, PlanInputs, bmr_mifflin_st_jeor, calculate_plan
from nutrition.tests import NutritionApiTests

User = get_user_model()

FIVE_DAY_SPLIT = [
    {"weekday": day, "activity": "weights", "duration_min": 70} for day in range(5)
] + [{"weekday": day, "activity": "running", "duration_min": 30} for day in range(5)]


def _inputs(**overrides) -> PlanInputs:
    values = {
        "goal_type": "gain",
        "sex": "male",
        "age": 27,
        "height_cm": 180,
        "weight_kg": 80,
        "target_weight_kg": 85,
        "job_activity": "desk",
        "weekly_training": FIVE_DAY_SPLIT,
        "start_date": date(2026, 10, 20),
    }
    values.update(overrides)
    return PlanInputs(**values)


class PlanCalculatorTests(SimpleTestCase):
    def test_mifflin_st_jeor(self):
        self.assertEqual(bmr_mifflin_st_jeor("male", 80, 180, 27), 1795)
        self.assertEqual(bmr_mifflin_st_jeor("female", 60, 165, 30), 1320.25)

    def test_bulk_has_three_paces_with_increasing_calories(self):
        result = calculate_plan(_inputs())
        self.assertEqual(result["bmr"], 1795)
        self.assertEqual(result["maintenance_calories"], 2670)
        paces = {o["pace"]: o for o in result["options"]}
        self.assertEqual(list(paces), ["low", "middle", "extreme"])
        self.assertLess(paces["low"]["daily_calorie_target"], paces["middle"]["daily_calorie_target"])
        self.assertLess(paces["middle"]["daily_calorie_target"], paces["extreme"]["daily_calorie_target"])
        middle = paces["middle"]
        self.assertEqual(middle["weekly_change_kg"], 0.4)
        self.assertEqual(middle["estimated_weeks"], 12.5)
        self.assertEqual(middle["protein_grams"], 160.0)  # 2.0 g/kg
        self.assertAlmostEqual(middle["fat_grams"] * 9 / middle["daily_calorie_target"], 0.25, delta=0.01)
        self.assertIn("fat", paces["extreme"]["note"])

    def test_more_training_raises_maintenance(self):
        rest = calculate_plan(_inputs(weekly_training=[]))
        trained = calculate_plan(_inputs())
        self.assertGreater(trained["maintenance_calories"], rest["maintenance_calories"])

    def test_cut_and_maintain(self):
        cut = calculate_plan(_inputs(goal_type="lose", target_weight_kg=75))
        self.assertTrue(all(o["weekly_change_kg"] < 0 for o in cut["options"]))
        self.assertEqual(cut["options"][0]["protein_grams"], 176.0)  # 2.2 g/kg

        maintain = calculate_plan(_inputs(goal_type="maintain", target_weight_kg=80))
        self.assertEqual(len(maintain["options"]), 1)
        self.assertEqual(maintain["options"][0]["weekly_change_kg"], 0)
        self.assertIsNone(maintain["options"][0]["estimated_weeks"])

    def test_cut_is_capped_at_minimum_calories(self):
        result = calculate_plan(
            _inputs(
                goal_type="lose",
                sex="female",
                weight_kg=50,
                target_weight_kg=45,
                height_cm=150,
                age=60,
                weekly_training=[],
            )
        )
        extreme = result["options"][-1]
        self.assertEqual(extreme["daily_calorie_target"], 1200)
        self.assertIn("minimum", extreme["note"])

    def test_rejects_inconsistent_inputs(self):
        with self.assertRaises(PlanInputError):
            calculate_plan(_inputs(target_weight_kg=78))  # bulk downwards
        with self.assertRaises(PlanInputError):
            calculate_plan(_inputs(sex="other"))
        with self.assertRaises(PlanInputError):
            calculate_plan(_inputs(weekly_training=[{"activity": "weights", "duration_min": 900}]))


class PlanApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="planner", email="planner@example.com", password="pw-123456")
        NutritionApiTests._grant_tool_access(self, self.user)
        self.client.force_authenticate(user=self.user)
        self.bench = Exercise.objects.get(slug="Barbell_Bench_Press_-_Medium_Grip")
        self.today = timezone.localdate()

    def _plan_payload(self, **overrides):
        payload = {
            "goal_type": "gain",
            "pace": "middle",
            "sex": "male",
            "age": 27,
            "height_cm": 180,
            "weight_kg": 80,
            "target_weight_kg": 85,
            "job_activity": "desk",
            "weekly_training": FIVE_DAY_SPLIT,
            "food_preferences": "No fish",
            "workout_days": [
                {
                    "weekday": 0,
                    "title": "Chest, triceps, side delts",
                    "exercises": [
                        {"exercise_slug": self.bench.slug, "sets": 4, "rep_min": 6, "rep_max": 10},
                        {"exercise_slug": "Running_Treadmill", "duration_min": 30},
                    ],
                }
            ],
            "meal_options": [
                {
                    "meal_type": "breakfast",
                    "name": "Oats and eggs",
                    "items": [
                        {"food_name": "Oats", "quantity": 100, "unit": "g", "calories": 389,
                         "protein_grams": 17, "carbs_grams": 66, "fat_grams": 7},
                        {"food_name": "Eggs", "quantity": 3, "unit": "piece", "calories": 215,
                         "protein_grams": 19, "carbs_grams": 1, "fat_grams": 15},
                    ],
                }
            ],
        }
        payload.update(overrides)
        return payload

    def _create_plan(self, **overrides):
        response = self.client.post("/api/nutrition/plans/", self._plan_payload(**overrides), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response.data

    def test_exercise_library_is_loaded_and_searchable(self):
        self.assertGreater(Exercise.objects.count(), 800)
        response = self.client.get("/api/nutrition/exercise-library/?search=bench press&muscle=chest&limit=5")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["results"])
        first = response.data["results"][0]
        self.assertIn("chest", first["primary_muscles"])
        self.assertTrue(first["image_urls"][0].startswith("https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@"))

    def test_preview_uses_profile_and_latest_weight(self):
        profile = NutritionProfile.objects.create(
            owner=self.user, sex="female", birth_year=self.today.year - 30, height_cm=165, job_activity="standing"
        )
        WeightEntry.objects.create(owner=self.user, entry_date=self.today, weight_kg=60)
        response = self.client.post(
            "/api/nutrition/plans/preview/",
            {"goal_type": "lose", "target_weight_kg": 56},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["inputs"]["weight_kg"], 60)
        self.assertEqual(response.data["inputs"]["age"], profile.age)
        self.assertEqual(len(response.data["options"]), 3)

        missing = self.client.post("/api/nutrition/plans/preview/", {"goal_type": "gain"}, format="json")
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_plan_activates_and_updates_profile(self):
        data = self._create_plan()
        self.assertEqual(data["status"], "active")
        self.assertEqual(data["pace"], "middle")
        self.assertEqual(len(data["pace_options"]), 3)
        day = data["workout_days"][0]
        self.assertEqual(day["exercises"][0]["exercise"]["id"], self.bench.id)
        self.assertEqual(day["exercises"][1]["kind"], "cardio")
        meal = data["meal_options"][0]
        self.assertEqual(meal["calories"], 604)

        profile = NutritionProfile.objects.get(owner=self.user)
        self.assertEqual(profile.goal_type, "gain")
        self.assertEqual(profile.daily_calorie_target, data["daily_calorie_target"])
        self.assertEqual(profile.sex, "male")
        self.assertEqual(profile.age, 27)
        self.assertEqual(profile.food_preferences, "No fish")
        self.assertEqual(WeightEntry.objects.get(owner=self.user, entry_date=self.today).weight_kg, 80)

        active = self.client.get("/api/nutrition/plans/active/")
        self.assertEqual(active.data["plan"]["id"], data["id"])

    def test_new_plan_archives_previous_and_keeps_history(self):
        first = self._create_plan()
        second = self._create_plan(goal_type="maintain", target_weight_kg=None, pace="middle")
        self.assertEqual(Plan.objects.get(id=first["id"]).status, "archived")
        self.assertEqual(second["status"], "active")
        history = self.client.get("/api/nutrition/plans/")
        self.assertEqual([p["id"] for p in history.data], [second["id"], first["id"]])

    def test_set_pace_changes_targets(self):
        data = self._create_plan()
        response = self.client.post(f"/api/nutrition/plans/{data['id']}/set-pace/", {"pace": "extreme"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(response.data["daily_calorie_target"], data["daily_calorie_target"])
        self.assertEqual(
            NutritionProfile.objects.get(owner=self.user).daily_calorie_target,
            response.data["daily_calorie_target"],
        )
        bad = self.client.post(f"/api/nutrition/plans/{data['id']}/set-pace/", {"pace": "turbo"}, format="json")
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_swap_add_and_remove_plan_exercises(self):
        data = self._create_plan()
        day = data["workout_days"][0]
        slot_id = day["exercises"][0]["id"]
        incline = Exercise.objects.get(slug="Barbell_Incline_Bench_Press_-_Medium_Grip")

        swap = self.client.patch(f"/api/nutrition/plan-exercises/{slot_id}/", {"exercise_id": incline.id}, format="json")
        self.assertEqual(swap.status_code, status.HTTP_200_OK, swap.data)
        self.assertEqual(swap.data["name"], incline.name)
        self.assertEqual(swap.data["sets"], 4)  # sets/reps are kept on swap

        added = self.client.post(
            "/api/nutrition/plan-exercises/",
            {"day": day["id"], "exercise_id": self.bench.id, "sets": 3},
            format="json",
        )
        self.assertEqual(added.status_code, status.HTTP_201_CREATED, added.data)
        self.assertEqual(added.data["order"], 2)

        removed = self.client.delete(f"/api/nutrition/plan-exercises/{slot_id}/")
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(PlanExercise.objects.filter(day_id=day["id"]).count(), 2)

    def test_other_users_cannot_touch_my_plan(self):
        data = self._create_plan()
        intruder = User.objects.create_user(username="intruder", email="intruder@example.com", password="pw-123456")
        NutritionApiTests._grant_tool_access(self, intruder)
        self.client.force_authenticate(user=intruder)
        slot_id = data["workout_days"][0]["exercises"][0]["id"]
        self.assertEqual(self.client.get(f"/api/nutrition/plans/{data['id']}/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/nutrition/plan-exercises/{slot_id}/").status_code, 404)
        sneaky_add = self.client.post(
            "/api/nutrition/plan-exercises/",
            {"day": data["workout_days"][0]["id"], "exercise_id": self.bench.id},
            format="json",
        )
        self.assertEqual(sneaky_add.status_code, status.HTTP_400_BAD_REQUEST)
        meal_id = data["meal_options"][0]["id"]
        self.assertEqual(self.client.post(f"/api/nutrition/plan-meals/{meal_id}/log/", {}).status_code, 404)

    def test_log_meal_option_adds_each_item_to_diary(self):
        data = self._create_plan()
        meal_id = data["meal_options"][0]["id"]
        response = self.client.post(f"/api/nutrition/plan-meals/{meal_id}/log/", {"entry_date": str(self.today)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        entries = MealEntry.objects.filter(owner=self.user, entry_date=self.today, meal_type="breakfast")
        self.assertEqual(entries.count(), 2)
        self.assertAlmostEqual(sum(e.calories for e in entries), 604, delta=0.5)
        oats = entries.get(food_name="Oats")
        self.assertEqual(oats.total_grams, 100)

    def test_workout_tracking_and_last_performance(self):
        data = self._create_plan()
        day = data["workout_days"][0]
        bench_slot, run_slot = day["exercises"]
        session = self.client.post(
            "/api/nutrition/workouts/",
            {
                "plan_day": day["id"],
                "entry_date": str(self.today),
                "duration_min": 75,
                "sets": [
                    {"plan_exercise": bench_slot["id"], "set_number": 1, "reps": 8, "weight_kg": 80},
                    {"plan_exercise": bench_slot["id"], "set_number": 2, "reps": 7, "weight_kg": 80},
                    {"plan_exercise": run_slot["id"], "set_number": 1, "duration_min": 30, "distance_km": 5},
                ],
            },
            format="json",
        )
        self.assertEqual(session.status_code, status.HTTP_201_CREATED, session.data)
        self.assertEqual(session.data["title"], day["title"])
        self.assertEqual(session.data["sets"][0]["exercise"], self.bench.id)

        done = self.client.post(f"/api/nutrition/workouts/{session.data['id']}/complete/", {}, format="json")
        self.assertEqual(done.status_code, status.HTTP_200_OK)
        self.assertGreater(done.data["calories_burned"], 0)
        entry = ExerciseEntry.objects.get(owner=self.user, entry_date=self.today)
        self.assertTrue(entry.is_planned)
        self.assertEqual(entry.duration_min, 75)

        last = self.client.get(f"/api/nutrition/workouts/last-performance/?plan_exercise={bench_slot['id']}")
        self.assertEqual(last.status_code, status.HTTP_200_OK)
        self.assertEqual([s["reps"] for s in last.data["sets"]], [8, 7])
        by_library = self.client.get(f"/api/nutrition/workouts/last-performance/?exercise={self.bench.id}")
        self.assertEqual(len(by_library.data["sets"]), 2)

        self.client.delete(f"/api/nutrition/workouts/{session.data['id']}/")
        self.assertFalse(ExerciseEntry.objects.filter(owner=self.user).exists())

    def test_exercise_budget_rules(self):
        # No plan: every workout extends the budget in full (unchanged behaviour).
        ExerciseEntry.objects.create(owner=self.user, entry_date=self.today, name="Football", calories_burned=400)
        overview = self.client.get(f"/api/nutrition/overview/?date={self.today}").data
        self.assertEqual(overview["exercise_budget_calories"], 400)

        # Active plan: planned training adds nothing, extra activity adds half.
        self._create_plan()
        ExerciseEntry.objects.create(
            owner=self.user, entry_date=self.today, name="Push day", calories_burned=500, is_planned=True
        )
        overview = self.client.get(f"/api/nutrition/overview/?date={self.today}").data
        target = overview["profile"]["daily_calorie_target"]
        self.assertEqual(overview["exercise_calories"], 900)
        self.assertEqual(overview["exercise_budget_calories"], 200)
        self.assertEqual(overview["remaining"]["calories"], target + 200)
        self.assertIn("already in your target", overview["exercise_budget_note"])

    def test_manual_exercise_cannot_claim_to_be_planned(self):
        response = self.client.post(
            "/api/nutrition/exercise/",
            {"entry_date": str(self.today), "name": "Hike", "duration_min": 60, "calories_burned": 300, "is_planned": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data["is_planned"])

    def test_profile_accepts_body_stats_and_units(self):
        response = self.client.patch(
            "/api/nutrition/profile/",
            {"sex": "female", "age": 31, "height_cm": 168, "job_activity": "standing", "units": "us"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["age"], 31)
        self.assertEqual(response.data["units"], "us")
        self.assertEqual(response.data["birth_year"], self.today.year - 31)
        bad = self.client.patch("/api/nutrition/profile/", {"sex": "other"}, format="json")
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)


class PlanCheckInTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="checkin", email="checkin@example.com", password="pw-123456")
        NutritionApiTests._grant_tool_access(self, self.user)
        self.client.force_authenticate(user=self.user)
        self.today = timezone.localdate()

    def _plan(self, days_ago: int):
        from nutrition.plans import create_plan

        return create_plan(
            self.user,
            {
                "goal_type": "gain",
                "pace": "middle",
                "sex": "male",
                "age": 27,
                "height_cm": 180,
                "weight_kg": 80,
                "target_weight_kg": 85,
                "job_activity": "desk",
                "weekly_training": FIVE_DAY_SPLIT,
                "start_date": str(self.today - timedelta(days=days_ago)),
                "workout_days": [{"weekday": 0, "title": "Push", "exercises": [{"exercise_slug": "Pushups"}]}],
            },
        )

    def _log_days(self, days: int, kcal: float, weight_for_day):
        for offset in range(days):
            day = self.today - timedelta(days=offset)
            MealEntry.objects.create(
                owner=self.user, entry_date=day, meal_type="lunch", food_name="Food",
                servings=1, serving_calories=kcal,
            )
            WeightEntry.objects.create(owner=self.user, entry_date=day, weight_kg=weight_for_day(offset))

    def _active(self):
        return self.client.get("/api/nutrition/plans/active/").data["plan"]

    def test_check_in_waits_two_weeks_then_needs_data(self):
        self._plan(days_ago=0)
        self.assertEqual(self._active()["check_in"]["status"], "too_early")
        Plan.objects.update(start_date=self.today - timedelta(days=15))
        self.assertEqual(self._active()["check_in"]["status"], "need_data")

    def test_check_in_adjusts_targets_from_real_data(self):
        plan = self._plan(days_ago=20)
        # Eating 2500 kcal with a flat weight means expenditure is about 2500, so the
        # +0.4 kg/week pace needs about 2940 kcal, not the formula's 3110.
        self._log_days(20, 2500, lambda offset: 80.0)
        check_in = self._active()["check_in"]
        self.assertEqual(check_in["status"], "adjust")
        self.assertLess(check_in["recommended"]["calories"], plan.daily_calorie_target)
        self.assertAlmostEqual(check_in["recommended"]["calories"], 2940, delta=30)
        self.assertEqual(check_in["recommended"]["protein_grams"], 160)  # plan's 2.0 g/kg rule

        response = self.client.post(f"/api/nutrition/plans/{plan.id}/apply-check-in/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["daily_calorie_target"], check_in["recommended"]["calories"])
        self.assertEqual(response.data["check_in"]["status"], "too_early")
        profile = NutritionProfile.objects.get(owner=self.user)
        self.assertEqual(profile.daily_calorie_target, check_in["recommended"]["calories"])

        again = self.client.post(f"/api/nutrition/plans/{plan.id}/apply-check-in/")
        self.assertEqual(again.status_code, 400)

    def test_goal_reached_and_switch_to_maintain_keeps_program(self):
        plan = self._plan(days_ago=60)
        self._log_days(14, 3100, lambda offset: 86.0)
        active = self._active()
        self.assertTrue(active["goal_reached"])
        self.assertTrue(active["progress"]["is_trend"])
        self.assertEqual(active["progress"]["percent_complete"], 100)

        response = self.client.post(f"/api/nutrition/plans/{plan.id}/switch-to-maintain/")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["goal_type"], "maintain")
        self.assertAlmostEqual(response.data["start_weight_kg"], 86, delta=0.5)
        self.assertEqual(response.data["workout_days"][0]["exercises"][0]["name"], "Pushups")
        self.assertFalse(response.data["goal_reached"])
        plan.refresh_from_db()
        self.assertEqual(plan.status, "archived")

    def test_last_performance_ignores_unfinished_sets(self):
        plan = self._plan(days_ago=0)
        slot = plan.workout_days.get().exercises.get()
        session = self.client.post(
            "/api/nutrition/workouts/",
            {
                "plan_day": slot.day_id,
                "sets": [
                    {"plan_exercise": slot.id, "set_number": 1, "reps": 20, "completed": True},
                    {"plan_exercise": slot.id, "set_number": 2, "reps": 18, "completed": False},
                ],
            },
            format="json",
        ).data
        self.client.post(f"/api/nutrition/workouts/{session['id']}/complete/", {"duration_min": 20}, format="json")
        last = self.client.get(f"/api/nutrition/workouts/last-performance/?plan_exercise={slot.id}").data
        self.assertEqual([s["reps"] for s in last["sets"]], [20])

    def test_logger_autosave_replaces_sets_and_session_can_be_resumed(self):
        plan = self._plan(days_ago=0)
        slot = plan.workout_days.get().exercises.get()
        session = self.client.post(
            "/api/nutrition/workouts/",
            {"plan_day": slot.day_id, "entry_date": str(self.today), "sets": []},
            format="json",
        ).data
        for reps in ([10], [10, 9], [12, 9]):
            saved = self.client.patch(
                f"/api/nutrition/workouts/{session['id']}/",
                {"sets": [
                    {"plan_exercise": slot.id, "exercise_name": slot.name, "set_number": i + 1,
                     "reps": r, "weight_kg": 0, "completed": True}
                    for i, r in enumerate(reps)
                ]},
                format="json",
            )
            self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual([s["reps"] for s in saved.data["sets"]], [12, 9])

        todays = self.client.get(f"/api/nutrition/workouts/?date={self.today}").data
        self.assertEqual([(w["id"], w["completed_at"]) for w in todays], [(session["id"], None)])


class BuiltInProgramAndMealTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="builtin", email="builtin@example.com", password="pw-123456")
        NutritionApiTests._grant_tool_access(self, self.user)
        self.client.force_authenticate(user=self.user)

    def _plan(self, **extra):
        payload = {
            "goal_type": "gain", "pace": "middle", "sex": "male", "age": 27, "height_cm": 180,
            "weight_kg": 80, "target_weight_kg": 85, "job_activity": "desk",
            "weekly_training": FIVE_DAY_SPLIT,
            "workout_days": [
                {"weekday": 0, "title": "Chest, triceps, middle delts", "exercises": []},
                {"weekday": 2, "title": "Legs", "exercises": [{"exercise_slug": "Running_Treadmill", "duration_min": 30}]},
                {"weekday": 4, "title": "Zumba", "exercises": []},
            ],
        }
        payload.update(extra)
        response = self.client.post("/api/nutrition/plans/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_plan_options_list_every_split_and_food_choice(self):
        data = self.client.get("/api/nutrition/plan-options/").data
        self.assertEqual(len(data["splits"]), 9)
        self.assertEqual({e["key"] for e in data["equipment"]}, {"gym", "home"})
        self.assertEqual({e["key"] for e in data["home_gear"]}, {"bands", "pull_up_bar"})
        self.assertIn("chicken", [o["key"] for o in data["liked_foods"]])
        self.assertIn("vegan", [o["key"] for o in data["avoided_foods"]])

    def test_ready_made_split_uses_default_days_and_rotates_exercises(self):
        response = self.client.post(
            "/api/nutrition/program-templates/suggest/",
            {"split": "ppl_6", "equipment": "gym", "goal_type": "gain"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        days = response.data["days"]
        self.assertEqual([d["weekday"] for d in days], [0, 1, 2, 3, 4, 5])
        push_a = {e["name"] for e in days[0]["exercises"]}
        push_b = {e["name"] for e in days[3]["exercises"]}
        self.assertTrue(push_a - push_b, "second push day should use different exercises")
        self.assertTrue(all(e["image_urls"] for d in days for e in d["exercises"]))

        bad = self.client.post(
            "/api/nutrition/program-templates/suggest/",
            {"split": "ppl_6", "weekdays": [0, 1, 2]},
            format="json",
        )
        self.assertEqual(bad.status_code, 400)

    def test_own_day_titles_and_home_equipment(self):
        response = self.client.post(
            "/api/nutrition/program-templates/suggest/",
            {
                "equipment": "home",
                "home_gear": ["bands"],
                "goal_type": "lose",
                "days": [{"weekday": 0, "title": "Chest, triceps, middle delts"}, {"weekday": 3, "title": "???"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unrecognized"], [3])
        names = [e["name"] for e in response.data["days"][0]["exercises"]]
        self.assertEqual(names[0], "Pushups")
        self.assertIn("Lateral Raise - With Bands", names)
        self.assertNotIn("Barbell Bench Press - Medium Grip", names)
        self.assertEqual(response.data["days"][0]["missing"], [])

    def _home_week(self, gear):
        response = self.client.post(
            "/api/nutrition/program-templates/suggest/",
            {"split": "ppl_3", "equipment": "home", "home_gear": gear, "goal_type": "maintain"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["days"]

    def test_home_without_gear_uses_only_bodyweight_and_reports_gaps(self):
        from nutrition.program_templates import NEEDS_GEAR

        days = self._home_week([])
        exercises = [e for d in days for e in d["exercises"]]
        by_name = {e.name: e.slug for e in Exercise.objects.filter(id__in=[e["exercise_id"] for e in exercises])}
        self.assertFalse([name for name, slug in by_name.items() if slug in NEEDS_GEAR])
        push, pull, legs = days
        self.assertIn("Side delts", push["missing"])
        self.assertEqual(set(pull["missing"]), {"Rear delts", "Biceps"})
        self.assertIn("Superman", [e["name"] for e in pull["exercises"]])
        self.assertEqual(legs["missing"], ["Calves"])

    def test_home_gear_unlocks_band_and_bar_exercises(self):
        bar_only = self._home_week(["pull_up_bar"])
        pull_names = [e["name"] for e in bar_only[1]["exercises"]]
        self.assertEqual(pull_names[0], "Pullups")
        self.assertFalse(any("Band" in name for d in bar_only for name in (e["name"] for e in d["exercises"])))
        self.assertEqual(bar_only[1]["missing"], ["Rear delts"])  # band-only; the bar covers biceps

        everything = self._home_week(["bands", "pull_up_bar"])
        self.assertTrue(all(d["missing"] == [] for d in everything))
        self.assertIn("Calf Raises - With Bands", [e["name"] for e in everything[2]["exercises"]])

    def test_plan_day_suggestions_use_saved_gear_and_keep_days_without_options(self):
        plan = self._plan(equipment="home", home_gear=[])
        self.assertEqual(NutritionProfile.objects.get(owner=self.user).home_gear, [])
        day = next(d for d in plan["workout_days"] if d["weekday"] == 0)
        self.client.patch(
            f"/api/nutrition/plan-days/{day['id']}/", {"title": "Biceps"}, format="json"
        )
        result = self.client.post(
            f"/api/nutrition/plans/{plan['id']}/suggest-exercises/",
            {"day_ids": [day["id"]], "include_abs": False},
            format="json",
        ).data
        self.assertEqual(result["filled"], [])
        self.assertEqual(result["missing"], {day["id"]: ["Biceps"]})

    def test_new_plan_gets_built_in_meals_respecting_preferences(self):
        plan = self._plan(liked_foods=["tofu"], avoided_foods=["vegan"], food_preferences="no mushrooms")
        names = {m["name"] for m in plan["meal_options"]}
        self.assertGreaterEqual(len(names), 8)
        foods = " ".join(i["food_name"] for m in plan["meal_options"] for i in m["items"]).lower()
        for banned in ("chicken", "beef", "salmon", "egg", "milk (2%)", "yogurt", "mushroom", "honey"):
            self.assertNotIn(banned, foods)
        profile = NutritionProfile.objects.get(owner=self.user)
        self.assertEqual(profile.liked_foods, ["tofu"])
        self.assertEqual(profile.avoided_foods, ["vegan"])

        breakfasts = [m for m in plan["meal_options"] if m["meal_type"] == "breakfast"]
        target = plan["daily_calorie_target"] * 0.25
        self.assertTrue(all(abs(m["calories"] - target) < target * 0.35 for m in breakfasts))

    def test_vegan_plans_get_three_dinners_even_without_soy_or_gluten(self):
        for avoided in (["vegan"], ["vegan", "soy"], ["vegan", "gluten"], ["vegan", "soy", "gluten"]):
            plan = self._plan(avoided_foods=avoided)
            dinners = [m for m in plan["meal_options"] if m["meal_type"] == "dinner"]
            self.assertEqual(len(dinners), 3, avoided)

    def test_new_meal_ideas_swap_in_meals_not_shown_yet(self):
        plan = self._plan()
        before = {m["name"] for m in plan["meal_options"]}
        after = self.client.post(f"/api/nutrition/plans/{plan['id']}/suggest-meals/", {}, format="json").data
        now = {m["name"] for m in after["plan"]["meal_options"]}
        self.assertEqual(len(now), 12)
        self.assertFalse(before & now)  # 13+ meals per type, so 3 fresh ones always exist

    def test_suggest_exercises_fills_empty_days_and_keeps_cardio(self):
        plan = self._plan()
        days = {d["weekday"]: d for d in plan["workout_days"]}
        result = self.client.post(f"/api/nutrition/plans/{plan['id']}/suggest-exercises/", {}, format="json").data
        self.assertEqual(set(result["filled"]), {days[0]["id"], days[2]["id"]})
        self.assertEqual(result["unrecognized"], [days[4]["id"]])
        legs = next(d for d in result["plan"]["workout_days"] if d["weekday"] == 2)
        self.assertEqual(legs["exercises"][-1]["name"], "Running, Treadmill")
        self.assertGreaterEqual(len(legs["exercises"]), 6)

        again = self.client.post(f"/api/nutrition/plans/{plan['id']}/suggest-exercises/", {}, format="json").data
        self.assertEqual(set(again["skipped"]), {days[0]["id"], days[2]["id"]})

        replaced = self.client.post(
            f"/api/nutrition/plans/{plan['id']}/suggest-exercises/",
            {"day_ids": [days[0]["id"]], "replace": True, "include_abs": False},
            format="json",
        ).data
        self.assertEqual(replaced["filled"], [days[0]["id"]])
        monday = next(d for d in replaced["plan"]["workout_days"] if d["weekday"] == 0)
        self.assertFalse(any("Crunch" in e["name"] or "Plank" in e["name"] for e in monday["exercises"]))

    def test_profile_rejects_unknown_food_choices(self):
        bad = self.client.patch("/api/nutrition/profile/", {"liked_foods": ["unicorn"]}, format="json")
        self.assertEqual(bad.status_code, 400)
        ok = self.client.patch(
            "/api/nutrition/profile/", {"liked_foods": ["rice"], "equipment": "home", "include_abs": False}, format="json"
        )
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data["equipment"], "home")
        bad_gear = self.client.patch("/api/nutrition/profile/", {"home_gear": ["rowing machine"]}, format="json")
        self.assertEqual(bad_gear.status_code, 400)
        gear = self.client.patch("/api/nutrition/profile/", {"home_gear": ["bands"]}, format="json")
        self.assertEqual(gear.data["home_gear"], ["bands"])
