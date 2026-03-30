"""
Data Provider Abstract Base Class
------------------------------------
Every data source in P-Insight implements this interface.
The rest of the application only depends on this contract — never on a
specific provider.

To add a new data source:
  1. Create a new file in this directory (e.g., alphavantage_provider.py)
  2. Inherit from BaseDataProvider
  3. Implement every abstract method
  4. Register it in core/dependencies.py get_data_provider()
  5. Add the feature flag and env vars to core/config.py
"""

from abc import ABC, abstractmethod
from typing import Optional

from app.schemas.portfolio import HoldingBase


class BaseDataProvider(ABC):

    # ─── Identity ─────────────────────────────────────────────────────────────

    @property
    @abstractmethod
    def mode_name(self) -> str:
        """Machine-readable mode name (e.g. 'mock', 'live')."""
        ...

    @property
    @abstractmethod
    def is_available(self) -> bool:
        """
        Whether this provider is currently configured and enabled.
        Disabled providers raise HTTP 503 when requested.
        """
        ...

    # ─── Portfolio Data ───────────────────────────────────────────────────────

    @abstractmethod
    async def get_holdings(self) -> list[HoldingBase]:
        """Return all portfolio holdings for this provider."""
        ...

    @abstractmethod
    async def get_price_history(
        self,
        ticker: str,
        period: str = "1y",
        interval: str = "1d",
    ) -> dict:
        """
        Return OHLCV price history for a single ticker.

        Expected return shape:
        {
            "ticker": str,
            "period": str,
            "interval": str,
            "data": [{"date": str, "open": float, "high": float,
                       "low": float, "close": float, "volume": int}],
            "source": str
        }
        """
        ...

    # ─── Fundamentals ─────────────────────────────────────────────────────────

    @abstractmethod
    async def get_fundamentals(self, ticker: str) -> dict:
        """
        Return fundamental financial data for a ticker.

        Expected return shape:
        {
            "ticker": str,
            "pe_ratio": float | None,
            "pb_ratio": float | None,
            "ev_ebitda": float | None,
            "market_cap": float | None,
            "dividend_yield": float | None,
            "source": str
        }
        """
        ...

    # ─── News ─────────────────────────────────────────────────────────────────

    @abstractmethod
    async def get_news(
        self,
        tickers: list[str],
        event_type: Optional[str] = None,
    ) -> list[dict]:
        """
        Return recent news articles relevant to the given tickers.
        Optionally filter by event_type (earnings, dividend, deal, …).

        Expected return shape (list of):
        {
            "title": str,
            "summary": str,
            "url": str,
            "published_at": str,
            "source": str,
            "tickers": list[str],
            "event_type": str,
            "sentiment": str
        }
        """
        ...

    async def get_events(
        self,
        tickers: list[str],
        event_type: Optional[str] = None,
    ) -> list[dict]:
        """
        Return upcoming corporate events for the given tickers.
        Non-abstract: providers may override; default returns empty list.

        Expected return shape (list of):
        {
            "ticker": str,
            "name": str | None,
            "event_type": str,
            "title": str,
            "date": str,       # ISO date
            "details": str | None
        }
        """
        return []

    # ─── Peers ────────────────────────────────────────────────────────────────

    @abstractmethod
    async def get_peers(self, ticker: str) -> list[str]:
        """Return a list of peer ticker symbols for comparison."""
        ...

    # ─── Optional: Benchmark ──────────────────────────────────────────────────

    async def get_benchmark_history(
        self,
        benchmark: str = "^NSEI",
        period: str = "1y",
    ) -> dict:
        """
        Return benchmark index price history.
        Default benchmark: Nifty 50 (^NSEI).
        Override this in providers that support benchmark data.
        """
        return {
            "ticker": benchmark,
            "period": period,
            "data": [],
            "note": "Benchmark data not available in this provider.",
            "source": self.mode_name,
        }
