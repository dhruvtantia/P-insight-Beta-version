"""
Portfolio Management Schemas
------------------------------
Pydantic schemas for the portfolio CRUD endpoints.
Kept separate from schemas/portfolio.py which handles analytics responses.
"""

from __future__ import annotations

import json
from pydantic import BaseModel, Field, computed_field
from typing import Optional, Any
from datetime import datetime

# Sources that can be refreshed by the user (re-upload or broker sync)
_REFRESHABLE_SOURCES = {"uploaded", "broker"}


class PortfolioMeta(BaseModel):
    """Lightweight portfolio summary — no holdings included."""
    id:              int
    name:            str
    source:          str           # "mock" | "uploaded" | "manual" | "broker"
    is_active:       bool
    description:     Optional[str]      = None
    upload_filename: Optional[str]      = None
    num_holdings:    int                = 0
    last_synced_at:  Optional[datetime] = None
    source_metadata: Optional[str]      = None   # JSON string; parsed by frontend

    created_at:      datetime
    updated_at:      datetime

    model_config = {"from_attributes": True}

    @computed_field  # type: ignore[misc]
    @property
    def is_refreshable(self) -> bool:
        """True for sources where the user can re-import/sync data."""
        return self.source in _REFRESHABLE_SOURCES

    @computed_field  # type: ignore[misc]
    @property
    def source_meta_parsed(self) -> dict[str, Any]:
        """Convenience: source_metadata as a parsed dict (empty if null/invalid)."""
        if not self.source_metadata:
            return {}
        try:
            return json.loads(self.source_metadata)
        except Exception:
            return {}


class PortfolioListResponse(BaseModel):
    portfolios:    list[PortfolioMeta]
    active_id:     Optional[int] = None


class PortfolioRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class PortfolioCreateRequest(BaseModel):
    name:        str = Field(..., min_length=1, max_length=100)
    source:      str = Field("manual", description="manual | mock")
    description: Optional[str] = None


class ActivateResponse(BaseModel):
    success:          bool
    activated_id:     int
    activated_name:   str
    previously_active: Optional[int] = None


class DeleteResponse(BaseModel):
    success:  bool
    deleted_id: int
    message:  str


class RefreshResponse(BaseModel):
    """Returned by POST /portfolios/{id}/refresh — re-import into an existing portfolio."""
    success:             bool
    portfolio_id:        int
    filename:            str
    holdings_parsed:     int
    rows_skipped:        int
    pre_refresh_snapshot_id:  Optional[int] = None
    post_refresh_snapshot_id: Optional[int] = None
    message:             str
