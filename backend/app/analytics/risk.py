"""
Risk Analytics Engine — Phase 2
----------------------------------
Computes market-based portfolio risk metrics from historical daily return series.

Phase 1 metrics (now implemented):
  - Annualised Volatility
  - Beta vs NIFTY 50
  - Sharpe Ratio
  - Sortino Ratio
  - Maximum Drawdown
  - Downside Deviation
  - Tracking Error vs benchmark
  - Information Ratio
  - Jensen's Alpha
  - Value at Risk (95%, parametric)

Next phase (efficient frontier):
  - Expected returns (historical or CAPM)
  - Covariance matrix
  - Min-variance / Max-Sharpe weights
"""

import numpy as np
import pandas as pd
from typing import Optional

from app.schemas.portfolio import RiskMetrics


def compute_risk_metrics(
    returns: pd.Series,
    benchmark_returns: Optional[pd.Series] = None,
    risk_free_rate: float = 0.065,  # Indian 10Y Gsec yield approximation
) -> RiskMetrics:
    """
    Compute risk metrics from a time-series of daily returns.

    Args:
        returns: Daily portfolio returns as a pandas Series.
        benchmark_returns: Daily benchmark returns (for beta calculation).
        risk_free_rate: Annual risk-free rate (default: 6.5% for India).

    Returns:
        RiskMetrics schema with computed values.
    """
    if returns.empty or len(returns) < 30:
        return RiskMetrics(note="Insufficient data for risk calculations (< 30 days).")

    trading_days = 252

    # ─── Volatility ───────────────────────────────────────────────────────────
    volatility = float(returns.std() * np.sqrt(trading_days))

    # ─── Sharpe Ratio ─────────────────────────────────────────────────────────
    annualised_return = float(returns.mean() * trading_days)
    daily_rf = risk_free_rate / trading_days
    excess_returns = returns - daily_rf
    sharpe = (
        float(excess_returns.mean() / excess_returns.std() * np.sqrt(trading_days))
        if excess_returns.std() > 0
        else None
    )

    # ─── Maximum Drawdown ─────────────────────────────────────────────────────
    cumulative = (1 + returns).cumprod()
    rolling_max = cumulative.cummax()
    drawdown_series = (cumulative - rolling_max) / rolling_max
    max_drawdown = float(drawdown_series.min())

    # ─── Beta ─────────────────────────────────────────────────────────────────
    beta = None
    if benchmark_returns is not None and len(benchmark_returns) >= 30:
        aligned = pd.concat([returns, benchmark_returns], axis=1).dropna()
        if len(aligned) >= 30:
            cov_matrix = np.cov(aligned.iloc[:, 0], aligned.iloc[:, 1])
            beta = float(cov_matrix[0, 1] / cov_matrix[1, 1]) if cov_matrix[1, 1] != 0 else None

    # ─── VaR (95% parametric) ─────────────────────────────────────────────────
    var_95 = float(np.percentile(returns, 5))

    return RiskMetrics(
        beta=round(beta, 4) if beta is not None else None,
        sharpe_ratio=round(sharpe, 4) if sharpe is not None else None,
        volatility_annualised=round(volatility, 4),
        max_drawdown=round(max_drawdown, 4),
        var_95=round(var_95, 4),
        note="Computed from historical price data.",
    )


# ─── Phase 2: Additional risk metrics ────────────────────────────────────────

TRADING_DAYS = 252
DEFAULT_RFR   = 0.065   # 6.5% annual — Indian T-bill approximation


def annualised_volatility(returns: pd.Series) -> float:
    """σ_annual = σ_daily × √252."""
    return float(returns.std() * np.sqrt(TRADING_DAYS))


def sortino_ratio(
    returns: pd.Series,
    mar: float = 0.0,                   # minimum acceptable return (daily)
    risk_free_annual: float = DEFAULT_RFR,
) -> float:
    """
    Sortino Ratio = (annualised excess return) / (downside deviation).
    Uses MAR = 0 by convention; penalises only negative returns.
    """
    rf_daily = risk_free_annual / TRADING_DAYS
    excess    = returns - rf_daily
    downside  = returns[returns < mar]
    if downside.empty or len(downside) < 5:
        return 0.0
    dd_annual = float(np.sqrt((downside ** 2).mean()) * np.sqrt(TRADING_DAYS))
    if dd_annual == 0:
        return 0.0
    return float(excess.mean() * TRADING_DAYS / dd_annual)


def downside_deviation(returns: pd.Series, mar: float = 0.0) -> float:
    """Annualised downside deviation below MAR."""
    downside = returns[returns < mar]
    if downside.empty:
        return 0.0
    return float(np.sqrt((downside ** 2).mean()) * np.sqrt(TRADING_DAYS))


def tracking_error(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series,
) -> float:
    """
    Tracking Error = annualised std dev of (portfolio − benchmark) return.
    Lower TE means portfolio moves closely with benchmark.
    """
    aligned = pd.concat([portfolio_returns, benchmark_returns], axis=1).dropna()
    if len(aligned) < 10:
        return 0.0
    diff = aligned.iloc[:, 0] - aligned.iloc[:, 1]
    return float(diff.std() * np.sqrt(TRADING_DAYS))


def information_ratio(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series,
) -> float:
    """
    Information Ratio = (annual active return) / (tracking error).
    Positive IR means the portfolio outperformed on a risk-adjusted basis.
    """
    te = tracking_error(portfolio_returns, benchmark_returns)
    if te == 0:
        return 0.0
    aligned = pd.concat([portfolio_returns, benchmark_returns], axis=1).dropna()
    diff = aligned.iloc[:, 0] - aligned.iloc[:, 1]
    annual_alpha = float(diff.mean() * TRADING_DAYS)
    return float(annual_alpha / te)


def jensens_alpha(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series,
    risk_free_annual: float = DEFAULT_RFR,
) -> float:
    """
    Jensen's Alpha = annualised (portfolio excess return − beta × benchmark excess return).
    Positive alpha = portfolio generated returns above what CAPM would predict.
    """
    aligned = pd.concat([portfolio_returns, benchmark_returns], axis=1).dropna()
    if len(aligned) < 30:
        return 0.0
    rf_daily = risk_free_annual / TRADING_DAYS
    p_ret, b_ret = aligned.iloc[:, 0], aligned.iloc[:, 1]
    cov_mat = np.cov(p_ret, b_ret)
    beta = float(cov_mat[0, 1] / cov_mat[1, 1]) if cov_mat[1, 1] != 0 else 0.0
    alpha_daily = float((p_ret - rf_daily).mean() - beta * (b_ret - rf_daily).mean())
    return float(alpha_daily * TRADING_DAYS)


def var_parametric(returns: pd.Series, confidence: float = 0.95) -> float:
    """
    Value at Risk (parametric, normal assumption).
    Returns a negative number: e.g. -0.02 means max 2% daily loss at given confidence.
    """
    z = {0.95: 1.645, 0.99: 2.326}.get(confidence, 1.645)
    return float(returns.mean() - z * returns.std())


def compute_full_risk_metrics(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series,
    risk_free_annual: float = DEFAULT_RFR,
) -> dict:
    """
    Compute the full set of Phase 2 risk metrics.
    Returns a plain dict for easy JSON serialisation.

    Both series must be aligned on common dates before calling.
    """
    if portfolio_returns.empty or len(portfolio_returns) < 20:
        return {"error": "Insufficient data (< 20 trading days)"}

    # Basic metrics (portfolio standalone)
    vol     = annualised_volatility(portfolio_returns)
    mdd_val = float((
        (1 + portfolio_returns).cumprod() /
        (1 + portfolio_returns).cumprod().cummax()
        - 1
    ).min())

    rf_daily        = risk_free_annual / TRADING_DAYS
    excess          = portfolio_returns - rf_daily
    sharpe          = float(excess.mean() / excess.std() * np.sqrt(TRADING_DAYS)) if excess.std() > 0 else 0.0
    ann_ret         = float((1 + portfolio_returns.mean()) ** TRADING_DAYS - 1)
    var95           = var_parametric(portfolio_returns, 0.95)
    dd              = downside_deviation(portfolio_returns)
    sortino         = sortino_ratio(portfolio_returns, risk_free_annual=risk_free_annual)

    # Benchmark-relative metrics
    beta_val: float | None = None
    te, ir, alpha_val = 0.0, 0.0, 0.0

    if benchmark_returns is not None and len(benchmark_returns) >= 20:
        aligned = pd.concat([portfolio_returns, benchmark_returns], axis=1).dropna()
        if len(aligned) >= 20:
            p, b = aligned.iloc[:, 0], aligned.iloc[:, 1]
            cov_mat  = np.cov(p, b)
            beta_val = float(cov_mat[0, 1] / cov_mat[1, 1]) if cov_mat[1, 1] != 0 else None
            te       = tracking_error(p, b)
            ir       = information_ratio(p, b)
            alpha_val = jensens_alpha(p, b, risk_free_annual)

    return {
        "annualized_volatility":  round(vol * 100, 3),    # %
        "annualized_return":      round(ann_ret * 100, 3), # %
        "sharpe_ratio":           round(sharpe, 3),
        "sortino_ratio":          round(sortino, 3),
        "max_drawdown":           round(mdd_val * 100, 3), # %
        "downside_deviation":     round(dd * 100, 3),      # %
        "var_95":                 round(var95 * 100, 3),   # %
        "beta":                   round(beta_val, 3) if beta_val is not None else None,
        "tracking_error":         round(te * 100, 3),      # %
        "information_ratio":      round(ir, 3),
        "alpha":                  round(alpha_val * 100, 3), # %
    }


def compute_holding_stats(
    ticker: str,
    ticker_returns: pd.Series,
    benchmark_returns: pd.Series,
    weight: float,
    risk_free_annual: float = DEFAULT_RFR,
) -> dict:
    """Per-holding annualised stats for the contribution breakdown."""
    if ticker_returns.empty or len(ticker_returns) < 10:
        return {"ticker": ticker, "weight": round(weight * 100, 2), "error": "insufficient data"}

    aligned = pd.concat([ticker_returns, benchmark_returns], axis=1).dropna()
    p, b = aligned.iloc[:, 0], aligned.iloc[:, 1]

    cov_mat = np.cov(p, b) if len(p) >= 10 else None
    beta_val = float(cov_mat[0, 1] / cov_mat[1, 1]) if (cov_mat is not None and cov_mat[1, 1] != 0) else None
    ann_ret = float((1 + p.mean()) ** TRADING_DAYS - 1)
    vol     = float(p.std() * np.sqrt(TRADING_DAYS))

    return {
        "ticker":             ticker,
        "weight":             round(weight * 100, 2),      # %
        "annualized_return":  round(ann_ret * 100, 2),     # %
        "volatility":         round(vol * 100, 2),         # %
        "beta":               round(beta_val, 3) if beta_val is not None else None,
    }


def portfolio_returns_from_holdings(price_histories: dict[str, pd.Series], weights: dict[str, float]) -> pd.Series:
    """
    Combine individual ticker return series into a weighted portfolio return series.

    Args:
        price_histories: dict of ticker → daily close price Series
        weights: dict of ticker → portfolio weight (0–1, must sum to 1)

    Returns:
        Weighted daily portfolio return Series.
    """
    # Align all series to common dates
    df = pd.DataFrame(price_histories).dropna()
    returns_df = df.pct_change().dropna()

    # Compute weighted returns
    weight_series = pd.Series(weights)
    weight_series = weight_series.reindex(returns_df.columns).fillna(0)
    weight_series /= weight_series.sum()  # Normalise to 1

    return returns_df.dot(weight_series)
