"""
Portfolio Context Builder
--------------------------
Builds a clean, LLM-friendly context object from the database.

Responsibilities:
  - Read portfolio + holdings through the portfolio read boundary
  - Reuse canonical portfolio summary, sector, and risk calculations
  - Pull last 5 snapshot metadata for history context
  - Compute an abbreviated delta between the two most recent snapshots
  - Return a JSON-serializable PortfolioContext dataclass — no ORM objects leak out

Design principles:
  - Never expose SQLAlchemy models outside this module
  - Gracefully handle missing data (no holdings, no snapshots)
  - Deterministic output — same DB state → same context
  - Fast: no external API calls, pure DB + arithmetic
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.snapshot  import Snapshot
from app.schemas.portfolio import RiskSnapshot, SectorAllocation
from app.services.portfolio_service import PortfolioReadService

logger = logging.getLogger(__name__)


# ─── Output types ─────────────────────────────────────────────────────────────

@dataclass
class HoldingCtx:
    ticker:     str
    name:       str
    weight_pct: float
    value:      float
    pnl_pct:    float
    sector:     str


@dataclass
class SectorCtx:
    sector:       str
    weight_pct:   float
    num_holdings: int


@dataclass
class SnapshotCtx:
    id:           int
    label:        Optional[str]
    captured_at:  str
    total_value:  float
    num_holdings: int


@dataclass
class RecentChangesCtx:
    days_apart:      int
    value_delta:     float
    value_delta_pct: float
    added_tickers:   list[str]
    removed_tickers: list[str]
    increased_count: int
    decreased_count: int


@dataclass
class SourceMetadataCtx:
    """
    Data-quality summary derived from the holdings' data_source field.
    Included in the system prompt so the AI can qualify its answers
    appropriately (e.g., warn when prices are stale or unavailable).
    """
    provider_mode:      str   # "live" | "mock" | "uploaded" | "db_only" | "unknown"
    live_count:         int   # holdings with data_source == "live"
    db_only_count:      int   # holdings with data_source == "db_only"
    unavailable_count:  int   # holdings with data_source == "unavailable"
    mock_count:         int   # holdings with data_source == "mock" or "mock_fallback"
    total_holdings:     int
    data_quality_note:  str   # plain-language summary for the LLM


@dataclass
class PortfolioContext:
    # Identity
    portfolio_id:   int
    portfolio_name: str
    source:         str

    # KPIs
    total_value:    float
    total_cost:     float
    total_pnl:      float
    total_pnl_pct:  float
    num_holdings:   int

    # Holdings
    top_holdings:   list[HoldingCtx]

    # Sectors
    sector_allocation: list[SectorCtx]

    # Risk
    risk_profile:          str
    hhi:                   float
    diversification_score: float
    max_holding_ticker:    str
    max_holding_weight:    float
    top3_weight:           float
    num_sectors:           int

    # History
    snapshot_count: int
    snapshots:      list[SnapshotCtx]
    recent_changes: Optional[RecentChangesCtx]

    # Data quality / source metadata
    source_metadata: Optional[SourceMetadataCtx] = None

    # Meta
    built_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return asdict(self)


# ─── Builder ──────────────────────────────────────────────────────────────────

class PortfolioContextBuilder:
    """
    Build a PortfolioContext for a given portfolio_id.

    Usage:
        ctx = PortfolioContextBuilder(db).build(portfolio_id)
    """

    def __init__(self, db: Session):
        self.db = db
        self.portfolio_reader = PortfolioReadService(db)

    # ── Public entry point ────────────────────────────────────────────────────

    def build(self, portfolio_id: int) -> PortfolioContext:
        """
        Build context for the given portfolio_id.
        Returns a PortfolioContext with all sections populated (empty if no data).
        """
        portfolio = self.portfolio_reader.get_portfolio(portfolio_id)
        if not portfolio:
            raise ValueError(f"Portfolio {portfolio_id} not found")

        holdings = self.portfolio_reader.get_portfolio_holdings(portfolio_id)
        enriched = self.portfolio_reader.compute_holding_metrics(holdings)
        source = portfolio.source or "unknown"

        summary         = self.portfolio_reader.compute_summary_from_enriched(enriched, source)
        sector_models   = self.portfolio_reader.compute_sector_allocation_from_enriched(enriched)
        risk_snapshot   = self.portfolio_reader.compute_risk_snapshot(enriched, sector_models)
        top_holdings    = self._build_top_holdings_context(enriched)
        sectors         = self._build_sector_context(sector_models)
        risk            = self._build_risk_context(risk_snapshot, sectors)
        snap_ctx, recent = self._compute_snapshot_history(portfolio_id)
        source_meta     = self._compute_source_metadata(holdings, source)

        return PortfolioContext(
            portfolio_id   = portfolio_id,
            portfolio_name = portfolio.name,
            source         = source,
            total_value    = summary.total_value,
            total_cost     = summary.total_cost,
            total_pnl      = summary.total_pnl,
            total_pnl_pct  = summary.total_pnl_pct,
            num_holdings   = summary.num_holdings,
            top_holdings       = top_holdings,
            sector_allocation  = sectors,
            **risk,
            snapshot_count  = len(snap_ctx),
            snapshots       = snap_ctx,
            recent_changes  = recent,
            source_metadata = source_meta,
        )

    # ── Private helpers ───────────────────────────────────────────────────────

    def _build_top_holdings_context(
        self,
        enriched: list[dict],
        top_n: int = 10,
    ) -> list[HoldingCtx]:
        rows = [
            HoldingCtx(
                ticker     = h.get("ticker") or "",
                name       = h.get("name") or "",
                weight_pct = round(float(h.get("weight") or 0), 2),
                value      = round(float(h.get("market_value") or 0), 2),
                pnl_pct    = round(float(h.get("pnl_pct") or 0), 2),
                sector     = h.get("sector") or "Unknown",
            )
            for h in enriched
        ]
        rows.sort(key=lambda x: x.weight_pct, reverse=True)
        return rows[:top_n]

    def _build_sector_context(self, sectors: list[SectorAllocation]) -> list[SectorCtx]:
        return [
            SectorCtx(
                sector=s.sector,
                weight_pct=s.weight_pct,
                num_holdings=s.num_holdings,
            )
            for s in sectors
        ]

    def _build_risk_context(
        self,
        risk_snapshot: Optional[RiskSnapshot],
        sectors: list[SectorCtx],
    ) -> dict:
        if risk_snapshot is None:
            return {
                "risk_profile":          "moderate",
                "hhi":                   0.0,
                "diversification_score": 50.0,
                "max_holding_ticker":    "—",
                "max_holding_weight":    0.0,
                "top3_weight":           0.0,
                "num_sectors":           0,
            }

        top_holding = risk_snapshot.top_holdings_by_weight[0] if risk_snapshot.top_holdings_by_weight else None

        return {
            "risk_profile":          risk_snapshot.risk_profile,
            "hhi":                   risk_snapshot.hhi,
            "diversification_score": risk_snapshot.diversification_score,
            "max_holding_ticker":    top_holding.ticker if top_holding else "—",
            "max_holding_weight":    risk_snapshot.max_holding_weight,
            "top3_weight":           risk_snapshot.top3_weight,
            "num_sectors":           len(sectors),
        }

    def _compute_source_metadata(
        self,
        holdings: list[Holding],
        portfolio_source: str,
    ) -> SourceMetadataCtx:
        """
        Compute data-quality statistics from the holdings' data_source field.
        Gracefully handles missing or null data_source values.
        """
        live_count        = 0
        db_only_count     = 0
        unavailable_count = 0
        mock_count        = 0

        for h in holdings:
            ds = getattr(h, "data_source", None) or ""
            if ds == "live":
                live_count += 1
            elif ds == "db_only":
                db_only_count += 1
            elif ds == "unavailable":
                unavailable_count += 1
            elif ds in ("mock", "mock_fallback"):
                mock_count += 1
            # "uploaded" counts as db_only for quality purposes
            elif ds == "uploaded":
                db_only_count += 1

        total = len(holdings)

        # Build a plain-English note for the LLM
        if portfolio_source == "live":
            if unavailable_count == 0 and db_only_count == 0:
                note = (
                    f"All {total} holding prices are live from Yahoo Finance. "
                    "Data is real-time (cached ≤60s)."
                )
            elif unavailable_count > 0:
                note = (
                    f"Live mode: {live_count}/{total} holdings have live prices. "
                    f"{unavailable_count} ticker(s) could not be fetched from Yahoo Finance — "
                    "their values use stored cost basis only. "
                    "Portfolio totals may be understated."
                )
            else:
                note = (
                    f"Live mode: {live_count}/{total} holdings have live prices, "
                    f"{db_only_count} use stored database prices (Yahoo Finance unavailable for those tickers)."
                )
        elif portfolio_source in ("mock", ""):
            note = (
                f"Mock mode: all {total} holdings use simulated data generated from "
                "a seeded Geometric Brownian Motion model. This is for development only."
            )
        elif portfolio_source == "uploaded":
            note = (
                f"Uploaded mode: {total} holdings loaded from a user-uploaded CSV. "
                "Prices reflect the upload timestamp unless live refresh has been run."
            )
        else:
            note = f"Data mode: {portfolio_source}. {total} holdings in portfolio."

        return SourceMetadataCtx(
            provider_mode     = portfolio_source or "unknown",
            live_count        = live_count,
            db_only_count     = db_only_count,
            unavailable_count = unavailable_count,
            mock_count        = mock_count,
            total_holdings    = total,
            data_quality_note = note,
        )

    def _compute_snapshot_history(
        self,
        portfolio_id: int,
    ) -> tuple[list[SnapshotCtx], Optional[RecentChangesCtx]]:
        """
        Fetch last 5 snapshots and compute a delta between the two most recent.
        Returns (snapshot_list, recent_changes | None).
        """
        snaps = (
            self.db.query(Snapshot)
            .filter(Snapshot.portfolio_id == portfolio_id)
            .order_by(Snapshot.captured_at.desc())
            .limit(5)
            .all()
        )

        snap_ctx = []
        for s in snaps:
            snap_ctx.append(SnapshotCtx(
                id           = s.id,
                label        = s.label,
                captured_at  = s.captured_at.isoformat() if s.captured_at else "",
                total_value  = round(float(s.total_value or 0), 2),
                num_holdings = int(s.num_holdings or 0),
            ))

        recent = None
        if len(snaps) >= 2:
            recent = self._compute_recent_changes(snaps[0], snaps[1])

        return snap_ctx, recent

    def _compute_recent_changes(
        self,
        snap_new: Snapshot,
        snap_old: Snapshot,
    ) -> Optional[RecentChangesCtx]:
        """
        Lightweight delta between two snapshots using their SnapshotHolding records.
        Falls back to value-only comparison if holding records are empty.
        """
        try:
            # Build ticker → SnapshotHolding maps from the selectin-loaded relationships
            new_h: dict[str, object] = {h.ticker: h for h in (snap_new.holdings or [])}
            old_h: dict[str, object] = {h.ticker: h for h in (snap_old.holdings or [])}

            added   = sorted(set(new_h) - set(old_h))
            removed = sorted(set(old_h) - set(new_h))

            increased = 0
            decreased = 0
            common    = set(new_h) & set(old_h)
            for ticker in common:
                new_qty = getattr(new_h[ticker], "quantity", 0) or 0
                old_qty = getattr(old_h[ticker], "quantity", 0) or 0
                if new_qty > old_qty:
                    increased += 1
                elif new_qty < old_qty:
                    decreased += 1

            val_new       = float(snap_new.total_value or 0)
            val_old       = float(snap_old.total_value or 0)
            val_delta     = val_new - val_old
            val_delta_pct = (val_delta / val_old * 100) if val_old > 0 else 0.0

            # Days apart
            days = 0
            if snap_new.captured_at and snap_old.captured_at:
                diff = snap_new.captured_at - snap_old.captured_at
                days = max(0, diff.days)

            return RecentChangesCtx(
                days_apart      = days,
                value_delta     = round(val_delta, 2),
                value_delta_pct = round(val_delta_pct, 2),
                added_tickers   = added,
                removed_tickers = removed,
                increased_count = increased,
                decreased_count = decreased,
            )
        except Exception as exc:
            logger.warning("Could not compute recent changes from snapshots: %s", exc)
            return None
