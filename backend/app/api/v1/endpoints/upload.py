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

from app.ingestion.column_detector import detect_columns, REQUIRED_FIELDS, OPTIONAL_FIELDS
from app.ingestion.normalizer import (
    read_file_as_dataframe,
    preview_rows,
    normalize_to_holdings,
    missing_optional_columns,
)
from app.data_providers.file_provider import FileDataProvider, UPLOADS_PATH

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/upload", tags=["Upload"])

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
MAX_FILE_SIZE_MB = 10


# ─── Response schemas ─────────────────────────────────────────────────────────

class ParseResponse(BaseModel):
    """Result of the /parse step — returned to the frontend for mapping/preview."""
    column_names:          list[str]               # all original column names
    detected_mapping:      dict[str, Optional[str]] # canonical → original col (None = not found)
    ambiguous_fields:      list[str]               # fields matched via substring (less certain)
    high_confidence:       bool                    # True = all required cols auto-detected
    preview_rows:          list[dict]              # first ~6 rows in canonical form
    row_count:             int                     # total data rows in file
    missing_optional:      list[str]               # optional cols absent from file (will be enriched)
    required_fields:       list[str]               # for UI display
    optional_fields:       list[str]               # for UI display


class ConfirmResponse(BaseModel):
    """Result of the /confirm step — returned after saving the normalised portfolio."""
    success:          bool
    filename:         str
    holdings_parsed:  int
    rows_skipped:     int
    skipped_details:  list[dict]                   # [{row_index, raw_ticker, error}, ...]
    enriched_count:   int                          # holdings enriched with live sector/name data
    enrichment_note:  Optional[str]                # human-readable enrichment summary
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
    absent_optional = missing_optional_columns(result.mapping)

    return ParseResponse(
        column_names=col_names,
        detected_mapping=result.mapping,
        ambiguous_fields=result.ambiguous_fields,
        high_confidence=result.confidence,
        preview_rows=rows,
        row_count=len(df),
        missing_optional=absent_optional,
        required_fields=sorted(REQUIRED_FIELDS),
        optional_fields=sorted(OPTIONAL_FIELDS),
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
    # Required: ticker, quantity, average_cost.  name/sector/current_price are optional.
    missing_required = [
        f for f in REQUIRED_FIELDS
        if col_map.get(f) is None
    ]
    if missing_required:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Required columns are not mapped: {missing_required}. "
                f"These columns must be present: ticker (or symbol/scrip/instrument), "
                f"quantity (or qty/shares/units), "
                f"average_cost (or avg_price/buy_price/cost_per_share). "
                f"Company name and sector are optional."
            ),
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

    # ── 1. Persist to the database as a real Portfolio record ─────────────────
    #    Also creates an initial snapshot so the upload shows in history.
    filename = file.filename or "upload"
    portfolio_id: Optional[int] = None
    try:
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

    # ── 2. Post-import enrichment ─────────────────────────────────────────────
    # For holdings where sector or name is missing, attempt to fetch from
    # yfinance fundamentals. Import is never blocked by enrichment failures.
    # NOTE: enrichment must happen BEFORE we update the in-memory cache so that
    #       the cache gets the already-enriched holdings.
    enriched_count = 0
    needs_enrichment = [
        (i, h) for i, h in enumerate(holdings)
        if not h.sector or h.name == h.ticker
    ]

    unenriched_tickers: list[str] = []
    if needs_enrichment:
        from app.data_providers.live_provider import (
            YFINANCE_AVAILABLE,
            _fetch_fundamentals_single,
            _fetch_fmp_fundamentals,
            _fund_from_cache,
            _store_fund,
        )
        for idx, h in needs_enrichment:
            try:
                if not YFINANCE_AVAILABLE:
                    logger.warning(
                        "Enrichment skipped for %s: yfinance is not installed", h.ticker
                    )
                    unenriched_tickers.append(h.ticker)
                    break
                cached = _fund_from_cache(h.ticker)
                fund = cached if cached else _fetch_fundamentals_single(h.ticker)
                if fund and fund.get("source") != "yfinance_error":
                    updates: dict = {}
                    if not h.sector and fund.get("sector"):
                        updates["sector"] = fund["sector"]
                    if h.name == h.ticker and (fund.get("name") or fund.get("longName")):
                        updates["name"] = fund.get("name") or fund.get("longName")
                    if updates:
                        holdings[idx] = h.model_copy(update=updates)
                        enriched_count += 1
                        # Cache fundamentals so subsequent fetches are instant
                        resolved = fund.get("resolved_ticker", h.ticker)
                        _store_fund(resolved, fund)
                        if resolved != h.ticker:
                            _store_fund(h.ticker, fund)
                    else:
                        # yfinance returned data but sector/name still missing — log explicitly
                        missing_fields = []
                        if not h.sector and not fund.get("sector"):
                            missing_fields.append("sector")
                        if h.name == h.ticker and not fund.get("name"):
                            missing_fields.append("name")
                        if missing_fields:
                            logger.warning(
                                "Enrichment incomplete for %s: yfinance returned data but "
                                "missing fields: %s (source=%s)",
                                h.ticker, missing_fields, fund.get("source", "unknown"),
                            )
                            unenriched_tickers.append(h.ticker)
                else:
                    logger.warning(
                        "Enrichment failed for %s: no data returned from yfinance or FMP",
                        h.ticker,
                    )
                    unenriched_tickers.append(h.ticker)
            except Exception as exc:
                logger.warning("Enrichment exception for %s: %s", h.ticker, exc)
                unenriched_tickers.append(h.ticker)
        logger.info(
            "Enrichment completed: %d/%d holdings enriched; unenriched: %s",
            enriched_count, len(needs_enrichment),
            unenriched_tickers if unenriched_tickers else "none",
        )

    # ── 3a. Persist enriched sector/name back to the DB ──────────────────────
    # DB was saved in step 1 (before enrichment) so bare tickers/missing names
    # are on disk. Patch only the enriched rows now so that after a backend
    # restart _restore_from_db_holdings loads the correct sector/name.
    if enriched_count > 0 and portfolio_id is not None:
        try:
            from app.db.database import SessionLocal
            from app.services.portfolio_manager import PortfolioManagerService
            patch_session = SessionLocal()
            try:
                patch_mgr = PortfolioManagerService(patch_session)
                enrichment_patches = [
                    {
                        "ticker":  holdings[idx].ticker,
                        "sector":  holdings[idx].sector,
                        "name":    holdings[idx].name,
                    }
                    for idx, _ in needs_enrichment
                    if holdings[idx].sector or holdings[idx].name != holdings[idx].ticker
                ]
                patch_mgr.patch_holdings_enrichment(portfolio_id, enrichment_patches)
            finally:
                patch_session.close()
        except Exception as exc:
            logger.warning("Could not persist enrichment to DB (in-memory cache is still live): %s", exc)

    # ── 3b. Update the in-memory FileDataProvider cache ──────────────────────
    # Done AFTER enrichment so the cache gets the enriched (sector/name-patched) holdings.
    import app.data_providers.file_provider as _fp_module
    _fp_module._uploaded_holdings = list(holdings)

    enrichment_note: Optional[str] = None
    if needs_enrichment:
        if enriched_count > 0 and not unenriched_tickers:
            enrichment_note = (
                f"{enriched_count} of {len(needs_enrichment)} holding(s) were automatically "
                f"enriched with sector/company data from Yahoo Finance."
            )
        elif enriched_count > 0 and unenriched_tickers:
            enrichment_note = (
                f"{enriched_count} of {len(needs_enrichment)} holding(s) enriched. "
                f"Sector/name unavailable for: {', '.join(unenriched_tickers)}. "
                f"Check the debug panel for details."
            )
        else:
            enrichment_note = (
                f"{len(needs_enrichment)} holding(s) are missing sector or company name. "
                f"Enrichment failed for: {', '.join(unenriched_tickers) if unenriched_tickers else 'all'}. "
                f"Check the debug panel — sector will show as unavailable in the UI."
            )

    # ── 4. Save canonical CSV ─────────────────────────────────────────────────
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
        "Upload confirmed: %d holdings, %d skipped, %d enriched, portfolio_id=%s",
        len(holdings), len(skipped), enriched_count, portfolio_id,
    )

    return ConfirmResponse(
        success=True,
        filename=filename,
        holdings_parsed=len(holdings),
        rows_skipped=len(skipped),
        skipped_details=skipped[:10],
        enriched_count=enriched_count,
        enrichment_note=enrichment_note,
        message=(
            f"Successfully imported {len(holdings)} holding(s)."
            + (f" {len(skipped)} row(s) skipped." if skipped else " All rows imported.")
        ),
    )
