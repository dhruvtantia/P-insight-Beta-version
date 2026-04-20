"""
Upload V2 Schemas
-----------------
Pydantic response models for the /upload/v2/* endpoints.

Additive — the existing ParseResponse and ConfirmResponse (in upload.py) are
completely unchanged. These schemas are only used by the V2 fast-path routes.
"""

from __future__ import annotations

from pydantic import BaseModel
from typing import Optional, Literal


# ─── Row validation classification ───────────────────────────────────────────

RowValidationStatus = Literal["valid", "valid_with_warning", "invalid"]
"""
Row classification produced by classify_rows_v2():

  valid               — all required fields present and valid; no concerns
  valid_with_warning  — accepted, but flagged (e.g. ISIN-format ticker, very
                        large values, suspicious data) — downstream works but
                        enrichment may not resolve correctly
  invalid             — missing or invalid required field (ticker/qty/avg_cost);
                        row is NOT imported
"""


class ValidatedRow(BaseModel):
    """A row that was accepted (valid or valid_with_warning)."""
    row_index:     int
    ticker:        str
    name:          str
    quantity:      float
    average_cost:  float
    current_price: Optional[float] = None
    sector:        Optional[str]   = None
    industry:      Optional[str]   = None
    purchase_date: Optional[str]   = None
    status:        RowValidationStatus = "valid"
    warnings:      list[str]       = []


class RejectedRow(BaseModel):
    """
    A row that could not be imported because a required field was
    missing or invalid.
    """
    row_index:  int
    raw_ticker: Optional[str] = None
    reasons:    list[str]


class WarningRow(BaseModel):
    """
    Summary of a row with warnings.  The row IS imported but flagged.
    """
    row_index: int
    ticker:    str
    warnings:  list[str]


# ─── V2 confirm response ──────────────────────────────────────────────────────

class V2ConfirmResponse(BaseModel):
    """
    Response from POST /upload/v2/confirm.

    Returned immediately after the base portfolio is persisted to the DB.
    Enrichment (sector, name, current_price, fundamentals) runs as a background
    task — portfolio is usable at once without waiting for it.

    Downstream contract:
      All accepted holdings are in the DB with enrichment_status="pending"
      and the FileDataProvider in-memory cache is live.  Dashboard, Holdings,
      Fundamentals, and Risk pages can be used immediately.
    """

    # ── Identity ──────────────────────────────────────────────────────────────
    portfolio_id: int
    filename:     str
    imported_at:  str           # ISO-8601 UTC timestamp

    # ── Row classification ────────────────────────────────────────────────────
    total_rows:              int   # total data rows in the file
    rows_valid:              int   # clean rows accepted
    rows_valid_with_warning: int   # accepted but flagged
    rows_invalid:            int   # rejected — could not be imported

    # ── Row details (capped at 20 each to keep response lean) ─────────────────
    rejected_rows: list[RejectedRow]   # invalid rows with reasons
    warning_rows:  list[WarningRow]    # accepted-but-flagged rows

    # ── Enrichment staging ────────────────────────────────────────────────────
    # enrichment_started is always True — the background task fires immediately.
    # enrichment_complete is always False at response time — poll /v2/status/{id}.
    enrichment_started:  bool = True
    enrichment_complete: bool = False

    # ── Downstream availability ────────────────────────────────────────────────
    # Always True — the base portfolio is immediately usable even before enrichment.
    portfolio_usable: bool = True

    # ── UI hints ─────────────────────────────────────────────────────────────
    next_action: str   # "dashboard" | "review_warnings" | "fix_rejected"
    message:     str


# ─── V2 status / polling response ────────────────────────────────────────────

class HoldingEnrichmentStatus(BaseModel):
    """Per-holding enrichment state for the polling endpoint."""
    ticker:              str
    normalized_ticker:   Optional[str] = None
    enrichment_status:   str           # pending | enriched | partial | failed
    sector_status:       Optional[str] = None
    name_status:         Optional[str] = None
    fundamentals_status: str = "pending"
    peers_status:        str = "pending"
    failure_reason:      Optional[str] = None
    last_enriched_at:    Optional[str] = None  # ISO-8601 UTC


class V2StatusResponse(BaseModel):
    """
    Response from GET /upload/v2/status/{portfolio_id}.

    Returns current per-holding enrichment state from the DB.
    Frontend can poll this endpoint after V2 confirm to show enrichment progress.
    enrichment_complete becomes True once no holdings remain in "pending" state.
    """
    portfolio_id:        int
    total_holdings:      int
    enriched:            int    # enrichment_status = "enriched"
    partial:             int    # enrichment_status = "partial"
    pending:             int    # enrichment_status = "pending" (not yet processed)
    failed:              int    # enrichment_status = "failed"
    enrichment_complete: bool   # True when pending == 0
    holdings:            list[HoldingEnrichmentStatus]


# ─── Canonical holding contract (documentation) ───────────────────────────────
#
# The holding that exits the V2 pipeline and is safe for all downstream pages:
#
#   ticker:        str            — Uppercase; exchange prefix stripped (NSE: → bare)
#   quantity:      float          — > 0 validated
#   average_cost:  float          — > 0 validated
#   name:          str            — From file or ticker fallback; enrichment resolves
#   sector:        Optional[str]  — None at persist time; enrichment sets or "Unknown"
#   industry:      Optional[str]  — None at persist time; enrichment sets
#   current_price: Optional[float]— None at persist time; price-fetch background sets
#   purchase_date: Optional[str]  — YYYY-MM-DD or None
#   asset_class:   str = "Equity"
#   currency:      str = "INR"
#   data_source:   str = "uploaded"
#
#   enrichment_status:   "pending"  → "enriched" | "partial" | "failed" (after BG task)
#   fundamentals_status: "pending"  → "fetched" | "unavailable" (after BG task)
#   peers_status:        "pending"  (updated by peers endpoint on first access)
#   normalized_ticker:   None       → "TCS.NS" etc. (after BG task)
#   sector_status:       None       → "from_file" | "yfinance" | "fmp" | "static_map" | "unknown"
#   failure_reason:      None       → set if enrichment fails
#
# This maps directly to the existing HoldingBase schema (schemas/portfolio.py)
# and Holding ORM model (models/portfolio.py). No DB migration required.
