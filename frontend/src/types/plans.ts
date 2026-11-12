// Plans, exercise library and workouts. Mirrors mobile/src/api/nutritionTypes.ts.
import type { NutritionMealType, PhotoAttribution } from "@/types/nutrition";

export type NutritionSex = "male" | "female";
export type JobActivity = "desk" | "standing" | "physical";
export type UnitsPreference = "metric" | "us";
export type Equipment = "gym" | "home";
export type HomeGear = "bands" | "pull_up_bar";

export type PlanGoalType = "gain" | "lose" | "maintain";
export type PlanPace = "low" | "middle" | "extreme";
export type TrainingActivity =
  | "weights"
  | "running"
  | "cycling"
  | "swimming"
  | "walking"
  | "hiit"
  | "yoga"
  | "other";

export type TrainingSession = {
  weekday: number | null; // 0 = Monday
  activity: TrainingActivity;
  duration_min: number;
};

export type PlanPaceOption = {
  pace: PlanPace;
  daily_calorie_target: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  weekly_change_kg: number;
  estimated_weeks: number | null;
  projected_end_date: string | null;
  note: string;
};

export type PlanPreview = {
  goal_type: PlanGoalType;
  bmr: number;
  job_factor: number;
  training_calories_per_day: number;
  maintenance_calories: number;
  weekly_training: TrainingSession[];
  options: PlanPaceOption[];
  inputs: {
    sex: NutritionSex;
    age: number;
    height_cm: number;
    weight_kg: number;
    target_weight_kg: number;
    job_activity: JobActivity;
    start_date: string;
  };
};

export type ExerciseSummary = {
  id: number;
  slug: string;
  name: string;
  category: string;
  equipment: string;
  primary_muscles: string[];
  image_urls: string[];
};

export type LibraryExercise = ExerciseSummary & {
  level: string;
  force: string;
  mechanic: string;
  secondary_muscles: string[];
  instructions: string[];
};

export type PlanExerciseKind = "strength" | "cardio";

export type PlanExercise = {
  id: number;
  day: number;
  order: number;
  exercise: ExerciseSummary | null;
  name: string;
  kind: PlanExerciseKind;
  sets: number;
  rep_min: number;
  rep_max: number;
  duration_min: number | null;
  rest_seconds: number;
  notes: string;
};

export type PlanWorkoutDay = {
  id: number;
  plan: number;
  weekday: number;
  title: string;
  notes: string;
  exercises: PlanExercise[];
};

export type PlanMealItem = {
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
};

export type PlanMealOption = {
  id: number;
  meal_type: NutritionMealType;
  order: number;
  name: string;
  description: string;
  items: PlanMealItem[];
  calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  image_url?: string | null;
  image_credit?: string | null;
  image_attribution?: PhotoAttribution | null;
};

export type PlanProgress = {
  current_weight_kg: number;
  change_kg: number;
  remaining_kg: number;
  percent_complete: number;
  weeks_elapsed: number;
  expected_change_kg: number;
  /** True when current_weight_kg is the smoothed trend rather than a single weigh-in. */
  is_trend: boolean;
};

export type NutritionPlan = {
  id: number;
  status: "active" | "archived";
  goal_type: PlanGoalType;
  pace: PlanPace;
  start_date: string;
  start_weight_kg: number;
  target_weight_kg: number;
  sex: NutritionSex;
  age: number;
  height_cm: number;
  job_activity: JobActivity;
  weekly_training: TrainingSession[];
  equipment: string;
  explanation: string;
  bmr: number;
  maintenance_calories: number;
  daily_calorie_target: number;
  protein_target_grams: number;
  carbs_target_grams: number;
  fat_target_grams: number;
  weekly_change_kg: number;
  estimated_weeks: number | null;
  projected_end_date: string | null;
  pace_options: PlanPaceOption[];
  goal_reached_at: string | null;
  archived_at: string | null;
  workout_days: PlanWorkoutDay[];
  meal_options: PlanMealOption[];
  progress: PlanProgress;
  goal_reached: boolean;
  check_in: PlanCheckIn;
  last_check_in_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NutritionPlanSummary = Pick<
  NutritionPlan,
  | "id"
  | "status"
  | "goal_type"
  | "pace"
  | "start_date"
  | "start_weight_kg"
  | "target_weight_kg"
  | "daily_calorie_target"
  | "projected_end_date"
  | "goal_reached_at"
  | "archived_at"
  | "created_at"
>;

export type PlanInputPayload = {
  goal_type: PlanGoalType;
  sex: NutritionSex;
  age: number;
  height_cm: number;
  weight_kg: number;
  target_weight_kg?: number;
  job_activity: JobActivity;
  weekly_training: TrainingSession[];
};

export type PlanExerciseInput = {
  exercise_id?: number;
  rest_seconds?: number;
  notes?: string;
  exercise_slug?: string;
  name?: string;
  kind?: PlanExerciseKind;
  sets?: number;
  rep_min?: number;
  rep_max?: number;
  duration_min?: number;
};

export type CreatePlanPayload = PlanInputPayload & {
  pace: PlanPace;
  food_preferences?: string;
  liked_foods?: string[];
  avoided_foods?: string[];
  equipment?: Equipment;
  home_gear?: HomeGear[];
  include_abs?: boolean;
  workout_days: {
    weekday: number;
    title: string;
    exercises: PlanExerciseInput[];
  }[];
};

export type WorkoutSet = {
  id?: number;
  plan_exercise: number | null;
  exercise: number | null;
  exercise_name: string;
  exercise_order: number;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_min: number | null;
  distance_km: number | null;
  completed: boolean;
};

export type WorkoutSession = {
  id: number;
  plan: number | null;
  plan_day: number | null;
  entry_date: string;
  title: string;
  started_at: string;
  completed_at: string | null;
  duration_min: number | null;
  notes: string;
  calories_burned: number | null;
  sets: WorkoutSet[];
  created_at: string;
  updated_at: string;
};

export type LastPerformance = {
  session: { id: number; entry_date: string } | null;
  sets: {
    set_number: number;
    reps: number | null;
    weight_kg: number | null;
    duration_min: number | null;
    distance_km: number | null;
  }[];
};

export type PlanCheckIn =
  | { status: "too_early"; next_date: string }
  | { status: "need_data"; next_date: string; logged_days: number; weigh_ins: number }
  | {
      status: "adjust" | "on_track";
      next_date: string;
      expenditure: number;
      confidence: string;
      recommended: { calories: number; protein_grams: number; carbs_grams: number; fat_grams: number };
      difference_kcal: number;
      rationale: string;
    };

export type Choice = { key: string; label: string };

export type SplitSummary = {
  key: string;
  name: string;
  description: string;
  days_per_week: number;
  day_titles: string[];
  default_weekdays: number[];
};

export type PlanOptions = {
  splits: SplitSummary[];
  equipment: Choice[];
  home_gear: Choice[];
  liked_foods: Choice[];
  avoided_foods: Choice[];
};

export type SuggestedExercise = {
  exercise_id: number;
  name: string;
  kind: PlanExerciseKind;
  sets: number;
  rep_min: number;
  rep_max: number;
  rest_seconds: number;
  notes: string;
  image_urls: string[];
  primary_muscles: string[];
};

export type ProgramSuggestion = {
  // missing: muscles the home gear has no exercise for.
  days: { weekday: number; title: string; exercises: SuggestedExercise[]; missing: string[] }[];
  unrecognized: number[];
};

export type ProgramSuggestRequest = {
  equipment: Equipment;
  home_gear: HomeGear[];
  goal_type: PlanGoalType;
  include_abs: boolean;
  split?: string;
  weekdays?: number[];
  days?: { weekday: number; title: string }[];
};
