"""
Market Overview API Endpoint
------------------------------
Provides live market summary data for the unauthenticated landing page
shown when no portfolio has been uploaded yet.

Routes:
  GET /market/overview  — NIFTY 50 / SENSEX, sector indices, top gainers/losers

No portfolio or data-mode parameter required — this endpoint is intentionally
public and mode-agnostic, always fetching from yfinance.

Failure isolation:
  - Each main index is fetched independently via yf.Ticker().history().
    One failed index does not prevent others from rendering.
  - Sector indices follow the same pattern.
  - Gainers/losers fall back to an empty list on any error.
  - All errors are logged with the specific reason; unavailable entries carry
    a human-readable `reason` field for frontend debug display.
"""

import asyncio
import logging
import time
import concurrent.futures

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["Market"])

# ─── Index definitions ────────────────────────────────────────────────────────

_MAIN_INDICES = [
    ("^NSEI",    "NIFTY 50"),
    ("^BSESN",   "SENSEX"),
    ("^NSEBANK", "BANK NIFTY"),
]

_SECTOR_INDICES = [
    ("^CNXIT",     "Nifty IT"),
    ("^CNXPHARMA", "Nifty Pharma"),
    ("^CNXFMCG",   "Nifty FMCG"),
    ("^CNXAUTO",   "Nifty Auto"),
    ("^CNXMETAL",  "Nifty Metal"),
    ("^CNXINFRA",  "Nifty Infra"),
    ("^CNXREALTY", "Nifty Realty"),
    ("^CNXENERGY", "Nifty Energy"),
]

# Large-cap NSE tickers to scan for gainers/losers
_NIFTY50_TICKERS = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "ITC.NS", "SBIN.NS", "BAJFINANCE.NS", "BHARTIARTL.NS",
    "KOTAKBANK.NS", "AXISBANK.NS", "LT.NS", "ASIANPAINT.NS", "HCLTECH.NS",
    "MARUTI.NS", "SUNPHARMA.NS", "TITAN.NS", "WIPRO.NS", "ULTRACEMCO.NS",
    "ONGC.NS", "NTPC.NS", "POWERGRID.NS", "M&M.NS", "NESTLEIND.NS",
    "TECHM.NS", "ADANIENT.NS", "ADANIPORTS.NS", "COALINDIA.NS", "JSWSTEEL.NS",
]

# In-process cache: (result, timestamp)
_OVERVIEW_CACHE: dict[str, tuple[dict, float]] = {}
_CACHE_TTL = 120.0   # 2 minutes
_TICKER_TIMEOUT = 8  # seconds — per-ticker yfinance timeout guard


def _from_cache(key: str) -> dict | None:
    entry = _OVERVIEW_CACHE.get(key)
    if entry and (time.time() - entry[1]) < _CACHE_TTL:
        return entry[0]
    return None


def _to_cache(key: str, data: dict) -> None:
    _OVERVIEW_CACHE[key] = (data, time.time())


# ─── Per-index fetch helpers ──────────────────────────────────────────────────

def _fetch_single_index(sym: str, name: str) -> dict:
    """
    Fetch one index independently using yf.Ticker().history().
    Returns a complete entry dict — never raises.
    Shows previous close when the market is closed (no intraday bar yet).
    """
    try:
        import yfinance as yf

        def _do_fetch():
            return yf.Ticker(sym).history(period="5d", interval="1d", auto_adjust=True)

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(_do_fetch)
            hist = future.result(timeout=_TICKER_TIMEOUT)

        if hist is None or hist.empty:
            return {
                "symbol": sym, "name": name,
                "unavailable": True,
                "reason": "no_data_returned",
            }

        closes = hist["Close"].dropna().tolist()
        if not closes:
            return {
                "symbol": sym, "name": name,
                "unavailable": True,
                "reason": "empty_close_series",
            }

        current = float(closes[-1])
        prev    = float(closes[-2]) if len(closes) >= 2 else current
        change     = current - prev
        change_pct = (change / prev * 100) if prev else 0.0

        return {
            "symbol":     sym,
            "name":       name,
            "value":      round(current, 2),
            "change":     round(change, 2),
            "change_pct": round(change_pct, 2),
            "unavailable": False,
        }

    except concurrent.futures.TimeoutError:
        reason = f"timeout_{_TICKER_TIMEOUT}s"
        logger.warning("Index fetch timeout: %s (%s)", sym, reason)
        return {"symbol": sym, "name": name, "unavailable": True, "reason": reason}
    except ImportError:
        return {"symbol": sym, "name": name, "unavailable": True, "reason": "yfinance_not_installed"}
    except Exception as exc:
        reason = type(exc).__name__ + ": " + str(exc)[:120]
        logger.warning("Index fetch error: %s — %s", sym, reason)
        return {"symbol": sym, "name": name, "unavailable": True, "reason": reason}


def _fetch_gainers_losers() -> tuple[list[dict], list[dict]]:
    """
    Download a batch of NIFTY 50 tickers and derive top 5 gainers/losers.
    Returns (gainers, losers) — both empty lists on any failure.
    """
    try:
        import yfinance as yf

        def _do_batch():
            return yf.download(
                _NIFTY50_TICKERS, period="5d", interval="1d",
                progress=False, auto_adjust=True, threads=True,
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(_do_batch)
            raw = future.result(timeout=20)

        if raw is None or raw.empty:
            logger.info("Gainers/losers: empty result from yfinance")
            return [], []

        close = raw.get("Close") if not raw.empty else None
        if close is None:
            return [], []

        import pandas as pd
        ticker_changes: list[dict] = []
        for sym in _NIFTY50_TICKERS:
            try:
                if isinstance(close, pd.Series):
                    series = close.dropna().tolist()
                elif sym in close.columns:
                    series = close[sym].dropna().tolist()
                else:
                    continue

                if len(series) >= 2:
                    current = float(series[-1])
                    prev    = float(series[-2])
                    chg_pct = (current - prev) / prev * 100 if prev else 0.0
                    ticker_changes.append({
                        "ticker":     sym.replace(".NS", ""),
                        "symbol":     sym,
                        "price":      round(current, 2),
                        "change_pct": round(chg_pct, 2),
                    })
            except Exception:
                continue  # skip bad tickers silently

        ticker_changes.sort(key=lambda x: x["change_pct"], reverse=True)
        gainers = ticker_changes[:5]
        losers  = list(reversed(ticker_changes[-5:])) if len(ticker_changes) >= 5 else []
        return gainers, losers

    except Exception as exc:
        logger.warning("Gainers/losers batch failed: %s", exc)
        return [], []


# ─── Main fetch orchestrator ──────────────────────────────────────────────────

def _fetch_overview() -> dict:
    """
    Orchestrate all market data fetches.
    Each index is fetched independently so one failure doesn't cascade.
    Runs synchronously (called via asyncio.to_thread from the route handler).
    """
    try:
        import yfinance  # noqa: F401 — quick import-availability check
    except ImportError:
        return {
            "available": False,
            "reason": "yfinance_not_installed",
            "main_indices": [],
            "sector_indices": [],
            "top_gainers": [],
            "top_losers": [],
            "source": "unavailable",
        }

    # ── Main indices — each fetched independently ─────────────────────────────
    main_out: list[dict] = []
    for sym, name in _MAIN_INDICES:
        entry = _fetch_single_index(sym, name)
        main_out.append(entry)
        if entry.get("unavailable"):
            logger.info("Main index unavailable: %s — %s", sym, entry.get("reason"))

    # ── Sector indices — each fetched independently ───────────────────────────
    sect_out: list[dict] = []
    for sym, name in _SECTOR_INDICES:
        entry = _fetch_single_index(sym, name)
        sect_out.append(entry)
        if entry.get("unavailable"):
            logger.info("Sector index unavailable: %s — %s", sym, entry.get("reason"))

    # ── Gainers / Losers — one batch, fails gracefully ───────────────────────
    gainers, losers = _fetch_gainers_losers()

    # Determine overall availability: at least one main index must be live
    any_live = any(not e.get("unavailable", True) for e in main_out)

    return {
        "available":      any_live,
        "main_indices":   main_out,
        "sector_indices": sect_out,
        "top_gainers":    gainers,
        "top_losers":     losers,
        "source":         "yfinance",
    }


# ─── GET /market/overview ─────────────────────────────────────────────────────

@router.get("/overview", summary="Live market overview — indices, gainers, losers")
async def get_market_overview() -> dict:
    """
    Returns a market overview suitable for the landing page shown when no portfolio
    has been uploaded.

    Includes:
    - Main indices: NIFTY 50, SENSEX, BANK NIFTY (price + day change)
    - Sector indices: IT, Pharma, FMCG, Auto, Metal, Infra, Realty, Energy
    - Top 5 gainers and top 5 losers from the NIFTY 50 universe

    Failure isolation:
    - Each main and sector index is fetched independently via yf.Ticker().history().
      One failed or slow ticker does not prevent others from rendering.
    - Unavailable entries include a `reason` field for debug display.
    - When market is closed, the previous close is shown (yfinance returns last
      available daily bar automatically).

    Results are cached for 2 minutes to avoid hammering yfinance on page refreshes.
    When yfinance is unavailable entirely, available=false is returned.
    """
    cached = _from_cache("overview")
    if cached:
        return cached

    # Run blocking yfinance calls in a thread pool so the async event loop is not blocked.
    result = await asyncio.to_thread(_fetch_overview)
    _to_cache("overview", result)
    return result
