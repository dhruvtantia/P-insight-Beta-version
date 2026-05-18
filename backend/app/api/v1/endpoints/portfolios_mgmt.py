"""
Portfolio Management Endpoints
--------------------------------
CRUD for portfolios as first-class entities: list, activate, rename, delete, create.
Separate from portfolio.py which handles analytics/data-mode portfolio reads.

Routes:
  GET    /portfolios/                     list all portfolios + active_id
  GET    /portfolios/active               get active portfolio metadata
  GET    /portfolios/{id}                 get a specific portfolio metadata
  POST   /portfolios/                     create a manual portfolio
  POST   /portfolios/{id}/activate        set a portfolio as active
  POST   /portfolios/{id}/refresh         re-import holdings from a new file upload
  PATCH  /portfolios/{id}/rename          rename a portfolio
  DELETE /portfolios/{id}                 delete a portfolio
"""

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile

from app.core.dependencies import DbSession
from app.services.portfolio_manager import PortfolioManagerService
from app.services.feature_registry import feature_dependency
from app.services.upload_file_utils import UploadServiceError
from app.services.upload_v2_service import refresh_upload_v2_file, run_background_enrichment
from app.schemas.portfolio_mgmt import (
    PortfolioMeta,
    PortfolioListResponse,
    PortfolioRenameRequest,
    PortfolioCreateRequest,
    ActivateResponse,
    DeleteResponse,
    RefreshResponse,
)

router = APIRouter(
    prefix="/portfolios",
    tags=["Portfolios"],
    dependencies=[Depends(feature_dependency("portfolio_core"))],
)


# ─── List + get ───────────────────────────────────────────────────────────────

@router.get("/", response_model=PortfolioListResponse, summary="List all portfolios")
async def list_portfolios(db: DbSession) -> PortfolioListResponse:
    """Return all saved portfolios and indicate which is currently active."""
    svc = PortfolioManagerService(db)
    return svc.list_portfolios()


@router.get("/active", response_model=PortfolioMeta, summary="Get active portfolio")
async def get_active_portfolio(db: DbSession) -> PortfolioMeta:
    """Return metadata for the currently active portfolio."""
    svc = PortfolioManagerService(db)
    active = svc.get_active()
    if active is None:
        raise HTTPException(status_code=404, detail="No active portfolio found")
    return svc._to_meta(active)


@router.get("/{portfolio_id}", response_model=PortfolioMeta, summary="Get a portfolio")
async def get_portfolio(portfolio_id: int, db: DbSession) -> PortfolioMeta:
    svc = PortfolioManagerService(db)
    p   = svc.get_by_id(portfolio_id)
    if p is None:
        raise HTTPException(status_code=404, detail=f"Portfolio {portfolio_id} not found")
    return svc._to_meta(p)


# ─── Create ───────────────────────────────────────────────────────────────────

@router.post("/", response_model=PortfolioMeta, summary="Create a manual portfolio")
async def create_portfolio(body: PortfolioCreateRequest, db: DbSession) -> PortfolioMeta:
    """Create a new empty portfolio with a given name."""
    svc = PortfolioManagerService(db)
    p   = svc.create_manual(name=body.name, description=body.description)
    return svc._to_meta(p)


# ─── Activate ─────────────────────────────────────────────────────────────────

@router.post("/{portfolio_id}/activate", response_model=ActivateResponse, summary="Activate a portfolio")
async def activate_portfolio(portfolio_id: int, db: DbSession) -> ActivateResponse:
    """Set the specified portfolio as active, deactivating all others."""
    svc = PortfolioManagerService(db)
    try:
        return svc.activate(portfolio_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ─── Refresh (re-import) ──────────────────────────────────────────────────────

@router.post(
    "/{portfolio_id}/refresh",
    response_model=RefreshResponse,
    summary="Re-import holdings into an existing portfolio",
    dependencies=[Depends(feature_dependency("upload_import"))],
)
async def refresh_portfolio(
    portfolio_id: int,
    background_tasks: BackgroundTasks,
    db: DbSession,
    file: UploadFile = File(...),
    column_mapping: str = Form(..., description="JSON: canonical_field → original_column_name"),
) -> RefreshResponse:
    """
    Re-import a new CSV/Excel file into an existing uploaded portfolio.

    This preserves history by creating a pre- and post-refresh snapshot,
    then replaces all holdings with the new file's data.

    Architecture note: this uses the same V2 import boundary as
    /upload/v2/confirm, but targets an existing portfolio rather than creating
    a new one.
    """
    try:
        return await refresh_upload_v2_file(
            portfolio_id=portfolio_id,
            filename=file.filename,
            content=await file.read(),
            column_mapping=column_mapping,
            background_tasks=background_tasks,
            db=db,
            enrichment_task=run_background_enrichment,
        )
    except UploadServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


# ─── Rename / Delete ──────────────────────────────────────────────────────────

@router.patch("/{portfolio_id}/rename", response_model=PortfolioMeta, summary="Rename a portfolio")
async def rename_portfolio(
    portfolio_id: int, body: PortfolioRenameRequest, db: DbSession
) -> PortfolioMeta:
    svc  = PortfolioManagerService(db)
    meta = svc.rename(portfolio_id, body.name)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Portfolio {portfolio_id} not found")
    return meta


@router.delete("/{portfolio_id}", response_model=DeleteResponse, summary="Delete a portfolio")
async def delete_portfolio(portfolio_id: int, db: DbSession) -> DeleteResponse:
    svc = PortfolioManagerService(db)
    return svc.delete(portfolio_id)
