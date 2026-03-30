"""
Snapshot Repository — Data Access Layer
-----------------------------------------
All database operations for Snapshot and SnapshotHolding.
"""

from sqlalchemy.orm import Session
from typing import Optional

from app.models.snapshot import Snapshot, SnapshotHolding


class SnapshotRepository:

    def __init__(self, db: Session):
        self.db = db

    def create(self, snapshot: Snapshot) -> Snapshot:
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)
        return snapshot

    def get_by_id(self, snapshot_id: int) -> Optional[Snapshot]:
        return self.db.query(Snapshot).filter(Snapshot.id == snapshot_id).first()

    def list_for_portfolio(
        self, portfolio_id: int, limit: int = 50
    ) -> list[Snapshot]:
        return (
            self.db.query(Snapshot)
            .filter(Snapshot.portfolio_id == portfolio_id)
            .order_by(Snapshot.captured_at.desc())
            .limit(limit)
            .all()
        )

    def get_latest_for_portfolio(self, portfolio_id: int) -> Optional[Snapshot]:
        return (
            self.db.query(Snapshot)
            .filter(Snapshot.portfolio_id == portfolio_id)
            .order_by(Snapshot.captured_at.desc())
            .first()
        )

    def count_for_portfolio(self, portfolio_id: int) -> int:
        return (
            self.db.query(Snapshot)
            .filter(Snapshot.portfolio_id == portfolio_id)
            .count()
        )

    def delete(self, snapshot_id: int) -> bool:
        s = self.get_by_id(snapshot_id)
        if not s:
            return False
        self.db.delete(s)
        self.db.commit()
        return True
