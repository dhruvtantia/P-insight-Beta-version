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
from typing import Optional
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
    # Provenance: which data provider sourced current_price for this holding.
    # "live" = yfinance live quote, "uploaded" = from file, None = default.
    data_source: Optional[str] = Field(None, example="live")


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
