"""
Live API Data Provider — Phase 3 (Hardened)
---------------------------------------------
Fetches live market data from Yahoo Finance via yfinance.

Holdings source:
  - Portfolio *positions* (ticker, quantity, cost, sector) come from the active
    portfolio in the database — NOT from mock_data/portfolio.json.
  - This means live mode works for any portfolio: uploaded, manual, or broker-synced.
  - Live *prices* overwrite current_price for each DB holding.
  - Holdings where yfinance returns no price get data_source="unavailable".

No silent mock fallback:
  - All methods return explicit unavailable / error states rather than delegating
    to MockDataProvider. If live data is unavailable, callers see it.

TTL caches:
  - Prices: 60 seconds (in-process dict)
  - Fundamentals: 4 hours (in-process dict)

To enable this provider:
  poetry add yfinance httpx      # from your backend terminal
  LIVE_API_ENABLED=true in .env (already default)
  Restart the backend.
"""

import time
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.data_providers.base import BaseDataProvider
from app.schemas.portfolio import HoldingBase
from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Graceful import — degrades if yfinance not installed ──────────────────────

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

_PRICE_CACHE: dict[str, tuple[float, float]] = {}   # ticker → (price, ts)
_FUND_CACHE:  dict[str, tuple[dict,  float]] = {}   # ticker → (data,  ts)

PRICE_TTL = 60.0        # 1 minute for prices
FUND_TTL  = 14_400.0    # 4 hours  for fundamentals


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

def _fetch_live_prices_batch(tickers: list[str]) -> dict[str, float]:
    """
    Batch-fetch last close prices for multiple tickers via yf.download().
    Returns {ticker: price}. Missing tickers are omitted from the result.
    This is ~10× faster than calling yf.Ticker(t).fast_info per ticker.
    """
    if not YFINANCE_AVAILABLE or not tickers:
        return {}

    result: dict[str, float] = {}
    try:
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
            close_series = raw.get("Close")
            if close_series is not None and not close_series.empty:
                price = float(close_series.iloc[-1])
                if price and price > 0:
                    result[tickers[0]] = price
        else:
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
    Returns {} on failure — caller handles this.
    """
    if not YFINANCE_AVAILABLE:
        return {}
    try:
        info = yf.Ticker(ticker).info
        if not info or (info.get("trailingPE") is None and info.get("marketCap") is None):
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

        return {
            "name":             info.get("longName") or info.get("shortName"),
            "sector":           info.get("sector"),
            "industry":         info.get("industry"),
            "pe_ratio":         _safe("trailingPE"),
            "forward_pe":       _safe("forwardPE"),
            "pb_ratio":         _safe("priceToBook"),
            "ev_ebitda":        _safe("enterpriseToEbitda"),
            "peg_ratio":        _safe("pegRatio"),
            "market_cap":       _safe("marketCap", scale=1e-7),     # crores
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
        return {}


# ─── Static peer map (no yfinance peer discovery API exists) ──────────────────

_PEER_MAP: dict[str, list[str]] = {
    "RELIANCE.NS":   ["ONGC.NS",      "BPCL.NS",     "IOC.NS"                   ],
    "TCS.NS":        ["INFY.NS",       "HCLTECH.NS",  "WIPRO.NS",  "TECHM.NS"    ],
    "HDFCBANK.NS":   ["ICICIBANK.NS",  "KOTAKBANK.NS","AXISBANK.NS"               ],
    "INFY.NS":       ["TCS.NS",        "HCLTECH.NS",  "WIPRO.NS",  "TECHM.NS"    ],
    "ICICIBANK.NS":  ["HDFCBANK.NS",   "KOTAKBANK.NS","AXISBANK.NS"               ],
    "HINDUNILVR.NS": ["NESTLEIND.NS",  "DABUR.NS",    "MARICO.NS"                ],
    "BHARTIARTL.NS": ["IDEA.NS",       "TATACOMM.NS"                             ],
    "WIPRO.NS":      ["TCS.NS",        "INFY.NS",     "HCLTECH.NS","TECHM.NS"    ],
    "MARUTI.NS":     ["TATAMOTORS.NS", "M&M.NS"                                  ],
    "SUNPHARMA.NS":  ["DRREDDY.NS",    "CIPLA.NS",    "DIVISLAB.NS"              ],
}


# ─── Provider implementation ──────────────────────────────────────────────────

class LiveAPIProvider(BaseDataProvider):
    """
    Live market data provider backed by Yahoo Finance (yfinance).

    Portfolio positions are loaded from the active portfolio in the database.
    Live prices from yfinance are applied on top of those positions.
    When yfinance data is unavailable, holdings are returned with data_source="unavailable"
    rather than silently substituting mock data.
    """

    def __init__(self, db: Optional[Session] = None):
        """
        db: SQLAlchemy Session for loading active portfolio holdings.
            If not provided, get_holdings() will return an empty list with a warning.
        """
        self._db = db

    @property
    def mode_name(self) -> str:
        return "live"

    @property
    def is_available(self) -> bool:
        return settings.LIVE_API_ENABLED

    # ─── Holdings ─────────────────────────────────────────────────────────────

    async def get_holdings(self) -> list[HoldingBase]:
        """
        Returns active portfolio positions from the database, enriched with
        live prices from yfinance.

        data_source per holding:
          "live"        — yfinance returned a valid current price
          "db_only"     — yfinance unavailable, using DB-stored current_price
          "unavailable" — yfinance unavailable and no DB price stored
        """
        if self._db is None:
            logger.error("LiveAPIProvider.get_holdings() called without a db session")
            return []

        # 1. Load active portfolio from DB
        from app.models.portfolio import Portfolio, Holding as HoldingORM

        active = (
            self._db.query(Portfolio)
            .filter(Portfolio.is_active == True)  # noqa: E712
            .first()
        )
        if active is None:
            # No active portfolio — return empty rather than silently falling back to mock
            logger.warning("LiveAPIProvider: no active portfolio found in DB")
            return []

        db_holdings: list[HoldingORM] = active.holdings

        if not db_holdings:
            logger.warning(f"LiveAPIProvider: active portfolio {active.id} has no holdings")
            return []

        if not YFINANCE_AVAILABLE:
            logger.warning("yfinance not available — returning DB prices in live mode")
            result: list[HoldingBase] = []
            for h in db_holdings:
                result.append(HoldingBase(
                    ticker=h.ticker,
                    name=h.name,
                    quantity=h.quantity,
                    average_cost=h.average_cost,
                    current_price=h.current_price,
                    sector=h.sector,
                    asset_class=h.asset_class or "Equity",
                    currency=h.currency or "INR",
                    data_source="db_only" if h.current_price else "unavailable",
                ))
            return result

        # 2. Batch-fetch live prices
        tickers = [h.ticker for h in db_holdings]
        live_prices = _fetch_live_prices_batch(tickers)

        # Cache individual results
        for ticker, price in live_prices.items():
            _store_price(ticker, price)

        # 3. Enrich holdings
        final: list[HoldingBase] = []
        for h in db_holdings:
            cached   = _price_from_cache(h.ticker)
            live_px  = live_prices.get(h.ticker) or cached

            if live_px:
                current_price = round(live_px, 2)
                data_source   = "live"
            elif h.current_price:
                current_price = h.current_price
                data_source   = "db_only"
            else:
                current_price = h.average_cost  # fallback to cost so math doesn't break
                data_source   = "unavailable"

            final.append(HoldingBase(
                ticker=h.ticker,
                name=h.name,
                quantity=h.quantity,
                average_cost=h.average_cost,
                current_price=current_price,
                sector=h.sector,
                asset_class=h.asset_class or "Equity",
                currency=h.currency or "INR",
                data_source=data_source,
            ))

        return final

    # ─── Price history ────────────────────────────────────────────────────────

    async def get_price_history(
        self, ticker: str, period: str = "1y", interval: str = "1d"
    ) -> dict:
        """
        Fetch price history from yfinance.
        Returns source="unavailable" with empty data[] if yfinance fails.
        Never falls back to mock data.
        """
        if not YFINANCE_AVAILABLE:
            return {
                "ticker":   ticker,
                "period":   period,
                "interval": interval,
                "data":     [],
                "source":   "unavailable",
                "error":    "yfinance not installed",
            }

        try:
            data = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=True)
            if data.empty:
                raise ValueError(f"No price history returned for {ticker}")

            records = []
            for dt, row in data.iterrows():
                records.append({
                    "date":   str(dt.date()),
                    "open":   round(float(row["Open"]),  2),
                    "high":   round(float(row["High"]),  2),
                    "low":    round(float(row["Low"]),   2),
                    "close":  round(float(row["Close"]), 2),
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
            return {
                "ticker":   ticker,
                "period":   period,
                "interval": interval,
                "data":     [],
                "source":   "unavailable",
                "error":    str(e),
            }

    # ─── Fundamentals ─────────────────────────────────────────────────────────

    async def get_fundamentals(self, ticker: str) -> dict:
        """
        Fetch fundamentals from yfinance.
        Returns source="unavailable" with null fields if yfinance fails.
        Never falls back to mock data.
        """
        # Check cache first
        cached = _fund_from_cache(ticker)
        if cached:
            return {"ticker": ticker, **cached, "from_cache": True}

        if not YFINANCE_AVAILABLE:
            return {
                "ticker": ticker,
                "source": "unavailable",
                "error":  "yfinance not installed",
            }

        data = _fetch_fundamentals_single(ticker)

        if not data:
            return {
                "ticker": ticker,
                "source": "unavailable",
                "error":  "yfinance returned empty fundamentals",
            }

        _store_fund(ticker, data)
        return {"ticker": ticker, **data}

    # ─── News ─────────────────────────────────────────────────────────────────

    async def get_news(
        self, tickers: list[str], event_type: Optional[str] = None
    ) -> list[dict]:
        """
        News is not available in live mode (no NewsAPI key configured).
        Returns empty list with a source note — does not delegate to mock.
        Phase 3: wire NewsAPI key here.
        """
        logger.debug("LiveAPIProvider.get_news: no news source configured in live mode")
        return []

    async def get_events(
        self, tickers: list[str], event_type: Optional[str] = None
    ) -> list[dict]:
        """
        Corporate events are not available in live mode without a news/events API.
        Returns empty list — does not delegate to mock.
        """
        logger.debug("LiveAPIProvider.get_events: no events source configured in live mode")
        return []

    # ─── Peers ────────────────────────────────────────────────────────────────

    async def get_peers(self, ticker: str) -> list[str]:
        """
        Returns static peer map (yfinance has no peer discovery API).
        Falls back to empty list for unknown tickers — does not delegate to mock.
        """
        return _PEER_MAP.get(ticker, [])

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
                    "ticker":      t,
                    "price":       v[0],
                    "age_seconds": round(now - v[1], 1),
                    "fresh":       (now - v[1]) < PRICE_TTL,
                }
                for t, v in _PRICE_CACHE.items()
            ],
        }
