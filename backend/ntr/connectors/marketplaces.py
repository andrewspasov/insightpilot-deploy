# backend/ntr/connectors/marketplaces.py

"""
This file holds 'connector' functions for marketplace-type platforms
(MercadoLibre).

Later, when you want more platforms with real data, you only change the
inside of these functions, and the rest of the app keeps working.
"""

from __future__ import annotations

from typing import Dict, Any
from datetime import datetime

from ..models import Track  # import your Track model so we receive a real Track instance
from .mercadolibre_client import fetch_mercadolibre_metrics


def fetch_mercadolibre_signals(track: Track) -> Dict[str, Any]:
    """
    Real connector for MercadoLibre via the public search API.
    """
    if track.keywords:
        keyword = " ".join(kw.strip() for kw in track.keywords if kw.strip())
    else:
        keyword = track.name.strip()
    metrics = fetch_mercadolibre_metrics(
        keyword=keyword,
        country_code=(track.country or None),
    )

    search_volume = metrics.get("total_results", 0.0)
    mention_count = metrics.get("sampled_count", 0.0)
    price_index = metrics.get("avg_price", 0.0)
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

    summary = (
        f"MercadoLibre search for '{track.name}' returned about "
        f"{int(search_volume)} listings with average price {price_index:.0f}."
    )

    return {
        "platform": "mercadolibre",
        "source": "mercadolibre_public_api",
        "metrics": {
            "search_volume": search_volume,
            "mention_count": mention_count,
            "price_index": price_index,
            "sentiment_score": sentiment_score,
            "searchVolume": search_volume,
            "productCount": search_volume,
            "avgPrice": price_index,
            "sentimentScore": sentiment_score,
            **debug_fields,
        },
        "summary": summary,
        "generated_at": datetime.utcnow(),
    }
    
