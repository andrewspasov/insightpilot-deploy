export const NUTRITION_SAMPLE_FOODS = [
  { id: "chicken", name: "Cooked chicken breast", calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { id: "rice", name: "Cooked white rice", calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
  { id: "egg", name: "Whole egg", calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5 },
];

export type NutritionSampleUnit = "g" | "oz";
export const GRAMS_PER_OUNCE = 28.349523125;

export function calculateNutritionSample(foodId: string, amount: string, unit: NutritionSampleUnit) {
  const food = NUTRITION_SAMPLE_FOODS.find((item) => item.id === foodId) ?? NUTRITION_SAMPLE_FOODS[0];
  const quantity = Number(amount);
  const grams = quantity * (unit === "oz" ? GRAMS_PER_OUNCE : 1);
  const values = {
    calories: food.calories * grams / 100,
    protein: food.protein * grams / 100,
    carbs: food.carbs * grams / 100,
    fat: food.fat * grams / 100,
  };
  const valid = amount.trim() !== "" && quantity > 0 && Number.isFinite(grams)
    && Object.values(values).every(Number.isFinite);

  return {
    food, valid, grams: valid ? grams : 0,
    calories: valid ? values.calories : 0,
    protein: valid ? values.protein : 0,
    carbs: valid ? values.carbs : 0,
    fat: valid ? values.fat : 0,
  };
}
