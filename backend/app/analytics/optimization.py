"""
Portfolio Optimization — Thin re-export shim
----------------------------------------------
The Phase 1 scaffold in this file has been superseded by the full
implementation in app/optimization/.

This module is kept for backward compatibility (frontier.py endpoint
imported compute_efficient_frontier from here in the scaffold).
New code should import directly from app.optimization.*.
"""

from app.optimization.optimizer_service import OptimizerService, _serialize_point  # noqa: F401


def compute_efficient_frontier(price_histories: dict, **kwargs) -> dict:
    """
    Scaffold stub — returns a message pointing to the new optimizer service.
    Call OptimizerService.compute() for the full implementation.
    """
    return {
        "status": "implemented",
        "note": "Use GET /api/v1/optimization/full for the full optimizer.",
        "frontier_points": [],
        "min_variance_portfolio": None,
        "max_sharpe_portfolio": None,
    }


def compute_rebalancing_suggestions(
    current_weights: dict[str, float],
    target_weights:  dict[str, float],
    total_value: float,
) -> list[dict]:
    """
    Simple weight-delta computation.
    For full optimizer-driven suggestions, use OptimizerService.compute().rebalance.
    """
    actions = []
    for ticker in set(list(current_weights.keys()) + list(target_weights.keys())):
        current = current_weights.get(ticker, 0.0)
        target  = target_weights.get(ticker, 0.0)
        diff    = target - current
        if abs(diff) > 0.01:
            actions.append({
                "ticker":           ticker,
                "action":           "buy" if diff > 0 else "sell",
                "weight_change_pct": round(diff * 100, 2),
                "amount":            round(diff * total_value, 2),
            })
    return sorted(actions, key=lambda x: abs(x["weight_change_pct"]), reverse=True)
