"""
Small helper module that talks to the MercadoLibre public API.

We use the public search endpoint to estimate:
  - total_results  -> total listings for the query
  - avg_price      -> average price for a sampled page of results
  - total_sold     -> sum of sold_quantity for sampled items (proxy signal)
  - sentimentScore -> simple ratio based on sales density

This is not true search volume, but it is real marketplace data.
"""

from __future__ import annotations

from typing import Dict, Any, Optional, Tuple
import logging
import os

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

MERCADOLIBRE_API_BASE_URL = "https://api.mercadolibre.com"
MERCADOLIBRE_AUTH_URL = "https://auth.mercadolibre.com/authorization"
MERCADOLIBRE_TOKEN_URL = f"{MERCADOLIBRE_API_BASE_URL}/oauth/token"

COUNTRY_TO_SITE_ID = {
    "AR": "MLA",
    "BR": "MLB",
    "CL": "MLC",
    "CO": "MCO",
    "MX": "MLM",
    "PE": "MPE",
    "UY": "MLU",
    "EC": "MEC",
    "VE": "MLV",
    "BO": "MBO",
    "PY": "MPY",
    "CR": "MCR",
    "DO": "MRD",
    "PA": "MPA",
    "HN": "MHN",
    "NI": "MNI",
    "SV": "MSV",
    "GT": "MGT",
}


class MercadoLibreApiError(Exception):
    """Custom error so we know it's something from MercadoLibre."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        body: str | None = None,
        site_id: str | None = None,
        url: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.body = body
        self.site_id = site_id
        self.url = url


def _resolve_site_id(country_code: Optional[str]) -> str:
    configured = (
        getattr(settings, "MERCADOLIBRE_SITE_ID", "")
        or os.environ.get("MERCADOLIBRE_SITE_ID", "")
    )
    if configured:
        return configured.strip().upper()

    country_clean = (country_code or "").strip().upper()
    return COUNTRY_TO_SITE_ID.get(country_clean, "MLA")


def _get_access_token(override: Optional[str] = None) -> str:
    if override:
        return override.strip()
    token = (
        getattr(settings, "MERCADOLIBRE_ACCESS_TOKEN", "")
        or os.environ.get("MERCADOLIBRE_ACCESS_TOKEN", "")
    )
    return token.strip()


def _get_oauth_config() -> Dict[str, str]:
    client_id = (
        getattr(settings, "MERCADOLIBRE_CLIENT_ID", "")
        or os.environ.get("MERCADOLIBRE_CLIENT_ID", "")
    ).strip()
    client_secret = (
        getattr(settings, "MERCADOLIBRE_CLIENT_SECRET", "")
        or os.environ.get("MERCADOLIBRE_CLIENT_SECRET", "")
    ).strip()
    redirect_uri = (
        getattr(settings, "MERCADOLIBRE_REDIRECT_URI", "")
        or os.environ.get("MERCADOLIBRE_REDIRECT_URI", "")
    ).strip()
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
    }


def build_mercadolibre_authorize_url(state: str) -> str:
    config = _get_oauth_config()
    if not config["client_id"] or not config["redirect_uri"]:
        raise MercadoLibreApiError("Missing MercadoLibre OAuth configuration")
    params = {
        "response_type": "code",
        "client_id": config["client_id"],
        "redirect_uri": config["redirect_uri"],
        "state": state,
    }
    return requests.Request("GET", MERCADOLIBRE_AUTH_URL, params=params).prepare().url  # type: ignore[return-value]


def exchange_mercadolibre_code(code: str) -> Dict[str, Any]:
    config = _get_oauth_config()
    if not config["client_id"] or not config["client_secret"] or not config["redirect_uri"]:
        raise MercadoLibreApiError("Missing MercadoLibre OAuth configuration")
    data = {
        "grant_type": "authorization_code",
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "code": code,
        "redirect_uri": config["redirect_uri"],
    }
    response = requests.post(MERCADOLIBRE_TOKEN_URL, data=data, timeout=12)
    if response.status_code != 200:
        raise MercadoLibreApiError(
            f"MercadoLibre token exchange failed with status {response.status_code}",
            status=response.status_code,
            body=(response.text or "")[:400],
            url=str(response.url),
        )
    return response.json()


def refresh_mercadolibre_token(refresh_token: str) -> Dict[str, Any]:
    config = _get_oauth_config()
    if not config["client_id"] or not config["client_secret"]:
        raise MercadoLibreApiError("Missing MercadoLibre OAuth configuration")
    data = {
        "grant_type": "refresh_token",
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "refresh_token": refresh_token,
    }
    response = requests.post(MERCADOLIBRE_TOKEN_URL, data=data, timeout=12)
    if response.status_code != 200:
        raise MercadoLibreApiError(
            f"MercadoLibre token refresh failed with status {response.status_code}",
            status=response.status_code,
            body=(response.text or "")[:400],
            url=str(response.url),
        )
    return response.json()


def _mercadolibre_search(
    keyword: str,
    *,
    site_id: str,
    limit: int = 50,
    offset: int = 0,
    access_token: Optional[str] = None,
) -> Tuple[Dict[str, Any], str]:
    url = f"{MERCADOLIBRE_API_BASE_URL}/sites/{site_id}/search"
    params = {
        "q": keyword,
        "limit": limit,
        "offset": offset,
    }
    headers = {
        "Accept": "application/json",
        "User-Agent": "InsightPilot/1.0 (+https://insightpilot.local)",
        "Accept-Language": "es-AR,es;q=0.9",
    }
    access_token = _get_access_token(access_token)
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
        params["access_token"] = access_token

    response = requests.get(url, params=params, headers=headers, timeout=12)
    if response.status_code != 200 and site_id != "MLA":
        logger.warning(
            "MercadoLibre search failed for site, retrying with MLA",
            extra={"site_id": site_id, "status": response.status_code},
        )
        site_id = "MLA"
        url = f"{MERCADOLIBRE_API_BASE_URL}/sites/{site_id}/search"
        response = requests.get(url, params=params, headers=headers, timeout=12)

    if response.status_code != 200:
        logger.error(
            "MercadoLibre search failed",
            extra={
                "site_id": site_id,
                "status": response.status_code,
                "body": response.text,
            },
        )
        raise MercadoLibreApiError(
            f"MercadoLibre search failed with status {response.status_code}",
            status=response.status_code,
            body=(response.text or "")[:400],
            site_id=site_id,
            url=str(response.url),
        )

    return response.json(), site_id


def _zero_mercadolibre_metrics() -> Dict[str, Any]:
    return {
        "total_results": 0.0,
        "sampled_count": 0.0,
        "avg_price": 0.0,
        "total_sold": 0.0,
        "sentiment_score": 0.0,
    }


def fetch_mercadolibre_metrics(
    *,
    keyword: str,
    country_code: Optional[str] = None,
    limit: int = 50,
    access_token: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch marketplace metrics for a keyword.

    Uses the public search endpoint, no auth required.
    """
    try:
        site_id = _resolve_site_id(country_code)
        payload, site_id = _mercadolibre_search(
            keyword,
            site_id=site_id,
            limit=limit,
            offset=0,
            access_token=access_token,
        )
        paging = payload.get("paging", {})
        results = payload.get("results", []) or []

        total_results = int(paging.get("total", 0) or 0)
        sampled_count = len(results)

        total_price = 0.0
        total_sold = 0
        price_count = 0

        for item in results:
            price = item.get("price")
            if isinstance(price, (int, float)):
                total_price += float(price)
                price_count += 1
            sold_quantity = item.get("sold_quantity")
            if isinstance(sold_quantity, int):
                total_sold += sold_quantity

        avg_price = (total_price / float(price_count)) if price_count else 0.0

        if total_results > 0:
            sentiment_score = min(float(total_sold) / float(total_results), 1.0)
        else:
            sentiment_score = 0.0

        return {
            "total_results": float(total_results),
            "sampled_count": float(sampled_count),
            "avg_price": float(avg_price),
            "total_sold": float(total_sold),
            "sentiment_score": float(sentiment_score),
            "debug_site_id": site_id,
            "debug_keyword": keyword,
            "debug_has_token": bool(access_token),
        }
    except MercadoLibreApiError as exc:
        logger.exception("MercadoLibreApiError in fetch_mercadolibre_metrics")
        base = _zero_mercadolibre_metrics()
        base.update(
            {
                "debug_site_id": exc.site_id or "",
                "debug_keyword": keyword,
                "debug_status": float(exc.status or 0),
                "debug_error": str(exc),
                "debug_body": exc.body or "",
                "debug_url": exc.url or "",
                "debug_has_token": bool(access_token),
            }
        )
        return base
    except Exception:
        logger.exception("Unexpected error while fetching MercadoLibre metrics")
        return _zero_mercadolibre_metrics()
