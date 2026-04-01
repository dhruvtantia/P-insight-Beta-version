"""
Quant Analytics Schemas — Phase 2
------------------------------------
Pydantic response models for the /api/v1/quant/ endpoints.
All monetary values are in INR; percentages are decimal-scaled (e.g. 15.2 = 15.2%).
"""

from pydantic import BaseModel, Field
from typing import Optional


# ─── Time-series point ────────────────────────────────────────────────────────

class TimeSeriesPoint(BaseModel):
    date:  str   = Field(description="ISO date string YYYY-MM-DD")
    value: float = Field(description="Cumulative return in % (e.g. 12.5 = +12.5%)")


# ─── Risk metric blocks ───────────────────────────────────────────────────────

class PortfolioRiskMetrics(BaseModel):
    """Market-based risk metrics computed from historical daily returns."""
    annualized_volatility: Optional[float] = Field(None, description="Annualised volatility (%)")
    annualized_return:     Optional[float] = Field(None, description="CAGR over the period (%)")
    sharpe_ratio:          Optional[float] = Field(None, description="Sharpe ratio (excess return / vol)")
    sortino_ratio:         Optional[float] = Field(None, description="Sortino ratio (excess return / downside dev)")
    max_drawdown:          Optional[float] = Field(None, description="Maximum peak-to-trough loss (%)")
    downside_deviation:    Optional[float] = Field(None, description="Annualised downside deviation (%)")
    var_95:                Optional[float] = Field(None, description="Daily VaR at 95% confidence (%)")
    beta:                  Optional[float] = Field(None, description="Beta vs NIFTY 50")
    tracking_error:        Optional[float] = Field(None, description="Annualised tracking error vs benchmark (%)")
    information_ratio:     Optional[float] = Field(None, description="Information ratio (active return / TE)")
    alpha:                 Optional[float] = Field(None, description="Jensen's alpha (%)")
    error:                 Optional[str]   = None


class BenchmarkMetrics(BaseModel):
    """Benchmark comparison block."""
    name:                  str
    ticker:                str
    annualized_return:     Optional[float] = None
    annualized_volatility: Optional[float] = None
    sharpe_ratio:          Optional[float] = None
    max_drawdown:          Optional[float] = None
    source:                str = "mock"


class HoldingContribution(BaseModel):
    """Per-holding performance attribution."""
    ticker:            str
    weight:            float = Field(description="Portfolio weight (%)")
    annualized_return: Optional[float] = Field(None, description="Annualised return (%)")
    volatility:        Optional[float] = Field(None, description="Annualised volatility (%)")
    beta:              Optional[float] = Field(None, description="Beta vs NIFTY 50")
    error:             Optional[str]   = None


# ─── Correlation block ────────────────────────────────────────────────────────

class PairwisePair(BaseModel):
    tickers: list[str]
    value:   float


class CorrelationResult(BaseModel):
    tickers:          list[str]
    matrix:           list[list[float]]  = Field(description="n×n correlation matrix")
    average_pairwise: Optional[float]    = None
    min_pair:         Optional[PairwisePair] = None
    max_pair:         Optional[PairwisePair] = None
    interpretation:   Optional[str]      = None  # "low" | "moderate" | "high" | "very_high"


# ─── Date range ───────────────────────────────────────────────────────────────

class DateRange(BaseModel):
    start: str
    end:   str


# ─── Meta block ──────────────────────────────────────────────────────────────

class QuantMeta(BaseModel):
    provider_mode:       Optional[str]             = None
    period:              str                       = "1y"
    valid_tickers:       list[str]                 = []
    invalid_tickers:     list[str]                 = []
    # per-ticker data source: e.g. {"TCS.NS": "yfinance", "WIPRO.NS": "unavailable"}
    ticker_status:       dict[str, str]            = {}
    data_points:         int                       = 0
    date_range:          Optional[DateRange]       = None
    benchmark_ticker:    str                       = "^NSEI"
    benchmark_name:      str                       = "NIFTY 50"
    benchmark_source:    Optional[str]             = None
    # False when benchmark fetch failed in live mode (beta/alpha/IR will be null)
    benchmark_available: bool                      = True
    risk_free_rate:      float                     = 0.065
    cached:              bool                      = False
    error:               Optional[str]             = None


# ─── Full response ────────────────────────────────────────────────────────────

class MetricsBlock(BaseModel):
    portfolio: Optional[PortfolioRiskMetrics] = None
    benchmark: Optional[BenchmarkMetrics]     = None


class PerformanceBlock(BaseModel):
    portfolio: list[TimeSeriesPoint] = []
    benchmark: list[TimeSeriesPoint] = []


class QuantFullResponse(BaseModel):
    """
    All quantitative analytics in a single response.
    Fetched once per page load by useQuantAnalytics().
    """
    metrics:       MetricsBlock
    performance:   PerformanceBlock
    drawdown:      list[TimeSeriesPoint]    = []
    correlation:   CorrelationResult
    contributions: list[HoldingContribution] = []
    meta:          QuantMeta
