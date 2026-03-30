"""
Portfolio Normalizer
---------------------
Given a file (CSV or Excel) and a column mapping (canonical_field → original_col),
produces a list of HoldingBase objects ready for the FileDataProvider cache.

Handles real-world messiness:
  - Numeric strings with commas, ₹/Rs./$ prefix, trailing units
  - Ticker case normalisation (upper) and common exchange suffixes (.NS, .BO, .BSE)
  - Empty / NaN cells — treated as None for optional fields or raise for required
  - Duplicate tickers — kept as-is (user decides in preview)
"""

from __future__ import annotations

import re
import logging
from pathlib import Path
from typing import Optional

import pandas as pd

from app.schemas.portfolio import HoldingBase

logger = logging.getLogger(__name__)

# ─── Numeric cleaning ─────────────────────────────────────────────────────────

_CURRENCY_RE = re.compile(r"^[\u20b9₹RsSs$£€\s]+")      # strip leading ₹, Rs, $
_UNIT_RE      = re.compile(r"[A-Za-z\s]+$")               # strip trailing units/text


def _clean_numeric(val) -> Optional[float]:
    """Parse a potentially messy numeric cell: '₹1,23,456.78' → 123456.78."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, (int, float)):
        return float(val)
    text = str(val).strip()
    if not text or text.lower() in ("nan", "none", "-", "n/a", "na"):
        return None
    text = _CURRENCY_RE.sub("", text)   # drop currency prefix
    text = _UNIT_RE.sub("", text)        # drop trailing units
    text = text.replace(",", "").strip() # remove thousands separators
    try:
        return float(text)
    except ValueError:
        logger.warning("Could not parse numeric value: %r", val)
        return None


# ─── Ticker normalisation ─────────────────────────────────────────────────────

def _clean_ticker(val) -> Optional[str]:
    """Upper-case and strip a ticker. Does NOT add exchange suffixes."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    return str(val).strip().upper()


# ─── File parsing ─────────────────────────────────────────────────────────────

def read_file_as_dataframe(filepath: str | Path) -> pd.DataFrame:
    """Read CSV or Excel into a DataFrame. Raises ValueError for unsupported types."""
    path = Path(filepath)
    if path.suffix.lower() == ".csv":
        df = pd.read_csv(filepath, dtype=str, keep_default_na=False)
    elif path.suffix.lower() in {".xlsx", ".xls"}:
        df = pd.read_excel(filepath, dtype=str, keep_default_na=False)
    else:
        raise ValueError(f"Unsupported file type: {path.suffix}")
    # Trim surrounding whitespace from all column names and string values
    df.columns = df.columns.str.strip()
    return df


def preview_rows(
    df: pd.DataFrame,
    column_mapping: dict[str, Optional[str]],
    n: int = 6,
) -> list[dict]:
    """
    Return the first `n` rows in canonical form for preview.
    Missing optional columns will have None values.
    Invalid rows (missing required fields) are included with 'parse_error' set.
    """
    rows = []
    for _, raw in df.head(n).iterrows():
        row = _map_row(raw, column_mapping)
        rows.append(row)
    return rows


def normalize_to_holdings(
    df: pd.DataFrame,
    column_mapping: dict[str, Optional[str]],
) -> tuple[list[HoldingBase], list[dict]]:
    """
    Convert every row in `df` to a HoldingBase.

    Returns:
      holdings:  list of successfully parsed HoldingBase objects
      skipped:   list of dicts with {row_index, raw_ticker, error} for failed rows
    """
    holdings: list[HoldingBase] = []
    skipped: list[dict] = []

    for idx, raw in df.iterrows():
        row = _map_row(raw, column_mapping)

        if row.get("_error"):
            skipped.append({
                "row_index": idx,
                "raw_ticker": row.get("ticker"),
                "error": row["_error"],
            })
            continue

        try:
            h = HoldingBase(
                ticker=row["ticker"],
                name=row["name"],
                quantity=row["quantity"],
                average_cost=row["average_cost"],
                current_price=row.get("current_price"),
                sector=row.get("sector"),
                asset_class="Equity",
                currency="INR",
                data_source="uploaded",
            )
            holdings.append(h)
        except Exception as exc:
            skipped.append({
                "row_index": idx,
                "raw_ticker": row.get("ticker"),
                "error": str(exc),
            })

    return holdings, skipped


# ─── Internal row mapper ──────────────────────────────────────────────────────

def _map_row(raw: pd.Series, column_mapping: dict[str, Optional[str]]) -> dict:
    """Map a raw DataFrame row to canonical dict using the column mapping."""
    def get(field: str):
        col = column_mapping.get(field)
        if col is None or col not in raw.index:
            return None
        v = raw[col]
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    ticker = _clean_ticker(get("ticker"))
    name_val = get("name")
    name = str(name_val).strip() if name_val is not None else (ticker or "Unknown")

    qty = _clean_numeric(get("quantity"))
    avg_cost = _clean_numeric(get("average_cost"))
    cur_price = _clean_numeric(get("current_price"))

    sector_val = get("sector")
    sector = str(sector_val).strip() if sector_val is not None else None

    errors = []
    if not ticker:
        errors.append("missing ticker")
    if qty is None or qty <= 0:
        errors.append(f"invalid quantity ({get('quantity')!r})")
    if avg_cost is None or avg_cost <= 0:
        errors.append(f"invalid average_cost ({get('average_cost')!r})")

    row = {
        "ticker": ticker,
        "name": name,
        "quantity": qty,
        "average_cost": avg_cost,
        "current_price": cur_price,
        "sector": sector,
    }
    if errors:
        row["_error"] = "; ".join(errors)
    return row
