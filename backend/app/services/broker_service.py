"""
BrokerService
--------------
Business logic for broker connection management.

Responsibilities:
  - connect / disconnect a broker to a portfolio
  - trigger a sync (pull holdings from broker, refresh portfolio)
  - persist state in the BrokerConnection table
  - update Portfolio.source_metadata to reflect broker info

This service coordinates between:
  - app.connectors.*         (broker-specific logic)
  - app.models.broker_connection (persistence)
  - app.services.portfolio_manager (holdings refresh + snapshots)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.connectors.base import ConnectorNotConfiguredError, ConnectorAuthError
from app.connectors.registry import CONNECTOR_REGISTRY, list_connectors, get_connector
from app.models.broker_connection import BrokerConnection
from app.models.portfolio import Portfolio
from app.schemas.broker import (
    BrokerInfo, BrokerListResponse, BrokerConnectionMeta,
    ConnectRequest, ConnectResponse, SyncResponse, DisconnectResponse,
)

logger = logging.getLogger(__name__)


class BrokerService:

    def __init__(self, db: Session):
        self.db = db

    # ─── List available connectors ─────────────────────────────────────────────

    def list_available(self) -> BrokerListResponse:
        """Return static metadata for all registered connectors."""
        infos  = list_connectors()
        return BrokerListResponse(
            brokers=[
                BrokerInfo(
                    broker_name            = i.broker_name,
                    display_name           = i.display_name,
                    description            = i.description,
                    auth_method            = i.auth_method,
                    region                 = i.region,
                    asset_classes          = i.asset_classes,
                    is_configured          = i.is_configured,
                    is_implemented         = i.is_implemented,
                    required_config_fields = i.required_config_fields,
                    docs_url               = i.docs_url,
                    logo_slug              = i.logo_slug,
                )
                for i in infos
            ],
            total=len(infos),
        )

    # ─── Get connection state ──────────────────────────────────────────────────

    def get_connection(self, portfolio_id: int) -> BrokerConnectionMeta:
        """
        Return the current BrokerConnection state for a portfolio.
        If no row exists, return a disconnected default.
        """
        row = self._get_row(portfolio_id)
        if row is None:
            return BrokerConnectionMeta(
                portfolio_id     = portfolio_id,
                connection_state = "disconnected",
            )
        return BrokerConnectionMeta.model_validate(row)

    # ─── Connect ──────────────────────────────────────────────────────────────

    def connect(self, portfolio_id: int, req: ConnectRequest) -> ConnectResponse:
        """
        Initiate a broker connection for a portfolio.

        For scaffolded connectors: marks state as "pending" and returns
        a response indicating the connector is not yet implemented.

        For implemented connectors (future): calls connector.connect(),
        persists the result, and updates Portfolio.source to "broker".
        """
        portfolio = self._get_portfolio(portfolio_id)
        if portfolio is None:
            raise ValueError(f"Portfolio {portfolio_id} not found")

        # Validate broker name
        if req.broker_name not in CONNECTOR_REGISTRY:
            available = list(CONNECTOR_REGISTRY.keys())
            raise ValueError(f"Unknown broker '{req.broker_name}'. Available: {available}")

        connector = get_connector(req.broker_name)

        # Upsert connection row
        row = self._get_row(portfolio_id)
        now = datetime.now(timezone.utc)
        if row is None:
            row = BrokerConnection(
                portfolio_id     = portfolio_id,
                broker_name      = req.broker_name,
                connection_state = "pending",
                created_at       = now,
                updated_at       = now,
            )
            self.db.add(row)
        else:
            row.broker_name      = req.broker_name
            row.connection_state = "pending"
            row.sync_error       = None
            row.updated_at       = now

        row.account_id  = req.account_id
        row.config_json = json.dumps(req.config) if req.config else None
        self.db.flush()

        # Attempt real connection
        scaffolded = False
        try:
            result = connector.connect(req.config)
            if result.success:
                row.connection_state = "connected"
                row.account_id       = result.account_id or req.account_id
                row.sync_error       = None
                # Update portfolio source
                portfolio.source     = "broker"
                portfolio.source_metadata = json.dumps({
                    "broker_name": req.broker_name,
                    "account_id":  row.account_id,
                    "connected_at": now.isoformat(),
                })
                self.db.commit()
                return ConnectResponse(
                    success=True, portfolio_id=portfolio_id,
                    broker_name=req.broker_name, connection_state="connected",
                    account_id=row.account_id, message=result.message,
                )
            else:
                row.connection_state = "error"
                row.sync_error       = result.error
                self.db.commit()
                return ConnectResponse(
                    success=False, portfolio_id=portfolio_id,
                    broker_name=req.broker_name, connection_state="error",
                    message=result.error or "Connection failed",
                )

        except ConnectorNotConfiguredError as exc:
            # Scaffold — set pending state, return informative response
            scaffolded = True
            row.connection_state = "pending"
            row.sync_error       = str(exc)
            self.db.commit()
            logger.info("Scaffolded connector %s: %s", req.broker_name, exc)
            return ConnectResponse(
                success=False, portfolio_id=portfolio_id,
                broker_name=req.broker_name, connection_state="pending",
                message=str(exc), scaffolded=True,
            )
        except Exception as exc:
            row.connection_state = "error"
            row.sync_error       = str(exc)
            self.db.commit()
            logger.error("Connect failed for %s: %s", req.broker_name, exc)
            raise

    # ─── Sync ─────────────────────────────────────────────────────────────────

    def sync(self, portfolio_id: int) -> SyncResponse:
        """
        Trigger a broker sync for the portfolio.
        Calls connector.sync_holdings(), then passes holdings to
        PortfolioManagerService.refresh_portfolio() (pre/post snapshots included).
        """
        from app.services.portfolio_manager import PortfolioManagerService

        portfolio = self._get_portfolio(portfolio_id)
        if portfolio is None:
            raise ValueError(f"Portfolio {portfolio_id} not found")

        row = self._get_row(portfolio_id)
        if row is None or row.connection_state not in ("connected", "error"):
            raise ValueError(
                f"Portfolio {portfolio_id} has no active broker connection. Connect first."
            )

        connector   = get_connector(row.broker_name)
        config      = json.loads(row.config_json) if row.config_json else {}
        now         = datetime.now(timezone.utc)

        row.connection_state = "syncing"
        row.updated_at       = now
        self.db.commit()

        scaffolded = False
        try:
            sync_result = connector.sync_holdings(config)

            # Persist holdings via refresh_portfolio (pre/post snapshots)
            mgr = PortfolioManagerService(self.db)
            _p, pre_id, post_id = mgr.refresh_portfolio(
                portfolio_id = portfolio_id,
                holdings     = sync_result.holdings,
                filename     = f"broker_sync_{row.broker_name}_{now.strftime('%Y%m%d_%H%M%S')}",
            )

            row.connection_state = "connected"
            row.last_sync_at     = now
            row.sync_error       = None
            row.updated_at       = now
            self.db.commit()

            return SyncResponse(
                success          = True,
                portfolio_id     = portfolio_id,
                broker_name      = row.broker_name,
                holdings_synced  = len(sync_result.holdings),
                rows_skipped     = sync_result.skipped,
                pre_snap_id      = pre_id,
                post_snap_id     = post_id,
                last_sync_at     = now,
                message          = sync_result.message or f"Synced {len(sync_result.holdings)} holdings",
            )

        except ConnectorNotConfiguredError as exc:
            scaffolded = True
            row.connection_state = "pending"
            row.sync_error       = str(exc)
            row.updated_at       = now
            self.db.commit()
            return SyncResponse(
                success=False, portfolio_id=portfolio_id,
                broker_name=row.broker_name, message=str(exc), scaffolded=True,
            )
        except Exception as exc:
            row.connection_state = "error"
            row.sync_error       = str(exc)
            row.updated_at       = now
            self.db.commit()
            logger.error("Sync failed for portfolio %s broker %s: %s", portfolio_id, row.broker_name, exc)
            raise

    # ─── Disconnect ───────────────────────────────────────────────────────────

    def disconnect(self, portfolio_id: int) -> DisconnectResponse:
        """Remove the broker connection for a portfolio."""
        portfolio = self._get_portfolio(portfolio_id)
        if portfolio is None:
            raise ValueError(f"Portfolio {portfolio_id} not found")

        row = self._get_row(portfolio_id)
        broker_name = row.broker_name if row else None

        if row:
            try:
                connector = get_connector(row.broker_name)
                connector.disconnect()
            except Exception:
                pass  # Scaffold or already disconnected — ignore
            self.db.delete(row)

        # Optionally reset portfolio source back to "manual" (user's choice)
        # We do NOT force this — the portfolio stays as "broker" for history.

        self.db.commit()
        return DisconnectResponse(
            success=True, portfolio_id=portfolio_id,
            broker_name=broker_name, message="Broker disconnected.",
        )

    # ─── Internal ─────────────────────────────────────────────────────────────

    def _get_row(self, portfolio_id: int) -> Optional[BrokerConnection]:
        return (
            self.db.query(BrokerConnection)
            .filter(BrokerConnection.portfolio_id == portfolio_id)
            .first()
        )

    def _get_portfolio(self, portfolio_id: int) -> Optional[Portfolio]:
        return self.db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
