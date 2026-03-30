"""
Analytics API Endpoints
-------------------------
Risk metrics, financial ratios, and portfolio insights.
Phase 1: Returns mock/placeholder values where live computation requires price history.
Phase 2: Wire up analytics/risk.py with real price data.
"""

from fastapi import APIRouter
from app.core.dependencies import DbSession, DataProvider
from app.services.portfolio_service import PortfolioService
from app.analytics.commentary import generate_commentary
from app.schemas.portfolio import RiskMetrics, SectorAllocation, FinancialRatioResponse

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/risk", response_model=RiskMetrics, summary="Get risk metrics")
async def get_risk_metrics(db: DbSession, provider: DataProvider):
    """
    Return portfolio risk metrics: beta, Sharpe ratio, volatility, drawdown.
    Phase 1: Returns scaffold response with note.
    Phase 2: Compute from historical price data.
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


@router.get("/ratios", response_model=list[FinancialRatioResponse], summary="Get financial ratios for all holdings")
async def get_financial_ratios(db: DbSession, provider: DataProvider):
    """
    Return fundamentals and valuation ratios for each holding.

    Fields returned per holding:
      Valuation: pe_ratio, forward_pe, pb_ratio, ev_ebitda, peg_ratio
      Income:    dividend_yield
      Quality:   roe, roa, operating_margin, profit_margin
      Growth:    revenue_growth, earnings_growth
      Balance:   debt_to_equity, market_cap
      Meta:      industry

    Null values indicate the metric is not applicable for that business type
    (e.g. banks do not have meaningful ev_ebitda, operating_margin, debt_to_equity).

    Phase 1: Returns mock fundamentals from portfolio.json.
    Phase 2: Fetch from yfinance / Financial Modeling Prep API.
    """
    holdings = await provider.get_holdings()
    ratios = []
    for h in holdings:
        fundamentals = await provider.get_fundamentals(h.ticker)
        # Build response — extra fields in fundamentals dict are passed through
        ratios.append(FinancialRatioResponse(
            ticker=h.ticker,
            name=h.name,
            sector=h.sector,
            **{k: v for k, v in fundamentals.items() if k not in ("ticker", "name", "sector")}
        ))
    return ratios


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
