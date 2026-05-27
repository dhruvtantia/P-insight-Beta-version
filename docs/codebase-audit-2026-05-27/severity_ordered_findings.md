# Severity Ordered Findings

## Critical

### 1. No authentication, authorization, or tenancy

- Affected areas: all backend routes, all frontend routes, portfolio/watchlist/snapshot data.
- Evidence: no auth dependency or user owner model found; `api_router.include_router(market.router)` even comments "no auth required"; portfolio active state is global.
- Impact: public users can share global data context, making privacy and data isolation impossible.
- Root cause: app is still single-user/local-first.
- Suggested fix: introduce user identity, auth middleware, user-scoped portfolio/watchlist/snapshot rows, route-level authorization, and migration of existing global data.
- Validation: API tests that user A cannot read or mutate user B portfolios/watchlist/snapshots.
- Public deployment blocker: yes.

### 2. Public UI exposes scaffolded or nonfunctional product surfaces

- Affected areas: broker sync, standalone AI chat, screener, legacy frontier, some market beta blocks.
- Evidence: `/brokers` presents scaffold connectors; `/ai-chat` returns scaffold responses; `/screener` is placeholder-only; `/frontier` points to deprecated scaffold endpoint.
- Impact: users can mistake architecture placeholders for product features.
- Root cause: scaffold-era pages remain routable in the production app shell.
- Suggested fix: hide routes behind feature flags, remove sidebar links, or complete the features before public launch.
- Validation: production feature registry and navigation contain only production-supported surfaces.
- Public deployment blocker: yes.

### 3. Broker sync is modeled as a real workflow but connectors are not implemented

- Affected areas: `backend/app/connectors`, `backend/app/services/broker_service.py`, `/api/v1/brokers`, `/brokers`.
- Evidence: Zerodha and IBKR connectors have `is_implemented=False`; `FEATURE_BROKER_SYNC` and `BROKER_SYNC_ENABLED` are false; UI still explains connector flows.
- Impact: high-trust financial data import feature cannot work for public users.
- Root cause: connector contracts and UI were built before OAuth/sync implementation.
- Suggested fix: keep disabled and remove public route, or implement secure OAuth, credential storage, sync reconciliation, and error recovery.
- Validation: broker sandbox integration test plus user-scoped sync and rollback tests.
- Public deployment blocker: yes if route remains visible.

### 4. Production persistence is not ready

- Affected areas: DB setup, migrations, SQLite default, background jobs, cache behavior.
- Evidence: default `DATABASE_URL=sqlite:///./p_insight.db`; no real Alembic migration files found, only `__pycache__`; `init_db.py` performs ad hoc table/column creation.
- Impact: schema drift, irreversible production changes, weak rollback story, and multi-instance hazards.
- Root cause: development-first persistence model.
- Suggested fix: add real Alembic baseline and forward migrations, production Postgres config, migration CI, and deployment runbook.
- Validation: clean DB migration from empty to current schema and upgrade test in CI.
- Public deployment blocker: yes.

## High

### 5. Yahoo Finance is a single dominant live-data dependency

- Affected areas: live quotes, upload price enrichment, market overview, fundamentals, peers, quant/risk, optimization, benchmark/history.
- Evidence: `yfinance` drives `/live`, `/market`, fundamentals, price histories, benchmark, and enrichment; smoke calls failed with DNS errors to `guce.yahoo.com`.
- Impact: one provider outage, DNS issue, rate limit, or ticker coverage gap can degrade most analytical features.
- Root cause: no primary/secondary provider abstraction for live market prices/history.
- Suggested fix: define provider health states, retry/backoff, cache warm paths, secondary paid provider option, and per-feature dependency budgets.
- Validation: integration tests for yfinance unavailable, empty, timeout, and partial ticker coverage.
- Public deployment blocker: yes for reliability-sensitive public launch.

### 6. Watchlist live quote failures are swallowed on the frontend

- Affected areas: `frontend/src/hooks/useWatchlistPrices.ts`, `/watchlist`.
- Evidence: catch block intentionally comments "Silently swallow"; the hook does not expose error/missing/status_by_ticker to the UI.
- Impact: watchlist can display no/old supplemental prices without explaining provider failure.
- Root cause: quote enrichment treated as optional UI sugar without trust-state propagation.
- Suggested fix: return `error`, `missing`, `statusByTicker`, and `lastSuccessfulFetchAt`; render degraded state per ticker.
- Validation: frontend hook/component tests with `/live/quotes` network error and missing ticker response.
- Public deployment blocker: no by itself, but high data-trust risk.

### 7. Cost-basis valuation fallback can preserve calculations while hiding missing prices

- Affected areas: portfolio summary, holdings, simulation, dashboard, upload enrichment.
- Evidence: `valuation_price_and_fallback()` can use `average_cost`; schemas expose `market_value_uses_fallback`; UI labels this as "Cost basis" in some locations.
- Impact: portfolio values, weights, and downstream analytics can look stable when current prices are unavailable.
- Root cause: fallback is needed for continuity but not uniformly treated as degraded.
- Suggested fix: make fallback counts and affected tickers first-class in every summary, dashboard, simulation, and advisor context.
- Validation: fixtures with missing current prices verify visible degraded banners and excluded analytics.
- Public deployment blocker: high trust risk until consistently visible.

### 8. News and corporate events are incomplete and provider-dependent

- Affected areas: `/news`, `/market` headlines, `LiveAPIProvider.get_news`, `get_events`.
- Evidence: NewsAPI is optional; smoke returned `news_status="unavailable"` under DNS failure; corporate events return empty with no real provider.
- Impact: empty or unavailable panels can be misread as "no news/events."
- Root cause: no dedicated corporate events/calendar provider and limited news provider strategy.
- Suggested fix: keep unavailable vs empty distinct everywhere, add provider health display, and integrate a real events source.
- Validation: missing key, provider error, valid empty result, and matching article scenarios.
- Public deployment blocker: no, if clearly marked unavailable.

### 9. Static peer universe can mislead comparisons

- Affected areas: `/peers`, `live_provider._PEER_MAP`, `file_provider.get_peer_discovery`.
- Evidence: peer discovery first uses static curated map; FMP fallback only when configured and static miss.
- Impact: stale or incomplete peers affect valuation rankings and user conclusions.
- Root cause: no maintained canonical peer dataset or robust live peer discovery.
- Suggested fix: expose peer source prominently, maintain a versioned peer dataset, or use provider-backed discovery with freshness metadata.
- Validation: peer source and sparse/incomplete set UI tests.
- Public deployment blocker: no, but high product-trust risk.

### 10. Generated and manual contracts still carry mock/scaffold language

- Affected areas: `frontend/src/generated/api-types.ts`, `frontend/src/types/index.ts`, backend schemas.
- Evidence: generated types include `mock`, scaffold responses, deprecated endpoints, and old mock descriptions.
- Impact: future implementation can accidentally reintroduce mock paths or normalize scaffold behavior.
- Root cause: OpenAPI still exposes legacy schemas/routes and manual frontend types are not fully cleaned.
- Suggested fix: remove deprecated routes from production OpenAPI or gate them; regenerate after schema cleanup.
- Validation: grep for `mock`, `scaffold`, deprecated frontier after cleanup.
- Public deployment blocker: no, but high maintenance risk.

## Medium

### 11. Frontend type-check depends on generated `.next/types`

- Affected areas: `frontend/tsconfig.json`, frontend CI.
- Evidence: `npm run type-check` failed before build because included `.next/types/**/*.ts` files were missing; `npm run build` regenerated them and passed.
- Impact: CI order matters; developers may see false failures after clean checkout.
- Root cause: Next generated types included in TypeScript program without pre-generation step.
- Suggested fix: run `next build` or `next typegen` before standalone type-check, or adjust tsconfig/script.
- Validation: clean checkout `npm run type-check` passes without requiring stale `.next`.
- Public deployment blocker: no.

### 12. Backend passes tests but emits deprecation warnings

- Affected areas: Pydantic settings, schema fields, FastAPI query examples.
- Evidence: 17 warnings in backend test run.
- Impact: future Pydantic/FastAPI upgrades will become noisy or breaking.
- Root cause: class-based config and deprecated `example` metadata.
- Suggested fix: migrate to `ConfigDict` and `json_schema_extra`/`examples`.
- Validation: tests pass with zero deprecation warnings.
- Public deployment blocker: no.

### 13. AI advisor fallback is split between backend and frontend

- Affected areas: `/advisor`, `AIAdvisorService`, `useAdvisor`, `frontend/src/lib/advisor.ts`.
- Evidence: backend returns `fallback_used=True`; frontend routes to local rule-based advisor.
- Impact: advisor behavior can diverge between backend contract and frontend fallback logic.
- Root cause: hybrid AI/rule-based implementation.
- Suggested fix: centralize rule fallback in backend or version the advisor context/response contract.
- Validation: same prompt/context produces deterministic fallback from one owner.
- Public deployment blocker: no if clearly labeled rule-based.

### 14. Optimization degrades to Monte Carlo when scipy is missing

- Affected areas: optimizer/frontier.
- Evidence: smoke run logged `scipy not installed - using Monte Carlo frontier`.
- Impact: results are less accurate and method changes by environment.
- Root cause: scipy is commented out in `backend/pyproject.toml`.
- Suggested fix: either declare scipy as production dependency or explicitly label Monte Carlo mode in all UI/metadata.
- Validation: optimizer metadata confirms method and dependency availability.
- Public deployment blocker: no, but methodology risk.

### 15. Market overview has real indices/movers but beta placeholder asset blocks

- Affected areas: `/market`.
- Evidence: FX and commodities are visible beta placeholders with no backend feed.
- Impact: page mixes real and non-real market data in one experience.
- Root cause: incomplete market module.
- Suggested fix: remove placeholders or add provider-backed FX/commodity endpoints.
- Validation: market page contains only real data or clearly disabled sections.
- Public deployment blocker: no if labels remain explicit.

## Low

### 16. Disabled mock provider and mock data remain in repo

- Affected areas: `backend/app/data_providers/mock_provider.py`, `backend/mock_data/portfolio.json`, disabled seeding.
- Evidence: central dependencies reject `mode=mock`, but artifacts remain.
- Impact: cleanup debt and possible future confusion.
- Root cause: phased removal of mock mode.
- Suggested fix: delete or convert to explicit demo mode with strong labeling.
- Validation: no runtime mock references except intentional demo tests.
- Public deployment blocker: no if unreachable.

### 17. Documentation drift exists across old and generated docs

- Affected areas: `older version docs`, generated API types, comments.
- Evidence: old docs and generated schema comments still refer to mock/scaffold phases.
- Impact: confusing for future work and audits.
- Root cause: active code moved faster than docs.
- Suggested fix: archive old docs and regenerate docs from current contracts.
- Validation: docs search has no obsolete production claims.
- Public deployment blocker: no.

