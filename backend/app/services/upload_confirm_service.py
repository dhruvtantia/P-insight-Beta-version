"""
Legacy upload confirm service.

This preserves the existing /upload/confirm behavior while moving orchestration
out of the route layer. V2 confirm remains the preferred fast path.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import BackgroundTasks

from app.data_providers.file_provider import UPLOADS_PATH
from app.ingestion.column_detector import REQUIRED_FIELDS
from app.ingestion.normalizer import normalize_to_holdings
from app.ingestion.sector_enrichment import enrich_holdings
from app.schemas.upload import ConfirmResponse
from app.services.upload_file_utils import (
    UploadServiceError,
    load_dataframe_from_upload,
    upload_filename,
)
from app.services.upload_v2_service import pre_warm_uploaded_quant_cache

logger = logging.getLogger(__name__)


def _parse_legacy_column_mapping(column_mapping: str) -> dict[str, Optional[str]]:
    try:
        col_map: dict[str, Optional[str]] = json.loads(column_mapping)
    except json.JSONDecodeError as exc:
        raise UploadServiceError(422, f"Invalid column_mapping JSON: {exc}") from exc

    missing_required = [field for field in REQUIRED_FIELDS if col_map.get(field) is None]
    if missing_required:
        raise UploadServiceError(
            422,
            (
                f"Required columns are not mapped: {missing_required}. "
                f"These columns must be present: ticker (or symbol/scrip/instrument), "
                f"quantity (or qty/shares/units), "
                f"average_cost (or avg_price/buy_price/cost_per_share). "
                f"Company name and sector are optional."
            ),
        )
    return col_map


async def confirm_legacy_upload(
    *,
    filename: str | None,
    content: bytes,
    column_mapping: str,
    background_tasks: BackgroundTasks,
    uploads_path: Path = UPLOADS_PATH,
) -> ConfirmResponse:
    col_map = _parse_legacy_column_mapping(column_mapping)
    df = load_dataframe_from_upload(filename, content)
    if df.empty:
        raise UploadServiceError(422, "The uploaded file has no data rows.")

    holdings, skipped = normalize_to_holdings(df, col_map)
    if not holdings:
        raise UploadServiceError(
            422,
            (
                f"No valid rows could be parsed. "
                f"{len(skipped)} row(s) had errors: "
                f"{skipped[:3]}"
            ),
        )

    resolved_filename = upload_filename(filename)
    portfolio_id = _persist_legacy_base_portfolio(holdings, resolved_filename)

    holdings, enrich_records, enriched_count, enrichment_note = await asyncio.to_thread(
        enrich_holdings, holdings
    )
    _patch_legacy_enrichment(portfolio_id, enrich_records)
    holdings = await _fetch_and_persist_prices(portfolio_id, holdings)
    _schedule_legacy_background_work(background_tasks, portfolio_id, holdings)
    _save_legacy_canonical_csv(uploads_path, holdings)

    rows_fully_enriched = sum(1 for record in enrich_records if record.fully_enriched)
    rows_partially_enriched = sum(1 for record in enrich_records if record.partially_enriched)
    rows_sector_unknown = sum(1 for record in enrich_records if record.sector_status == "unknown")
    rows_no_fundamentals = sum(
        1 for record in enrich_records if record.fundamentals_status == "unavailable"
    )
    enrichment_details = [record.to_dict() for record in enrich_records]

    logger.info(
        "Upload confirmed: %d holdings, %d skipped, %d enriched "
        "(fully=%d, partial=%d, unknown=%d, no_fundamentals=%d), portfolio_id=%s",
        len(holdings),
        len(skipped),
        enriched_count,
        rows_fully_enriched,
        rows_partially_enriched,
        rows_sector_unknown,
        rows_no_fundamentals,
        portfolio_id,
    )

    return ConfirmResponse(
        success=True,
        filename=resolved_filename,
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
        holdings_parsed=len(holdings),
        message=(
            f"Successfully imported {len(holdings)} holding(s)."
            + (f" {len(skipped)} row(s) skipped." if skipped else " All rows imported.")
        ),
    )


def _persist_legacy_base_portfolio(holdings, filename: str) -> int:
    try:
        from app.db.database import SessionLocal
        from app.services.portfolio_manager import PortfolioManagerService
        from app.services.snapshot_service import SnapshotService

        db_session = SessionLocal()
        try:
            manager = PortfolioManagerService(db_session)
            portfolio = manager.save_uploaded_portfolio(holdings, filename=filename)
            SnapshotService(db_session).capture(portfolio.id, label=f"Auto — upload ({filename})")
            return portfolio.id
        finally:
            db_session.close()
    except Exception as exc:
        logger.error("Could not persist upload to DB: %s", exc)
        raise UploadServiceError(500, f"Could not save portfolio to database: {exc}") from exc


def _patch_legacy_enrichment(portfolio_id: int, enrich_records: list) -> None:
    try:
        from app.db.database import SessionLocal
        from app.services.portfolio_manager import PortfolioManagerService

        patch_session = SessionLocal()
        try:
            PortfolioManagerService(patch_session).patch_holdings_enrichment(
                portfolio_id,
                enrich_records,
            )
        finally:
            patch_session.close()
    except Exception as exc:
        logger.warning("Could not persist enrichment to DB: %s", exc)


async def _fetch_and_persist_prices(portfolio_id: int, holdings: list) -> list:
    try:
        from app.data_providers.live_provider import (
            YFINANCE_AVAILABLE as yfinance_available,
            _fetch_live_prices_batch,
        )
    except ImportError:
        return holdings

    if not yfinance_available:
        return holdings

    ticker_list = [holding.ticker for holding in holdings]
    prices: dict[str, float] = {}
    try:
        prices = await asyncio.wait_for(
            asyncio.to_thread(_fetch_live_prices_batch, ticker_list),
            timeout=20.0,
        )
        logger.info("Upload price fetch: got %d/%d prices", len(prices), len(ticker_list))
    except asyncio.TimeoutError:
        logger.warning("Upload price fetch timed out after 20s — proceeding without live prices")

    if not prices:
        return holdings

    updated_holdings = [
        holding.model_copy(update={"current_price": prices[holding.ticker]})
        if holding.ticker in prices else holding
        for holding in holdings
    ]

    try:
        from app.db.database import SessionLocal
        from app.models.portfolio import Holding as DBHolding

        price_session = SessionLocal()
        try:
            db_holdings = (
                price_session.query(DBHolding)
                .filter(DBHolding.portfolio_id == portfolio_id)
                .all()
            )
            for db_holding in db_holdings:
                if db_holding.ticker in prices:
                    db_holding.current_price = prices[db_holding.ticker]
            price_session.commit()
            logger.info(
                "Persisted %d live prices to DB (portfolio_id=%s)",
                len(prices),
                portfolio_id,
            )
        finally:
            price_session.close()
    except Exception as exc:
        logger.warning("Could not persist live prices to DB: %s", exc)

    return updated_holdings


def _schedule_legacy_background_work(
    background_tasks: BackgroundTasks,
    portfolio_id: int,
    holdings: list,
) -> None:
    try:
        from app.db.database import SessionLocal

        background_tasks.add_task(
            pre_warm_uploaded_quant_cache,
            SessionLocal,
            portfolio_id,
            "1y",
        )
    except Exception as exc:
        logger.warning("Could not schedule quant pre-warm (non-fatal): %s", exc)

    try:
        from app.db.database import SessionLocal as HistorySessionLocal
        from app.services.history_service import (
            build_and_store_portfolio_history,
            set_history_build_status,
        )

        set_history_build_status(portfolio_id, "pending")
        background_tasks.add_task(
            build_and_store_portfolio_history,
            portfolio_id,
            list(holdings),
            HistorySessionLocal,
        )
        logger.info(
            "Scheduled portfolio history build for portfolio_id=%s (%d tickers)",
            portfolio_id,
            len(holdings),
        )
    except Exception as exc:
        logger.warning("Could not schedule portfolio history build (non-fatal): %s", exc)


def _save_legacy_canonical_csv(uploads_path: Path, holdings: list) -> None:
    uploads_path.mkdir(parents=True, exist_ok=True)
    rows_data = [
        {
            "ticker":        holding.ticker,
            "name":          holding.name,
            "quantity":      holding.quantity,
            "average_cost":  holding.average_cost,
            "current_price": holding.current_price or holding.average_cost,
            "sector":        holding.sector or "Unknown",
            "asset_class":   holding.asset_class or "Equity",
            "currency":      holding.currency or "INR",
        }
        for holding in holdings
    ]
    pd.DataFrame(rows_data).to_csv(uploads_path / "portfolio_uploaded.csv", index=False)
