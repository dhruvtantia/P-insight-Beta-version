"""
Snapshot Schemas
-----------------
Pydantic models for the snapshot endpoints and delta API.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ─── Snapshot response ────────────────────────────────────────────────────────

class SnapshotHoldingRow(BaseModel):
    ticker:       str
    name:         Optional[str]  = None
    quantity:     Optional[float] = None
    average_cost: Optional[float] = None
    market_value: Optional[float] = None
    weight_pct:   Optional[float] = None
    sector:       Optional[str]  = None

    model_config = {"from_attributes": True}


class SnapshotSummary(BaseModel):
    """Lightweight — for listing snapshots without loading all holdings."""
    id:            int
    portfolio_id:  int
    label:         Optional[str]  = None
    captured_at:   datetime
    total_value:   Optional[float] = None
    total_cost:    Optional[float] = None
    total_pnl:     Optional[float] = None
    total_pnl_pct: Optional[float] = None
    num_holdings:  Optional[int]  = None
    top_sector:    Optional[str]  = None

    model_config = {"from_attributes": True}


class SnapshotDetail(SnapshotSummary):
    """Full snapshot including per-holding rows and JSON blobs."""
    holdings:            list[SnapshotHoldingRow] = []
    sector_weights:      dict[str, float] = {}   # deserialised from sector_weights_json
    risk_metrics:        dict[str, float] = {}   # deserialised from risk_metrics_json
    top_holdings:        list[dict] = []          # deserialised from top_holdings_json


# ─── Snapshot creation ────────────────────────────────────────────────────────

class SnapshotCreateRequest(BaseModel):
    label: Optional[str] = Field(
        None,
        description="Human-readable label for this snapshot, e.g. 'Before rebalance'",
        max_length=200,
    )


# ─── Delta response ───────────────────────────────────────────────────────────

class HoldingDelta(BaseModel):
    ticker:        str
    name:          Optional[str]  = None
    sector:        Optional[str]  = None

    weight_before: Optional[float] = None   # % weight in snapshot A
    weight_after:  Optional[float] = None   # % weight in snapshot B
    weight_delta:  Optional[float] = None   # after − before

    value_before:  Optional[float] = None
    value_after:   Optional[float] = None
    value_delta:   Optional[float] = None

    qty_before:    Optional[float] = None
    qty_after:     Optional[float] = None

    status:        str = "unchanged"
    # "added" | "removed" | "increased" | "decreased" | "unchanged"


class SectorDelta(BaseModel):
    sector:        str
    weight_before: Optional[float] = None
    weight_after:  Optional[float] = None
    weight_delta:  Optional[float] = None


class PortfolioDeltaResponse(BaseModel):
    snapshot_a_id:   int
    snapshot_b_id:   int
    captured_at_a:   datetime
    captured_at_b:   datetime
    days_apart:      int

    # Summary-level changes
    total_value_delta:   Optional[float] = None
    total_value_delta_pct: Optional[float] = None
    total_pnl_delta:     Optional[float] = None

    # Holding-level changes
    holding_deltas:      list[HoldingDelta] = []
    sector_deltas:       list[SectorDelta]  = []

    # Convenience lists
    added_tickers:       list[str] = []
    removed_tickers:     list[str] = []
    increased_tickers:   list[str] = []
    decreased_tickers:   list[str] = []
    unchanged_tickers:   list[str] = []

    has_changes:         bool = False
