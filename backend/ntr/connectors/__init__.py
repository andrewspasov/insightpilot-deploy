# backend/ntr/connectors/__init__.py

"""
Public entry point for all NTR connectors.

The rest of the app should import ONLY from here, not directly from
marketplaces.py, so that you can reorganize internals later without
breaking other files.
"""

from __future__ import annotations

from typing import Dict, Any

from ..models import Track
from .marketplaces import (
    fetch_mercadolibre_signals,
)


# Map platform values from Track.platform -> connector function
CONNECTOR_MAP = {
    "mercadolibre": fetch_mercadolibre_signals,
}


def fetch_signals_for_track(track: Track) -> Dict[str, Any]:
    """
    Decide which connector to use based on the track.platform field.

    - If we know the platform, call the specific connector.
    - If not, fall back to a simple 'generic' connector so we never crash.
    """

    # Make sure platform is a simple, lowercase slug (e.g. 'youtube')
    platform = (track.platform or "").lower()
    if platform == "shopify":
        platform = "mercadolibre"
    if platform == "etsy":
        platform = "mercadolibre"

    # Try to find a connector in our dict
    connector = CONNECTOR_MAP.get(platform)

    if connector is None:
        # Fallback: use a generic connector
        # We import lazily here to avoid circular imports.
        from datetime import datetime

        # Very simple fake metrics
        return {
            "platform": platform or "unknown",
            "source": "generic_mock_connector",
            "metrics": {
                "search_volume": 500,
                "mention_count": 100,
                "price_index": 75,
                "sentiment_score": 0.5,
            },
            "summary": (
                f"Generic mock signals for '{track.name}'. "
                f"Configure a specific platform connector for better data."
            ),
            "generated_at": datetime.utcnow(),
        }

    # If we DO have a connector, call it and return its result
    return connector(track)
