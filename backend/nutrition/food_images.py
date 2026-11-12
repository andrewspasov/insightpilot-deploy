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
from django.core.cache import cache
from django.db import IntegrityError
from django.utils import timezone

from .models import FoodImage

logger = logging.getLogger(__name__)

PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"
UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos"
# A miss is retried after this long (the food may get photos, or the key may change).
RETRY_MISSES_AFTER = timedelta(days=30)
# When the photo service says "too many requests" (Unsplash demo keys get 50 an
# hour), stop asking for this long instead of retrying on every page load.
PAUSE_AFTER_LIMIT = timedelta(hours=1)
PAUSE_CACHE_KEY = "food_images:paused"
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
    # Single letters are leftovers like the "s" in "Domino's".
    words = [w for w in re.split(r"[\s-]+", text) if len(w) > 1 and w not in NOISE_WORDS]
    return " ".join(words[:5])


def _provider() -> str:
    if settings.UNSPLASH_ACCESS_KEY:
        return "unsplash"
    return "pexels" if settings.PEXELS_API_KEY else ""


def credit(image: FoodImage) -> str:
    """'Jane Doe / Unsplash' — both services ask for the photographer and source."""
    source = "Unsplash" if "unsplash.com" in image.source_url else "Pexels"
    return f"{image.photographer} / {source}" if image.photographer else source


def _with_referral(url: str) -> str:
    """Unsplash wants every link back to it tagged with the app name."""
    if not url:
        return ""
    joiner = "&" if "?" in url else "?"
    return f"{url}{joiner}utm_source={settings.UNSPLASH_APP_NAME}&utm_medium=referral"


def attribution(image: FoodImage) -> dict:
    """The linked credit shown next to a photo: 'Photo by <photographer> on <Unsplash>'."""
    if "unsplash.com" in image.source_url:
        return {
            "photographer": image.photographer,
            "photographer_url": _with_referral(image.photographer_url or image.source_url),
            "provider": "Unsplash",
            "provider_url": _with_referral("https://unsplash.com/"),
        }
    return {
        "photographer": image.photographer,
        "photographer_url": image.photographer_url or image.source_url,
        "provider": "Pexels",
        "provider_url": "https://www.pexels.com/",
    }


def _track_download(download_location: str) -> None:
    """Tell Unsplash a photo was chosen for use (their API guidelines require it)."""
    try:
        requests.get(
            download_location,
            headers={"Authorization": f"Client-ID {settings.UNSPLASH_ACCESS_KEY}", "Accept-Version": "v1"},
            timeout=5,
        ).raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Unsplash download tracking failed: %s", exc)


def _fallback_queries(query: str) -> list[str]:
    """'dominos pepperoni pizza' -> that, then 'pepperoni pizza', then 'pizza'.

    Brand and restaurant names often find no photos at all, while the last words
    usually name the dish.
    """
    words = query.split()
    candidates = [query, " ".join(words[-2:]), words[-1] if words else ""]
    seen: list[str] = []
    for candidate in candidates:
        if candidate and candidate not in seen:
            seen.append(candidate)
    return seen


def _search(query: str) -> dict:
    search = _search_unsplash if _provider() == "unsplash" else _search_pexels
    for candidate in _fallback_queries(query):
        found = search(candidate)
        if found:
            return found
    return {}


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
        "photographer_url": (((photo.get("user") or {}).get("links") or {}).get("html") or ""),
        "download_location": (photo.get("links") or {}).get("download_location") or "",
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
        "photographer_url": photo.get("photographer_url") or "",
    }


def _cached(queries: set[str]) -> dict[str, FoodImage]:
    return {img.query: img for img in FoodImage.objects.filter(query__in=queries)}


def _is_paused() -> bool:
    return bool(cache.get(PAUSE_CACHE_KEY))


def _safe_search(query: str) -> dict | None:
    """The photo for a query, {} when the service has none, None when the lookup failed."""
    if _is_paused():
        return None
    try:
        return _search(query)
    except (requests.RequestException, ValueError) as exc:
        # Network or quota problems are not cached as misses; the food is tried again later.
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code in (401, 403, 429):
            # Unsplash answers 403 "Rate Limit Exceeded"; 401 means a bad key.
            cache.set(PAUSE_CACHE_KEY, True, int(PAUSE_AFTER_LIMIT.total_seconds()))
            logger.warning(
                "%s photo lookups paused for an hour (HTTP %s): %s", _provider().title(), status_code, exc
            )
        else:
            logger.warning("%s photo lookup failed for %r: %s", _provider().title(), query, exc)
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
    if fetch and _provider() and not _is_paused():
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
            # Each newly chosen Unsplash photo is reported once, when it's first stored.
            downloads = [found["download_location"] for found in results if found and found.get("download_location")]
            if downloads and settings.UNSPLASH_ACCESS_KEY:
                with ThreadPoolExecutor(max_workers=4) as pool:
                    list(pool.map(_track_download, downloads))
            cached = _cached(queries)
    return {name: cached[q] for name, q in by_name.items() if q in cached and cached[q].image_url}
