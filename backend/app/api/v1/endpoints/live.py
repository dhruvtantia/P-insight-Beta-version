"""
Live Data API Endpoints — Phase 2
-----------------------------------
Dedicated routes for querying live market data directly from the yfinance provider.
These endpoints are separate from /portfolio/ to allow the UI to:
  - Fetch a live quote without loading the full portfolio
  - Enrich watchlist items with live prices
  - Inspect provider capabilities and cache health
  - Show a topbar market index strip (NIFTY 50 / SENSEX)

Routes:
  GET /live/quotes?tickers=TCS.NS,INFY.NS   → bulk live prices
  GET /live/fundamentals?ticker=TCS.NS       → full fundamentals for one ticker
  GET /live/status                           → yfinance availability + cache stats
  GET /live/indices                          → NIFTY 50 + SENSEX last price + change
"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.core.config import settings
from app.data_providers.live_provider import (
    LiveAPIProvider,
    YFINANCE_AVAILABLE,
    _fetch_live_prices_batch,
    _fetch_fundamentals_single,
    _fund_from_cache,
    _store_fund,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/live", tags=["Live Data"])


# ─── GET /live/quotes ─────────────────────────────────────────────────────────

@router.get("/quotes", summary="Batch live price quotes")
async def get_live_quotes(
    tickers: str = Query(
        ...,
        description="Comma-separated ticker symbols, e.g. TCS.NS,INFY.NS,RELIANCE.NS",
        example="TCS.NS,INFY.NS",
    ),
) -> dict:
    """
    Returns the most recent closing price for each requested ticker.

    - Prices are fetched via yfinance (Yahoo Finance) and cached for 60 seconds.
    - Tickers not found on Yahoo Finance will be absent from the result.
    - If yfinance is not installed the endpoint returns an empty prices dict
      with a note explaining why.

    Use this to enrich watchlist items or show a live price strip without
    reloading the entire portfolio.
    """
    if not settings.LIVE_API_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Live API mode is disabled. Set LIVE_API_ENABLED=true in .env to enable.",
        )

    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(status_code=400, detail="No valid tickers provided.")
    if len(ticker_list) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 tickers per request.")

    if not YFINANCE_AVAILABLE:
        return {
            "prices": {},
            "note": "yfinance is not installed. Run `poetry add yfinance httpx` to enable live quotes.",
            "yfinance_available": False,
        }

    prices = _fetch_live_prices_batch(ticker_list)

    return {
        "prices": prices,
        "requested": ticker_list,
        "found": list(prices.keys()),
        "missing": [t for t in ticker_list if t not in prices],
        "yfinance_available": True,
        "source": "yfinance",
    }


# ─── GET /live/fundamentals ───────────────────────────────────────────────────

@router.get("/fundamentals", summary="Live fundamentals for a single ticker")
async def get_live_fundamentals(
    ticker: str = Query(
        ...,
        description="Ticker symbol, e.g. TCS.NS",
        example="TCS.NS",
    ),
) -> dict:
    """
    Returns comprehensive fundamental data for a single ticker from Yahoo Finance.

    Includes: P/E, forward P/E, P/B, EV/EBITDA, PEG, market cap, dividend yield,
    ROE, ROA, operating margin, profit margin, revenue growth, earnings growth,
    debt/equity, sector, industry.

    Results are cached for 4 hours. The `from_cache` flag indicates whether this
    response was served from cache.

    If Yahoo Finance returns an empty or invalid response, a 404 is raised.
    No mock fallback is used — callers receive an explicit error rather than
    silently receiving fabricated data.
    """
    if not settings.LIVE_API_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Live API mode is disabled. Set LIVE_API_ENABLED=true in .env to enable.",
        )

    t = ticker.strip().upper()
    if not t:
        raise HTTPException(status_code=400, detail="Ticker must not be empty.")

    # Check 4-hour cache first
    cached = _fund_from_cache(t)
    if cached:
        return {"ticker": t, **cached, "from_cache": True}

    if not YFINANCE_AVAILABLE:
        return {
            "ticker": t,
            "note": "yfinance is not installed. Run `poetry add yfinance httpx` to enable live fundamentals.",
            "yfinance_available": False,
            "source": "unavailable",
        }

    data = _fetch_fundamentals_single(t)
    if data and data.get("source") != "yfinance_error":
        _store_fund(t, data)
        return {"ticker": t, **data, "from_cache": False}

    raise HTTPException(
        status_code=404,
        detail=f"Could not fetch fundamentals for '{t}'. "
               f"The ticker may not exist on Yahoo Finance or the request was rate-limited.",
    )


# ─── GET /live/indices ────────────────────────────────────────────────────────

# Canonical index definitions: symbol → display label
_INDICES: list[tuple[str, str]] = [
    ("^NSEI",  "NIFTY 50"),
    ("^BSESN", "SENSEX"),
]


def _fetch_indices_sync() -> dict:
    """
    Synchronous worker that downloads NIFTY 50 and SENSEX from yfinance.
    Called via asyncio.to_thread() so the event loop is never blocked.
    """
    import yfinance as yf
    import pandas as pd

    label_map = {sym: label for sym, label in _INDICES}

    def _series_for_sym(sym: str, close_df) -> list:
        if close_df is None:
            raise ValueError("no close data in batch")
        if isinstance(close_df, pd.Series):
            return list(close_df.dropna().values)
        if sym in close_df.columns:
            return list(close_df[sym].dropna().values)
        raise ValueError(f"{sym} not found in batch close_df columns")

    def _parse_entry(sym: str, series: list) -> dict:
        if not series:
            raise ValueError("empty price series")
        current    = float(series[-1])
        prev       = float(series[-2]) if len(series) >= 2 else current
        change     = current - prev
        change_pct = (change / prev * 100) if prev else 0.0
        return {
            "symbol": sym, "name": label_map[sym], "unavailable": False,
            "value":      round(current, 2),
            "change":     round(change, 2),
            "change_pct": round(change_pct, 2),
        }

    def _fetch_single(sym: str) -> dict:
        try:
            raw   = yf.download(sym, period="5d", interval="1d",
                                 progress=False, auto_adjust=True)
            if raw.empty:
                raise ValueError("empty result")
            close = raw.get("Close")
            if close is None:
                raise ValueError("no Close column")
            series = (list(close.dropna().values)
                      if isinstance(close, pd.Series)
                      else list(close.iloc[:, 0].dropna().values))
            return _parse_entry(sym, series)
        except Exception as exc:
            logger.warning("Individual index fetch failed for %s: %s", sym, exc)
            return {"symbol": sym, "name": label_map[sym], "unavailable": True,
                    "reason": f"fetch_error: {exc}"}

    symbols      = [sym for sym, _ in _INDICES]
    indices_out: list = []
    batch_ok     = False

    try:
        raw      = yf.download(symbols, period="5d", interval="1d",
                               progress=False, auto_adjust=True, threads=True)
        close_df = raw.get("Close") if not raw.empty else None

        for sym in symbols:
            try:
                series = _series_for_sym(sym, close_df)
                indices_out.append(_parse_entry(sym, series))
            except Exception as exc:
                logger.warning("Batch parse failed for %s (%s) — retrying", sym, exc)
                indices_out.append(None)

        batch_ok = True
    except Exception as exc:
        logger.warning("Index batch download failed (%s) — per-symbol fallback", exc)
        indices_out = [None] * len(symbols)

    for i, (sym, entry) in enumerate(zip(symbols, indices_out)):
        if entry is None:
            indices_out[i] = _fetch_single(sym)

    n_ok = sum(1 for e in indices_out if not e.get("unavailable"))
    logger.info("Index fetch complete: %d/%d available (batch=%s)", n_ok, len(symbols), batch_ok)
    return {
        "indices":          indices_out,
        "live_api_enabled": True,
        "yfinance_available": True,
        "source":           "yfinance",
        "batch_ok":         batch_ok,
        "available_count":  n_ok,
    }


@router.get("/indices", summary="Live NIFTY 50 and SENSEX prices with change")
async def get_live_indices() -> dict:
    """
    Returns the most recent closing price and absolute / percentage change for
    NIFTY 50 (^NSEI) and SENSEX (^BSESN) from Yahoo Finance.

    Change is computed as today's close minus the previous trading day's close.

    If yfinance is unavailable or the fetch fails, each index entry will have
    `unavailable: true` — the frontend must show a clear unavailable state rather
    than displaying zeros or substituting mock values.

    Strategy: attempt a batch download first; fall back to per-symbol individual
    downloads if the batch fails or returns incomplete data (handles yfinance
    MultiIndex shape changes and rate-limit edge cases).
    """
    if not settings.LIVE_API_ENABLED:
        return {
            "indices": [
                {"symbol": sym, "name": label, "unavailable": True,
                 "reason": "live_api_disabled"}
                for sym, label in _INDICES
            ],
            "live_api_enabled": False,
            "yfinance_available": YFINANCE_AVAILABLE,
            "source": "none",
        }

    if not YFINANCE_AVAILABLE:
        return {
            "indices": [
                {"symbol": sym, "name": label, "unavailable": True,
                 "reason": "yfinance_not_installed"}
                for sym, label in _INDICES
            ],
            "live_api_enabled": True,
            "yfinance_available": False,
            "source": "none",
        }

    # Run all yf.download() calls in a thread — they are blocking I/O and must
    # not run on the asyncio event loop.
    return await asyncio.to_thread(_fetch_indices_sync)


# ─── GET /live/status ─────────────────────────────────────────────────────────

@router.get("/status", summary="Live data provider status and cache health")
async def get_live_status() -> dict:
    """
    Returns:
    - Whether the live API feature flag is enabled
    - Whether yfinance is installed and available
    - Current in-process price and fundamentals cache sizes and entries
    - TTL configuration

    Use this endpoint in the /debug page to inspect provider health without
    triggering any new data fetches.
    """
    base = {
        "live_api_enabled": settings.LIVE_API_ENABLED,
        "yfinance_available": YFINANCE_AVAILABLE,
        "provider": "yfinance (Yahoo Finance)",
        "note": (
            "Install yfinance to enable live data: `poetry add yfinance httpx`"
            if not YFINANCE_AVAILABLE
            else None
        ),
    }

    if not settings.LIVE_API_ENABLED:
        return {**base, "cache": None}

    cache = LiveAPIProvider.cache_status()
    return {**base, "cache": cache}
