"""
File Upload Data Provider
---------------------------
Serves portfolio data from an uploaded Excel or CSV file.
After upload, the parsed holdings are cached in-memory for the session.

Fundamentals & Peers:
  - Proxied to yfinance (via live_provider helpers) so that uploaded portfolios
    get real fundamentals data without requiring the user to switch to live mode.
  - Bare tickers (e.g. "TCS" from Zerodha CSVs) are resolved to ".NS"/".BO"
    automatically by live_provider._resolve_ticker_variants().
  - Price history is also proxied to yfinance when available.
  - All proxy calls return an explicit unavailable state (never raise) if yfinance
    is not installed or the network is unavailable.
"""

import logging
from pathlib import Path
from typing import Optional
import pandas as pd

from app.data_providers.base import BaseDataProvider
from app.schemas.portfolio import HoldingBase

logger = logging.getLogger(__name__)

UPLOADS_PATH = Path(__file__).parent.parent.parent / "uploads"

# In-memory cache for the session — replace with DB-backed storage in Phase 2
_uploaded_holdings: list[HoldingBase] = []


class FileDataProvider(BaseDataProvider):

    @property
    def mode_name(self) -> str:
        return "uploaded"

    @property
    def is_available(self) -> bool:
        return True  # Always available; returns empty if nothing uploaded yet

    async def get_holdings(self) -> list[HoldingBase]:
        return _uploaded_holdings

    @classmethod
    def load_from_file(cls, filepath: str) -> list[HoldingBase]:
        """
        Parse a CSV or Excel file and populate the in-memory cache.
        Call this from the upload endpoint after saving the file.

        Required columns: ticker, name, quantity, average_cost
        Optional columns: current_price, sector, asset_class, currency
        """
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"Uploaded file not found: {filepath}")

        if path.suffix.lower() == ".csv":
            df = pd.read_csv(filepath)
        elif path.suffix.lower() in {".xlsx", ".xls"}:
            df = pd.read_excel(filepath)
        else:
            raise ValueError(f"Unsupported file type: {path.suffix}")

        # Normalise column names
        df.columns = df.columns.str.lower().str.strip().str.replace(" ", "_")

        required = {"ticker", "name", "quantity", "average_cost"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(
                f"Missing required columns: {missing}. "
                f"File has: {list(df.columns)}"
            )

        global _uploaded_holdings
        _uploaded_holdings = []

        for _, row in df.iterrows():
            _uploaded_holdings.append(
                HoldingBase(
                    ticker=str(row["ticker"]).strip().upper(),
                    name=str(row["name"]).strip(),
                    quantity=float(row["quantity"]),
                    average_cost=float(row["average_cost"]),
                    current_price=float(row.get("current_price", row["average_cost"])),
                    sector=str(row.get("sector", "Unknown")).strip()
                    if "sector" in row
                    else None,
                )
            )

        return _uploaded_holdings

    async def get_price_history(
        self, ticker: str, period: str = "1y", interval: str = "1d"
    ) -> dict:
        """
        Proxy to yfinance when available, trying exchange-suffix variants for
        bare Indian equity tickers.  Returns an explicit unavailable response
        (never raises) if yfinance is not installed or the fetch fails.
        """
        try:
            from app.data_providers.live_provider import (
                YFINANCE_AVAILABLE,
                _resolve_ticker_variants,
            )
            if not YFINANCE_AVAILABLE:
                raise ImportError("yfinance not installed")

            import yfinance as yf

            for variant in _resolve_ticker_variants(ticker):
                try:
                    data = yf.Ticker(variant).history(
                        period=period, interval=interval, auto_adjust=True
                    )
                    if data.empty:
                        continue
                    records = [
                        {
                            "date":   str(dt.date()),
                            "open":   round(float(row["Open"]),  2),
                            "high":   round(float(row["High"]),  2),
                            "low":    round(float(row["Low"]),   2),
                            "close":  round(float(row["Close"]), 2),
                            "volume": int(row.get("Volume", 0)),
                        }
                        for dt, row in data.iterrows()
                    ]
                    return {
                        "ticker":   ticker,
                        "period":   period,
                        "interval": interval,
                        "data":     records,
                        "source":   "yfinance",
                    }
                except Exception as exc:
                    logger.debug("Price history attempt failed for %s: %s", variant, exc)
        except Exception as exc:
            logger.debug("Price history proxy failed for %s: %s", ticker, exc)

        return {
            "ticker":   ticker,
            "period":   period,
            "interval": interval,
            "data":     [],
            "source":   "unavailable",
            "note":     "Price history unavailable. Install yfinance or switch to Live mode.",
        }

    async def get_fundamentals(self, ticker: str) -> dict:
        """
        Proxy to yfinance when available so that uploaded portfolios display real
        fundamentals data.  Tries ".NS" / ".BO" variants for bare tickers.
        Returns explicit unavailable state (never raises) if yfinance fails.
        """
        try:
            from app.data_providers.live_provider import (
                YFINANCE_AVAILABLE,
                _fetch_fundamentals_single,
                _fund_from_cache,
                _store_fund,
                _resolve_ticker_variants,
            )

            if not YFINANCE_AVAILABLE:
                return {
                    "ticker": ticker,
                    "source": "unavailable",
                    "error":  "yfinance not installed — install it to see fundamentals",
                }

            # Check in-process cache first (shared with LiveAPIProvider)
            for variant in _resolve_ticker_variants(ticker):
                cached = _fund_from_cache(variant)
                if cached:
                    return {"ticker": ticker, **cached, "from_cache": True}

            # Fetch from yfinance (handles variant resolution internally)
            data = _fetch_fundamentals_single(ticker)
            if not data:
                return {
                    "ticker": ticker,
                    "source": "unavailable",
                    "error":  "yfinance returned no data for this ticker",
                }

            # Persist to shared cache
            resolved = data.get("resolved_ticker", ticker)
            _store_fund(resolved, data)
            if resolved != ticker:
                _store_fund(ticker, data)

            return {"ticker": ticker, **data}

        except Exception as exc:
            logger.warning("Fundamentals proxy failed for %s: %s", ticker, exc)
            return {
                "ticker": ticker,
                "source": "unavailable",
                "error":  str(exc),
            }

    async def get_news(self, tickers: list[str], event_type: Optional[str] = None) -> list[dict]:
        """
        Returns real news from NewsAPI when NEWS_API_KEY is configured.
        Returns empty list otherwise — never returns fake articles.
        """
        from app.core.config import settings
        if settings.NEWS_API_KEY:
            from app.data_providers.live_provider import _fetch_newsapi_articles
            return _fetch_newsapi_articles(tickers, event_type)
        return []

    async def get_peers(self, ticker: str) -> list[str]:
        """
        Returns peer list from the shared static peer map in live_provider.
        Resolves bare tickers (e.g. "TCS" → "TCS.NS") automatically.
        """
        try:
            from app.data_providers.live_provider import _PEER_MAP, _resolve_ticker_variants
            if ticker in _PEER_MAP:
                return _PEER_MAP[ticker]
            for variant in _resolve_ticker_variants(ticker):
                if variant in _PEER_MAP:
                    return _PEER_MAP[variant]
        except Exception as exc:
            logger.debug("Peer lookup failed for %s: %s", ticker, exc)
        return []


# ─── Boot-time restore helper ─────────────────────────────────────────────────

def _restore_from_db_holdings(db_holdings: list) -> None:
    """
    Populate the in-memory cache from ORM Holding objects loaded from the DB.
    Called by init_db on startup so the 'uploaded' data mode persists across restarts.
    """
    global _uploaded_holdings
    _uploaded_holdings = []
    for h in db_holdings:
        _uploaded_holdings.append(
            HoldingBase(
                ticker=h.ticker,
                name=h.name,
                quantity=h.quantity,
                average_cost=h.average_cost,
                current_price=h.current_price,
                sector=h.sector,
                asset_class=h.asset_class or "Equity",
                currency=h.currency or "INR",
                data_source="uploaded",
            )
        )
