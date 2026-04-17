"""
Analytics API Endpoints
-------------------------
Risk metrics, financial ratios, and portfolio insights.

/analytics/ratios  — per-holding fundamentals + portfolio-weighted metrics + trust metadata
/analytics/risk    — scaffold (quant analytics live on /quant/full)
/analytics/commentary — rule-based portfolio insights
"""

import math
import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from app.core.dependencies import DbSession, DataProvider
from app.services.portfolio_service import PortfolioService
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


# ─── Weighted metrics helper ──────────────────────────────────────────────────

def _compute_weighted_metrics(
    ratios: list[FinancialRatioResponse],
    weights: dict[str, float],
) -> WeightedFundamentals:
    """
    Compute portfolio-weighted average fundamentals.

    Weighting strategy:
      - weight_i = market_value_i / total_portfolio_value
      - If a holding has null for a metric, it is excluded from that metric's average
      - Weights are re-normalised among non-null contributors so nulls don't bias toward zero
      - coverage[key] = count of holdings that contributed a non-null value

    Mirrors the algorithm in frontend/src/lib/fundamentals.ts → computeWeightedMetrics().
    Bank holdings naturally have null ev_ebitda / operating_margin / debt_to_equity —
    this is correct, not missing data.
    """

    def wtd_avg(metric_name: str) -> tuple[float | None, int]:
        weighted_sum = 0.0
        weight_sum = 0.0
        count = 0
        for r in ratios:
            val = getattr(r, metric_name, None)
            if val is None:
                continue
            try:
                fval = float(val)
            except (TypeError, ValueError):
                continue
            if not math.isfinite(fval):
                continue
            w = weights.get(r.ticker, 0.0)
            weighted_sum += w * fval
            weight_sum += w
            count += 1
        if count == 0 or weight_sum == 0:
            return None, 0
        # Re-normalise: divide by weight_sum (sum of weights of non-null holders only)
        return round(weighted_sum / weight_sum, 4), count

    pe,         pe_n         = wtd_avg("pe_ratio")
    fwd_pe,     fwd_pe_n     = wtd_avg("forward_pe")
    pb,         pb_n         = wtd_avg("pb_ratio")
    ev_ebitda,  ev_ebitda_n  = wtd_avg("ev_ebitda")
    peg,        peg_n        = wtd_avg("peg_ratio")
    div_yield,  div_yield_n  = wtd_avg("dividend_yield")
    roe,        roe_n        = wtd_avg("roe")
    roa,        roa_n        = wtd_avg("roa")
    op_margin,  op_margin_n  = wtd_avg("operating_margin")
    pr_margin,  pr_margin_n  = wtd_avg("profit_margin")
    rev_growth, rev_growth_n = wtd_avg("revenue_growth")
    ear_growth, ear_growth_n = wtd_avg("earnings_growth")
    dte,        dte_n        = wtd_avg("debt_to_equity")

    return WeightedFundamentals(
        wtd_pe=pe,
        wtd_forward_pe=fwd_pe,
        wtd_pb=pb,
        wtd_ev_ebitda=ev_ebitda,
        wtd_peg=peg,
        wtd_div_yield=div_yield,
        wtd_roe=roe,
        wtd_roa=roa,
        wtd_operating_margin=op_margin,
        wtd_profit_margin=pr_margin,
        wtd_revenue_growth=rev_growth,
        wtd_earnings_growth=ear_growth,
        wtd_debt_to_equity=dte,
        coverage={
            "pe":               pe_n,
            "forward_pe":       fwd_pe_n,
            "pb":               pb_n,
            "ev_ebitda":        ev_ebitda_n,
            "peg":              peg_n,
            "div_yield":        div_yield_n,
            "roe":              roe_n,
            "roa":              roa_n,
            "operating_margin": op_margin_n,
            "profit_margin":    pr_margin_n,
            "revenue_growth":   rev_growth_n,
            "earnings_growth":  ear_growth_n,
            "debt_to_equity":   dte_n,
        },
    )


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

    # ── Compute weighted portfolio metrics ────────────────────────────────────
    weighted = _compute_weighted_metrics(ratio_list, weights)

    # ── Build trust metadata ──────────────────────────────────────────────────
    available_count = len(holdings) - len(unavailable_tickers)
    meta = FundamentalsMeta(
        source="yfinance",
        as_of=as_of,
        incomplete=len(unavailable_tickers) > 0,
        total_holdings=len(holdings),
        available_holdings=available_count,
        unavailable_tickers=unavailable_tickers,
        coverage_pct=round(available_count / len(holdings) * 100, 1) if holdings else None,
    )

    return FinancialRatiosResponse(
        holdings=ratio_list,
        weighted=weighted,
        meta=meta,
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
