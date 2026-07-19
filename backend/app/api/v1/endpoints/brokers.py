"""
Broker Connector Endpoints
----------------------------
Routes for managing broker account connections and triggering syncs.

Routes:
  GET    /brokers/                         list all available connectors
  GET    /brokers/{portfolio_id}/connection get current connection state
  POST   /brokers/{portfolio_id}/connect   connect a broker to a portfolio
  POST   /brokers/{portfolio_id}/sync      trigger a broker sync
  DELETE /brokers/{portfolio_id}/connection disconnect a broker

Scaffolded connectors (Zerodha, IBKR) return HTTP 501 with a clear explanation
so the frontend can display an "available but not yet configured" state.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import DbSession, CurrentUserId
from app.services.broker_service import BrokerService
from app.services.feature_registry import feature_dependency
from app.schemas.broker import (
    BrokerListResponse,
    BrokerConnectionMeta,
    ConnectRequest,
    ConnectResponse,
    SyncResponse,
    DisconnectResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/brokers",
    tags=["Brokers"],
    dependencies=[Depends(feature_dependency("broker_sync"))],
)


# ─── List available connectors ────────────────────────────────────────────────

@router.get(
    "/",
    response_model=BrokerListResponse,
    summary="List all available broker connectors",
)
async def list_brokers(db: DbSession, user_id: CurrentUserId = None) -> BrokerListResponse:
    """
    Returns static metadata for all registered broker connectors.
    Includes both configured (ready to use) and scaffolded (not yet implemented) connectors.
    The `is_implemented` field tells the UI which connectors are active vs. coming soon.
    """
    svc = BrokerService(db, user_id=user_id)
    return svc.list_available()


# ─── Get connection state ─────────────────────────────────────────────────────

@router.get(
    "/{portfolio_id}/connection",
    response_model=BrokerConnectionMeta,
    summary="Get broker connection state for a portfolio",
)
async def get_connection(portfolio_id: int, db: DbSession, user_id: CurrentUserId = None) -> BrokerConnectionMeta:
    """
    Returns the current broker connection state for a given portfolio.
    If no connection exists, returns `connection_state: "disconnected"`.
    """
    svc = BrokerService(db, user_id=user_id)
    return svc.get_connection(portfolio_id)


# ─── Connect ──────────────────────────────────────────────────────────────────

@router.post(
    "/{portfolio_id}/connect",
    response_model=ConnectResponse,
    summary="Connect a broker account to a portfolio",
)
async def connect_broker(
    portfolio_id: int,
    body: ConnectRequest,
    db: DbSession,
    user_id: CurrentUserId = None,
) -> ConnectResponse:
    """
    Initiate a broker connection for a portfolio.

    For scaffolded connectors: persists a pending state and returns
    `scaffolded: true` with an explanatory message — no error raised.

    For implemented connectors: calls the connector's auth flow and
    updates the portfolio's source metadata.

    Security note: this endpoint accepts only non-secret config fields.
    API keys and tokens must be passed via environment variables until
    secure credential storage is implemented.
    """
    svc = BrokerService(db, user_id=user_id)
    try:
        return svc.connect(portfolio_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("connect_broker error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Sync ─────────────────────────────────────────────────────────────────────

@router.post(
    "/{portfolio_id}/sync",
    response_model=SyncResponse,
    summary="Sync holdings from a broker into a portfolio",
)
async def sync_broker(portfolio_id: int, db: DbSession, user_id: CurrentUserId = None) -> SyncResponse:
    """
    Pull current holdings from the connected broker and replace
    the portfolio's holdings (with pre/post snapshots for history).

    Returns HTTP 501 with `scaffolded: true` for unimplemented connectors.
    Returns HTTP 400 if no connection exists or state is not connected.
    """
    svc = BrokerService(db, user_id=user_id)
    try:
        return svc.sync(portfolio_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("sync_broker error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Disconnect ───────────────────────────────────────────────────────────────

@router.delete(
    "/{portfolio_id}/connection",
    response_model=DisconnectResponse,
    summary="Disconnect a broker from a portfolio",
)
async def disconnect_broker(portfolio_id: int, db: DbSession, user_id: CurrentUserId = None) -> DisconnectResponse:
    """Remove the broker connection for a portfolio."""
    svc = BrokerService(db, user_id=user_id)
    try:
        return svc.disconnect(portfolio_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
