"""
Portfolio Delta — Pure Computation Module
------------------------------------------
Compares two portfolio snapshots and produces a structured delta.
No database I/O — accepts plain dicts/dataclasses from the service layer.

This module is intentionally dependency-free so it can be:
  - called from the snapshot service
  - called from the advisor engine (future)
  - tested in isolation without a DB session

Input shape (mirrors SnapshotDetail):
  snapshot: {
    id, captured_at, total_value, total_pnl,
    holdings: [{ ticker, name, sector, quantity, market_value, weight_pct }],
    sector_weights: { "IT": 35.2, ... }
  }
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


# ─── Internal DTOs ────────────────────────────────────────────────────────────

@dataclass
class _SnapshotRow:
    ticker:       str
    name:         str
    sector:       str
    quantity:     float
    market_value: float
    weight_pct:   float


@dataclass
class HoldingDelta:
    ticker:        str
    name:          str
    sector:        str

    weight_before: Optional[float]
    weight_after:  Optional[float]
    weight_delta:  Optional[float]

    value_before:  Optional[float]
    value_after:   Optional[float]
    value_delta:   Optional[float]

    qty_before:    Optional[float]
    qty_after:     Optional[float]

    status:        str  # "added" | "removed" | "increased" | "decreased" | "unchanged"


@dataclass
class SectorDelta:
    sector:        str
    weight_before: Optional[float]
    weight_after:  Optional[float]
    weight_delta:  Optional[float]


@dataclass
class PortfolioDelta:
    snapshot_a_id: int
    snapshot_b_id: int
    captured_at_a: datetime
    captured_at_b: datetime
    days_apart:    int

    total_value_delta:     Optional[float]
    total_value_delta_pct: Optional[float]
    total_pnl_delta:       Optional[float]

    holding_deltas:    list[HoldingDelta]
    sector_deltas:     list[SectorDelta]

    added_tickers:     list[str]
    removed_tickers:   list[str]
    increased_tickers: list[str]
    decreased_tickers: list[str]
    unchanged_tickers: list[str]

    has_changes: bool


# ─── Helpers ──────────────────────────────────────────────────────────────────

_WEIGHT_CHANGE_THRESHOLD = 0.5   # pp — changes below this are treated as "unchanged"


def _to_rows(snapshot: dict) -> dict[str, _SnapshotRow]:
    return {
        h["ticker"]: _SnapshotRow(
            ticker=h["ticker"],
            name=h.get("name") or h["ticker"],
            sector=h.get("sector") or "Unknown",
            quantity=h.get("quantity") or 0.0,
            market_value=h.get("market_value") or 0.0,
            weight_pct=h.get("weight_pct") or 0.0,
        )
        for h in snapshot.get("holdings", [])
    }


# ─── Main function ────────────────────────────────────────────────────────────

def compute_delta(snap_a: dict, snap_b: dict) -> PortfolioDelta:
    """
    Compare snapshot_a (older) with snapshot_b (newer).
    Both are plain dicts matching the SnapshotDetail schema.
    """
    rows_a = _to_rows(snap_a)
    rows_b = _to_rows(snap_b)

    all_tickers = set(rows_a) | set(rows_b)

    holding_deltas: list[HoldingDelta] = []
    added    : list[str] = []
    removed  : list[str] = []
    increased: list[str] = []
    decreased: list[str] = []
    unchanged: list[str] = []

    for ticker in sorted(all_tickers):
        a = rows_a.get(ticker)
        b = rows_b.get(ticker)

        w_before = a.weight_pct   if a else None
        w_after  = b.weight_pct   if b else None
        w_delta  = (w_after - w_before) if (w_before is not None and w_after is not None) else None

        v_before = a.market_value if a else None
        v_after  = b.market_value if b else None
        v_delta  = (v_after - v_before) if (v_before is not None and v_after is not None) else None

        # Status determination
        if a is None:
            status = "added"
            added.append(ticker)
        elif b is None:
            status = "removed"
            removed.append(ticker)
        elif w_delta is not None and abs(w_delta) >= _WEIGHT_CHANGE_THRESHOLD:
            status = "increased" if w_delta > 0 else "decreased"
            if w_delta > 0:
                increased.append(ticker)
            else:
                decreased.append(ticker)
        else:
            status = "unchanged"
            unchanged.append(ticker)

        holding_deltas.append(HoldingDelta(
            ticker=ticker,
            name=(b or a).name,
            sector=(b or a).sector,
            weight_before=w_before,
            weight_after=w_after,
            weight_delta=round(w_delta, 3) if w_delta is not None else None,
            value_before=round(v_before, 2) if v_before is not None else None,
            value_after=round(v_after, 2)  if v_after  is not None else None,
            value_delta=round(v_delta, 2)  if v_delta  is not None else None,
            qty_before=a.quantity if a else None,
            qty_after=b.quantity  if b else None,
            status=status,
        ))

    # Sort: added/removed first, then by abs(weight_delta) descending
    def _sort_key(hd: HoldingDelta) -> tuple:
        priority = {"added": 0, "removed": 1, "increased": 2, "decreased": 3, "unchanged": 4}
        return (priority.get(hd.status, 5), -(abs(hd.weight_delta) if hd.weight_delta else 0))
    holding_deltas.sort(key=_sort_key)

    # Sector deltas
    sw_a: dict[str, float] = snap_a.get("sector_weights") or {}
    sw_b: dict[str, float] = snap_b.get("sector_weights") or {}
    all_sectors = set(sw_a) | set(sw_b)
    sector_deltas = [
        SectorDelta(
            sector=s,
            weight_before=sw_a.get(s),
            weight_after=sw_b.get(s),
            weight_delta=round((sw_b.get(s, 0) - sw_a.get(s, 0)), 3),
        )
        for s in sorted(all_sectors)
    ]
    sector_deltas.sort(key=lambda sd: -abs(sd.weight_delta or 0))

    # Portfolio-level summary deltas
    val_a = snap_a.get("total_value")
    val_b = snap_b.get("total_value")
    val_delta     = (val_b - val_a) if (val_a and val_b) else None
    val_delta_pct = (val_delta / val_a * 100) if (val_a and val_delta is not None) else None

    pnl_a = snap_a.get("total_pnl")
    pnl_b = snap_b.get("total_pnl")
    pnl_delta = (pnl_b - pnl_a) if (pnl_a is not None and pnl_b is not None) else None

    # Days apart
    ca = snap_a.get("captured_at")
    cb = snap_b.get("captured_at")
    if isinstance(ca, str):
        ca = datetime.fromisoformat(ca)
    if isinstance(cb, str):
        cb = datetime.fromisoformat(cb)
    if ca and cb:
        days_apart = abs((cb - ca).days)
    else:
        days_apart = 0

    has_changes = bool(added or removed or increased or decreased)

    return PortfolioDelta(
        snapshot_a_id=snap_a["id"],
        snapshot_b_id=snap_b["id"],
        captured_at_a=ca or datetime.now(timezone.utc),
        captured_at_b=cb or datetime.now(timezone.utc),
        days_apart=days_apart,
        total_value_delta=round(val_delta, 2) if val_delta is not None else None,
        total_value_delta_pct=round(val_delta_pct, 2) if val_delta_pct is not None else None,
        total_pnl_delta=round(pnl_delta, 2) if pnl_delta is not None else None,
        holding_deltas=holding_deltas,
        sector_deltas=sector_deltas,
        added_tickers=added,
        removed_tickers=removed,
        increased_tickers=increased,
        decreased_tickers=decreased,
        unchanged_tickers=unchanged,
        has_changes=has_changes,
    )
