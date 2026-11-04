export type NutritionGoalType = "track" | "maintain" | "lose" | "gain";
export type NutritionMealType = "breakfast" | "lunch" | "dinner" | "snacks";
export type NutritionFoodSource = "usda" | "custom" | "recent" | "demo";
export type NutritionUnitKey = string;

export type NutritionUnitOption = {
  key: NutritionUnitKey;
  label: string;
  grams_per_unit: number | null;
  calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  fiber_grams: number;
  sugar_grams: number;
  sodium_mg: number;
};

export type NutritionProfile = {
  goal_type: NutritionGoalType;
  daily_calorie_target: number;
  protein_target_grams: number;
  carbs_target_grams: number;
  fat_target_grams: number;
  sex?: "male" | "female" | "";
  age?: number | null;
  height_cm?: number | null;
  job_activity?: "desk" | "standing" | "physical" | "";
  food_preferences?: string;
  liked_foods?: string[];
  avoided_foods?: string[];
  equipment?: "gym" | "home";
  home_gear?: ("bands" | "pull_up_bar")[];
  include_abs?: boolean;
  units?: "metric" | "us";
  logging_reminders?: boolean;
  daily_report_email?: boolean;
  daily_report_hour?: number;
  created_at: string;
  updated_at: string;
};

export type NutritionEntry = {
  id: number;
  entry_date: string;
  meal_type: NutritionMealType;
  food_source: NutritionFoodSource;
  external_food_id: string;
  food_name: string;
  brand_name: string;
  serving_description: string;
  measurement_unit: NutritionUnitKey;
  quantity: number;
  servings: number;
  grams_per_unit: number | null;
  total_grams: number | null;
  image_url: string;
  serving_calories: number;
  serving_protein_grams: number;
  serving_carbs_grams: number;
  serving_fat_grams: number;
  serving_fiber_grams: number;
  serving_sugar_grams: number;
  serving_sodium_mg: number;
  calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  fiber_grams: number;
  sugar_grams: number;
  sodium_mg: number;
  available_units: NutritionUnitOption[];
  default_unit_key: NutritionUnitKey;
  created_at: string;
  updated_at: string;
};

export type NutritionWeightEntry = {
  id: number;
  entry_date: string;
  weight_kg: number;
  note: string;
  created_at: string;
  updated_at: string;
};

export type NutritionTotals = {
  calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  fiber_grams: number;
  sugar_grams: number;
  sodium_mg: number;
};

export type NutritionMealSection = {
  meal_type: NutritionMealType;
  label: string;
  totals: NutritionTotals;
  entries: NutritionEntry[];
};

export type NutritionOverviewResponse = {
  date: string;
  profile: NutritionProfile;
  totals: NutritionTotals;
  remaining: {
    calories: number;
    protein_grams: number;
    carbs_grams: number;
    fat_grams: number;
  };
  meal_sections: NutritionMealSection[];
  weight_entry: NutritionWeightEntry | null;
  latest_weight_entry: NutritionWeightEntry | null;
  recent_weights: NutritionWeightEntry[];
  entries_count: number;
  exercise_calories?: number;
  exercise_budget_calories?: number;
};

export type NutritionFoodSearchResult = {
  id: string;
  food_source: NutritionFoodSource;
  external_food_id: string;
  food_name: string;
  brand_name: string;
  serving_description: string;
  measurement_unit: NutritionUnitKey;
  grams_per_unit: number | null;
  calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  fiber_grams: number;
  sugar_grams: number;
  sodium_mg: number;
  label: string;
  is_favorite: boolean;
  available_units: NutritionUnitOption[];
  default_unit_key: NutritionUnitKey;
  image_url: string | null;
};

export type NutritionFoodSearchResponse = {
  query: string;
  count: number;
  results: NutritionFoodSearchResult[];
};

export type NutritionSavedMealItem = {
  id: number;
  order: number;
  food_source: NutritionFoodSource;
  external_food_id: string;
  food_name: string;
  brand_name: string;
  serving_description: string;
  measurement_unit: NutritionUnitKey;
  quantity: number;
  grams_per_unit: number | null;
  total_grams: number | null;
  image_url: string;
  serving_calories: number;
  serving_protein_grams: number;
  serving_carbs_grams: number;
  serving_fat_grams: number;
  serving_fiber_grams: number;
  serving_sugar_grams: number;
  serving_sodium_mg: number;
  calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  fiber_grams: number;
  sugar_grams: number;
  sodium_mg: number;
};

export type NutritionSavedMeal = {
  id: number;
  name: string;
  meal_type: NutritionMealType | "";
  item_count: number;
  totals: NutritionTotals;
  items: NutritionSavedMealItem[];
  created_at: string;
  updated_at: string;
};

export type SaveMealFromDiaryPayload = {
  name: string;
  entry_date: string;
  meal_type: NutritionMealType;
};

export type LogSavedMealPayload = {
  entry_date: string;
  meal_type: NutritionMealType;
};

export type CopyNutritionMealPayload = {
  source_date: string;
  target_date: string;
  source_meal_type: NutritionMealType;
  target_meal_type: NutritionMealType;
};

export type CopyNutritionDayPayload = {
  source_date: string;
  target_date: string;
};

export type NutritionInsightsDay = {
  date: string;
  calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  fiber_grams: number;
  sugar_grams: number;
  sodium_mg: number;
};

export type NutritionInsightsResponse = {
  days: number;
  start_date: string;
  end_date: string;
  profile: NutritionProfile;
  daily_series: NutritionInsightsDay[];
  averages: {
    calories: number;
    protein_grams: number;
    carbs_grams: number;
    fat_grams: number;
  };
  days_with_logs: number;
  days_on_target: number;
  adherence_pct: number;
  weight_series: NutritionWeightEntry[];
  weight_change_kg: number;
  headline: string;
};

export type CustomFoodPayload = {
  name: string;
  brand_name: string;
  serving_description: string;
  base_amount: number;
  base_unit: string;
  gram_weight?: number | null;
  calories?: number;
  protein_grams?: number;
  carbs_grams?: number;
  fat_grams?: number;
  fiber_grams?: number;
  sugar_grams?: number;
  sodium_mg?: number;
  external_image_url?: string;
  is_favorite?: boolean;
};

export type NutritionCustomFood = CustomFoodPayload & {
  id: number;
  image_url: string | null;
  available_units: NutritionUnitOption[];
  default_unit_key: NutritionUnitKey;
  created_at: string;
  updated_at: string;
};

export type NutritionEntryPayload = {
  entry_date: string;
  meal_type: NutritionMealType;
  food_source: NutritionFoodSource;
  external_food_id: string;
  food_name: string;
  brand_name: string;
  serving_description: string;
  measurement_unit: NutritionUnitKey;
  quantity: number;
  grams_per_unit?: number | null;
  image_url?: string;
  serving_calories: number;
  serving_protein_grams: number;
  serving_carbs_grams: number;
  serving_fat_grams: number;
  serving_fiber_grams: number;
  serving_sugar_grams: number;
  serving_sodium_mg: number;
};

export type WeightEntryPayload = {
  entry_date: string;
  weight_kg: number;
  note?: string;
};

export type CopyNutritionEntriesPayload = {
  entry_ids: number[];
  target_date: string;
  // Omit to keep each food in its own meal.
  target_meal_type?: NutritionMealType;
};

export type DiaryCalendarMonth = {
  month: string;
  days: { date: string; calories: number; entries: number }[];
};

export type RecipeIngredientPayload = {
  food_source: NutritionFoodSource;
  external_food_id: string;
  food_name: string;
  brand_name: string;
  serving_description: string;
  measurement_unit: NutritionUnitKey;
  quantity: number;
  grams_per_unit?: number | null;
  image_url?: string;
  serving_calories: number;
  serving_protein_grams: number;
  serving_carbs_grams: number;
  serving_fat_grams: number;
  serving_fiber_grams: number;
  serving_sugar_grams: number;
  serving_sodium_mg: number;
};

export type NutritionRecipeIngredient = RecipeIngredientPayload & {
  id: number;
  order: number;
  total_grams: number | null;
  calories: number;
};

export type NutritionRecipe = {
  id: number;
  name: string;
  servings_count: number;
  note: string;
  ingredient_count: number;
  totals: NutritionTotals;
  per_serving: NutritionTotals;
  ingredients: NutritionRecipeIngredient[];
  created_at: string;
  updated_at: string;
};

export type RecipePayload = {
  name: string;
  servings_count: number;
  note?: string;
  ingredients: RecipeIngredientPayload[];
};

export type DetectedFood = {
  name: string;
  estimated_grams: number;
  calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  fiber_grams: number;
  sugar_grams: number;
  sodium_mg: number;
};

export type PhotoAnalysisResponse = {
  foods: DetectedFood[];
  notes: string;
};

export type LabelValues = {
  calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  fiber_grams: number;
  sugar_grams: number;
  sodium_mg: number;
};

export type LabelScanResponse = {
  product_name: string;
  brand_name: string;
  unit: "g" | "ml";
  per_100: LabelValues;
  serving_amount: number | null;
  package_amount: number | null;
  // false when no nutrition table could be read
  found: boolean;
  notes: string;
};
