"""
Portfolio Commentary Engine
------------------------------
Generates plain-English portfolio insights from computed analytics.
Phase 1: Rule-based string generation from portfolio summary data.
Phase 2: Feed these insights as context to the AI Chat module.
"""

from app.schemas.portfolio import PortfolioSummary, RiskMetrics, SectorAllocation


def generate_commentary(
    summary: PortfolioSummary,
    sectors: list[SectorAllocation],
    risk: RiskMetrics | None = None,
) -> list[dict]:
    """
    Generate a list of actionable portfolio insights.

    Returns:
        List of insight dicts: { "type": str, "title": str, "message": str, "severity": str }
        severity: "info" | "warning" | "positive" | "neutral"
    """
    insights = []

    # ─── P&L Insight ─────────────────────────────────────────────────────────
    if summary.total_pnl_pct > 10:
        insights.append({
            "type": "performance",
            "title": "Strong Portfolio Performance",
            "message": f"Your portfolio is up {summary.total_pnl_pct:.1f}% overall. "
                       f"Consider reviewing whether to book partial profits.",
            "severity": "positive",
        })
    elif summary.total_pnl_pct < -10:
        insights.append({
            "type": "performance",
            "title": "Portfolio Under Pressure",
            "message": f"Your portfolio is down {abs(summary.total_pnl_pct):.1f}%. "
                       f"Review holdings for any fundamental deterioration.",
            "severity": "warning",
        })
    else:
        insights.append({
            "type": "performance",
            "title": "Moderate Portfolio Return",
            "message": f"Portfolio return of {summary.total_pnl_pct:.1f}% is within normal range.",
            "severity": "neutral",
        })

    # ─── Concentration Risk ───────────────────────────────────────────────────
    if sectors:
        top_sector = sectors[0]
        if top_sector.weight_pct > 40:
            insights.append({
                "type": "concentration",
                "title": f"High Sector Concentration: {top_sector.sector}",
                "message": f"{top_sector.sector} represents {top_sector.weight_pct:.1f}% of your portfolio. "
                           f"Consider diversifying to reduce sector-specific risk.",
                "severity": "warning",
            })

    # ─── Diversification ─────────────────────────────────────────────────────
    if summary.num_holdings < 5:
        insights.append({
            "type": "diversification",
            "title": "Low Diversification",
            "message": f"You hold only {summary.num_holdings} stocks. "
                       f"A well-diversified portfolio typically holds 15–25 stocks.",
            "severity": "warning",
        })
    elif summary.num_holdings >= 15:
        insights.append({
            "type": "diversification",
            "title": "Well Diversified Portfolio",
            "message": f"Your {summary.num_holdings} holdings provide good diversification.",
            "severity": "positive",
        })

    # ─── Risk Metrics (if available) ─────────────────────────────────────────
    if risk and risk.sharpe_ratio is not None:
        if risk.sharpe_ratio >= 1.5:
            insights.append({
                "type": "risk",
                "title": "Excellent Risk-Adjusted Return",
                "message": f"Sharpe Ratio of {risk.sharpe_ratio:.2f} indicates strong risk-adjusted performance.",
                "severity": "positive",
            })
        elif risk.sharpe_ratio < 0.5:
            insights.append({
                "type": "risk",
                "title": "Low Risk-Adjusted Return",
                "message": f"Sharpe Ratio of {risk.sharpe_ratio:.2f} suggests the portfolio may not be compensating "
                           f"sufficiently for the risk taken.",
                "severity": "warning",
            })

    return insights
