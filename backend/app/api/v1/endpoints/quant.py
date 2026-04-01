"""
Quantitative Analytics API Endpoints — Phase 2
-------------------------------------------------
Exposes market-based portfolio analytics computed from historical price data.

Routes:
  GET /api/v1/quant/full?mode=mock&period=1y
      Full analytics bundle: metrics + performance series + correlation + contributions.
      Results are cached (24h for mock, 10min for live).

  GET /api/v1/quant/status?mode=mock&period=1y
      Metadata only: which tickers have data, date range, benchmark used.
      Safe to call frequently — returns cached meta without expensive recompute.

Period options: 1y | 6mo | 3mo
"""

from fastapi import APIRouter, Query
from typing import Literal

from app.core.dependencies import DataProvider
from app.analytics.quant_service import QuantAnalyticsService
from app.schemas.quant import QuantFullResponse

router = APIRouter(prefix="/quant", tags=["Quantitative Analytics"])

PeriodType = Literal["1y", "6mo", "3mo"]


# ─── GET /quant/full ──────────────────────────────────────────────────────────

@router.get(
    "/full",
    summary="Full quantitative analytics bundle",
    response_model=QuantFullResponse,
)
async def get_quant_full(
    provider: DataProvider,
    period: PeriodType = Query("1y", description="Lookback period: 1y | 6mo | 3mo"),
):
    """
    Returns the complete quantitative analytics package in a single response:

    - **metrics.portfolio** — volatility, beta, Sharpe, Sortino, drawdown, VaR, IR, alpha
    - **metrics.benchmark** — NIFTY 50 standalone metrics for comparison
    - **performance** — portfolio vs benchmark cumulative return time series
    - **drawdown** — portfolio drawdown time series
    - **correlation** — pairwise correlation matrix of all holdings
    - **contributions** — per-holding annualised return, vol, and beta
    - **meta** — which tickers succeeded, date range, benchmark source, risk-free rate

    Results are computed from 1 year of daily historical price data (mock or yfinance).
    Cached for 10 minutes (live) or 24 hours (mock) to avoid repeated price fetches.
    """
    service = QuantAnalyticsService(provider)
    result  = await service.compute_all(period=period)

    # Coerce nested dicts to schema objects for validation
    return _to_response(result)


# ─── GET /quant/status ────────────────────────────────────────────────────────

@router.get("/status", summary="Quantitative analytics status (meta only)")
async def get_quant_status(
    provider: DataProvider,
    period: PeriodType = Query("1y"),
):
    """
    Returns only the meta block from the full analytics computation.
    Useful for the /debug page to inspect data availability without triggering
    the full expensive computation when data is already cached.
    """
    service = QuantAnalyticsService(provider)
    result  = await service.compute_all(period=period)
    return result.get("meta", {})


# ─── Helper ───────────────────────────────────────────────────────────────────

def _to_response(raw: dict) -> QuantFullResponse:
    """
    Convert the raw dict from QuantAnalyticsService into the validated schema.
    Handles missing/null fields gracefully.
    """
    from app.schemas.quant import (
        MetricsBlock, PortfolioRiskMetrics, BenchmarkMetrics,
        PerformanceBlock, TimeSeriesPoint, CorrelationResult,
        PairwisePair, HoldingContribution, QuantMeta, DateRange,
    )

    # ── metrics ──────────────────────────────────────────────────────────────
    m = raw.get("metrics", {})

    p_raw = m.get("portfolio")
    portfolio_metrics = (
        PortfolioRiskMetrics(**{
            k: p_raw.get(k) for k in PortfolioRiskMetrics.model_fields
        })
        if isinstance(p_raw, dict) and "error" not in p_raw
        else PortfolioRiskMetrics(error=p_raw.get("error", "unavailable") if isinstance(p_raw, dict) else "unavailable")
    )

    b_raw = m.get("benchmark")
    benchmark_metrics = (
        BenchmarkMetrics(**b_raw)
        if isinstance(b_raw, dict) and b_raw.get("name")
        else None
    )

    # ── performance ───────────────────────────────────────────────────────────
    perf = raw.get("performance", {})
    portfolio_perf  = [TimeSeriesPoint(**pt) for pt in perf.get("portfolio", [])]
    benchmark_perf  = [TimeSeriesPoint(**pt) for pt in perf.get("benchmark", [])]

    # ── drawdown ──────────────────────────────────────────────────────────────
    drawdown = [TimeSeriesPoint(**pt) for pt in raw.get("drawdown", [])]

    # ── correlation ───────────────────────────────────────────────────────────
    corr_raw = raw.get("correlation", {})
    min_p    = corr_raw.get("min_pair")
    max_p    = corr_raw.get("max_pair")
    correlation = CorrelationResult(
        tickers          = corr_raw.get("tickers", []),
        matrix           = corr_raw.get("matrix", []),
        average_pairwise = corr_raw.get("average_pairwise"),
        min_pair         = PairwisePair(**min_p) if min_p else None,
        max_pair         = PairwisePair(**max_p) if max_p else None,
        interpretation   = corr_raw.get("interpretation"),
    )

    # ── contributions ─────────────────────────────────────────────────────────
    contributions = [
        HoldingContribution(**c) for c in raw.get("contributions", [])
    ]

    # ── meta ──────────────────────────────────────────────────────────────────
    meta_raw   = raw.get("meta", {})
    dr_raw     = meta_raw.get("date_range")
    date_range = DateRange(**dr_raw) if isinstance(dr_raw, dict) else None

    # Build kwargs: use field default when the key is absent from meta_raw
    # (important for new fields like ticker_status/benchmark_available
    #  that may be absent from older cached entries)
    from pydantic.fields import FieldInfo
    meta_kwargs: dict = {}
    for k, field_info in QuantMeta.model_fields.items():
        if k == "date_range":
            continue
        raw_val = meta_raw.get(k)
        if raw_val is None and field_info.default is not None:
            raw_val = field_info.default
        meta_kwargs[k] = raw_val

    meta = QuantMeta(**meta_kwargs, date_range=date_range)

    return QuantFullResponse(
        metrics      = MetricsBlock(portfolio=portfolio_metrics, benchmark=benchmark_metrics),
        performance  = PerformanceBlock(portfolio=portfolio_perf, benchmark=benchmark_perf),
        drawdown     = drawdown,
        correlation  = correlation,
        contributions= contributions,
        meta         = meta,
    )
