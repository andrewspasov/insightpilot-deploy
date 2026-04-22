# backend/ntr/engine.py

from typing import Any, Dict

from django.utils import timezone

from .models import Track, TrendSnapshot, NtrSettings
from .connectors.youtube_client import fetch_youtube_metrics_with_context
from .connectors.mercadolibre_client import (
    fetch_mercadolibre_metrics,
    refresh_mercadolibre_token,
)


def _normalize_platform_slug(platform: str | None) -> str:
    slug = (platform or "").strip().lower()
    if slug == "shopify":
        return "mercadolibre"
    if slug == "etsy":
        return "mercadolibre"
    return slug



def compute_next_run_at(track: Track):
    """
    Compute the next run time based on the track frequency.
    """
    now = timezone.now()
    if track.frequency == "daily":
        return now + timezone.timedelta(days=1)
    return now + timezone.timedelta(weeks=1)


def _build_metrics_for_track(track: Track, settings: NtrSettings | None = None) -> Dict[str, Any]:
    """
    Decide how to build metrics for a given track.

    For now:
    - If the track platform is 'youtube', use the YouTube-specific helper
      which calls the YouTube Data API.
    - For other platforms (mercadolibre), we fall back to the existing
      demo metrics generator so nothing breaks while those connectors are stubbed.

    Metrics are stored as a flexible JSON dict on TrendSnapshot.

    For YouTube we emit YouTube-native metric names like:
      - total_views, video_count, avg_views, engagement_rate, avg_views_per_day, ideal_score

    We also include legacy keys (camelCase + snake_case) so older UI code and
    existing snapshots remain compatible.
    """
    platform = _normalize_platform_slug(track.platform)
    if platform == "youtube":
        return _build_metrics_for_youtube(track, settings)

    if platform == "mercadolibre":
        return _build_metrics_for_mercadolibre(track, settings)

    # For other platforms we still use demo for now.
    return _build_demo_metrics(track)


def _build_demo_metrics(track: Track) -> Dict[str, Any]:
    """
    Temporary 'demo' metrics to keep the system working end-to-end.

    IMPORTANT:
    - This is NOT real YouTube data.
    - It just gives us numbers with the same shape as the real metrics.
    - Later, when you connect real APIs, you will remove or ignore this.

    Here we derive some fake but stable values based on the track name
    and keywords so they look different per track.
    """
    # Count characters in the track name as a quick fake signal
    name_len = len(track.name)

    # Count total keyword characters as another fake signal
    total_kw_chars = sum(len(kw) for kw in (track.keywords or []))

    # Very simple fake formulas just so numbers differ per track
    search_volume = 50 + (name_len % 50)            # between ~50 and 99
    product_count = 100 + (total_kw_chars % 500)    # between 100 and 599
    avg_price = 20 + (name_len % 30)                # between 20 and 49
    sentiment_score = 0.4 + ((total_kw_chars % 40) / 100.0)  # between 0.4 and 0.79

    return {
        "searchVolume": float(search_volume),
        "productCount": int(product_count),
        "avgPrice": float(avg_price),
        "sentimentScore": float(round(sentiment_score, 2)),
    }


def _build_metrics_for_youtube(track: Track, settings: NtrSettings | None) -> dict:
    """
    Build metrics for a YouTube-based track by calling our YouTube connector.

    For now, we:
      - Take the first keyword from track.keywords (or the track.name if keywords are empty)
      - Call fetch_youtube_metrics(query)
      - Return the metrics dict as-is (it includes YouTube-native keys plus compat keys)
    """
    query = (track.keywords[0] if track.keywords else track.name).strip()
    return fetch_youtube_metrics_with_context(
        keyword=query,
        region_code=(track.country or None),
        relevance_language=(track.language or None),
    )


def _build_metrics_for_mercadolibre(
    track: Track,
    settings: NtrSettings | None,
) -> Dict[str, Any]:
    """
    Build metrics for a MercadoLibre-based track by calling the public API.
    """
    if track.keywords:
        query = " ".join(kw.strip() for kw in track.keywords if kw.strip())
    else:
        query = track.name.strip()
    access_token = None
    if settings and settings.mercadolibre_access_token:
        access_token = settings.mercadolibre_access_token

    if (
        settings
        and settings.mercadolibre_refresh_token
        and settings.mercadolibre_token_expires_at
        and timezone.now() >= settings.mercadolibre_token_expires_at
    ):
        try:
            refreshed = refresh_mercadolibre_token(settings.mercadolibre_refresh_token)
            settings.mercadolibre_access_token = refreshed.get("access_token", "")
            settings.mercadolibre_refresh_token = refreshed.get("refresh_token", "") or settings.mercadolibre_refresh_token
            expires_in = refreshed.get("expires_in")
            if isinstance(expires_in, (int, float)) and expires_in > 0:
                settings.mercadolibre_token_expires_at = timezone.now() + timezone.timedelta(
                    seconds=int(expires_in)
                )
            settings.save(
                update_fields=[
                    "mercadolibre_access_token",
                    "mercadolibre_refresh_token",
                    "mercadolibre_token_expires_at",
                ]
            )
            access_token = settings.mercadolibre_access_token
        except Exception:
            # Keep using the old token if refresh fails; metrics call will expose debug info.
            pass

    metrics = fetch_mercadolibre_metrics(
        keyword=query,
        country_code=(track.country or None),
        access_token=access_token,
    )

    search_volume = metrics.get("total_results", 0.0)
    product_count = metrics.get("total_results", 0.0)
    avg_price = metrics.get("avg_price", 0.0)
    sentiment_score = metrics.get("sentiment_score", 0.0)
    debug_fields = {
        key: metrics.get(key)
        for key in [
            "debug_site_id",
            "debug_keyword",
            "debug_status",
            "debug_error",
            "debug_body",
            "debug_url",
        ]
        if metrics.get(key) is not None
    }

    return {
        "search_volume": search_volume,
        "mention_count": metrics.get("sampled_count", 0.0),
        "price_index": avg_price,
        "sentiment_score": sentiment_score,
        "searchVolume": search_volume,
        "productCount": product_count,
        "avgPrice": avg_price,
        "sentimentScore": sentiment_score,
        "total_results": metrics.get("total_results", 0.0),
        "sampled_count": metrics.get("sampled_count", 0.0),
        "total_sold": metrics.get("total_sold", 0.0),
        **debug_fields,
    }


def _build_snapshot_summary(track: Track, metrics: Dict[str, Any]) -> str:
    """
    Turn the raw metrics into a human-readable one-line summary.

    Example output:
    "For 'Puma Jackets XL' on YouTube: search volume up 18%, average price $59,
     320 products found, sentiment 0.74."

    Right now:
    - We don't know the "up 18%" vs last time (we would have to compare
      with the previous snapshot).
    - So we just say "search volume index {value}" to keep it honest.
    """
    platform_labels = {
        "youtube": "YouTube",
        "mercadolibre": "MercadoLibre",
    }
    platform_slug = _normalize_platform_slug(track.platform)
    platform_name = platform_labels.get(platform_slug, (platform_slug or "NTR").title())

    if platform_slug == "youtube":
        total_views = (
            metrics.get("total_views")
            or metrics.get("search_volume")
            or metrics.get("searchVolume")
            or 0
        )
        video_count = (
            metrics.get("video_count")
            or metrics.get("mention_count")
            or metrics.get("productCount")
            or 0
        )
        avg_views = (
            metrics.get("avg_views")
            or metrics.get("price_index")
            or metrics.get("avgPrice")
            or 0.0
        )
        engagement_rate = (
            metrics.get("engagement_rate")
            or metrics.get("sentiment_score")
            or metrics.get("sentimentScore")
            or 0.0
        )
        ideal_score = metrics.get("ideal_score")

        ideal_part = (
            f", ideal score {float(ideal_score):.0f}/100"
            if ideal_score is not None
            else ""
        )

        return (
            f"For '{track.name}' on {platform_name}: "
            f"total views {float(total_views):.0f}, "
            f"avg views/video {float(avg_views):.0f}, "
            f"{int(float(video_count))} videos sampled, "
            f"engagement {float(engagement_rate):.2%}"
            f"{ideal_part}."
        )

    search_volume = metrics.get("searchVolume", 0)
    product_count = metrics.get("productCount", 0)
    avg_price = metrics.get("avgPrice", 0.0)
    sentiment_score = metrics.get("sentimentScore", 0.0)

    return (
        f"For '{track.name}' on {platform_name}: "
        f"search volume index {search_volume}, "
        f"average price {avg_price:.0f}, "
        f"{product_count} products found, "
        f"sentiment {sentiment_score:.2f}."
    )


def run_ntr_engine_for_track(track: Track, settings: NtrSettings) -> TrendSnapshot:
    """
    Run a single Track once.

    Steps:
    1) Decide which metrics to build (YouTube vs demo) using _build_metrics_for_track.
    2) Build a human-readable summary string using _build_snapshot_summary.
    3) Create a TrendSnapshot row in the database.
    4) Update last_run_at and next_run_at on the Track itself.
    5) Return the snapshot so callers (views/commands) can use it.
    """
    # 1. Current time for this run
    now = timezone.now()

    # 2. Build the metrics dict for this track (YouTube-aware but safe)
    metrics = _build_metrics_for_track(track, settings)

    # 3. Build a human summary from those metrics
    summary = _build_snapshot_summary(track, metrics)

    # 4. Create a new TrendSnapshot row
    snapshot = TrendSnapshot.objects.create(
        track=track,
        run_at=now,
        platform=_normalize_platform_slug(track.platform),     # e.g. "youtube"
        source="ntr_engine",         # internal tag for where this came from
        metrics=metrics,             # JSON with our 4 numbers
        summary=summary,             # nice one-liner we just built
    )

    # 5. Update scheduling fields on the Track
    track.last_run_at = now
    track.next_run_at = compute_next_run_at(track)
    track.save(update_fields=["last_run_at", "next_run_at"])

    # 6. Return the snapshot so management commands or views can use it
    return snapshot
