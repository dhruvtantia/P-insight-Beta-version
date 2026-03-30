"""
Correlation Analysis Utilities
---------------------------------
Computes pairwise return correlations and related diversification analytics.

All functions take a price DataFrame (dates × tickers) and return
plain dicts suitable for JSON serialisation.
"""

import numpy as np
import pandas as pd
from typing import Optional


def compute_correlation_matrix(price_df: pd.DataFrame) -> dict:
    """
    Compute the full pairwise correlation matrix of daily returns.

    Args:
        price_df:  DataFrame of close prices, columns = tickers, index = dates.
                   Should be pre-aligned and forward-filled.

    Returns:
        {
            "tickers":           ["TCS.NS", "INFY.NS", ...],
            "matrix":            [[1.0, 0.72, ...], ...],   # n×n
            "average_pairwise":  0.61,
            "min_pair":          {"tickers": ["X", "Y"], "value": 0.12},
            "max_pair":          {"tickers": ["A", "B"], "value": 0.94},
            "interpretation":    "moderate",  # low / moderate / high / very_high
        }
    """
    if price_df.empty or price_df.shape[1] < 2:
        return {
            "tickers": list(price_df.columns) if not price_df.empty else [],
            "matrix": [],
            "average_pairwise": None,
            "min_pair": None,
            "max_pair": None,
            "interpretation": None,
        }

    returns = price_df.pct_change().dropna()
    corr = returns.corr()
    tickers = list(corr.columns)
    n = len(tickers)

    # Build matrix as nested lists
    matrix = [
        [round(float(corr.loc[r, c]), 4) for c in tickers]
        for r in tickers
    ]

    # Collect off-diagonal values
    off_diagonal = []
    min_pair = {"tickers": [tickers[0], tickers[0]], "value": 1.0}
    max_pair = {"tickers": [tickers[0], tickers[0]], "value": -1.0}

    for i in range(n):
        for j in range(i + 1, n):
            val = float(corr.iloc[i, j])
            off_diagonal.append(val)
            if val < min_pair["value"]:
                min_pair = {"tickers": [tickers[i], tickers[j]], "value": round(val, 4)}
            if val > max_pair["value"]:
                max_pair = {"tickers": [tickers[i], tickers[j]], "value": round(val, 4)}

    avg_pairwise = round(float(np.mean(off_diagonal)), 4) if off_diagonal else None

    # Interpretation
    interp = _interpret_avg_correlation(avg_pairwise)

    return {
        "tickers":           tickers,
        "matrix":            matrix,
        "average_pairwise":  avg_pairwise,
        "min_pair":          min_pair,
        "max_pair":          max_pair,
        "interpretation":    interp,
    }


def _interpret_avg_correlation(avg: Optional[float]) -> Optional[str]:
    if avg is None:
        return None
    if avg < 0.3:
        return "low"
    if avg < 0.55:
        return "moderate"
    if avg < 0.75:
        return "high"
    return "very_high"


INTERPRETATION_LABELS = {
    "low":       "Low average correlation — holdings are well-diversified by return behaviour.",
    "moderate":  "Moderate correlation — portfolio has some diversification benefit.",
    "high":      "High correlation — portfolio returns move closely together; limited diversification benefit.",
    "very_high": "Very high correlation — portfolio behaves like a concentrated bet; consider adding uncorrelated assets.",
}
