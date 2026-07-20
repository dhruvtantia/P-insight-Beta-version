"""
Snapshot Endpoints
-------------------
Create, list, fetch, and diff portfolio snapshots.

Routes:
  POST /portfolios/{id}/snapshot              create a snapshot of portfolio {id}
  GET  /portfolios/{id}/snapshots             list snapshot summaries for portfolio {id}
  GET  /snapshots/{id}                        fetch full snapshot detail
  GET  /snapshots/{a}/delta/{b}              compute delta between two snapshots
  DELETE /snapshots/{id}                      delete a snapshot
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from app.core.dependencies import DbSession, CurrentUserId, assert_portfolio_owned
from app.services.snapshot_service import SnapshotService
from app.services.feature_registry import feature_dependency
from app.schemas.snapshot import (
    SnapshotCreateRequest,
    SnapshotSummary,
    SnapshotDetail,
    PortfolioDeltaResponse,
)

router = APIRouter(
    tags=["Snapshots"],
    dependencies=[Depends(feature_dependency("history"))],
)


# ─── Per-portfolio snapshot routes ────────────────────────────────────────────

@router.post(
    "/portfolios/{portfolio_id}/snapshot",
    response_model=SnapshotSummary,
    summary="Create a portfolio snapshot",
)
async def create_snapshot(
    portfolio_id: int,
    body: Optional[SnapshotCreateRequest] = None,
    db: DbSession = ...,
    user_id: CurrentUserId = None,
) -> SnapshotSummary:
    """Capture the current state of a portfolio as a snapshot."""
    assert_portfolio_owned(db, user_id, portfolio_id)
    svc  = SnapshotService(db)
    label = body.label if body else None
    snap = svc.capture(portfolio_id, label=label)
    return SnapshotSummary.model_validate(snap)


@router.get(
    "/portfolios/{portfolio_id}/snapshots",
    response_model=list[SnapshotSummary],
    summary="List snapshots for a portfolio",
)
async def list_snapshots(
    portfolio_id: int, db: DbSession, user_id: CurrentUserId = None
) -> list[SnapshotSummary]:
    assert_portfolio_owned(db, user_id, portfolio_id)
    svc = SnapshotService(db)
    return svc.list_summaries(portfolio_id)


# ─── Snapshot-level routes ────────────────────────────────────────────────────

@router.get(
    "/snapshots/{snapshot_id}",
    response_model=SnapshotDetail,
    summary="Get full snapshot detail",
)
async def get_snapshot(
    snapshot_id: int, db: DbSession, user_id: CurrentUserId = None
) -> SnapshotDetail:
    svc      = SnapshotService(db)
    snap_row = svc.repo.get_by_id(snapshot_id)
    if snap_row is None:
        raise HTTPException(status_code=404, detail=f"Snapshot {snapshot_id} not found")
    assert_portfolio_owned(db, user_id, snap_row.portfolio_id)
    detail = svc.get_detail(snapshot_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Snapshot {snapshot_id} not found")
    return detail


@router.get(
    "/snapshots/{snapshot_a_id}/delta/{snapshot_b_id}",
    response_model=PortfolioDeltaResponse,
    summary="Compute delta between two snapshots",
)
async def snapshot_delta(
    snapshot_a_id: int, snapshot_b_id: int, db: DbSession, user_id: CurrentUserId = None
) -> PortfolioDeltaResponse:
    """
    Returns a structured comparison of snapshot_a (older) vs snapshot_b (newer).
    Use snapshot_a_id=latest-1 and snapshot_b_id=latest for "what changed" analysis.
    """
    svc   = SnapshotService(db)
    # Ownership: the user must own the portfolio behind both snapshots.
    for sid in (snapshot_a_id, snapshot_b_id):
        row = svc.repo.get_by_id(sid)
        if row is None:
            raise HTTPException(status_code=404, detail=f"Snapshot {sid} not found")
        assert_portfolio_owned(db, user_id, row.portfolio_id)
    delta = svc.compute_delta(snapshot_a_id, snapshot_b_id)
    if delta is None:
        raise HTTPException(
            status_code=404,
            detail=f"One or both snapshots not found ({snapshot_a_id}, {snapshot_b_id})",
        )
    return delta


@router.delete(
    "/snapshots/{snapshot_id}",
    summary="Delete a snapshot",
)
async def delete_snapshot(snapshot_id: int, db: DbSession, user_id: CurrentUserId = None):
    svc      = SnapshotService(db)
    snap_row = svc.repo.get_by_id(snapshot_id)
    if snap_row is None:
        raise HTTPException(status_code=404, detail=f"Snapshot {snapshot_id} not found")
    assert_portfolio_owned(db, user_id, snap_row.portfolio_id)
    ok  = svc.repo.delete(snapshot_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Snapshot {snapshot_id} not found")
    return {"success": True, "deleted_id": snapshot_id}
