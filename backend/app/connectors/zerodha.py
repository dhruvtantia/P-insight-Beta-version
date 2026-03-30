"""
Zerodha Kite Connect — Scaffold Connector
-------------------------------------------
Status: SCAFFOLDED — not yet production-ready.

To enable real Zerodha integration:
  1. pip install kiteconnect
  2. Set ZERODHA_API_KEY and ZERODHA_API_SECRET in .env
  3. Implement the two-step Kite login flow:
       a. Redirect user to kite.zerodha.com/connect/login?api_key=…
       b. Receive the request_token callback
       c. Exchange for access_token via kite.generate_session(request_token, api_secret)
  4. Implement sync_holdings() using:
       kite.holdings()  → demat holdings
       kite.positions() → intraday positions
  5. Map the KiteConnect response fields to HoldingBase

References:
  https://kite.trade/docs/connect/v3/
  https://github.com/zerodha/pykiteconnect

This scaffold returns structured "not configured" responses so the frontend
can render the connection UI even before the auth flow is implemented.
"""

from app.connectors.base import (
    BrokerConnector, ConnectorInfo, ConnectionResult, SyncResult,
    ConnectorNotConfiguredError,
)
from app.schemas.portfolio import HoldingBase


class ZerodhaConnector(BrokerConnector):

    BROKER_NAME = "zerodha"

    def get_info(self) -> ConnectorInfo:
        return ConnectorInfo(
            broker_name           = self.BROKER_NAME,
            display_name          = "Zerodha Kite",
            description           = "India's largest retail broker. Supports equities, F&O, commodities, and mutual funds via Kite Connect API.",
            auth_method           = "api_key",
            region                = "IN",
            asset_classes         = ["Equity", "F&O", "Commodity", "Mutual Funds"],
            is_configured         = False,   # ← set True once env vars present
            is_implemented        = False,   # ← scaffold only
            required_config_fields= ["api_key", "api_secret", "request_token"],
            docs_url              = "https://kite.trade/docs/connect/v3/",
            logo_slug             = "zerodha",
        )

    def connect(self, config: dict) -> ConnectionResult:
        raise ConnectorNotConfiguredError(
            self.BROKER_NAME,
            "Zerodha connector is scaffolded. "
            "Add ZERODHA_API_KEY / ZERODHA_API_SECRET to .env and implement the Kite OAuth flow to enable it.",
        )

    def test_connection(self, config: dict) -> ConnectionResult:
        raise ConnectorNotConfiguredError(
            self.BROKER_NAME,
            "Zerodha connector is scaffolded. Cannot test connection yet.",
        )

    def sync_holdings(self, config: dict) -> SyncResult:
        raise ConnectorNotConfiguredError(
            self.BROKER_NAME,
            "Zerodha connector is scaffolded. Implement sync_holdings() using kiteconnect.holdings().",
        )

    # ─── Future implementation reference (commented) ──────────────────────────
    # def _live_sync(self, api_key: str, access_token: str) -> SyncResult:
    #     from kiteconnect import KiteConnect
    #     kite = KiteConnect(api_key=api_key)
    #     kite.set_access_token(access_token)
    #     raw = kite.holdings()
    #     holdings = [
    #         HoldingBase(
    #             ticker        = h["tradingsymbol"] + ".NS",
    #             name          = h["tradingsymbol"],
    #             quantity      = h["quantity"],
    #             average_cost  = h["average_price"],
    #             current_price = h["last_price"],
    #             sector        = None,
    #         )
    #         for h in raw if h["quantity"] > 0
    #     ]
    #     return SyncResult(holdings=holdings, message=f"Synced {len(holdings)} holdings from Zerodha")
