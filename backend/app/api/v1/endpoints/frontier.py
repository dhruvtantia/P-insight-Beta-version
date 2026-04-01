"""
Efficient Frontier — Legacy Scaffold Endpoint
----------------------------------------------
This endpoint was a Phase 1 scaffold returning an empty response.

The full efficient frontier implementation now lives at:
  GET /api/v1/optimization/full

This route is retained for backward compatibility and redirects
callers to the correct endpoint.
"""

from fastapi import APIRouter
from app.core.dependencies import DataProvider

router = APIRouter(prefix="/frontier", tags=["Efficient Frontier"])


@router.get("/", summary="[Deprecated] Efficient frontier — use /optimization/full instead")
async def get_efficient_frontier(provider: DataProvider):
    """
    This is a deprecated scaffold endpoint.

    **Use `/api/v1/optimization/full` instead.**

    The full optimizer computes:
    - Efficient frontier curve (40 points by default)
    - Minimum variance portfolio weights
    - Maximum Sharpe ratio portfolio weights
    - Buy/sell rebalancing recommendations
    - Per-ticker history status (valid/excluded)

    Supports modes: mock | live
    """
    return {
        "scaffolded":         True,
        "deprecated":         True,
        "redirect_to":        "/api/v1/optimization/full",
        "data_mode":          provider.mode_name,
        "frontier_points":    [],
        "min_variance_portfolio": None,
        "max_sharpe_portfolio":   None,
        "message": (
            "This endpoint is a deprecated scaffold. "
            "Use GET /api/v1/optimization/full for the complete optimizer result."
        ),
    }
