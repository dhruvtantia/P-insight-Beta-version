"""
Portfolio API Endpoints
------------------------
Handles portfolio data retrieval and file uploads.
All routes use the data provider pattern via dependency injection.
"""

import json

from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, HTTPException

from app.core.dependencies import DbSession, DataProvider
from app.services.portfolio_service import PortfolioService
from app.services.feature_registry import feature_dependency
from app.data_providers.file_provider import UPLOADS_PATH
from app.schemas.portfolio import (
    PortfolioSummary,
    HoldingBase,
    SectorAllocation,
    PortfolioFullResponse,
    UploadResponse,
)
from app.services.upload_file_utils import UploadServiceError
from app.services.upload_parse_service import parse_upload_file
from app.services.upload_v2_service import confirm_upload_v2_file, run_background_enrichment

router = APIRouter(prefix="/portfolio", tags=["Portfolio"])


@router.get(
    "/full",
    response_model=PortfolioFullResponse,
    summary="Get bundled portfolio intelligence",
    dependencies=[Depends(feature_dependency("portfolio_core"))],
)
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


@router.get(
    "/",
    response_model=list[HoldingBase],
    summary="Get all holdings",
    dependencies=[Depends(feature_dependency("portfolio_core"))],
)
async def get_holdings(db: DbSession, provider: DataProvider):
    """Return all portfolio holdings from the active data source."""
    service = PortfolioService(db, provider)
    return await service.get_holdings()


@router.get(
    "/summary",
    response_model=PortfolioSummary,
    summary="Get portfolio KPI summary",
    dependencies=[Depends(feature_dependency("portfolio_core"))],
)
async def get_summary(db: DbSession, provider: DataProvider):
    """Return high-level portfolio metrics: total value, P&L, sector concentration."""
    service = PortfolioService(db, provider)
    return await service.get_summary()


@router.get(
    "/sectors",
    response_model=list[SectorAllocation],
    summary="Get sector allocation",
    dependencies=[Depends(feature_dependency("portfolio_core"))],
)
async def get_sector_allocation(db: DbSession, provider: DataProvider):
    """Return portfolio allocation broken down by sector."""
    service = PortfolioService(db, provider)
    return await service.get_sector_allocation()


@router.post(
    "/upload",
    response_model=UploadResponse,
    summary="Upload portfolio file (deprecated)",
    deprecated=True,
    dependencies=[
        Depends(feature_dependency("portfolio_core")),
        Depends(feature_dependency("upload_import")),
    ],
)
async def upload_portfolio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> UploadResponse:
    """
    Deprecated one-step upload endpoint.

    Kept for backward compatibility, but delegates to the canonical V2
    parse/classify/persist/post-upload workflow using auto-detected columns.
    New clients should use /upload/parse then /upload/v2/confirm.
    """
    content = await file.read()
    try:
        parse_result = await parse_upload_file(file.filename, content)
    except UploadServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    if not parse_result.high_confidence:
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not safely auto-detect required upload columns. "
                "Use /api/v1/upload/parse and /api/v1/upload/v2/confirm with an explicit mapping."
            ),
        )

    try:
        result = await confirm_upload_v2_file(
            filename=file.filename,
            content=content,
            column_mapping=json.dumps(parse_result.detected_mapping),
            background_tasks=background_tasks,
            uploads_path=UPLOADS_PATH,
            enrichment_task=run_background_enrichment,
        )
    except UploadServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    parsed_count = result.rows_valid + result.rows_valid_with_warning

    return UploadResponse(
        success=True,
        filename=result.filename,
        holdings_parsed=parsed_count,
        message=(
            f"Successfully imported {parsed_count} holding(s). "
            "This endpoint is deprecated; use /upload/parse and /upload/v2/confirm."
        ),
    )
