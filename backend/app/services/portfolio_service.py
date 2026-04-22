"""
Portfolio Service — Business Logic Layer
------------------------------------------
Coordinates between data providers, repositories, and analytics.
Routes call services. Services call repositories and providers.
Business rules live here, not in routes or repositories.
"""

import math
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from typing import Optional
import pandas as pd

from app.repositories.portfolio_repository import PortfolioRepository
from app.data_providers.base import BaseDataProvider
from app.schemas.portfolio import (
    PortfolioCreate,
    HoldingCreate,
    PortfolioResponse,
    PortfolioSummary,
    SectorAllocation,
    RiskSnapshot,
    TopHoldingWeight,
    FundamentalsSummary,
    PortfolioBundleMeta,
)


class PortfolioService:

    def __init__(self, db: Session, provider: BaseDataProvider):
        self.db = db
        self.provider = provider
        self.repo = PortfolioRepository(db)

    async def get_holdings(self) -> list[dict]:
        """Fetch holdings from the active data provider."""
        holdings = await self.provider.get_holdings()
        return [h.model_dump() for h in holdings]

    async def get_summary(self) -> PortfolioSummary:
        """Compute portfolio-level KPIs."""
        holdings = await self.provider.get_holdings()

        if not holdings:
            return PortfolioSummary(
                total_value=0,
                total_cost=0,
                total_pnl=0,
                total_pnl_pct=0,
                num_holdings=0,
                data_source=self.provider.mode_name,
            )

        total_value = sum(
            h.quantity * (h.current_price or h.average_cost) for h in holdings
        )
        total_cost = sum(h.quantity * h.average_cost for h in holdings)
        total_pnl = total_value - total_cost
        total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0

        # Find top sector by value
        sector_values: dict[str, float] = {}
        for h in holdings:
            sector = h.sector or "Unknown"
            val = h.quantity * (h.current_price or h.average_cost)
            sector_values[sector] = sector_values.get(sector, 0) + val
        top_sector = max(sector_values, key=sector_values.get) if sector_values else None

        return PortfolioSummary(
            total_value=round(total_value, 2),
            total_cost=round(total_cost, 2),
            total_pnl=round(total_pnl, 2),
            total_pnl_pct=round(total_pnl_pct, 2),
            num_holdings=len(holdings),
            top_sector=top_sector,
            data_source=self.provider.mode_name,
        )

    async def get_sector_allocation(self) -> list[SectorAllocation]:
        """Compute sector-level breakdown for pie/donut charts."""
        holdings = await self.provider.get_holdings()
        sector_data: dict[str, dict] = {}

        for h in holdings:
            sector = h.sector or "Unknown"
            value = h.quantity * (h.current_price or h.average_cost)
            if sector not in sector_data:
                sector_data[sector] = {"value": 0, "count": 0}
            sector_data[sector]["value"] += value
            sector_data[sector]["count"] += 1

        total_value = sum(d["value"] for d in sector_data.values())

        return [
            SectorAllocation(
                sector=sector,
                value=round(data["value"], 2),
                weight_pct=round(data["value"] / total_value * 100, 2) if total_value else 0,
                num_holdings=data["count"],
            )
            for sector, data in sorted(
                sector_data.items(), key=lambda x: x[1]["value"], reverse=True
            )
        ]

    # ── Risk snapshot computation ──────────────────────────────────────────────

    @staticmethod
    def _compute_risk_snapshot(
        enriched: list[dict],
        sectors:  list[SectorAllocation],
    ) -> Optional[RiskSnapshot]:
        """
        Compute concentration + diversification metrics from pre-enriched holdings.

        Ports computeRiskSnapshot() from frontend/src/lib/risk.ts to Python so
        the metric is authoritative and consistent across every consumer (dashboard,
        risk page, advisor context, API clients).

        Formulas match the TypeScript implementation exactly — HHI, effective_n,
        diversification score, and risk profile classification all use the same
        thresholds and weighting scheme.
        """
        if not enriched:
            return None

        num_holdings = len(enriched)
        num_sectors  = len(sectors)

        # ── Sort helpers ───────────────────────────────────────────────────────
        by_weight = sorted(enriched, key=lambda h: h.get("weight", 0.0), reverse=True)
        by_sector = sorted(sectors,  key=lambda s: s.weight_pct, reverse=True)

        # ── Concentration metrics ──────────────────────────────────────────────
        max_holding_weight = by_weight[0].get("weight", 0.0) if by_weight else 0.0
        top3_weight = sum(h.get("weight", 0.0) for h in by_weight[:3])
        top5_weight = sum(h.get("weight", 0.0) for h in by_weight[:5])

        max_sector_weight = by_sector[0].weight_pct if by_sector else 0.0
        max_sector_name   = by_sector[0].sector     if by_sector else "Unknown"

        # ── HHI — Σ(weight_i / 100)² ──────────────────────────────────────────
        hhi_raw = sum((h.get("weight", 0.0) / 100) ** 2 for h in enriched)
        hhi     = min(1.0, max(0.0, hhi_raw))  # clamp for floating-point edge cases

        # Effective N = 1/HHI (equivalent equal-weight positions)
        effective_n = (1.0 / hhi) if hhi > 0 else float(num_holdings)

        # ── Diversification score (0–100) ──────────────────────────────────────
        # Component A: weight balance (70 pts)
        hhi_ideal = 1.0 / num_holdings if num_holdings > 1 else 1.0
        hhi_range = 1.0 - hhi_ideal
        if num_holdings > 1 and hhi_range > 0:
            hhi_component = max(0.0, (1.0 - hhi) / hhi_range) * 70.0
        else:
            hhi_component = 0.0

        # Component B: sector breadth (30 pts — full credit at ≥5 sectors)
        sector_component = min(30.0, max(0.0, (num_sectors - 1) * 7.5))

        diversification_score = round(min(100.0, max(0.0, hhi_component + sector_component)))

        # ── Risk profile (priority order — mirrors TypeScript exactly) ─────────
        top_ticker = (
            by_weight[0].get("ticker", "Top holding")
            .upper()
            .rstrip(".NS").rstrip(".BSE").rstrip(".BO")
            if by_weight else "Top holding"
        )

        if max_holding_weight >= 40 or hhi >= 0.30:
            risk_profile = "highly_concentrated"
            risk_reason  = (
                f"{top_ticker} alone represents {max_holding_weight:.1f}% of the portfolio. "
                "Single-stock concentration is very high — a sharp move in this stock "
                "heavily impacts overall returns."
            )
        elif max_sector_weight >= 60:
            risk_profile = "sector_concentrated"
            risk_reason  = (
                f"{max_sector_name} makes up {max_sector_weight:.1f}% of the portfolio. "
                "This heavy sector tilt means the portfolio is exposed to industry-wide "
                "headwinds or regulatory changes."
            )
        elif top3_weight >= 60 or num_sectors <= 2:
            risk_profile = "aggressive"
            risk_reason  = (
                f"Top 3 holdings account for {top3_weight:.1f}% of the portfolio across "
                f"only {num_sectors} sector{'s' if num_sectors != 1 else ''}. "
                "Limited diversification amplifies both upside and downside."
            )
        elif num_sectors >= 5 and hhi <= 0.12:
            risk_profile = "conservative"
            risk_reason  = (
                f"Portfolio is spread across {num_sectors} sectors with balanced position "
                f"sizes (HHI = {hhi:.3f}). This is a well-diversified, lower-concentration profile."
            )
        else:
            risk_profile = "moderate"
            risk_reason  = (
                f"Portfolio shows reasonable diversification across {num_sectors} "
                f"sector{'s' if num_sectors != 1 else ''} with no single position dominating. "
                "Some concentration exists but within normal bounds."
            )

        # ── Flags ──────────────────────────────────────────────────────────────
        single_stock_flag         = max_holding_weight >= 30.0
        sector_concentration_flag = max_sector_weight  >= 50.0

        # ── Top holdings for ConcentrationBreakdown chart ──────────────────────
        top_holdings_by_weight = [
            TopHoldingWeight(
                ticker=h.get("ticker", ""),
                name=h.get("name", "") or "",
                weight=h.get("weight", 0.0),
                sector=h.get("sector") or "Unknown",
            )
            for h in by_weight[:8]
        ]

        return RiskSnapshot(
            max_holding_weight=round(max_holding_weight, 4),
            top3_weight=round(top3_weight, 4),
            top5_weight=round(top5_weight, 4),
            max_sector_weight=round(max_sector_weight, 4),
            max_sector_name=max_sector_name,
            num_holdings=num_holdings,
            num_sectors=num_sectors,
            hhi=round(hhi, 6),
            effective_n=round(effective_n, 2),
            diversification_score=diversification_score,
            risk_profile=risk_profile,
            risk_profile_reason=risk_reason,
            single_stock_flag=single_stock_flag,
            sector_concentration_flag=sector_concentration_flag,
            top_holdings_by_weight=top_holdings_by_weight,
        )

    # ── Fundamentals summary (DB count only — no live API calls) ──────────────

    def _compute_fundamentals_summary(self, portfolio_id: Optional[int]) -> FundamentalsSummary:
        """
        Return lightweight fundamentals availability metadata.

        Counts holdings with fundamentals_status = 'fetched' from the DB.
        Never calls yfinance or any external API — fast indexed query only.
        Full weighted metrics are served by GET /analytics/ratios.
        """
        if portfolio_id is None:
            return FundamentalsSummary()

        try:
            from app.models.portfolio import Holding as HoldingORM
            holdings = (
                self.db.query(HoldingORM)
                .filter(HoldingORM.portfolio_id == portfolio_id)
                .with_entities(HoldingORM.fundamentals_status)
                .all()
            )
            total = len(holdings)
            if total == 0:
                return FundamentalsSummary()

            with_data = sum(
                1 for row in holdings
                if row.fundamentals_status == "fetched"
            )
            coverage_pct = round(with_data / total * 100, 1) if total > 0 else None
            return FundamentalsSummary(
                available=with_data > 0,
                total_holdings=total,
                holdings_with_data=with_data,
                coverage_pct=coverage_pct,
            )
        except Exception:
            return FundamentalsSummary()

    # ── Bundle meta ────────────────────────────────────────────────────────────

    def _get_bundle_meta(
        self,
        enriched:      list[dict],
        portfolio_id:  Optional[int],
        portfolio_name: Optional[str],
    ) -> PortfolioBundleMeta:
        """
        Build provenance metadata for the portfolio bundle response.
        Includes mode, portfolio identity, timestamp, and data quality flags.
        """
        as_of = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        # Partial data flag — true when any holding is missing a live/uploaded price
        partial_data = any(
            h.get("current_price") is None or h.get("data_source") == "unavailable"
            for h in enriched
        )

        # Enrichment complete — check whether any holdings are still pending
        enrichment_complete = True
        if portfolio_id is not None:
            try:
                from app.models.portfolio import Holding as HoldingORM
                pending_count = (
                    self.db.query(HoldingORM)
                    .filter(
                        HoldingORM.portfolio_id == portfolio_id,
                        HoldingORM.enrichment_status == "pending",
                    )
                    .count()
                )
                enrichment_complete = pending_count == 0
            except Exception:
                enrichment_complete = True  # safe default

        return PortfolioBundleMeta(
            mode=self.provider.mode_name,
            portfolio_id=portfolio_id,
            portfolio_name=portfolio_name,
            as_of=as_of,
            enrichment_complete=enrichment_complete,
            partial_data=partial_data,
        )

    # ── Active portfolio resolution ────────────────────────────────────────────

    def _resolve_active_portfolio(self) -> tuple[Optional[int], Optional[str]]:
        """
        Return (portfolio_id, portfolio_name) for the currently active portfolio.
        Returns (None, None) if no active portfolio exists in the DB.
        This gives the meta field a definitive portfolio identity.
        """
        try:
            from app.models.portfolio import Portfolio
            active = (
                self.db.query(Portfolio)
                .filter(Portfolio.is_active == True)  # noqa: E712
                .with_entities(Portfolio.id, Portfolio.name)
                .first()
            )
            if active:
                return active.id, active.name
        except Exception:
            pass
        return None, None

    # ── Main bundle endpoint ───────────────────────────────────────────────────

    async def get_full(self) -> dict:
        """
        Canonical portfolio intelligence bundle: one provider call, one response.

        Returns holdings (with pre-computed metrics), summary, sector allocation,
        risk snapshot, fundamentals availability summary, and provenance metadata.

        Makes exactly ONE call to the data provider, then computes everything
        from that result set.  Replaces three separate /portfolio/* endpoint calls.

        Risk snapshot is computed server-side here — eliminates the duplicated
        client-side computeRiskSnapshot() calls in dashboard and risk pages.
        """
        holdings = await self.provider.get_holdings()
        portfolio_id, portfolio_name = self._resolve_active_portfolio()

        if not holdings:
            return {
                "holdings": [],
                "summary": PortfolioSummary(
                    total_value=0,
                    total_cost=0,
                    total_pnl=0,
                    total_pnl_pct=0,
                    num_holdings=0,
                    data_source=self.provider.mode_name,
                ),
                "sectors":              [],
                "risk_snapshot":        None,
                "fundamentals_summary": FundamentalsSummary(),
                "meta": PortfolioBundleMeta(
                    mode=self.provider.mode_name,
                    portfolio_id=portfolio_id,
                    portfolio_name=portfolio_name,
                    as_of=datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    enrichment_complete=True,
                    partial_data=False,
                ),
            }

        # ── Pass 1: portfolio totals (needed for weight calc) ──────────────────
        total_value = sum(
            h.quantity * (h.current_price or h.average_cost) for h in holdings
        )
        total_cost  = sum(h.quantity * h.average_cost for h in holdings)
        total_pnl     = total_value - total_cost
        total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0.0

        # ── Pass 2: enrich holdings + accumulate sector data ───────────────────
        enriched:     list[dict]         = []
        sector_data:  dict[str, dict]    = {}

        for h in holdings:
            market_val = h.quantity * (h.current_price or h.average_cost)
            pnl = (
                (h.current_price - h.average_cost) * h.quantity
                if h.current_price is not None
                else 0.0
            )
            pnl_pct = (
                (h.current_price - h.average_cost) / h.average_cost * 100
                if h.current_price is not None and h.average_cost > 0
                else 0.0
            )
            weight = (market_val / total_value * 100) if total_value > 0 else 0.0

            h_dict = h.model_dump()
            h_dict["market_value"] = round(market_val, 2)
            h_dict["pnl"]          = round(pnl, 2)
            h_dict["pnl_pct"]      = round(pnl_pct, 4)
            h_dict["weight"]       = round(weight, 4)
            enriched.append(h_dict)

            sector = h.sector or "Unknown"
            if sector not in sector_data:
                sector_data[sector] = {"value": 0.0, "count": 0}
            sector_data[sector]["value"] += market_val
            sector_data[sector]["count"] += 1

        top_sector = (
            max(sector_data, key=lambda s: sector_data[s]["value"])
            if sector_data else None
        )

        summary = PortfolioSummary(
            total_value=round(total_value, 2),
            total_cost=round(total_cost, 2),
            total_pnl=round(total_pnl, 2),
            total_pnl_pct=round(total_pnl_pct, 2),
            num_holdings=len(holdings),
            top_sector=top_sector,
            data_source=self.provider.mode_name,
        )

        sectors = [
            SectorAllocation(
                sector=sector,
                value=round(data["value"], 2),
                weight_pct=round(data["value"] / total_value * 100, 2) if total_value else 0,
                num_holdings=data["count"],
            )
            for sector, data in sorted(
                sector_data.items(), key=lambda x: x[1]["value"], reverse=True
            )
        ]

        # ── Risk snapshot ──────────────────────────────────────────────────────
        risk_snapshot = self._compute_risk_snapshot(enriched, sectors)

        # ── Fundamentals summary (fast DB count, no API call) ──────────────────
        fundamentals_summary = self._compute_fundamentals_summary(portfolio_id)

        # ── Bundle meta ────────────────────────────────────────────────────────
        meta = self._get_bundle_meta(enriched, portfolio_id, portfolio_name)

        return {
            "holdings":             enriched,
            "summary":              summary,
            "sectors":              sectors,
            "risk_snapshot":        risk_snapshot,
            "fundamentals_summary": fundamentals_summary,
            "meta":                 meta,
        }

    async def process_uploaded_file(self, file_path: str) -> list[HoldingCreate]:
        """
        Parse an uploaded Excel or CSV portfolio file into HoldingCreate objects.
        Expected columns: ticker, name, quantity, average_cost, sector (optional)
        """
        if file_path.endswith(".csv"):
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)

        # Normalise column names
        df.columns = df.columns.str.lower().str.strip().str.replace(" ", "_")

        required_cols = {"ticker", "name", "quantity", "average_cost"}
        missing = required_cols - set(df.columns)
        if missing:
            raise ValueError(
                f"Uploaded file is missing required columns: {missing}. "
                f"Found columns: {list(df.columns)}"
            )

        holdings = []
        for _, row in df.iterrows():
            holdings.append(
                HoldingCreate(
                    ticker=str(row["ticker"]).strip().upper(),
                    name=str(row["name"]).strip(),
                    quantity=float(row["quantity"]),
                    average_cost=float(row["average_cost"]),
                    current_price=float(row.get("current_price", row["average_cost"])),
                    sector=str(row.get("sector", "Unknown")).strip(),
                )
            )

        return holdings
