"""
Background Job Status Service
-----------------------------
Read-only status helpers for workflows that continue after the request returns.

This keeps route files from opening their own database sessions and gives upload
status polling a single service boundary.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.repositories.portfolio_repository import PortfolioRepository
from app.schemas.upload_v2 import V2StatusResponse
from app.services.upload_v2_service import get_enrichment_status


class JobStatusNotFoundError(ValueError):
    """Raised when a portfolio is absent or inaccessible to the current owner."""


class JobStatusService:
    def __init__(self, db: Session):
        self.db = db

    def get_upload_enrichment_status(
        self, portfolio_id: int, *, user_id: int | None
    ) -> V2StatusResponse:
        """Require explicit owner context; None preserves auth-disabled local mode."""
        portfolio = PortfolioRepository(self.db, user_id=user_id).get_by_id(portfolio_id)
        if portfolio is None:
            raise JobStatusNotFoundError(f"Portfolio {portfolio_id} not found")

        return get_enrichment_status(portfolio_id, self.db)
