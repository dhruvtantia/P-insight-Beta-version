"""
Portfolio Upload Endpoints — Flexible Ingestion Pipeline
---------------------------------------------------------
Two-step upload flow:

  POST /upload/parse
    Accept CSV or Excel file, run column detection, return:
      - detected column mapping (canonical → original column name)
      - list of all original column names
      - preview of first 6 rows in canonical form
      - overall confidence flag

  POST /upload/confirm
    Accept CSV or Excel file + column_mapping JSON form field.
    Normalize all rows, persist the portfolio to the database,
    save a canonical CSV to uploads/, and return summary.

Both endpoints accept multipart/form-data.
"""

from __future__ import annotations

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)

from app.core.dependencies import DbSession, CurrentUserId
from app.data_providers.file_provider import UPLOADS_PATH
from app.schemas.upload import ConfirmResponse, ParseResponse
from app.schemas.upload_v2 import V2ConfirmResponse, V2StatusResponse
from app.services.job_status_service import JobStatusNotFoundError, JobStatusService
from app.services.upload_confirm_service import confirm_legacy_upload
from app.services.upload_file_utils import UploadServiceError
from app.services.upload_parse_service import parse_upload_file
from app.services.upload_v2_service import (
    confirm_upload_v2_file,
    run_background_enrichment,
)
from app.services.feature_registry import feature_dependency

router = APIRouter(
    prefix="/upload",
    tags=["Upload"],
    dependencies=[Depends(feature_dependency("upload_import"))],
)


def _raise_upload_error(exc: UploadServiceError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/parse", response_model=ParseResponse, summary="Parse and detect columns")
async def parse_upload(file: UploadFile = File(...)) -> ParseResponse:
    """
    Step 1 of the upload wizard.

    Reads the file, auto-detects column roles, returns a preview.
    No data is saved at this stage.
    """
    try:
        return await parse_upload_file(file.filename, await file.read())
    except UploadServiceError as exc:
        _raise_upload_error(exc)


@router.post("/confirm", response_model=ConfirmResponse, summary="Import portfolio from upload")
async def confirm_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    column_mapping: str = Form(..., description="JSON object: canonical_field → original_column_name"),
) -> ConfirmResponse:
    """
    Step 2 of the upload wizard.

    Accepts the file again plus the confirmed column mapping (possibly edited by the user).
    Normalises all rows, validates them, persists them to the database,
    and saves a canonical CSV for compatibility.

    The column_mapping JSON looks like:
      {"ticker": "Symbol", "name": "Company Name", "quantity": "Qty", ...}
    """
    try:
        return await confirm_legacy_upload(
            filename=file.filename,
            content=await file.read(),
            column_mapping=column_mapping,
            background_tasks=background_tasks,
            uploads_path=UPLOADS_PATH,
        )
    except UploadServiceError as exc:
        _raise_upload_error(exc)


# ─── Spec-compliant status endpoint (query param) ────────────────────────────
#
# GET /upload/status?portfolio_id=17
#
# This is the URL contract specified in the module spec.
# Both status endpoint variants delegate to JobStatusService and return the same
# V2StatusResponse shape.


@router.get(
    "/status",
    response_model=V2StatusResponse,
    summary="Poll enrichment status for an uploaded portfolio (spec-compliant URL)",
)
async def get_upload_status(
    db: DbSession,
    portfolio_id: int = Query(..., description="ID of the portfolio to check"),
) -> V2StatusResponse:
    """
    Spec-required query-param variant of the enrichment status endpoint.

    Returns per-holding enrichment state from the DB.
    Identical response shape to GET /upload/v2/status/{portfolio_id}.
    Poll after POST /upload/v2/confirm to track background enrichment progress.
    """
    try:
        return JobStatusService(db).get_upload_enrichment_status(portfolio_id)
    except JobStatusNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not read enrichment status: {exc}",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Upload V2 — Fast-path routes
# ═══════════════════════════════════════════════════════════════════════════════
#
# These routes replace the slow inline-enrichment pattern with a two-phase
# approach: base persist (fast, < 2 s) + background enrichment (async).
#
# The legacy /parse and /confirm routes above remain completely unchanged for
# backward compatibility.
#
# New routes:
#   POST /upload/v2/confirm          — fast import; enrichment fires in background
#   GET  /upload/v2/status/{id}      — poll enrichment progress by portfolio_id


@router.post(
    "/v2/confirm",
    response_model=V2ConfirmResponse,
    summary="[V2] Import portfolio — fast path with background enrichment",
)
async def confirm_upload_v2(
    background_tasks: BackgroundTasks,
    user_id: CurrentUserId = None,
    file: UploadFile = File(...),
    column_mapping: str = Form(
        ..., description="JSON object: canonical_field → original_column_name"
    ),
) -> V2ConfirmResponse:
    """
    Upload V2 fast-path confirm.

    Accepts the same file + column_mapping as the legacy /confirm endpoint.
    Returns in < 2 s (base persist only).  Enrichment runs in the background.

    Response includes:
      - portfolio_id for status polling
      - row classification (valid / valid_with_warning / invalid)
      - rejected_rows and warning_rows details
      - enrichment_complete: false (poll /v2/status/{portfolio_id} for progress)
      - portfolio_usable: true (dashboard/holdings/fundamentals work immediately)
    """
    try:
        return await confirm_upload_v2_file(
            filename=file.filename,
            content=await file.read(),
            column_mapping=column_mapping,
            background_tasks=background_tasks,
            uploads_path=UPLOADS_PATH,
            enrichment_task=run_background_enrichment,
            user_id=user_id,
        )
    except UploadServiceError as exc:
        _raise_upload_error(exc)


@router.get(
    "/v2/status/{portfolio_id}",
    response_model=V2StatusResponse,
    summary="[V2] Poll enrichment status for an uploaded portfolio",
)
async def get_upload_status_v2(portfolio_id: int, db: DbSession) -> V2StatusResponse:
    """
    Returns current per-holding enrichment state from the DB.

    Poll this endpoint after /v2/confirm to track background enrichment progress.
    enrichment_complete becomes True once all holdings have left "pending" state.
    Typically completes within 10–60 seconds depending on portfolio size and
    yfinance response times.
    """
    try:
        return JobStatusService(db).get_upload_enrichment_status(portfolio_id)
    except JobStatusNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not read enrichment status: {exc}",
        )
