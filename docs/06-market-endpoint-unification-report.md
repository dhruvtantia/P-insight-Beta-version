# Part 5 — Market Endpoint Unification Report

**Date:** 2026-04-12  
**Phase:** Market endpoint unification — migrating frontend away from `/api/v1/live/indices`  
**Scope:** Frontend hook + component layer only; no new features added.

---

## 1. Root Cause (Recap)

The topbar `IndexTicker` was calling `GET /api/v1/live/indices` via `liveApi.getIndices()`.  
That endpoint (`live.py`) uses `LiveAPIProvider`, which opens a SQLite DB session on every request → `OperationalError('unable to open database file')` under load. It also used `yf.download()` batch fetch, which generates `getaddrinfo() thread failed to start` errors when the market is closed or data is thin. `/api/v1/market/overview` was already working correctly — it is DB-free, uses per-symbol fetches with timeout guards, and has a 2-minute server-side cache.

---

## 2. Exact Files Modified

### Frontend

| File | Change |
|------|--------|
| `frontend/src/types/index.ts` | Extended `IndexQuote` with `status?: 'live' \| 'last_close' \| 'unavailable'`, `data_date?: string`, `last_updated?: string` |
| `frontend/src/hooks/useIndices.ts` | **Full rewrite.** Now calls `/api/v1/market/overview` directly (raw `fetch`). Extracts `main_indices` filtered by `TOPBAR_SYMBOLS = {'^NSEI', '^BSESN', '^NSEBANK'}`. Stale-while-revalidate via `lastGoodRef`. Poll interval 120s (was 60s). Returns `{ indices, loading, error, stale, lastFetchAt }`. |
| `frontend/src/components/layout/IndexTicker.tsx` | **Full rewrite.** Added `StatusDot` (emerald pulse = live, grey = last_close). Amber staleness dot when `stale=true`. Shows 3 chips (was 2). Hard error only when no prior data. |
| `frontend/src/components/debug/SystemDiagnosticsPanel.tsx` | Updated `IndexStatusSection`: destructures `stale`; badge shows stale count; per-index `status` badge + `data_date`; stale warning row; poll note updated to 120s and source: `/api/v1/market/overview`; removed stale `LIVE_API_ENABLED` reference from empty-state message. |

### Backend

| File | Change |
|------|--------|
| `backend/app/api/v1/endpoints/live.py` | Marked `GET /live/indices` deprecated via FastAPI `deprecated=True` flag + detailed deprecation docstring listing root cause, replacement endpoint, and why. Module-level docstring updated to list the route as deprecated. **Code not removed** — retained for reference. |

---

## 3. Restart Requirements

**Backend restart: NOT required.**  
Only `live.py` docstring was modified (cosmetic + OpenAPI flag). No functional backend code changed.

**Frontend restart: REQUIRED** (or hot-module reload will handle it automatically in dev).  
Three source files changed: `useIndices.ts`, `IndexTicker.tsx`, `SystemDiagnosticsPanel.tsx`.  
In production: rebuild + redeploy the frontend. In `next dev`: changes are picked up automatically.

---

## 4. Which Route the Market Page Now Calls

| UI location | Route called | Notes |
|-------------|--------------|-------|
| Topbar `IndexTicker` | `GET /api/v1/market/overview` | Via `useIndices` hook; polls every 120s |
| Market page (`/market`) | `GET /api/v1/market/overview` | Was already calling this independently |
| Diagnostics panel `IndexStatusSection` | `GET /api/v1/market/overview` | Shares the same `useIndices` hook |

All three UI surfaces now share a single data source: `/api/v1/market/overview`.

---

## 5. Routes / Endpoints No Longer Called by the Frontend

| Route | Previously called by | Status |
|-------|---------------------|--------|
| `GET /api/v1/live/indices` | `useIndices.ts` → `liveApi.getIndices()` | **No longer called.** Marked `deprecated=True` in OpenAPI. Code retained in `live.py`. |

The `liveApi` client object (`LiveApiClient` or similar) may still exist in the frontend codebase; it is no longer invoked for index data. If it is used elsewhere (quotes, fundamentals), those call-paths are unaffected.

---

## 6. What to Test Next (Before Moving to Upload/Enrichment)

Test in this order — each step must pass before proceeding:

**Step 1 — Backend health**
```
GET http://localhost:8000/health
```
Expect: `"status": "ok"`, `"yfinance": true`. If the backend is not running, start it first.

**Step 2 — Market overview endpoint**
```
GET http://localhost:8000/api/v1/market/overview
```
Expect: JSON with `main_indices` array containing `^NSEI`, `^BSESN`, `^NSEBANK` entries.  
Each entry must have: `symbol`, `name`, `value` (number or null), `change`, `change_pct`, `unavailable` (bool), `status` (`"live"`, `"last_close"`, or `"unavailable"`), `data_date` (YYYY-MM-DD or null), `last_updated` (ISO-8601 or null).

**Step 3 — Topbar IndexTicker (visual)**
Open the app. The topbar should show three chips: NIFTY 50, SENSEX, BANK NIFTY.  
- During market hours (IST 9:15–15:30, Mon–Fri): emerald pulsing dot on each chip.  
- Outside market hours: grey dot on each chip.  
- Network DevTools: confirm **no request to `/api/v1/live/indices`** appears. The only market request should be to `/api/v1/market/overview`.

**Step 4 — Stale-while-revalidate (optional manual test)**
In DevTools → Network → block `/api/v1/market/overview`. Wait for a poll cycle (120s or trigger via page focus). The topbar should continue showing the previous values with an amber staleness dot — it must NOT go blank.

**Step 5 — Diagnostics panel**
Open the diagnostics panel. In the "Market Index Status" section:
- Confirm three rows (NIFTY 50, SENSEX, BANK NIFTY).
- Each row should show a `status` badge (`live` / `last close` / `unavailable`).
- Footer should read: `polls every 120s · source: /api/v1/market/overview`.

**Step 6 — OpenAPI deprecation**
Open `http://localhost:8000/docs`. Navigate to `GET /api/v1/live/indices`.  
It should appear as a deprecated endpoint (struck-through or labelled in the Swagger UI).

**Step 7 — Log inspection**
In the backend log stream, confirm:
- No `OperationalError` from SQLite on market data requests.
- No `getaddrinfo() thread failed to start` errors.
- Entries like `"Market overview fetched: 3 main, 8 sector"` (or similar from `market.py` logger).

---

## 7. What Is NOT Changed (Scope Control)

- `/api/v1/live/indices` endpoint code: **not removed**, only deprecated.
- `/api/v1/live/quotes`, `/api/v1/live/fundamentals`, `/api/v1/live/status`: **untouched**.
- Upload / enrichment pipeline: **untouched** (next focus area).
- Optimizer, simulator, advisor, screener, VaR/CVaR: **untouched**.
- Market page (`/market`): no route changes — it was already calling `/api/v1/market/overview`.

---

## 8. Known Remaining Risks

1. **`liveApi` client still exists** in the frontend codebase. If another component calls `liveApi.getIndices()` directly (not via `useIndices`), it would still hit the broken endpoint. A targeted grep for `getIndices\|live/indices` in the frontend source will confirm no other call sites exist.

2. **BANK NIFTY outside market hours** — `^NSEBANK` can return empty history on weekends. The `status: "unavailable"` path in `market.py` handles this gracefully; the chip renders the `WifiOff` unavailable state.

3. **120s poll vs page focus** — `useIndices` uses `setInterval` only. A user leaving the tab for 10 minutes and returning will see stale data until the next 120s tick. This is acceptable given the 2-minute server-side cache TTL alignment.
