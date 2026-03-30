"""
File Upload Data Provider
---------------------------
Serves portfolio data from an uploaded Excel or CSV file.
After upload, the parsed holdings are cached in-memory for the session.
Future enhancement: persist to the uploads/ directory and DB.
"""

from pathlib import Path
from typing import Optional
import pandas as pd

from app.data_providers.base import BaseDataProvider
from app.schemas.portfolio import HoldingBase

UPLOADS_PATH = Path(__file__).parent.parent.parent / "uploads"

# In-memory cache for the session — replace with DB-backed storage in Phase 2
_uploaded_holdings: list[HoldingBase] = []


class FileDataProvider(BaseDataProvider):

    @property
    def mode_name(self) -> str:
        return "uploaded"

    @property
    def is_available(self) -> bool:
        return True  # Always available; returns empty if nothing uploaded yet

    async def get_holdings(self) -> list[HoldingBase]:
        return _uploaded_holdings

    @classmethod
    def load_from_file(cls, filepath: str) -> list[HoldingBase]:
        """
        Parse a CSV or Excel file and populate the in-memory cache.
        Call this from the upload endpoint after saving the file.

        Required columns: ticker, name, quantity, average_cost
        Optional columns: current_price, sector, asset_class, currency
        """
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"Uploaded file not found: {filepath}")

        if path.suffix.lower() == ".csv":
            df = pd.read_csv(filepath)
        elif path.suffix.lower() in {".xlsx", ".xls"}:
            df = pd.read_excel(filepath)
        else:
            raise ValueError(f"Unsupported file type: {path.suffix}")

        # Normalise column names
        df.columns = df.columns.str.lower().str.strip().str.replace(" ", "_")

        required = {"ticker", "name", "quantity", "average_cost"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(
                f"Missing required columns: {missing}. "
                f"File has: {list(df.columns)}"
            )

        global _uploaded_holdings
        _uploaded_holdings = []

        for _, row in df.iterrows():
            _uploaded_holdings.append(
                HoldingBase(
                    ticker=str(row["ticker"]).strip().upper(),
                    name=str(row["name"]).strip(),
                    quantity=float(row["quantity"]),
                    average_cost=float(row["average_cost"]),
                    current_price=float(row.get("current_price", row["average_cost"])),
                    sector=str(row.get("sector", "Unknown")).strip()
                    if "sector" in row
                    else None,
                )
            )

        return _uploaded_holdings

    async def get_price_history(self, ticker: str, period: str = "1y", interval: str = "1d") -> dict:
        # Uploaded mode doesn't include price history — fall back to mock or note
        return {
            "ticker": ticker,
            "period": period,
            "data": [],
            "source": "uploaded",
            "note": "Price history not available for uploaded portfolios. Enable Live API mode.",
        }

    async def get_fundamentals(self, ticker: str) -> dict:
        return {
            "ticker": ticker,
            "source": "uploaded",
            "note": "Fundamentals not available in uploaded mode. Enable Live API mode.",
        }

    async def get_news(self, tickers: list[str]) -> list[dict]:
        return []

    async def get_peers(self, ticker: str) -> list[str]:
        return []


# ─── Boot-time restore helper ─────────────────────────────────────────────────

def _restore_from_db_holdings(db_holdings: list) -> None:
    """
    Populate the in-memory cache from ORM Holding objects loaded from the DB.
    Called by init_db on startup so the 'uploaded' data mode persists across restarts.
    """
    global _uploaded_holdings
    _uploaded_holdings = []
    for h in db_holdings:
        _uploaded_holdings.append(
            HoldingBase(
                ticker=h.ticker,
                name=h.name,
                quantity=h.quantity,
                average_cost=h.average_cost,
                current_price=h.current_price,
                sector=h.sector,
                asset_class=h.asset_class or "Equity",
                currency=h.currency or "INR",
                data_source="uploaded",
            )
        )
