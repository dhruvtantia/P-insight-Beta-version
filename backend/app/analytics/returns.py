"""
Return Series Computation Utilities
-------------------------------------
Pure functions — no I/O, no FastAPI, no database.
All functions operate on pandas Series / DataFrames.

Used by quant_service.py to build the return pipeline before risk computation.
"""

import numpy as np
import pandas as pd
from typing import Optional

TRADING_DAYS = 252


# ─── Core series transforms ───────────────────────────────────────────────────

def daily_returns(prices: pd.Series) -> pd.Series:
    """Simple daily arithmetic returns: (P_t - P_{t-1}) / P_{t-1}."""
    return prices.pct_change().dropna()


def log_returns(prices: pd.Series) -> pd.Series:
    """Log returns: ln(P_t / P_{t-1}). More statistically well-behaved."""
    return np.log(prices / prices.shift(1)).dropna()


def cumulative_returns(returns: pd.Series) -> pd.Series:
    """
    Cumulative compound return: ∏(1 + r_i) - 1.
    First value is 0.0 (start), grows from there.
    """
    return (1 + returns).cumprod() - 1


def rolling_returns(returns: pd.Series, window: int = 21) -> pd.Series:
    """
    Rolling n-day compound return.
    Default: 21 trading days ≈ 1 calendar month.
    """
    return returns.rolling(window).apply(lambda x: (1 + x).prod() - 1, raw=True)


# ─── Portfolio-level returns ──────────────────────────────────────────────────

def portfolio_return_series(
    price_matrix: pd.DataFrame,
    weights: dict[str, float],
) -> pd.Series:
    """
    Compute a weighted portfolio daily return series.

    Args:
        price_matrix:  DataFrame where each column is a ticker's daily close series.
                       Dates must be aligned (inner join) and NaN-filled before passing.
        weights:       Ticker → weight (0–1). Will be normalised to sum = 1.

    Returns:
        Daily portfolio return Series, index = dates.
    """
    ret_df = price_matrix.pct_change().dropna()

    # Align weights to the columns present
    w = pd.Series({t: weights.get(t, 0.0) for t in ret_df.columns})
    w_sum = w.sum()
    if w_sum <= 0:
        raise ValueError("Portfolio weights sum to zero — cannot compute returns.")
    w = w / w_sum  # normalise

    return (ret_df * w).sum(axis=1)


def annualised_return(returns: pd.Series) -> float:
    """
    Compound annualised growth rate (CAGR) from a daily return series.
    Uses geometric mean: (∏(1 + r_i))^(252/n) - 1.
    """
    n = len(returns)
    if n < 2:
        return 0.0
    total = float((1 + returns).prod())
    return float(total ** (TRADING_DAYS / n) - 1)


# ─── Holding-level contribution ───────────────────────────────────────────────

def holding_contributions(
    price_matrix: pd.DataFrame,
    weights: dict[str, float],
) -> dict[str, float]:
    """
    Compute each holding's contribution to total portfolio return over the period.
    Contribution = weight × (ticker total period return).

    Returns dict of ticker → contribution (as a decimal, e.g. 0.04 = +4%).
    """
    ret_df = price_matrix.pct_change().dropna()
    w = pd.Series({t: weights.get(t, 0.0) for t in ret_df.columns})
    w_sum = w.sum()
    if w_sum > 0:
        w = w / w_sum

    period_returns = (1 + ret_df).prod() - 1   # total return per ticker over period

    contributions = {}
    for ticker in ret_df.columns:
        contributions[ticker] = round(float(w.get(ticker, 0) * period_returns.get(ticker, 0)), 6)

    return contributions


# ─── Alignment helpers ────────────────────────────────────────────────────────

def align_series(
    portfolio: pd.Series,
    benchmark: pd.Series,
) -> tuple[pd.Series, pd.Series]:
    """
    Align two return series on their common dates.
    Inner join — only dates where both have values are kept.
    """
    combined = pd.concat([portfolio, benchmark], axis=1).dropna()
    return combined.iloc[:, 0], combined.iloc[:, 1]


def build_price_matrix(
    price_histories: dict[str, list[dict]],
    date_key: str = "date",
    price_key: str = "close",
) -> pd.DataFrame:
    """
    Convert a dict of raw price history lists into an aligned price DataFrame.

    Args:
        price_histories: { ticker: [{"date": "2024-01-01", "close": 3820.0}, ...] }

    Returns:
        DataFrame with date index, one column per ticker, forward-filled, NaN rows dropped.
    """
    series = {}
    for ticker, records in price_histories.items():
        if not records:
            continue
        df = pd.DataFrame(records)
        df[date_key] = pd.to_datetime(df[date_key])
        df.set_index(date_key, inplace=True)
        series[ticker] = df[price_key].astype(float)

    if not series:
        return pd.DataFrame()

    price_df = pd.DataFrame(series)
    price_df = price_df.sort_index()
    price_df = price_df.ffill()         # forward-fill weekend/holiday gaps
    price_df = price_df.dropna(how="all")
    return price_df
