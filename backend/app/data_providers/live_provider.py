"""
Live API Data Provider — Phase 2
----------------------------------
Fetches live market data from Yahoo Finance via yfinance.

Design decisions:
  - Portfolio *positions* (ticker, quantity, cost basis) come from mock_data/portfolio.json.
    This is correct for a prototype: real live prices applied to a sample portfolio structure.
    When broker sync (Phase 3) lands, get_holdings() will source positions from the broker.
  - Live *prices* overwrite current_price and recalculate market_value / pnl / weight.
  - *Fundamentals* are fetched per-ticker via yf.Ticker().info (cached 4 hours).
  - A simple in-process TTL cache avoids hammering Yahoo Finance.

Limitations (documented for transparency):
  - yfinance is an unofficial Yahoo Finance wrapper — no SLA, subject to rate-limits.
  - NSE tickers use the `.NS` suffix; BSE tickers use `.BO`. Both are tried on miss.
  - yf.Ticker().info can be 1–3s per call; batch price fetch via yf.download is fast.
  - Fundamentals from Yahoo Finance may be stale by 24–48 hours.
  - News is NOT implemented here — requires a NewsAPI key (Phase 3).

To enable this provider:
  poetry add yfinance httpx      # from your backend terminal
  Set LIVE_API_ENABLED=true in .env (already default in config.py)
  Restart the backend.
"""

import json
import time
import logging
from pathlib import Path
from typing import Optional

from app.data_providers.base import BaseDataProvider
from app.data_providers.mock_provider import MockDataProvider
from app.schemas.portfolio import HoldingBase
from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Graceful import — provider degrades if yfinance is not installed ──────────

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False
    logger.warning(
        "yfinance is not installed. Live API mode will be unavailable. "
        "Run: poetry add yfinance httpx"
    )

# ─── In-process TTL cache ─────────────────────────────────────────────────────
# Format: { ticker: (data, fetched_at_unix_timestamp) }

_PRICE_CACHE:   dict[str, tuple[float, float]] = {}  # ticker → (price, ts)
_FUND_CACHE:    dict[str, tuple[dict,  float]] = {}  # ticker → (data,  ts)

PRICE_TTL   = 60.0       # 1 minute for prices
FUND_TTL    = 14_400.0   # 4 hours for fundamentals

MOCK_DATA_PATH = Path(__file__).parent.parent.parent / "mock_data"


def _price_from_cache(ticker: str) -> float | None:
    entry = _PRICE_CACHE.get(ticker)
    if entry and (time.time() - entry[1]) < PRICE_TTL:
        return entry[0]
    return None


def _fund_from_cache(ticker: str) -> dict | None:
    entry = _FUND_CACHE.get(ticker)
    if entry and (time.time() - entry[1]) < FUND_TTL:
        return entry[0]
    return None


def _store_price(ticker: str, price: float) -> None:
    _PRICE_CACHE[ticker] = (price, time.time())


def _store_fund(ticker: str, data: dict) -> None:
    _FUND_CACHE[ticker] = (data, time.time())


# ─── yfinance helpers ─────────────────────────────────────────────────────────

_SUFFIX_FALLBACKS: dict[str, list[str]] = {
    # If the primary suffix fails, try these in order
    ".NS": [".BO"],
    ".BO": [".NS"],
    "":    [".NS", ".BO"],
}


def _resolve_ticker(ticker: str) -> str:
    """Return the ticker as-is — suffix resolution happens at fetch time."""
    return ticker.upper()


def _fetch_live_prices_batch(tickers: list[str]) -> dict[str, float]:
    """
    Batch-fetch last close prices for multiple tickers via yf.download().
    Returns {ticker: price}. Missing tickers are omitted from the result.
    This is ~10× faster than calling yf.Ticker(t).fast_info for each ticker.
    """
    if not YFINANCE_AVAILABLE or not tickers:
        return {}

    result: dict[str, float] = {}
    try:
        # yf.download with group_by="ticker" returns a multi-level DataFrame
        raw = yf.download(
            tickers,
            period="2d",
            interval="1d",
            progress=False,
            auto_adjust=True,
            threads=True,
        )
        if raw.empty:
            return result

        if len(tickers) == 1:
            # Single ticker: flat DataFrame
            close_series = raw.get("Close")
            if close_series is not None and not close_series.empty:
                price = float(close_series.iloc[-1])
                if price and price > 0:
                    result[tickers[0]] = price
        else:
            # Multiple tickers: multi-level columns
            close_df = raw.get("Close")
            if close_df is not None:
                for ticker in tickers:
                    col = close_df.get(ticker)
                    if col is not None:
                        last = col.dropna()
                        if not last.empty:
                            price = float(last.iloc[-1])
                            if price > 0:
                                result[ticker] = price

    except Exception as e:
        logger.warning(f"Batch price fetch failed: {e}")

    return result


def _fetch_fundamentals_single(ticker: str) -> dict:
    """
    Fetch fundamentals for a single ticker via yf.Ticker().info.
    Slow (1–2s) but comprehensive. Results are cached for FUND_TTL.
    """
    if not YFINANCE_AVAILABLE:
        return {}
    try:
        info = yf.Ticker(ticker).info
        if not info or info.get("trailingPE") is None and info.get("marketCap") is None:
            # Yahoo returned an empty/invalid response — try .BO suffix swap
            alt = ticker.replace(".NS", ".BO") if ".NS" in ticker else ticker.replace(".BO", ".NS")
            if alt != ticker:
                info = yf.Ticker(alt).info

        def _safe(key: str, scale: float = 1.0) -> float | None:
            val = info.get(key)
            if val is None or val == 0:
                return None
            try:
                return round(float(val) * scale, 4)
            except (TypeError, ValueError):
                return None

        # Map Yahoo Finance keys to our schema
        return {
            "name":             info.get("longName") or info.get("shortName"),
            "sector":           info.get("sector"),
            "industry":         info.get("industry"),
            "pe_ratio":         _safe("trailingPE"),
            "forward_pe":       _safe("forwardPE"),
            "pb_ratio":         _safe("priceToBook"),
            "ev_ebitda":        _safe("enterpriseToEbitda"),
            "peg_ratio":        _safe("pegRatio"),
            "market_cap":       _safe("marketCap", scale=1e-7),   # crores
            "dividend_yield":   _safe("dividendYield", scale=100),  # %
            "roe":              _safe("returnOnEquity", scale=100),  # %
            "roa":              _safe("returnOnAssets", scale=100),  # %
            "revenue_growth":   _safe("revenueGrowth", scale=100),
            "earnings_growth":  _safe("earningsGrowth", scale=100),
            "operating_margin": _safe("operatingMargins", scale=100),
            "profit_margin":    _safe("profitMargins", scale=100),
            "debt_to_equity":   _safe("debtToEquity"),
            "source":           "yfinance",
        }
    except Exception as e:
        logger.warning(f"Fundamentals fetch failed for {ticker}: {e}")
        return {"source": "yfinance_error", "error": str(e)}


# ─── Provider implementation ──────────────────────────────────────────────────

class LiveAPIProvider(BaseDataProvider):
    """
    Live market data provider backed by Yahoo Finance (yfinance).
    Falls back gracefully to mock prices when a ticker is not found.
    """

    @property
    def mode_name(self) -> str:
        return "live"

    @property
    def is_available(self) -> bool:
        return settings.LIVE_API_ENABLED

    # ─── Holdings ─────────────────────────────────────────────────────────────

    async def get_holdings(self) -> list[HoldingBase]:
        """
        Returns portfolio positions from mock_data enriched with live prices.
        Position structure (quantity, average_cost) comes from mock_data.
        current_price is replaced with the live yfinance price where available.
        """
        # 1. Load base portfolio positions from mock
        mock = MockDataProvider()
        holdings = await mock.get_holdings()

        if not YFINANCE_AVAILABLE:
            logger.warning("yfinance not available — returning mock prices in live mode")
            return holdings

        # 2. Batch-fetch live prices for all tickers
        tickers = [h.ticker for h in holdings]
        live_prices = _fetch_live_prices_batch(tickers)

        # Cache individual results
        for ticker, price in live_prices.items():
            _store_price(ticker, price)

        # 3. Enrich holdings — only replace current_price with the live value.
        #    All derived fields (market_value, pnl, pnl_pct, weight) are computed
        #    client-side in usePortfolio.ts and do NOT belong on HoldingBase.
        final: list[HoldingBase] = []

        for h in holdings:
            cached = _price_from_cache(h.ticker)
            live_price = live_prices.get(h.ticker) or cached or h.current_price

            final.append(HoldingBase(
                ticker=h.ticker,
                name=h.name,
                quantity=h.quantity,
                average_cost=h.average_cost,
                current_price=round(live_price, 2) if live_price else h.current_price,
                sector=h.sector,
                asset_class=h.asset_class,
                currency=h.currency,
                data_source="live" if h.ticker in live_prices else "mock_fallback",
            ))

        return final

    # ─── Price history ────────────────────────────────────────────────────────

    async def get_price_history(
        self, ticker: str, period: str = "1y", interval: str = "1d"
    ) -> dict:
        if not YFINANCE_AVAILABLE:
            mock = MockDataProvider()
            result = await mock.get_price_history(ticker, period, interval)
            result["note"] = "yfinance not installed — showing mock price history"
            return result

        try:
            data = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=True)
            if data.empty:
                raise ValueError(f"No price history returned for {ticker}")

            records = []
            for dt, row in data.iterrows():
                records.append({
                    "date":   str(dt.date()),
                    "open":   round(float(row["Open"]),   2),
                    "high":   round(float(row["High"]),   2),
                    "low":    round(float(row["Low"]),    2),
                    "close":  round(float(row["Close"]),  2),
                    "volume": int(row.get("Volume", 0)),
                })

            return {
                "ticker":   ticker,
                "period":   period,
                "interval": interval,
                "data":     records,
                "source":   "yfinance",
            }

        except Exception as e:
            logger.warning(f"Price history fetch failed for {ticker}: {e}")
            mock = MockDataProvider()
            result = await mock.get_price_history(ticker, period, interval)
            result["note"] = f"Live price history unavailable ({e}) — showing mock data"
            result["source"] = "mock_fallback"
            return result

    # ─── Fundamentals ─────────────────────────────────────────────────────────

    async def get_fundamentals(self, ticker: str) -> dict:
        # Check cache first
        cached = _fund_from_cache(ticker)
        if cached:
            return {"ticker": ticker, **cached, "from_cache": True}

        if not YFINANCE_AVAILABLE:
            mock = MockDataProvider()
            result = await mock.get_fundamentals(ticker)
            result["note"] = "yfinance not installed — showing mock fundamentals"
            return result

        data = _fetch_fundamentals_single(ticker)

        if not data or data.get("source") == "yfinance_error":
            # Fall back to mock fundamentals
            mock = MockDataProvider()
            result = await mock.get_fundamentals(ticker)
            result["note"] = f"Live fundamentals unavailable — showing mock data"
            result["source"] = "mock_fallback"
            return result

        _store_fund(ticker, data)
        return {"ticker": ticker, **data}

    # ─── News ─────────────────────────────────────────────────────────────────

    async def get_news(
        self, tickers: list[str], event_type: Optional[str] = None
    ) -> list[dict]:
        """
        News via yfinance is limited and unstructured.
        Falls back to mock news with a source note.
        Phase 3: wire NewsAPI key here.
        """
        mock = MockDataProvider()
        articles = await mock.get_news(tickers, event_type)
        for a in articles:
            a["source_note"] = "mock_fallback"
        return articles

    async def get_events(
        self, tickers: list[str], event_type: Optional[str] = None
    ) -> list[dict]:
        mock = MockDataProvider()
        return await mock.get_events(tickers, event_type)

    # ─── Peers ────────────────────────────────────────────────────────────────

    async def get_peers(self, ticker: str) -> list[str]:
        """Uses same static peer map as mock — yfinance has no peer discovery API."""
        mock = MockDataProvider()
        return await mock.get_peers(ticker)

    # ─── Cache inspection (for /debug) ────────────────────────────────────────

    @staticmethod
    def cache_status() -> dict:
        now = time.time()
        return {
            "yfinance_available": YFINANCE_AVAILABLE,
            "price_cache_size":   len(_PRICE_CACHE),
            "fund_cache_size":    len(_FUND_CACHE),
            "price_ttl_seconds":  PRICE_TTL,
            "fund_ttl_seconds":   FUND_TTL,
            "cached_price_tickers": [
                {
                    "ticker":     t,
                    "price":      v[0],
                    "age_seconds": round(now - v[1], 1),
                    "fresh":      (now - v[1]) < PRICE_TTL,
                }
                for t, v in _PRICE_CACHE.items()
            ],
        }
