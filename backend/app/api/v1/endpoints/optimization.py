"""
Portfolio Optimization API Endpoints
--------------------------------------
GET /optimization/full   — full result: frontier, min-var, max-Sharpe, rebalance deltas
GET /optimization/status — meta only (fast, for debug panel)

Both accept:
  ?mode=mock|live             (default: mock)
  ?period=1y|6mo|3mo         (default: 1y)
  ?er_method=historical_mean  (default: historical_mean)
  ?cov_method=auto            (default: auto)
"""

import logging
from fastapi import APIRouter, Query
from typing import Literal

from app.core.dependencies import DataProvider
from app.optimization.optimizer_service import OptimizerService
from app.schemas.optimization import OptimizationFullResponse
from app.services.feature_registry import require_feature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/optimization", tags=["Portfolio Optimization"])


@router.get(
    "/full",
    response_model=OptimizationFullResponse,
    summary="Full portfolio optimization — efficient frontier + optimal portfolios",
)
async def get_optimization_full(
    provider: DataProvider,
    period: str = Query("1y", description="Price history period: 1y | 6mo | 3mo"),
    er_method: str = Query(
        "historical_mean",
        description="Expected returns estimation method: historical_mean | ema_mean",
    ),
    cov_method: str = Query(
        "auto",
        description="Covariance estimation method: sample | ledoit_wolf | auto",
    ),
    n_points: int = Query(
        40,
        ge=10, le=100,
        description="Number of efficient frontier points to compute",
    ),
):
    """
    Compute the full portfolio optimization result.

    Returns:
    - **current**: Current portfolio point on the risk/return plane
    - **min_variance**: Global minimum variance portfolio weights
    - **max_sharpe**: Maximum Sharpe ratio (tangency) portfolio weights
    - **frontier**: Efficient frontier — ordered list of (vol, return) points
    - **rebalance**: Buy/sell recommendations to move from current → max_sharpe
    - **inputs**: Expected returns and covariance diagonal (for debug/audit)
    - **meta**: Computation metadata, method choices, exclusions
    """
    require_feature("risk_quant")
    service = OptimizerService(provider)
    result  = await service.compute(
        period=period,
        expected_returns_method=er_method,
        covariance_method=cov_method,
        n_frontier_points=n_points,
    )
    return result


@router.get(
    "/status",
    summary="Optimization metadata — quick status check without full compute",
)
async def get_optimization_status(
    provider: DataProvider,
    period: str = Query("1y"),
):
    """
    Return only the meta section (fast). Used by the debug panel.
    """
    require_feature("risk_quant")
    service = OptimizerService(provider)
    result  = await service.compute(period=period)
    return result.get("meta", {})
