# Feature Spec — Market Data Module

**Module owner directory:**
- Backend: `app/api/v1/endpoints/market.py` (primary), `app/api/v1/endpoints/live.py` (legacy `/live/indices` — deprecated).
- Frontend: `frontend/src/hooks/useIndices.ts`, `frontend/src/components/layout/IndexTicker.tsx`, `frontend/src/app/market/`.

---

## Purpose

Surface market context — major Indian indices, sector indices, and top movers — so users can orient themselves before looking at their own portfolio. Also powers the persistent topbar index strip across every page.

## Inputs

- None. Endpoint takes no parameters today.
- (Future: `universe` filter to scope gainers/losers to the user's portfolio.)

## Outputs

- **`GET /api/v1/market/overview`** →
  ```json
  {
    "indices": [
      {
        "symbol": "^NSEI", "name": "NIFTY 50",
        "last_price": 22456.10, "change_abs": 120.35, "change_pct": 0.54,
        "status": "live|last_close|unavailable",
        "bar_date": "2026-04-20", "last_updated": "2026-04-20T09:45:00Z",
        "reason": null
      }
    ],
    "sectors": [
      { "symbol": "^CNXIT", "name": "Nifty IT", "change_pct": 1.2, "status": "live", ... }
    ],
    "gainers": [
      { "ticker": "TCS.NS", "name": "Tata Consultancy Services", "change_pct": 3.1, "last_price": 3850 }
    ],
    "losers": [
      { "ticker": "ONGC.NS", "name": "ONGC", "change_pct": -2.4, "last_price": 252 }
    ],
    "meta": {
      "market_open": true,
      "generated_at": "2026-04-20T09:45:00Z",
      "cache_age_seconds": 0
    }
  }
  ```

## Canonical data contract

**`IndexQuote`**: `symbol`, `name`, `last_price`, `change_abs`, `change_pct`, `status` (`live` | `last_close` | `unavailable`), `bar_date`, `last_updated`, `reason?` (when unavailable).

**`MoverRow`**: `ticker`, `name`, `change_pct`, `last_price`.

**`MarketOverview`**: `indices: IndexQuote[3]`, `sectors: IndexQuote[~8]`, `gainers: MoverRow[≤5]`, `losers: MoverRow[≤5]`, `meta`.

Status definitions (must stay stable — the topbar colour logic depends on this):
- `live` — `bar_date == today` AND market open.
- `last_close` — `bar_date < today` OR market closed.
- `unavailable` — fetch failed for this item only (others may still be `live`).

## Backend / frontend split

- **Backend:** concurrent per-index fetch via `ThreadPoolExecutor`, 8s per-index timeout, 25s batched-download timeout for gainers/losers, status labelling, 2-min in-process cache, graceful per-section degradation. Index + sector + universe lists are hardcoded.
- **Frontend:** `useIndices()` polls every 120s, exposes to `IndexTicker` topbar (3 chips with status dot: emerald=live, grey=last_close, amber=stale). `/market` landing page renders the full overview. `lastGoodRef` keeps last-good values visible while refetching.

## Non-goals

- Custom user-chosen indices.
- Historical index charts (would need persistence; not in MVP).
- Global indices (Dow, S&P, Nikkei).
- Breadth metrics (advance/decline ratio, etc.).
- Options chain / derivatives data.

## Open issues

1. **2-minute cache is low** for a landing-page-level endpoint; every fresh page visit re-fetches. Longer TTL (5–10 min) with an admin "force refresh" is safer.
2. **Cache is in-process** — lost on restart, not shared across workers. Same story as every other cache. Refactor blueprint §3.4.
3. **Index + sector universes are hardcoded** in `market.py` — moving to a JSON config lets non-code changes adjust coverage.
4. **No persistence** of daily index closes — blocks any "1d/5d/1m" chart on the landing page.
5. **Gainers/losers are NIFTY 50-only** — no "gainers of my portfolio". Low-effort v2 feature.
6. **`/live/indices` is still registered and deprecated.** Either hard-remove after confirming no consumer, or leave the `deprecated=True` OpenAPI flag and set a removal date.
7. **Weekend behaviour:** gainers/losers batch download commonly returns empty — expected, surfaced as empty lists. Verify users understand this (maybe a copy hint "No movers — market closed").
