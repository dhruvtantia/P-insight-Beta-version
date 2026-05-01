"""
Background Job Status Service
-----------------------------
Read-only status helpers for workflows that continue after the request returns.

This keeps route files from opening their own database sessions and gives upload
status polling a single service boundary.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.portfolio import Portfolio
from app.schemas.upload_v2 import V2StatusResponse
from app.services.upload_v2_service import get_enrichment_status


class JobStatusNotFoundError(ValueError):
    """Raised when the requested job owner does not exist."""


class JobStatusService:
    def __init__(self, db: Session):
        self.db = db

    def get_upload_enrichment_status(self, portfolio_id: int) -> V2StatusResponse:
        portfolio = (
            self.db.query(Portfolio)
            .filter(Portfolio.id == portfolio_id)
            .first()
        )
        if portfolio is None:
            raise JobStatusNotFoundError(f"Portfolio {portfolio_id} not found")

        return get_enrichment_status(portfolio_id, self.db)
