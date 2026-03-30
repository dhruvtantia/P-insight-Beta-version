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
    Normalize all rows, update the FileDataProvider in-memory cache,
    save a canonical CSV to uploads/, return summary.

Both endpoints accept multipart/form-data.
"""

from __future__ import annotations

import json
import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from typing import Optional

from app.ingestion.column_detector import detect_columns, REQUIRED_FIELDS
from app.ingestion.normalizer import (
    read_file_as_dataframe,
    preview_rows,
    normalize_to_holdings,
)
from app.data_providers.file_provider import FileDataProvider, UPLOADS_PATH

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/upload", tags=["Upload"])

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
MAX_FILE_SIZE_MB = 10


# ─── Response schemas ─────────────────────────────────────────────────────────

class ParseResponse(BaseModel):
    """Result of the /parse step — returned to the frontend for mapping/preview."""
    column_names:     list[str]                      # all original column names
    detected_mapping: dict[str, Optional[str]]       # canonical → original col (None = not found)
    ambiguous_fields: list[str]                      # fields matched via substring (less certain)
    high_confidence:  bool                           # True = all required cols auto-detected
    preview_rows:     list[dict]                     # first ~6 rows in canonical form
    row_count:        int                            # total data rows in file


class ConfirmResponse(BaseModel):
    """Result of the /confirm step — returned after saving the normalised portfolio."""
    success:          bool
    filename:         str
    holdings_parsed:  int
    rows_skipped:     int
    skipped_details:  list[dict]                     # [{row_index, raw_ticker, error}, ...]
    message:          str


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _validate_file(file: UploadFile) -> None:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{suffix}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )


async def _save_temp(file: UploadFile) -> Path:
    """Stream the upload to a named temp file and return its path."""
    suffix = Path(file.filename or "upload").suffix.lower()
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        content = await file.read()
        if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB} MB.",
            )
        tmp.write(content)
        tmp.flush()
        return Path(tmp.name)
    finally:
        tmp.close()


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/parse", response_model=ParseResponse, summary="Parse and detect columns")
async def parse_upload(file: UploadFile = File(...)) -> ParseResponse:
    """
    Step 1 of the upload wizard.

    Reads the file, auto-detects column roles, returns a preview.
    No data is saved at this stage.
    """
    _validate_file(file)
    tmp_path = await _save_temp(file)

    try:
        df = read_file_as_dataframe(tmp_path)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read file: {exc}")
    finally:
        tmp_path.unlink(missing_ok=True)

    if df.empty or len(df.columns) == 0:
        raise HTTPException(status_code=422, detail="The uploaded file is empty.")

    col_names = list(df.columns)
    result = detect_columns(col_names)

    # Build a best-effort preview using whatever mapping was detected
    rows = preview_rows(df, result.mapping, n=6)

    return ParseResponse(
        column_names=col_names,
        detected_mapping=result.mapping,
        ambiguous_fields=result.ambiguous_fields,
        high_confidence=result.confidence,
        preview_rows=rows,
        row_count=len(df),
    )


@router.post("/confirm", response_model=ConfirmResponse, summary="Import portfolio from upload")
async def confirm_upload(
    file: UploadFile = File(...),
    column_mapping: str = Form(..., description="JSON object: canonical_field → original_column_name"),
) -> ConfirmResponse:
    """
    Step 2 of the upload wizard.

    Accepts the file again plus the confirmed column mapping (possibly edited by the user).
    Normalises all rows, validates them, loads them into the FileDataProvider cache,
    and saves a canonical CSV for persistence.

    The column_mapping JSON looks like:
      {"ticker": "Symbol", "name": "Company Name", "quantity": "Qty", ...}
    """
    _validate_file(file)

    # Parse column mapping JSON
    try:
        col_map: dict[str, Optional[str]] = json.loads(column_mapping)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid column_mapping JSON: {exc}")

    # Validate required fields are present in the mapping
    missing_required = [
        f for f in REQUIRED_FIELDS
        if col_map.get(f) is None
    ]
    if missing_required:
        raise HTTPException(
            status_code=422,
            detail=f"Required columns are not mapped: {missing_required}",
        )

    tmp_path = await _save_temp(file)

    try:
        df = read_file_as_dataframe(tmp_path)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read file: {exc}")
    finally:
        tmp_path.unlink(missing_ok=True)

    if df.empty:
        raise HTTPException(status_code=422, detail="The uploaded file has no data rows.")

    # Normalize
    holdings, skipped = normalize_to_holdings(df, col_map)

    if not holdings:
        raise HTTPException(
            status_code=422,
            detail=(
                f"No valid rows could be parsed. "
                f"{len(skipped)} row(s) had errors: "
                f"{skipped[:3]}"
            ),
        )

    # 1. Update the in-memory FileDataProvider cache (serves 'uploaded' data mode immediately)
    import app.data_providers.file_provider as _fp_module
    _fp_module._uploaded_holdings = list(holdings)

    # 2. Persist to the database as a real Portfolio record
    #    Also creates an initial snapshot so the upload shows in history.
    filename = file.filename or "upload"
    portfolio_id: Optional[int] = None
    try:
        from sqlalchemy import create_engine
        from app.db.database import SessionLocal
        from app.services.portfolio_manager import PortfolioManagerService
        from app.services.snapshot_service import SnapshotService

        db_session = SessionLocal()
        try:
            mgr  = PortfolioManagerService(db_session)
            p    = mgr.save_uploaded_portfolio(holdings, filename=filename)
            portfolio_id = p.id
            # Auto-snapshot on upload
            snap_svc = SnapshotService(db_session)
            snap_svc.capture(p.id, label=f"Auto — upload ({filename})")
        finally:
            db_session.close()
    except Exception as exc:
        logger.warning("Could not persist upload to DB (in-memory cache is still live): %s", exc)

    # 3. Also save a canonical CSV as a fallback for non-DB restore
    UPLOADS_PATH.mkdir(parents=True, exist_ok=True)
    out_path = UPLOADS_PATH / "portfolio_uploaded.csv"
    import pandas as pd
    rows_data = [
        {
            "ticker":        h.ticker,
            "name":          h.name,
            "quantity":      h.quantity,
            "average_cost":  h.average_cost,
            "current_price": h.current_price or h.average_cost,
            "sector":        h.sector or "Unknown",
            "asset_class":   h.asset_class or "Equity",
            "currency":      h.currency or "INR",
        }
        for h in holdings
    ]
    pd.DataFrame(rows_data).to_csv(out_path, index=False)
    logger.info(
        "Upload confirmed: %d holdings, %d skipped, portfolio_id=%s",
        len(holdings), len(skipped), portfolio_id,
    )

    return ConfirmResponse(
        success=True,
        filename=filename,
        holdings_parsed=len(holdings),
        rows_skipped=len(skipped),
        skipped_details=skipped[:10],
        message=(
            f"Successfully imported {len(holdings)} holding(s). "
            + (f"{len(skipped)} row(s) skipped." if skipped else "All rows imported.")
        ),
    )
