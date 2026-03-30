"""
Efficient Frontier API Endpoints  [Phase 2 — scaffold]
-------------------------------------------------------
Returns efficient frontier data for portfolio optimization chart.
Phase 1: Scaffold response. Phase 2: Powered by PyPortfolioOpt.
"""

from fastapi import APIRouter
from app.core.dependencies import DataProvider
from app.analytics.optimization import compute_efficient_frontier

router = APIRouter(prefix="/frontier", tags=["Efficient Frontier"])


@router.get("/", summary="Get efficient frontier data")
async def get_efficient_frontier(provider: DataProvider):
    """
    Return portfolio optimization data: efficient frontier curve,
    minimum variance portfolio, and maximum Sharpe portfolio.
    Phase 2: Requires historical price data from Live API mode.
    """
    result = compute_efficient_frontier(price_histories={})
    return {
        **result,
        "data_mode": provider.mode_name,
        "message": "Efficient frontier optimization requires Phase 2 (Live API data).",
    }
