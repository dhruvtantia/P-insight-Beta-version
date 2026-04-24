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

import asyncio
import json
import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from typing import Optional

from app.ingestion.column_detector import detect_columns, REQUIRED_FIELDS, OPTIONAL_FIELDS
from app.ingestion.normalizer import (
    read_file_as_dataframe,
    preview_rows,
    normalize_to_holdings,
    missing_optional_columns,
)
from app.ingestion.sector_enrichment import enrich_holdings, EnrichmentRecord
from app.data_providers.file_provider import FileDataProvider, UPLOADS_PATH
from app.schemas.upload_v2 import V2ConfirmResponse, V2StatusResponse
from app.services.post_upload_workflow import PostUploadWorkflow, UploadCompleted
from app.services.upload_v2_service import (
    classify_rows_v2,
    persist_base_portfolio,
    run_background_enrichment,
    build_v2_response,
    get_enrichment_status,
)

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
    success:                bool
    filename:               str
    # Row counts
    rows_accepted:          int                    # rows successfully parsed
    rows_rejected:          int                    # rows that failed parsing (missing required fields)
    skipped_details:        list[dict]             # [{row_index, raw_ticker, error}, ...]
    # Enrichment summary
    rows_fully_enriched:    int                    # sector + name both resolved from external sources
    rows_partially_enriched: int                   # one of sector/name resolved; other from file or unknown
    rows_sector_unknown:    int                    # sector could not be resolved (shows "Unknown")
    rows_no_fundamentals:   int                    # holdings where fundamentals fetch failed/unavailable
    enriched_count:         int                    # total holdings that received any enrichment update
    enrichment_note:        Optional[str]          # human-readable enrichment summary
    enrichment_details:     list[dict]             # per-ticker: ticker, sector_status, name_status,
                                                   #   fundamentals_status, enrichment_status, sources
    # Compatibility shim
    holdings_parsed:        int                    # same as rows_accepted (kept for frontend compat)
    message:                str


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
    background_tasks: BackgroundTasks,
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
    # Runs the full fallback chain: yfinance → FMP → static map → "Unknown"
    # Import is never blocked by enrichment failures.
    # NOTE: enrichment must happen BEFORE we update the in-memory cache so that
    #       the cache gets the already-enriched holdings.
    # Run in a thread so the async event loop is not blocked by yfinance I/O.
    holdings, enrich_records, enriched_count, enrichment_note = await asyncio.to_thread(
        enrich_holdings, holdings
    )

    # ── 3a. Persist enriched sector/name + metadata back to the DB ───────────
    # DB was saved in step 1 (before enrichment) so bare tickers/missing names
    # are on disk. Patch enriched rows now, including per-holding status fields.
    if portfolio_id is not None:
        try:
            from app.db.database import SessionLocal
            from app.services.portfolio_manager import PortfolioManagerService
            patch_session = SessionLocal()
            try:
                patch_mgr = PortfolioManagerService(patch_session)
                patch_mgr.patch_holdings_enrichment(portfolio_id, enrich_records)
            finally:
                patch_session.close()
        except Exception as exc:
            logger.warning("Could not persist enrichment to DB (in-memory cache is still live): %s", exc)

    # ── 3aa. Batch price fetch — populate current_price at upload time ────────
    # A single yfinance batch call for all tickers so dashboard & holdings pages
    # are instant after upload without waiting for page-driven fetches.
    # Non-blocking: uses the same asyncio.wait_for guard as /live/quotes.
    try:
        from app.data_providers.live_provider import (
            YFINANCE_AVAILABLE as _YF_OK,
            _fetch_live_prices_batch,
        )
        if _YF_OK:
            ticker_list = [h.ticker for h in holdings]
            prices: dict[str, float] = {}
            try:
                prices = await asyncio.wait_for(
                    asyncio.to_thread(_fetch_live_prices_batch, ticker_list),
                    timeout=20.0,
                )
                logger.info(
                    "Upload price fetch: got %d/%d prices", len(prices), len(ticker_list)
                )
            except asyncio.TimeoutError:
                logger.warning("Upload price fetch timed out after 20s — proceeding without live prices")

            if prices and portfolio_id is not None:
                # Patch current_price on in-memory holdings list
                holdings = [
                    h.model_copy(update={"current_price": prices[h.ticker]})
                    if h.ticker in prices else h
                    for h in holdings
                ]
                # Persist prices to DB holdings
                try:
                    from app.db.database import SessionLocal
                    from app.models.portfolio import Holding as _DBHolding
                    price_session = SessionLocal()
                    try:
                        db_holdings = (
                            price_session.query(_DBHolding)
                            .filter(_DBHolding.portfolio_id == portfolio_id)
                            .all()
                        )
                        for db_h in db_holdings:
                            if db_h.ticker in prices:
                                db_h.current_price = prices[db_h.ticker]
                        price_session.commit()
                        logger.info(
                            "Persisted %d live prices to DB (portfolio_id=%s)",
                            len(prices), portfolio_id,
                        )
                    finally:
                        price_session.close()
                except Exception as exc:
                    logger.warning("Could not persist live prices to DB: %s", exc)
    except ImportError:
        pass  # yfinance not installed — continue without prices

    # ── 3b. Update the in-memory FileDataProvider cache ──────────────────────
    # Done AFTER enrichment so the cache gets the enriched (sector/name-patched) holdings.
    import app.data_providers.file_provider as _fp_module
    _fp_module._uploaded_holdings = list(holdings)

    # ── 3c. Background quant cache pre-warm ──────────────────────────────────
    # Fire-and-forget: compute quant analytics now so /risk and /quant are fast
    # on the user's first visit after upload.  Errors are swallowed inside
    # pre_warm_cache() — they must never surface to the upload response.
    try:
        from app.analytics.quant_service import pre_warm_cache
        from app.data_providers.file_provider import FileDataProvider
        background_tasks.add_task(pre_warm_cache, FileDataProvider(), "1y")
    except Exception as exc:
        logger.warning("Could not schedule quant pre-warm (non-fatal): %s", exc)

    # ── 3d. Background historical data build ──────────────────────────────────
    # Fetch 1-year daily prices for all tickers + benchmark, compute daily
    # portfolio value, and persist to portfolio_history + benchmark_history.
    # This is the "fetch once, reuse everywhere" store that powers the Changes
    # page daily chart and any future historical widgets.
    # Non-fatal: errors are logged but never surface to the upload response.
    if portfolio_id is not None:
        try:
            from app.services.history_service import (
                build_and_store_portfolio_history,
                set_history_build_status,
            )
            from app.db.database import SessionLocal as _SessionLocal
            # Mark as 'pending' immediately — frontend can show a building banner
            # even before the background task has started executing.
            set_history_build_status(portfolio_id, "pending")
            # Pass a stable copy so the background task sees consistent data.
            holdings_snapshot = list(holdings)
            background_tasks.add_task(
                build_and_store_portfolio_history,
                portfolio_id,
                holdings_snapshot,
                _SessionLocal,   # db_factory — background task opens its own session
            )
            logger.info(
                "Scheduled portfolio history build for portfolio_id=%s (%d tickers)",
                portfolio_id, len(holdings_snapshot),
            )
        except Exception as exc:
            logger.warning("Could not schedule portfolio history build (non-fatal): %s", exc)

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
    # ── Build enrichment summary stats ────────────────────────────────────────
    rows_fully_enriched     = sum(1 for r in enrich_records if r.fully_enriched)
    rows_partially_enriched = sum(1 for r in enrich_records if r.partially_enriched)
    rows_sector_unknown     = sum(1 for r in enrich_records if r.sector_status == "unknown")
    # Holdings where fundamentals are unavailable: yfinance was tried but returned nothing,
    # OR yfinance was not available at all.  "pending" means not attempted (sector/name
    # were already in the file, so yfinance was skipped — not a failure).
    rows_no_fundamentals    = sum(
        1 for r in enrich_records if r.fundamentals_status == "unavailable"
    )
    enrichment_details      = [r.to_dict() for r in enrich_records]

    logger.info(
        "Upload confirmed: %d holdings, %d skipped, %d enriched "
        "(fully=%d, partial=%d, unknown=%d, no_fundamentals=%d), portfolio_id=%s",
        len(holdings), len(skipped), enriched_count,
        rows_fully_enriched, rows_partially_enriched, rows_sector_unknown,
        rows_no_fundamentals, portfolio_id,
    )

    return ConfirmResponse(
        success=True,
        filename=filename,
        rows_accepted=len(holdings),
        rows_rejected=len(skipped),
        skipped_details=skipped[:10],
        rows_fully_enriched=rows_fully_enriched,
        rows_partially_enriched=rows_partially_enriched,
        rows_sector_unknown=rows_sector_unknown,
        rows_no_fundamentals=rows_no_fundamentals,
        enriched_count=enriched_count,
        enrichment_note=enrichment_note,
        enrichment_details=enrichment_details,
        holdings_parsed=len(holdings),   # compat alias
        message=(
            f"Successfully imported {len(holdings)} holding(s)."
            + (f" {len(skipped)} row(s) skipped." if skipped else " All rows imported.")
        ),
    )


# ─── Spec-compliant status endpoint (query param) ────────────────────────────
#
# GET /upload/status?portfolio_id=17
#
# This is the URL contract specified in the module spec.
# It is a thin wrapper around the same get_enrichment_status() logic used by
# the path-param variant below.  Both endpoints return the same V2StatusResponse.


@router.get(
    "/status",
    response_model=V2StatusResponse,
    summary="Poll enrichment status for an uploaded portfolio (spec-compliant URL)",
)
async def get_upload_status(
    portfolio_id: int = Query(..., description="ID of the portfolio to check"),
) -> V2StatusResponse:
    """
    Spec-required query-param variant of the enrichment status endpoint.

    Returns per-holding enrichment state from the DB.
    Identical response shape to GET /upload/v2/status/{portfolio_id}.
    Poll after POST /upload/v2/confirm to track background enrichment progress.
    """
    try:
        from app.db.database import SessionLocal
        from app.models.portfolio import Portfolio as _Portfolio
        db = SessionLocal()
        try:
            p = db.query(_Portfolio).filter(_Portfolio.id == portfolio_id).first()
            if p is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Portfolio {portfolio_id} not found",
                )
            return get_enrichment_status(portfolio_id, db)
        finally:
            db.close()
    except HTTPException:
        raise
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
    _validate_file(file)

    # Parse column mapping
    try:
        col_map: dict[str, Optional[str]] = json.loads(column_mapping)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid column_mapping JSON: {exc}")

    # Validate required fields are mapped
    missing_required = [f for f in REQUIRED_FIELDS if col_map.get(f) is None]
    if missing_required:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Required columns are not mapped: {missing_required}. "
                f"ticker, quantity, and average_cost must all be mapped."
            ),
        )

    tmp_path = await _save_temp(file)
    filename = file.filename or "upload"

    try:
        df = read_file_as_dataframe(tmp_path)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read file: {exc}")
    finally:
        tmp_path.unlink(missing_ok=True)

    if df.empty:
        raise HTTPException(status_code=422, detail="The uploaded file has no data rows.")

    total_rows = len(df)

    # ── 1. Classify rows (fast, in-process) ──────────────────────────────────
    accepted, rejected, warning_rows = classify_rows_v2(df, col_map)

    if not accepted:
        raise HTTPException(
            status_code=422,
            detail=(
                f"No valid rows could be parsed. "
                f"{len(rejected)} row(s) had errors: "
                f"{[r.reasons for r in rejected[:3]]}"
            ),
        )

    # ── 2. Persist base portfolio — single session, single commit ────────────
    portfolio_id: int
    try:
        from app.db.database import SessionLocal
        db = SessionLocal()
        try:
            portfolio_id = persist_base_portfolio(accepted, filename, db)
        finally:
            db.close()
    except Exception as exc:
        logger.error("V2 DB persist failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Could not save portfolio to database: {exc}",
        )

    # ── 3. Post-upload side effects ──────────────────────────────────────────
    from app.db.database import SessionLocal as _SessionLocal

    PostUploadWorkflow(
        background_tasks=background_tasks,
        db_factory=_SessionLocal,
        uploads_path=UPLOADS_PATH,
        enrichment_task=run_background_enrichment,
    ).run(UploadCompleted(
        portfolio_id=portfolio_id,
        holdings=list(accepted),
        filename=filename,
    ))

    # ── 4. Return immediately ─────────────────────────────────────────────────
    result = build_v2_response(
        portfolio_id=portfolio_id,
        filename=filename,
        accepted=accepted,
        rejected=rejected,
        warning_rows=warning_rows,
        total_rows=total_rows,
    )

    logger.info(
        "V2 confirm: portfolio_id=%s, accepted=%d (warnings=%d), rejected=%d",
        portfolio_id, len(accepted), len(warning_rows), len(rejected),
    )

    return result


@router.get(
    "/v2/status/{portfolio_id}",
    response_model=V2StatusResponse,
    summary="[V2] Poll enrichment status for an uploaded portfolio",
)
async def get_upload_status_v2(portfolio_id: int) -> V2StatusResponse:
    """
    Returns current per-holding enrichment state from the DB.

    Poll this endpoint after /v2/confirm to track background enrichment progress.
    enrichment_complete becomes True once all holdings have left "pending" state.
    Typically completes within 10–60 seconds depending on portfolio size and
    yfinance response times.
    """
    try:
        from app.db.database import SessionLocal
        from app.models.portfolio import Portfolio as _Portfolio
        db = SessionLocal()
        try:
            # Verify portfolio exists
            p = db.query(_Portfolio).filter(_Portfolio.id == portfolio_id).first()
            if p is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Portfolio {portfolio_id} not found",
                )
            return get_enrichment_status(portfolio_id, db)
        finally:
            db.close()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not read enrichment status: {exc}",
        )
