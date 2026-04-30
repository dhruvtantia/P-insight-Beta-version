# P-Insight — Status, Stability & Backlog

**Version:** April 2026 (post-hardening, post-market-unification)  
**Purpose:** Current stability posture, known issues, and prioritised next steps.

---

## 1. Stability Tiers

Tier definitions:
- **Tier 1** — Core. Must work. No graceful degradation acceptable.
- **Tier 2** — Helpful but not critical. User can function without it. Can degrade.
- **Tier 3** — Hidden from navigation. Code intact. Accessible by direct URL. Not ready for regular use.

---

## 2. Tier 1 — Core (Must Work)

| Page | Route | Status | Fails Safe? | Notes |
|---|---|---|---|---|
| Market Landing | `/market` | ✅ Stable | Yes — WifiOff per section | Per-index timeout guards in place. Auto-refreshes every 120s. |
| Upload | `/upload` | ✅ Stable | Partially — per-ticker enrichment fails gracefully; full file parse failure blocks step 1 | Add progress indicator for enrichment phase |
| Dashboard | `/dashboard` | ✅ Stable | No — core 3 calls must succeed | Risk tiles are client-side only; no quant call on this page |
| Holdings Table | `/holdings` | ✅ Stable | No | Lightweight; shares `usePortfolio` data |
| Fundamentals | `/fundamentals` | ✅ Stable | Partially — ratios fail gracefully, portfolio must succeed | Ratios endpoint hits yfinance; no per-ticker timeout yet |
| Risk & Quant | `/risk` | ✅ Stable | Yes — risk snapshot tiles render even if `/quant/full` fails | First cold load can take 5-20s; subsequent loads hit cache |
| Changes / Snapshots | `/changes` | ✅ Stable | Yes — SQLite only, no external calls | Empty state handled for 0 and 1 snapshot cases |

---

## 3. Tier 2 — Helpful But Not Critical

| Page | Route | Status | Fails Safe? | Notes |
|---|---|---|---|---|
| Peer Comparison | `/peers` | ⚠️ Partial | Yes — error state per section | yfinance peer fetches can be slow; no per-peer page-level timeout |
| News & Events | `/news` | ⚠️ Partial | Yes — `liveUnavailable` state shown | Requires `NEWS_API_KEY` in `.env`; gracefully empty without it |
| Advisor | `/advisor` | ✅ Mostly stable | Yes — falls back to rule-based | AI path requires `AI_CHAT_ENABLED=true` + LLM API key |
| Watchlist | `/watchlist` | ✅ Stable | Yes | Live price enrichment only fires in live mode |
| Portfolio Manager | `/portfolios` | ✅ Stable | Yes | Lightweight CRUD |

---

## 4. Tier 3 — Hidden from Nav

| Page | Route | Status | Notes |
|---|---|---|---|
| Optimizer | `/optimize` | ⚠️ Experimental | PyPortfolioOpt may fail with < 5 holdings or low variance |
| Simulator | `/simulate` | ⚠️ Experimental | Mounts `useOptimization` on load — fires expensive endpoint immediately |
| Broker Sync | `/brokers` | 🚧 Scaffold | Zerodha integration not implemented |
| Efficient Frontier | `/frontier` | 🚧 Scaffold | Chart-only page; data from optimization endpoint |
| AI Chat | `/ai-chat` | 🚧 Scaffold | Not productionised; separate from `/advisor` |
| Sectors | `/sectors` | ⚠️ Redundant | Duplicates the dashboard allocation section; nav link already removed |
| Debug / Diagnostics | `/debug` | 🔧 Dev only | Gated behind `NODE_ENV === 'development'` |

---

## 5. Dependency Health

| Dependency | Used by | Health | Risk |
|---|---|---|---|
| SQLite | portfolios, holdings, snapshots, watchlist, upload | ✅ Stable | None — no external dependency |
| yfinance | market, quant, peers, fundamentals ratios, sector enrichment | ⚠️ External | Rate-limited; no native per-call timeout; slow when market is closed |
| News API (external) | `/news`, market news section | ⚠️ Optional | Must be configured; gracefully empty if absent |
| LLM API (Anthropic / OpenAI) | `/advisor` AI path | ⚠️ Optional | Must be configured; falls back to rule-based if absent |
| PyPortfolioOpt | `/optimize`, `/simulate` | ⚠️ Experimental | Fails on edge-case portfolios (< 5 holdings, degenerate covariance matrix) |

---

## 6. Known Risk Flags

**High severity:**

`/quant/full` cold load latency — the endpoint downloads 1 year of daily OHLCV for every holding on a cache miss. With a 20-stock portfolio this can take 5–20 seconds depending on yfinance response times. Mitigated by the `pre_warm_cache` background task after upload (which pre-fills `_QUANT_CACHE`), and by the 10-minute server-side cache. First load after cache expiry is still slow.

**Medium severity:**

`/analytics/ratios` has no per-ticker timeout guard. The `sector_enrichment.py` pattern (5s per-ticker via `concurrent.futures`) was not applied here. A slow yfinance response for any single ticker can block the entire fundamentals response.

Peer comparison (`/peers/{ticker}`) has no page-level aggregate timeout. 5–6 parallel yfinance calls for peers run via `asyncio.gather`. Individual peer failures are caught per-ticker, but a uniform slowdown from yfinance rate limiting can block the entire response for 15+ seconds.

**Low severity:**

The market overview gainers/losers section derives from a batch `yf.download()` of 30 NIFTY 50 tickers. When the market is closed on weekends, this commonly returns an empty DataFrame — both lists render empty. This is expected behavior, not a bug.

`useIndices` polling (topbar) uses `setInterval` only. A user returning to a tab after a long absence will see stale index data until the next 120-second tick. Staleness is indicated with an amber dot.

---

## 7. Prioritised Backlog

### Do Now (high impact, low effort)

**7.1 Add per-ticker timeout to `/analytics/ratios`**  
File: `backend/app/api/v1/endpoints/analytics.py` (or its underlying service)  
Problem: No timeout guard on yfinance fundamentals fetch per holding. A single slow ticker blocks the entire response.  
Fix: Apply `concurrent.futures.ThreadPoolExecutor` + `future.result(timeout=5)` pattern — same as `sector_enrichment.py`. Fall back to `{}` per ticker on timeout.

**7.2 Add per-ticker timeout to `/peers/{ticker}`**  
File: `backend/app/api/v1/endpoints/peers.py`  
Problem: Peer fundamentals use `asyncio.gather` but individual `yf.Ticker().info` calls inside `asyncio.to_thread` can still hang for 20+ seconds.  
Fix: Same `concurrent.futures` pattern; 5-second timeout per peer. With 5–6 peers running in parallel this caps total wait at ~5 seconds.

**7.3 Remove dead `mock` mode references**  
File: `frontend/src/store/dataModeStore.ts` and grep across `frontend/src/`  
Problem: `mode === 'mock'` branches may still exist after mock mode was removed from the valid `DataMode` union.  
Fix: `grep -r "'mock'" frontend/src` — delete any dead branches found.

**7.4 Remove unused `frontierApi` from `api.ts`**  
File: `frontend/src/services/api.ts`  
Problem: `frontierApi` is exported but `/frontier` is a scaffold with no active frontend consumer.  
Fix: Comment out the export. Keep the backend endpoint.

### Next Phase (high impact, more involved)

**7.5 Lazy-load `useQuantAnalytics` on the risk page**  
File: `frontend/src/app/risk/page.tsx`  
Problem: `useQuantAnalytics` mounts immediately on page load, firing `/quant/full` even on a cold cache. The `RiskSnapshotCard` and `ConcentrationBreakdown` components can render from local `riskSnapshot` immediately, with no quant data needed.  
Fix: Show a "Load full analysis" button, or use `IntersectionObserver` to mount `useQuantAnalytics` only when the user scrolls to the quant section.  
Impact: Eliminates the blocking 5–20s wait on first `/risk` page load when cache is cold.

**7.6 Shared portfolio data context**  
Problem: `usePortfolio` is called independently on every page, re-fetching the same 3 endpoints (`holdings`, `summary`, `sectors`) on every page mount. Navigating between pages triggers redundant fetches.  
Fix: Lift portfolio data into a React Context provider or a Zustand slice at the AppShell level. Fetch once on app load (or on upload/mode change). Individual pages subscribe without triggering new fetches.  
Tradeoff: Requires careful cache invalidation on upload, portfolio switch, and mode change.

**7.7 Merge `usePortfolios` and `portfolioStore`**  
Problem: Two places track the active portfolio — `usePortfolios` (API-backed list) and `portfolioStore` (Zustand with `activePortfolioId`). They are kept in sync manually. This is a latent source of stale-state bugs.  
Fix: Derive `activePortfolioId` from the list in `usePortfolios` instead of maintaining it separately, or consolidate into a single Zustand slice.

**7.8 On-demand optimization in `/simulate`**  
File: `frontend/src/app/simulate/page.tsx`  
Problem: `useOptimization` is mounted on page load, firing `/optimization/full` immediately when the user navigates to `/simulate`.  
Fix: Add a "Run Simulation" button that manually triggers the optimization fetch. Avoid eagerly mounting `useOptimization`.  
Priority: Low until `/simulate` is promoted to Tier 2.

### Consider Removing

**7.9 `/sectors` page**  
The page shows only the sector allocation breakdown — the same data visible in the dashboard Allocation Overview card. The nav link has already been removed. Audit whether anyone navigates to it directly; if not, delete `frontend/src/app/sectors/page.tsx`.

**7.10 `/ai-chat` scaffold**  
`frontend/src/app/ai-chat/page.tsx` and `backend/app/api/v1/endpoints/ai_chat.py` exist but are not linked from anywhere. If there is no plan to develop a standalone chat experience separate from `/advisor`, delete both.

**7.11 `/brokers` from backend router**  
The brokers endpoint is registered in `api/v1/router.py` but serves only stub responses. Commenting out `api_router.include_router(brokers.router)` reduces surface area and startup time until broker integration is actually built.

---

## 8. Completed Work (Recent)

The following significant changes have been shipped and are stable:

**Recovery & hardening (2026-04-11)**
- Fixed backend startup crash caused by `DEFAULT_DATA_MODE=mock` in `.env` being rejected by a `Pydantic Literal` validator. Changed field to `str`; validation moved to `dependencies.py` at request time.
- Rewrote `market.py` to use per-symbol `yf.Ticker().history()` instead of `yf.download([...all...])`. One failed index no longer cascades to others.
- Disabled `_seed_mock_portfolio()` on startup. Fresh installs no longer create a "Demo Portfolio" row that shows up in the selector with zero holdings.
- Removed `useQuantAnalytics` from the dashboard. Risk tiles now derive from client-side `riskSnapshot` (HHI, top-3 weight, max position). No more `/quant/full` call on dashboard load.
- Removed `useOptimization` from `useAdvisor`. The advisor page no longer triggers `/optimization/full` on every visit.
- Added `pre_warm_cache()` `BackgroundTask` after upload confirm — pre-computes `/quant/full` in the background so the risk page loads from cache on first visit.
- Added `_restore_uploaded_portfolio()` on startup — reloads the last uploaded portfolio from SQLite into `FileDataProvider` memory so users don't need to re-upload after a backend restart.
- Sidebar restructured with Tier 1/2/3 groupings; dev diagnostics gated behind `NODE_ENV`.
- `/changes` page: split empty state for 0 vs 1 snapshot.

**Market endpoint unification (2026-04-12)**
- Rewrote `useIndices` to call `/api/v1/market/overview` directly instead of `/api/v1/live/indices`. The live indices endpoint was causing `OperationalError` from SQLite and `getaddrinfo` thread failures on market close.
- Rewrote `IndexTicker` component: 3 chips (was 2), status dot (emerald pulse = live, grey = last_close), amber stale dot when data is stale, stale-while-revalidate via `lastGoodRef`.
- Extended `IndexQuote` type with `status`, `data_date`, `last_updated` fields.
- Marked `GET /api/v1/live/indices` as `deprecated=True` in FastAPI/OpenAPI. Code retained.
- Updated `SystemDiagnosticsPanel` to use `useIndices` and show per-index status badges.

---

## 9. What's Next — Phase Candidates

The following are not yet on the backlog but are natural next phases once the current stability items are resolved:

**Alembic migrations** — replace the manual `_COLUMN_MIGRATIONS` `ALTER TABLE` approach in `init_db.py` with proper versioned Alembic migrations. This becomes important the moment a PostgreSQL production deployment is considered.

**Portfolio history chart** — the `history.py` endpoint exists and the `usePortfolioHistory` hook exists, but no page prominently features a portfolio total value over time chart. This is high-value UX.

**Screener page** — `frontend/src/app/screener/` exists in the directory listing. Current status unknown. Needs evaluation.

**Broker sync (Zerodha)** — stub exists across backend (`brokers.py`), frontend (`/brokers`), models (`broker_connection.py`), and providers (`broker_provider.py`). This is a full feature, not a small change.
