"""
BrokerConnection ORM Model
----------------------------
Tracks the state of a broker account connection for a portfolio.

One portfolio can have at most one active BrokerConnection at a time
(enforced at the service layer, not DB constraint, for flexibility).

connection_state values:
  "disconnected"  — never connected or explicitly disconnected
  "pending"       — connect() called, awaiting OAuth callback
  "connected"     — successfully authenticated and synced
  "syncing"       — a sync is in progress
  "error"         — last connect or sync failed; see sync_error

config_json stores non-secret broker config (account_id, region, etc.).
NEVER store API secrets or tokens in this field — use env vars or a KMS.
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.db.database import Base


class BrokerConnection(Base):
    __tablename__ = "broker_connections"

    id               = Column(Integer,      primary_key=True, index=True)
    portfolio_id     = Column(Integer,      ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False, index=True)
    broker_name      = Column(String(50),   nullable=False)          # "zerodha" | "ibkr"
    connection_state = Column(String(20),   nullable=False, default="disconnected")
    account_id       = Column(String(100),  nullable=True)           # broker account reference
    last_sync_at     = Column(DateTime,     nullable=True)
    sync_error       = Column(Text,         nullable=True)           # last error message
    # Non-secret config stored as JSON — region, account_type, etc.
    # API keys / secrets MUST NOT be stored here.
    config_json      = Column(Text,         nullable=True)

    created_at       = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at       = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return (
            f"<BrokerConnection id={self.id} portfolio_id={self.portfolio_id} "
            f"broker={self.broker_name!r} state={self.connection_state!r}>"
        )
