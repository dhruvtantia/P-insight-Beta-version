"""
Broker Sync Data Provider  [DISABLED — Phase 3]
-------------------------------------------------
Placeholder for direct broker API integration.

Planned broker integrations:
  - Zerodha Kite Connect → Indian equities
  - Groww API            → Indian equities & mutual funds
  - Fyers API            → NSE/BSE/MCX
  - Interactive Brokers  → Global equities

To enable:
  1. Set BROKER_SYNC_ENABLED=true in .env
  2. Add broker credentials to .env (ZERODHA_API_KEY, ZERODHA_API_SECRET, etc.)
  3. poetry add kiteconnect
  4. Implement the OAuth flow and abstract methods below
"""

from app.data_providers.base import BaseDataProvider
from app.schemas.portfolio import HoldingBase
from app.core.config import settings


class BrokerSyncProvider(BaseDataProvider):

    @property
    def mode_name(self) -> str:
        return "broker"

    @property
    def is_available(self) -> bool:
        return settings.BROKER_SYNC_ENABLED

    async def get_holdings(self) -> list[HoldingBase]:
        raise NotImplementedError(
            "Broker Sync is not yet implemented. "
            "Enable BROKER_SYNC_ENABLED=true and implement OAuth flow in Phase 3."
        )

    async def get_price_history(
        self, ticker: str, period: str = "1y", interval: str = "1d"
    ) -> dict:
        raise NotImplementedError("Broker Sync provider not yet implemented.")

    async def get_fundamentals(self, ticker: str) -> dict:
        raise NotImplementedError("Broker Sync provider not yet implemented.")

    async def get_news(self, tickers: list[str]) -> list[dict]:
        raise NotImplementedError("Broker Sync provider not yet implemented.")

    async def get_peers(self, ticker: str) -> list[str]:
        raise NotImplementedError("Broker Sync provider not yet implemented.")
