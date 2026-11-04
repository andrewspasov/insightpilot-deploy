"""Food photos from Unsplash or Pexels (both free), cached per food name.

Each normalised name is looked up once; misses are cached too so the API isn't
asked again for a while. Without UNSPLASH_ACCESS_KEY or PEXELS_API_KEY
everything returns no image. Photos are hotlinked, as both services require.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import requests
from django.conf import settings
from django.db import IntegrityError
from django.utils import timezone

from .models import FoodImage

logger = logging.getLogger(__name__)

PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"
UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos"
# A miss is retried after this long (the food may get photos, or the key may change).
RETRY_MISSES_AFTER = timedelta(days=30)
# Words that describe preparation or packaging rather than what the food looks like.
NOISE_WORDS = {
    "cooked", "boiled", "baked", "raw", "drained", "light", "low", "fat", "lowfat", "reduced", "plain",
    "unsweetened", "sweetened", "large", "medium", "small", "fresh", "frozen", "canned", "in", "water",
    "whole", "with", "and", "the", "of", "a", "organic", "skinless", "boneless",
}


def normalize(name: str) -> str:
    """'Black beans (cooked)' -> 'black beans'; 'Milk (2%)' -> 'milk'."""
    text = re.sub(r"\([^)]*\)", " ", (name or "").lower())
    text = re.sub(r"[^a-z\s-]", " ", text)
    words = [w for w in re.split(r"[\s-]+", text) if w and w not in NOISE_WORDS]
    return " ".join(words[:5])


def _provider() -> str:
    if settings.UNSPLASH_ACCESS_KEY:
        return "unsplash"
    return "pexels" if settings.PEXELS_API_KEY else ""


def credit(image: FoodImage) -> str:
    """'Jane Doe / Unsplash' — both services ask for the photographer and source."""
    source = "Unsplash" if "unsplash.com" in image.source_url else "Pexels"
    return f"{image.photographer} / {source}" if image.photographer else source


def _search(query: str) -> dict:
    if _provider() == "unsplash":
        return _search_unsplash(query)
    return _search_pexels(query)


def _search_unsplash(query: str) -> dict:
    response = requests.get(
        UNSPLASH_SEARCH_URL,
        headers={"Authorization": f"Client-ID {settings.UNSPLASH_ACCESS_KEY}", "Accept-Version": "v1"},
        params={"query": f"{query} food", "per_page": 5, "orientation": "landscape", "content_filter": "high"},
        timeout=5,
    )
    response.raise_for_status()
    results = response.json().get("results") or []
    if not results:
        return {}
    photo = _best_match(query, results)
    urls = photo.get("urls") or {}
    return {
        "image_url": urls.get("small") or "",
        "thumb_url": urls.get("thumb") or urls.get("small") or "",
        "photographer": ((photo.get("user") or {}).get("name") or "")[:200],
        "source_url": (photo.get("links") or {}).get("html") or "",
    }


def _best_match(query: str, results: list[dict]) -> dict:
    """The first photo whose description names the food ('milk' search can return a candle)."""
    words = [w for w in query.split() if len(w) > 2]
    for photo in results:
        described = f"{photo.get('alt_description') or ''} {photo.get('description') or ''}".lower()
        if any(word in described or word.rstrip("s") in described for word in words):
            return photo
    return results[0]


def _search_pexels(query: str) -> dict:
    response = requests.get(
        PEXELS_SEARCH_URL,
        headers={"Authorization": settings.PEXELS_API_KEY},
        params={"query": f"{query} food", "per_page": 1, "orientation": "landscape"},
        timeout=5,
    )
    response.raise_for_status()
    photos = response.json().get("photos") or []
    if not photos:
        return {}
    photo = photos[0]
    src = photo.get("src") or {}
    return {
        "image_url": src.get("medium") or "",
        "thumb_url": src.get("tiny") or src.get("small") or "",
        "photographer": (photo.get("photographer") or "")[:200],
        "source_url": photo.get("url") or "",
    }


def _cached(queries: set[str]) -> dict[str, FoodImage]:
    return {img.query: img for img in FoodImage.objects.filter(query__in=queries)}


def _safe_search(query: str) -> dict | None:
    """The photo for a query, {} when Pexels has none, None when the lookup failed."""
    try:
        return _search(query)
    except (requests.RequestException, ValueError) as exc:
        # Network or quota problems are not cached; the next request tries again.
        logger.warning("Pexels lookup failed for %r: %s", query, exc)
        return None


def _store(query: str, found: dict) -> None:
    try:
        FoodImage.objects.update_or_create(query=query, defaults=found or {"image_url": "", "thumb_url": ""})
    except IntegrityError:
        pass  # Another request stored it at the same moment.


def images_for(names, fetch: bool = True, max_fetch: int = 12) -> dict[str, FoodImage]:
    """Map each name to its cached photo, looking up missing ones (in parallel) when fetch=True."""
    by_name = {name: normalize(name) for name in names if name}
    queries = {q for q in by_name.values() if q}
    cached = _cached(queries)
    if fetch and _provider():
        stale_before = timezone.now() - RETRY_MISSES_AFTER
        missing = [
            q for q in queries
            if q not in cached or (not cached[q].image_url and cached[q].fetched_at < stale_before)
        ][:max_fetch]
        if missing:
            # Only the HTTP calls run in threads; the database is written here.
            with ThreadPoolExecutor(max_workers=4) as pool:
                results = list(pool.map(_safe_search, missing))
            for query, found in zip(missing, results):
                if found is not None:
                    _store(query, found)
            cached = _cached(queries)
    return {name: cached[q] for name, q in by_name.items() if q in cached and cached[q].image_url}
