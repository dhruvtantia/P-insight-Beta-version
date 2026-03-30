"""
Expected Returns Estimation
----------------------------
Pure functions. Input: pandas price DataFrame. Output: numpy array of μ values.

Phase 1 methods:
  - historical_mean         — annualised arithmetic mean of daily log returns
  - ema_historical_mean     — exponentially weighted mean (recent bias)

Assumptions:
  - 252 trading days per year
  - Returns are stationary over the observation window
  - No analyst views, no factor model, no Black-Litterman in Phase 1
"""

import numpy as np
import pandas as pd
import logging

logger = logging.getLogger(__name__)

TRADING_DAYS = 252


def daily_log_returns(prices: pd.DataFrame) -> pd.DataFrame:
    """
    Convert price DataFrame to daily log returns.
    Uses log returns: ln(P_t / P_{t-1})
    More symmetric than simple returns; aggregates cleanly over time.
    """
    return np.log(prices / prices.shift(1)).dropna()


def historical_mean(
    prices: pd.DataFrame,
    compounding: bool = True,
) -> tuple[np.ndarray, str]:
    """
    Annualised expected returns via historical mean.

    Args:
        prices:      DataFrame with tickers as columns, dates as index.
        compounding: If True, use geometric annualisation (1+μ_daily)^252 - 1.
                     If False, use arithmetic: μ_daily × 252.

    Returns:
        (mu_array, method_label)
    """
    log_ret = daily_log_returns(prices)

    if compounding:
        # Geometric mean: more accurate for multi-period returns
        mean_daily = log_ret.mean()
        # Convert log return to simple annualised: exp(μ_log × 252) - 1
        mu = np.expm1(mean_daily.values * TRADING_DAYS)
        method = "historical_geometric_mean"
    else:
        # Arithmetic mean (simpler, slightly upward biased)
        mu = log_ret.mean().values * TRADING_DAYS
        method = "historical_arithmetic_mean"

    logger.debug(
        f"Expected returns (historical_mean): {dict(zip(prices.columns, np.round(mu * 100, 2)))}"
    )
    return mu.astype(float), method


def ema_historical_mean(
    prices: pd.DataFrame,
    span: int = 63,   # ~3 months of trading days
) -> tuple[np.ndarray, str]:
    """
    Exponentially weighted mean — gives higher weight to recent returns.
    Useful when recent market conditions differ from historical norms.

    Args:
        prices: Price DataFrame
        span:   EWM span in days (63 ≈ 3mo, 126 ≈ 6mo, 252 ≈ 1y)

    Returns:
        (mu_array, method_label)
    """
    log_ret = daily_log_returns(prices)
    ewm_mean = log_ret.ewm(span=span, min_periods=min(span // 2, 20)).mean().iloc[-1]
    # Annualise from daily EWM log return
    mu = np.expm1(ewm_mean.values * TRADING_DAYS)
    method = f"ema_mean_span{span}"
    return mu.astype(float), method


def get_expected_returns(
    prices: pd.DataFrame,
    method: str = "historical_mean",
    ewm_span: int = 63,
) -> tuple[np.ndarray, str]:
    """
    Router function. Returns (mu_array, method_label).

    Args:
        prices:   Aligned price DataFrame
        method:   "historical_mean" | "ema_mean"
        ewm_span: Only used for "ema_mean"
    """
    if prices.empty or len(prices) < 10:
        raise ValueError(f"Insufficient price history: {len(prices)} rows (need ≥ 10)")

    if method == "ema_mean":
        return ema_historical_mean(prices, span=ewm_span)
    else:
        return historical_mean(prices)
