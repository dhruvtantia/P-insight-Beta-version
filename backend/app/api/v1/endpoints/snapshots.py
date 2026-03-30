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

from fastapi import APIRouter, HTTPException
from typing import Optional

from app.core.dependencies import DbSession
from app.services.snapshot_service import SnapshotService
from app.schemas.snapshot import (
    SnapshotCreateRequest,
    SnapshotSummary,
    SnapshotDetail,
    PortfolioDeltaResponse,
)

router = APIRouter(tags=["Snapshots"])


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
) -> SnapshotSummary:
    """Capture the current state of a portfolio as a snapshot."""
    svc  = SnapshotService(db)
    label = body.label if body else None
    snap = svc.capture(portfolio_id, label=label)
    return SnapshotSummary.model_validate(snap)


@router.get(
    "/portfolios/{portfolio_id}/snapshots",
    response_model=list[SnapshotSummary],
    summary="List snapshots for a portfolio",
)
async def list_snapshots(portfolio_id: int, db: DbSession) -> list[SnapshotSummary]:
    svc = SnapshotService(db)
    return svc.list_summaries(portfolio_id)


# ─── Snapshot-level routes ────────────────────────────────────────────────────

@router.get(
    "/snapshots/{snapshot_id}",
    response_model=SnapshotDetail,
    summary="Get full snapshot detail",
)
async def get_snapshot(snapshot_id: int, db: DbSession) -> SnapshotDetail:
    svc    = SnapshotService(db)
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
    snapshot_a_id: int, snapshot_b_id: int, db: DbSession
) -> PortfolioDeltaResponse:
    """
    Returns a structured comparison of snapshot_a (older) vs snapshot_b (newer).
    Use snapshot_a_id=latest-1 and snapshot_b_id=latest for "what changed" analysis.
    """
    svc   = SnapshotService(db)
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
async def delete_snapshot(snapshot_id: int, db: DbSession):
    svc = SnapshotService(db)
    ok  = svc.repo.delete(snapshot_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Snapshot {snapshot_id} not found")
    return {"success": True, "deleted_id": snapshot_id}
