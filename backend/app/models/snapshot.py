"""
Snapshot ORM Models
--------------------
A Snapshot captures the full state of a portfolio at a point in time.
SnapshotHolding records each individual position within that snapshot.

Design notes:
  - Summary metrics are stored as flat columns (fast queries) plus a JSON blob
    for richer/extensible data (sector weights, risk metrics).
  - SnapshotHolding records are immutable after creation.
  - Snapshots can be labelled ("Before rebalance", "Q1 2025") or auto-named
    by the service layer ("Auto — 2025-01-15 14:32").
  - The delta computation in app/lib/delta.py takes two snapshots and produces
    a PortfolioDelta — no DB reads required beyond loading the two snapshots.

Future hooks:
  - advisor_context: snapshots feed portfolio history into the AI advisor
  - broker sync: auto-snapshot can be triggered on each broker data pull
  - "what changed": delta shown on dashboard between current state and last snapshot
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.db.database import Base


class Snapshot(Base):
    __tablename__ = "snapshots"

    id           = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False, index=True)

    # Human-readable label ("Auto — upload", "Manual", "Before rebalance", etc.)
    label        = Column(String(200), nullable=True)
    captured_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    # ── Flat summary metrics (for fast listing without loading holdings) ────────
    total_value    = Column(Float, nullable=True)
    total_cost     = Column(Float, nullable=True)
    total_pnl      = Column(Float, nullable=True)
    total_pnl_pct  = Column(Float, nullable=True)
    num_holdings   = Column(Integer, nullable=True)
    top_sector     = Column(String(100), nullable=True)

    # ── JSON blobs for richer data (sector weights, risk metrics, etc.) ────────
    # Stored as text; deserialised in the service layer.
    # Format: {"IT": 35.2, "Banking": 20.1, ...}
    sector_weights_json = Column(Text, nullable=True)
    # Format: {"hhi": 0.12, "diversification_score": 72, "max_holding_weight": 22.1}
    risk_metrics_json   = Column(Text, nullable=True)
    # Format: [{"ticker": "TCS", "weight": 18.2, "sector": "IT"}, ...]
    top_holdings_json   = Column(Text, nullable=True)

    # ── Relationships ──────────────────────────────────────────────────────────
    portfolio = relationship("Portfolio", back_populates="snapshots")
    holdings  = relationship(
        "SnapshotHolding",
        back_populates="snapshot",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<Snapshot id={self.id} portfolio_id={self.portfolio_id} "
            f"label={self.label!r} captured_at={self.captured_at}>"
        )


class SnapshotHolding(Base):
    """
    Immutable record of one holding within a snapshot.
    Stores both the raw position data and the computed metrics at snapshot time.
    """
    __tablename__ = "snapshot_holdings"

    id          = Column(Integer, primary_key=True, index=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False, index=True)

    ticker       = Column(String(20),  nullable=False)
    name         = Column(String(150), nullable=True)
    quantity     = Column(Float,       nullable=True)
    average_cost = Column(Float,       nullable=True)
    market_value = Column(Float,       nullable=True)   # quantity × price at snapshot time
    weight_pct   = Column(Float,       nullable=True)   # % of total portfolio value
    sector       = Column(String(100), nullable=True)

    snapshot = relationship("Snapshot", back_populates="holdings")

    def __repr__(self) -> str:
        return f"<SnapshotHolding ticker={self.ticker!r} weight={self.weight_pct}%>"
