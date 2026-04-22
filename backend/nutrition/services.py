from __future__ import annotations

from fractions import Fraction
import re
from typing import Iterable

import requests
from django.conf import settings
from django.db.models import Q

from .models import CustomFood, MealEntry


USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
OPEN_FOOD_FACTS_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
OPEN_FOOD_FACTS_HEADERS = {
    "User-Agent": "InsightPilot Nutrition/1.0 (local-dev)",
}

NUTRIENT_KEYS = (
    "calories",
    "protein_grams",
    "carbs_grams",
    "fat_grams",
    "fiber_grams",
    "sugar_grams",
    "sodium_mg",
)

UNIT_LABELS = {
    "g": "g",
    "oz": "oz",
    "ml": "mL",
    "cup": "cup",
    "tbsp": "tbsp",
    "tsp": "tsp",
    "piece": "piece",
    "serving": "serving",
}

OPEN_FOOD_FACTS_IMAGE_CACHE: dict[str, str | None] = {}

LOCAL_FOOD_FALLBACKS = [
    {
        "external_food_id": "banana",
        "food_name": "Banana",
        "brand_name": "",
        "reference_amount": 100.0,
        "reference_unit": "g",
        "gram_weight": 100.0,
        "calories": 89.0,
        "protein_grams": 1.1,
        "carbs_grams": 22.8,
        "fat_grams": 0.3,
        "fiber_grams": 2.6,
        "sugar_grams": 12.2,
        "sodium_mg": 1.0,
    },
    {
        "external_food_id": "apple",
        "food_name": "Apple",
        "brand_name": "",
        "reference_amount": 100.0,
        "reference_unit": "g",
        "gram_weight": 100.0,
        "calories": 52.0,
        "protein_grams": 0.3,
        "carbs_grams": 13.8,
        "fat_grams": 0.2,
        "fiber_grams": 2.4,
        "sugar_grams": 10.4,
        "sodium_mg": 1.0,
    },
    {
        "external_food_id": "egg",
        "food_name": "Egg",
        "brand_name": "",
        "reference_amount": 1.0,
        "reference_unit": "egg",
        "gram_weight": 50.0,
        "calories": 72.0,
        "protein_grams": 6.3,
        "carbs_grams": 0.4,
        "fat_grams": 4.8,
        "fiber_grams": 0.0,
        "sugar_grams": 0.2,
        "sodium_mg": 71.0,
    },
    {
        "external_food_id": "chicken-breast",
        "food_name": "Chicken Breast",
        "brand_name": "",
        "reference_amount": 100.0,
        "reference_unit": "g",
        "gram_weight": 100.0,
        "calories": 165.0,
        "protein_grams": 31.0,
        "carbs_grams": 0.0,
        "fat_grams": 3.6,
        "fiber_grams": 0.0,
        "sugar_grams": 0.0,
        "sodium_mg": 74.0,
    },
    {
        "external_food_id": "rice",
        "food_name": "Cooked White Rice",
        "brand_name": "",
        "reference_amount": 100.0,
        "reference_unit": "g",
        "gram_weight": 100.0,
        "calories": 130.0,
        "protein_grams": 2.7,
        "carbs_grams": 28.2,
        "fat_grams": 0.3,
        "fiber_grams": 0.4,
        "sugar_grams": 0.1,
        "sodium_mg": 1.0,
    },
    {
        "external_food_id": "oats",
        "food_name": "Rolled Oats",
        "brand_name": "",
        "reference_amount": 40.0,
        "reference_unit": "g",
        "gram_weight": 40.0,
        "calories": 156.0,
        "protein_grams": 6.8,
        "carbs_grams": 26.5,
        "fat_grams": 2.8,
        "fiber_grams": 4.2,
        "sugar_grams": 0.4,
        "sodium_mg": 2.0,
    },
    {
        "external_food_id": "greek-yogurt",
        "food_name": "Greek Yogurt",
        "brand_name": "",
        "reference_amount": 170.0,
        "reference_unit": "g",
        "gram_weight": 170.0,
        "calories": 100.0,
        "protein_grams": 17.0,
        "carbs_grams": 6.0,
        "fat_grams": 0.0,
        "fiber_grams": 0.0,
        "sugar_grams": 6.0,
        "sodium_mg": 60.0,
    },
    {
        "external_food_id": "salmon",
        "food_name": "Salmon",
        "brand_name": "",
        "reference_amount": 100.0,
        "reference_unit": "g",
        "gram_weight": 100.0,
        "calories": 208.0,
        "protein_grams": 20.4,
        "carbs_grams": 0.0,
        "fat_grams": 13.4,
        "fiber_grams": 0.0,
        "sugar_grams": 0.0,
        "sodium_mg": 59.0,
    },
]


def _food_identity(food_name: str, brand_name: str, unit_key: str) -> tuple[str, str, str]:
    return (
        (food_name or "").strip().lower(),
        (brand_name or "").strip().lower(),
        (unit_key or "").strip().lower(),
    )


def _round(value: float | int | None) -> float:
    return round(float(value or 0.0), 2)


def _build_nutrient_payload(
    *,
    calories: float = 0.0,
    protein_grams: float = 0.0,
    carbs_grams: float = 0.0,
    fat_grams: float = 0.0,
    fiber_grams: float = 0.0,
    sugar_grams: float = 0.0,
    sodium_mg: float = 0.0,
) -> dict:
    return {
        "calories": _round(calories),
        "protein_grams": _round(protein_grams),
        "carbs_grams": _round(carbs_grams),
        "fat_grams": _round(fat_grams),
        "fiber_grams": _round(fiber_grams),
        "sugar_grams": _round(sugar_grams),
        "sodium_mg": _round(sodium_mg),
    }


def _scale_nutrients(nutrients: dict, factor: float) -> dict:
    return {
        key: _round(float(nutrients.get(key, 0.0)) * factor)
        for key in NUTRIENT_KEYS
    }


def _unit_label(unit_key: str) -> str:
    return UNIT_LABELS.get(unit_key, unit_key)


def _normalize_unit_key(text: str) -> str:
    cleaned = (text or "").strip().lower()
    cleaned = cleaned.replace(".", "")
    aliases = {
        "gram": "g",
        "grams": "g",
        "g": "g",
        "ounce": "oz",
        "ounces": "oz",
        "oz": "oz",
        "milliliter": "ml",
        "milliliters": "ml",
        "millilitre": "ml",
        "millilitres": "ml",
        "ml": "ml",
        "cups": "cup",
        "cup": "cup",
        "tablespoon": "tbsp",
        "tablespoons": "tbsp",
        "tbsp": "tbsp",
        "teaspoon": "tsp",
        "teaspoons": "tsp",
        "tsp": "tsp",
        "pieces": "piece",
        "piece": "piece",
        "pcs": "piece",
        "pc": "piece",
        "servings": "serving",
        "serving": "serving",
    }
    return aliases.get(cleaned, cleaned)


def _parse_amount(text: str) -> float | None:
    value = (text or "").strip()
    if not value:
        return None
    try:
        if "/" in value:
            return float(Fraction(value))
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _parse_household_serving(text: str) -> tuple[float, str, str] | None:
    cleaned = (text or "").strip()
    if not cleaned:
        return None
    match = re.match(r"^\s*(\d+(?:\.\d+)?|\d+\s*/\s*\d+)\s+(.+?)\s*$", cleaned)
    if not match:
        return None
    amount = _parse_amount(match.group(1).replace(" ", ""))
    unit_label = match.group(2).strip().lower()
    if amount is None or amount <= 0:
        return None
    return amount, _normalize_unit_key(unit_label), unit_label


def _append_unit_option(options: list[dict], option: dict):
    if any(existing["key"] == option["key"] for existing in options):
        return
    options.append(option)


def _build_unit_option(
    *,
    key: str,
    label: str,
    nutrients: dict,
    grams_per_unit: float | None = None,
) -> dict:
    return {
        "key": key,
        "label": label,
        "grams_per_unit": _round(grams_per_unit) if grams_per_unit else None,
        **{name: _round(nutrients.get(name)) for name in NUTRIENT_KEYS},
    }


def get_default_unit_key(available_units: list[dict]) -> str:
    if not available_units:
        return "serving"
    return available_units[0]["key"]


def _resolve_image_url(obj, request=None):
    image_field = getattr(obj, "image", None)
    if image_field:
        try:
            raw_url = image_field.url
        except ValueError:
            raw_url = None
        if raw_url:
            if request is None:
                return raw_url
            return request.build_absolute_uri(raw_url)

    external_image_url = getattr(obj, "external_image_url", "") or getattr(obj, "image_url", "")
    return external_image_url or None


def _build_search_result(
    *,
    result_id: str,
    food_source: str,
    external_food_id: str,
    food_name: str,
    brand_name: str = "",
    serving_description: str = "serving",
    label: str = "",
    is_favorite: bool = False,
    available_units: list[dict] | None = None,
    image_url: str | None = None,
) -> dict:
    units = available_units or [
        _build_unit_option(
            key="serving",
            label="serving",
            nutrients=_build_nutrient_payload(),
        )
    ]
    default_unit_key = get_default_unit_key(units)
    default_unit = next(
        (unit for unit in units if unit["key"] == default_unit_key),
        units[0],
    )

    return {
        "id": result_id,
        "food_source": food_source,
        "external_food_id": external_food_id,
        "food_name": food_name,
        "brand_name": brand_name,
        "serving_description": serving_description,
        "measurement_unit": default_unit["key"],
        "calories": default_unit["calories"],
        "protein_grams": default_unit["protein_grams"],
        "carbs_grams": default_unit["carbs_grams"],
        "fat_grams": default_unit["fat_grams"],
        "fiber_grams": default_unit["fiber_grams"],
        "sugar_grams": default_unit["sugar_grams"],
        "sodium_mg": default_unit["sodium_mg"],
        "grams_per_unit": default_unit["grams_per_unit"],
        "label": label,
        "is_favorite": bool(is_favorite),
        "available_units": units,
        "default_unit_key": default_unit_key,
        "image_url": image_url,
    }


def _build_weight_unit_options(per_gram_nutrients: dict) -> list[dict]:
    return [
        _build_unit_option(
            key="g",
            label="g",
            nutrients=per_gram_nutrients,
            grams_per_unit=1.0,
        ),
        _build_unit_option(
            key="oz",
            label="oz",
            nutrients=_scale_nutrients(per_gram_nutrients, 28.349523125),
            grams_per_unit=28.349523125,
        ),
    ]


def _build_volume_unit_options(per_ml_nutrients: dict) -> list[dict]:
    return [
        _build_unit_option(
            key="ml",
            label="mL",
            nutrients=per_ml_nutrients,
            grams_per_unit=None,
        ),
        _build_unit_option(
            key="cup",
            label="cup",
            nutrients=_scale_nutrients(per_ml_nutrients, 236.588),
            grams_per_unit=None,
        ),
        _build_unit_option(
            key="tbsp",
            label="tbsp",
            nutrients=_scale_nutrients(per_ml_nutrients, 14.7868),
            grams_per_unit=None,
        ),
        _build_unit_option(
            key="tsp",
            label="tsp",
            nutrients=_scale_nutrients(per_ml_nutrients, 4.92892),
            grams_per_unit=None,
        ),
    ]


def _build_reference_unit_option(
    *,
    reference_amount: float,
    reference_unit: str,
    reference_label: str,
    reference_nutrients: dict,
    gram_weight: float | None,
) -> dict:
    amount = max(reference_amount, 0.01)
    per_unit_nutrients = _scale_nutrients(reference_nutrients, 1 / amount)
    grams_per_unit = gram_weight / amount if gram_weight else None
    return _build_unit_option(
        key=reference_unit,
        label=reference_label,
        nutrients=per_unit_nutrients,
        grams_per_unit=grams_per_unit,
    )


def _lookup_open_food_facts_image(barcode: str | None) -> str | None:
    cleaned = re.sub(r"\D", "", barcode or "")
    if not cleaned:
        return None
    if cleaned in OPEN_FOOD_FACTS_IMAGE_CACHE:
        return OPEN_FOOD_FACTS_IMAGE_CACHE[cleaned]

    image_url = None
    try:
        response = requests.get(
            OPEN_FOOD_FACTS_PRODUCT_URL.format(barcode=cleaned),
            params={
                "fields": "image_front_small_url,image_front_url,image_small_url,image_url",
            },
            headers=OPEN_FOOD_FACTS_HEADERS,
            timeout=4,
        )
        response.raise_for_status()
        payload = response.json() or {}
        product = payload.get("product") or {}
        image_url = (
            product.get("image_front_small_url")
            or product.get("image_front_url")
            or product.get("image_small_url")
            or product.get("image_url")
        )
    except requests.RequestException:
        image_url = None

    OPEN_FOOD_FACTS_IMAGE_CACHE[cleaned] = image_url
    return image_url


def build_custom_food_unit_options(food: CustomFood) -> list[dict]:
    reference_nutrients = _build_nutrient_payload(
        calories=food.calories,
        protein_grams=food.protein_grams,
        carbs_grams=food.carbs_grams,
        fat_grams=food.fat_grams,
        fiber_grams=food.fiber_grams,
        sugar_grams=food.sugar_grams,
        sodium_mg=food.sodium_mg,
    )
    options: list[dict] = []

    if food.gram_weight:
        per_gram_nutrients = _scale_nutrients(reference_nutrients, 1 / float(food.gram_weight))
        for option in _build_weight_unit_options(per_gram_nutrients):
            _append_unit_option(options, option)

    if food.base_unit == "ml":
        per_ml_nutrients = _scale_nutrients(reference_nutrients, 1 / max(float(food.base_amount), 0.01))
        for option in _build_volume_unit_options(per_ml_nutrients):
            _append_unit_option(options, option)

    reference_label = _unit_label(food.base_unit)
    _append_unit_option(
        options,
        _build_reference_unit_option(
            reference_amount=float(food.base_amount),
            reference_unit=food.base_unit,
            reference_label=reference_label,
            reference_nutrients=reference_nutrients,
            gram_weight=food.gram_weight,
        ),
    )

    return options


def _serialize_custom_food(food: CustomFood, request=None) -> dict:
    units = build_custom_food_unit_options(food)
    return _build_search_result(
        result_id=f"custom:{food.id}",
        food_source=MealEntry.SOURCE_CUSTOM,
        external_food_id=str(food.id),
        food_name=food.name,
        brand_name=food.brand_name,
        serving_description=food.serving_description or f"{food.base_amount} {food.base_unit}",
        label="Custom",
        is_favorite=food.is_favorite,
        available_units=units,
        image_url=_resolve_image_url(food, request),
    )


def _serialize_recent_entry(entry: MealEntry) -> dict:
    reference_nutrients = _build_nutrient_payload(
        calories=entry.serving_calories,
        protein_grams=entry.serving_protein_grams,
        carbs_grams=entry.serving_carbs_grams,
        fat_grams=entry.serving_fat_grams,
        fiber_grams=entry.serving_fiber_grams,
        sugar_grams=entry.serving_sugar_grams,
        sodium_mg=entry.serving_sodium_mg,
    )
    options: list[dict] = []

    if entry.grams_per_unit:
        per_gram_nutrients = _scale_nutrients(reference_nutrients, 1 / float(entry.grams_per_unit))
        for option in _build_weight_unit_options(per_gram_nutrients):
            _append_unit_option(options, option)

    if entry.measurement_unit == "ml":
        for option in _build_volume_unit_options(reference_nutrients):
            _append_unit_option(options, option)

    _append_unit_option(
        options,
        _build_unit_option(
            key=entry.measurement_unit or "serving",
            label=entry.serving_description or _unit_label(entry.measurement_unit or "serving"),
            nutrients=reference_nutrients,
            grams_per_unit=entry.grams_per_unit,
        ),
    )

    return _build_search_result(
        result_id=f"recent:{entry.id}",
        food_source=MealEntry.SOURCE_RECENT,
        external_food_id=entry.external_food_id or str(entry.id),
        food_name=entry.food_name,
        brand_name=entry.brand_name,
        serving_description=entry.serving_description,
        label="Recent",
        available_units=options,
        image_url=entry.image_url or None,
    )


def _search_recent_foods(user, query: str, limit: int) -> list[dict]:
    queryset = MealEntry.objects.filter(owner=user).order_by("-created_at")
    if query:
        queryset = queryset.filter(
            Q(food_name__icontains=query) | Q(brand_name__icontains=query)
        )

    results = []
    seen: set[tuple[str, str, str]] = set()
    for entry in queryset[: limit * 3]:
        identity = _food_identity(entry.food_name, entry.brand_name, entry.measurement_unit)
        if identity in seen:
            continue
        seen.add(identity)
        results.append(_serialize_recent_entry(entry))
        if len(results) >= limit:
            break
    return results


def _search_custom_foods(user, query: str, limit: int, request=None) -> list[dict]:
    queryset = CustomFood.objects.filter(owner=user).order_by("-is_favorite", "-updated_at")
    if query:
        queryset = queryset.filter(Q(name__icontains=query) | Q(brand_name__icontains=query))
    return [_serialize_custom_food(food, request) for food in queryset[:limit]]


def _extract_nutrient(food: dict, names: Iterable[str], numbers: Iterable[str] = ()) -> float:
    wanted_names = {name.strip().lower() for name in names}
    wanted_numbers = {str(number).strip() for number in numbers}
    for item in food.get("foodNutrients") or []:
        nutrient_name = str(item.get("nutrientName") or item.get("name") or "").strip().lower()
        nutrient_number = str(item.get("nutrientNumber") or "").strip()
        if nutrient_name not in wanted_names and nutrient_number not in wanted_numbers:
            continue
        value = item.get("value")
        if value is None:
            value = item.get("amount")
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return 0.0


def _normalize_usda_food(food: dict) -> dict:
    household_serving = str(food.get("householdServingFullText") or "").strip()
    serving_size = food.get("servingSize")
    serving_size_unit = _normalize_unit_key(str(food.get("servingSizeUnit") or ""))
    parsed_household = _parse_household_serving(household_serving)

    reference_nutrients = _build_nutrient_payload(
        calories=_extract_nutrient(food, ["energy"], ["1008", "208"]),
        protein_grams=_extract_nutrient(food, ["protein"], ["1003"]),
        carbs_grams=_extract_nutrient(food, ["carbohydrate, by difference"], ["1005"]),
        fat_grams=_extract_nutrient(food, ["total lipid (fat)"], ["1004"]),
        fiber_grams=_extract_nutrient(food, ["fiber, total dietary"], ["1079", "291"]),
        sugar_grams=_extract_nutrient(food, ["sugars, total including nlea"], ["2000", "269"]),
        sodium_mg=_extract_nutrient(food, ["sodium, na"], ["1093"]),
    )

    options: list[dict] = []
    grams_for_household_unit = None

    if serving_size_unit == "g" or not serving_size_unit:
        per_gram_nutrients = _scale_nutrients(reference_nutrients, 1 / 100)
        for option in _build_weight_unit_options(per_gram_nutrients):
            _append_unit_option(options, option)
        if parsed_household and serving_size:
            household_amount, household_unit_key, household_label = parsed_household
            grams_for_household_unit = float(serving_size) / household_amount
            _append_unit_option(
                options,
                _build_unit_option(
                    key=household_unit_key,
                    label=household_label,
                    nutrients=_scale_nutrients(per_gram_nutrients, grams_for_household_unit),
                    grams_per_unit=grams_for_household_unit,
                ),
            )
    elif serving_size_unit == "ml":
        per_ml_nutrients = _scale_nutrients(reference_nutrients, 1 / 100)
        for option in _build_volume_unit_options(per_ml_nutrients):
            _append_unit_option(options, option)
        if parsed_household and serving_size:
            household_amount, household_unit_key, household_label = parsed_household
            ml_for_household_unit = float(serving_size) / household_amount
            _append_unit_option(
                options,
                _build_unit_option(
                    key=household_unit_key,
                    label=household_label,
                    nutrients=_scale_nutrients(per_ml_nutrients, ml_for_household_unit),
                    grams_per_unit=None,
                ),
            )

    if not options:
        serving_description = household_serving or "serving"
        _append_unit_option(
            options,
            _build_unit_option(
                key="serving",
                label=serving_description,
                nutrients=reference_nutrients,
                grams_per_unit=grams_for_household_unit,
            ),
        )

    brand_name = str(food.get("brandOwner") or food.get("brandName") or "").strip()
    image_url = _lookup_open_food_facts_image(str(food.get("gtinUpc") or ""))

    return _build_search_result(
        result_id=f"usda:{food.get('fdcId')}",
        food_source=MealEntry.SOURCE_USDA,
        external_food_id=str(food.get("fdcId") or ""),
        food_name=str(food.get("description") or "").strip(),
        brand_name=brand_name,
        serving_description=household_serving or "100 g",
        label="USDA",
        available_units=options,
        image_url=image_url,
    )


def _search_usda_foods(query: str, limit: int) -> list[dict]:
    api_key = getattr(settings, "USDA_FOODDATA_CENTRAL_API_KEY", "")
    if not api_key or not query:
        return []

    response = requests.get(
        USDA_SEARCH_URL,
        params={
            "query": query,
            "pageSize": limit,
            "api_key": api_key,
        },
        timeout=8,
    )
    response.raise_for_status()

    payload = response.json() or {}
    foods = payload.get("foods") or []
    results = []
    for food in foods:
        normalized = _normalize_usda_food(food)
        if not normalized["food_name"]:
            continue
        results.append(normalized)
    return results


def _build_fallback_unit_options(food: dict) -> list[dict]:
    reference_nutrients = _build_nutrient_payload(
        calories=food["calories"],
        protein_grams=food["protein_grams"],
        carbs_grams=food["carbs_grams"],
        fat_grams=food["fat_grams"],
        fiber_grams=food["fiber_grams"],
        sugar_grams=food["sugar_grams"],
        sodium_mg=food["sodium_mg"],
    )
    options: list[dict] = []

    gram_weight = food.get("gram_weight")
    if gram_weight:
        per_gram_nutrients = _scale_nutrients(reference_nutrients, 1 / float(gram_weight))
        for option in _build_weight_unit_options(per_gram_nutrients):
            _append_unit_option(options, option)

    _append_unit_option(
        options,
        _build_reference_unit_option(
            reference_amount=float(food.get("reference_amount") or 1.0),
            reference_unit=str(food.get("reference_unit") or "serving"),
            reference_label=_unit_label(str(food.get("reference_unit") or "serving")),
            reference_nutrients=reference_nutrients,
            gram_weight=gram_weight,
        ),
    )

    return options


def _search_local_fallback_foods(query: str, limit: int) -> list[dict]:
    query_lower = query.lower()
    matches = []
    for food in LOCAL_FOOD_FALLBACKS:
        haystack = f"{food['food_name']} {food['brand_name']}".lower()
        if query_lower not in haystack:
            continue
        matches.append(
            _build_search_result(
                result_id=f"demo:{food['external_food_id']}",
                food_source=MealEntry.SOURCE_DEMO,
                external_food_id=food["external_food_id"],
                food_name=food["food_name"],
                brand_name=food["brand_name"],
                serving_description=f"{food['reference_amount']} {food['reference_unit']}",
                label="Demo",
                available_units=_build_fallback_unit_options(food),
            )
        )
        if len(matches) >= limit:
            break
    return matches


def search_foods_for_user(user, query: str, limit: int = 12, request=None) -> list[dict]:
    query_clean = (query or "").strip()
    results: list[dict] = []
    seen: set[tuple[str, str, str]] = set()

    grouped_results = [
        _search_recent_foods(user, query_clean, limit=4),
        _search_custom_foods(user, query_clean, limit=4, request=request),
    ]

    if query_clean:
        try:
            usda_results = _search_usda_foods(query_clean, limit=limit)
        except requests.RequestException:
            usda_results = []
        grouped_results.append(usda_results)
        if not usda_results:
            grouped_results.append(_search_local_fallback_foods(query_clean, limit=limit))

    for group in grouped_results:
        for item in group:
            identity = _food_identity(
                item["food_name"],
                item["brand_name"],
                item["default_unit_key"],
            )
            if identity in seen:
                continue
            seen.add(identity)
            results.append(item)
            if len(results) >= limit:
                return results

    return results
