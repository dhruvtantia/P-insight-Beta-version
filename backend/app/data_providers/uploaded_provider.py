"""
DB-backed uploaded portfolio provider.

Uploaded mode should read the active portfolio from durable storage. The
in-memory FileDataProvider remains as a legacy upload parser/helper, but it is
not the source of truth for portfolio display.
"""

import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.data_providers.base import BaseDataProvider
from app.data_providers.file_provider import FileDataProvider
from app.schemas.portfolio import HoldingBase

logger = logging.getLogger(__name__)


class UploadedPortfolioProvider(BaseDataProvider):
    """Read DB-stored holdings for a selected or active uploaded portfolio."""

    def __init__(self, db: Optional[Session] = None, portfolio_id: Optional[int] = None):
        self._db = db
        self._portfolio_id = portfolio_id
        self._market_proxy = FileDataProvider()

    @property
    def mode_name(self) -> str:
        return "uploaded"

    @property
    def is_available(self) -> bool:
        return True

    async def get_holdings(self) -> list[HoldingBase]:
        if self._db is None:
            logger.error("UploadedPortfolioProvider.get_holdings() called without a db session")
            return []

        from app.models.portfolio import Portfolio

        query = self._db.query(Portfolio)
        if self._portfolio_id is not None:
            active = query.filter(Portfolio.id == self._portfolio_id).first()
        else:
            active = query.filter(Portfolio.is_active.is_(True)).first()
        if active is None:
            return []

        return [
            HoldingBase(
                ticker=h.ticker,
                name=h.name,
                quantity=h.quantity,
                average_cost=h.average_cost,
                current_price=h.current_price,
                sector=h.sector,
                industry=getattr(h, "industry", None),
                asset_class=h.asset_class or "Equity",
                currency=h.currency or "INR",
                purchase_date=getattr(h, "purchase_date", None),
                notes=getattr(h, "notes", None),
                data_source="uploaded",
                sector_status=getattr(h, "sector_status", None),
                fundamentals_status=getattr(h, "fundamentals_status", None),
                enrichment_status=getattr(h, "enrichment_status", None),
            )
            for h in active.holdings
        ]

    async def get_price_history(
        self,
        ticker: str,
        period: str = "1y",
        interval: str = "1d",
    ) -> dict:
        return await self._market_proxy.get_price_history(ticker, period, interval)

    async def get_fundamentals(self, ticker: str) -> dict:
        return await self._market_proxy.get_fundamentals(ticker)

    async def get_news(self, tickers: list[str], event_type: Optional[str] = None) -> list[dict]:
        return await self._market_proxy.get_news(tickers, event_type)

    async def get_events(self, tickers: list[str], event_type: Optional[str] = None) -> list[dict]:
        return await self._market_proxy.get_events(tickers, event_type)

    async def get_peers(self, ticker: str) -> list[str]:
        return await self._market_proxy.get_peers(ticker)
