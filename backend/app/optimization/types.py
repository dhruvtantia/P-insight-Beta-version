"""
Optimization Types
------------------
Pure dataclasses for optimizer inputs and outputs.
No Pydantic, no I/O, no side effects.

Kept separate so downstream consumers (simulation, rebalancing,
advisor) can import just the shapes without pulling in optimizer logic.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
import numpy as np


# ─── Constraints ──────────────────────────────────────────────────────────────

@dataclass
class OptimizationConstraints:
    """
    Constraints applied to every optimization solve.
    All are enforced simultaneously.
    """
    long_only:  bool  = True   # w_i >= 0 for all i
    max_weight: float = 0.40   # w_i <= max_weight  (prevents single-stock concentration)
    min_weight: float = 0.0    # w_i >= min_weight  (0 = allow zero allocation)
    fully_invested: bool = True # sum(w_i) = 1


# ─── Optimizer Inputs ─────────────────────────────────────────────────────────

@dataclass
class OptimizationInputs:
    """
    All data required to run portfolio optimization.
    These are pure numpy arrays — no tickers or dates embedded.
    """
    tickers:           list[str]    # Ordered list of ticker labels
    expected_returns:  np.ndarray   # shape (n,) — annualised, decimal (0.12 = 12%)
    covariance_matrix: np.ndarray   # shape (n, n) — annualised
    risk_free_rate:    float        # decimal (0.065 = 6.5%)
    current_weights:   np.ndarray   # shape (n,) — current portfolio allocation, sums to 1
    constraints:       OptimizationConstraints = field(default_factory=OptimizationConstraints)

    # ── Provenance / metadata ──────────────────────────────────────────────────
    expected_returns_method: str = "historical_mean"   # how μ was estimated
    covariance_method:       str = "sample"            # how Σ was estimated
    n_observations:          int = 0                   # number of return observations


# ─── Portfolio Point ──────────────────────────────────────────────────────────

@dataclass
class PortfolioPoint:
    """
    A single portfolio on the risk-return plane.
    Used for frontier points, min-variance, max-Sharpe, and current portfolio.
    """
    weights:          np.ndarray          # shape (n,) — sums to 1
    expected_return:  float               # annualised, % (12.3 = 12.3%)
    volatility:       float               # annualised, % (15.0 = 15.0%)
    sharpe_ratio:     float               # (r - rfr) / σ
    label:            str = ""            # "min_variance", "max_sharpe", "current", "frontier"

    def to_dict(self, tickers: list[str]) -> dict:
        return {
            "label":           self.label,
            "expected_return": round(self.expected_return, 4),
            "volatility":      round(self.volatility, 4),
            "sharpe_ratio":    round(self.sharpe_ratio, 4),
            "weights": {
                t: round(float(w), 6)
                for t, w in zip(tickers, self.weights)
            },
        }


# ─── Optimization Outputs ─────────────────────────────────────────────────────

@dataclass
class OptimizationOutputs:
    """
    Complete result returned by the optimizer.
    Raw outputs — no interpretation text, no formatting.
    """
    current:         PortfolioPoint
    min_variance:    PortfolioPoint
    max_sharpe:      PortfolioPoint
    frontier:        list[PortfolioPoint]     # ordered by increasing volatility

    # ── Inputs echo (for debug / audit) ───────────────────────────────────────
    tickers:                   list[str]
    expected_returns_vector:   np.ndarray    # μ (annualised decimal)
    covariance_matrix:         np.ndarray    # Σ (annualised)
    risk_free_rate:            float

    # ── Provenance ─────────────────────────────────────────────────────────────
    method:                    str = "slsqp"  # "slsqp" | "monte_carlo"
    n_frontier_points:         int = 0
    expected_returns_method:   str = "historical_mean"
    covariance_method:         str = "sample"
    n_observations:            int = 0
    constraints_applied:       list[str] = field(default_factory=list)
    excluded_tickers:          list[str] = field(default_factory=list)

    # ── Rebalance deltas (current → max Sharpe) ────────────────────────────────
    @property
    def rebalance_deltas(self) -> list[dict]:
        """
        What to buy / sell to move from current to max_sharpe.
        Only includes positions with |delta| > 0.3%.
        """
        deltas = []
        for i, ticker in enumerate(self.tickers):
            current_w = float(self.current.weights[i])
            target_w  = float(self.max_sharpe.weights[i])
            delta     = target_w - current_w
            if abs(delta) >= 0.003:   # 0.3% threshold
                deltas.append({
                    "ticker":          ticker,
                    "current_weight":  round(current_w * 100, 2),
                    "target_weight":   round(target_w  * 100, 2),
                    "delta_pct":       round(delta      * 100, 2),
                    "action":          "buy" if delta > 0 else "sell",
                })
        return sorted(deltas, key=lambda x: abs(x["delta_pct"]), reverse=True)
