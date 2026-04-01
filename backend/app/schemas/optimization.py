"""
Optimization API Schemas
-------------------------
Pydantic models for the optimization endpoint response.
Kept separate from the internal OptimizationOutputs dataclass
so the API contract can evolve independently.
"""

from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class PortfolioPointSchema(BaseModel):
    label:           str
    expected_return: float = Field(description="Annualised expected return (%)")
    volatility:      float = Field(description="Annualised volatility (%)")
    sharpe_ratio:    float
    weights:         dict[str, float] = Field(description="Ticker → allocation (0–1 scale)")


class RebalanceDelta(BaseModel):
    ticker:         str
    current_weight: float   # %
    target_weight:  float   # %
    delta_pct:      float   # positive = buy, negative = sell
    action:         str     # "buy" | "sell"


class OptimizationInputsSummary(BaseModel):
    expected_returns:    dict[str, float]   # ticker → annualised % return
    covariance_diagonal: dict[str, float]   # ticker → variance (diagonal of Σ)


class OptimizationMeta(BaseModel):
    provider_mode:           Optional[str]
    period:                  str
    valid_tickers:           list[str]
    invalid_tickers:         list[str]
    # Per-ticker history source: {"TCS.NS": "yfinance", "WIPRO.NS": "unavailable"}
    ticker_status:           dict[str, str]  = {}
    n_observations:          int
    expected_returns_method: Optional[str]
    covariance_method:       Optional[str]
    optimizer_method:        Optional[str]
    n_frontier_points:       int
    risk_free_rate:          float
    constraints:             list[str]
    # Library availability — determines SLSQP vs Monte Carlo fallback
    scipy_available:         Optional[bool]  = None
    sklearn_available:       Optional[bool]  = None
    cached:                  bool
    error:                   Optional[str]   = None


class OptimizationFullResponse(BaseModel):
    current:      Optional[PortfolioPointSchema]
    min_variance: Optional[PortfolioPointSchema]
    max_sharpe:   Optional[PortfolioPointSchema]
    frontier:     list[PortfolioPointSchema]
    rebalance:    list[RebalanceDelta]
    inputs:       OptimizationInputsSummary
    meta:         OptimizationMeta
