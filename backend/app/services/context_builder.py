"""
Portfolio Context Builder
--------------------------
Builds a clean, LLM-friendly context object from the database.

Responsibilities:
  - Query portfolio + holdings directly from DB (no async provider overhead)
  - Compute summary KPIs inline (total value/cost/pnl)
  - Compute sector allocation from holding values
  - Compute risk metrics inline (HHI, diversification score, concentration flags)
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

from app.models.portfolio import Portfolio, Holding
from app.models.snapshot  import Snapshot

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

    # ── Public entry point ────────────────────────────────────────────────────

    def build(self, portfolio_id: int) -> PortfolioContext:
        """
        Build context for the given portfolio_id.
        Returns a PortfolioContext with all sections populated (empty if no data).
        """
        portfolio = self.db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
        if not portfolio:
            raise ValueError(f"Portfolio {portfolio_id} not found")

        holdings = list(portfolio.holdings)  # loaded via selectin

        summary       = self._compute_summary(holdings)
        top_holdings  = self._compute_top_holdings(holdings, summary["total_value"])
        sectors       = self._compute_sectors(holdings, summary["total_value"])
        risk          = self._compute_risk(holdings, sectors, summary["total_value"])
        snap_ctx, recent = self._compute_snapshot_history(portfolio_id)

        return PortfolioContext(
            portfolio_id   = portfolio_id,
            portfolio_name = portfolio.name,
            source         = portfolio.source,
            **summary,
            top_holdings       = top_holdings,
            sector_allocation  = sectors,
            **risk,
            snapshot_count  = len(snap_ctx),
            snapshots       = snap_ctx,
            recent_changes  = recent,
        )

    # ── Private helpers ───────────────────────────────────────────────────────

    def _compute_summary(self, holdings: list[Holding]) -> dict:
        total_value = 0.0
        total_cost  = 0.0
        for h in holdings:
            price        = h.current_price or h.average_cost
            total_value += h.quantity * price
            total_cost  += h.quantity * h.average_cost
        total_pnl     = total_value - total_cost
        total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0.0
        return {
            "total_value":   round(total_value,   2),
            "total_cost":    round(total_cost,    2),
            "total_pnl":     round(total_pnl,     2),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "num_holdings":  len(holdings),
        }

    def _compute_top_holdings(
        self,
        holdings: list[Holding],
        total_value: float,
        top_n: int = 10,
    ) -> list[HoldingCtx]:
        rows = []
        for h in holdings:
            price      = h.current_price or h.average_cost
            value      = h.quantity * price
            cost       = h.quantity * h.average_cost
            weight_pct = (value / total_value * 100) if total_value > 0 else 0.0
            pnl_pct    = ((value - cost) / cost * 100) if cost > 0 else 0.0
            rows.append(HoldingCtx(
                ticker     = h.ticker,
                name       = h.name,
                weight_pct = round(weight_pct, 2),
                value      = round(value, 2),
                pnl_pct    = round(pnl_pct, 2),
                sector     = h.sector or "Unknown",
            ))
        rows.sort(key=lambda x: x.weight_pct, reverse=True)
        return rows[:top_n]

    def _compute_sectors(
        self,
        holdings: list[Holding],
        total_value: float,
    ) -> list[SectorCtx]:
        sector_values: dict[str, float] = {}
        sector_counts: dict[str, int]   = {}
        for h in holdings:
            price  = h.current_price or h.average_cost
            value  = h.quantity * price
            sector = h.sector or "Unknown"
            sector_values[sector] = sector_values.get(sector, 0.0) + value
            sector_counts[sector] = sector_counts.get(sector, 0) + 1
        result = []
        for sector, value in sorted(sector_values.items(), key=lambda x: -x[1]):
            weight_pct = (value / total_value * 100) if total_value > 0 else 0.0
            result.append(SectorCtx(
                sector       = sector,
                weight_pct   = round(weight_pct, 2),
                num_holdings = sector_counts[sector],
            ))
        return result

    def _compute_risk(
        self,
        holdings: list[Holding],
        sectors: list[SectorCtx],
        total_value: float,
    ) -> dict:
        if not holdings or total_value == 0:
            return {
                "risk_profile":          "moderate",
                "hhi":                   0.0,
                "diversification_score": 50.0,
                "max_holding_ticker":    "—",
                "max_holding_weight":    0.0,
                "top3_weight":           0.0,
                "num_sectors":           0,
            }

        weights: list[tuple[str, float]] = []
        for h in holdings:
            price  = h.current_price or h.average_cost
            value  = h.quantity * price
            w      = value / total_value
            weights.append((h.ticker, w))

        weights.sort(key=lambda x: -x[1])

        # HHI (sum of squared weights)
        hhi = sum(w ** 2 for _, w in weights)

        # Top holdings
        max_ticker = weights[0][0]
        max_weight = round(weights[0][1] * 100, 2)
        top3_weight = round(sum(w for _, w in weights[:3]) * 100, 2)

        # Diversification score: 0–100
        # Weight diversity component (70%): 1 - HHI normalised to equal-weight
        n          = len(weights)
        hhi_min    = 1 / n if n > 0 else 1
        hhi_max    = 1.0
        hhi_range  = hhi_max - hhi_min
        weight_div = (1 - (hhi - hhi_min) / hhi_range) if hhi_range > 0 else 0.5

        # Sector breadth component (30%): num sectors / 11 (max realistic)
        num_sectors   = len(sectors)
        sector_score  = min(num_sectors / 11, 1.0)

        div_score = round((weight_div * 70 + sector_score * 30), 1)
        div_score = max(0.0, min(100.0, div_score))

        # Risk profile classification (priority order)
        if max_weight >= 40 or hhi >= 0.30:
            profile = "highly_concentrated"
        elif any(s.weight_pct >= 60 for s in sectors):
            profile = "sector_concentrated"
        elif top3_weight >= 60 or num_sectors <= 2:
            profile = "aggressive"
        elif num_sectors >= 5 and hhi <= 0.12:
            profile = "conservative"
        else:
            profile = "moderate"

        return {
            "risk_profile":          profile,
            "hhi":                   round(hhi, 4),
            "diversification_score": div_score,
            "max_holding_ticker":    max_ticker,
            "max_holding_weight":    max_weight,
            "top3_weight":           top3_weight,
            "num_sectors":           num_sectors,
        }

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
