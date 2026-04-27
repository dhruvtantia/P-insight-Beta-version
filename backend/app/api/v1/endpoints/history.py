"""
Portfolio History Endpoints
----------------------------
Five endpoints that expose pre-computed, reusable time-series and status data.

GET /portfolios/{id}/history
  Daily portfolio total value (computed from holdings × historical prices at upload).
  Returns a smooth daily series for the Changes page chart.
  Now includes build_status so the frontend can distinguish
  "still building" / "failed" / "done" / "unknown" states.

GET /portfolios/{id}/history/benchmark?ticker=^NSEI
  Daily close prices for a benchmark index.
  Default: ^NSEI (Nifty 50).  Frontend normalises to portfolio start value.

GET /portfolios/{id}/history/build-status
  Lightweight polling endpoint — returns the current history build status
  without fetching the full time series.  Used by the Changes page to
  show a "Building history…" banner while data is being computed.

GET /portfolios/{id}/holdings/status
  Per-holding enrichment + data status:
    enrichment_status, sector_status, fundamentals_status, peers_status,
    last_enriched_at, failure_reason
  These fields are already stored in the DB after each upload enrichment run.
  This endpoint makes them inspectable after the upload screen has closed.

GET /portfolios/{id}/holdings/since-purchase
  Per-holding P&L computed from average_cost × quantity vs current_price × quantity.
  No extra data fetches needed — all values are already in the DB from upload.
  Powers the "Since Purchase" panel on the Changes page.
  Honest about price freshness: current_price was fetched at upload time.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.dependencies import DbSession

router = APIRouter(tags=["History"])

CANONICAL_HISTORY_STATES = {"building", "complete", "failed", "not_started"}


def _resolve_canonical_history_status(in_memory_status: str, row_count: int) -> str:
    """Map internal build-status labels to the frontend-facing status contract."""
    if in_memory_status == "unknown":
        return "complete" if row_count > 0 else "not_started"
    if in_memory_status == "done":
        return "complete"
    if in_memory_status in ("pending", "building"):
        return "building"
    if in_memory_status == "failed":
        return "failed"
    return "not_started"


def _resolve_canonical_daily_state(in_memory_status: str, has_data: bool) -> str:
    """Resolve the discriminated daily-history state without leaking legacy labels."""
    if has_data:
        return "complete"
    if in_memory_status in ("pending", "building"):
        return "building"
    if in_memory_status in ("failed", "done"):
        return "failed"
    return "not_started"


# ─── Response schemas ─────────────────────────────────────────────────────────

class HistoryPoint(BaseModel):
    date:        str
    total_value: float


class BenchmarkPoint(BaseModel):
    date:        str
    close_price: float


class PortfolioHistoryResponse(BaseModel):
    portfolio_id: int
    points:       list[HistoryPoint]
    count:        int
    has_data:     bool
    note:         Optional[str] = None
    # Range info when data is present
    earliest_date: Optional[str] = None
    latest_date:   Optional[str] = None
    # Build status — lets frontend distinguish building / failed / done / unknown
    build_status:  Optional[str] = None   # pending | building | done | failed | unknown
    build_note:    Optional[str] = None   # human-readable status note


class HistoryBuildStatusResponse(BaseModel):
    portfolio_id:   int
    status:         str            # pending | building | done | failed | unknown
    rows_written:   int
    benchmark_rows: int
    error:          Optional[str] = None
    note:           Optional[str] = None
    started_at:     Optional[str] = None
    finished_at:    Optional[str] = None
    # Derived convenience field: whether the build is still in progress
    is_building:    bool


class SincePurchaseHolding(BaseModel):
    ticker:          str
    name:            str
    sector:          Optional[str] = None
    quantity:        float
    average_cost:    float           # price paid per share
    current_price:   Optional[float] = None
    invested:        float            # average_cost × quantity
    current_value:   Optional[float] = None   # current_price × quantity (None if no live price)
    pnl:             Optional[float] = None   # current_value − invested
    pnl_pct:         Optional[float] = None   # pnl / invested × 100
    price_source:    str             # 'live_at_upload' | 'cost_basis_only'


class SincePurchaseSummary(BaseModel):
    total_invested:       float
    total_current_value:  Optional[float] = None
    total_pnl:            Optional[float] = None
    total_pnl_pct:        Optional[float] = None
    winners:              int   # holdings with pnl > 0
    losers:               int   # holdings with pnl < 0
    flat:                 int   # holdings with no price or pnl ≈ 0
    price_freshness_note: str   # honest label about when prices were last fetched


class SincePurchaseResponse(BaseModel):
    portfolio_id: int
    holdings:     list[SincePurchaseHolding]
    summary:      SincePurchaseSummary


class HoldingStatus(BaseModel):
    id:                  int
    ticker:              str
    name:                str
    normalized_ticker:   Optional[str] = None
    enrichment_status:   Optional[str] = None   # enriched | partial | failed | pending
    sector_status:       Optional[str] = None   # from_file | yfinance | fmp | static_map | unknown
    fundamentals_status: Optional[str] = None   # fetched | unavailable | pending
    peers_status:        Optional[str] = None   # found | none | pending
    last_enriched_at:    Optional[str] = None   # ISO datetime string
    failure_reason:      Optional[str] = None


class HoldingsStatusSummary(BaseModel):
    total:           int
    enriched:        int
    partial:         int
    failed:          int
    sector_unknown:  int
    no_fundamentals: int
    no_peers:        int


class HoldingsStatusResponse(BaseModel):
    portfolio_id: int
    holdings:     list[HoldingStatus]
    summary:      HoldingsStatusSummary


# ─── Portfolio daily history ──────────────────────────────────────────────────

@router.get(
    "/portfolios/{portfolio_id}/history",
    response_model=PortfolioHistoryResponse,
    summary="Daily portfolio value history",
)
async def get_portfolio_history(
    portfolio_id: int,
    db: DbSession,
) -> PortfolioHistoryResponse:
    """
    Returns the daily portfolio value time series for the given portfolio.

    Data is pre-computed at upload time using 1-year historical prices × current
    holdings quantities.  If no data is available yet (e.g. first startup before
    any upload), returns has_data=False with an empty points list — not a 404.

    **Important caveat (displayed by the frontend):**
    Values assume *current holdings quantities* were held throughout the year.
    This is a synthetic "mark-to-market" view, not actual historical performance.
    """
    from app.services.history_service import get_portfolio_history, get_history_build_status

    # Verify portfolio exists
    from app.models.portfolio import Portfolio
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if portfolio is None:
        raise HTTPException(status_code=404, detail=f"Portfolio {portfolio_id} not found")

    points_raw = get_portfolio_history(portfolio_id, db)
    points = [HistoryPoint(**p) for p in points_raw]

    # Always include build status so the frontend can show appropriate UI state
    bst = get_history_build_status(portfolio_id)
    build_status = bst["status"]

    if not points:
        # Distinguish "building now" from "genuinely no data"
        if build_status in ("pending", "building"):
            note = "History is being built — check back in a few seconds."
        elif build_status == "failed":
            note = f"History build failed: {bst.get('error') or 'unknown error'}."
        elif build_status == "done":
            note = "History build completed but no rows were stored. Check ticker validity."
        else:
            # unknown — server restarted or upload predates this feature
            note = "No historical data yet. Data is fetched automatically after upload."

        return PortfolioHistoryResponse(
            portfolio_id=portfolio_id,
            points=[],
            count=0,
            has_data=False,
            note=note,
            build_status=build_status,
            build_note=bst.get("note"),
        )

    return PortfolioHistoryResponse(
        portfolio_id=portfolio_id,
        points=points,
        count=len(points),
        has_data=True,
        earliest_date=points[0].date,
        latest_date=points[-1].date,
        note=(
            "Estimated daily value based on current holdings × historical prices. "
            "Assumes current quantities were held throughout the period."
        ),
        build_status=build_status,
        build_note=bst.get("note"),
    )


# ─── Benchmark history ────────────────────────────────────────────────────────

@router.get(
    "/portfolios/{portfolio_id}/history/benchmark",
    response_model=list[BenchmarkPoint],
    summary="Benchmark index daily history",
)
async def get_benchmark_history(
    portfolio_id: int,
    db: DbSession,
    ticker: str = Query(default="^NSEI", description="Benchmark ticker (default: ^NSEI / Nifty 50)"),
) -> list[BenchmarkPoint]:
    """
    Returns daily close prices for the specified benchmark index.
    Data is stored when the portfolio history was last built.

    The frontend normalises benchmark values to the portfolio's starting value
    so they can be overlaid on the same chart.
    """
    from app.services.history_service import get_benchmark_history

    points_raw = get_benchmark_history(ticker, db)
    return [BenchmarkPoint(**p) for p in points_raw]


# ─── Holdings enrichment status ───────────────────────────────────────────────

@router.get(
    "/portfolios/{portfolio_id}/holdings/status",
    response_model=HoldingsStatusResponse,
    summary="Per-holding enrichment and data status",
)
async def get_holdings_status(
    portfolio_id: int,
    db: DbSession,
) -> HoldingsStatusResponse:
    """
    Returns enrichment status for every holding in the portfolio.

    Use this after upload to inspect which holdings have partial/failed enrichment,
    unknown sector, unavailable fundamentals, or missing peer data.

    The status fields are written to the DB during the enrichment step of the
    upload pipeline and survive backend restarts.

    Status field meanings:
      enrichment_status:   enriched | partial | failed | pending
      sector_status:       from_file | yfinance | fmp | static_map | unknown
      fundamentals_status: fetched | unavailable | pending
      peers_status:        found | none | pending
    """
    from app.models.portfolio import Portfolio, Holding

    # Verify portfolio exists
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if portfolio is None:
        raise HTTPException(status_code=404, detail=f"Portfolio {portfolio_id} not found")

    holdings = (
        db.query(Holding)
        .filter(Holding.portfolio_id == portfolio_id)
        .order_by(Holding.ticker)
        .all()
    )

    holding_statuses: list[HoldingStatus] = []
    for h in holdings:
        last_enriched: Optional[str] = None
        if h.last_enriched_at is not None:
            try:
                last_enriched = h.last_enriched_at.isoformat()
            except AttributeError:
                last_enriched = str(h.last_enriched_at)

        holding_statuses.append(
            HoldingStatus(
                id=h.id,
                ticker=h.ticker,
                name=h.name,
                normalized_ticker=h.normalized_ticker,
                enrichment_status=h.enrichment_status,
                sector_status=h.sector_status,
                fundamentals_status=h.fundamentals_status,
                peers_status=h.peers_status,
                last_enriched_at=last_enriched,
                failure_reason=h.failure_reason,
            )
        )

    # Build summary counters
    total           = len(holding_statuses)
    enriched        = sum(1 for s in holding_statuses if s.enrichment_status == "enriched")
    partial         = sum(1 for s in holding_statuses if s.enrichment_status == "partial")
    failed          = sum(1 for s in holding_statuses if s.enrichment_status == "failed")
    sector_unknown  = sum(1 for s in holding_statuses if s.sector_status == "unknown")
    no_fundamentals = sum(
        1 for s in holding_statuses
        if s.fundamentals_status in ("unavailable", None)
    )
    no_peers        = sum(
        1 for s in holding_statuses
        if s.peers_status in ("none", "pending", None)
    )

    return HoldingsStatusResponse(
        portfolio_id=portfolio_id,
        holdings=holding_statuses,
        summary=HoldingsStatusSummary(
            total=total,
            enriched=enriched,
            partial=partial,
            failed=failed,
            sector_unknown=sector_unknown,
            no_fundamentals=no_fundamentals,
            no_peers=no_peers,
        ),
    )


# ─── History build status (lightweight polling) ───────────────────────────────

@router.get(
    "/portfolios/{portfolio_id}/history/build-status",
    response_model=HistoryBuildStatusResponse,
    summary="Lightweight history build status for polling",
)
async def get_history_build_status_endpoint(
    portfolio_id: int,
    db: DbSession,
) -> HistoryBuildStatusResponse:
    """
    Returns the current history build status without fetching the full time series.

    Use this for lightweight polling on the Changes page to show a progress banner
    while the background task is running.  Once status is 'done' or 'failed',
    poll the main /history endpoint to get or confirm absence of data.

    Status values:
      pending  — upload completed but background task hasn't started yet
      building — background task is actively fetching and storing data
      done     — build completed; rows are in the portfolio_history table
      failed   — build encountered an error; error field explains why
      unknown  — no upload has been triggered in this server session
                 (server may have restarted; check /history for existing data)
    """
    from app.services.history_service import get_history_build_status

    from app.models.portfolio import Portfolio
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if portfolio is None:
        raise HTTPException(status_code=404, detail=f"Portfolio {portfolio_id} not found")

    bst = get_history_build_status(portfolio_id)
    status = bst["status"]

    return HistoryBuildStatusResponse(
        portfolio_id=portfolio_id,
        status=status,
        rows_written=bst["rows_written"],
        benchmark_rows=bst["benchmark_rows"],
        error=bst.get("error"),
        note=bst.get("note"),
        started_at=bst.get("started_at"),
        finished_at=bst.get("finished_at"),
        is_building=status in ("pending", "building"),
    )


# ─── Canonical history status — /history/{id}/status ────────────────────────
# These are the endpoints that api.ts historyApi.getStatus() and getDaily() call.
# They differ from the older /portfolios/{id}/history/build-status in two ways:
#   1. They live under /history/{id}/... (not /portfolios/{id}/history/...)
#   2. Status does a DB row-count fallback when in-memory status is "unknown" —
#      so a server restart doesn't make the frontend think there's no history.

class CanonicalHistoryStatus(BaseModel):
    portfolio_id:   int
    status:         str            # building | complete | failed | not_started
    rows:           int            # DB row count (authoritative)
    earliest_date:  Optional[str] = None
    latest_date:    Optional[str] = None
    error:          Optional[str] = None
    note:           Optional[str] = None
    is_building:    bool           # convenience flag
    has_data:       bool           # True when rows > 0
    # ISO-8601 UTC timestamp of when this response was assembled.
    # Aligned with as_of fields in /analytics/ratios, /quant/full, and /peers/{ticker}.
    as_of:          Optional[str] = None


class CanonicalHistoryDaily(BaseModel):
    portfolio_id:  int
    state:         str                 # complete | building | failed | not_started
    points:        list[HistoryPoint]  # empty when state != 'complete'
    count:         int
    has_data:      bool
    earliest_date: Optional[str] = None
    latest_date:   Optional[str] = None
    note:          Optional[str] = None
    build_status:  Optional[str] = None   # canonical mirror of state for compatibility
    # ISO-8601 UTC timestamp of when this response was assembled.
    as_of:         Optional[str] = None


@router.get(
    "/history/{portfolio_id}/status",
    response_model=CanonicalHistoryStatus,
    summary="Canonical history build status (DB-aware after server restart)",
)
async def get_canonical_history_status(
    portfolio_id: int,
    db: DbSession,
) -> CanonicalHistoryStatus:
    """
    Canonical status for the history build.  Returns the in-memory build status,
    but when the server has restarted (status='unknown'), it checks the DB to see
    if rows actually exist — and returns 'complete' if they do.

    This prevents the frontend from treating a server restart as "no data ever built".

    Status values:
      building     — task actively running
      complete     — rows exist in DB (either just built or from a prior session)
      failed       — build failed; error field explains why
      not_started  — no upload has occurred for this portfolio
    """
    from app.services.history_service import get_history_build_status, get_portfolio_history_status
    from app.models.portfolio import Portfolio

    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if portfolio is None:
        raise HTTPException(status_code=404, detail=f"Portfolio {portfolio_id} not found")

    bst = get_history_build_status(portfolio_id)
    in_memory_status = bst["status"]

    # DB check — authoritative row count and date range
    db_status = get_portfolio_history_status(portfolio_id, db)
    row_count = db_status.get("count", 0)

    resolved_status = _resolve_canonical_history_status(in_memory_status, row_count)

    return CanonicalHistoryStatus(
        portfolio_id=portfolio_id,
        status=resolved_status,
        rows=row_count,
        earliest_date=db_status.get("earliest"),
        latest_date=db_status.get("latest"),
        error=bst.get("error"),
        note=bst.get("note"),
        is_building=resolved_status == "building",
        has_data=row_count > 0,
        as_of=datetime.now(timezone.utc).isoformat(),
    )


@router.get(
    "/history/{portfolio_id}/daily",
    response_model=CanonicalHistoryDaily,
    summary="Canonical daily portfolio value series with discriminated state",
)
async def get_canonical_history_daily(
    portfolio_id: int,
    db: DbSession,
) -> CanonicalHistoryDaily:
    """
    Returns the daily portfolio value time series along with a discriminated `state` field.

    Unlike the legacy /portfolios/{id}/history, this endpoint never returns a
    misleading empty series — it tells you exactly why it's empty:
      complete     — points[] contains real data; has_data=True
      building     — task in progress; points=[] but will arrive soon
      failed       — build errored; points=[] permanently unless re-uploaded
      not_started  — no history was ever built; upload again to trigger

    The frontend should poll this endpoint (e.g. every 5s) while state='building'.
    """
    from app.services.history_service import get_history_build_status, get_portfolio_history, get_portfolio_history_status
    from app.models.portfolio import Portfolio

    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if portfolio is None:
        raise HTTPException(status_code=404, detail=f"Portfolio {portfolio_id} not found")

    bst = get_history_build_status(portfolio_id)
    in_memory_status = bst["status"]

    # Fetch actual DB rows (cheap — just a query)
    points_raw = get_portfolio_history(portfolio_id, db)
    points = [HistoryPoint(**p) for p in points_raw]
    has_data = len(points) > 0

    state = _resolve_canonical_daily_state(in_memory_status, has_data)

    note: Optional[str] = None
    if state == "complete":
        note = (
            "Estimated daily value based on current holdings × historical prices. "
            "Assumes current quantities were held throughout the period."
        )
    elif state == "building":
        note = "History is being built — fetching 1-year daily prices. Check back in a few seconds."
    elif state == "failed":
        note = f"History build failed: {bst.get('error') or 'unknown error'}."
    elif state == "not_started":
        note = "No historical data. Data is fetched automatically on upload."

    return CanonicalHistoryDaily(
        portfolio_id=portfolio_id,
        state=state,
        points=points,
        count=len(points),
        has_data=has_data,
        earliest_date=points[0].date if points else None,
        latest_date=points[-1].date if points else None,
        note=note,
        build_status=state,
        as_of=datetime.now(timezone.utc).isoformat(),
    )


# ─── Since-purchase P&L ───────────────────────────────────────────────────────

@router.get(
    "/portfolios/{portfolio_id}/holdings/since-purchase",
    response_model=SincePurchaseResponse,
    summary="Per-holding P&L since average purchase price",
)
async def get_holdings_since_purchase(
    portfolio_id: int,
    db: DbSession,
) -> SincePurchaseResponse:
    """
    Returns per-holding P&L computed from average_cost × quantity vs
    current_price × quantity.

    All values come from the DB — no extra network calls at request time.
    current_price is the live price fetched once at upload time; if it was
    not available at upload, we fall back to average_cost (zero P&L shown).

    Price freshness is reported honestly in summary.price_freshness_note.

    This powers the "Since Purchase" panel on the Changes page and answers
    the question: "How am I doing vs what I paid?"
    """
    from app.models.portfolio import Portfolio, Holding
    from app.models.portfolio import Portfolio as _Portfolio

    portfolio = db.query(_Portfolio).filter(_Portfolio.id == portfolio_id).first()
    if portfolio is None:
        raise HTTPException(status_code=404, detail=f"Portfolio {portfolio_id} not found")

    holdings_db = (
        db.query(Holding)
        .filter(Holding.portfolio_id == portfolio_id)
        .order_by(Holding.ticker)
        .all()
    )

    result_holdings: list[SincePurchaseHolding] = []
    total_invested = 0.0
    total_current  = 0.0
    any_live_price = False

    for h in holdings_db:
        qty         = float(h.quantity or 0)
        avg_cost    = float(h.average_cost or 0)
        cur_price   = float(h.current_price) if h.current_price else None

        invested      = avg_cost * qty
        current_value = cur_price * qty if cur_price is not None else None
        pnl           = (current_value - invested) if current_value is not None else None
        pnl_pct       = (pnl / invested * 100) if (pnl is not None and invested > 0) else None
        price_source  = "live_at_upload" if cur_price is not None else "cost_basis_only"

        if cur_price is not None:
            any_live_price = True

        total_invested += invested
        if current_value is not None:
            total_current += current_value

        result_holdings.append(
            SincePurchaseHolding(
                ticker=h.ticker,
                name=h.name or h.ticker,
                sector=h.sector,
                quantity=qty,
                average_cost=avg_cost,
                current_price=cur_price,
                invested=invested,
                current_value=current_value,
                pnl=pnl,
                pnl_pct=pnl_pct,
                price_source=price_source,
            )
        )

    # Sort: biggest winners first, then losers, then no-price holdings
    result_holdings.sort(
        key=lambda x: (x.pnl is None, -(x.pnl or 0)),
    )

    total_pnl     = (total_current - total_invested) if any_live_price else None
    total_pnl_pct = (total_pnl / total_invested * 100) if (total_pnl is not None and total_invested > 0) else None
    winners = sum(1 for h in result_holdings if h.pnl is not None and h.pnl > 0)
    losers  = sum(1 for h in result_holdings if h.pnl is not None and h.pnl < 0)
    flat    = len(result_holdings) - winners - losers

    freshness_note = (
        "Prices fetched from Yahoo Finance at upload time."
        if any_live_price
        else "No live prices available — P&L cannot be computed. Values show cost basis only."
    )

    # Attach upload date from portfolio for richer context
    if portfolio.last_synced_at:
        try:
            synced_str = portfolio.last_synced_at.strftime("%d %b %Y")
            freshness_note = f"Prices fetched from Yahoo Finance on {synced_str} (at upload)."
        except AttributeError:
            pass

    return SincePurchaseResponse(
        portfolio_id=portfolio_id,
        holdings=result_holdings,
        summary=SincePurchaseSummary(
            total_invested=round(total_invested, 2),
            total_current_value=round(total_current, 2) if any_live_price else None,
            total_pnl=round(total_pnl, 2) if total_pnl is not None else None,
            total_pnl_pct=round(total_pnl_pct, 2) if total_pnl_pct is not None else None,
            winners=winners,
            losers=losers,
            flat=flat,
            price_freshness_note=freshness_note,
        ),
    )
