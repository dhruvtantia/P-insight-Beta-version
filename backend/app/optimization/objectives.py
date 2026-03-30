"""
Portfolio Objective Functions
------------------------------
Pure, stateless functions operating on numpy arrays only.
No pandas, no I/O, no side effects.

These are the mathematical building blocks used by the optimizer.
All can be called independently by downstream consumers (simulation,
advisor, rebalancing engine).
"""

from __future__ import annotations
import numpy as np


# ─── Core portfolio math ──────────────────────────────────────────────────────

def portfolio_return(weights: np.ndarray, expected_returns: np.ndarray) -> float:
    """Compute expected portfolio return: w^T μ"""
    return float(np.dot(weights, expected_returns))


def portfolio_variance(weights: np.ndarray, cov_matrix: np.ndarray) -> float:
    """Compute portfolio variance: w^T Σ w"""
    return float(weights @ cov_matrix @ weights)


def portfolio_volatility(weights: np.ndarray, cov_matrix: np.ndarray) -> float:
    """Compute annualised portfolio volatility: sqrt(w^T Σ w)"""
    var = portfolio_variance(weights, cov_matrix)
    return float(np.sqrt(max(var, 0.0)))


def sharpe_ratio(
    weights: np.ndarray,
    expected_returns: np.ndarray,
    cov_matrix: np.ndarray,
    risk_free_rate: float = 0.065,
) -> float:
    """
    Annualised Sharpe ratio: (μ_p - r_f) / σ_p

    Returns -inf if σ_p == 0 (degenerate portfolio).
    """
    ret  = portfolio_return(weights, expected_returns)
    vol  = portfolio_volatility(weights, cov_matrix)
    if vol <= 1e-10:
        return float('-inf')
    return float((ret - risk_free_rate) / vol)


# ─── Objective functions for scipy.optimize.minimize ─────────────────────────

def negative_sharpe(
    weights: np.ndarray,
    expected_returns: np.ndarray,
    cov_matrix: np.ndarray,
    risk_free_rate: float,
) -> float:
    """Negative Sharpe (for minimization → maximising Sharpe)."""
    return -sharpe_ratio(weights, expected_returns, cov_matrix, risk_free_rate)


def portfolio_variance_objective(weights: np.ndarray, cov_matrix: np.ndarray) -> float:
    """0.5 × w^T Σ w — factor of 0.5 for cleaner gradients (does not affect solution)."""
    return 0.5 * portfolio_variance(weights, cov_matrix)


# ─── Convenience: evaluate a full portfolio point ─────────────────────────────

def evaluate_portfolio(
    weights: np.ndarray,
    expected_returns: np.ndarray,
    cov_matrix: np.ndarray,
    risk_free_rate: float = 0.065,
    label: str = "",
) -> dict:
    """
    Compute all metrics for a given weight vector.
    Returns a dict (not a PortfolioPoint to avoid circular imports).
    """
    ret  = portfolio_return(weights, expected_returns)
    vol  = portfolio_volatility(weights, cov_matrix)
    sr   = (ret - risk_free_rate) / vol if vol > 1e-10 else float('-inf')
    return {
        "label":           label,
        "expected_return": round(ret * 100, 4),    # convert to %
        "volatility":      round(vol * 100, 4),    # convert to %
        "sharpe_ratio":    round(sr, 4),
        "weights":         weights.tolist(),
    }


# ─── Weight utilities ─────────────────────────────────────────────────────────

def equal_weights(n: int) -> np.ndarray:
    """Equal-weight portfolio."""
    return np.ones(n) / n


def weight_from_dict(tickers: list[str], weight_dict: dict[str, float]) -> np.ndarray:
    """Convert ticker → weight dict to ordered numpy array."""
    total = sum(weight_dict.values())
    return np.array([weight_dict.get(t, 0.0) / total for t in tickers])


def normalise_weights(weights: np.ndarray, clip_negative: bool = True) -> np.ndarray:
    """Normalise weights to sum to 1. Optionally clips negatives to zero."""
    w = weights.copy()
    if clip_negative:
        w = np.maximum(w, 0.0)
    total = w.sum()
    if total <= 1e-10:
        return equal_weights(len(w))
    return w / total
