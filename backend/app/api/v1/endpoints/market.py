"""
Market Overview API Endpoint
------------------------------
Provides live market summary data for the landing page.

Routes:
  GET /market/overview  — NIFTY 50 / SENSEX / BANK NIFTY, sector indices,
                          top gainers, top losers, headlines placeholder

Provider:
  yfinance exclusively. No other live market data source is configured.

Failure isolation:
  - Each main index is fetched independently via yf.Ticker(sym).history().
    One failed / slow ticker cannot block others.
  - All 11 indices (3 main + 8 sector) are fetched concurrently in a single
    ThreadPoolExecutor — total latency ≈ slowest single ticker, not the sum.
  - Gainers/losers: one batch yf.download() call, fails gracefully to [].
  - Each entry carries status ("live" | "last_close" | "unavailable"),
    last_updated (ISO-8601 UTC), data_date, and source so the frontend can
    show exactly what it is displaying and why.

Market hours:
  NSE / BSE: Monday–Friday, 09:15–15:30 IST (UTC+05:30).
  Holidays are NOT modelled — a holiday will be treated as "market open"
  by the hours check, but yfinance will return the previous close, which
  correctly sets status="last_close" because the bar date ≠ today.
"""

import asyncio
import concurrent.futures
import logging
import time
from datetime import datetime, timezone, timedelta, date as date_type, time as dt_time
from typing import Optional

from fastapi import APIRouter

from app.services.feature_registry import require_feature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["Market"])

# ─── Indian market timezone (UTC+05:30, no external library) ─────────────────

_IST = timezone(timedelta(hours=5, minutes=30))
_MARKET_OPEN_IST  = dt_time(9, 15)
_MARKET_CLOSE_IST = dt_time(15, 30)


def _ist_now() -> datetime:
    return datetime.now(_IST)


def _is_market_open() -> bool:
    """Return True if NSE is currently within its trading window (ignores holidays)."""
    now = _ist_now()
    if now.weekday() >= 5:          # Saturday=5, Sunday=6
        return False
    t = now.time()
    return _MARKET_OPEN_IST <= t <= _MARKET_CLOSE_IST


def _next_open_ist() -> str:
    """Human-readable IST string for when the market next opens."""
    now = _ist_now()
    # Advance to the next weekday
    delta = 1
    while True:
        candidate = now + timedelta(days=delta)
        if candidate.weekday() < 5:
            break
        delta += 1
    return candidate.strftime("%a %d %b, 09:15 IST")


# ─── Index definitions ────────────────────────────────────────────────────────

_MAIN_INDICES: list[tuple[str, str]] = [
    ("^NSEI",    "NIFTY 50"),
    ("^BSESN",   "SENSEX"),
    ("^NSEBANK", "BANK NIFTY"),
]

_SECTOR_INDICES: list[tuple[str, str]] = [
    ("^CNXIT",     "Nifty IT"),
    ("^CNXPHARMA", "Nifty Pharma"),
    ("^CNXFMCG",   "Nifty FMCG"),
    ("^CNXAUTO",   "Nifty Auto"),
    ("^CNXMETAL",  "Nifty Metal"),
    ("^CNXINFRA",  "Nifty Infra"),
    ("^CNXREALTY", "Nifty Realty"),
    ("^CNXENERGY", "Nifty Energy"),
]

# NIFTY 50 universe for gainers / losers
_NIFTY50_TICKERS: list[str] = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "ITC.NS", "SBIN.NS", "BAJFINANCE.NS", "BHARTIARTL.NS",
    "KOTAKBANK.NS", "AXISBANK.NS", "LT.NS", "ASIANPAINT.NS", "HCLTECH.NS",
    "MARUTI.NS", "SUNPHARMA.NS", "TITAN.NS", "WIPRO.NS", "ULTRACEMCO.NS",
    "ONGC.NS", "NTPC.NS", "POWERGRID.NS", "M&M.NS", "NESTLEIND.NS",
    "TECHM.NS", "ADANIENT.NS", "ADANIPORTS.NS", "COALINDIA.NS", "JSWSTEEL.NS",
]

# ─── Cache ────────────────────────────────────────────────────────────────────

_OVERVIEW_CACHE: dict[str, tuple[dict, float]] = {}
_CACHE_TTL      = 120.0   # 2 minutes
_TICKER_TIMEOUT =   8     # seconds per-index


def _from_cache(key: str) -> Optional[dict]:
    entry = _OVERVIEW_CACHE.get(key)
    if entry and (time.time() - entry[1]) < _CACHE_TTL:
        return entry[0]
    return None


def _to_cache(key: str, data: dict) -> None:
    _OVERVIEW_CACHE[key] = (data, time.time())


# ─── Status helpers ───────────────────────────────────────────────────────────

def _data_status(bar_date: Optional[date_type]) -> str:
    """
    Classify the data freshness.

    live       — the bar's date is today AND market is currently open.
    last_close — bar has a date but it's not from a live session right now.
    unavailable — no bar date at all.
    """
    if bar_date is None:
        return "unavailable"
    today_ist = _ist_now().date()
    if bar_date == today_ist and _is_market_open():
        return "live"
    return "last_close"


# ─── Per-index fetch ──────────────────────────────────────────────────────────

def _fetch_single_index(sym: str, name: str) -> dict:
    """
    Fetch one index independently.  Never raises — all errors produce an
    unavailable entry with a human-readable `reason`.

    Returns keys:
      symbol, name, status, last_updated, data_date, source,
      value, change, change_pct   (only when not unavailable)
      unavailable, reason         (only when status == "unavailable")
    """
    fetched_at = datetime.now(timezone.utc).isoformat()
    try:
        import yfinance as yf

        def _do():
            return yf.Ticker(sym).history(period="5d", interval="1d", auto_adjust=True)

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut  = ex.submit(_do)
            hist = fut.result(timeout=_TICKER_TIMEOUT)

        if hist is None or hist.empty:
            return {
                "symbol": sym, "name": name,
                "status": "unavailable", "unavailable": True,
                "reason": "no_data_returned",
                "last_updated": fetched_at, "source": "yfinance",
            }

        closes = hist["Close"].dropna()
        if closes.empty:
            return {
                "symbol": sym, "name": name,
                "status": "unavailable", "unavailable": True,
                "reason": "empty_close_series",
                "last_updated": fetched_at, "source": "yfinance",
            }

        # bar_date — the date of the last available session bar
        bar_date: Optional[date_type] = None
        try:
            bar_date = closes.index[-1].date()
        except Exception:
            pass

        vals = closes.tolist()
        current = float(vals[-1])
        prev    = float(vals[-2]) if len(vals) >= 2 else current
        change     = current - prev
        change_pct = (change / prev * 100) if prev else 0.0
        status     = _data_status(bar_date)

        return {
            "symbol":      sym,
            "name":        name,
            "status":      status,
            "unavailable": False,
            "value":       round(current, 2),
            "change":      round(change, 2),
            "change_pct":  round(change_pct, 2),
            "data_date":   bar_date.isoformat() if bar_date else None,
            "last_updated": fetched_at,
            "source":      "yfinance",
        }

    except concurrent.futures.TimeoutError:
        reason = f"timeout_{_TICKER_TIMEOUT}s"
        logger.warning("Market index timeout: %s (%s)", sym, reason)
        return {
            "symbol": sym, "name": name,
            "status": "unavailable", "unavailable": True,
            "reason": reason, "last_updated": fetched_at, "source": "yfinance",
        }
    except ImportError:
        return {
            "symbol": sym, "name": name,
            "status": "unavailable", "unavailable": True,
            "reason": "yfinance_not_installed",
            "last_updated": fetched_at, "source": "none",
        }
    except Exception as exc:
        reason = f"{type(exc).__name__}: {str(exc)[:120]}"
        logger.warning("Market index error: %s — %s", sym, reason)
        return {
            "symbol": sym, "name": name,
            "status": "unavailable", "unavailable": True,
            "reason": reason, "last_updated": fetched_at, "source": "yfinance",
        }


# ─── Gainers / Losers ─────────────────────────────────────────────────────────

def _fetch_gainers_losers() -> tuple[list[dict], list[dict]]:
    """
    Batch yf.download() for the NIFTY 50 universe.
    Returns (gainers, losers) — both [] on any failure.
    """
    try:
        import yfinance as yf
        import pandas as pd

        def _do():
            return yf.download(
                _NIFTY50_TICKERS, period="5d", interval="1d",
                progress=False, auto_adjust=True, threads=True,
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(_do)
            raw = fut.result(timeout=25)

        if raw is None or raw.empty:
            return [], []

        close = raw.get("Close")
        if close is None:
            return [], []

        changes: list[dict] = []
        for sym in _NIFTY50_TICKERS:
            try:
                if isinstance(close, pd.Series):
                    series = close.dropna().tolist()
                elif sym in close.columns:
                    series = close[sym].dropna().tolist()
                else:
                    continue
                if len(series) >= 2:
                    curr    = float(series[-1])
                    prev    = float(series[-2])
                    chg_pct = (curr - prev) / prev * 100 if prev else 0.0
                    changes.append({
                        "ticker":     sym.replace(".NS", ""),
                        "symbol":     sym,
                        "price":      round(curr, 2),
                        "change_pct": round(chg_pct, 2),
                    })
            except Exception:
                continue

        changes.sort(key=lambda x: x["change_pct"], reverse=True)
        gainers = changes[:5]
        losers  = list(reversed(changes[-5:])) if len(changes) >= 5 else []
        return gainers, losers

    except Exception as exc:
        logger.warning("Gainers/losers batch failed: %s", exc)
        return [], []


# ─── Main orchestrator ────────────────────────────────────────────────────────

def _fetch_overview() -> dict:
    """
    Fetch all market data and return the overview dict.
    All indices are fetched concurrently in a single ThreadPoolExecutor.
    Called via asyncio.to_thread() from the route handler.
    """
    now_utc = datetime.now(timezone.utc).isoformat()

    try:
        import yfinance  # noqa: F401
    except ImportError:
        return {
            "available":     False,
            "reason":        "yfinance_not_installed",
            "market_status": {"open": False, "reason": "yfinance_not_installed"},
            "main_indices":   [],
            "sector_indices": [],
            "top_gainers":    [],
            "top_losers":     [],
            "headlines":      {"available": False, "reason": "yfinance_not_installed"},
            "fetched_at":     now_utc,
            "source":         "none",
        }

    # Market-hours meta (computed, no I/O)
    market_open = _is_market_open()
    market_status = {
        "open":     market_open,
        "note":     "Live data" if market_open else "Market closed — showing last close",
        "next_open": _next_open_ist() if not market_open else None,
        "checked_at_ist": _ist_now().strftime("%H:%M IST"),
    }

    all_indices = _MAIN_INDICES + _SECTOR_INDICES

    # Concurrent fetch — one thread per index, all run in parallel
    # Max workers = len(all_indices) so they all start simultaneously.
    results: dict[str, dict] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(all_indices)) as pool:
        futures = {
            pool.submit(_fetch_single_index, sym, name): sym
            for sym, name in all_indices
        }
        for fut in concurrent.futures.as_completed(futures):
            sym = futures[fut]
            try:
                results[sym] = fut.result()
            except Exception as exc:
                name = next((n for s, n in all_indices if s == sym), sym)
                results[sym] = {
                    "symbol": sym, "name": name,
                    "status": "unavailable", "unavailable": True,
                    "reason": str(exc), "source": "yfinance",
                    "last_updated": now_utc,
                }

    main_out   = [results[sym] for sym, _ in _MAIN_INDICES]
    sector_out = [results[sym] for sym, _ in _SECTOR_INDICES]

    # Gainers / losers — separate batch call
    gainers, losers = _fetch_gainers_losers()

    # Headlines — no provider configured; return explicit placeholder
    headlines_payload = {
        "available": False,
        "reason":    "no_news_provider_configured",
        "note":      "Set NEWS_API_KEY in .env to enable market headlines.",
        "articles":  [],
    }

    any_live = any(not e.get("unavailable", True) for e in main_out)

    return {
        "available":      any_live,
        "market_status":  market_status,
        "main_indices":   main_out,
        "sector_indices": sector_out,
        "top_gainers":    gainers,
        "top_losers":     losers,
        "headlines":      headlines_payload,
        "fetched_at":     now_utc,
        "source":         "yfinance",
    }


# ─── Route ────────────────────────────────────────────────────────────────────

@router.get("/overview", summary="Live market overview — indices, gainers, losers, headlines")
async def get_market_overview() -> dict:
    """
    Returns a market overview for the landing page.

    Each index entry carries:
      status:       "live" | "last_close" | "unavailable"
      last_updated: ISO-8601 UTC timestamp of this fetch
      data_date:    date of the bar yfinance returned (YYYY-MM-DD)
      source:       "yfinance" | "none"
      reason:       (unavailable only) human-readable failure reason

    Market status:
      market_status.open: true if NSE is currently within trading hours
      market_status.next_open: when market next opens (if closed)

    Cached for 2 minutes. When yfinance is not installed, available=false.
    """
    require_feature("market_data")
    cached = _from_cache("overview")
    if cached:
        return cached

    result = await asyncio.to_thread(_fetch_overview)
    _to_cache("overview", result)
    return result
