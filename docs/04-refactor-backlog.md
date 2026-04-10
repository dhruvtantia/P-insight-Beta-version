# P-Insight — Refactor Backlog

**Version:** Post trust-hardening + personal-use simplification  
**Format:** Ranked by impact/effort. Each item has a verdict: Do Now / Next Phase / Later / Consider Removing.

---

## Priority 1 — High Impact, Low Effort

### 1.1 Add per-ticker timeout to `analytics/ratios` endpoint
**File:** `backend/app/api/v1/endpoints/analytics.py` (or the service it calls)  
**Problem:** `useFundamentals` calls `/analytics/ratios` which fetches financial ratios from yfinance per holding with no timeout guard. The `sector_enrichment.py` fix applied a 5-second per-ticker timeout — the same pattern is missing here.  
**Fix:** Apply the same `concurrent.futures.ThreadPoolExecutor` + `future.result(timeout=5)` pattern as in `sector_enrichment.py`. Fall back to `{}` per ticker on timeout.  
**Verdict:** Do Now — straightforward, high risk reduction.

### 1.2 Add per-ticker timeout to `peers` endpoint
**File:** `backend/app/api/v1/endpoints/peers.py`  
**Problem:** Peer fundamentals are fetched in parallel via `asyncio.gather`, but each individual `yf.Ticker().info` call inside a `to_thread` can still hang for 20+ seconds on slow tickers.  
**Fix:** Same pattern — `concurrent.futures` with 5-second timeout per peer. 5–6 peers × 5s timeout = max 5s total (they run in parallel inside the gather).  
**Verdict:** Do Now — same pattern, isolated change.

### 1.3 Remove `/sectors` from sidebar navigation
**File:** `frontend/src/components/layout/Sidebar.tsx`  
**Problem:** `/sectors` shows only the portfolio sector allocation — the exact same data visible in the dashboard's Allocation Overview section. It adds navigation clutter without adding unique value.  
**Fix:** Remove the Sectors item from the Explore nav group. Keep the route and code intact — accessible by URL.  
**Verdict:** Do Now — zero code change, one line removed from Sidebar.

---

## Priority 2 — High Impact, Medium Effort

### 2.1 Lazy-load `useOptimization` in `useAdvisor`
**Status:** DONE in Stage 2 — `useOptimization` removed from `useAdvisor`.  
**Completed impact:** Eliminates `/optimization/full` trigger on every `/advisor` page visit.

### 2.2 Lazy-load `useQuantAnalytics` on the risk page
**File:** `frontend/src/app/risk/page.tsx`  
**Problem:** `/risk` mounts `useQuantAnalytics` immediately, firing `/quant/full` on page load. For a 20-stock portfolio this takes 3–8 seconds even with the threading fix.  
**Fix:** Add a "Load full analysis" button or use `IntersectionObserver` to only mount `useQuantAnalytics` when the user scrolls past the fold. The `RiskSnapshotCard` and `ConcentrationBreakdown` render from local `riskSnapshot` and can show immediately.  
**Verdict:** Next Phase — meaningful improvement, slightly more complex refactor.

### 2.3 Move `useSimulation`'s `useOptimization` dependency to on-demand
**File:** `frontend/src/app/simulate/page.tsx`  
**Problem:** `/simulate` mounts `useOptimization` on load even though no Tier 1 workflow needs the simulate page. Currently not a real problem (page is hidden from nav) but will be when/if it's re-enabled.  
**Fix:** Pass a `lazy` flag to `useOptimization` or add a "Run Optimization" button that triggers the fetch manually.  
**Verdict:** Next Phase (when /simulate is re-enabled).

### 2.4 Consolidate duplicate holdings-fetch logic
**Problem:** `usePortfolio` calls the 3 core endpoints. Several pages also independently call `usePortfolio` and then pass `holdings` down to child hooks like `useFundamentals` and `usePeerComparison`. This means switching pages re-fetches the same 3 endpoints on every page mount.  
**Fix:** Move portfolio data into a Zustand store or React Context provider at the AppShell level. Fetch once on app load (or on mode change), share via context. Individual pages subscribe without triggering new fetches.  
**Tradeoffs:** More complex refactor; risks stale-data bugs if not invalidated correctly on upload or mode change.  
**Verdict:** Next Phase — meaningful win for power users who switch pages frequently.

---

## Priority 3 — Medium Impact, Low Effort

### 3.1 Hide `Diagnostics` nav item in production
**File:** `frontend/src/components/layout/Sidebar.tsx`  
**Problem:** The `DEV_ITEMS` section shows "Diagnostics" (/debug) to all users.  
**Fix:** Gate it behind `process.env.NODE_ENV === 'development'`.  
**Verdict:** Do Now — one-line check.

### 3.2 Remove unused `frontierApi` from `api.ts`
**File:** `frontend/src/services/api.ts`  
**Problem:** `frontierApi` is exported but the only consumer (`/frontier` page) is a scaffold — no frontend component actually calls it from active pages.  
**Fix:** Remove or comment out `frontierApi` export. Keep the backend endpoint intact.  
**Verdict:** Later — cosmetic, no runtime impact.

### 3.3 Remove dead `mock` mode references from `dataModeStore`
**File:** `frontend/src/store/dataModeStore.ts`  
**Problem:** Previous phase removed mock mode from the valid DataMode union type. If there are any lingering `mode === 'mock'` checks in the codebase, they're dead branches.  
**Fix:** Grep for `'mock'` in frontend src. Remove dead branches.  
**Verdict:** Do Now — safety cleanup.

### 3.4 Add explicit empty state to `/changes` when no snapshots exist
**File:** `frontend/src/app/changes/page.tsx`  
**Problem:** When no snapshots have been taken yet, the history charts show empty/blank. There is no CTA explaining what to do.  
**Fix:** Check `summaries.length === 0` after load; show a "No snapshots yet — take your first snapshot to start tracking changes" card with a "Take Snapshot" button.  
**Verdict:** Do Now — user experience, very small change.

---

## Priority 4 — Lower Impact / Consider Removing

### 4.1 Evaluate and potentially remove `/sectors` page entirely
**Problem:** The page is a subset of the dashboard. It has never been linked from any other page (no inbound link except the sidebar). It's maintained dead weight if the dashboard covers the same ground.  
**Fix:** Audit usage logs. If no one navigates to it, delete `frontend/src/app/sectors/page.tsx` and the corresponding backend call.  
**Verdict:** Consider Removing — gather usage evidence first.

### 4.2 Remove `aiChatApi` and `/ai-chat` route if not productionised
**File:** `frontend/src/app/ai-chat/page.tsx`, `backend/.../ai_chat.py`  
**Problem:** `/ai-chat` is a scaffold — it exists in the router but is not linked from anywhere and has no finished UI. It creates confusion when reviewing the codebase.  
**Fix:** Delete the page and remove from backend router if there's no plan to develop it in the next phase.  
**Verdict:** Consider Removing — clean up scaffolding before the codebase grows.

### 4.3 Remove `brokerApi` and `/brokers` from backend router
**Problem:** The brokers endpoint is registered in the router but the page is a stub. It adds startup time (module import) and surface area for bugs.  
**Fix:** Comment out `api_router.include_router(brokers.router)` until the feature is ready.  
**Verdict:** Consider Removing from router — keep the file, just don't expose the route.

### 4.4 Merge `usePortfolios` and `usePortfolioStore`
**Problem:** There are two places that track the active portfolio — `usePortfolios` hook (API-backed list) and `usePortfolioStore` (Zustand store with `activePortfolioId`). They are kept in sync manually. This is a latent source of bugs.  
**Fix:** Derive `activePortfolioId` from the list in `usePortfolios` rather than maintaining it in a separate store. Or use a single Zustand slice that owns both the list and the active ID.  
**Verdict:** Next Phase — lower priority but a real architectural risk.

---

## Backlog Summary Table

| # | Item | Verdict | Files Touched |
|---|---|---|---|
| 1.1 | Timeout guard for analytics/ratios | Do Now | `analytics.py` or service |
| 1.2 | Timeout guard for peers endpoint | Do Now | `peers.py` |
| 1.3 | Remove /sectors from sidebar | Do Now | `Sidebar.tsx` |
| 2.1 | Remove useOptimization from useAdvisor | ✅ Done | `useAdvisor.ts` |
| 2.2 | Lazy-load useQuantAnalytics on /risk | Next Phase | `risk/page.tsx` |
| 2.3 | On-demand optimization in /simulate | Next Phase | `simulate/page.tsx` |
| 2.4 | Shared portfolio context / store | Next Phase | AppShell, usePortfolio |
| 3.1 | Hide Diagnostics in production | Do Now | `Sidebar.tsx` |
| 3.2 | Remove unused frontierApi | Later | `api.ts` |
| 3.3 | Remove dead mock mode references | Do Now | `dataModeStore.ts`, grep |
| 3.4 | Empty state on /changes | Do Now | `changes/page.tsx` |
| 4.1 | Evaluate removing /sectors page | Consider | `sectors/page.tsx` |
| 4.2 | Remove /ai-chat scaffold | Consider | `ai-chat/page.tsx`, `ai_chat.py` |
| 4.3 | Remove /brokers from backend router | Consider | `router.py` |
| 4.4 | Merge usePortfolios + usePortfolioStore | Next Phase | Store files |

