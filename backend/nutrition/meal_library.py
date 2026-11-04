"""Built-in example meals, so every plan gets a meal plan without the AI.

Foods carry standard nutrition values per 100 g (cooked where relevant, USDA
FoodData Central reference values, rounded). Meals are combinations of those
foods; portions are scaled to each plan's targets when they are picked.
"""

from __future__ import annotations

import random
import re

# key: (name, kcal, protein, carbs, fat per 100 g/ml, avoid tags, like category, piece grams, piece label)
FOODS: dict[str, tuple] = {
    "oats": ("Rolled oats", 379, 13.2, 67.7, 6.5, {"gluten"}, "oats", None, None),
    "milk": ("Milk (2%)", 50, 3.3, 4.8, 2.0, {"dairy"}, "dairy", None, None),
    "soy_milk": ("Soy milk", 54, 3.3, 6.0, 1.8, {"soy"}, None, None, None),
    "greek_yogurt": ("Greek yogurt (2%)", 73, 9.9, 3.9, 2.0, {"dairy"}, "dairy", None, None),
    "cottage_cheese": ("Cottage cheese", 81, 10.5, 4.3, 2.3, {"dairy"}, "dairy", None, None),
    "cheddar": ("Cheddar cheese", 403, 24.9, 1.3, 33.1, {"dairy"}, "dairy", None, None),
    "mozzarella": ("Mozzarella (light)", 254, 24.3, 2.8, 15.9, {"dairy"}, "dairy", None, None),
    "feta": ("Feta cheese", 264, 14.2, 4.1, 21.3, {"dairy"}, "dairy", None, None),
    "cream_cheese": ("Cream cheese (light)", 201, 7.9, 8.0, 15.3, {"dairy"}, "dairy", None, None),
    "whey": ("Whey protein powder", 400, 80.0, 8.0, 6.0, {"dairy"}, None, 30, "scoop"),
    "protein_bar": ("Protein bar", 360, 30.0, 35.0, 12.0, {"dairy"}, None, 60, "bar"),
    "egg": ("Eggs", 143, 12.6, 0.7, 9.5, {"eggs"}, "eggs", 50, "large"),
    "egg_white": ("Egg whites", 52, 10.9, 0.7, 0.2, {"eggs"}, "eggs", None, None),
    "bread": ("Whole-wheat bread", 247, 13.0, 41.0, 3.4, {"gluten"}, "bread", 35, "slice"),
    "bagel": ("Bagel", 257, 10.0, 50.0, 1.6, {"gluten"}, "bread", 100, "whole"),
    "tortilla": ("Whole-wheat tortilla", 310, 8.0, 50.0, 8.0, {"gluten"}, "bread", 60, "large"),
    "rice_cake": ("Rice cakes", 387, 8.2, 81.5, 2.8, set(), "rice", 9, "piece"),
    "granola": ("Granola", 471, 10.0, 64.0, 20.0, {"gluten", "nuts"}, "oats", None, None),
    "white_rice": ("White rice (cooked)", 130, 2.7, 28.2, 0.3, set(), "rice", None, None),
    "brown_rice": ("Brown rice (cooked)", 123, 2.7, 25.6, 1.0, set(), "rice", None, None),
    "pasta": ("Pasta (cooked)", 158, 5.8, 30.9, 0.9, {"gluten"}, "pasta", None, None),
    "ww_pasta": ("Whole-wheat pasta (cooked)", 149, 6.0, 30.0, 1.7, {"gluten"}, "pasta", None, None),
    "egg_noodles": ("Egg noodles (cooked)", 138, 4.5, 25.2, 2.1, {"gluten", "eggs"}, "pasta", None, None),
    "potato": ("Potatoes (boiled)", 87, 1.9, 20.1, 0.1, set(), "potatoes", None, None),
    "sweet_potato": ("Sweet potato (baked)", 90, 2.0, 20.7, 0.2, set(), "potatoes", None, None),
    "quinoa": ("Quinoa (cooked)", 120, 4.4, 21.3, 1.9, set(), "rice", None, None),
    "chicken": ("Chicken breast (cooked)", 165, 31.0, 0.0, 3.6, {"poultry"}, "chicken", None, None),
    "turkey": ("Turkey breast (cooked)", 147, 30.0, 0.0, 2.1, {"poultry"}, "turkey", None, None),
    "lean_beef": ("Lean ground beef (cooked)", 217, 26.1, 0.0, 11.7, {"red_meat"}, "beef", None, None),
    "steak": ("Sirloin steak (cooked)", 190, 29.0, 0.0, 7.5, {"red_meat"}, "beef", None, None),
    "pork": ("Pork tenderloin (cooked)", 143, 26.0, 0.0, 3.5, {"pork"}, "pork", None, None),
    "salmon": ("Salmon (cooked)", 206, 22.0, 0.0, 12.4, {"fish"}, "fish", None, None),
    "smoked_salmon": ("Smoked salmon", 117, 18.3, 0.0, 4.3, {"fish"}, "fish", None, None),
    "tuna": ("Tuna in water (drained)", 116, 25.5, 0.0, 0.8, {"fish"}, "fish", None, None),
    "cod": ("Cod (cooked)", 105, 22.8, 0.0, 0.9, {"fish"}, "fish", None, None),
    "shrimp": ("Shrimp (cooked)", 99, 24.0, 0.2, 0.3, {"fish"}, "fish", None, None),
    "tofu": ("Firm tofu", 144, 17.3, 2.8, 8.7, {"soy"}, "tofu", None, None),
    "edamame": ("Edamame", 121, 11.9, 8.9, 5.2, {"soy"}, "legumes", None, None),
    "lentils": ("Lentils (cooked)", 116, 9.0, 20.1, 0.4, set(), "legumes", None, None),
    "chickpeas": ("Chickpeas (cooked)", 164, 8.9, 27.4, 2.6, set(), "legumes", None, None),
    "black_beans": ("Black beans (cooked)", 132, 8.9, 23.7, 0.5, set(), "legumes", None, None),
    "hummus": ("Hummus", 166, 7.9, 14.3, 9.6, set(), "legumes", None, None),
    "banana": ("Banana", 89, 1.1, 22.8, 0.3, set(), "fruit", 120, "medium"),
    "apple": ("Apple", 52, 0.3, 13.8, 0.2, set(), "fruit", 180, "medium"),
    "orange": ("Orange", 47, 0.9, 11.8, 0.1, set(), "fruit", 130, "medium"),
    "berries": ("Mixed berries", 57, 0.7, 14.5, 0.3, set(), "fruit", None, None),
    "raisins": ("Raisins", 299, 3.1, 79.2, 0.5, set(), "fruit", None, None),
    "peanut_butter": ("Peanut butter", 588, 25.1, 20.0, 50.4, {"nuts"}, "nuts", None, None),
    "almonds": ("Almonds", 579, 21.2, 21.6, 49.9, {"nuts"}, "nuts", None, None),
    "walnuts": ("Walnuts", 654, 15.2, 13.7, 65.2, {"nuts"}, "nuts", None, None),
    "olive_oil": ("Olive oil", 884, 0.0, 0.0, 100.0, set(), None, None, None),
    "avocado": ("Avocado", 160, 2.0, 8.5, 14.7, set(), "vegetables", None, None),
    "honey": ("Honey", 304, 0.3, 82.4, 0.0, {"honey"}, None, None, None),
    "dark_chocolate": ("Dark chocolate (70%)", 598, 7.8, 45.9, 42.6, set(), None, None, None),
    "broccoli": ("Broccoli (cooked)", 35, 2.4, 7.2, 0.4, set(), "vegetables", None, None),
    "mixed_veg": ("Mixed vegetables", 40, 2.0, 7.5, 0.3, set(), "vegetables", None, None),
    "spinach": ("Spinach", 23, 2.9, 3.6, 0.4, set(), "vegetables", None, None),
    "greens": ("Salad greens", 17, 1.2, 3.3, 0.2, set(), "vegetables", None, None),
    "tomato": ("Tomatoes", 18, 0.9, 3.9, 0.2, set(), "vegetables", None, None),
    "cucumber": ("Cucumber", 15, 0.7, 3.6, 0.1, set(), "vegetables", None, None),
    "mushrooms": ("Mushrooms", 22, 3.1, 3.3, 0.3, set(), "vegetables", None, None),
    "marinara": ("Tomato sauce", 50, 1.5, 8.0, 1.5, set(), "vegetables", None, None),
    "soy_sauce": ("Soy sauce", 53, 8.1, 4.9, 0.6, {"soy", "gluten"}, None, None, None),
}

LIQUIDS = {"milk", "soy_milk"}

# Share of the daily target each meal should cover.
MEAL_SPLIT = {"breakfast": 0.25, "lunch": 0.30, "dinner": 0.30, "snacks": 0.15}

# (meal_type, name, description, [(food, grams)])
MEALS: list[tuple] = [
    # Breakfast
    ("breakfast", "Peanut butter banana oats", "Oats cooked in milk, topped with banana and peanut butter.",
     [("oats", 80), ("milk", 250), ("banana", 120), ("peanut_butter", 20)]),
    ("breakfast", "Scrambled eggs on toast", "Eggs scrambled with spinach on whole-wheat toast.",
     [("egg", 150), ("bread", 70), ("spinach", 50), ("olive_oil", 5)]),
    ("breakfast", "Greek yogurt granola bowl", "Thick yogurt with granola, berries and a drizzle of honey.",
     [("greek_yogurt", 250), ("granola", 50), ("berries", 100), ("honey", 10)]),
    ("breakfast", "Protein overnight oats", "Oats soaked overnight in milk with whey and berries.",
     [("oats", 70), ("whey", 30), ("milk", 200), ("berries", 80)]),
    ("breakfast", "Egg and cheese breakfast wrap", "Scrambled eggs, cheddar and tomato in a tortilla.",
     [("tortilla", 60), ("egg", 150), ("cheddar", 20), ("tomato", 50)]),
    ("breakfast", "Cottage cheese, apple and walnuts", "Cottage cheese with sliced apple, walnuts and honey.",
     [("cottage_cheese", 250), ("apple", 180), ("walnuts", 20), ("honey", 10)]),
    ("breakfast", "Smoked salmon bagel", "Toasted bagel with light cream cheese, smoked salmon and cucumber.",
     [("bagel", 100), ("cream_cheese", 30), ("smoked_salmon", 80), ("cucumber", 40)]),
    ("breakfast", "Banana protein smoothie", "Milk, whey, banana, oats and peanut butter blended.",
     [("milk", 300), ("whey", 30), ("banana", 120), ("oats", 40), ("peanut_butter", 15)]),
    ("breakfast", "Tofu scramble on toast", "Crumbled tofu fried with spinach and tomato, on toast.",
     [("tofu", 200), ("bread", 70), ("spinach", 50), ("tomato", 60), ("olive_oil", 5)]),
    ("breakfast", "Peanut butter banana toast", "Whole-wheat toast with peanut butter and sliced banana.",
     [("bread", 70), ("peanut_butter", 30), ("banana", 120)]),
    ("breakfast", "Veggie omelette with potatoes", "Egg and egg-white omelette with mushrooms and spinach, potatoes on the side.",
     [("egg", 150), ("egg_white", 100), ("mushrooms", 60), ("spinach", 40), ("potato", 200), ("olive_oil", 5)]),
    ("breakfast", "Almond berry oat bowl", "Oats in soy milk with berries and almonds.",
     [("oats", 80), ("soy_milk", 250), ("berries", 100), ("almonds", 20)]),
    ("breakfast", "Turkey avocado toast", "Toast topped with avocado, turkey breast and tomato.",
     [("bread", 70), ("turkey", 80), ("avocado", 60), ("tomato", 50)]),
    # Lunch
    ("lunch", "Chicken rice bowl", "Grilled chicken with rice and broccoli.",
     [("chicken", 150), ("white_rice", 200), ("broccoli", 120), ("olive_oil", 10)]),
    ("lunch", "Beef and quinoa bowl", "Lean beef with quinoa and mixed vegetables.",
     [("lean_beef", 130), ("quinoa", 180), ("mixed_veg", 120), ("olive_oil", 5)]),
    ("lunch", "Tuna pasta salad", "Whole-wheat pasta with tuna, tomatoes and greens.",
     [("ww_pasta", 180), ("tuna", 120), ("tomato", 80), ("greens", 40), ("olive_oil", 10)]),
    ("lunch", "Turkey and cheese sandwich", "Whole-wheat sandwich with turkey, cheddar, tomato and greens.",
     [("bread", 70), ("turkey", 100), ("cheddar", 20), ("tomato", 50), ("greens", 20)]),
    ("lunch", "Chicken hummus wrap", "Chicken, hummus, greens and tomato in a tortilla.",
     [("tortilla", 60), ("chicken", 120), ("hummus", 40), ("greens", 30), ("tomato", 50)]),
    ("lunch", "Lentil and chickpea bowl", "Lentils, chickpeas and quinoa with spinach and olive oil.",
     [("lentils", 200), ("chickpeas", 120), ("quinoa", 100), ("spinach", 50), ("olive_oil", 10)]),
    ("lunch", "Salmon and sweet potato", "Baked salmon with sweet potato and broccoli.",
     [("salmon", 150), ("sweet_potato", 250), ("broccoli", 100)]),
    ("lunch", "Greek chicken rice salad", "Chicken, rice, cucumber, tomato and feta with olive oil.",
     [("chicken", 140), ("white_rice", 150), ("cucumber", 80), ("tomato", 80), ("feta", 30), ("olive_oil", 10)]),
    ("lunch", "Tofu stir-fry with rice", "Tofu and vegetables stir-fried in soy sauce, over rice.",
     [("tofu", 200), ("white_rice", 200), ("mixed_veg", 150), ("soy_sauce", 15), ("olive_oil", 10)]),
    ("lunch", "Beef burrito bowl", "Lean beef, rice, black beans, tomato and avocado.",
     [("lean_beef", 120), ("white_rice", 150), ("black_beans", 100), ("tomato", 60), ("avocado", 50)]),
    ("lunch", "Egg fried rice", "Rice fried with eggs and vegetables.",
     [("egg", 100), ("white_rice", 220), ("mixed_veg", 100), ("olive_oil", 10), ("soy_sauce", 10)]),
    ("lunch", "Pork tenderloin with potatoes", "Roast pork tenderloin with potatoes and vegetables.",
     [("pork", 150), ("potato", 250), ("mixed_veg", 120), ("olive_oil", 5)]),
    ("lunch", "Shrimp quinoa salad", "Shrimp with quinoa, avocado, tomato and greens.",
     [("shrimp", 150), ("quinoa", 180), ("avocado", 50), ("tomato", 60), ("greens", 30)]),
    # Dinner
    ("dinner", "Steak, potatoes and broccoli", "Sirloin steak with boiled potatoes and broccoli.",
     [("steak", 170), ("potato", 250), ("broccoli", 120), ("olive_oil", 5)]),
    ("dinner", "Baked salmon with brown rice", "Salmon fillet with brown rice and vegetables.",
     [("salmon", 150), ("brown_rice", 200), ("mixed_veg", 120)]),
    ("dinner", "Chicken pasta in tomato sauce", "Chicken and pasta in tomato sauce with mozzarella.",
     [("chicken", 140), ("pasta", 200), ("marinara", 120), ("mozzarella", 30)]),
    ("dinner", "Turkey spaghetti", "Turkey in tomato sauce over spaghetti.",
     [("turkey", 140), ("pasta", 200), ("marinara", 120)]),
    ("dinner", "Cod with sweet potato", "Baked cod with sweet potato and broccoli.",
     [("cod", 200), ("sweet_potato", 250), ("broccoli", 100), ("olive_oil", 10)]),
    ("dinner", "Beef chili with rice", "Lean beef and black bean chili over rice.",
     [("lean_beef", 120), ("black_beans", 120), ("marinara", 100), ("white_rice", 150)]),
    ("dinner", "Chicken noodle stir-fry", "Chicken and vegetables stir-fried with egg noodles.",
     [("chicken", 140), ("egg_noodles", 200), ("mixed_veg", 150), ("soy_sauce", 15), ("olive_oil", 10)]),
    ("dinner", "Lentil curry with rice", "Lentils simmered with tomato and spinach, served with rice.",
     [("lentils", 220), ("white_rice", 180), ("spinach", 60), ("tomato", 80), ("olive_oil", 10)]),
    ("dinner", "Tofu and chickpea curry", "Tofu and chickpeas with spinach, served with rice.",
     [("tofu", 150), ("chickpeas", 120), ("white_rice", 150), ("spinach", 50), ("olive_oil", 10)]),
    ("dinner", "Pork and rice with vegetables", "Pork tenderloin with rice and vegetables.",
     [("pork", 150), ("white_rice", 200), ("mixed_veg", 120), ("olive_oil", 5)]),
    ("dinner", "Shrimp pasta", "Shrimp and pasta in tomato sauce.",
     [("shrimp", 150), ("pasta", 200), ("marinara", 100), ("olive_oil", 10)]),
    ("dinner", "Chicken, quinoa and avocado", "Chicken with quinoa, avocado and greens.",
     [("chicken", 150), ("quinoa", 200), ("avocado", 60), ("greens", 40)]),
    ("dinner", "Bean and cheese quesadillas", "Tortillas filled with black beans, cheddar and tomato.",
     [("tortilla", 120), ("black_beans", 120), ("cheddar", 40), ("tomato", 60)]),
    ("dinner", "Black bean and sweet potato bowl", "Roasted sweet potato with black beans, avocado and tomato.",
     [("black_beans", 150), ("sweet_potato", 250), ("avocado", 50), ("tomato", 60), ("olive_oil", 5)]),
    ("dinner", "Tofu vegetable stir-fry", "Tofu and vegetables stir-fried in soy sauce, over brown rice.",
     [("tofu", 180), ("brown_rice", 200), ("mixed_veg", 150), ("soy_sauce", 15), ("olive_oil", 10)]),
    ("dinner", "Lentil bolognese", "Lentils in tomato sauce over whole-wheat pasta.",
     [("lentils", 200), ("ww_pasta", 180), ("marinara", 150), ("olive_oil", 5)]),
    ("dinner", "Chickpea quinoa bowl", "Quinoa with chickpeas, cucumber, tomato and hummus.",
     [("chickpeas", 150), ("quinoa", 180), ("cucumber", 60), ("tomato", 60), ("hummus", 40)]),
    # Snacks
    ("snacks", "Greek yogurt and berries", "Greek yogurt topped with berries.",
     [("greek_yogurt", 200), ("berries", 80)]),
    ("snacks", "Protein shake and banana", "Whey shaken with milk, banana on the side.",
     [("whey", 30), ("milk", 250), ("banana", 120)]),
    ("snacks", "Apple and peanut butter", "Apple slices with peanut butter.",
     [("apple", 180), ("peanut_butter", 25)]),
    ("snacks", "Cottage cheese and berries", "Cottage cheese with berries.",
     [("cottage_cheese", 200), ("berries", 80)]),
    ("snacks", "Rice cakes with peanut butter", "Rice cakes spread with peanut butter.",
     [("rice_cake", 27), ("peanut_butter", 25)]),
    ("snacks", "Hummus with cucumber and rice cakes", "Hummus with cucumber sticks and rice cakes.",
     [("hummus", 70), ("cucumber", 100), ("rice_cake", 18)]),
    ("snacks", "Almonds and raisins", "A handful of almonds and raisins.",
     [("almonds", 30), ("raisins", 30)]),
    ("snacks", "Protein bar and orange", "A protein bar with an orange.",
     [("protein_bar", 60), ("orange", 130)]),
    ("snacks", "Boiled eggs and toast", "Hard-boiled eggs with a slice of toast.",
     [("egg", 100), ("bread", 35)]),
    ("snacks", "Edamame", "Steamed edamame with a pinch of salt.",
     [("edamame", 200)]),
    ("snacks", "Tuna rice cakes", "Rice cakes topped with tuna and cucumber.",
     [("tuna", 80), ("rice_cake", 27), ("cucumber", 50)]),
    ("snacks", "Yogurt with dark chocolate and almonds", "Greek yogurt with chopped dark chocolate and almonds.",
     [("greek_yogurt", 150), ("dark_chocolate", 15), ("almonds", 15)]),
    ("snacks", "Banana and almonds", "A banana with a handful of almonds.",
     [("banana", 120), ("almonds", 20)]),
]

# Portions are scaled so each option lands near its share of the day's calories.
COUNT_UNITS = {"piece", "pieces", "slice", "slices", "egg", "eggs", "whole", "scoop", "scoops", "cup", "cups",
               "tbsp", "tsp", "serving", "servings", "can", "bar", "large", "medium", "small"}
MIN_SCALE, MAX_SCALE = 0.6, 2.0


def _round_quantity(quantity: float, unit: str) -> float:
    if unit.strip().lower() in COUNT_UNITS:
        return max(round(quantity * 2) / 2, 0.5)
    return max(round(quantity / 5) * 5, 5)


def scale_to_target(meal: dict, target_calories: float) -> dict:
    """Scale an option's portions so it lands near its share of the day's calories."""
    items = [i for i in meal.get("items") or [] if isinstance(i, dict)]
    total = sum(float(i.get("calories") or 0) for i in items)
    if total <= 0 or target_calories <= 0:
        return meal
    factor = min(max(target_calories / total, MIN_SCALE), MAX_SCALE)
    scaled = []
    for item in items:
        try:
            old_quantity = float(item.get("quantity") or 0)
        except (TypeError, ValueError):
            old_quantity = 0
        if old_quantity <= 0:
            scaled.append(item)
            continue
        new_quantity = _round_quantity(old_quantity * factor, str(item.get("unit") or ""))
        ratio = new_quantity / old_quantity
        scaled.append(
            {
                **item,
                "quantity": new_quantity,
                **{
                    key: round(float(item.get(key) or 0) * ratio, 1)
                    for key in ("calories", "protein_grams", "carbs_grams", "fat_grams")
                },
            }
        )
    return {**meal, "items": scaled}


# Choices offered in the apps (key, label).
LIKE_OPTIONS = [
    ("chicken", "Chicken"), ("turkey", "Turkey"), ("beef", "Beef"), ("pork", "Pork"), ("fish", "Fish & seafood"),
    ("eggs", "Eggs"), ("dairy", "Dairy"), ("tofu", "Tofu"), ("legumes", "Beans & lentils"), ("rice", "Rice"),
    ("oats", "Oats"), ("pasta", "Pasta"), ("potatoes", "Potatoes"), ("bread", "Bread"), ("fruit", "Fruit"),
    ("vegetables", "Vegetables"), ("nuts", "Nuts"),
]
AVOID_OPTIONS = [
    ("vegetarian", "Vegetarian"), ("vegan", "Vegan"), ("dairy", "Dairy / lactose"), ("gluten", "Gluten"),
    ("eggs", "Eggs"), ("fish", "Fish & seafood"), ("nuts", "Nuts & peanuts"), ("soy", "Soy"),
    ("pork", "Pork"), ("red_meat", "Red meat"), ("poultry", "Chicken & turkey"),
]
DIET_TAGS = {
    "vegetarian": {"red_meat", "pork", "poultry", "fish"},
    "vegan": {"red_meat", "pork", "poultry", "fish", "dairy", "eggs", "honey"},
}

# Free-text words that mean a whole tag.
TEXT_TAGS = {
    "lactose": "dairy", "dairy": "dairy", "milk": "dairy", "cheese": "dairy", "yogurt": "dairy",
    "gluten": "gluten", "wheat": "gluten", "celiac": "gluten", "coeliac": "gluten",
    "fish": "fish", "seafood": "fish", "shellfish": "fish",
    "nut": "nuts", "peanut": "nuts",
    "egg": "eggs", "soy": "soy", "soya": "soy",
    "pork": "pork", "ham": "pork", "bacon": "pork",
    "beef": "red_meat", "red": "red_meat",
    "chicken": "poultry", "poultry": "poultry", "turkey": "poultry",
    "vegetarian": "vegetarian", "vegan": "vegan",
}
IGNORED_WORDS = {"no", "not", "free", "dont", "don", "like", "avoid", "allergic", "allergy", "to", "and", "or",
                 "the", "i", "am", "any", "meat", "food", "foods", "please", "without", "intolerant", "hate"}


def _singular(word: str) -> str:
    return word[:-1] if len(word) > 3 and word.endswith("s") and not word.endswith("ss") else word


def avoided_tags(avoided: list[str], free_text: str) -> tuple[set[str], set[str]]:
    """Tags to exclude, plus free-text words to match against food names."""
    tags: set[str] = set()
    words: set[str] = set()
    for key in avoided or []:
        tags.add(key)
    for raw in re.split(r"[^a-z]+", (free_text or "").lower()):
        word = _singular(raw)
        if not word or word in IGNORED_WORDS:
            continue
        if word in TEXT_TAGS:
            tags.add(TEXT_TAGS[word])
        elif len(word) >= 3:
            words.add(word)
    for diet, implied in DIET_TAGS.items():
        if diet in tags:
            tags |= implied
    return tags, words


def _meal_allowed(items: list[tuple[str, float]], tags: set[str], words: set[str]) -> bool:
    for food_key, _ in items:
        name, *_rest = FOODS[food_key]
        food_tags = FOODS[food_key][5]
        if food_tags & tags:
            return False
        lowered = name.lower()
        if any(word in lowered for word in words):
            return False
    return True


def _like_score(items: list[tuple[str, float]], liked: set[str]) -> int:
    return sum(1 for food_key, _ in items if FOODS[food_key][6] in liked)


def build_item(food_key: str, grams: float) -> dict:
    name, kcal, protein, carbs, fat, _tags, _like, piece_g, piece_label = FOODS[food_key]
    factor = grams / 100.0
    if piece_g:
        quantity = round(grams / piece_g * 2) / 2 or 0.5
        unit = piece_label
    else:
        quantity = grams
        unit = "ml" if food_key in LIQUIDS else "g"
    return {
        "food_name": name,
        "quantity": quantity,
        "unit": unit,
        "calories": round(kcal * factor, 1),
        "protein_grams": round(protein * factor, 1),
        "carbs_grams": round(carbs * factor, 1),
        "fat_grams": round(fat * factor, 1),
    }


def pick_meals(
    liked: list[str],
    avoided: list[str],
    free_text: str,
    exclude_names: set[str] | None = None,
    per_type: int = 3,
    rng: random.Random | None = None,
) -> tuple[list[dict], list[str]]:
    """Choose example meals: avoided foods out, liked foods first, fresh picks when possible.

    Returns (meals, meal types that had no suitable options).
    """
    rng = rng or random.Random()
    tags, words = avoided_tags(avoided, free_text)
    liked_set = set(liked or [])
    exclude_names = exclude_names or set()
    chosen: list[dict] = []
    empty: list[str] = []
    for meal_type in ("breakfast", "lunch", "dinner", "snacks"):
        candidates = [m for m in MEALS if m[0] == meal_type and _meal_allowed(m[3], tags, words)]
        if not candidates:
            empty.append(meal_type)
            continue
        rng.shuffle(candidates)
        # Unseen meals first, then the ones that match more liked foods.
        candidates.sort(key=lambda m: (m[1] in exclude_names, -_like_score(m[3], liked_set)))
        for meal_type_, name, description, items in candidates[:per_type]:
            chosen.append(
                {
                    "meal_type": meal_type_,
                    "name": name,
                    "description": description,
                    "items": [build_item(food, grams) for food, grams in items],
                }
            )
    return chosen, empty
