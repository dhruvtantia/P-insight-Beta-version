# P-Insight Codebase Audit

Generated: 2026-06-27

Scope: full repository audit with emphasis on distinct feature inventory, implementation status, tool/framework usage, modularity, and error/mismatch risks. Upload and enrichment were examined as the primary critical path.

No application code was changed for this audit.

## Verification Baseline

Commands run from the current checkout:

```bash
backend/.venv/bin/python -m pytest backend/tests -q
npm run type-check
npm run build
```

Results:

- Backend tests: `64 passed, 17 warnings`.
- Frontend type check: passed.
- Frontend production build: passed, generating 24 static routes.
- Warnings: Pydantic V2 deprecations for class-based settings config and `Field(example=...)`; FastAPI query `example` deprecations.
- Current working tree before this audit already had uncommitted changes in:
  - `frontend/src/app/watchlist/page.tsx`
  - `frontend/src/components/watchlist/WatchlistTable.tsx`
  - `frontend/src/hooks/useWatchlistPrices.ts`

## System Stack

| Area | Tools / frameworks | Notes |
|---|---|---|
| Backend API | FastAPI, Pydantic v2, Uvicorn | Main app in `backend/app/main.py`; API v1 router in `backend/app/api/v1/router.py`. |
| Backend persistence | SQLAlchemy ORM, SQLite by default | Models in `backend/app/models`; database init in `backend/app/db`. Alembic folder exists but appears non-operational in this checkout. |
| Backend data handling | pandas, openpyxl, numpy | Upload parsing, normalization, history/analytics data shaping. |
| Market data | yfinance primary, optional Financial Modeling Prep, optional NewsAPI | Live provider surfaces can degrade under provider/network failure. |
| Analytics | Custom Python analytics modules, optional scipy/sklearn pathways | Optimization can fall back when optional scientific packages are unavailable. |
| Frontend | Next.js App Router, React 18, TypeScript | Static route build succeeds for 24 app routes. |
| Frontend state/data | Zustand stores, custom hooks, centralized `frontend/src/services/api.ts` | API calls mostly centralized; generated OpenAPI types also present. |
| Frontend UI | Tailwind CSS, lucide-react, Recharts | Modular components by domain. |
| Testing | pytest/TestClient, TypeScript compiler, Next build | Backend has meaningful contract tests; frontend has no dedicated unit/E2E tests in this checkout. |

## Feature Inventory

Statuses:

- Functional: implemented end to end enough for local use, with tests or build coverage.
- In progress: user-facing and substantially implemented, but dependent on incomplete providers, degraded fallbacks, or split contracts.
- In the works: scaffolded, disabled, redirected, or intentionally not exposed.

| Feature | Status | Primary implementation | Tools / frameworks used | Modularity assessment |
|---|---|---|---|---|
| Portfolio core dashboard, holdings, sectors | Functional | `backend/app/api/v1/endpoints/portfolio.py`, `backend/app/services/portfolio_service.py`, `frontend/src/hooks/usePortfolio.ts`, dashboard/holdings/sectors pages | FastAPI, SQLAlchemy, Pydantic, React, Zustand, Tailwind, Recharts | Good backend route/service split. Frontend hooks/components are cleanly separated. Still depends on global active portfolio, so not tenant-safe. |
| Upload parse/import/enrichment | In progress, critical | `backend/app/api/v1/endpoints/upload.py`, `upload_parse_service.py`, `upload_confirm_service.py`, `upload_v2_service.py`, `post_upload_workflow.py`, ingestion modules, upload page/components | FastAPI multipart, pandas/openpyxl, SQLAlchemy, yfinance/FMP, FastAPI BackgroundTasks, React wizard | Stronger than prior memory-cache flow; now has service boundaries and tests. Still split between legacy and V2 contracts, with background task observability gaps. Detailed section below. |
| Price enrichment and valuation fallback | In progress | `price_enrichment_service.py`, live provider, portfolio reads, holdings UI chips | yfinance, SQLAlchemy, FastAPI, React status badges | Central helper is good. Risk remains that average-cost fallback can make portfolio totals appear valid when live prices failed. |
| Portfolio management | Functional | `/api/v1/portfolios`, `PortfolioManagerService`, portfolios page/hooks | FastAPI, SQLAlchemy, React hooks, Tailwind | Clear service boundary for create/list/activate/rename/delete/refresh. Multi-user/auth boundary absent. |
| Snapshots and change tracking | Functional | `snapshots.py`, `history.py`, `snapshot_service.py`, changes page/components | SQLAlchemy, FastAPI, pandas-style time-series shaping, React/Recharts | Reasonably modular. Has both snapshot and daily-history concepts; older and canonical status endpoints coexist. |
| Risk analytics | Functional with provider sensitivity | `analytics.py`, `quant.py`, `backend/app/analytics/*`, risk page/components | numpy/pandas, yfinance history, FastAPI, Recharts | Domain logic is isolated in analytics modules. Data quality depends heavily on price-history coverage. |
| Quant analytics | Functional with provider sensitivity | `/quant/full`, `/quant/status`, `quant_service.py`, risk hooks | pandas/numpy, yfinance, cache service | Good API boundary and status endpoint. External-provider degradation remains a primary risk. |
| Portfolio optimization | Functional with fallback | `optimization.py`, `backend/app/optimization/*`, optimize page/components | numpy/pandas, optional scipy/sklearn style methods, Recharts | Good domain package. `/frontier` legacy route is redirected/disabled, but comments and docs still mention old mock defaults. |
| Fundamentals | Functional with degraded data risk | `/analytics/ratios`, `/live/fundamentals`, `fundamentals_view_service.py`, fundamentals page/hooks | yfinance, optional FMP, FastAPI, React tables | Good feature boundary through registry. Frontend keeps fallback thresholds that can drift from backend defaults. |
| Peer comparison | In progress | `peers.py`, live/file provider peer discovery, peers page/components | yfinance/FMP fundamentals, static peer map, FastAPI, React | Backend is gated under fundamentals, but frontend nav does not attach a feature id. Peer universe is partly static, so discovery quality is not fully live. |
| Market overview | In progress | `market.py`, `live.py`, market page, index ticker | yfinance, FastAPI, React/Tailwind | Live indices/movers are real, but provider breadth is narrow and some page content/news integration is mixed. |
| News and events | In progress | `news.py`, `useNews`, news and market pages | optional NewsAPI, yfinance/event lookups, FastAPI, React | Feature registry handles degraded provider state. Empty/unavailable states exist, but provider absence can still read like "no news" if not noticed. |
| Watchlist | Functional, with active uncommitted edits | `watchlist.py`, watchlist hooks/page/components, live quote hooks | SQLAlchemy, FastAPI, yfinance quote endpoint, React | CRUD is isolated. Quote enrichment is separate and can fail independently. Current audit did not alter dirty watchlist files. |
| Simulation / what-if | Functional frontend sandbox | `useSimulation`, `frontend/src/lib/simulation.ts`, simulate page | React, Zustand-ish local hook state, TypeScript math helpers | Mostly frontend-local. Useful as sandbox, but not a persisted backend product feature. |
| Advisor | In progress | `advisor.py`, `ai_advisor_service.py`, `context_builder.py`, advisor page/hook | Optional OpenAI/Anthropic provider, rule fallback, FastAPI, React | Backend and frontend share fallback responsibility; this is a drift risk. Separate `/ai-chat` is disabled. |
| Standalone AI chat | In the works | `ai_chat.py`, `frontend/src/app/ai-chat/page.tsx` | FastAPI scaffold, Next `notFound()` | Backend route is disabled by feature registry; frontend route returns 404. Correctly hidden, but still present as code. |
| Broker sync | In the works | `brokers.py`, `connectors/*`, broker components, brokers page | SQLAlchemy broker model, connector registry, FastAPI | Backend and UI scaffolds exist, but feature is disabled and frontend route returns 404. Good isolation. |
| Screener | In the works | `frontend/src/app/screener/page.tsx`, feature registry | Next `notFound()` | Disabled placeholder with no backend ranking/query engine. |
| Legacy frontier | In the works / deprecated | `frontier.py`, `/frontier` page redirect | FastAPI disabled boundary, Next redirect | Properly redirected to `/optimize`; legacy endpoint still present but gated. |
| System diagnostics / feature registry | Functional | `system.py`, `feature_registry.py`, debug page/components | FastAPI, Pydantic, React | Strong modularity mechanism. Registry coverage is not perfectly aligned with every frontend route. |

## Upload And Enrichment Pipeline Deep Audit

### Current Flow

1. Parse upload:
   - Route: `POST /api/v1/upload/parse`.
   - Service: `parse_upload_file`.
   - Reads CSV/XLS/XLSX via `load_dataframe_from_upload`.
   - Detects columns using `column_detector.detect_columns`.
   - Returns all column names, detected mapping, required/optional fields, ambiguous fields, and preview rows.

2. Confirm upload V2, used by the frontend:
   - Frontend: `frontend/src/app/upload/page.tsx` calls `uploadApi.confirmV2`.
   - Route: `POST /api/v1/upload/v2/confirm`.
   - Service: `confirm_upload_v2_file`.
   - Classifies rows into valid, valid with warnings, and invalid.
   - Persists a new active uploaded portfolio and holdings in SQLAlchemy.
   - Saves a canonical uploaded CSV via `PostUploadWorkflow`.
   - Schedules background enrichment via FastAPI `BackgroundTasks`.
   - Returns `portfolio_id`, row classification, warning/rejection details, and `portfolio_usable=true`.

3. Background enrichment:
   - Function: `run_background_enrichment`.
   - Enriches sector/name/industry/fundamentals using `enrich_holdings`.
   - Persists enrichment metadata through `PortfolioManagerService.patch_holdings_enrichment`.
   - Fetches batch prices from yfinance and persists price outcomes.
   - Sets peer plausibility status.
   - Marks stuck pending holdings as failed to avoid infinite polling.
   - Pre-warms quant cache from DB-backed uploaded provider.
   - Builds portfolio history.

4. Status polling:
   - Routes: `GET /api/v1/upload/status?portfolio_id=...` and `GET /api/v1/upload/v2/status/{portfolio_id}`.
   - Service: `JobStatusService.get_upload_enrichment_status`.
   - Reads per-holding enrichment, fundamentals, peers, and price status from the DB.

5. Legacy confirm remains:
   - Route: `POST /api/v1/upload/confirm`.
   - Service: `confirm_legacy_upload`.
   - Performs enrichment and price fetch inline before responding.
   - Still used by tests and possibly external clients, but not by the current upload page.

### What Is Strong

- Upload parsing is side-effect free and separated from persistence.
- V2 confirm is fast and persists base data before slow provider calls.
- Uploaded portfolios are DB-backed; tests assert the old `file_provider._uploaded_holdings` memory cache is not the source of truth.
- Status endpoints are DB-backed and survive process restarts better than in-memory job state.
- Price status is centralized through `price_enrichment_service.py`.
- The frontend explicitly surfaces pending, partial, failed, static-map, uploaded-price, provider-failed, and unavailable states.
- Contract tests cover parse, V2 confirm, status polling, mixed terminal enrichment, legacy confirm, and portfolio refresh.

### Key Upload Risks And Mismatches

1. Legacy and V2 row classification disagree.
   - Legacy normalizer rejects ISIN-like tickers as invalid.
   - V2 imports ISIN-like tickers with warnings, then enrichment is likely to fail.
   - This can produce different accepted/rejected counts for the same file depending on endpoint.

2. Frontend upload comments are stale.
   - The top comment in `frontend/src/app/upload/page.tsx` says all calls hit `/upload/parse` and `/upload/confirm`.
   - Actual code uses `/upload/v2/confirm` and V2 status polling.

3. Background task scheduling is best-effort.
   - If the process exits after V2 response but before/during background work, holdings can remain pending until a recovery path runs.
   - There is crash recovery inside the background function, but no durable job queue.

4. History and quant pre-warm are downstream side effects, not required guarantees.
   - Failures are logged as non-fatal.
   - The portfolio remains usable, but changes/risk/optimization freshness may lag or be unavailable.

5. Price fallback can obscure live-provider failure.
   - Valuation can use average cost when live price is unavailable.
   - Per-holding chips expose this, but dashboard-level totals can still look complete if the user misses degraded markers.

6. Status taxonomy is spread across backend, generated contracts, and frontend local types.
   - Price, enrichment, sector, fundamentals, peers, and history statuses are mostly consistent now, but local TypeScript unions/comments still contain legacy values such as mock-related source labels.

7. Canonical CSV save is compatibility side effect.
   - The canonical uploaded CSV is still written, but DB is now the source of truth.
   - Any future code reading the CSV risks reintroducing stale cross-portfolio behavior.

## Modularity Assessment

Good boundaries:

- `feature_registry.py` gives a central feature health contract and route-level gating.
- Upload has been decomposed into parse, confirm, workflow, status, price persistence, and portfolio persistence services.
- Portfolio management and analytics are separate services.
- Frontend API calls are mostly centralized in `frontend/src/services/api.ts`.
- Frontend domain hooks (`usePortfolio`, `useOptimization`, `useQuantAnalytics`, `useNews`, `useAdvisor`, etc.) shield pages from raw fetch details.
- Disabled/scaffold surfaces are generally hidden, redirected, or 404ed.

Weak boundaries:

- No authentication, authorization, tenancy, or user isolation. Global active portfolio and singleton watchlist are fine for local use but not public deployment.
- Feature registry does not fully map every route/page. Peers is a visible feature but not a distinct registry feature; it is indirectly gated through fundamentals.
- Advisor fallback is split between backend/provider status and frontend rule routing.
- Some legacy routes and types remain in the public code surface: `/portfolio/upload`, `/frontier`, mock provider files, mock labels/types.
- Background jobs are not durable. FastAPI `BackgroundTasks` is acceptable locally, not a production-grade enrichment queue.
- SQLite is the default persistence layer, but migration discipline is incomplete.

## Sources Of Errors Or Mismatches

### High Priority

1. Public deployment safety gap.
   - No auth/tenancy and global active state mean one user's portfolio would become another user's active portfolio in a shared deployment.

2. Upload V2 durability gap.
   - Fast API response plus non-durable background enrichment can leave portfolios in partially enriched states after restarts or crashes.

3. Valuation trust gap.
   - Cost-basis fallback and stale/uploaded prices can feed summary analytics unless users notice row-level degraded status.

4. External provider fragility.
   - yfinance is central to prices, fundamentals, history, market data, peers, quant, and optimization. Provider failure has broad impact.

### Medium Priority

5. Legacy/V2 upload contract drift.
   - ISIN handling and synchronous/asynchronous enrichment differ.

6. Feature registry/frontend nav mismatch.
   - Peers lacks an explicit frontend `featureId`; route is backend-gated by fundamentals.

7. Static peer discovery.
   - Peer comparison can look dynamic while relying on curated/static peer maps for universe construction.

8. Advisor fallback split.
   - Backend signals fallback, frontend owns parts of rule-based response generation.

9. Stale mock terminology.
   - Mock provider and mock-related type/comment remnants remain despite mock mode being rejected in dependencies.

10. Generated/static OpenAPI type drift risk.
   - Generated contracts exist, but not every frontend type is imported from them. Some local unions can drift.

### Low Priority

11. Docs/comments lag implementation.
   - README and upload page comments still describe older behavior.

12. Pydantic/FastAPI deprecations.
   - Not breaking today, but should be cleaned before dependency upgrades.

13. Placeholder route artifacts.
   - Disabled `ai-chat`, `brokers`, `screener`, and legacy `frontier` are isolated but still increase audit surface.

## Recommended Next Actions

1. Make upload V2 the only production upload path, or formally document legacy as compatibility-only and align row classification behavior.
2. Add a durable enrichment job table or queue with retry, terminal failure, and resume semantics.
3. Add dashboard-level data quality summaries: live price count, uploaded price count, stale count, provider failed count, cost-basis fallback count.
4. Promote Peers to a first-class feature registry item or attach its nav visibility to `fundamentals`.
5. Remove or rename mock remnants to explicit demo-only artifacts.
6. Centralize frontend status enums/types from generated OpenAPI contracts where practical.
7. Add frontend E2E tests for upload parse/confirm/status, dashboard fallback visibility, and degraded provider states.
8. Add auth/tenancy before any public deployment.

