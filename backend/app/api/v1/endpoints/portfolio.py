"""
Portfolio API Endpoints
------------------------
Handles portfolio data retrieval and file uploads.
All routes use the data provider pattern via dependency injection.
"""

import os
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import DbSession, DataProvider
from app.services.portfolio_service import PortfolioService
from app.data_providers.file_provider import FileDataProvider
from app.schemas.portfolio import (
    PortfolioSummary,
    HoldingBase,
    SectorAllocation,
    PortfolioFullResponse,
    UploadResponse,
)

router = APIRouter(prefix="/portfolio", tags=["Portfolio"])

UPLOADS_PATH = Path(__file__).parent.parent.parent.parent.parent / "uploads"


@router.get("/full", response_model=PortfolioFullResponse, summary="Get bundled portfolio intelligence")
async def get_portfolio_full(db: DbSession, provider: DataProvider):
    """
    Bundled endpoint — returns holdings (with pre-computed metrics), summary,
    and sector allocation in a single response.

    Holdings include market_value, pnl, pnl_pct, and weight, removing the need
    for client-side recomputation.

    Replaces three separate calls to /portfolio/, /portfolio/summary, and
    /portfolio/sectors.  Old endpoints remain available for backward compatibility.
    """
    service = PortfolioService(db, provider)
    return await service.get_full()


@router.get("/", response_model=list[HoldingBase], summary="Get all holdings")
async def get_holdings(db: DbSession, provider: DataProvider):
    """Return all portfolio holdings from the active data source."""
    service = PortfolioService(db, provider)
    return await service.get_holdings()


@router.get("/summary", response_model=PortfolioSummary, summary="Get portfolio KPI summary")
async def get_summary(db: DbSession, provider: DataProvider):
    """Return high-level portfolio metrics: total value, P&L, sector concentration."""
    service = PortfolioService(db, provider)
    return await service.get_summary()


@router.get("/sectors", response_model=list[SectorAllocation], summary="Get sector allocation")
async def get_sector_allocation(db: DbSession, provider: DataProvider):
    """Return portfolio allocation broken down by sector."""
    service = PortfolioService(db, provider)
    return await service.get_sector_allocation()


@router.post("/upload", response_model=UploadResponse, summary="Upload portfolio file")
async def upload_portfolio(file: UploadFile = File(...)):
    """
    Upload an Excel (.xlsx) or CSV (.csv) portfolio file.

    Required columns: ticker, name, quantity, average_cost
    Optional columns: current_price, sector, asset_class, currency

    After upload, switch Data Mode to 'uploaded' to use this data.
    """
    allowed_types = {
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Upload a .csv or .xlsx file.",
        )

    # Save to uploads directory
    UPLOADS_PATH.mkdir(parents=True, exist_ok=True)
    save_path = UPLOADS_PATH / f"portfolio_{file.filename}"

    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Parse and cache in FileDataProvider
    try:
        holdings = FileDataProvider.load_from_file(str(save_path))
    except (ValueError, Exception) as e:
        os.remove(save_path)
        raise HTTPException(status_code=422, detail=str(e))

    return UploadResponse(
        success=True,
        filename=file.filename,
        holdings_parsed=len(holdings),
        message=f"Successfully parsed {len(holdings)} holdings. Switch to 'Uploaded' mode to view.",
    )
