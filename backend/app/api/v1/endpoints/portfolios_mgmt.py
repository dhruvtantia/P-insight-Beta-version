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

import json
import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.dependencies import DbSession
from app.services.portfolio_manager import PortfolioManagerService
from app.schemas.portfolio_mgmt import (
    PortfolioMeta,
    PortfolioListResponse,
    PortfolioRenameRequest,
    PortfolioCreateRequest,
    ActivateResponse,
    DeleteResponse,
    RefreshResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolios", tags=["Portfolios"])

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
MAX_FILE_SIZE_MB = 10


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
)
async def refresh_portfolio(
    portfolio_id: int,
    db: DbSession,
    file: UploadFile = File(...),
    column_mapping: str = Form(..., description="JSON: canonical_field → original_column_name"),
) -> RefreshResponse:
    """
    Re-import a new CSV/Excel file into an existing uploaded portfolio.

    This preserves history by creating a pre- and post-refresh snapshot,
    then replaces all holdings with the new file's data.

    Architecture note: this is the same as /upload/confirm but targets an
    existing portfolio rather than creating a new one — designed to support
    future broker-sync refresh flows.
    """
    # Validate file type
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{suffix}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )

    # Parse mapping
    try:
        col_map: dict = json.loads(column_mapping)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid column_mapping JSON: {exc}")

    # Write upload to temp file
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_FILE_SIZE_MB} MB)")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(content)
        tmp.flush()
        tmp_path = Path(tmp.name)
    finally:
        tmp.close()

    try:
        from app.ingestion.normalizer import read_file_as_dataframe, normalize_to_holdings
        df = read_file_as_dataframe(tmp_path)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read file: {exc}")
    finally:
        tmp_path.unlink(missing_ok=True)

    if df.empty:
        raise HTTPException(status_code=422, detail="The file has no data rows.")

    holdings, skipped = normalize_to_holdings(df, col_map)
    if not holdings:
        raise HTTPException(status_code=422, detail="No valid rows could be parsed.")

    filename = file.filename or "upload"
    svc = PortfolioManagerService(db)

    try:
        p, pre_snap_id, post_snap_id = svc.refresh_portfolio(portfolio_id, holdings, filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Update in-memory FileDataProvider cache if this is the active portfolio
    if p.is_active:
        try:
            import app.data_providers.file_provider as _fp_module
            _fp_module._uploaded_holdings = list(holdings)
        except Exception as exc:
            logger.warning("Could not update FileDataProvider cache: %s", exc)

    return RefreshResponse(
        success=True,
        portfolio_id=p.id,
        filename=filename,
        holdings_parsed=len(holdings),
        rows_skipped=len(skipped),
        pre_refresh_snapshot_id=pre_snap_id,
        post_refresh_snapshot_id=post_snap_id,
        message=(
            f"Refreshed {len(holdings)} holding(s) from '{filename}'. "
            + (f"{len(skipped)} row(s) skipped." if skipped else "All rows imported.")
        ),
    )


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
