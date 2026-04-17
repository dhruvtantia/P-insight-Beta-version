"""
Portfolio Service — Business Logic Layer
------------------------------------------
Coordinates between data providers, repositories, and analytics.
Routes call services. Services call repositories and providers.
Business rules live here, not in routes or repositories.
"""

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

    async def get_full(self) -> dict:
        """
        Single-pass portfolio bundle: holdings (with pre-computed metrics),
        summary, and sector allocation.

        Makes exactly ONE call to the data provider, then computes everything
        in a single loop.  Replaces three separate /portfolio/* endpoint calls
        that each independently fetched holdings from the provider.
        """
        holdings = await self.provider.get_holdings()

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
                "sectors": [],
            }

        # ── One pass: compute portfolio totals first (needed for weight calc) ──
        total_value = sum(
            h.quantity * (h.current_price or h.average_cost) for h in holdings
        )
        total_cost = sum(h.quantity * h.average_cost for h in holdings)
        total_pnl = total_value - total_cost
        total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0.0

        # ── Second pass: enrich holdings + accumulate sector data ──────────────
        enriched: list[dict] = []
        sector_data: dict[str, dict] = {}

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

        return {
            "holdings": enriched,
            "summary":  summary,
            "sectors":  sectors,
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
