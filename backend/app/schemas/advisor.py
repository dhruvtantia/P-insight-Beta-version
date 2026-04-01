"""
Advisor Schemas
----------------
Pydantic models for the AI Portfolio Advisor API.

Separate from portfolio.py to keep concerns clean — these schemas represent
the AI advisory layer, not raw portfolio data shapes.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ─── Request ──────────────────────────────────────────────────────────────────

class ConversationTurn(BaseModel):
    """A single turn in the conversation history for multi-turn AI calls."""
    role:    str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., description="Message text")


class AdvisorQueryRequest(BaseModel):
    """Body for POST /advisor/ask"""
    query:                str  = Field(..., description="User's natural language question")
    portfolio_id:         Optional[int]  = Field(None, description="Portfolio to analyse (uses active if omitted)")
    include_snapshots:    bool = Field(True,  description="Include snapshot history in context")
    include_optimization: bool = Field(False, description="Include optimization-aware narrative in context")
    conversation_history: list[ConversationTurn] = Field(
        default_factory=list,
        description=(
            "Prior turns in this conversation, oldest first. "
            "Sent to the LLM so it can maintain context across messages. "
            "Limit to last 6 turns to avoid token overflow."
        ),
    )


# ─── Context payload (also used for debug endpoint) ──────────────────────────

class SnapshotBrief(BaseModel):
    id:          int
    label:       Optional[str]
    captured_at: str
    total_value: float
    num_holdings: int


class RecentChanges(BaseModel):
    days_apart:     int
    value_delta:    float
    value_delta_pct: float
    added_tickers:   list[str]
    removed_tickers: list[str]
    increased_count: int
    decreased_count: int


class HoldingBrief(BaseModel):
    ticker:     str
    name:       str
    weight_pct: float
    value:      float
    pnl_pct:    float
    sector:     str


class SectorBrief(BaseModel):
    sector:     str
    weight_pct: float
    num_holdings: int


class SourceMetaPayload(BaseModel):
    """Data-quality summary for the AI context debug view."""
    provider_mode:      str
    live_count:         int
    db_only_count:      int
    unavailable_count:  int
    mock_count:         int
    total_holdings:     int
    data_quality_note:  str


class PortfolioContextPayload(BaseModel):
    """
    Clean, LLM-friendly context object.
    Returned by GET /advisor/context/{portfolio_id} for debug visibility.
    Never exposes raw ORM objects.
    """
    model_config = {"from_attributes": True}

    portfolio_id:   int
    portfolio_name: str
    source:         str

    # KPIs
    total_value:    float
    total_cost:     float
    total_pnl:      float
    total_pnl_pct:  float
    num_holdings:   int

    # Top holdings
    top_holdings:   list[HoldingBrief]

    # Sectors
    sector_allocation: list[SectorBrief]

    # Risk
    risk_profile:         str
    hhi:                  float
    diversification_score: float
    max_holding_ticker:   str
    max_holding_weight:   float
    top3_weight:          float
    num_sectors:          int

    # History
    snapshot_count: int
    snapshots:      list[SnapshotBrief]
    recent_changes: Optional[RecentChanges]

    # Data quality / source metadata
    source_metadata: Optional[SourceMetaPayload] = None

    # Meta
    built_at: str


# ─── Response ─────────────────────────────────────────────────────────────────

class ContextSummary(BaseModel):
    holdings_count:       int
    snapshots_count:      int
    sectors_count:        int
    has_recent_changes:   bool


class AIAdvisorResponse(BaseModel):
    """Response from POST /advisor/ask"""
    query:           str
    summary:         str
    insights:        list[str]
    recommendations: list[str]
    follow_ups:      list[str]
    category:        str       = "general"

    # Provenance
    provider:        str       = "fallback"   # "claude" | "openai" | "fallback"
    model:           Optional[str] = None
    latency_ms:      int       = 0
    fallback_used:   bool      = False
    error_message:   Optional[str] = None

    # What was included in context
    context_summary: Optional[ContextSummary] = None


# ─── Status ───────────────────────────────────────────────────────────────────

class AdvisorStatusResponse(BaseModel):
    """Response from GET /advisor/status"""
    available:  bool
    provider:   str        # "claude" | "openai" | "none"
    model:      Optional[str] = None
    message:    str
    ai_enabled: bool       = False
