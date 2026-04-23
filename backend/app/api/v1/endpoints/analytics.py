"""
Analytics API Endpoints
-------------------------
Risk metrics, financial ratios, and portfolio insights.

/analytics/ratios  — per-holding fundamentals + weighted metrics + thresholds + trust metadata
/analytics/risk    — scaffold (quant analytics live on /quant/full)
/analytics/commentary — rule-based portfolio insights

Weighted metrics and threshold constants are owned by:
  app/services/fundamentals_view_service.py

The /analytics/ratios response ships `thresholds` so the frontend never
hardcodes threshold values — it reads them from the API response.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from app.core.dependencies import DbSession, DataProvider
from app.services.portfolio_service import PortfolioService
from app.services.fundamentals_view_service import (
    compute_weighted_metrics,
    build_thresholds,
)
from app.analytics.commentary import generate_commentary
from app.schemas.portfolio import (
    RiskMetrics,
    SectorAllocation,
    FinancialRatioResponse,
    WeightedFundamentals,
    FundamentalsMeta,
    FinancialRatiosResponse,
)

router = APIRouter(prefix="/analytics", tags=["Analytics"])
logger = logging.getLogger(__name__)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/risk", response_model=RiskMetrics, summary="Get risk metrics")
async def get_risk_metrics(db: DbSession, provider: DataProvider):
    """
    Return portfolio risk metrics: beta, Sharpe ratio, volatility, drawdown.
    Phase 1: Returns scaffold response with note.
    Phase 2: Compute from historical price data.
    Full quant analytics (with live data) are available at /quant/full.
    """
    # TODO (Phase 2): Pull price history, compute returns, call analytics/risk.py
    return RiskMetrics(
        beta=None,
        sharpe_ratio=None,
        volatility_annualised=None,
        max_drawdown=None,
        var_95=None,
        note="Risk metrics require historical price data. Available in Phase 2 (Live API mode).",
    )


# ── Fields forwarded from the provider fundamentals dict to FinancialRatioResponse
_RATIO_PASSTHROUGH_KEYS = frozenset({
    "source",
    "pe_ratio", "forward_pe", "pb_ratio", "ev_ebitda", "peg_ratio",
    "dividend_yield",
    "roe", "roa", "operating_margin", "profit_margin",
    "revenue_growth", "earnings_growth",
    "debt_to_equity", "market_cap",
    "industry",
    # Trust / freshness fields
    "error", "fetched_at", "cache_age_seconds",
})


@router.get(
    "/ratios",
    response_model=FinancialRatiosResponse,
    summary="Get financial ratios with portfolio-weighted metrics and trust metadata",
)
async def get_financial_ratios(db: DbSession, provider: DataProvider):
    """
    Return fundamentals and valuation ratios for each holding, plus:
      - portfolio-level weighted-average metrics (PE, PB, ROE, etc.)
      - trust / completeness metadata (source, incomplete flag, unavailable tickers)

    Holdings with unavailable fundamentals are included in the response with
    source='unavailable' and an error field — they are NOT silently dropped.
    This prevents callers from presenting partial data as if it were complete.

    Per-holding fields:
      Valuation: pe_ratio, forward_pe, pb_ratio, ev_ebitda, peg_ratio
      Income:    dividend_yield
      Quality:   roe, roa, operating_margin, profit_margin
      Growth:    revenue_growth, earnings_growth
      Balance:   debt_to_equity, market_cap
      Trust:     source, error, fetched_at, cache_age_seconds

    Portfolio-level weighted fields:
      wtd_pe, wtd_pb, wtd_roe, wtd_roa, wtd_ev_ebitda, wtd_peg,
      wtd_div_yield, wtd_operating_margin, wtd_profit_margin,
      wtd_revenue_growth, wtd_earnings_growth, wtd_debt_to_equity
      + coverage counts per metric

    Null values for individual metrics indicate not applicable for that business
    type (e.g. banks: null ev_ebitda, operating_margin, debt_to_equity).
    """
    holdings = await provider.get_holdings()

    as_of = datetime.now(timezone.utc).isoformat()

    if not holdings:
        return FinancialRatiosResponse(
            holdings=[],
            weighted=WeightedFundamentals(),
            meta=FundamentalsMeta(
                as_of=as_of,
                incomplete=False,
                total_holdings=0,
                available_holdings=0,
            ),
            thresholds=build_thresholds(),
        )

    # ── Compute holding weights (needed for weighted metric calculation) ───────
    total_value = sum(
        h.quantity * (h.current_price or h.average_cost) for h in holdings
    )
    weights: dict[str, float] = {}
    for h in holdings:
        market_val = h.quantity * (h.current_price or h.average_cost)
        weights[h.ticker] = (market_val / total_value) if total_value > 0 else 0.0

    # ── Fetch per-holding fundamentals ────────────────────────────────────────
    ratio_list:          list[FinancialRatioResponse] = []
    unavailable_tickers: list[str]                    = []

    for h in holdings:
        fundamentals = await provider.get_fundamentals(h.ticker)

        is_unavailable = (
            not fundamentals
            or fundamentals.get("source") == "unavailable"
        )

        if is_unavailable:
            unavailable_tickers.append(h.ticker)
            logger.debug(
                "Fundamentals unavailable for %s: %s",
                h.ticker,
                fundamentals.get("error", "no data returned"),
            )

        # Forward only the fields FinancialRatioResponse knows about.
        # Extra keys (e.g. resolved_ticker, sector_source) are stripped here
        # rather than relying on Pydantic's silent extra-field handling.
        extra = {k: v for k, v in fundamentals.items() if k in _RATIO_PASSTHROUGH_KEYS}

        ratio_list.append(FinancialRatioResponse(
            ticker=h.ticker,
            name=fundamentals.get("name") or h.name,
            sector=fundamentals.get("sector") or h.sector,
            **extra,
        ))

    # ── Compute weighted portfolio metrics (owned by fundamentals_view_service) ─
    weighted = compute_weighted_metrics(ratio_list, weights)

    # ── Build trust metadata ──────────────────────────────────────────────────
    available_count = len(holdings) - len(unavailable_tickers)

    # Count how many holdings have an unknown or missing sector
    unknown_sectors = sum(
        1 for r in ratio_list
        if not r.sector or r.sector.strip().lower() in ("unknown", "")
    )

    # Sum all outlier exclusions across all metrics
    outliers_total = sum(weighted.outliers_excluded.values())

    meta = FundamentalsMeta(
        source="yfinance",
        as_of=as_of,
        incomplete=len(unavailable_tickers) > 0,
        total_holdings=len(holdings),
        available_holdings=available_count,
        unavailable_tickers=unavailable_tickers,
        coverage_pct=round(available_count / len(holdings) * 100, 1) if holdings else None,
        outliers_excluded_total=outliers_total,
        unknown_sectors_count=unknown_sectors,
    )

    return FinancialRatiosResponse(
        holdings=ratio_list,
        weighted=weighted,
        meta=meta,
        thresholds=build_thresholds(),
    )


@router.get("/commentary", summary="Get AI-style portfolio commentary")
async def get_commentary(db: DbSession, provider: DataProvider):
    """
    Return rule-based portfolio insights and commentary.
    Phase 1: Derived from summary and sector data.
    Phase 2: Fed as context to AI Chat module.
    """
    service = PortfolioService(db, provider)
    summary = await service.get_summary()
    sectors = await service.get_sector_allocation()
    insights = generate_commentary(summary=summary, sectors=sectors)
    return {"insights": insights, "total": len(insights)}
