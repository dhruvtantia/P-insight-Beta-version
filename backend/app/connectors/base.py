"""
BrokerConnector — Abstract Base Class
---------------------------------------
All broker connectors must implement this interface.

Design goals:
  1. Each connector is stateless — all state lives in BrokerConnection (DB).
  2. connect() receives a config dict; what keys are required is connector-specific
     and declared in ConnectorInfo.required_config_fields.
  3. sync_holdings() returns a list of HoldingBase — same type the upload pipeline
     produces — so the refresh_portfolio() service can handle them identically.
  4. Scaffolded connectors raise ConnectorNotConfiguredError, which the endpoint
     catches and returns as a clean 501 JSON response.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from app.schemas.portfolio import HoldingBase


# ─── Errors ───────────────────────────────────────────────────────────────────

class ConnectorNotConfiguredError(Exception):
    """Raised when a connector is scaffolded but not yet implemented."""
    def __init__(self, broker: str, message: str = ""):
        self.broker = broker
        super().__init__(
            message or f"Broker '{broker}' connector is scaffolded but not yet configured. "
                       f"Add API credentials and implement the auth flow to enable it."
        )


class ConnectorAuthError(Exception):
    """Raised when authentication credentials are invalid."""


class ConnectorSyncError(Exception):
    """Raised when a sync attempt fails after successful authentication."""


# ─── Metadata ─────────────────────────────────────────────────────────────────

@dataclass
class ConnectorInfo:
    """
    Static metadata describing a connector.
    Returned by GET /brokers/ so the frontend can render the connection UI.
    """
    broker_name:          str              # "zerodha" | "ibkr" | "generic"
    display_name:         str              # "Zerodha Kite" | "Interactive Brokers"
    description:          str             # Short user-facing description
    auth_method:          str              # "api_key" | "oauth" | "credentials"
    region:               str              # "IN" | "US" | "Global"
    asset_classes:        list[str]        # ["Equity"] | ["Equity", "Options", "Futures"]
    is_configured:        bool             # True only when env vars / creds are present
    is_implemented:       bool             # False = scaffold, not production-ready
    required_config_fields: list[str]     # fields user must provide to connect
    docs_url:             Optional[str] = None
    logo_slug:            Optional[str] = None  # for frontend icon lookup


@dataclass
class ConnectionResult:
    """Result of a connect() call."""
    success:    bool
    account_id: Optional[str]  = None
    message:    str             = ""
    error:      Optional[str]   = None


@dataclass
class SyncResult:
    """Result of a sync_holdings() call."""
    holdings:    list[HoldingBase]  = field(default_factory=list)
    skipped:     int                = 0
    message:     str                = ""
    error:       Optional[str]      = None


# ─── Abstract base ────────────────────────────────────────────────────────────

class BrokerConnector(ABC):
    """
    Abstract base for all broker connectors.

    Usage pattern (in BrokerService):
      connector = CONNECTOR_REGISTRY["zerodha"]()
      info      = connector.get_info()
      result    = connector.connect({"api_key": "…", "api_secret": "…"})
      if result.success:
          sync   = connector.sync_holdings()
          ...
    """

    @abstractmethod
    def get_info(self) -> ConnectorInfo:
        """Return static metadata about this connector."""
        ...

    @abstractmethod
    def connect(self, config: dict) -> ConnectionResult:
        """
        Validate credentials / initiate auth flow.

        config: dict of fields declared in ConnectorInfo.required_config_fields.
        Returns a ConnectionResult. Never raises for expected auth failures —
        return ConnectionResult(success=False, error="…") instead.
        Only raises ConnectorNotConfiguredError for unimplemented connectors.
        """
        ...

    @abstractmethod
    def sync_holdings(self, config: dict) -> SyncResult:
        """
        Fetch current portfolio positions from the broker.

        Returns a SyncResult whose .holdings list is ready to pass directly
        to PortfolioManagerService.refresh_portfolio().
        """
        ...

    @abstractmethod
    def test_connection(self, config: dict) -> ConnectionResult:
        """
        Quick liveness check — does not fetch holdings.
        Used by the frontend "Test Connection" step.
        """
        ...

    def disconnect(self) -> None:
        """
        Revoke session / cleanup. Default is a no-op (stateless connectors).
        Override for OAuth connectors that need to invalidate tokens.
        """
