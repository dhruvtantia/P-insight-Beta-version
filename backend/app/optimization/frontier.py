"""
Efficient Frontier & Portfolio Optimization
--------------------------------------------
Two computation paths:

  Path A (preferred) — scipy SLSQP:
    For each target return in [μ_min … μ_max]:
      minimize  0.5 × w^T Σ w
      subject to  sum(w) = 1
                  w >= 0            (long-only)
                  w <= max_weight   (concentration limit)
                  w^T μ = r_target  (return constraint)

  Path B (fallback) — Dirichlet Monte Carlo:
    Sample 12,000 random weight vectors from Dirichlet(α=1)
    Evaluate (return, volatility, Sharpe) for each
    Envelope them to approximate the efficient frontier

All functions return PortfolioPoint instances from types.py.
"""

from __future__ import annotations

import logging
import numpy as np

from app.optimization.types import PortfolioPoint, OptimizationConstraints
from app.optimization.objectives import (
    portfolio_return,
    portfolio_volatility,
    sharpe_ratio,
    portfolio_variance_objective,
    negative_sharpe,
    equal_weights,
    normalise_weights,
)

logger = logging.getLogger(__name__)

# ── Optional scipy ─────────────────────────────────────────────────────────────
try:
    from scipy.optimize import minimize, Bounds, LinearConstraint
    SCIPY_AVAILABLE = True
    logger.info("scipy available — SLSQP optimizer enabled")
except ImportError:
    SCIPY_AVAILABLE = False
    logger.warning("scipy not installed — using Monte Carlo frontier (less accurate). "
                   "Run: poetry add scipy  to enable SLSQP.")

N_FRONTIER_POINTS  = 40    # number of return targets to sweep
N_MONTE_CARLO      = 15_000
SLSQP_TOLS         = {"ftol": 1e-9, "maxiter": 1_000}


# ─── SLSQP Helpers ────────────────────────────────────────────────────────────

def _build_slsqp_problem(
    n: int,
    constraints: OptimizationConstraints,
    target_return: float | None,
    mu: np.ndarray,
):
    """Build scipy minimize constraints and bounds for a given problem."""
    # Bounds: min_weight ≤ w_i ≤ max_weight
    lo = constraints.min_weight if constraints.long_only else -1.0
    bounds = Bounds(lb=lo, ub=constraints.max_weight)

    # Equality: sum(w) = 1
    cons = [{"type": "eq", "fun": lambda w: w.sum() - 1.0}]

    # Optional return target (for frontier sweep)
    if target_return is not None:
        cons.append({
            "type": "eq",
            "fun":  lambda w, r=target_return: float(w @ mu) - r,
        })

    return bounds, cons


def _solve_min_variance(
    mu: np.ndarray,
    sigma: np.ndarray,
    constraints: OptimizationConstraints,
    label: str = "min_variance",
    rfr: float = 0.065,
) -> PortfolioPoint | None:
    """Minimize portfolio variance (no return target)."""
    n  = len(mu)
    x0 = equal_weights(n)
    bounds, cons = _build_slsqp_problem(n, constraints, target_return=None, mu=mu)

    res = minimize(
        fun=portfolio_variance_objective,
        x0=x0,
        args=(sigma,),
        method="SLSQP",
        bounds=bounds,
        constraints=cons,
        options=SLSQP_TOLS,
    )

    if not res.success:
        logger.warning(f"Min-variance solve failed: {res.message}")
        return None

    w   = normalise_weights(res.x)
    ret = portfolio_return(w, mu)
    vol = portfolio_volatility(w, sigma)
    sr  = sharpe_ratio(w, mu, sigma, rfr)
    return PortfolioPoint(weights=w, expected_return=ret * 100, volatility=vol * 100,
                          sharpe_ratio=sr, label=label)


def _solve_max_sharpe(
    mu: np.ndarray,
    sigma: np.ndarray,
    constraints: OptimizationConstraints,
    rfr: float = 0.065,
) -> PortfolioPoint | None:
    """Maximize Sharpe ratio directly via SLSQP."""
    n  = len(mu)
    x0 = equal_weights(n)
    bounds, cons = _build_slsqp_problem(n, constraints, target_return=None, mu=mu)

    res = minimize(
        fun=negative_sharpe,
        x0=x0,
        args=(mu, sigma, rfr),
        method="SLSQP",
        bounds=bounds,
        constraints=cons,
        options=SLSQP_TOLS,
    )

    if not res.success:
        logger.warning(f"Max-Sharpe solve failed: {res.message}")
        return None

    w   = normalise_weights(res.x)
    ret = portfolio_return(w, mu)
    vol = portfolio_volatility(w, sigma)
    sr  = sharpe_ratio(w, mu, sigma, rfr)
    return PortfolioPoint(weights=w, expected_return=ret * 100, volatility=vol * 100,
                          sharpe_ratio=sr, label="max_sharpe")


def _solve_frontier_point(
    target_return: float,
    mu: np.ndarray,
    sigma: np.ndarray,
    constraints: OptimizationConstraints,
    rfr: float,
) -> PortfolioPoint | None:
    """Minimize variance for a fixed target return (one frontier point)."""
    n  = len(mu)
    x0 = equal_weights(n)
    bounds, cons = _build_slsqp_problem(n, constraints, target_return=target_return, mu=mu)

    res = minimize(
        fun=portfolio_variance_objective,
        x0=x0,
        args=(sigma,),
        method="SLSQP",
        bounds=bounds,
        constraints=cons,
        options=SLSQP_TOLS,
    )

    if not res.success:
        return None

    w   = normalise_weights(res.x)
    # Verify feasibility: achieved return should be close to target
    # Tolerance: 2pp absolute floor, or 10% of the target (handles low-return assets better)
    achieved = float(w @ mu)
    tol = max(0.02, 0.10 * abs(target_return))
    if abs(achieved - target_return) > tol:
        return None

    vol = portfolio_volatility(w, sigma)
    sr  = sharpe_ratio(w, mu, sigma, rfr)
    return PortfolioPoint(weights=w, expected_return=achieved * 100, volatility=vol * 100,
                          sharpe_ratio=sr, label="frontier")


# ─── Monte Carlo fallback ──────────────────────────────────────────────────────

def _monte_carlo_portfolios(
    mu: np.ndarray,
    sigma: np.ndarray,
    constraints: OptimizationConstraints,
    rfr: float,
    n_portfolios: int = N_MONTE_CARLO,
    seed: int = 42,
) -> list[PortfolioPoint]:
    """
    Generate random portfolios via Dirichlet sampling.
    Returns all sampled points (sorted by volatility).
    """
    rng = np.random.default_rng(seed)
    n   = len(mu)
    points = []

    # Dirichlet gives naturally normalised weight vectors
    raw = rng.dirichlet(np.ones(n), size=n_portfolios)

    # Apply max_weight constraint by clipping and renormalising
    if constraints.max_weight < 1.0:
        raw = np.clip(raw, 0, constraints.max_weight)
        row_sums = raw.sum(axis=1, keepdims=True)
        raw = raw / np.maximum(row_sums, 1e-10)

    for w in raw:
        w   = normalise_weights(w)
        ret = portfolio_return(w, mu)
        vol = portfolio_volatility(w, sigma)
        sr  = sharpe_ratio(w, mu, sigma, rfr)
        points.append(PortfolioPoint(
            weights=w, expected_return=ret * 100, volatility=vol * 100,
            sharpe_ratio=sr, label="frontier",
        ))

    return sorted(points, key=lambda p: p.volatility)


def _envelope_frontier(
    all_points: list[PortfolioPoint],
    n_bins: int = N_FRONTIER_POINTS,
) -> list[PortfolioPoint]:
    """
    From a large set of random portfolios, extract the efficient frontier
    by finding the maximum-return portfolio in each volatility bin.
    """
    if not all_points:
        return []

    vols   = np.array([p.volatility    for p in all_points])
    rets   = np.array([p.expected_return for p in all_points])
    vol_lo = vols.min()
    vol_hi = vols.max()
    bins   = np.linspace(vol_lo, vol_hi, n_bins + 1)

    frontier = []
    for i in range(n_bins):
        mask = (vols >= bins[i]) & (vols < bins[i + 1])
        if i == n_bins - 1:
            mask = (vols >= bins[i]) & (vols <= bins[i + 1])
        if not mask.any():
            continue
        idx = np.argmax(rets[mask])
        candidates = [p for p, m in zip(all_points, mask) if m]
        frontier.append(candidates[idx])

    return sorted(frontier, key=lambda p: p.volatility)


# ─── Public API ───────────────────────────────────────────────────────────────

def minimize_variance(
    mu: np.ndarray,
    sigma: np.ndarray,
    constraints: OptimizationConstraints,
    rfr: float = 0.065,
) -> PortfolioPoint:
    """
    Find the global minimum variance portfolio.
    Falls back to minimum-volatility Monte Carlo portfolio.
    """
    if SCIPY_AVAILABLE:
        result = _solve_min_variance(mu, sigma, constraints, rfr=rfr)
        if result is not None:
            return result

    # Fallback: take the min-vol point from Monte Carlo
    logger.info("Using Monte Carlo for min-variance (scipy unavailable or solve failed)")
    points = _monte_carlo_portfolios(mu, sigma, constraints, rfr)
    return min(points, key=lambda p: p.volatility)


def maximize_sharpe(
    mu: np.ndarray,
    sigma: np.ndarray,
    constraints: OptimizationConstraints,
    rfr: float = 0.065,
) -> PortfolioPoint:
    """
    Find the maximum Sharpe ratio portfolio (tangency portfolio).
    """
    if SCIPY_AVAILABLE:
        result = _solve_max_sharpe(mu, sigma, constraints, rfr=rfr)
        if result is not None:
            return result

    # Fallback: best Sharpe from Monte Carlo
    logger.info("Using Monte Carlo for max-Sharpe (scipy unavailable or solve failed)")
    points = _monte_carlo_portfolios(mu, sigma, constraints, rfr)
    return max(points, key=lambda p: p.sharpe_ratio)


def compute_frontier(
    mu: np.ndarray,
    sigma: np.ndarray,
    constraints: OptimizationConstraints,
    rfr: float = 0.065,
    n_points: int = N_FRONTIER_POINTS,
) -> list[PortfolioPoint]:
    """
    Compute the efficient frontier — the set of portfolios that minimise
    variance for each level of expected return.

    Path A (scipy): parametric sweep of target returns
    Path B (fallback): Monte Carlo envelope
    """
    if SCIPY_AVAILABLE:
        # Determine feasible return range
        # Lower bound: min achievable given constraints
        min_port = _solve_min_variance(mu, sigma, constraints, rfr=rfr)
        r_lo = (min_port.expected_return / 100) if min_port else float(mu.min())

        # Upper bound: greedily allocate max_weight to highest-return assets
        effective_max_w = min(1.0, constraints.max_weight)
        sorted_mu = np.sort(mu)[::-1]   # descending by return
        r_hi = float(sorted_mu[0])      # unconstrained maximum
        # Compute the maximum achievable return given the per-asset weight cap
        remaining = 1.0
        r_hi_greedy = 0.0
        for m in sorted_mu:
            alloc = min(effective_max_w, remaining)
            r_hi_greedy += alloc * float(m)
            remaining -= alloc
            if remaining <= 1e-9:
                break
        r_hi = min(r_hi, r_hi_greedy)

        if r_lo >= r_hi:
            r_lo = float(mu.min()) * 0.9
            r_hi = float(mu.max()) * 1.05

        targets = np.linspace(r_lo, r_hi, n_points)
        frontier = []
        for target in targets:
            pt = _solve_frontier_point(target, mu, sigma, constraints, rfr)
            if pt is not None:
                frontier.append(pt)

        if len(frontier) >= 5:
            return sorted(frontier, key=lambda p: p.volatility)
        logger.warning("Too few SLSQP frontier points — falling back to Monte Carlo")

    # Monte Carlo fallback
    all_pts  = _monte_carlo_portfolios(mu, sigma, constraints, rfr)
    envelope = _envelope_frontier(all_pts, n_bins=n_points)
    return envelope


def current_portfolio_point(
    current_weights: np.ndarray,
    mu: np.ndarray,
    sigma: np.ndarray,
    rfr: float = 0.065,
) -> PortfolioPoint:
    """Evaluate the current portfolio on the risk-return plane."""
    w   = normalise_weights(current_weights)
    ret = portfolio_return(w, mu)
    vol = portfolio_volatility(w, sigma)
    sr  = sharpe_ratio(w, mu, sigma, rfr)
    return PortfolioPoint(
        weights=w, expected_return=ret * 100, volatility=vol * 100,
        sharpe_ratio=sr, label="current",
    )
