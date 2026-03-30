"""
Snapshot Service
-----------------
Business logic for creating, retrieving, and comparing portfolio snapshots.

Responsibilities:
  - Capture a portfolio's current state from the DB (holdings + computed metrics)
  - Serialise sector weights and risk metrics into JSON blobs
  - Load a snapshot back into a plain dict for the delta module
  - Orchestrate delta computation via lib/delta.py
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.snapshot import Snapshot, SnapshotHolding
from app.models.portfolio import Holding
from app.repositories.snapshot_repository import SnapshotRepository
from app.schemas.snapshot import (
    SnapshotSummary,
    SnapshotDetail,
    SnapshotHoldingRow,
    PortfolioDeltaResponse,
    HoldingDelta,
    SectorDelta,
)
from app.lib.delta import compute_delta

logger = logging.getLogger(__name__)


class SnapshotService:

    def __init__(self, db: Session):
        self.db    = db
        self.repo  = SnapshotRepository(db)

    # ─── Capture ──────────────────────────────────────────────────────────────

    def capture(
        self,
        portfolio_id: int,
        label: Optional[str] = None,
    ) -> Snapshot:
        """
        Read holdings from the DB for portfolio_id, compute summary metrics,
        and write a new Snapshot + SnapshotHolding records.
        Returns the created Snapshot ORM object.
        """
        holdings = (
            self.db.query(Holding)
            .filter(Holding.portfolio_id == portfolio_id)
            .all()
        )

        if not holdings:
            logger.warning("Snapshot requested for portfolio %s but it has no holdings", portfolio_id)

        # ── Compute summary metrics ───────────────────────────────────────────
        total_value    = 0.0
        total_cost     = 0.0
        sector_values: dict[str, float] = {}

        for h in holdings:
            price  = h.current_price or h.average_cost
            val    = h.quantity * price
            cost   = h.quantity * h.average_cost
            total_value += val
            total_cost  += cost
            sector       = h.sector or "Unknown"
            sector_values[sector] = sector_values.get(sector, 0.0) + val

        total_pnl     = total_value - total_cost
        total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0.0
        top_sector    = max(sector_values, key=sector_values.get) if sector_values else None

        # Sector weights (%)
        sector_weights: dict[str, float] = {}
        if total_value > 0:
            sector_weights = {
                s: round(v / total_value * 100, 3)
                for s, v in sector_values.items()
            }

        # Per-holding weights for SnapshotHolding rows
        snap_holdings: list[SnapshotHolding] = []
        top_holdings_data: list[dict] = []

        for h in holdings:
            price = h.current_price or h.average_cost
            val   = h.quantity * price
            wt    = round(val / total_value * 100, 3) if total_value > 0 else 0.0

            snap_holdings.append(SnapshotHolding(
                ticker=h.ticker,
                name=h.name,
                quantity=h.quantity,
                average_cost=h.average_cost,
                market_value=round(val, 2),
                weight_pct=wt,
                sector=h.sector,
            ))
            top_holdings_data.append({
                "ticker":       h.ticker,
                "name":         h.name,
                "weight":       wt,
                "market_value": round(val, 2),
                "sector":       h.sector or "Unknown",
            })

        # Sort top-holdings by weight descending, keep top 10
        top_holdings_data.sort(key=lambda x: x["weight"], reverse=True)
        top_holdings_data = top_holdings_data[:10]

        # ── Build Snapshot record ─────────────────────────────────────────────
        auto_label = label or f"Auto — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}"

        snap = Snapshot(
            portfolio_id=portfolio_id,
            label=auto_label,
            captured_at=datetime.now(timezone.utc),
            total_value=round(total_value, 2),
            total_cost=round(total_cost, 2),
            total_pnl=round(total_pnl, 2),
            total_pnl_pct=round(total_pnl_pct, 3),
            num_holdings=len(holdings),
            top_sector=top_sector,
            sector_weights_json=json.dumps(sector_weights),
            risk_metrics_json=json.dumps({}),   # populated later if risk analytics available
            top_holdings_json=json.dumps(top_holdings_data),
            holdings=snap_holdings,
        )

        return self.repo.create(snap)

    # ─── Retrieval ────────────────────────────────────────────────────────────

    def list_summaries(self, portfolio_id: int) -> list[SnapshotSummary]:
        snaps = self.repo.list_for_portfolio(portfolio_id)
        return [SnapshotSummary.model_validate(s) for s in snaps]

    def get_detail(self, snapshot_id: int) -> Optional[SnapshotDetail]:
        snap = self.repo.get_by_id(snapshot_id)
        if snap is None:
            return None
        return self._to_detail(snap)

    # ─── Delta ────────────────────────────────────────────────────────────────

    def compute_delta(
        self, snapshot_a_id: int, snapshot_b_id: int
    ) -> Optional[PortfolioDeltaResponse]:
        snap_a = self.repo.get_by_id(snapshot_a_id)
        snap_b = self.repo.get_by_id(snapshot_b_id)
        if snap_a is None or snap_b is None:
            return None

        dict_a = self._snapshot_to_dict(snap_a)
        dict_b = self._snapshot_to_dict(snap_b)
        delta  = compute_delta(dict_a, dict_b)

        return PortfolioDeltaResponse(
            snapshot_a_id=delta.snapshot_a_id,
            snapshot_b_id=delta.snapshot_b_id,
            captured_at_a=delta.captured_at_a,
            captured_at_b=delta.captured_at_b,
            days_apart=delta.days_apart,
            total_value_delta=delta.total_value_delta,
            total_value_delta_pct=delta.total_value_delta_pct,
            total_pnl_delta=delta.total_pnl_delta,
            holding_deltas=[
                HoldingDelta(**vars(hd)) for hd in delta.holding_deltas
            ],
            sector_deltas=[
                SectorDelta(**vars(sd)) for sd in delta.sector_deltas
            ],
            added_tickers=delta.added_tickers,
            removed_tickers=delta.removed_tickers,
            increased_tickers=delta.increased_tickers,
            decreased_tickers=delta.decreased_tickers,
            unchanged_tickers=delta.unchanged_tickers,
            has_changes=delta.has_changes,
        )

    # ─── Internal helpers ─────────────────────────────────────────────────────

    def _to_detail(self, snap: Snapshot) -> SnapshotDetail:
        holdings = [SnapshotHoldingRow.model_validate(h) for h in snap.holdings]
        sector_weights: dict = {}
        risk_metrics:   dict = {}
        top_holdings:   list = []

        try:
            if snap.sector_weights_json:
                sector_weights = json.loads(snap.sector_weights_json)
        except Exception:
            pass

        try:
            if snap.risk_metrics_json:
                risk_metrics = json.loads(snap.risk_metrics_json)
        except Exception:
            pass

        try:
            if snap.top_holdings_json:
                top_holdings = json.loads(snap.top_holdings_json)
        except Exception:
            pass

        return SnapshotDetail(
            id=snap.id,
            portfolio_id=snap.portfolio_id,
            label=snap.label,
            captured_at=snap.captured_at,
            total_value=snap.total_value,
            total_cost=snap.total_cost,
            total_pnl=snap.total_pnl,
            total_pnl_pct=snap.total_pnl_pct,
            num_holdings=snap.num_holdings,
            top_sector=snap.top_sector,
            holdings=holdings,
            sector_weights=sector_weights,
            risk_metrics=risk_metrics,
            top_holdings=top_holdings,
        )

    def _snapshot_to_dict(self, snap: Snapshot) -> dict:
        """Convert ORM Snapshot to a plain dict for the delta module."""
        sector_weights: dict = {}
        try:
            if snap.sector_weights_json:
                sector_weights = json.loads(snap.sector_weights_json)
        except Exception:
            pass

        holdings = [
            {
                "ticker":       h.ticker,
                "name":         h.name or h.ticker,
                "sector":       h.sector or "Unknown",
                "quantity":     h.quantity,
                "market_value": h.market_value,
                "weight_pct":   h.weight_pct,
            }
            for h in snap.holdings
        ]

        return {
            "id":            snap.id,
            "captured_at":   snap.captured_at,
            "total_value":   snap.total_value,
            "total_pnl":     snap.total_pnl,
            "holdings":      holdings,
            "sector_weights": sector_weights,
        }
