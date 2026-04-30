# Feature Spec — History / Changes Module

**Module owner directory:**
- Backend: `app/api/v1/endpoints/snapshots.py`, `app/api/v1/endpoints/history.py`, `app/services/snapshot_service.py`, `app/services/history_service.py`, `app/models/snapshot.py`, `app/models/history.py`, `app/repositories/snapshot_repository.py`.
- Frontend: `frontend/src/hooks/useSnapshots.ts`, `frontend/src/hooks/useSnapshotHistory.ts`, `frontend/src/hooks/useDelta.ts`, `frontend/src/hooks/usePortfolioHistory.ts`, `frontend/src/lib/delta.ts`, `frontend/src/app/changes/`.

---

## Purpose

Track how the portfolio changes over time via **snapshots** (frozen point-in-time copies of holdings + summary) and compute **deltas** (before/after diffs) so the user can answer "what changed since last month?".

## Inputs

- **Create snapshot:** the current active portfolio (holdings + summary). Optional `note` and `tags` (future).
- **List / detail:** snapshot ID(s) or `portfolio_id`.
- **Delta:** two snapshot IDs (`from`, `to`).
- **Daily history:** `portfolio_id`, optional date range (scaffold; endpoint not fully implemented).

## Outputs

- **`GET /api/v1/snapshots/`** → list of snapshots for the active portfolio:
  ```json
  [
    { "id": 12, "portfolio_id": 1, "created_at": "2026-04-20T21:00:00Z",
      "total_value": 918000, "num_holdings": 22, "note": null }
  ]
  ```
- **`GET /api/v1/snapshots/{id}`** → full snapshot detail (holdings + summary as of the snapshot time).
- **`GET /api/v1/snapshots/delta?from={id}&to={id}`** →
  ```json
  {
    "from": { "id": 11, "created_at": "...", "total_value": 892000 },
    "to":   { "id": 12, "created_at": "...", "total_value": 918000 },
    "summary_delta": { "total_value_abs": 26000, "total_value_pct": 2.9 },
    "holdings_delta": [
      { "ticker": "TCS.NS", "weight_before": 4.1, "weight_after": 4.2, "qty_change": 0, "price_change_pct": 2.3 }
    ],
    "added": ["NEWCO.NS"],
    "removed": ["OLDCO.NS"],
    "sectors_delta": [
      { "sector": "IT Services", "weight_before": 24.0, "weight_after": 25.1, "delta": 1.1 }
    ]
  }
  ```
- **`GET /api/v1/history/portfolio-value?portfolio_id={id}&period=...`** → daily portfolio value series (scaffold; returns empty today).

## Canonical data contract

**`Snapshot`** (persisted): `id`, `portfolio_id`, `created_at`, `total_value`, `total_cost`, `total_pnl`, `num_holdings`, `top_sector`, `note?`, `tags?[]`, `holdings_json` (frozen list of holdings + weights at that instant).

**`SnapshotDelta`**: `from`, `to`, `summary_delta`, `holdings_delta[]`, `added[]`, `removed[]`, `sectors_delta[]`.

**`PortfolioValuePoint`**: `date`, `total_value`, `total_pnl`.

## Backend / frontend split

- **Backend:** snapshot CRUD, delta computation (should be the canonical implementation — not the frontend's `lib/delta.ts`). Daily value series persistence + fetch. Auto-snapshot scheduler (currently missing — refactor blueprint §3.6).
- **Frontend:** `useSnapshots()` list, `useDelta(fromId, toId)` diff, `/changes` page renders sector deltas + added/removed tickers + cross-links to `/advisor?q=...`. *Currently `lib/delta.ts` exists; verify whether backend `history_service.py` computes the same thing and pick one source of truth.*

## Non-goals

- Full transaction history / trade log (requires per-trade ingestion; MVP is snapshot-based).
- Tax-lot tracking.
- Performance attribution between snapshots (factor decomposition).
- User-defined snapshot schedules (daily auto is enough).
- Comparing snapshots across different portfolios.

## Open issues

1. **No auto-snapshot.** Private beta users will see an empty `/changes` page for 30 days unless we add the scheduler. Refactor blueprint §3.6 — beta-blocker.
2. **Delta computation likely duplicated** in `frontend/src/lib/delta.ts` and `app/services/history_service.py`. Pick backend as canonical, delete the frontend math. Keep frontend display logic only.
3. **`GET /history/...` is a scaffold.** `usePortfolioHistory` hook exists but backing endpoint returns stub data. Daily portfolio value chart is a high-value UX that's blocked on this.
4. **No snapshot tagging** — user can't mark "before rebalance" vs "after Q4 results".
5. **No deletion of snapshots.** Buildup over time is not bounded.
6. **Pre-computed deltas not stored.** Every `/changes` page view recomputes the diff; minor perf, but easy win.
