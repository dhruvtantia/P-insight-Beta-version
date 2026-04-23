"""
Pydantic Schemas — API Request & Response Shapes
--------------------------------------------------
These are completely separate from ORM models in models/portfolio.py.
Models = database structure. Schemas = what the API accepts and returns.

Benefits of separation:
  - Change DB structure without breaking API contracts
  - Change API responses without touching the database
  - Enables clean validation and serialisation
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal
from datetime import datetime


# ─── Holding Schemas ──────────────────────────────────────────────────────────

class HoldingBase(BaseModel):
    ticker: str = Field(..., example="TCS.NS", description="Stock ticker symbol")
    name: str = Field(..., example="Tata Consultancy Services")
    quantity: float = Field(..., gt=0, example=30)
    average_cost: float = Field(..., gt=0, example=3500.0)
    current_price: Optional[float] = Field(None, example=3820.0)
    sector: Optional[str] = Field(None, example="Information Technology")
    industry: Optional[str] = Field(None, example="IT Services & Consulting")
    asset_class: Optional[str] = Field("Equity", example="Equity")
    currency: Optional[str] = Field("INR", example="INR")
    purchase_date: Optional[str] = Field(None, example="2023-04-15",
        description="Date of purchase (YYYY-MM-DD or as found in the file)")
    notes: Optional[str] = Field(None, description="Free-text user annotations from the uploaded file")
    # Provenance: which data provider sourced current_price for this holding.
    # "live" = yfinance live quote, "uploaded" = from file, None = default.
    data_source: Optional[str] = Field(None, example="live")
    # Enrichment status (Phase 3) — populated after upload enrichment pipeline.
    # Transparent to the UI so stale/weak data can be labelled.
    sector_status:       Optional[str] = Field(None,
        description="Source that resolved this sector: from_file|yfinance|fmp|static_map|unknown")
    fundamentals_status: Optional[str] = Field(None,
        description="Whether fundamentals were fetched at upload: fetched|unavailable|pending")
    enrichment_status:   Optional[str] = Field(None,
        description="Overall enrichment quality: enriched|partial|failed|pending")


class HoldingCreate(HoldingBase):
    pass


class HoldingUpdate(BaseModel):
    quantity: Optional[float] = None
    average_cost: Optional[float] = None
    current_price: Optional[float] = None
    sector: Optional[str] = None


class HoldingResponse(HoldingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    portfolio_id: int

    # Computed fields (derived at response time, not stored)
    @property
    def market_value(self) -> Optional[float]:
        if self.current_price:
            return self.quantity * self.current_price
        return None

    @property
    def pnl(self) -> Optional[float]:
        if self.current_price:
            return (self.current_price - self.average_cost) * self.quantity
        return None

    @property
    def pnl_pct(self) -> Optional[float]:
        if self.current_price and self.average_cost:
            return ((self.current_price - self.average_cost) / self.average_cost) * 100
        return None


class HoldingEnriched(HoldingBase):
    """
    HoldingBase extended with pre-computed portfolio-level metrics.
    Returned by /portfolio/full — saves frontend from recomputing these.
    """
    market_value: Optional[float] = Field(None, description="quantity × current_price (or avg_cost fallback)")
    pnl:          Optional[float] = Field(None, description="(current_price − avg_cost) × quantity")
    pnl_pct:      Optional[float] = Field(None, description="P&L as % of cost basis")
    weight:       Optional[float] = Field(None, description="holding's % share of total portfolio value")


# ─── Portfolio Schemas ────────────────────────────────────────────────────────

class PortfolioBase(BaseModel):
    name: str = Field("My Portfolio", example="My Portfolio")
    source: str = Field("mock", example="mock")


class PortfolioCreate(PortfolioBase):
    pass


class PortfolioResponse(PortfolioBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    holdings: list[HoldingResponse] = []


# ─── Summary / Analytics Schemas ─────────────────────────────────────────────

class PortfolioSummary(BaseModel):
    """High-level portfolio KPIs for the dashboard header cards."""
    total_value: float
    total_cost: float
    total_pnl: float
    total_pnl_pct: float
    num_holdings: int
    top_sector: Optional[str] = None
    data_source: str = "mock"


class SectorAllocation(BaseModel):
    sector: str
    value: float
    weight_pct: float
    num_holdings: int


# ─── Risk Snapshot (concentration + diversification) ─────────────────────────

RiskProfile = Literal[
    "highly_concentrated",  # max holding ≥ 40% OR HHI ≥ 0.30
    "sector_concentrated",  # max sector ≥ 60%
    "aggressive",           # top-3 ≥ 60% OR ≤ 2 sectors
    "conservative",         # ≥ 5 sectors AND HHI ≤ 0.12
    "moderate",             # default
]


class TopHoldingWeight(BaseModel):
    ticker: str
    name:   str
    weight: float   # %
    sector: str


class RiskSnapshot(BaseModel):
    """
    Concentration + diversification metrics derived from holdings and sectors.
    Computed server-side in portfolio_service.get_full() — eliminates the need
    for client-side computeRiskSnapshot() calls.

    Mirrors the RiskSnapshot interface in frontend/src/types/index.ts exactly
    so the frontend can consume this without any transformation.
    """
    # Concentration
    max_holding_weight:        float
    top3_weight:               float
    top5_weight:               float
    max_sector_weight:         float
    max_sector_name:           str

    # Breadth
    num_holdings: int
    num_sectors:  int

    # Diversification
    hhi:                  float   # Herfindahl–Hirschman Index (0–1, lower = more diversified)
    effective_n:          float   # 1/HHI — equivalent equal-weight positions
    diversification_score: int    # 0–100 composite score

    # Risk profile
    risk_profile:        RiskProfile
    risk_profile_reason: str

    # Flags
    single_stock_flag:          bool   # any holding ≥ 30%
    sector_concentration_flag:  bool   # any sector ≥ 50%

    # Top holdings for ConcentrationBreakdown chart
    top_holdings_by_weight: list[TopHoldingWeight]


# ─── Fundamentals Summary (lightweight — availability only, no API calls) ─────

class FundamentalsSummary(BaseModel):
    """
    Lightweight fundamentals availability metadata for the portfolio bundle.
    Derived from the holdings' fundamentals_status DB field — no live API call.
    Tells the UI whether fundamentals data exists and how complete it is.
    Full weighted metrics remain on GET /analytics/ratios.
    """
    available:          bool           = False
    total_holdings:     int            = 0
    holdings_with_data: int            = 0
    coverage_pct:       Optional[float] = None   # % of holdings with fetched fundamentals


# ─── Portfolio Bundle Metadata ────────────────────────────────────────────────

class PortfolioBundleMeta(BaseModel):
    """
    Provenance and freshness metadata for a /portfolio/full response.
    Gives the frontend a single authoritative source for portfolio identity
    rather than stitching it together from multiple store slices.

    Cross-module alignment notes
    ----------------------------
    incomplete     — mirrors the ``incomplete`` flag used by /analytics/ratios,
                     /quant/full, and /peers/{ticker}.  True whenever the portfolio
                     is not in a fully-usable state (enriching, degraded, or empty).
    lifecycle_state — single discriminated label for the portfolio state.
                     'empty'     → no holdings; nothing to analyse.
                     'enriching' → holdings exist but background enrichment is still
                                   running (fundamentals/sector data pending).
                     'degraded'  → enrichment complete but some holdings are missing
                                   a current price (partial_data is True).
                     'ready'     → enrichment complete and all holdings have prices.
    """
    mode:               str
    portfolio_id:       Optional[int] = None
    portfolio_name:     Optional[str] = None
    as_of:              str           # ISO-8601 UTC datetime of response
    enrichment_complete: bool         = False   # False while background enrichment is running
    partial_data:       bool          = False   # True when any holding has no current_price
    # ── Cross-module aligned fields ───────────────────────────────────────────
    # ``incomplete`` matches the contract used by analytics/quant/peers modules.
    incomplete:         bool          = False
    # ``lifecycle_state`` is the single authoritative state label for this portfolio.
    lifecycle_state:    str           = "ready"  # empty | enriching | degraded | ready


# ─── Portfolio Full Response ──────────────────────────────────────────────────

class PortfolioFullResponse(BaseModel):
    """
    Canonical portfolio intelligence bundle — one round trip, zero client-side math.

    Replaces:
      GET /portfolio/         → holdings[]
      GET /portfolio/summary  → PortfolioSummary
      GET /portfolio/sectors  → SectorAllocation[]

    Added in Portfolio Aggregation Isolation:
      risk_snapshot        — concentration + diversification (was computed client-side)
      fundamentals_summary — lightweight availability metadata (no API call)
      meta                 — provenance: mode, portfolio_id, portfolio_name, as_of

    Holdings include pre-computed market_value, pnl, pnl_pct, weight.
    RiskSnapshot mirrors frontend/src/types/index.ts#RiskSnapshot exactly.
    """
    holdings:             list[HoldingEnriched]
    summary:              PortfolioSummary
    sectors:              list[SectorAllocation]
    risk_snapshot:        Optional[RiskSnapshot]      = None   # null when portfolio is empty
    fundamentals_summary: FundamentalsSummary         = Field(default_factory=FundamentalsSummary)
    meta:                 Optional[PortfolioBundleMeta] = None


class RiskMetrics(BaseModel):
    """
    Scaffold for risk analytics response.
    Populated by analytics/risk.py in Phase 2.
    """
    beta: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    volatility_annualised: Optional[float] = None
    max_drawdown: Optional[float] = None
    var_95: Optional[float] = None
    note: str = "Risk metrics require historical price data. Available in Phase 2."


# ─── Fundamentals / Valuation Schemas ────────────────────────────────────────

class FinancialRatioResponse(BaseModel):
    """
    Full fundamentals response for a single holding.
    Null fields indicate the metric is not applicable or not available
    for that business type (e.g. banks do not have meaningful D/E or operating margin).

    Phase 1: Populated from mock_data/portfolio.json.
    Phase 2: Fetched from yfinance / Financial Modeling Prep API.
    """
    ticker: str
    name: str
    sector: Optional[str] = None
    industry: Optional[str] = None
    source: str = "mock"

    # ── Trust / freshness fields ──────────────────────────────────────────────
    # Set when source='unavailable'; describes why data could not be fetched.
    error:             Optional[str]   = Field(None, description="Reason data is unavailable")
    # Unix timestamp (seconds) when the data was fetched from the provider.
    fetched_at:        Optional[float] = Field(None, description="Epoch seconds of last fetch")
    # Seconds since the cached value was populated (injected by cache layer).
    cache_age_seconds: Optional[int]   = Field(None, description="Seconds since cache was populated")

    # ── Valuation multiples ──────────────────────────────────────────────────
    pe_ratio: Optional[float] = None          # Trailing 12-month P/E
    forward_pe: Optional[float] = None        # Forward P/E (next-12-month consensus)
    pb_ratio: Optional[float] = None          # Price / Book Value
    ev_ebitda: Optional[float] = None         # EV / EBITDA (not meaningful for banks)
    peg_ratio: Optional[float] = None         # P/E divided by earnings growth rate

    # ── Income & yield ────────────────────────────────────────────────────────
    dividend_yield: Optional[float] = None    # Annual dividend / current price (%)

    # ── Quality ratios ────────────────────────────────────────────────────────
    roe: Optional[float] = None               # Return on Equity (%)
    roa: Optional[float] = None               # Return on Assets (%)
    operating_margin: Optional[float] = None  # Operating profit / revenue (%, null for banks)
    profit_margin: Optional[float] = None     # Net profit / revenue (%, null for banks)

    # ── Growth rates ──────────────────────────────────────────────────────────
    revenue_growth: Optional[float] = None    # YoY revenue growth (%)
    earnings_growth: Optional[float] = None   # YoY EPS / net profit growth (%)

    # ── Balance sheet ─────────────────────────────────────────────────────────
    debt_to_equity: Optional[float] = None    # Total debt / equity (null for banks)
    market_cap: Optional[float] = None        # Market capitalisation in INR


# ─── Weighted Fundamentals & Trust Metadata ──────────────────────────────────

class WeightedFundamentals(BaseModel):
    """
    Portfolio-level weighted-average fundamentals.
    Each metric is weighted by the holding's share of total portfolio market value.
    Weights are re-normalised among non-null contributors so nulls don't bias toward zero.
    Matches the algorithm in frontend/src/lib/fundamentals.ts → computeWeightedMetrics().

    Values that fall outside sanity limits (e.g. PE > 300, negative PB) are excluded
    from the weighted average and counted in `outliers_excluded`.  This prevents clearly
    bogus provider data from poisoning portfolio-level signals.
    """
    # Valuation
    wtd_pe:               Optional[float] = None
    wtd_forward_pe:       Optional[float] = None
    wtd_pb:               Optional[float] = None
    wtd_ev_ebitda:        Optional[float] = None
    wtd_peg:              Optional[float] = None
    # Income
    wtd_div_yield:        Optional[float] = None
    # Quality
    wtd_roe:              Optional[float] = None
    wtd_roa:              Optional[float] = None
    wtd_operating_margin: Optional[float] = None
    wtd_profit_margin:    Optional[float] = None
    # Growth
    wtd_revenue_growth:   Optional[float] = None
    wtd_earnings_growth:  Optional[float] = None
    # Leverage
    wtd_debt_to_equity:   Optional[float] = None
    # Coverage: how many holdings contributed to each metric (non-null, finite, within limits)
    coverage: dict[str, int] = Field(default_factory=dict)
    # Outliers: how many holdings were excluded per metric due to extreme values
    # A non-zero count means the weighted value is computed on fewer holdings than coverage implies.
    outliers_excluded: dict[str, int] = Field(default_factory=dict)


class FundamentalsMeta(BaseModel):
    """
    Trust and freshness metadata for the fundamentals response.
    Surfaces data quality so callers never unknowingly display incomplete data
    as if it were fully complete.
    """
    source:              str            = "yfinance"
    as_of:               Optional[str]  = None    # ISO-8601 UTC datetime
    incomplete:          bool           = False   # True when any holding has no fundamentals
    total_holdings:      int            = 0
    available_holdings:  int            = 0
    unavailable_tickers: list[str]      = Field(default_factory=list)
    coverage_pct:        Optional[float] = None   # % of holdings with fundamentals data
    # Outlier filtering: how many metric values were excluded across all holdings
    # due to sanity limits.  > 0 means some weighted averages are based on partial data.
    outliers_excluded_total: int         = 0
    unknown_sectors_count:   int         = 0      # holdings with sector = "Unknown"
    # Per-ticker exclusion reasons — mirrors quant meta's excluded_reason pattern.
    # Maps ticker → human-readable reason string for each unavailable holding.
    excluded_reason:         dict[str, str] = Field(default_factory=dict)


class FundamentalsThresholds(BaseModel):
    """
    Backend-owned threshold constants shipped to the frontend in every
    /analytics/ratios response. The frontend reads these and uses them for
    traffic-light coloring and insight rules — it never hardcodes them.

    Single source of truth: app/services/fundamentals_view_service.py
    If a threshold changes there, it propagates here automatically on next request.
    """
    # P/E ratio
    pe_cheap:        float   # below        → good (Cheap)
    pe_fair_max:     float   # cheap..this  → neutral (Fair)
    pe_elevated_max: float   # fair_max..this → warning (Elevated); above → danger

    # PEG ratio
    peg_undervalued: float
    peg_fair_max:    float
    peg_premium_max: float

    # P/B ratio
    pb_below_book:  float
    pb_fair_max:    float
    pb_premium_max: float

    # ROE (%)
    roe_excellent: float
    roe_good:      float
    roe_moderate:  float    # below → danger (Weak)

    # ROA (%)
    roa_excellent: float
    roa_good:      float
    roa_moderate:  float

    # Margin — operating & net (%)
    margin_strong:   float
    margin_moderate: float
    margin_thin:     float   # below → danger (Very Thin)

    # Growth — revenue & earnings (%)
    growth_high:    float
    growth_healthy: float
    growth_slow:    float    # below → danger (Declining)

    # D/E ratio
    dte_conservative: float
    dte_moderate:     float
    dte_leveraged:    float  # above → danger (High Debt)

    # Dividend yield (%)
    div_yield_high:     float
    div_yield_moderate: float

    # Portfolio-level insight thresholds (used in insight engine rules)
    insight_pe_expensive:    float
    insight_pe_cheap:        float
    insight_peg_expensive:   float
    insight_roe_strong:      float
    insight_roe_weak:        float
    insight_margin_thin:     float
    insight_div_yield_solid: float
    insight_div_yield_low:   float


class FinancialRatiosResponse(BaseModel):
    """
    Bundled fundamentals response — per-holding ratios + weighted portfolio metrics
    + trust metadata + backend-owned thresholds.

    Holdings with unavailable fundamentals are included with source='unavailable'
    and an error field rather than being silently dropped.

    `thresholds` ships the canonical threshold constants from
    fundamentals_view_service.py to the frontend. The frontend uses these
    for traffic-light coloring and insight rules and never hardcodes them.
    """
    holdings:   list[FinancialRatioResponse]
    weighted:   WeightedFundamentals
    meta:       FundamentalsMeta
    thresholds: FundamentalsThresholds


# ─── Upload Schemas ───────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    success: bool
    filename: str
    holdings_parsed: int
    message: str


# ─── Watchlist Schemas — Phase 1 ─────────────────────────────────────────────
#
#   tag          — conviction/category label (free string, UI enforces preset options)
#   sector       — user-assigned sector for visual grouping
#   target_price — user's own reference price in INR (not a live quote)
#
#   Future (Phase 2): live_price, pe_ratio, 52w_high/low, analyst_target — all
#   to be enriched by a background yfinance job and attached to this record.

WATCHLIST_TAGS = [
    "General",
    "High Conviction",
    "Speculative",
    "Income",
    "Defensive",
    "Research",
]


class WatchlistItem(BaseModel):
    ticker:       str
    name:         Optional[str]   = None
    tag:          Optional[str]   = "General"
    sector:       Optional[str]   = None
    target_price: Optional[float] = None
    notes:        Optional[str]   = None


class WatchlistItemUpdate(BaseModel):
    """Partial update schema — all fields optional; only supplied fields are updated."""
    name:         Optional[str]   = None
    tag:          Optional[str]   = None
    sector:       Optional[str]   = None
    target_price: Optional[float] = None
    notes:        Optional[str]   = None


class WatchlistItemResponse(WatchlistItem):
    model_config = ConfigDict(from_attributes=True)
    id:       int
    added_at: datetime


# ─── AI Chat Schemas (scaffold) ───────────────────────────────────────────────

class ChatMessage(BaseModel):
    message: str = Field(..., example="What is my portfolio's Sharpe ratio?")
    portfolio_context: Optional[dict] = None


class ChatResponse(BaseModel):
    reply: str
    source: str = "scaffold"
    enabled: bool = False
