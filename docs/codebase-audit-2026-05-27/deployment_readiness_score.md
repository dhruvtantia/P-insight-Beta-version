# Deployment Readiness Score

Overall score: **44 / 100**

This score is for public deployment to real users, not for local development or an internal demo. The total is capped by missing auth/tenancy and data-trust risks even though the backend tests and frontend build pass.

## Metric Breakdown

| Metric | Max | Score | Rationale |
|---|---:|---:|---|
| Security, auth, tenancy | 20 | 0 | No login, no user isolation, no authorization boundaries, global active portfolio/watchlist state. Public use would expose or mix user data. |
| Data integrity and fallback honesty | 20 | 11 | Central mock mode is rejected and many endpoints expose unavailable metadata, but cost-basis valuation fallback, static peer maps, scaffolded UI, generated mock types, and swallowed watchlist quote errors still create trust risk. |
| Feature completeness | 15 | 8 | Core upload, portfolio, holdings, watchlist, fundamentals, risk, optimization, snapshots, and market pages exist. Broker sync, screener, standalone AI chat, corporate events, legacy frontier, and some market/news panels remain scaffolded or incomplete. |
| API reliability and observability | 15 | 7 | Feature registry and typed degraded states are good. External data depends heavily on Yahoo Finance and optional NewsAPI/FMP. Provider errors are often surfaced, but some paths return empty results or log-only failures. |
| Persistence, migrations, production ops | 10 | 3 | SQLite is default, no real Alembic migration scripts found, in-process caches affect correctness/performance, background jobs open sessions ad hoc, and Poetry is currently broken locally. |
| Frontend resilience and UX failure states | 10 | 7 | Build passes and most pages have loading/empty/degraded states. Some important failures are softened or hidden, especially supplemental quote failures and stale/generated mock labels. |
| Test coverage and CI confidence | 10 | 8 | Backend contract suite passes with 63 tests. Frontend build/type-check pass after `.next/types` regeneration. No meaningful frontend unit/E2E/browser test suite was found. |

## Why The Score Is Not Higher

Critical public blockers:

- No authentication or user isolation.
- No production-grade database migration path in the checked-in source.
- Several visible routes are scaffolded, deprecated, or placeholder-only.
- Live-data behavior depends on external providers with limited redundancy.
- Some user-facing analytics can remain visible while based on missing, stale, or fallback data.

## Why The Score Is Not Lower

Positive foundations:

- Central data-provider selection rejects `mock` mode at request time.
- Backend tests pass.
- Frontend production build passes.
- Feature registry exposes enabled/degraded/disabled states.
- Many live-data endpoints return explicit `unavailable`, `missing`, `provider_failed`, or incomplete metadata instead of crashing.
- Core uploaded-portfolio workflows and most analytics surfaces are functionally present.

## Suggested Improvement Order

1. Add auth, tenancy, and user-scoped data ownership.
2. Remove or hide scaffold/deprecated public routes.
3. Make all fallback and unavailable states visible and non-ambiguous.
4. Replace ad hoc DB evolution with real migrations and production DB setup.
5. Harden live-data providers with retry, rate-limit, cache, and provider-health strategy.
6. Add frontend/E2E tests for the main workflows and degraded provider states.

