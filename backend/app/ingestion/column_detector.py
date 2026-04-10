"""
Column Detector
---------------
Fuzzy-matching engine that maps arbitrary CSV/Excel column headers to the
canonical HoldingBase field names: ticker, name, quantity, average_cost,
current_price, sector.

Detection strategy (priority order):
  1. Exact match after normalisation (lower, strip, collapse whitespace/hyphens → underscores)
  2. Known alias lookup in COLUMN_ALIASES
  3. Substring containment (the canonical alias appears inside the column name)

Returns a DetectionResult with per-role mappings and a confidence flag.

Required fields (upload will be rejected if these are absent):
  ticker, quantity, average_cost

Optional fields (upload proceeds without them; enrichment fills them later):
  name, current_price, sector
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

# ─── Alias table ──────────────────────────────────────────────────────────────
#
# Each key is a canonical field name (matches HoldingBase).
# Each value is an ordered list of aliases, most specific first.
# The normaliser lower-cases and replaces [ _-/.]+ with a single underscore
# before comparison.

COLUMN_ALIASES: dict[str, list[str]] = {
    # ── Required ──────────────────────────────────────────────────────────────
    "ticker": [
        # Most explicit ticker identifiers (highest priority)
        "ticker", "symbol", "stock_symbol", "scrip", "stock_code",
        # Indian exchange-specific
        "nse_symbol", "bse_symbol", "nse_code", "bse_code",
        "trading_symbol", "tradingsymbol",
        # Broker-specific (Zerodha, Groww, Kite, Angel, Upstox, HDFC Sec)
        "instrument", "instrument_name", "instrument_symbol",
        "script", "scrip_code", "scrip_symbol",
        "equity", "share", "stock", "code",
        "isin",                          # ISIN can be mapped to ticker as fallback
        "security_id", "security_code",
        "asset", "asset_code",
        # Standalone generic column headers — used when no explicit ticker column exists
        # NOTE: processed before "name" in CANONICAL_FIELDS_ORDER so these are safe
        "security",                      # e.g. "Security" in some broker exports
        "company",                       # e.g. "Company" in simplified exports
    ],
    "quantity": [
        "quantity", "qty", "shares", "no_of_shares", "number_of_shares",
        "num_shares", "units", "holdings", "holding", "volume",
        "lots", "balance_units", "net_qty",
        # Broker-specific
        "net_quantity", "available_quantity", "closingbalance",
        "closing_balance", "held_quantity", "total_qty",
        "shares_held", "shares_owned",
        "position_qty", "position_quantity",
    ],
    "average_cost": [
        "average_cost", "avg_cost", "average_price", "avg_price",
        "buy_price", "purchase_price", "cost_price", "invested_price",
        "average_buy_price", "avg_buy_price",
        "cost_per_share", "price_per_share", "invested_at",
        "cost", "buy_avg",
        # Spec-specified synonyms
        "avg_purchase_price", "average_purchase_price",
        "average_traded_price", "avg_traded_price",
        "buying_price", "bought_at",
        "cost_basis", "book_value_per_share",
        "weighted_avg_price", "wap",
    ],
    # ── Optional ──────────────────────────────────────────────────────────────
    "name": [
        "name", "company_name", "company", "stock_name",
        "instrument_name", "security_name", "security",
        "description", "full_name", "issuer",
        # Broker-specific
        "company_fullname", "asset_name", "scrip_name",
    ],
    "current_price": [
        "current_price", "ltp", "last_traded_price", "last_price",
        "market_price", "cmp", "close_price", "closing_price",
        "current_market_price", "present_price", "price",
        # Broker-specific
        "last_trade_price", "last_close_price", "current_value_per_share",
        "live_price", "latest_price", "mkt_price",
    ],
    "sector": [
        "sector", "industry", "sector_name", "industry_name",
        "category", "segment", "sub_sector",
        "gics_sector", "classification",
        # Broker / fund-specific
        "asset_class", "product_type", "fund_category",
    ],
}

# Ordered so that required fields are listed first for display purposes
CANONICAL_FIELDS_ORDER = [
    "ticker",
    "quantity",
    "average_cost",
    "name",           # optional — fallback to ticker if absent
    "current_price",  # optional — filled by enrichment or left as None
    "sector",         # optional — filled by enrichment if absent
]

# Minimum columns required for a row to be accepted.
# 'name' is intentionally NOT required — the normaliser falls back to the ticker.
REQUIRED_FIELDS = {"ticker", "quantity", "average_cost"}

# Optional fields — import proceeds without them; enrichment fills them post-import
OPTIONAL_FIELDS = {"name", "current_price", "sector"}


# ─── Normalisation helper ─────────────────────────────────────────────────────

def _normalise(col: str) -> str:
    """Lower-case, strip, replace any run of [ _\\-./]+ with a single underscore."""
    col = col.strip().lower()
    col = re.sub(r"[\s_\-./]+", "_", col)
    return col


# ─── Result dataclass ─────────────────────────────────────────────────────────

@dataclass
class DetectionResult:
    """
    Outcome of column detection on a single file.

    mapping:          canonical_field → original_column_name (None if not found)
    unmatched:        original column names that weren't claimed by any role
    confidence:       True if all *required* columns were detected automatically
    ambiguous_fields: canonical fields where detection is uncertain (matched via
                      substring rather than alias)
    """
    mapping:          dict[str, Optional[str]]
    unmatched:        list[str]
    confidence:       bool
    ambiguous_fields: list[str] = field(default_factory=list)


# ─── Main detection function ──────────────────────────────────────────────────

def detect_columns(column_names: list[str]) -> DetectionResult:
    """
    Given the raw column names from a CSV/Excel file, return a DetectionResult.

    Algorithm:
      For each canonical field (in CANONICAL_FIELDS_ORDER):
        For each alias of that field:
          1. Exact normalised match            → high-confidence claim
          2. Substring containment             → low-confidence claim (ambiguous)
        Once a column is claimed by a field it cannot be claimed by another.
    """
    # Normalised → original map, preserving insertion order
    norm_to_orig: dict[str, str] = {_normalise(c): c for c in column_names}
    # Track which original columns have been claimed
    claimed: set[str] = set()

    mapping: dict[str, Optional[str]] = {f: None for f in CANONICAL_FIELDS_ORDER}
    ambiguous: list[str] = []

    for field_name in CANONICAL_FIELDS_ORDER:
        aliases = COLUMN_ALIASES[field_name]

        # Pass 1: exact match
        for alias in aliases:
            norm_alias = _normalise(alias)
            if norm_alias in norm_to_orig:
                orig = norm_to_orig[norm_alias]
                if orig not in claimed:
                    mapping[field_name] = orig
                    claimed.add(orig)
                    break

        if mapping[field_name] is not None:
            continue  # already matched

        # Pass 2: substring containment (only for unclaimed columns)
        for norm_col, orig_col in norm_to_orig.items():
            if orig_col in claimed:
                continue
            for alias in aliases:
                norm_alias = _normalise(alias)
                # Alias must appear as a whole-word or boundary match within the column
                pattern = r"(^|_)" + re.escape(norm_alias) + r"(_|$)"
                if re.search(pattern, norm_col):
                    mapping[field_name] = orig_col
                    claimed.add(orig_col)
                    ambiguous.append(field_name)
                    break
            if mapping[field_name] is not None:
                break

    unmatched = [c for c in column_names if c not in claimed]
    all_required_found = all(mapping[f] is not None for f in REQUIRED_FIELDS)
    # High confidence only if all required fields are exact-matched (not ambiguous)
    high_confidence = all_required_found and not any(f in ambiguous for f in REQUIRED_FIELDS)

    return DetectionResult(
        mapping=mapping,
        unmatched=unmatched,
        confidence=high_confidence,
        ambiguous_fields=ambiguous,
    )
