"""
Broker Schemas
---------------
Pydantic models for the /brokers/* API endpoints.
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ─── Connector metadata (returned by GET /brokers/) ───────────────────────────

class BrokerInfo(BaseModel):
    """Static metadata for one available connector — not portfolio-specific."""
    broker_name:             str
    display_name:            str
    description:             str
    auth_method:             str              # "api_key" | "oauth" | "client_portal"
    region:                  str              # "IN" | "US" | "Global"
    asset_classes:           list[str]
    is_configured:           bool             # True = env vars present
    is_implemented:          bool             # False = scaffold, not production-ready
    required_config_fields:  list[str]
    docs_url:                Optional[str] = None
    logo_slug:               Optional[str] = None


class BrokerListResponse(BaseModel):
    brokers: list[BrokerInfo]
    total:   int


# ─── Connection state (per-portfolio) ─────────────────────────────────────────

class BrokerConnectionMeta(BaseModel):
    """Current state of a broker connection for a specific portfolio."""
    id:               Optional[int]  = None   # null = no connection row exists
    portfolio_id:     int
    broker_name:      Optional[str]  = None
    connection_state: str            = "disconnected"   # "disconnected"|"pending"|"connected"|"syncing"|"error"
    account_id:       Optional[str]  = None
    last_sync_at:     Optional[datetime] = None
    sync_error:       Optional[str]  = None
    created_at:       Optional[datetime] = None
    updated_at:       Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── Request / response bodies ────────────────────────────────────────────────

class ConnectRequest(BaseModel):
    """
    Body for POST /brokers/{portfolio_id}/connect.
    Non-secret fields only — the UI should never send API keys over this endpoint
    until secure credential handling (KMS / vault) is implemented.
    """
    broker_name: str = Field(..., description="e.g. 'zerodha' | 'ibkr'")
    account_id:  Optional[str] = Field(None, description="Broker account reference (non-secret)")
    config:      dict          = Field(default_factory=dict, description="Non-secret config fields")


class ConnectResponse(BaseModel):
    success:          bool
    portfolio_id:     int
    broker_name:      str
    connection_state: str
    account_id:       Optional[str] = None
    message:          str
    scaffolded:       bool = False   # True = connector is not yet implemented


class SyncResponse(BaseModel):
    success:             bool
    portfolio_id:        int
    broker_name:         str
    holdings_synced:     int = 0
    rows_skipped:        int = 0
    pre_snap_id:         Optional[int] = None
    post_snap_id:        Optional[int] = None
    last_sync_at:        Optional[datetime] = None
    message:             str
    scaffolded:          bool = False


class DisconnectResponse(BaseModel):
    success:          bool
    portfolio_id:     int
    broker_name:      Optional[str] = None
    message:          str
