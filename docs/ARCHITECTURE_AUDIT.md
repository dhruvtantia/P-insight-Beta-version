# P-Insight Architecture Audit

Date: 2026-04-27

Scope: Phase 1 documentation-only audit. No application code was refactored, renamed, deleted, migrated, or rewritten.

## 1. Executive Summary

P-Insight is a portfolio analytics application for uploaded, live, and eventually broker-synced equity portfolios. The current product lets a user upload a portfolio, map file columns, persist portfolios and holdings, view holdings and sector allocation, inspect risk/fundamental/quant analytics, compare peers, manage watchlists, track snapshots/history/changes, explore market/news data, run allocation simulations, request optimizer outputs, and use an AI/rule-based advisor.

The main user-facing features are:

- Dashboard with portfolio summary, holdings, sectors, risk snapshot, insights, and action center.
- Portfolio upload and refresh workflow with column detection, enrichment, snapshots, and background history/analytics work.
- Portfolio management, active portfolio switching, snapshots, refresh, rename, delete, and source metadata.
- Holdings, sector, fundamentals, risk, quant analytics, optimization, simulation, changes/history, peers, news, market overview, watchlist, broker connection scaffolding, AI chat, and advisor pages.
- Debug/system diagnostics page for backend, provider, and endpoint status.

The current stack appears to be:

- Frontend: Next.js 15 App Router, React 18, TypeScript, Tailwind CSS, Zustand, Recharts, lucide-react.
- Backend: FastAPI, Pydantic v2, SQLAlchemy 2 sync ORM, pandas, numpy, yfinance, httpx, python-multipart, openpyxl.
- Database: SQLite by default through `DATABASE_URL=sqlite:///./p_insight.db`; comments mention PostgreSQL as the intended production option, but no Alembic setup exists in the active repo.
- Package management: frontend uses pnpm lockfile; backend uses Poetry.

Overall architecture is mixed/full-stack. The backend owns API routing, persistence, upload ingestion, portfolio persistence, many analytics/risk/optimization calculations, live provider integration, snapshots, and AI context. The frontend is still substantial: it owns much of the UX orchestration, local state, rendering logic, route structure, simulation what-if calculations, rule-based advisor fallback, formatting/status thresholds, and some direct API calls outside the central API client.

The app is not a thin frontend over a mature backend contract yet. It is moving in that direction, but there is still meaningful coupling through duplicated TypeScript/Pydantic shapes, frontend assumptions about endpoint paths/status values, in-memory backend caches, background tasks, and local client-side business rules.

## 2. Current Project Structure

Root-level items:

- `frontend/`: Next.js frontend application.
- `backend/`: FastAPI backend application.
- `docs/`: active documentation directory. At audit time it is mostly affected by a dirty worktree state.
- `older version docs/`: appears to contain prior documentation that was moved or copied from root/docs. I did not modify it.
- `README.md`: root readme.

Important frontend files and folders:

- `frontend/package.json`: scripts and dependencies.
- `frontend/pnpm-lock.yaml`: frontend dependency lockfile.
- `frontend/next.config.ts`: Next config; no active API rewrites.
- `frontend/tsconfig.json`: TypeScript config with `@/* -> ./src/*` alias and Next plugin.
- `frontend/tailwind.config.ts`, `frontend/postcss.config.js`: Tailwind/PostCSS setup.
- `frontend/.env.local.example`, `frontend/.env.local`: API URL config. `.env.local` is present locally and should not be committed if it contains local values.
- `frontend/src/app/`: Next App Router routes.
- `frontend/src/components/`: UI components grouped by feature/domain.
- `frontend/src/hooks/`: data and workflow hooks.
- `frontend/src/services/api.ts`: central API client for most backend calls.
- `frontend/src/store/`: Zustand stores.
- `frontend/src/context/PortfolioContext.tsx`: portfolio data provider mounted under AppShell.
- `frontend/src/lib/`: frontend pure utilities and remaining domain logic.
- `frontend/src/types/index.ts`: frontend API/domain type definitions.
- `frontend/src/constants/index.ts`: UI constants, colors, formatting, API base constant.

Important backend files and folders:

- `backend/main.py`: thin entrypoint importing `app.main:app`.
- `backend/app/main.py`: FastAPI app, CORS, lifespan startup, health/readiness/root routes, API router registration.
- `backend/app/api/v1/router.py`: aggregates all API v1 routers under `/api/v1`.
- `backend/app/api/v1/endpoints/`: route handlers.
- `backend/app/core/config.py`: Pydantic settings, feature flags, CORS, database URL, API keys.
- `backend/app/core/dependencies.py`: FastAPI dependencies, DB session alias, data provider factory.
- `backend/app/db/database.py`: SQLAlchemy engine/session/base.
- `backend/app/db/init_db.py`: table creation, ad hoc additive column migrations, startup restore of uploaded portfolio into memory.
- `backend/app/models/`: SQLAlchemy ORM models.
- `backend/app/schemas/`: Pydantic request/response schemas.
- `backend/app/repositories/`: repository classes for portfolio/watchlist and snapshots.
- `backend/app/services/`: service layer for portfolios, snapshots, upload v2, history, fundamentals, broker scaffolding, advisor, AI context.
- `backend/app/analytics/`: risk, returns, benchmark, correlation, quant analytics, commentary.
- `backend/app/optimization/`: expected returns, covariance, objectives, frontier, optimizer service, types.
- `backend/app/data_providers/`: provider abstraction and uploaded/live/mock/broker provider implementations.
- `backend/app/ingestion/`: upload normalization, column detection, sector enrichment.
- `backend/app/connectors/`: broker connector abstractions and Zerodha/IBKR scaffolding.
- `backend/mock_data/portfolio.json`: static mock portfolio data, but mock mode is intentionally disabled in current provider selection.
- `backend/uploads/.gitkeep`: upload directory marker.
- `backend/migrate_watchlist.py`: one-off SQLite migration script for watchlist columns.
- `backend/pyproject.toml`, `backend/poetry.lock`: backend dependency management.
- `backend/.env.example`, `backend/.env`: backend environment configuration. `.env` is present locally and should not be committed if it contains secrets.

Database/schema/seed/migration/persistence-related files:

- `backend/app/models/portfolio.py`: `Portfolio`, `Holding`, `Watchlist`.
- `backend/app/models/snapshot.py`: `Snapshot`, `SnapshotHolding`.
- `backend/app/models/history.py`: `PortfolioHistory`, `BenchmarkHistory`.
- `backend/app/models/broker_connection.py`: `BrokerConnection`.
- `backend/app/db/database.py`: engine/session/base.
- `backend/app/db/init_db.py`: `Base.metadata.create_all`, column migrations, uploaded portfolio restore.
- `backend/migrate_watchlist.py`: manual SQLite migration script.
- `backend/mock_data/portfolio.json`: disabled mock data source.
- `backend/uploads/`: upload file storage location marker, although active upload persistence appears DB-centered after parse/confirm flows.

Configuration files found:

- `frontend/package.json`
- `frontend/pnpm-lock.yaml`
- `frontend/next.config.ts`
- `frontend/tsconfig.json`
- `frontend/tailwind.config.ts`
- `frontend/postcss.config.js`
- `frontend/.env.local.example`
- `frontend/.env.local`
- `backend/pyproject.toml`
- `backend/poetry.lock`
- `backend/.env.example`
- `backend/.env`
- `README.md`

Not found in the active repo:

- No `vite.config.*`.
- No active Dockerfile or docker-compose file.
- No active Alembic config or migration directory.
- No frontend test config such as Vitest/Jest/Playwright.
- No active backend test source files beyond `backend/tests/__init__.py`; stale `__pycache__` files imply tests existed previously but source files are absent in the current working tree.

## 3. Current Frontend Architecture

The frontend is Next.js App Router, not Vite. It uses `frontend/src/app/layout.tsx` for the root layout and wraps pages with `AppShell`, which renders sidebar/topbar chrome and mounts `PortfolioProvider`.

Main routes/views:

- `/`: home/redirect-style entry page.
- `/dashboard`: portfolio dashboard.
- `/holdings`: holdings table/detail.
- `/sectors`: sector allocation view.
- `/upload`: upload wizard.
- `/portfolios`: portfolio management, snapshots, refresh.
- `/changes`: snapshots/history/portfolio changes.
- `/fundamentals`: fundamental metrics.
- `/risk`: risk and quantitative analytics.
- `/optimize`: portfolio optimization.
- `/frontier`: deprecated/coming-soon frontier view.
- `/simulate`: allocation simulator.
- `/watchlist`: watchlist management and live prices.
- `/peers`: peer comparison.
- `/news`: portfolio news/events.
- `/market`: market overview.
- `/advisor`: AI/rule-based portfolio advisor.
- `/ai-chat`: simpler chat interface.
- `/brokers`: broker connector scaffolding.
- `/screener`: planned feature placeholder.
- `/debug`: diagnostics panel.

Major component groups:

- `components/layout`: `AppShell`, `Sidebar`, `Topbar`, `IndexTicker`.
- `components/modules`: dashboard summary, holdings, sector breakdown.
- `components/charts`: Recharts-based allocation/top holdings charts.
- `components/risk`: risk cards, concentration, performance, drawdown, correlation.
- `components/fundamentals`: fundamental metric table/cards.
- `components/optimization`: frontier chart, optimizer cards, allocation/rebalance tables.
- `components/simulate`: simulator controls/sliders/scenario comparison.
- `components/portfolio`: portfolio source, switcher, refresh, snapshots, timeline, delta/history charts.
- `components/upload`: dropzone, column mapper, preview table.
- `components/watchlist`: form, table, tags, empty state.
- `components/peers`: selector, comparison cards/table, valuation summary.
- `components/news`: cards, feed, filters, event badge, summary.
- `components/advisor`: advisor chat/response/panel.
- `components/broker`: connector cards/flow/status.
- `components/debug`: large diagnostics panel.
- `components/common` and `components/ui`: shared UI primitives, loaders, badges, helper text, headers, quick actions.

State management patterns:

- React local state is heavily used in pages and hooks.
- Zustand stores:
  - `dataModeStore.ts`: persisted `uploaded`/`live`/`broker` data mode, with mock mode rejected.
  - `portfolioStore.ts`: active portfolio ID and portfolio list, not persisted.
  - `filterStore.ts`: dashboard cross-filter state.
  - `simulationStore.ts`: session-only simulated holdings and portfolio ID.
- React Context:
  - `PortfolioContext.tsx` is a shared data provider for `portfolio/full` plus non-blocking commentary.
- No React Query/SWR/Apollo-style server state library is present. Fetch lifecycle, caching, polling, stale behavior, and retries are manually implemented.

Charting/table/UI libraries:

- Recharts powers chart components.
- Tailwind CSS is the styling system.
- lucide-react provides icons.
- clsx and tailwind-merge support class composition.
- Tables appear hand-built rather than through a grid library.

API call locations:

- Centralized API client: `frontend/src/services/api.ts`.
- Hooks mostly call `services/api.ts`: `useFundamentals`, `useOptimization`, `useQuantAnalytics`, `useNews`, `usePeerComparison`, `usePortfolios`, `useSnapshots`, `useSnapshotHistory`, `usePortfolioHistory`, `useWatchlist`, `useWatchlistPrices`, `useLiveData`, `useProviderStatus`, `useAdvisor`, `useBrokerConnections`.
- Direct `fetch` outside the central API client still exists in:
  - `frontend/src/app/upload/page.tsx`
  - `frontend/src/app/market/page.tsx`
  - `frontend/src/hooks/useIndices.ts`
  - `frontend/src/components/portfolio/PortfolioRefreshPanel.tsx`
  - Upload/refresh FormData methods inside `frontend/src/services/api.ts` also bypass `apiFetch` because JSON headers would be wrong.

Frontend business/domain logic that should be reviewed before migration:

- `frontend/src/lib/advisor.ts`: large rule-based portfolio advisor engine. It is pure and testable, but it is business logic in the frontend. The backend also has `ai_advisor_service.py` and `context_builder.py`, so this is a real shared/duplicated advisor domain.
- `frontend/src/lib/insights.ts`: rule-based portfolio insight engine. Backend also exposes commentary/insights, so ownership is mixed.
- `frontend/src/lib/risk.ts`: client-side risk snapshot calculations used by simulation and possibly legacy views. Backend now computes canonical risk snapshots for real portfolio data.
- `frontend/src/lib/fundamentals.ts`: status thresholds and weighted metrics fallback. It states backend thresholds are canonical, but defaults mirror backend constants and can drift.
- `frontend/src/lib/simulation.ts` and `frontend/src/hooks/useSimulation.ts`: what-if portfolio scenario/risk/fundamental calculations. This may reasonably remain client-side for hypothetical UI, but it should be explicitly scoped as non-persistent simulation logic.
- Route/page files such as `dashboard/page.tsx`, `changes/page.tsx`, `market/page.tsx`, and `watchlist/page.tsx` contain derived business decisions, filters, classifications, and workflow logic in addition to rendering.
- `frontend/src/types/index.ts`: manually maintained TypeScript API/domain contracts. There is no generated OpenAPI-based type sync.

## 4. Current Backend Architecture

Backend framework and entry points:

- Framework: FastAPI.
- Main entrypoint: `backend/app/main.py`.
- Compatibility entrypoint: `backend/main.py` imports `app.main:app`.
- API router root: `backend/app/api/v1/router.py`.
- Startup lifespan calls `init_db()` and registers routes.
- System endpoints:
  - `GET /health`
  - `GET /readiness`
  - `GET /`

API routes/endpoints under `/api/v1`:

- Market:
  - `GET /api/v1/market/overview`
- Portfolio:
  - `GET /api/v1/portfolio/full`
  - `GET /api/v1/portfolio/`
  - `GET /api/v1/portfolio/summary`
  - `GET /api/v1/portfolio/sectors`
  - `POST /api/v1/portfolio/upload`
- Analytics:
  - `GET /api/v1/analytics/risk`
  - `GET /api/v1/analytics/ratios`
  - `GET /api/v1/analytics/commentary`
- Watchlist:
  - `GET /api/v1/watchlist/`
  - `POST /api/v1/watchlist/`
  - `PATCH /api/v1/watchlist/{ticker}`
  - `DELETE /api/v1/watchlist/{ticker}`
- Peers:
  - `GET /api/v1/peers/{ticker}`
- News/events:
  - `GET /api/v1/news/`
  - `GET /api/v1/news/events`
- Deprecated frontier:
  - `GET /api/v1/frontier/`
- AI chat/advisor:
  - `POST /api/v1/ai-chat/`
  - `GET /api/v1/advisor/status`
  - `POST /api/v1/advisor/ask`
  - `GET /api/v1/advisor/context/{portfolio_id}`
- Live data:
  - `GET /api/v1/live/quotes`
  - `GET /api/v1/live/fundamentals`
  - `GET /api/v1/live/indices` deprecated
  - `GET /api/v1/live/status`
- Quant:
  - `GET /api/v1/quant/full`
  - `GET /api/v1/quant/status`
- Optimization:
  - `GET /api/v1/optimization/full`
  - `GET /api/v1/optimization/status`
- Portfolio management:
  - `GET /api/v1/portfolios/`
  - `GET /api/v1/portfolios/active`
  - `GET /api/v1/portfolios/{portfolio_id}`
  - `POST /api/v1/portfolios/`
  - `POST /api/v1/portfolios/{portfolio_id}/activate`
  - `POST /api/v1/portfolios/{portfolio_id}/refresh`
  - `PATCH /api/v1/portfolios/{portfolio_id}/rename`
  - `DELETE /api/v1/portfolios/{portfolio_id}`
- Snapshots:
  - `POST /api/v1/portfolios/{portfolio_id}/snapshot`
  - `GET /api/v1/portfolios/{portfolio_id}/snapshots`
  - `GET /api/v1/snapshots/{snapshot_id}`
  - `GET /api/v1/snapshots/{snapshot_a_id}/delta/{snapshot_b_id}`
  - `DELETE /api/v1/snapshots/{snapshot_id}`
- Brokers:
  - `GET /api/v1/brokers/`
  - `GET /api/v1/brokers/{portfolio_id}/connection`
  - `POST /api/v1/brokers/{portfolio_id}/connect`
  - `POST /api/v1/brokers/{portfolio_id}/sync`
  - `DELETE /api/v1/brokers/{portfolio_id}/connection`
- Upload:
  - `POST /api/v1/upload/parse`
  - `POST /api/v1/upload/confirm`
  - `GET /api/v1/upload/status`
  - `POST /api/v1/upload/v2/confirm`
  - `GET /api/v1/upload/v2/status/{portfolio_id}`
- History:
  - `GET /api/v1/portfolios/{portfolio_id}/history`
  - `GET /api/v1/portfolios/{portfolio_id}/history/benchmark`
  - `GET /api/v1/portfolios/{portfolio_id}/holdings/status`
  - `GET /api/v1/portfolios/{portfolio_id}/history/build-status`
  - `GET /api/v1/history/{portfolio_id}/status`
  - `GET /api/v1/history/{portfolio_id}/daily`
  - `GET /api/v1/portfolios/{portfolio_id}/holdings/since-purchase`

Backend layering:

- Routers: `backend/app/api/v1/endpoints/*.py`.
- Schemas: `backend/app/schemas/*.py` define Pydantic contracts.
- Models: `backend/app/models/*.py` define SQLAlchemy ORM tables.
- Repositories: `PortfolioRepository`, `WatchlistRepository`, `SnapshotRepository`.
- Services: `PortfolioService`, `PortfolioManagerService`, `SnapshotService`, `BrokerService`, `AIAdvisorService`, `PortfolioContextBuilder`, upload/history/fundamentals services.
- Analytics modules: mostly pure pandas/numpy calculations and higher-level quant service.
- Optimization modules: expected returns, covariance, objectives, frontier, optimizer service.
- Providers: `BaseDataProvider` abstraction with uploaded/live/broker/mock implementations, selected by `get_data_provider`.

Mock/live mode handling:

- The dependency `get_data_provider()` supports `uploaded`, `live`, and `broker`.
- `mock` is explicitly rejected with a 400 even though `MockDataProvider` still exists and `mock_data/portfolio.json` still exists.
- Uploaded mode uses `FileDataProvider`, backed by an in-memory `_uploaded_holdings` cache restored from DB on startup.
- Live mode uses `LiveAPIProvider(db=db)`, which reads active portfolio positions from the DB and overwrites prices with yfinance data.
- Broker mode exists as disabled scaffolding.
- Feature flags are in `core/config.py`: `LIVE_API_ENABLED`, `BROKER_SYNC_ENABLED`, `AI_CHAT_ENABLED`, `ADVANCED_ANALYTICS_ENABLED`.

Analytics/risk/portfolio calculation modules:

- Basic portfolio aggregation: `backend/app/services/portfolio_service.py`.
- Fundamentals aggregation and thresholds: `backend/app/services/fundamentals_view_service.py`.
- Snapshot/delta: `backend/app/services/snapshot_service.py`, `backend/app/lib/delta.py`.
- History: `backend/app/services/history_service.py`.
- Risk math: `backend/app/analytics/risk.py`.
- Returns/performance: `backend/app/analytics/returns.py`.
- Benchmark: `backend/app/analytics/benchmark.py`.
- Correlation: `backend/app/analytics/correlation.py`.
- Quant bundle/cache: `backend/app/analytics/quant_service.py`.
- Optimization: `backend/app/optimization/*`.
- Commentary: `backend/app/analytics/commentary.py`.
- AI advisor: `backend/app/services/ai_advisor_service.py`, `backend/app/services/context_builder.py`, `backend/app/services/ai/provider.py`.

Backend code tightly coupled to frontend assumptions:

- `GET /health` exposes feature/API-key booleans specifically for the debug panel.
- Deprecated endpoints remain for frontend compatibility: `/frontier/`, `/live/indices`, legacy history endpoints under `/portfolios/{id}/history*`.
- Upload v2 status and history status normalize internal states for frontend polling.
- `PortfolioService.get_portfolio_full` appears designed as a bundled frontend-friendly endpoint, which is useful but also makes the response shape a central UI contract.
- Some endpoints embed UI-oriented phrasing/status notes rather than purely domain contracts.
- CORS defaults explicitly target `http://localhost:3000`, which is Next-dev-specific and will need adjustment for Vite dev server ports.

## 5. Current Database and Persistence Layer

Current database:

- Default is SQLite at `sqlite:///./p_insight.db`.
- PostgreSQL is mentioned in comments and `.env.example`, but no active production migration setup exists.

ORM/query layer:

- SQLAlchemy 2 sync ORM.
- `create_engine`, `SessionLocal`, and declarative `Base` live in `backend/app/db/database.py`.
- FastAPI request DB sessions are provided through `get_db()`.
- Repositories wrap some model access, but several endpoints/services still import `SessionLocal` directly for background jobs or ad hoc work.

Tables/models/entities:

- `portfolios`
  - `id`, `name`, `source`, `is_active`, `description`, `upload_filename`, `last_synced_at`, `source_metadata`, timestamps.
- `holdings`
  - portfolio positions with ticker/name/quantity/cost/current price/sector/asset class/currency/notes plus enrichment metadata.
- `watchlist`
  - ticker, name, tag, sector, target price, notes, added timestamp.
- `snapshots`
  - portfolio snapshot summary metrics, JSON blobs for sectors/risk/top holdings.
- `snapshot_holdings`
  - immutable holding records within a snapshot.
- `broker_connections`
  - broker connection state/config metadata per portfolio.
- `portfolio_history`
  - daily portfolio total value by portfolio/date.
- `benchmark_history`
  - benchmark close price by ticker/date.

Database initialization:

- Startup calls `init_db()` from FastAPI lifespan.
- `Base.metadata.create_all(bind=engine)` creates tables.
- `_COLUMN_MIGRATIONS` performs idempotent SQLite-style `ALTER TABLE ADD COLUMN` in try/except blocks.
- `_restore_uploaded_portfolio()` reloads most recent uploaded portfolio holdings from DB into `FileDataProvider` in-memory cache.
- A mock seeding function exists but is intentionally disabled.

Production suitability:

- Suitable for local development and a small single-process demo.
- Not production-grade yet because there is no Alembic migration history, no DB constraints for many domain invariants, JSON is stored as text in several places, in-memory caches are part of correctness/performance behavior, background jobs open sessions ad hoc, and SQLite is the default.
- PostgreSQL is plausible because SQLAlchemy is used, but migration readiness is incomplete. The ad hoc column migration strategy should be replaced before serious production use.

## 6. Feature Dependency Map

### Dashboard

- Frontend: `src/app/dashboard/page.tsx`, `PortfolioContext.tsx`, `usePortfolio.ts`, `components/modules/*`, `components/charts/*`, `components/risk/RiskSnapshotCard.tsx`, `components/advisor/PortfolioAdvisorPanel.tsx`, `components/action/*`.
- Backend: `portfolio.py`, `analytics.py`, `portfolio_service.py`, `fundamentals_view_service.py`, `analytics/commentary.py`.
- Database/storage: `portfolios`, `holdings`; provider cache for uploaded mode.
- API endpoints: `/portfolio/full`, `/analytics/commentary`.
- External dependencies: none directly; live mode may use yfinance.
- Coupling: partially isolated.
- Risks: dashboard depends on a large bundled response. Any contract drift in `PortfolioFullResponse` or frontend manual TS types can break many views.

### Upload and Portfolio Import

- Frontend: `src/app/upload/page.tsx`, `components/upload/*`, `services/api.ts` legacy upload method.
- Backend: `upload.py`, `upload_v2_service.py`, `ingestion/*`, `portfolio_manager.py`, `snapshot_service.py`, `history_service.py`, `data_providers/file_provider.py`.
- Database/storage: `portfolios`, `holdings`, `snapshots`, `snapshot_holdings`, `portfolio_history`, `benchmark_history`, uploaded in-memory cache.
- API endpoints: `/upload/parse`, `/upload/confirm`, `/upload/v2/confirm`, `/upload/status`, `/upload/v2/status/{portfolio_id}`, legacy `/portfolio/upload`.
- External dependencies: pandas, openpyxl, yfinance, optional FMP.
- Coupling: tightly coupled.
- Risks: direct frontend FormData calls, background enrichment, DB writes, in-memory cache updates, history builds, and snapshot creation are interleaved. Migration must preserve wizard state and async status semantics.

### Portfolio Management

- Frontend: `src/app/portfolios/page.tsx`, `usePortfolios.ts`, `useSnapshots.ts`, `components/portfolio/*`.
- Backend: `portfolios_mgmt.py`, `portfolio_manager.py`, `snapshot_service.py`, `broker_service.py`.
- Database/storage: `portfolios`, `holdings`, `snapshots`, `snapshot_holdings`, `broker_connections`.
- API endpoints: `/portfolios/*`, `/snapshots/*`, `/brokers/{portfolio_id}/connection`.
- External dependencies: none directly.
- Coupling: partially isolated.
- Risks: active portfolio is backend-authoritative but mirrored in Zustand. UI may become stale after activation/refresh unless refetches are coordinated.

### Holdings and Sectors

- Frontend: `holdings/page.tsx`, `sectors/page.tsx`, `components/modules/HoldingsTable.tsx`, `components/charts/SectorAllocationChart.tsx`, `filterStore.ts`.
- Backend: `portfolio.py`, `portfolio_service.py`, providers.
- Database/storage: `holdings`, `portfolios`.
- API endpoints: `/portfolio/full`, legacy `/portfolio/`, `/portfolio/sectors`.
- External dependencies: live mode can use yfinance.
- Coupling: partially isolated.
- Risks: duplicated calculations may exist between backend and frontend formatting/filter logic.

### Fundamentals

- Frontend: `fundamentals/page.tsx`, `useFundamentals.ts`, `lib/fundamentals.ts`, `components/fundamentals/*`.
- Backend: `analytics.py`, `fundamentals_view_service.py`, providers, live provider fundamental helpers.
- Database/storage: `holdings` enrichment fields; caches in live provider.
- API endpoints: `/analytics/ratios`, `/live/fundamentals`.
- External dependencies: yfinance, optional FMP.
- Coupling: partially isolated.
- Risks: frontend mirrors backend thresholds as defaults; generated contracts would reduce drift.

### Risk and Quant Analytics

- Frontend: `risk/page.tsx`, `useQuantAnalytics.ts`, `components/risk/*`, `lib/risk.ts`.
- Backend: `quant.py`, `analytics/risk.py`, `analytics/returns.py`, `analytics/correlation.py`, `analytics/benchmark.py`, `analytics/quant_service.py`.
- Database/storage: portfolio holdings; in-memory quant/raw caches.
- API endpoints: `/quant/full`, `/quant/status`, `/analytics/risk`.
- External dependencies: numpy, pandas, yfinance.
- Coupling: partially isolated.
- Risks: backend owns canonical quant metrics, but frontend still has risk code for simulation/legacy display. Cache invalidation and live data failures are important.

### Optimization and Efficient Frontier

- Frontend: `optimize/page.tsx`, `frontier/page.tsx`, `useOptimization.ts`, `components/optimization/*`.
- Backend: `optimization.py`, `frontier.py` deprecated endpoint, `optimization/*`.
- Database/storage: portfolio holdings; in-memory optimizer caches.
- API endpoints: `/optimization/full`, `/optimization/status`, deprecated `/frontier/`.
- External dependencies: numpy, pandas, optional scipy/sklearn imports in code paths; pyproject comments suggest PyPortfolioOpt/scipy are not fully declared as first-class dependencies.
- Coupling: partially isolated.
- Risks: dependency availability for optimization needs validation. Deprecated frontier route should not be removed until all clients migrate.

### Simulation

- Frontend: `simulate/page.tsx`, `useSimulation.ts`, `simulationStore.ts`, `lib/simulation.ts`, `components/simulate/*`.
- Backend: indirectly uses optimizer outputs via `useOptimization`.
- Database/storage: none for simulated scenarios; uses current portfolio data.
- API endpoints: `/optimization/full` for suggested weights.
- External dependencies: none direct.
- Coupling: partially isolated by design.
- Risks: simulation intentionally computes hypothetical risk/fundamentals in the browser. This should be documented as client-only what-if logic, not confused with canonical portfolio analytics.

### Snapshots, Changes, and History

- Frontend: `changes/page.tsx`, `useSnapshots.ts`, `useSnapshotHistory.ts`, `usePortfolioHistory.ts`, `useDelta.ts`, `components/portfolio/*`.
- Backend: `snapshots.py`, `history.py`, `snapshot_service.py`, `history_service.py`, `lib/delta.py`.
- Database/storage: `snapshots`, `snapshot_holdings`, `portfolio_history`, `benchmark_history`, `holdings`.
- API endpoints: `/portfolios/{id}/snapshots`, `/portfolios/{id}/snapshot`, `/snapshots/{id}`, `/snapshots/{a}/delta/{b}`, `/history/{id}/status`, `/history/{id}/daily`, legacy history endpoints.
- External dependencies: yfinance/pandas for history building.
- Coupling: partially isolated.
- Risks: multiple canonical and legacy endpoints coexist. Polling/status mappings must survive migration exactly.

### Watchlist

- Frontend: `watchlist/page.tsx`, `useWatchlist.ts`, `useWatchlistPrices.ts`, `components/watchlist/*`, `StockSearchInput.tsx`.
- Backend: `watchlist.py`, `PortfolioRepository.WatchlistRepository`, live quotes endpoint.
- Database/storage: `watchlist`.
- API endpoints: `/watchlist/`, `/watchlist/{ticker}`, `/live/quotes`.
- External dependencies: yfinance for prices.
- Coupling: partially isolated.
- Risks: watchlist CRUD is isolated, but live prices and simulation deep links create cross-feature dependencies.

### Peers

- Frontend: `peers/page.tsx`, `usePeerComparison.ts`, `components/peers/*`.
- Backend: `peers.py`, provider peer lookup, live provider peer maps/FMP.
- Database/storage: portfolio holdings for ticker options only.
- API endpoints: `/peers/{ticker}`.
- External dependencies: yfinance, optional FMP.
- Coupling: partially isolated.
- Risks: peer completeness depends on provider quality and external lookups; frontend handles sparse/incomplete states.

### News and Market

- Frontend: `news/page.tsx`, `market/page.tsx`, `useNews.ts`, `useIndices.ts`, `components/news/*`, `IndexTicker.tsx`.
- Backend: `news.py`, `market.py`, live provider news helpers.
- Database/storage: none persistent for news/market data; in-memory provider/cache behavior.
- API endpoints: `/news/`, `/news/events`, `/market/overview`, deprecated `/live/indices`.
- External dependencies: yfinance, optional NewsAPI.
- Coupling: partially isolated to tightly coupled in `market/page.tsx`.
- Risks: `market/page.tsx` bypasses the API client and owns custom timeout/stale/polling logic. Vite migration must preserve env variable behavior and polling cleanup.

### Broker Connections

- Frontend: `brokers/page.tsx`, `useBrokerConnections.ts`, `components/broker/*`.
- Backend: `brokers.py`, `broker_service.py`, `connectors/*`, `BrokerConnection` model.
- Database/storage: `broker_connections`, `portfolios`, `holdings` if sync implemented.
- API endpoints: `/brokers/*`.
- External dependencies: planned broker APIs; currently scaffolded.
- Coupling: partially isolated.
- Risks: feature is scaffolded/partially implemented. Avoid treating it as production-ready during migration.

### AI Chat and Advisor

- Frontend: `advisor/page.tsx`, `ai-chat/page.tsx`, `useAdvisor.ts`, `lib/advisor.ts`, `components/advisor/*`.
- Backend: `ai_chat.py`, `advisor.py`, `ai_advisor_service.py`, `context_builder.py`, `services/ai/provider.py`.
- Database/storage: portfolio, holdings, snapshots for context.
- API endpoints: `/ai-chat/`, `/advisor/status`, `/advisor/ask`, `/advisor/context/{portfolio_id}`.
- External dependencies: OpenAI/Anthropic env keys.
- Coupling: tightly coupled.
- Risks: advisor behavior is split between backend provider flow and frontend rule-based fallback. Conversation history and context shapes need explicit shared contracts.

### Debug/System Diagnostics

- Frontend: `debug/page.tsx`, `SystemDiagnosticsPanel.tsx`.
- Backend: `/health`, `/readiness`, many API status endpoints.
- Database/storage: readiness checks DB connection.
- API endpoints: `/health`, `/readiness`, `/live/status`, `/quant/status`, `/optimization/status`, `/advisor/status`, etc.
- External dependencies: optional.
- Coupling: tightly coupled.
- Risks: debug panel depends on numerous implementation details and deprecated endpoint knowledge; migrate late after main app contracts are stable.

## 7. Frontend/Backend Separation Assessment

- UI rendering: Cleanly separated. React components and routes own rendering; backend returns JSON only.
- API requests: Partially separated. Most calls use `services/api.ts`, but direct fetch calls remain in upload, market, indices, and refresh components.
- Business logic: Partially separated. Backend owns persistent/canonical calculations for many features, but frontend still owns advisor rules, insights, simulation, thresholds, and derived classifications.
- Portfolio analytics calculations: Partially separated. Backend owns canonical portfolio/risk/quant/optimization results; frontend computes what-if simulation and some legacy/fallback risk/fundamental logic.
- Data fetching: Partially separated. Hooks are reasonably modular, but there is no standard server-state abstraction and some pages/components own fetch lifecycle directly.
- Database access: Cleanly separated from frontend. Only backend accesses SQLAlchemy/SQLite. Inside backend, database access is partially separated because repositories exist but services/endpoints sometimes use `SessionLocal` directly.
- Mock data vs live data: Partially separated. Provider abstraction exists, mock mode is disabled, live/uploaded/broker modes are centralized through `get_data_provider`, but in-memory uploaded provider cache and disabled mock artifacts remain.

## 8. Next.js to Vite + React Migration Feasibility

Migration is feasible, but it is not automatically justified. The current app uses Next mostly as a client-rendered app shell with App Router file-based routes; there are no obvious server components, SSR data loading, Next API routes, middleware, or image optimization dependencies in the inspected code. That makes a Vite SPA technically plausible. The biggest migration risk is not rendering; it is preserving the frontend data flow, route URLs, environment variables, and feature workflows.

### Option A: Keep Next.js

Benefits:

- Lowest immediate risk.
- Existing App Router routes, `next/font`, `next lint`, and route structure remain intact.
- No router migration required.
- Current deployment assumptions remain simpler if already using Next hosting.
- Lets the team harden backend contracts before touching UI architecture.

Risks:

- Keeps Next complexity if the app is truly an authenticated/internal SPA.
- Current `next lint` script may be problematic with newer Next/ESLint combinations and should be validated.
- Does not force cleanup of direct fetch calls or duplicated contracts.

Files likely affected:

- Minimal for architecture hardening: `frontend/src/services/api.ts`, hooks, direct-fetch pages/components, type contracts.
- No route file moves required.

Impact:

- Routing: none.
- API calls: can be improved in place.
- Deployment: unchanged.
- Tests: add tests without platform migration.
- UX: unchanged.
- Maintainability: good if API contracts and data fetching are hardened first.

### Option B: Migrate to Vite + React SPA

Benefits:

- Better fit if the app is entirely client-side and backend is a separate FastAPI API.
- Simpler dev server and build model.
- Removes Next-specific conventions, `next/font`, App Router file constraints, and Next deployment coupling.
- Encourages explicit client routing and API boundary.

Risks:

- Route migration from `src/app/**/page.tsx` to React Router or equivalent.
- Must replace `next/navigation` with client router hooks.
- Must replace `next/font/google`.
- Must revise env variables from `NEXT_PUBLIC_API_URL` to `VITE_API_URL` or compatibility wrapper.
- Must update TypeScript config, path aliases, build scripts, linting, and CSS entrypoints.
- Must preserve all current URLs or provide redirects/deep-link compatibility.
- Direct page/component fetches increase migration surface.

Files likely affected:

- `frontend/package.json`
- New `vite.config.ts`
- `frontend/index.html`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx` or router module
- All `frontend/src/app/**/page.tsx` route files
- `frontend/src/app/layout.tsx`
- Files importing `next/navigation` or `next/font/google`
- `frontend/src/services/api.ts`, `constants/index.ts`, `.env` examples
- TypeScript and lint config

Impact:

- Routing: significant. File-based App Router becomes explicit SPA routing.
- API calls: moderate. Base URL env names and direct fetch sites must be normalized.
- Deployment: static frontend deployment plus FastAPI API; configure CORS for Vite dev/prod origins.
- Tests: frontend test setup must be created or replaced; no current frontend tests exist.
- UX: should be unchanged if route parity is maintained.
- Maintainability: potentially better for SPA, but only if contract generation and fetch cleanup are included.

### Option C: Hybrid/Staged Approach

Benefits:

- Harden backend contracts and frontend API layer while keeping Next.
- Build a Vite scaffold in parallel only after contract audit.
- Migrate components route by route with parity checks.
- Keep Next until Vite reaches feature parity.

Risks:

- Temporary duplicate frontend surfaces.
- Requires discipline to avoid improving only one app while the other drifts.
- More build/deployment complexity during transition.

Files likely affected:

- Initially docs/contracts/API client only.
- Later new `frontend-vite/` or replacement `frontend/` scaffold, depending on approved plan.

Impact:

- Routing: gradual.
- API calls: can be centralized before route migration.
- Deployment: temporary dual-build strategy.
- Tests: tests can be introduced around contracts before migration.
- UX: lower risk because parity can be manually checked.
- Maintainability: best long-term path if migration is still desired after hardening.

Recommendation: do not start with a Vite rewrite. First harden backend contracts, generate/shared API types, remove direct fetches, and classify frontend-only business logic. Then Vite migration becomes a mechanical UI platform move rather than an architecture rewrite.

## 9. Recommended Target Architecture

Recommended target layout:

```text
frontend/
  src/
    app-or-router/
    components/
    pages/
    hooks/
    services/
    charts/
    state/
    lib/
backend/
  app/
    api/
    routers/
    services/
    schemas/
    analytics/
    optimization/
    db/
    models/
    repositories/
database/
  migrations/
  seed/
  schema/
shared-contracts/
  openapi.json
  generated-typescript/
```

Frontend target:

- Vite + React + TypeScript if migration is approved after contract hardening.
- React Router or TanStack Router for route parity.
- UI components grouped by feature and shared primitives.
- API client generated or typed from OpenAPI.
- Hooks for each backend feature, ideally with a server-state library such as TanStack Query.
- Charts isolated under chart components.
- State limited to UI/session state; avoid storing server truth in global stores unless it is a cache managed by a query library.

Backend target:

- FastAPI routers organized by domain.
- Services own business workflows.
- Analytics modules stay pure and independently testable.
- Database layer uses repositories/unit-of-work patterns consistently.
- Alembic migrations replace `create_all` plus ad hoc column migration as the production path.
- Provider modes stay behind one dependency interface but avoid in-memory state as canonical state.

Database target:

- `database/migrations/`: Alembic migrations.
- `database/seed/`: explicit demo/local seeds.
- `database/schema/`: generated schema snapshots or ERD docs.
- PostgreSQL for production.
- SQLite only for local/dev/test.

Shared contracts target:

- Generate OpenAPI from FastAPI.
- Generate TypeScript types/client from OpenAPI.
- Track breaking contract changes in CI.

Where specific domains should live:

- Portfolio calculations: backend services/analytics as canonical; frontend only formats and displays.
- Risk metrics: backend `analytics/risk.py` and quant service as canonical. Frontend risk math only for local what-if simulation, clearly namespaced.
- Efficient frontier logic: backend `optimization/`.
- Watchlist logic: CRUD and persistence in backend; UI filtering/editing in frontend; live quote enrichment through backend.
- Peer comparison: backend provider/service; frontend selector/table only.
- News/events integration: backend provider/service; frontend filters/rendering only.
- AI advisor integration later: backend owns provider calls, prompt/context, audit/safety boundaries. Frontend can keep a rule-based fallback only if explicitly treated as local fallback and tested against the same context contract.
- Mock data/demo mode: either restore as explicit backend demo provider plus seed data, or delete in a later cleanup phase. Do not leave disabled mock artifacts ambiguous.

## 10. Migration Plan

### Phase 0: Safety Checks and Branch Setup

- Goal: protect current working state and define migration branch strategy.
- Files likely touched: none initially; possibly docs/branch notes.
- Validation commands:
  - `git status --short`
  - `git branch --show-current`
  - `git diff --stat`
- Manual checks:
  - Confirm whether existing doc deletions and `older version docs/` move are intentional.
  - Confirm target branch naming.
- Rollback plan:
  - No code changes; abandon branch or revert documentation-only commit.
- Risks:
  - Dirty worktree can hide unrelated changes. Do not normalize or revert without approval.

### Phase 1: Documentation and API Contract Audit

- Goal: document current architecture and list API contracts before migration.
- Files likely touched:
  - `docs/ARCHITECTURE_AUDIT.md`
  - later optional `docs/API_CONTRACT_AUDIT.md`
- Validation commands:
  - `rg --files`
  - `python -m compileall backend/app` optional read-only confidence check
  - backend OpenAPI export command once defined
- Manual checks:
  - Review endpoint list against Swagger/OpenAPI.
  - Confirm deprecated endpoints still required by UI.
- Rollback plan:
  - Revert docs-only changes.
- Risks:
  - Some behavior cannot be inferred without running app and real data/API keys.

### Phase 2: Backend Contract Hardening

- Goal: make backend contracts stable, explicit, and generated.
- Files likely touched:
  - `backend/app/schemas/*`
  - `backend/app/api/v1/endpoints/*`
  - `backend/app/core/config.py`
  - `backend/app/main.py`
  - `shared-contracts/*`
  - docs contract files
- Validation commands:
  - `cd backend && poetry run pytest`
  - `cd backend && poetry run ruff check app tests`
  - OpenAPI export/generation command.
- Manual checks:
  - Confirm status/error shapes and deprecation policy.
  - Verify no frontend-only terms leak into canonical contracts unless intentional.
- Rollback plan:
  - Keep old endpoints and response fields until frontend parity is proven.
- Risks:
  - Breaking manually maintained TS types or debug panel assumptions.

### Phase 3: Vite Frontend Scaffold

- Goal: create Vite scaffold without deleting Next app.
- Files likely touched:
  - new `frontend-vite/` or approved scaffold location.
  - Vite config, TypeScript config, Tailwind config, env example.
- Validation commands:
  - `pnpm install`
  - `pnpm dev`
  - `pnpm build`
  - `pnpm type-check`
- Manual checks:
  - Confirm app shell renders.
  - Confirm CORS for Vite dev origin.
- Rollback plan:
  - Delete scaffold branch or scaffold folder before merge if abandoned.
- Risks:
  - Dependency and alias drift if scaffold lives alongside Next too long.

### Phase 4: Component Migration

- Goal: migrate presentational components and route views incrementally.
- Files likely touched:
  - route/page components from `frontend/src/app/**`
  - `frontend/src/components/**`
  - `frontend/src/hooks/**`
  - router setup.
- Validation commands:
  - `pnpm build`
  - `pnpm type-check`
  - component/unit test command once added.
- Manual checks:
  - Compare each route visually against Next app.
  - Verify sidebar/topbar and deep links.
- Rollback plan:
  - Keep Next app as source of truth until Vite route parity is complete.
- Risks:
  - `next/navigation`, `next/font`, and App Router assumptions may be scattered through pages.

### Phase 5: API Client Integration

- Goal: use one typed API client and remove remaining direct fetches.
- Files likely touched:
  - `services/api.ts`
  - hooks
  - upload/market/indices/refresh pages/components
  - generated contract files.
- Validation commands:
  - frontend build/type-check
  - backend API tests
  - contract generation diff check.
- Manual checks:
  - Upload wizard, market polling, portfolio refresh, and direct FormData flows.
- Rollback plan:
  - Keep legacy API client functions during transition; feature-flag new client if needed.
- Risks:
  - FormData endpoints need special handling; JSON-default wrapper cannot cover them blindly.

### Phase 6: Testing and Visual QA

- Goal: prove parity before deleting old app.
- Files likely touched:
  - frontend test setup and tests
  - backend contract tests
  - E2E specs
  - CI config if present/added.
- Validation commands:
  - `cd backend && poetry run pytest`
  - `cd backend && poetry run ruff check app tests`
  - `cd frontend && pnpm build`
  - `cd frontend && pnpm type-check`
  - `cd frontend && pnpm lint` after lint script is verified/fixed
  - E2E command once Playwright is installed/configured.
- Manual checks:
  - Upload sample CSV.
  - Switch/refresh portfolio.
  - Visit all primary routes.
  - Verify market/news unavailable states without API keys.
  - Verify live yfinance unavailable behavior.
- Rollback plan:
  - Keep Next app deployed until Vite passes parity checklist.
- Risks:
  - Current active repo has no frontend tests and only missing/stale backend test source, so test infrastructure must be rebuilt.

### Phase 7: Cleanup/Removal of Old Next.js App Only After Parity

- Goal: remove old Next app only after Vite production parity.
- Files likely touched:
  - old Next route/config files
  - package scripts/deps
  - deployment config
  - docs.
- Validation commands:
  - full backend test suite
  - full frontend build/type/lint/test suite
  - E2E suite
  - production build smoke test.
- Manual checks:
  - Confirm no links still point to removed routes/files.
  - Confirm deployment docs updated.
- Rollback plan:
  - Revert cleanup commit; redeploy previous Next build.
- Risks:
  - Premature deletion is the highest-risk step. Do not do this until users confirm parity.

## 11. Testing and Validation Plan

Backend health checks:

- `cd backend && poetry run uvicorn app.main:app --reload --port 8000`
- `curl http://localhost:8000/health`
- `curl http://localhost:8000/readiness`

Backend API endpoint tests:

- Add/restore source tests under `backend/tests/`.
- Recommended commands:
  - `cd backend && poetry run pytest`
  - `cd backend && poetry run pytest -q`
  - `cd backend && poetry run ruff check app tests`
- Suggested coverage:
  - health/readiness response contracts.
  - upload parse/confirm contracts.
  - portfolio/full contract.
  - portfolio management CRUD.
  - snapshots/delta.
  - history canonical state mapping.
  - provider mode errors for disabled mock/broker.
  - unavailable external providers.

Frontend build/type/lint:

- Current commands:
  - `cd frontend && pnpm build`
  - `cd frontend && pnpm type-check`
  - `cd frontend && pnpm lint`
- Note: `next lint` should be validated because Next 15/ESLint 9 compatibility can require config updates.

Frontend unit tests:

- No active setup found. Add Vitest + React Testing Library if staying SPA-like.
- Prioritize:
  - `lib/simulation.ts`
  - `lib/advisor.ts`
  - `lib/fundamentals.ts`
  - API client error classification.
  - hooks with mocked API client.

Component tests:

- Add tests for:
  - upload column mapper.
  - holdings table sorting/filtering.
  - watchlist form/table.
  - risk/fundamentals cards.
  - portfolio switcher/refresh panel.

E2E tests:

- Add Playwright or equivalent.
- Core flows:
  - app shell loads.
  - upload CSV -> map -> confirm -> dashboard shows holdings.
  - create snapshot -> changes page shows snapshot.
  - portfolio rename/activate/delete.
  - watchlist add/edit/delete and live price unavailable handling.
  - market page polling/unavailable state.
  - advisor fallback response.

Manual browser checks:

- Start backend and frontend.
- Visit every route listed in Section 3.
- Verify mobile and desktop layouts.
- Verify localStorage-persisted data mode and sidebar width.
- Verify CORS when frontend port changes.
- Verify failure states with backend stopped, yfinance unavailable, and missing API keys.

## 12. Open Questions and Manual Checks

- Are the current doc deletions and `older version docs/` folder intentional? `git status` shows many deleted docs plus an untracked `older version docs/` directory.
- Should mock mode remain disabled permanently, or should it become a named demo mode with explicit seed data?
- Is SQLite acceptable beyond local development, or should PostgreSQL/Alembic be mandatory before migration?
- Which frontend routes are considered production features versus scaffolds/placeholders: `/frontier`, `/screener`, `/brokers`, `/ai-chat`, `/debug`?
- Are `scipy` and `sklearn` required runtime dependencies for optimization? Code imports them in some paths, but `pyproject.toml` does not clearly declare them as active dependencies.
- What deployment target is planned for frontend and backend? This affects whether Next.js has any operational value.
- Should the Vite migration preserve exact URLs for all current App Router paths?
- Should generated OpenAPI TypeScript types replace `frontend/src/types/index.ts` wholesale or incrementally?
- Are API keys used in production now: NewsAPI, OpenAI, Anthropic, FMP, Zerodha?
- What are the expected broker integration requirements and timeline? Current broker code is scaffolded and disabled.
- Should rule-based advisor logic live in the backend, frontend, or shared package? Current ownership is split.
- Should simulation remain client-only, or should hypothetical portfolio analytics be validated by backend endpoints?
- Are uploads intended to persist original files, or only parsed holdings? The current design is DB-first but still has upload paths and file-oriented code.
- What is the desired cache strategy for quant/live/provider data in multi-process deployment? Current in-process caches will not be shared across workers.
- Should debug/system diagnostics be available in production?
- Which test sources were removed? `backend/tests/__pycache__` indicates prior tests existed, but only `backend/tests/__init__.py` is present now.
- Should CORS include Vite dev origins such as `http://localhost:5173` during migration?
- What sample portfolios should be used as golden fixtures for parity testing?

