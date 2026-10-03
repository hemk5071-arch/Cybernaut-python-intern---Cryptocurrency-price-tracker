"""CoinMarketCap API client with resilient caching."""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any
from urllib.request import Request, urlopen

from db import get_latest_snapshot, save_coins

LOGGER = logging.getLogger(__name__)
_cache: dict[str, Any] = {"coins": [], "fetched_at": 0.0, "error": None}
_cache_lock = threading.Lock()


def fetch_coins_cached(cache_seconds: int = 60) -> dict[str, Any]:
    now = time.time()
    with _cache_lock:
        if _cache["coins"] and now - _cache["fetched_at"] < cache_seconds:
            return {"coins": _cache["coins"], "source": "live", "stale": False, "error": None}
    try:
        api_key = os.environ.get("CMC_API_KEY")
        if not api_key:
            raise RuntimeError("CMC_API_KEY is not set")
        request = Request(
            "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest"
            "?start=1&limit=10&convert=USD",
            headers={"X-CMC_PRO_API_KEY": api_key, "Accept": "application/json"},
        )
        with urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
        coins = [
            {
                "name": item["name"],
                "symbol": item["symbol"],
                "price_usd": item["quote"]["USD"]["price"],
                "change_24h_pct": item["quote"]["USD"].get("percent_change_24h"),
                "market_cap_usd": f"${item['quote']['USD']['market_cap']:,.0f}",
            }
            for item in payload.get("data", [])
            if item.get("name") and item.get("quote", {}).get("USD", {}).get("price") is not None
        ]
        if not coins:
            raise RuntimeError("CoinMarketCap returned no usable market data")
        save_coins(coins)
        with _cache_lock:
            _cache.update({"coins": coins, "fetched_at": time.time(), "error": None})
        return {"coins": coins, "source": "live", "stale": False, "error": None}
    except Exception as exc:
        LOGGER.exception("Cryptocurrency scrape failed")
        with _cache_lock:
            cached = list(_cache["coins"])
        fallback = cached or get_latest_snapshot()
        return {"coins": fallback, "source": "cached", "stale": True, "error": str(exc)}
