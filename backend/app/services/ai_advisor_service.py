"""
AI Advisor Service
-------------------
Orchestrates the full AI advisory pipeline:
  1. Resolve portfolio_id (use active portfolio if None)
  2. Build PortfolioContext via PortfolioContextBuilder
  3. Render a rich system prompt from the context
  4. Call the LLM provider (Claude → OpenAI → FallbackProvider)
  5. Parse JSON response into AIAdvisorResponse
  6. Set fallback_used=True if provider unavailable or response unparseable

The frontend decides what to do with fallback_used=True:
  - It runs local rule-based routeQuery() and ignores the empty AI response
  - This keeps rule-based logic entirely on the frontend (DRY principle)

Prompt design:
  - System prompt is TEXT (not JSON) — readable, stable token count
  - Response format is JSON — predictable, easy to parse
  - JSON schema: {summary, insights, recommendations, follow_ups}
  - On parse failure: raw text used as single insight
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config       import settings
from app.models.portfolio  import Portfolio
from app.schemas.advisor   import (
    AIAdvisorResponse,
    AdvisorQueryRequest,
    ContextSummary,
    PortfolioContextPayload,
    SnapshotBrief,
    RecentChanges,
    HoldingBrief,
    SectorBrief,
)
from app.services.context_builder import PortfolioContextBuilder, PortfolioContext
from app.services.ai.provider     import get_provider, get_provider_status, FallbackProvider, ProviderError

logger = logging.getLogger(__name__)

# ─── System prompt template ───────────────────────────────────────────────────

def _render_system_prompt(ctx: PortfolioContext) -> str:
    """
    Render a clean text system prompt from a PortfolioContext.
    Structured in labelled sections so the LLM can locate information easily.
    """
    lines = [
        "You are an expert portfolio analyst for P-Insight, a personal finance platform.",
        "Answer the user's question about their investment portfolio based on the data below.",
        "Be specific — reference actual tickers, percentages, and values from the data.",
        "Be concise — the user is an investor, not a finance textbook reader.",
        "",
        "RESPONSE FORMAT (strict JSON, no markdown):",
        '{',
        '  "summary":         "One clear sentence directly answering the question",',
        '  "insights":        ["Specific observation 1", "Specific observation 2", "..."],',
        '  "recommendations": ["Optional concrete action 1", "..."],',
        '  "follow_ups":      ["Related question 1", "Related question 2", "Related question 3"]',
        '}',
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        f"PORTFOLIO: {ctx.portfolio_name}",
        f"Source: {ctx.source}",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "SUMMARY",
        f"  Total Value : ₹{ctx.total_value:,.0f}",
        f"  Total Cost  : ₹{ctx.total_cost:,.0f}",
        f"  P&L         : ₹{ctx.total_pnl:,.0f}  ({ctx.total_pnl_pct:+.2f}%)",
        f"  Holdings    : {ctx.num_holdings}",
        "",
    ]

    # Top holdings table
    lines.append("TOP HOLDINGS (by portfolio weight)")
    lines.append("  Ticker       Weight%   P&L%    Sector")
    for h in ctx.top_holdings[:10]:
        lines.append(
            f"  {h.ticker:<12} {h.weight_pct:>6.1f}%  {h.pnl_pct:>+6.1f}%  {h.sector}"
        )
    lines.append("")

    # Sector allocation
    lines.append("SECTOR ALLOCATION")
    for s in ctx.sector_allocation:
        bar = "█" * int(s.weight_pct / 5)
        lines.append(f"  {s.sector:<22} {s.weight_pct:>5.1f}%  {bar}")
    lines.append("")

    # Risk profile
    lines.append("RISK PROFILE")
    lines.append(f"  Classification      : {ctx.risk_profile.replace('_', ' ').title()}")
    lines.append(f"  Diversification     : {ctx.diversification_score:.0f}/100")
    lines.append(f"  HHI                 : {ctx.hhi:.4f}  (lower = more diversified)")
    lines.append(f"  Largest holding     : {ctx.max_holding_ticker} at {ctx.max_holding_weight:.1f}%")
    lines.append(f"  Top-3 combined      : {ctx.top3_weight:.1f}%")
    lines.append(f"  Sectors represented : {ctx.num_sectors}")
    lines.append("")

    # Snapshot history
    if ctx.snapshot_count > 0:
        lines.append(f"SNAPSHOT HISTORY  ({ctx.snapshot_count} saved)")
        for s in ctx.snapshots[:5]:
            date_str = s.captured_at[:10] if s.captured_at else "unknown"
            label    = f" [{s.label}]" if s.label else ""
            lines.append(f"  #{s.id}{label}  {date_str}  ₹{s.total_value:,.0f}  ({s.num_holdings} holdings)")
        lines.append("")

    # Recent changes
    if ctx.recent_changes:
        rc = ctx.recent_changes
        lines.append(f"RECENT CHANGES (since {rc.days_apart}d ago)")
        sign = "+" if rc.value_delta >= 0 else ""
        lines.append(f"  Value change    : {sign}₹{rc.value_delta:,.0f}  ({sign}{rc.value_delta_pct:.2f}%)")
        if rc.added_tickers:
            lines.append(f"  Added           : {', '.join(rc.added_tickers)}")
        if rc.removed_tickers:
            lines.append(f"  Removed         : {', '.join(rc.removed_tickers)}")
        if rc.increased_count or rc.decreased_count:
            lines.append(f"  Increased qty   : {rc.increased_count}  |  Decreased qty: {rc.decreased_count}")
        lines.append("")

    lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    return "\n".join(lines)


# ─── Response parser ──────────────────────────────────────────────────────────

def _parse_response(raw: str, query: str, provider_name: str, model: Optional[str], latency_ms: int) -> AIAdvisorResponse:
    """
    Parse the raw LLM response into AIAdvisorResponse.
    Handles:
      - Valid JSON from model
      - FallbackProvider signal ({_fallback: true})
      - Unparseable text (wraps as single insight)
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Model returned prose instead of JSON — wrap it
        logger.warning("LLM response was not valid JSON; wrapping as insight")
        return AIAdvisorResponse(
            query           = query,
            summary         = raw[:200] if raw else "Unable to parse AI response.",
            insights        = [raw] if raw else [],
            recommendations = [],
            follow_ups      = [],
            provider        = provider_name,
            model           = model,
            latency_ms      = latency_ms,
            fallback_used   = False,
        )

    # Fallback signal from FallbackProvider
    if data.get("_fallback"):
        return AIAdvisorResponse(
            query           = query,
            summary         = "",
            insights        = [],
            recommendations = [],
            follow_ups      = [],
            provider        = "none",
            model           = None,
            latency_ms      = latency_ms,
            fallback_used   = True,
            error_message   = data.get("_reason"),
        )

    return AIAdvisorResponse(
        query           = query,
        summary         = data.get("summary", ""),
        insights        = data.get("insights", []),
        recommendations = data.get("recommendations", []),
        follow_ups      = data.get("follow_ups", []),
        provider        = provider_name,
        model           = model,
        latency_ms      = latency_ms,
        fallback_used   = False,
    )


# ─── Service ──────────────────────────────────────────────────────────────────

class AIAdvisorService:
    """
    Main AI advisory service.

    Usage:
        svc = AIAdvisorService(db)
        response = svc.ask(req)   # AdvisorQueryRequest
    """

    def __init__(self, db: Session):
        self.db      = db
        self.builder = PortfolioContextBuilder(db)

    # ── Resolve portfolio_id ─────────────────────────────────────────────────

    def _resolve_portfolio_id(self, portfolio_id: Optional[int]) -> int:
        if portfolio_id is not None:
            return portfolio_id
        # Use the active portfolio
        active = (
            self.db.query(Portfolio)
            .filter(Portfolio.is_active.is_(True))
            .first()
        )
        if not active:
            # Fall back to most recently updated
            active = (
                self.db.query(Portfolio)
                .order_by(Portfolio.updated_at.desc())
                .first()
            )
        if not active:
            raise ValueError("No portfolios exist in the database")
        return active.id

    # ── Build context payload (also used for debug endpoint) ─────────────────

    def build_context_payload(self, portfolio_id: int) -> PortfolioContextPayload:
        """Build context and convert to Pydantic model (for debug endpoint)."""
        ctx = self.builder.build(portfolio_id)
        return PortfolioContextPayload(
            portfolio_id      = ctx.portfolio_id,
            portfolio_name    = ctx.portfolio_name,
            source            = ctx.source,
            total_value       = ctx.total_value,
            total_cost        = ctx.total_cost,
            total_pnl         = ctx.total_pnl,
            total_pnl_pct     = ctx.total_pnl_pct,
            num_holdings      = ctx.num_holdings,
            top_holdings      = [
                HoldingBrief(**{k: v for k, v in h.__dict__.items() if not k.startswith('_')})
                for h in ctx.top_holdings
            ],
            sector_allocation = [
                SectorBrief(**{k: v for k, v in s.__dict__.items() if not k.startswith('_')})
                for s in ctx.sector_allocation
            ],
            risk_profile          = ctx.risk_profile,
            hhi                   = ctx.hhi,
            diversification_score = ctx.diversification_score,
            max_holding_ticker    = ctx.max_holding_ticker,
            max_holding_weight    = ctx.max_holding_weight,
            top3_weight           = ctx.top3_weight,
            num_sectors           = ctx.num_sectors,
            snapshot_count        = ctx.snapshot_count,
            snapshots             = [
                SnapshotBrief(
                    id           = s.id,
                    label        = s.label,
                    captured_at  = s.captured_at,
                    total_value  = s.total_value,
                    num_holdings = s.num_holdings,
                ) for s in ctx.snapshots
            ],
            recent_changes = (
                RecentChanges(
                    days_apart      = ctx.recent_changes.days_apart,
                    value_delta     = ctx.recent_changes.value_delta,
                    value_delta_pct = ctx.recent_changes.value_delta_pct,
                    added_tickers   = ctx.recent_changes.added_tickers,
                    removed_tickers = ctx.recent_changes.removed_tickers,
                    increased_count = ctx.recent_changes.increased_count,
                    decreased_count = ctx.recent_changes.decreased_count,
                ) if ctx.recent_changes else None
            ),
            built_at = ctx.built_at,
        )

    # ── Main ask method ───────────────────────────────────────────────────────

    def ask(self, req: AdvisorQueryRequest) -> AIAdvisorResponse:
        """
        Run the full advisory pipeline for a user query.

        1. Resolve portfolio
        2. Build context
        3. Get provider
        4. Call LLM
        5. Parse + return response
        """
        t0 = time.monotonic()

        # Resolve portfolio
        try:
            pid = self._resolve_portfolio_id(req.portfolio_id)
        except ValueError as e:
            return AIAdvisorResponse(
                query         = req.query,
                summary       = "",
                insights      = [],
                recommendations = [],
                follow_ups    = [],
                fallback_used = True,
                error_message = str(e),
            )

        # Build context
        try:
            ctx = self.builder.build(pid)
        except Exception as e:
            logger.error("Context build failed for portfolio %s: %s", pid, e)
            return AIAdvisorResponse(
                query         = req.query,
                summary       = "",
                insights      = [],
                recommendations = [],
                follow_ups    = [],
                fallback_used = True,
                error_message = f"Context build failed: {e}",
            )

        # Get provider
        provider = get_provider()
        info     = provider.get_info()

        # Build system prompt + call provider
        system_prompt = _render_system_prompt(ctx)
        raw_response  = ""

        try:
            raw_response = provider.complete(system_prompt, req.query)
        except ProviderError as e:
            logger.warning("Provider %s failed: %s", info.get("provider"), e)
            raw_response = json.dumps({
                "_fallback": True,
                "_reason":   str(e),
            })
        except Exception as e:
            logger.error("Unexpected provider error: %s", e)
            raw_response = json.dumps({
                "_fallback": True,
                "_reason":   f"Unexpected error: {e}",
            })

        latency_ms = int((time.monotonic() - t0) * 1000)

        # Parse response
        resp = _parse_response(
            raw          = raw_response,
            query        = req.query,
            provider_name = info.get("provider", "none"),
            model         = info.get("model"),
            latency_ms    = latency_ms,
        )

        # Attach context summary
        resp.context_summary = ContextSummary(
            holdings_count     = ctx.num_holdings,
            snapshots_count    = ctx.snapshot_count,
            sectors_count      = ctx.num_sectors,
            has_recent_changes = ctx.recent_changes is not None,
        )

        return resp
