"""
Upload V2 Service — Isolated fast-path pipeline
------------------------------------------------
Separates base persist (fast, < 2 s) from enrichment (slow, async background).

Pipeline stages:
  1. classify_rows_v2(df, col_map)
       → (accepted: list[HoldingBase], rejected: list[RejectedRow],
          warning_rows: list[WarningRow])
     Uses the same normaliser helpers as the existing path.
     Adds a new tier: valid_with_warning — accepted but flagged.

  2. persist_base_portfolio(accepted, filename, db)
       → portfolio_id: int
     Single session, single commit.  All holdings enter the DB with
     enrichment_status="pending".

  3. update_memory_cache(accepted_holdings)
     Immediately populates FileDataProvider._uploaded_holdings so the
     dashboard is live before enrichment completes.

  4. [background] run_background_enrichment(portfolio_id, holdings, db_factory)
     Runs enrich_holdings() + price batch fetch + cache update + quant pre-warm
     + history build — identical to what the old confirm endpoint did inline,
     but now as a background task so the HTTP response is not blocked.

  5. get_enrichment_status(portfolio_id, db) → V2StatusResponse
     Reads current per-holding enrichment state from the DB for polling.

Downstream compatibility:
  HoldingBase is the same schema as before.  The same Holding ORM model is
  written.  No DB migration required.  All existing downstream routes
  (/portfolio/full, /analytics/ratios, /quant/full) are unaffected.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from app.schemas.portfolio import HoldingBase
from app.schemas.upload_v2 import (
    RejectedRow,
    WarningRow,
    ValidatedRow,
    HoldingEnrichmentStatus,
    V2StatusResponse,
    V2ConfirmResponse,
)
from app.ingestion.normalizer import (
    read_file_as_dataframe,
    _clean_ticker,
    _clean_numeric,
    _clean_date,
    _is_isin,
)

import pandas as pd

logger = logging.getLogger(__name__)

# ─── Thresholds for warnings ──────────────────────────────────────────────────

_WARN_LARGE_QTY    = 500_000   # shares — warn but accept
_WARN_LARGE_PRICE  = 200_000   # INR per unit — warn but accept (MRF ~₹130k is valid)


# ─── Row classification (V2) ──────────────────────────────────────────────────

def classify_rows_v2(
    df: "pd.DataFrame",
    column_mapping: dict[str, Optional[str]],
) -> tuple[list[HoldingBase], list[RejectedRow], list[WarningRow]]:
    """
    Classify every row as valid, valid_with_warning, or invalid.

    Accepted (valid + valid_with_warning) rows are returned as HoldingBase objects.
    Invalid rows are returned as RejectedRow objects.
    Rows with warnings also appear in warning_rows (with ticker + warning messages).

    Classification rules:
      invalid             — missing ticker / invalid quantity / invalid average_cost
      valid_with_warning  — ISIN-format ticker; very large quantity; very high unit price
      valid               — everything else
    """
    accepted:     list[HoldingBase] = []
    rejected:     list[RejectedRow] = []
    warning_rows: list[WarningRow]  = []

    def _get(field: str, row: pd.Series):
        col = column_mapping.get(field)
        if col is None or col not in row.index:
            return None
        v = row[col]
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    for idx, raw in df.iterrows():
        row_idx = int(idx)  # type: ignore[arg-type]

        # ── Required field extraction ──────────────────────────────────────────
        raw_ticker = _get("ticker", raw)
        ticker     = _clean_ticker(raw_ticker)
        qty        = _clean_numeric(_get("quantity", raw))
        avg_cost   = _clean_numeric(_get("average_cost", raw))

        # ── Optional field extraction ──────────────────────────────────────────
        name_val  = _get("name", raw)
        name      = str(name_val).strip() if name_val else (ticker or "Unknown")
        cur_price = _clean_numeric(_get("current_price", raw))
        sector_v  = _get("sector", raw)
        sector    = str(sector_v).strip() if sector_v else None
        industry_v = _get("industry", raw)
        industry  = str(industry_v).strip() if industry_v else None
        pur_date  = _clean_date(_get("purchase_date", raw))

        # ── Invalid check — required fields ───────────────────────────────────
        reasons: list[str] = []
        if not ticker:
            reasons.append("missing ticker — column is blank or unrecognised")
        if qty is None:
            reasons.append(f"missing quantity — could not parse {_get('quantity', raw)!r}")
        elif qty <= 0:
            reasons.append(f"invalid quantity {qty!r} — must be > 0")
        if avg_cost is None:
            reasons.append(f"missing average_cost — could not parse {_get('average_cost', raw)!r}")
        elif avg_cost <= 0:
            reasons.append(f"invalid average_cost {avg_cost!r} — must be > 0")

        if reasons:
            rejected.append(RejectedRow(
                row_index=row_idx,
                raw_ticker=str(raw_ticker) if raw_ticker is not None else None,
                reasons=reasons,
            ))
            continue

        # ── Warning check — valid but flagged ─────────────────────────────────
        warnings: list[str] = []

        if ticker and _is_isin(ticker):
            warnings.append(
                f"Ticker '{ticker}' looks like an ISIN code — use the NSE/BSE ticker "
                f"symbol instead (e.g. INFY not INE009A01021). "
                f"Row is imported but enrichment (sector/name/price) will likely fail."
            )

        if qty is not None and qty > _WARN_LARGE_QTY:
            warnings.append(
                f"Very large quantity {qty:,.0f} — please verify this is correct."
            )

        if avg_cost is not None and avg_cost > _WARN_LARGE_PRICE:
            warnings.append(
                f"High unit price ₹{avg_cost:,.2f} — please verify "
                f"(MRF, Shree Cement etc. are valid; most others are not this expensive)."
            )

        # ── Build HoldingBase and accept ──────────────────────────────────────
        try:
            h = HoldingBase(
                ticker=ticker,
                name=name,
                quantity=qty,
                average_cost=avg_cost,
                current_price=cur_price,
                sector=sector,
                industry=industry,
                purchase_date=pur_date,
                asset_class="Equity",
                currency="INR",
                data_source="uploaded",
            )
        except Exception as exc:
            rejected.append(RejectedRow(
                row_index=row_idx,
                raw_ticker=ticker,
                reasons=[str(exc)],
            ))
            continue

        accepted.append(h)

        if warnings:
            warning_rows.append(WarningRow(
                row_index=row_idx,
                ticker=ticker,
                warnings=warnings,
            ))

    return accepted, rejected, warning_rows


# ─── Base portfolio persistence ───────────────────────────────────────────────

def persist_base_portfolio(
    holdings: list[HoldingBase],
    filename: str,
    db,                   # sqlalchemy Session
) -> int:
    """
    Persist the base portfolio (no enrichment data) as a single transaction.
    Returns the new portfolio_id.

    Uses PortfolioManagerService.save_uploaded_portfolio() so the logic is
    identical to the existing path — no duplication.
    """
    from app.services.portfolio_manager import PortfolioManagerService
    from app.services.snapshot_service import SnapshotService

    mgr = PortfolioManagerService(db)
    portfolio = mgr.save_uploaded_portfolio(holdings, filename=filename)

    # Auto-snapshot on upload
    try:
        SnapshotService(db).capture(portfolio.id, label=f"Auto — upload ({filename})")
    except Exception as exc:
        logger.warning("Could not create upload snapshot: %s", exc)

    return portfolio.id


# ─── In-memory cache update ───────────────────────────────────────────────────

def update_memory_cache(holdings: list[HoldingBase]) -> None:
    """
    Push the accepted holdings into the FileDataProvider in-memory cache so
    that the dashboard and all downstream pages are live immediately without
    waiting for background enrichment.
    """
    import app.data_providers.file_provider as _fp
    _fp._uploaded_holdings = list(holdings)
    logger.debug("V2: updated in-memory cache with %d holdings", len(holdings))


# ─── Background enrichment task ──────────────────────────────────────────────

async def run_background_enrichment(
    portfolio_id: int,
    holdings: list[HoldingBase],
    db_factory,            # callable → Session (e.g. SessionLocal)
) -> None:
    """
    Background task: enrich holdings, fetch live prices, update DB and cache,
    pre-warm quant cache, and build portfolio history.

    Designed to be fire-and-forget via FastAPI BackgroundTasks.  All errors
    are caught and logged — they must NEVER surface to the user or crash the
    background thread.

    This is functionally identical to what the old /upload/confirm endpoint
    did inline (via asyncio.to_thread) — now it runs after the HTTP response
    has already been sent.
    """
    logger.info(
        "V2 background enrichment started: portfolio_id=%s, %d holdings",
        portfolio_id, len(holdings),
    )

    # ── 1. Sector/name/industry enrichment ────────────────────────────────────
    try:
        from app.ingestion.sector_enrichment import enrich_holdings
        enriched_holdings, enrich_records, enriched_count, _ = await asyncio.to_thread(
            enrich_holdings, holdings
        )
        logger.info(
            "V2 enrichment: %d/%d holdings updated (portfolio_id=%s)",
            enriched_count, len(holdings), portfolio_id,
        )
    except Exception as exc:
        logger.error("V2 enrichment failed (non-fatal): %s", exc)
        enriched_holdings = holdings
        enrich_records = []

    # ── 2. Persist enrichment results to DB ───────────────────────────────────
    if enrich_records:
        try:
            db = db_factory()
            try:
                from app.services.portfolio_manager import PortfolioManagerService
                PortfolioManagerService(db).patch_holdings_enrichment(
                    portfolio_id, enrich_records
                )
            finally:
                db.close()
        except Exception as exc:
            logger.error(
                "V2 could not persist enrichment to DB (portfolio_id=%s): %s",
                portfolio_id, exc,
            )

    # ── 3. Batch live price fetch ──────────────────────────────────────────────
    prices: dict[str, float] = {}
    try:
        from app.data_providers.live_provider import (
            YFINANCE_AVAILABLE as _YF_OK,
            _fetch_live_prices_batch,
        )
        if _YF_OK:
            ticker_list = [h.ticker for h in enriched_holdings]
            try:
                prices = await asyncio.wait_for(
                    asyncio.to_thread(_fetch_live_prices_batch, ticker_list),
                    timeout=25.0,
                )
                logger.info(
                    "V2 price fetch: %d/%d prices received (portfolio_id=%s)",
                    len(prices), len(ticker_list), portfolio_id,
                )
            except asyncio.TimeoutError:
                logger.warning(
                    "V2 price fetch timed out after 25s (portfolio_id=%s) — "
                    "proceeding without live prices", portfolio_id,
                )
    except ImportError:
        pass  # yfinance not installed

    # ── 4. Apply prices to enriched holdings and patch DB ─────────────────────
    if prices:
        enriched_holdings = [
            h.model_copy(update={"current_price": prices[h.ticker]})
            if h.ticker in prices else h
            for h in enriched_holdings
        ]
        try:
            from app.db.database import SessionLocal as _SL
            from app.models.portfolio import Holding as _DBHolding
            db = db_factory()
            try:
                db_hs = (
                    db.query(_DBHolding)
                    .filter(_DBHolding.portfolio_id == portfolio_id)
                    .all()
                )
                for db_h in db_hs:
                    if db_h.ticker in prices:
                        db_h.current_price = prices[db_h.ticker]
                db.commit()
            finally:
                db.close()
        except Exception as exc:
            logger.error(
                "V2 could not persist prices to DB (portfolio_id=%s): %s",
                portfolio_id, exc,
            )

    # ── 5. Refresh in-memory cache with enriched + priced holdings ───────────
    try:
        update_memory_cache(enriched_holdings)
        logger.info(
            "V2 in-memory cache refreshed with enriched holdings (portfolio_id=%s)",
            portfolio_id,
        )
    except Exception as exc:
        logger.error("V2 cache refresh failed (non-fatal): %s", exc)

    # ── 6. Quant cache pre-warm ───────────────────────────────────────────────
    try:
        from app.analytics.quant_service import pre_warm_cache
        from app.data_providers.file_provider import FileDataProvider
        await pre_warm_cache(FileDataProvider(), "1y")
    except Exception as exc:
        logger.warning("V2 quant pre-warm failed (non-fatal): %s", exc)

    # ── 7. Portfolio history build ────────────────────────────────────────────
    try:
        from app.services.history_service import (
            build_and_store_portfolio_history,
            set_history_build_status,
        )
        set_history_build_status(portfolio_id, "pending")
        await asyncio.to_thread(
            build_and_store_portfolio_history,
            portfolio_id,
            list(enriched_holdings),
            db_factory,
        )
    except Exception as exc:
        logger.warning(
            "V2 history build failed (non-fatal, portfolio_id=%s): %s",
            portfolio_id, exc,
        )

    logger.info(
        "V2 background enrichment complete: portfolio_id=%s", portfolio_id
    )


# ─── Enrichment status polling ────────────────────────────────────────────────

def get_enrichment_status(portfolio_id: int, db) -> V2StatusResponse:
    """
    Read current per-holding enrichment state from the DB.
    Called by GET /upload/v2/status/{portfolio_id}.
    """
    from app.models.portfolio import Holding as _DBHolding

    db_holdings = (
        db.query(_DBHolding)
        .filter(_DBHolding.portfolio_id == portfolio_id)
        .all()
    )

    status_list: list[HoldingEnrichmentStatus] = []
    counts = {"enriched": 0, "partial": 0, "pending": 0, "failed": 0}

    for h in db_holdings:
        es = h.enrichment_status or "pending"
        if es not in counts:
            es = "pending"
        counts[es] += 1

        le_at: Optional[str] = None
        if h.last_enriched_at:
            try:
                le_at = h.last_enriched_at.isoformat()
            except Exception:
                pass

        status_list.append(HoldingEnrichmentStatus(
            ticker=h.ticker,
            normalized_ticker=h.normalized_ticker,
            enrichment_status=es,
            sector_status=h.sector_status,
            name_status=h.name_status,
            fundamentals_status=h.fundamentals_status or "pending",
            peers_status=h.peers_status or "pending",
            failure_reason=h.failure_reason,
            last_enriched_at=le_at,
        ))

    return V2StatusResponse(
        portfolio_id=portfolio_id,
        total_holdings=len(db_holdings),
        enriched=counts["enriched"],
        partial=counts["partial"],
        pending=counts["pending"],
        failed=counts["failed"],
        enrichment_complete=(counts["pending"] == 0),
        holdings=status_list,
    )


# ─── Result builder ───────────────────────────────────────────────────────────

def build_v2_response(
    portfolio_id: int,
    filename: str,
    accepted: list[HoldingBase],
    rejected: list[RejectedRow],
    warning_rows: list[WarningRow],
    total_rows: int,
) -> V2ConfirmResponse:
    """Assemble the V2ConfirmResponse after a successful DB persist."""

    rows_valid = len(accepted) - len(warning_rows)
    rows_with_warning = len(warning_rows)
    rows_invalid = len(rejected)

    # Next action hint
    if rows_invalid > 0 and len(accepted) == 0:
        next_action = "fix_rejected"
    elif rows_with_warning > 0:
        next_action = "review_warnings"
    else:
        next_action = "dashboard"

    parts = [f"Successfully imported {len(accepted)} holding(s)."]
    if rows_invalid:
        parts.append(f"{rows_invalid} row(s) could not be imported.")
    if rows_with_warning:
        parts.append(
            f"{rows_with_warning} row(s) imported with warnings "
            f"(e.g. ISIN tickers — check enrichment status)."
        )
    parts.append("Enrichment running in background.")

    return V2ConfirmResponse(
        portfolio_id=portfolio_id,
        filename=filename,
        imported_at=datetime.now(timezone.utc).isoformat(),
        total_rows=total_rows,
        rows_valid=max(rows_valid, 0),
        rows_valid_with_warning=rows_with_warning,
        rows_invalid=rows_invalid,
        rejected_rows=rejected[:20],
        warning_rows=warning_rows[:20],
        enrichment_started=True,
        enrichment_complete=False,
        portfolio_usable=True,
        next_action=next_action,
        message=" ".join(parts),
    )
