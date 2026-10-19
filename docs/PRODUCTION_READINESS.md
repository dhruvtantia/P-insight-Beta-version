# Production Readiness and Release Decisions

Updated: 2026-10-19. **Not approved for a customer-facing production launch.** [Execution plan](EXECUTION_PLAN.md) | [Checkpoint](EXECUTION_STATUS.md).

This public summary describes capability and acceptance boundaries. It intentionally omits sensitive audit diagnostics, customer data and security reproduction material. A working local feature or passing build is not a production-readiness claim.

## Product Scope Decision

Proposed first release: invite-only multi-user beta, uploaded INR Indian-equity and supported-ETF portfolios, with explicit quote freshness and hypothetical-performance methodology. **This proposal is not yet owner-approved.**

Alternatives are a public self-service first release or a launch requiring the extended roadmap. These alternatives materially change integration, abuse protection, operations, cost and schedule. Keep the decision open rather than presenting a smaller release as fulfillment of unapproved promises.

| Decision | Owner input needed | Effect |
|---|---|---|
| Audience | Invited beta, public signup or extended product | Abuse/capacity/customer-operations gates |
| Geography and assets | Supported exchanges, types, currencies and identifiers | Instrument identity, provider coverage and financial domain rules |
| Data claims | Delayed/end-of-day versus licensed intraday; hypothetical versus actual investor performance | Sources, timestamp/quality disclosure and methodology |
| Optional features | AI, news/events, payments, brokers, screener | Integrations, permissions, quotas, customer obligations and acceptance |
| Budget and region | Staging/production allowance and permitted data regions | Service plans, recovery, latency and procurement |
| Retention and customer lifecycle | Raw-file TTL, export/delete/recovery/support policy | Storage, deletion, backups and operational procedures |

No provider key alone establishes coverage, production use rights or redistribution permission. Confirm contracts, supported symbols, quota, attribution, caching/retention terms and cost before committing to a customer-facing feed. Obtain qualified jurisdiction-specific review where product/advice/data obligations require it; this document is not legal advice.

## Capability Map

| Area | Current implementation | Frameworks/tools | Remaining acceptance |
|---|---|---|---|
| Accounts and portfolios | Authentication scaffolding/signing support, portfolio CRUD/read models | Supabase JS/Auth, PyJWT/cryptography, FastAPI, SQLAlchemy | Full identity/ownership/session/customer lifecycle matrix |
| Upload and enrichment | File parsing, mapping/classification, base holdings and enrichment stages | pandas/openpyxl, Pydantic, Python services/provider adapters | One bounded, transactional, durable and revision-safe lifecycle |
| Holdings and dashboard | Valuation/allocation/read DTOs and charts | FastAPI/Pydantic, React, Recharts | Consistent instrument/price/quality/as-of semantics |
| Fundamentals, peers and market | Provider-backed views and watchlist | Python adapters, HTTPX/yfinance, React hooks | Production-permitted coverage, units, calendars and unavailable states |
| History, snapshots and quant | Stored snapshots/history and numerical analytics | SQLAlchemy, pandas/NumPy/SciPy, scikit-learn | Methodology, observations, constraints, concurrency and reconciliation fixtures |
| Simulation and advisory | Client what-if/rules and optional LLM adapter work | TypeScript/React, Python context/services, optional provider SDK | Hypothetical labeling, quality-aware context, provider selection/quotas/consent |
| Broker/screener/chat/events/billing extensions | Mixed disabled scaffolding and roadmap work | Connector/feature interfaces and placeholders | Separate specifications, real integrations and explicit release gates |
| Delivery and operations | CI/migrations and local development setup | GitHub Actions, pytest/Ruff, TypeScript/Next.js, Alembic | Operated services, recovery, monitoring, email, support and release acceptance |

Keep the current modular-monolith direction: narrow backend ownership boundaries plus a separately operated durable worker, not a wholesale framework rewrite. Delegate UI through contracts and synthetic component/API states; the backend remains responsible for ownership, persistence, data quality and authoritative calculations.

## Launch Gates

All gates below need dated evidence. They are not marked complete by this document.

- [ ] Approved release scope, supported assets/geographies and public data/performance claims.
- [ ] Private access, session and computation isolation verified with synthetic multi-user cases.
- [ ] Strict parsing/numbers/mapping/identity/duplicate/resource policies and one supported import/refresh command.
- [ ] Atomic accepted revisions, idempotency, durable job/outbox/worker execution, cancellation/retry and revision fencing.
- [ ] API/worker interruption, provider failure and concurrent refresh recovery without lost accepted imports.
- [ ] Licensed provider coverage, observation timestamps/units/currency, financial methodology and deterministic correctness fixtures.
- [ ] Complete browser workflows including account recovery, upload/re-upload/switch/logout, degraded states, mobile and accessibility.
- [ ] Isolated staging/production auth/API/worker/database/queue/private storage/scheduler with controlled secrets and access.
- [ ] External confirmation/recovery email, DNS/TLS, customer export/delete/retention and support verified.
- [ ] Redacted observability, tested alerts, backup/restore/reconciliation and incident/rollback procedures.
- [ ] Clean reproducible dependencies, current advisory review, exact-head CI and controlled migration/promotion.
- [ ] Representative load, quotas/provider limits, cost alerts and an accountable release/support owner.
- [ ] Reviewed disclosures/policies/data/advice requirements for the actual chosen product and jurisdictions.
- [ ] Full rehearsal, no unresolved release blocker, staged invited rollout and beta observation.

Each enabled extension needs its own gates: broker token/consent/reconcile/revoke; paid entitlements and idempotent payment events; screener universe/filter/freshness; chat isolation/retention/budget; event-source correctness. Do not call a placeholder functional merely because a flag or API key exists.

## Delivery Controls

The repository declares a PR checklist and default code ownership. Existing CI job names are `Backend (ruff + pytest + alembic)` and `Frontend (type-check + build)`. Their successful B00 runs are linked from the checkpoint.

Repository rules, required-check enforcement, reviewer availability and any external deployment linkage must be verified before relying on them. B01 adds no server-side enforcement, purchase, hosting account or deployment. B06/B21 own the remaining control verification. Recheck dependency advisories at execution/release time; this summary pins no dated security release as permanently current.

Full local audit material is retained outside the public publication set. Public summaries can be expanded after a separate disclosure and sanitization review; never bulk-stage the private archive.
