# P-Insight Architecture

Last updated: 2026-05-18

## Architecture Direction

P-Insight will be rebuilt as a modular monolith.

The web application, mobile app, and future integrations must treat the backend API as the contract boundary. Portfolio data is the central source of truth. Frontend components may display portfolio analytics, but must not own core analytics calculations or call market, broker, or AI providers directly.

Required flow:

```text
Frontend -> Backend API -> Service Layer -> Repository Layer -> Database / External Provider
```

## Current Repository Audit

The repository already contains a working product foundation, but it does not yet match the target module layout.

Current backend observations:

- FastAPI app exists at `backend/app/main.py`.
- API routes are aggregated through `backend/app/api/v1/router.py`.
- Endpoint modules currently live under `backend/app/api/v1/endpoints`.
- Business logic is mostly in `backend/app/services`, `backend/app/analytics`, `backend/app/data_providers`, `backend/app/ingestion`, and `backend/app/optimization`.
- Repositories exist for some areas under `backend/app/repositories`, but database access is not yet consistently enforced through repository boundaries.
- SQLAlchemy is configured in `backend/app/db/database.py`.
- Alembic files exist, including an initial migration under `backend/alembic/versions`.
- Current default database is SQLite, while the target launch database is PostgreSQL.
- Existing models cover portfolios, holdings, watchlist, snapshots, history, broker connections, and background jobs.
- MVP-required tables such as users, assets, asset_prices, analytics_results, ai_conversations, ai_messages, upload_jobs, upload_rows, subscriptions, and feature_usage still need dedicated schema work.

Current frontend observations:

- Frontend is currently Next.js App Router, TypeScript, Tailwind, Recharts, Zustand, and lucide-react.
- Target stack requests React, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, React Hook Form, and Zod.
- There are existing dashboard, holdings, upload, advisor, broker, watchlist, risk, market, and analytics-adjacent pages.
- API calls are centralized through `frontend/src/services/api.ts`, which is good, but the service file is too broad and should be split by module.
- Some frontend analytics helpers exist in `frontend/src/lib`; these must be audited so core analytics logic is not duplicated in the frontend.

Current docs observations:

- Existing docs describe previous architecture and rebuild prompts.
- The canonical rebuild docs are now `docs/prd.md`, `docs/architecture.md`, `docs/api-contract.md`, and `docs/environment.md`.

## Recommended Files To Keep

Keep and refactor these areas because they already provide useful product or technical foundation:

- `backend/app/main.py`: FastAPI entry point, middleware, lifecycle, and health/readiness patterns.
- `backend/app/core/config.py`: existing environment-backed settings pattern.
- `backend/app/db/database.py`: SQLAlchemy engine/session setup; split into `db/session.py` and `db/base.py` compatibility paths during rebuild.
- `backend/alembic/`: migration foundation; revise schema content rather than discarding the migration setup.
- `backend/app/api/v1/router.py`: useful route aggregation reference while moving toward `app/modules/*/router.py`.
- `backend/app/models/portfolio.py`, `snapshot.py`, `history.py`, `broker_connection.py`: useful starting models, though naming and table coverage need MVP alignment.
- `backend/app/ingestion/`: useful upload parsing/normalization ideas for the new uploads module.
- `backend/app/data_providers/`: useful provider-abstraction reference for `market_data/providers`.
- `backend/app/analytics/`: useful deterministic analytics code to move behind module contracts.
- `backend/app/services/context_builder.py` and `ai_advisor_service.py`: useful starting point for the AI advisor context boundary.
- `frontend/src/app/dashboard`, `holdings`, `upload`, `advisor`, `ai-chat`, `watchlist`, and `brokers`: useful screens/components to salvage after API contracts stabilize.
- `frontend/src/components/layout`, `charts`, `upload`, `portfolio`, `risk`, `advisor`, and `watchlist`: useful UI pieces for the MVP shell.
- `frontend/src/services/api.ts`: keep as a temporary compatibility layer, then split by API group.
- `frontend/src/generated`: keep generated API types, but regenerate from the rebuilt OpenAPI contract.

## Recommended Files To Replace Or Refactor

Replace or heavily refactor these areas because they conflict with the target architecture or MVP focus:

- Broad endpoint modules under `backend/app/api/v1/endpoints/*`: migrate one feature at a time into `backend/app/modules/{feature}`.
- Broad service files in `backend/app/services/*`: split into module-local services and repositories.
- Direct analytics helper usage in `frontend/src/lib/risk.ts`, `insights.ts`, `simulation.ts`, and similar files: keep only UI formatting or client-only what-if helpers; backend owns core analytics.
- `frontend/src/services/api.ts`: split into `portfolioApi.ts`, `holdingsApi.ts`, `uploadApi.ts`, `analyticsApi.ts`, `aiApi.ts`, `marketDataApi.ts`, and `billingApi.ts`.
- Existing frontend route set for non-MVP features such as peers, optimization, frontier, screener, and advanced fundamentals: keep code parked, but do not make it part of launch-critical navigation.
- SQLite-first assumptions: keep SQLite for quick local setup, but validate migrations and persistence against PostgreSQL.
- Any frontend provider-key pattern: remove if found; all market, broker, AI, and Stripe secret keys are backend-only.

## Foundation Skeleton Status

Phase 0 creates the canonical rebuild docs and a non-invasive target skeleton:

- `backend/app/core/errors.py`
- `backend/app/core/security.py`
- `backend/app/core/logging.py`
- `backend/app/core/feature_flags.py`
- `backend/app/db/base.py`
- `backend/app/db/session.py`
- `backend/app/modules/`
- `frontend/src/pages/README.md`
- `frontend/src/services/README.md`

The skeleton is intentionally not wired into the active runtime yet. Phase 1 should start moving health/config/error/database behavior into these target paths, then route modules can migrate incrementally.

## Key Architecture Decisions

### ADR-001: Modular Monolith First

Decision: Build a modular monolith, not microservices.

Reason: The product needs launch velocity, simpler debugging, consistent transactions, and clean internal boundaries before service extraction is useful.

### ADR-002: Backend Owns Analytics

Decision: Core analytics live only in backend analytics services/calculators.

Reason: Frontend duplication creates inconsistent numbers, makes debugging harder, and blocks mobile reuse.

### ADR-003: Backend Owns External Providers

Decision: Market data, broker data, and AI calls are backend-only.

Reason: API keys and provider contracts must stay server-side. Frontend talks only to P-Insight APIs.

### ADR-004: Uploads Normalize Into Holdings

Decision: Uploaded and future broker-connected data normalize into the same internal holdings/transactions model.

Reason: Analytics, AI, billing limits, and mobile clients should not care where portfolio data originated.

### ADR-005: PostgreSQL Compatibility

Decision: PostgreSQL is the production target. SQLite can remain a local development convenience only while migrations stay PostgreSQL-compatible.

Reason: Supabase/Postgres is the likely production database. JSON, numeric precision, indexes, constraints, and migration behavior should be validated against Postgres before launch.

### ADR-006: Frontend Migration Is A Separate Task

Decision: Do not replace the existing Next.js frontend with Vite during Phase 0.

Reason: The existing frontend is non-trivial and already has many pages. A Vite migration should happen after backend contracts are stable, or be explicitly chosen as a separate frontend reset. Until then, the same frontend rules apply: pages assemble, components display, services fetch, hooks manage query/state, and no frontend provider keys or core analytics.

## Target Repository Shape

```text
p-insight/
  frontend/
    src/
      app/
      pages/
      components/
      services/
      hooks/
      types/
      lib/
  backend/
    app/
      main.py
      core/
      db/
      modules/
      tests/
  docs/
    prd.md
    api-contract.md
    architecture.md
    environment.md
```

## Proposed Final Folder Structure

```text
p-insight/
  backend/
    alembic/
      versions/
    app/
      main.py
      core/
        config.py
        errors.py
        feature_flags.py
        logging.py
        security.py
      db/
        base.py
        models.py
        session.py
      modules/
        auth/
          router.py
          service.py
          schemas.py
          errors.py
        users/
          router.py
          service.py
          repository.py
          schemas.py
          errors.py
        portfolios/
          router.py
          service.py
          repository.py
          schemas.py
          errors.py
        holdings/
          router.py
          service.py
          repository.py
          schemas.py
          errors.py
        uploads/
          router.py
          service.py
          repository.py
          schemas.py
          errors.py
        market_data/
          service.py
          schemas.py
          providers/
            base.py
            mock_provider.py
            polygon_provider.py
            fmp_provider.py
        analytics/
          router.py
          service.py
          schemas.py
          calculators/
            allocation.py
            performance.py
            risk.py
            concentration.py
            rules.py
        ai_advisor/
          router.py
          service.py
          schemas.py
          prompts.py
          context_builder.py
        broker_connections/
          router.py
          service.py
          repository.py
          schemas.py
          providers/
            base.py
            plaid_provider.py
            zerodha_provider.py
            ibkr_provider.py
        watchlist/
          router.py
          service.py
          repository.py
          schemas.py
        billing/
          router.py
          service.py
          repository.py
          schemas.py
        admin/
          router.py
          service.py
          repository.py
          schemas.py
      tests/
    .env.example
  frontend/
    src/
      app/
        App.tsx
        providers.tsx
        routes.tsx
      pages/
        LandingPage.tsx
        LoginPage.tsx
        SignupPage.tsx
        OnboardingPage.tsx
        DashboardPage.tsx
        HoldingsPage.tsx
        UploadPage.tsx
        AnalyticsPage.tsx
        AIAdvisorPage.tsx
        WatchlistPage.tsx
        BrokerConnectionsPage.tsx
        BillingPage.tsx
        SettingsPage.tsx
        AdminPage.tsx
      components/
        layout/
        portfolio/
        holdings/
        upload/
        analytics/
        charts/
        ai/
        billing/
        ui/
      services/
        apiClient.ts
        portfolioApi.ts
        holdingsApi.ts
        uploadApi.ts
        analyticsApi.ts
        aiApi.ts
        marketDataApi.ts
        billingApi.ts
      hooks/
      types/
      lib/
    .env.example
  docs/
    prd.md
    architecture.md
    api-contract.md
    environment.md
```

The backend should move toward module-local routers, services, repositories, schemas, and errors:

```text
backend/app/modules/{module}/
  router.py
  service.py
  repository.py
  schemas.py
  errors.py
```

Modules without persistence may omit repository files.

## Backend Module Responsibilities

### core

- Configuration.
- Security/auth dependencies.
- Error response helpers.
- Logging.
- Feature flags.
- CORS and app lifecycle wiring.

### db

- SQLAlchemy engine/session.
- Declarative base.
- ORM model imports.
- Alembic migrations.

### auth

- Placeholder user identity.
- Future Supabase Auth or Clerk integration.
- Current-user dependency.
- TODO comments for production auth.

### users

- User profile persistence.
- User settings.
- Future onboarding metadata.

### portfolios

- Portfolio CRUD.
- Ownership checks.
- Portfolio metadata and selected/default portfolio.

### holdings

- Manual holding CRUD.
- Normalized holdings model.
- No broker-specific payloads.

### uploads

- File parsing.
- Upload jobs.
- Parsed rows.
- Column mapping.
- Validation.
- Confirm import into normalized holdings.

### market_data

- Provider interface.
- Mock provider.
- Polygon/Massive placeholder.
- FMP placeholder.
- Latest price cache.
- Historical price access.
- FX rate abstraction.

### analytics

- Deterministic calculators.
- Allocation.
- Performance.
- Risk.
- Concentration.
- Rules engine.
- Persisted analytics results where useful.

### ai_advisor

- Structured context builder.
- Prompt templates.
- Summary endpoint.
- Q&A endpoint.
- Conversation history.
- Usage limit checks.

### broker_connections

- Broker provider interface.
- Placeholder providers.
- Broker account persistence.
- Normalization into internal holdings/transactions.

### watchlist

- Watchlist CRUD.
- Plan-gated later if required.

### billing

- Plan definitions.
- Usage limits.
- Stripe placeholder endpoints.
- Subscription persistence.

### admin

- Internal diagnostics.
- Error monitoring placeholder.
- Feature flags visibility.
- Beta feedback placeholder.

## Database Model Direction

Minimum MVP tables:

- users.
- portfolios.
- holdings.
- assets.
- asset_prices.
- portfolio_snapshots.
- analytics_results.
- ai_conversations.
- ai_messages.
- upload_jobs.
- upload_rows.
- subscriptions.
- feature_usage.
- watchlist_items.

Later tables:

- transactions.
- broker_connections.
- broker_accounts.
- provider_sync_jobs.
- audit_events.

Important modeling rules:

- `holdings` represents normalized current positions.
- `transactions` represents normalized activity history when available.
- `assets` stores canonical instrument metadata.
- `asset_prices` stores cached provider prices and freshness metadata.
- `upload_rows` stores parsed raw-ish row data and validation results before import.
- Broker-specific fields stay in broker module tables or metadata, not in core holdings.

## Error Contract

All backend endpoints should return a consistent error shape:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Portfolio not found.",
    "details": {},
    "request_id": "req_123"
  }
}
```

Module-specific exceptions should map to this shape in a central handler.

## Auth Boundary

MVP can use a placeholder authenticated user dependency.

Rules:

- Every portfolio-scoped endpoint accepts or derives a user context.
- Ownership checks must be present even if the user identity is stubbed.
- TODO comments should identify where Supabase Auth or Clerk verification will replace the stub.
- No frontend page should assume all data belongs to a global anonymous user forever.

## Market Data Boundary

Provider interface:

```python
class MarketDataProvider:
    def get_latest_price(self, symbol: str): ...
    def get_batch_prices(self, symbols: list[str]): ...
    def get_price_history(self, symbol: str, start: str, end: str): ...
    def get_company_profile(self, symbol: str): ...
    def get_fx_rate(self, from_currency: str, to_currency: str): ...
```

MVP:

- Use mock provider by default.
- Cache latest prices in database.
- Frontend polls backend endpoints.
- Missing prices return null/freshness warnings, not server crashes.

Future:

- Add provider-backed refresh jobs.
- Add Redis cache/pub-sub if real-time updates become necessary.
- Add SSE/WebSocket only after stable price cache semantics exist.

## Broker Boundary

Provider interface:

```python
class BrokerProvider:
    def connect_account(self): ...
    def refresh_token(self): ...
    def get_accounts(self): ...
    def get_holdings(self): ...
    def get_transactions(self): ...
    def get_balances(self): ...
    def disconnect(self): ...
```

Rules:

- Broker providers normalize into internal holdings and transactions.
- Broker-specific schemas do not leak into analytics or frontend models.
- Broker sync remains placeholder for MVP.

## AI Advisor Boundary

AI context must be built from portfolio data and analytics outputs:

```json
{
  "portfolio_summary": {},
  "holdings": [],
  "risk_metrics": {},
  "allocation": {},
  "rule_based_insights": [],
  "price_freshness": {},
  "user_question": ""
}
```

Rules:

- AI cannot directly query arbitrary database tables.
- AI cannot replace deterministic analytics.
- AI must avoid guaranteed investment claims.
- Prompts should instruct cautious language.
- Usage limits should be tracked through `feature_usage`.

## Frontend Rules

- Pages assemble components.
- Components display data.
- Services fetch data.
- Hooks manage query/state behavior.
- No core analytics logic in frontend.
- No frontend market, broker, or AI keys.
- Every page has loading, empty, and error states.
- API services should be split by module instead of one broad file.

## Testing Strategy

Backend:

- Health endpoint.
- Portfolio CRUD.
- Holdings CRUD.
- Upload validation and confirm.
- Invalid file handling.
- Invalid ticker handling.
- Analytics deterministic outputs.
- AI context builder shape.
- Auth/ownership placeholder behavior.

Frontend:

- App loads.
- Navigation works.
- Empty dashboard state.
- Upload wizard states.
- Holdings table renders.
- API errors show readable messages.
- Loading states display.

## Rebuild Phases

### Phase 0: Audit And Setup

- Inspect repository.
- Create rebuild branch.
- Create canonical docs.
- Record assumptions and architecture decisions.

### Phase 1: Backend Foundation

- FastAPI app factory cleanup.
- Health endpoint under `/api/health`.
- Config, logging, errors, database session.
- PostgreSQL-ready models and migrations.
- Backend `.env.example`.

### Phase 2: Portfolio And Holdings

- Portfolio CRUD.
- Holdings CRUD.
- Repository boundaries.
- Ownership placeholders.

### Phase 3: Upload System

- CSV/XLSX parser.
- Upload job/row tables.
- Column mapping.
- Validation.
- Confirm import.
- Error report.

### Phase 4: Market Data

- Provider interface.
- Mock provider.
- Price endpoints.
- Price cache table.
- External provider placeholders.

### Phase 5: Analytics

- Summary.
- Weights.
- Allocation.
- Gain/loss.
- Volatility.
- Sharpe ratio.
- Concentration rules.
- Tests.

### Phase 6: AI Advisor

- Context builder.
- Summary.
- Q&A.
- Conversation history.
- Usage limit placeholder.

### Phase 7: Frontend App

- App shell.
- Landing/auth/onboarding.
- Dashboard.
- Upload wizard.
- Holdings.
- Analytics.
- AI advisor.
- Watchlist.
- Billing.
- Broker placeholder.
- Settings.

### Phase 8: Monetization Placeholder

- Plan definitions.
- Usage limits.
- Billing page.
- Stripe placeholders.

### Phase 9: Deployment Readiness

- Production config.
- CORS.
- Deployment checklist.
- Vercel frontend config.
- Render/Railway backend config.
- Supabase setup notes.
- Sentry/PostHog placeholders.

### Phase 10: Private Beta

- Demo portfolio.
- Seed data.
- Admin placeholder.
- Feedback placeholder.
- Beta onboarding copy.

## Assumptions

- The private beta can launch with placeholder auth if every backend contract already accepts a user/ownership boundary.
- The existing Next.js frontend can remain temporarily while backend contracts are rebuilt, unless a separate task explicitly resets the frontend to Vite.
- PostgreSQL is the production database target, even if SQLite remains available for local quick starts.
- The first market data provider in development is mock data.
- AI features are optional at runtime if provider keys are missing.
- Billing can be placeholder-only for MVP, but plan and usage tables should exist early.
