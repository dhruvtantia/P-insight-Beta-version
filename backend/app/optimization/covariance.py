"""
Covariance Matrix Estimation
-----------------------------
Pure functions. Input: pandas price DataFrame. Output: (n×n) numpy covariance matrix.

Phase 1 methods:
  - sample_covariance    — standard historical covariance × 252
  - ledoit_wolf          — Oracle Approximating Shrinkage (OAS) estimator
                           via sklearn, graceful fallback if unavailable

Assumptions:
  - 252 trading days per year
  - Returns are stationary over the observation window
  - Correlations are stable (strong assumption — Phase 2 can add rolling covariance)

Numerical stability:
  - Covariance is regularised with a small ridge: Σ + ε·I
  - This ensures positive definiteness for all downstream operations
"""

import numpy as np
import pandas as pd
import logging

logger = logging.getLogger(__name__)

TRADING_DAYS    = 252
RIDGE_EPS       = 1e-8   # small positive constant for numerical stability

# ── Optional sklearn (for Ledoit-Wolf shrinkage) ──────────────────────────────
try:
    from sklearn.covariance import OAS
    SKLEARN_AVAILABLE = True
    logger.info("sklearn available — Ledoit-Wolf shrinkage enabled")
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.info("sklearn not available — using sample covariance")


def _daily_returns(prices: pd.DataFrame) -> pd.DataFrame:
    """Simple daily returns (pct_change). Prefer over log for covariance stability."""
    return prices.pct_change().dropna()


def _add_ridge(cov: np.ndarray) -> np.ndarray:
    """Add small ridge diagonal to guarantee positive definiteness."""
    n = cov.shape[0]
    return cov + RIDGE_EPS * np.eye(n)


def sample_covariance(prices: pd.DataFrame) -> tuple[np.ndarray, str]:
    """
    Standard sample covariance matrix, annualised.

    Returns:
        (sigma, method_label)
    """
    daily_ret = _daily_returns(prices)
    cov_daily = daily_ret.cov().values  # (n × n)
    sigma = _add_ridge(cov_daily * TRADING_DAYS)
    logger.debug(f"Sample covariance shape: {sigma.shape}, trace: {np.trace(sigma):.4f}")
    return sigma.astype(float), "sample_covariance"


def ledoit_wolf_covariance(prices: pd.DataFrame) -> tuple[np.ndarray, str]:
    """
    Oracle Approximating Shrinkage (OAS) estimator from sklearn.
    More stable than sample covariance when n_samples is not >> n_features.
    Falls back to sample_covariance if sklearn is not installed.

    Returns:
        (sigma, method_label)
    """
    if not SKLEARN_AVAILABLE:
        logger.warning("sklearn not available — falling back to sample covariance")
        return sample_covariance(prices)

    daily_ret = _daily_returns(prices)
    n_samples, n_features = daily_ret.shape

    if n_samples < n_features * 2:
        logger.warning(
            f"OAS: n_samples ({n_samples}) < 2×n_features ({n_features}) — "
            f"using sample covariance instead"
        )
        return sample_covariance(prices)

    try:
        oas = OAS().fit(daily_ret.values)
        sigma = _add_ridge(oas.covariance_ * TRADING_DAYS)
        shrinkage = getattr(oas, 'shrinkage_', None)
        method = f"ledoit_wolf_oas"
        if shrinkage is not None:
            logger.debug(f"OAS shrinkage coefficient: {shrinkage:.4f}")
        return sigma.astype(float), method
    except Exception as e:
        logger.warning(f"OAS failed ({e}) — falling back to sample covariance")
        return sample_covariance(prices)


def get_covariance(
    prices: pd.DataFrame,
    method: str = "auto",
) -> tuple[np.ndarray, str]:
    """
    Router function. Returns (sigma, method_label).

    Args:
        prices: Aligned price DataFrame (tickers as columns)
        method: "sample" | "ledoit_wolf" | "auto"
                "auto" uses Ledoit-Wolf if sklearn available AND n_samples ≥ 2×n_features
    """
    if prices.empty or len(prices) < 5:
        raise ValueError(f"Insufficient price history: {len(prices)} rows")

    n_samples  = len(prices) - 1   # after pct_change drop
    n_features = len(prices.columns)

    if method == "sample":
        return sample_covariance(prices)
    elif method == "ledoit_wolf":
        return ledoit_wolf_covariance(prices)
    else:  # "auto"
        # Only use shrinkage when we have enough data; otherwise sample is fine
        if SKLEARN_AVAILABLE and n_samples >= n_features * 2:
            return ledoit_wolf_covariance(prices)
        return sample_covariance(prices)


def is_positive_definite(matrix: np.ndarray) -> bool:
    """Check if a matrix is positive definite (all eigenvalues > 0)."""
    try:
        eigenvalues = np.linalg.eigvalsh(matrix)
        return bool(np.all(eigenvalues > 0))
    except np.linalg.LinAlgError:
        return False


def nearest_positive_definite(matrix: np.ndarray) -> np.ndarray:
    """
    Find the nearest positive definite matrix.
    Used as a last-resort fix for numerically unstable covariance matrices.
    Algorithm from Higham (1988).
    """
    B = (matrix + matrix.T) / 2
    _, s, V = np.linalg.svd(B)
    H = V.T @ np.diag(s) @ V
    A2 = (B + H) / 2
    A3 = (A2 + A2.T) / 2

    if is_positive_definite(A3):
        return A3

    # Gradually increase ridge until positive definite
    k = 1
    while not is_positive_definite(A3):
        mineig = np.min(np.linalg.eigvalsh(A3))
        A3 += (-mineig * k**2 + np.finfo(float).eps) * np.eye(matrix.shape[0])
        k += 1
        if k > 100:
            break
    return A3
