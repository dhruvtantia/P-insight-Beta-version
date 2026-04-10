# P-Insight Recovery + Architecture-Correction Report

**Phase:** Recovery + Architecture-Correction  
**Date:** 2026-04-11  
**Status:** Complete

---

## Root Causes

### Root Cause 1 — Backend startup crash (PRIMARY)

**File:** `backend/.env`  
**Problem:** `DEFAULT_DATA_MODE=mock`  
**Effect:** `backend/app/core/config.py` declared `DEFAULT_DATA_MODE: Literal["uploaded", "live", "broker"]`. Pydantic v2 validates literal fields at module import time. Since `settings = Settings()` executes at module level, the entire backend process failed to start with a `ValidationError`. This caused every frontend fetch to receive `ECONNREFUSED`, presenting as "Failed to fetch" across all pages and market widgets showing "unavailable".  
**Fix:** Changed `.env` to `DEFAULT_DATA_MODE=uploaded`.

### Root Cause 2 — Pydantic Literal fragility (DEFENSIVE)

**File:** `backend/app/core/config.py`  
**Problem:** `Literal["uploaded", "live", "broker"]` means any stale `.env` value silently crashes the entire backend.  
**Fix:** Changed field type to `str`. Validation of valid values is now handled by `dependencies.py` at request time, returning HTTP 400 for unsupported modes. A stale `.env` no longer takes down the server.

### Root Cause 3 — Market data batch-mode fragility

**File:** `backend/app/api/v1/endpoints/market.py`  
**Problem:** `yf.download([...all_indices...])` batches all tickers in one call. When the Indian market is closed, yfinance ≥ 0.2.38 often returns an empty or malformed DataFrame, failing all indices simultaneously with no per-ticker reason.  
**Fix:** Rewrote to use `yf.Ticker(sym).history(period="5d")` per index, each wrapped in its own try/except with a 8-second `ThreadPoolExecutor` timeout guard. One failed index cannot cascade to others.

### Root Cause 4 — Mock portfolio seeded on startup

**File:** `backend/app/db/init_db.py`  
**Problem:** `_seed_mock_portfolio()` was called on every startup if no portfolios existed. It created a `source="mock"` portfolio row that appeared in the portfolio selector but had no holdings in the `uploaded` data mode — showing an empty dashboard that looked broken.  
**Fix:** Removed the call to `_seed_mock_portfolio()` from `init_db()`. The function body is preserved.

---

## Files Modified

| File | Change |
|------|--------|
| `backend/.env` | `DEFAULT_DATA_MODE=mock` → `uploaded`; added `DOCS_ENABLED=true` |
| `backend/app/core/config.py` | `DEFAULT_DATA_MODE: Literal[...]` → `str`; removed unused `Literal` import |
| `backend/app/api/v1/endpoints/market.py` | Full rewrite: per-index `yf.Ticker().history()` with `ThreadPoolExecutor` timeout, independent failure isolation per symbol |
| `backend/app/db/init_db.py` | Disabled `_seed_mock_portfolio()` call in `init_db()`; added explanatory comment |
| `backend/app/analytics/quant_service.py` | Added `pre_warm_cache(provider, period)` async function |
| `backend/app/api/v1/endpoints/upload.py` | Added `BackgroundTasks` param; fires `pre_warm_cache(FileDataProvider(), "1y")` after confirm |
| `frontend/src/app/dashboard/page.tsx` | Removed `useQuantAnalytics`; replaced 3 quant tiles with `riskSnapshot` concentration tiles |
| `frontend/src/hooks/useAdvisor.ts` | Removed `useOptimization`; set `optimizationSummary: null` |
| `frontend/src/components/layout/Sidebar.tsx` | Tier 1/2/3 restructure; gated dev items behind `NODE_ENV` |
| `frontend/src/components/action/ActionCenter.tsx` | Removed dead mock mode action branch |
| `frontend/src/app/changes/page.tsx` | Split empty state for 0 vs 1 snapshot |

---

## Restart Requirements

After pulling these changes, restart the backend:

```bash
# In backend/
uvicorn app.main:app --reload --port 8000
```

**Why restart is required:** `.env` is read at startup; `config.py` module-level `settings = Settings()` runs once. Changes to `.env` or `config.py` only take effect on a full restart, not a hot reload.

**No database migration needed.** No schema changes were made in this phase. The existing `p_insight.db` is compatible.

**If the DB already has a mock portfolio** (created by earlier `_seed_mock_portfolio()` calls): the mock portfolio row will remain in the database but will no longer be auto-created on fresh installs. To remove it manually:
```sql
DELETE FROM portfolios WHERE source = 'mock';
```

---

## Test Order (manual verification)

1. **Backend starts without errors**  
   `uvicorn app.main:app --reload`  
   Look for `✅ Database initialised` in stdout. No `ValidationError` in stderr.

2. **Swagger UI accessible**  
   `http://localhost:8000/docs` — should load (DOCS_ENABLED=true in .env).

3. **Market endpoint returns data or clean unavailable**  
   `GET /api/v1/market/overview`  
   Each index has either `{ value, change, change_pct, unavailable: false }` or `{ unavailable: true, reason: "..." }`.  
   One unavailable index must NOT block others.

4. **Upload flow end-to-end**  
   - POST `/api/v1/upload/parse` with a CSV → should return column mapping + preview.  
   - POST `/api/v1/upload/confirm` with same CSV + mapping → should return `success: true`.  
   - Backend logs should show `Quant cache pre-warmed` ~30-60 seconds later.

5. **Dashboard loads without /quant/full call**  
   Open browser DevTools Network tab, navigate to `/dashboard`.  
   Confirm no request to `/quant/full` on page load (this was removed in the previous phase).

6. **Advisor page loads without /optimization/full call**  
   Navigate to `/advisor`. Confirm no `/optimization/full` request fires on load.

7. **Risk page loads after upload**  
   Navigate to `/risk`. If the quant pre-warm finished in the background, the page should render instantly (cache hit). If not, it will compute on-demand and be fast on second visit.

8. **Fresh DB install — no mock portfolio**  
   Delete `backend/p_insight.db`, restart backend.  
   The portfolio selector should show "No portfolios" instead of a "Demo Portfolio" with 0 holdings.

---

## Page-Driven vs Portfolio-Driven Data Fetching

### Page-driven (before)
Each page called its own API endpoints on mount, independently. `/risk` called `/quant/full` every time it was visited. `/advisor` called `/optimization/full` on load. The dashboard called both.

**Problems:** slow first paint, duplicate network calls, no sharing of computed results between pages.

### Portfolio-driven (after)
After a portfolio is uploaded:
1. Holdings are persisted to the DB and loaded into `FileDataProvider._uploaded_holdings` in-process memory.
2. `_restore_uploaded_portfolio()` reloads holdings from DB on backend restart.
3. `pre_warm_cache()` fires in the background after confirm, so the expensive quant computation happens once, not per-page-visit.
4. Pages that need quant data hit the in-process `_QUANT_CACHE` on subsequent visits (TTL: 10 minutes for live, 24h for mock).

**Pages that are now cache-reuse (portfolio-driven):**
- `/risk` — hits `_QUANT_CACHE["uploaded_1y"]` if pre-warm succeeded
- `/quant` — same cache

**Pages that remain page-driven (intentionally — they are lightweight):**
- `/dashboard` — uses only `riskSnapshot` (pure client-side, zero API calls)
- `/advisor` — fires `/advisor/ask` only on user message, not on mount
- `/changes` — calls `/snapshots` (lightweight DB query)
- `/market` (landing) — calls `/market/overview` (cached 2 min in-process)

---

## What Is Still Beta / Hidden

### Hidden from nav (code kept, URLs still accessible)
- `/optimize` — portfolio optimisation / efficient frontier
- `/simulate` — scenario simulation
- `/brokers` — broker sync (Zerodha)
- `/frontier` — efficient frontier chart
- `/sectors` — sector breakdown page

These are Tier 3 features. Code is intact. They are excluded from `Sidebar.tsx` nav links. Users can reach them by typing the URL directly.

### Partially stable (Tier 2)
- **News & Events** (`/news`) — depends on `NEWS_API_KEY` in `.env`. Renders gracefully if key is absent but shows empty state.
- **Fundamentals** (`/fundamentals`) — depends on live yfinance enrichment. Degrades gracefully if yfinance fails.
- **Peer Compare** — requires live price data; shows loading state if unavailable.

### Known limitations
- **Gainers/Losers** on the market landing page: derived from a batch `yf.download()` of 30 NIFTY 50 tickers. If yfinance returns an empty result (common when market is closed on weekends), both lists are empty — this is expected and shown as an empty section, not an error.
- **AI Advisor** (`AI_CHAT_ENABLED=false` by default): advisor falls back to rule-based responses. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env` and `AI_CHAT_ENABLED=true` to enable.

---

## Logs to Inspect on Failure

### Backend won't start
```
# Look for:
pydantic_core._pydantic_core.ValidationError
```
This means `.env` has an invalid value for a typed setting. Check `DEFAULT_DATA_MODE` and all `bool` fields.

### Market data all unavailable
```
# Look for (in uvicorn logs):
WARNING  market:market.py:XX Index fetch error: ^NSEI — ...
WARNING  market:market.py:XX Index fetch timeout: ^NSEI (timeout_8s)
```
Common causes: yfinance rate-limited, market closed + thin data, DNS failure, or yfinance package not installed.

### Upload "Failed to fetch"
Check that the backend is running (`curl http://localhost:8000/health`). If backend is up, check CORS: `FRONTEND_URL` in `.env` must match the Next.js dev port (default 3000).

### Quant pre-warm not logging
```
# Expected after upload/confirm:
INFO  quant_service:quant_service.py:XX Quant cache pre-warmed: mode=uploaded period=1y
```
If absent, check for `WARNING  Could not schedule quant pre-warm` immediately after the confirm response. The upload itself succeeds regardless.

### Uploaded portfolio not restoring after restart
```
# Expected on startup:
INFO  init_db:init_db.py:XX Restored uploaded portfolio '...' (N holdings) into FileDataProvider
```
If absent, the DB has no `source="uploaded"` portfolio. Upload again.
