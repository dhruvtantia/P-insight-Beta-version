"""
Interactive Brokers — Scaffold Connector
------------------------------------------
Status: SCAFFOLDED — not yet production-ready.

To enable real IBKR integration:
  1. Use the IBKR Client Portal Web API (no additional pip package needed
     for the REST approach) OR pip install ib_insync for TWS API.
  2. Set IBKR_BASE_URL (e.g. https://localhost:5000/v1/api) in .env.
  3. Implement the two-step Client Portal SSO:
       a. GET /iserver/auth/status
       b. POST /iserver/reauthenticate if session expired
  4. Implement sync_holdings() using:
       GET /portfolio/{accountId}/positions/0
  5. Map IBKR position fields to HoldingBase

References:
  https://www.interactivebrokers.com/api/doc.html#tag/Portfolio
  https://github.com/erdewit/ib_insync

This scaffold returns structured "not configured" responses.
"""

from app.connectors.base import (
    BrokerConnector, ConnectorInfo, ConnectionResult, SyncResult,
    ConnectorNotConfiguredError,
)


class IBKRConnector(BrokerConnector):

    BROKER_NAME = "ibkr"

    def get_info(self) -> ConnectorInfo:
        return ConnectorInfo(
            broker_name            = self.BROKER_NAME,
            display_name           = "Interactive Brokers",
            description            = "Global broker supporting stocks, ETFs, options, futures, forex, and bonds across 150+ markets.",
            auth_method            = "client_portal",
            region                 = "Global",
            asset_classes          = ["Equity", "ETF", "Options", "Futures", "Forex", "Bonds"],
            is_configured          = False,
            is_implemented         = False,
            required_config_fields = ["account_id", "client_portal_url"],
            docs_url               = "https://www.interactivebrokers.com/api/doc.html",
            logo_slug              = "ibkr",
        )

    def connect(self, config: dict) -> ConnectionResult:
        raise ConnectorNotConfiguredError(
            self.BROKER_NAME,
            "IBKR connector is scaffolded. "
            "Set IBKR_BASE_URL in .env and implement the Client Portal SSO flow to enable it.",
        )

    def test_connection(self, config: dict) -> ConnectionResult:
        raise ConnectorNotConfiguredError(
            self.BROKER_NAME,
            "IBKR connector is scaffolded. Cannot test connection yet.",
        )

    def sync_holdings(self, config: dict) -> SyncResult:
        raise ConnectorNotConfiguredError(
            self.BROKER_NAME,
            "IBKR connector is scaffolded. Implement sync_holdings() using the IBKR Client Portal /portfolio/positions endpoint.",
        )
