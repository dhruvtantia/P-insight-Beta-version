"""
SQLAlchemy ORM Models — Portfolio & Holdings
----------------------------------------------
These define the database table structure.
Schemas (Pydantic) in schemas/portfolio.py define the API request/response shapes.
Keep models and schemas separate — they serve different purposes.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.db.database import Base


class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, default="My Portfolio")
    source = Column(String(20), nullable=False, default="mock")
    # source values: "mock" | "uploaded" | "manual" | "live" | "broker"

    # New in Phase 5 — Persistence
    is_active    = Column(Boolean, nullable=False, default=False)
    description  = Column(Text, nullable=True)
    upload_filename = Column(String(255), nullable=True)  # original filename for uploaded portfolios

    # New in Final Hardening — Source lifecycle
    # last_synced_at: set on upload/confirm and broker sync; null for mock/manual
    last_synced_at  = Column(DateTime, nullable=True)
    # source_metadata: JSON-encoded dict with source-specific context
    #   uploaded: {"filename": "…", "row_count": 25}
    #   broker (future): {"broker_name": "zerodha", "account_id": "…", "sync_frequency": "daily"}
    source_metadata = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    holdings = relationship(
        "Holding",
        back_populates="portfolio",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    snapshots = relationship(
        "Snapshot",
        back_populates="portfolio",
        cascade="all, delete-orphan",
        lazy="dynamic",
        order_by="Snapshot.captured_at.desc()",
    )

    def __repr__(self) -> str:
        return f"<Portfolio id={self.id} name={self.name!r} source={self.source!r} active={self.is_active}>"


class Holding(Base):
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False)

    ticker = Column(String(20), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    quantity = Column(Float, nullable=False)
    average_cost = Column(Float, nullable=False)
    current_price = Column(Float, nullable=True)
    sector = Column(String(100), nullable=True)
    asset_class = Column(String(50), nullable=True, default="Equity")
    currency = Column(String(10), nullable=True, default="INR")
    notes = Column(Text, nullable=True)

    portfolio = relationship("Portfolio", back_populates="holdings")

    def __repr__(self) -> str:
        return f"<Holding ticker={self.ticker!r} qty={self.quantity}>"


class Watchlist(Base):
    """
    Watchlist — Phase 1
    -------------------
    Tracks non-portfolio stocks for monitoring, research, or future what-if analysis.

    New columns vs. scaffold:
      tag          — user-defined conviction category (e.g. "High Conviction", "Research")
      sector       — user-assigned sector label for quick visual grouping
      target_price — optional user-entered price reference (not a live quote)
    """
    __tablename__ = "watchlist"

    id           = Column(Integer,     primary_key=True, index=True)
    ticker       = Column(String(20),  nullable=False, unique=True, index=True)
    name         = Column(String(150), nullable=True)
    tag          = Column(String(50),  nullable=True, default="General")
    sector       = Column(String(100), nullable=True)
    target_price = Column(Float,       nullable=True)
    notes        = Column(Text,        nullable=True)
    added_at     = Column(DateTime,    default=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<Watchlist ticker={self.ticker!r} tag={self.tag!r}>"
