"""
Small helper module that talks to the YouTube Data API.

Goal for NicheTrendRadar:
- Given a keyword (like "Puma jackets XL"),
  call YouTube's search API.
- Look at the top N videos.
- Compute some simple metrics from real data:
    - total_views       -> total views of those videos
    - video_count       -> how many videos matched
    - avg_views         -> average views per video
    - engagement_rate   -> (likes + comments) / (views + 1)
    - avg_views_per_day -> average views/day across the sample (rough velocity)
    - ideal_score       -> 0–100 heuristic "is this a good niche?" score

We also include legacy/compat keys (camelCase + snake_case) so existing
frontend code and stored snapshots keep working.
"""

from __future__ import annotations

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
import logging
import os

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Base URL for the YouTube Data API
YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3"


class YouTubeApiError(Exception):
    """Custom error so we know it's something from the YouTube client."""
    pass


def _get_api_key() -> str:
    """
    Read the API key from Django settings (which reads from env).

    If it's missing, we raise a clear error so you see the problem instantly.
    """
    api_key = getattr(settings, "YOUTUBE_API_KEY", "") or os.environ.get("YOUTUBE_API_KEY", "")
    if not api_key:
        # If this happens, check your .env and settings.py
        raise YouTubeApiError("YOUTUBE_API_KEY is not configured")
    return api_key


def _youtube_search(keyword: str, max_results: int = 10) -> List[Dict[str, Any]]:
    """
    Call the YouTube 'search' endpoint to find videos for a given keyword.

    We:
    - search for 'keyword'
    - only fetch items of type 'video'
    - only request the 'snippet' part (basic info)
    - limit to 'max_results' (default 10)

    Returns:
        A list of raw search result items from YouTube's JSON.
    """
    api_key = _get_api_key()

    params = {
        "part": "snippet",      # what data we want back
        "q": keyword,           # the search query (our track keyword)
        "type": "video",        # only videos
        "maxResults": max_results,
        "key": api_key,
    }

    url = f"{YOUTUBE_API_BASE_URL}/search"

    response = requests.get(url, params=params, timeout=10)
    if response.status_code != 200:
        # Log and raise a clean error
        logger.error(
            "YouTube search failed",
            extra={"status": response.status_code, "body": response.text},
        )
        raise YouTubeApiError(f"YouTube search failed with status {response.status_code}")

    data = response.json()
    # 'items' is a list of search results
    return data.get("items", [])


def _iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _youtube_search_with_filters(
    keyword: str,
    *,
    max_results: int = 10,
    region_code: Optional[str] = None,
    relevance_language: Optional[str] = None,
    published_after_days: int = 90,
) -> List[Dict[str, Any]]:
    api_key = _get_api_key()

    params: Dict[str, Any] = {
        "part": "snippet",
        "q": keyword,
        "type": "video",
        "maxResults": max_results,
        "key": api_key,
        "order": "viewCount",
    }

    region_code_clean = (region_code or "").strip().upper()
    if region_code_clean:
        params["regionCode"] = region_code_clean

    relevance_language_clean = (relevance_language or "").strip().lower()
    if relevance_language_clean:
        params["relevanceLanguage"] = relevance_language_clean

    if published_after_days and published_after_days > 0:
        published_after = datetime.now(timezone.utc) - timedelta(days=published_after_days)
        params["publishedAfter"] = _iso_utc(published_after)

    url = f"{YOUTUBE_API_BASE_URL}/search"

    response = requests.get(url, params=params, timeout=10)
    if response.status_code != 200:
        logger.error(
            "YouTube search failed",
            extra={"status": response.status_code, "body": response.text},
        )
        raise YouTubeApiError(f"YouTube search failed with status {response.status_code}")

    data = response.json()
    return data.get("items", [])


def _youtube_videos_stats(video_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Given a list of YouTube video IDs, call the 'videos' endpoint to get
    statistics like:
      - viewCount
      - likeCount

    Returns:
        A list of video JSON objects with statistics for each ID.
    """
    if not video_ids:
        return []

    api_key = _get_api_key()

    params = {
        # We need both statistics (views/likes/comments) and snippet (publishedAt)
        "part": "statistics,snippet",
        "id": ",".join(video_ids),      # comma-separated list of IDs
        "key": api_key,
    }

    url = f"{YOUTUBE_API_BASE_URL}/videos"

    response = requests.get(url, params=params, timeout=10)
    if response.status_code != 200:
        logger.error(
            "YouTube videos stats failed",
            extra={"status": response.status_code, "body": response.text},
        )
        raise YouTubeApiError(f"YouTube videos stats failed with status {response.status_code}")

    data = response.json()
    return data.get("items", [])


def _zero_youtube_metrics() -> Dict[str, float]:
    return {
        "total_views": 0.0,
        "video_count": 0.0,
        "avg_views": 0.0,
        "avg_views_per_day": 0.0,
        "engagement_rate": 0.0,
        "like_rate": 0.0,
        "comment_rate": 0.0,
        "unique_channels": 0.0,
    }


def fetch_youtube_metrics(keyword: str) -> Dict[str, float]:
    """
    Main function used by the NTR engine.

    Input:
        - keyword: the niche/keyword we want to analyze, e.g. "Puma jackets XL"

    Behavior:
        1) Search for videos matching the keyword.
        2) Collect their IDs.
        3) Fetch statistics for those videos (views, likes).
        4) Compute our 4 metrics FROM REAL DATA:
            - searchVolume   -> total views across these videos
            - productCount   -> how many videos we got back
            - avgPrice       -> average views per video (just reusing the name)
            - sentimentScore -> likes / (views + 1) for all videos combined

    Output:
        A dict like:
        {
            "searchVolume": 12345.0,
            "productCount": 10.0,
            "avgPrice": 1234.5,
            "sentimentScore": 0.45,
        }
    """
    return fetch_youtube_metrics_with_context(keyword=keyword)


def fetch_youtube_metrics_with_context(
    *,
    keyword: str,
    region_code: Optional[str] = None,
    relevance_language: Optional[str] = None,
    published_after_days: int = 90,
    max_results: int = 10,
) -> Dict[str, float]:
    """
    Same as fetch_youtube_metrics, but allows filtering the sample:
    - recent videos (publishedAfter)
    - per-country (regionCode)
    - per-language (relevanceLanguage)

    This usually produces more stable/meaningful metrics than sampling
    all-time popular results.
    """
    try:
        # 1) Search for top videos for this keyword
        search_items = _youtube_search_with_filters(
            keyword,
            max_results=max_results,
            region_code=region_code,
            relevance_language=relevance_language,
            published_after_days=published_after_days,
        )

        # Extract video IDs (from "id" object of each search result)
        video_ids: List[str] = []
        for item in search_items:
            # item["id"] looks like {"kind": "youtube#video", "videoId": "..."}
            video_id = (
                item.get("id", {}).get("videoId")
                or item.get("id", {}).get("playlistId")
                or None
            )
            if video_id:
                video_ids.append(video_id)

        # If we somehow got nothing back, return zeros so the engine still works
        if not video_ids:
            return _zero_youtube_metrics()

        # 2) Fetch statistics (and publishedAt) for those video IDs
        stats_items = _youtube_videos_stats(video_ids)

        total_views = 0
        total_likes = 0
        total_comments = 0
        video_count = 0
        views_per_day_sum = 0.0
        now = datetime.now(timezone.utc)
        channel_ids: List[str] = []

        # Loop through the stats for each video
        for item in stats_items:
            stats = item.get("statistics", {})
            snippet = item.get("snippet", {})
            # viewCount and likeCount come as strings, so we cast to int
            views = int(stats.get("viewCount", "0"))
            likes = int(stats.get("likeCount", "0"))
            comments = int(stats.get("commentCount", "0"))

            published_at_raw = snippet.get("publishedAt")
            age_days = 0.0
            if isinstance(published_at_raw, str) and published_at_raw:
                try:
                    published_at = datetime.fromisoformat(
                        published_at_raw.replace("Z", "+00:00")
                    )
                    age_seconds = (now - published_at).total_seconds()
                    age_days = max(age_seconds / 86400.0, 1.0)
                except Exception:
                    age_days = 0.0

            if age_days > 0:
                views_per_day = float(views) / age_days
                views_per_day_sum += views_per_day

            total_views += views
            total_likes += likes
            total_comments += comments
            video_count += 1
            channel_id = snippet.get("channelId")
            if isinstance(channel_id, str) and channel_id:
                channel_ids.append(channel_id)

        if video_count == 0:
            # Safety fallback (shouldn't really happen if we got IDs)
            return _zero_youtube_metrics()

        # Compute metrics from the aggregates
        total_views_f = float(total_views)
        avg_views = total_views_f / float(video_count)  # average views per video

        # Engagement (rough): (likes + comments) / views
        engagement_rate = float(total_likes + total_comments) / float(total_views + 1)
        like_rate = float(total_likes) / float(total_views + 1)
        comment_rate = float(total_comments) / float(total_views + 1)

        avg_views_per_day = (
            views_per_day_sum / float(video_count) if video_count > 0 else 0.0
        )

        unique_channels = float(len(set(channel_ids))) if channel_ids else 0.0

        # Primary YouTube metrics (preferred names)
        metrics: Dict[str, float] = {
            "total_views": total_views_f,
            "video_count": float(video_count),
            "avg_views": float(avg_views),
            "engagement_rate": float(engagement_rate),
            "like_rate": float(like_rate),
            "comment_rate": float(comment_rate),
            "avg_views_per_day": float(avg_views_per_day),
            "unique_channels": float(unique_channels),
        }

        return metrics

    except YouTubeApiError:
        # Known YouTube error (key missing, bad response, etc)
        # We log and return safe zeros so the rest of NTR does not crash.
        logger.exception("YouTubeApiError in fetch_youtube_metrics")
        return _zero_youtube_metrics()
    except Exception:
        # Any other unexpected error, we again log and fail gracefully.
        logger.exception("Unexpected error while fetching YouTube metrics")
        return _zero_youtube_metrics()
