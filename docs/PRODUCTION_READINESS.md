# Production Readiness and Release Decisions

Updated: 2026-10-28. **Core-first development approved; no customer/public go-live approved.** [Core release](CORE_RELEASE.md) | [Execution plan](EXECUTION_PLAN.md) | [Checkpoint](EXECUTION_STATUS.md).

This public summary describes capability and acceptance boundaries. It intentionally omits sensitive audit diagnostics, customer data and security reproduction material. A working local feature or passing build is not a production-readiness claim.

## Product Scope Decision

**Current owner-approved order (2026-10-27): working core first, unfinished modules later.** The owner requested a usable main product with placeholders for incomplete parts, then accepted the recommended core-first approach. [CORE_RELEASE.md](CORE_RELEASE.md) defines R1's invited/private uploaded-portfolio journey, deferrals and acceptance. Missing features can be hidden/unavailable; identity, persistence, ingestion correctness and displayed financial values cannot be placeholders.

The earlier 2026-10-19 full-roadmap-before-first-launch decision in [decision #12](https://github.com/dhruvtantia/P-insight-Beta-version/issues/12) is historical and superseded for release ordering, not erased or relabeled as implementation. All its features remain the full-product roadmap. They are no longer prerequisites for the smaller private working-core milestone. A broader public/paid release requires a separately approved scope and applicable safety/operational gates; no purchase, provisioning, customer-data use or go-live is authorized here.

| Decision | Owner input needed | Effect |
|---|---|---|
| Audience and commercial capability | R1 invited/private core; public signup and paid functionality deferred to separately scoped releases | Appropriate access/abuse/customer-operations gates; entitlements before paid use |
| Geography and assets | Supported exchanges, types, currencies and identifiers | Instrument identity, provider coverage and financial domain rules |
| Data claims | Delayed/end-of-day versus licensed intraday; hypothetical versus actual investor performance | Sources, timestamp/quality disclosure and methodology |
| Roadmap integrations | AI, news/events, payments, brokers and screener retained for later modules; providers/specifications remain open | Each integration needs permissions, quotas, customer obligations and acceptance before enablement |
| Extended roadmap semantics | Define US-market assets/currencies, real-time latency, recommendations and advanced/broker analytics | Feed entitlements, instrument/FX model, financial methodology and acceptance fixtures |
| Budget and region | Initial US$120-150/month envelope approved; portfolio data must stay in India; individual service/profile costs and residency evidence still required | [India-only data flow](DATA_RESIDENCY.md), recovery, latency and procurement; old Render/Singapore candidate ineligible |
| Retention and customer lifecycle | Raw-file TTL, export/delete/recovery/support policy | Storage, deletion, backups and operational procedures |

No provider key alone establishes coverage, production use rights or redistribution permission. Confirm contracts, supported symbols, quota, attribution, caching/retention terms and cost before committing to a customer-facing feed. Obtain qualified jurisdiction-specific review where product/advice/data obligations require it; this document is not legal advice.

The India-only requirement applies to uploads, API/worker processing, private
frontend paths, databases, caches/queues, backups and portfolio-bearing logs or
external integrations. A Mumbai database alone is not acceptance. The owner also
requires professional, responsive UI; lower-cost service tiers do not relax
functional, accessibility, correctness or visual/browser acceptance.

## Required-Feature Manifest

This is the **full-product roadmap register**, not R1's enable list or a claim of implementation. R1's requirements/deferrals are in [CORE_RELEASE.md](CORE_RELEASE.md). Split these rows into module-owned issues and require specifications/tests/live evidence before enablement. Reconcile additional legacy promises before claiming the full product complete. A superseded duplicate route need not be resurrected.

| Full-product area | Acceptance before enabling/claiming this area | Main batches |
|---|---|---|
| Public accounts and multi-user portfolios | Signup, verification/login/session/logout/recovery, ownership isolation, portfolio lifecycle and abuse controls; customer export/delete/retention | B02-B09, B18-B19, B21-B23, B25 |
| Upload, refresh and enrichment | Validated CSV/spreadsheet parsing/mapping/review, canonical acceptance, durable jobs, progress/resume/retry/cancel, provenance, bounded providers and revision-safe recovery | B08-B14, B18-B19 |
| Holdings, dashboard and watchlist | Coherent values/P&L/allocation, per-user watchlist, instrument identity, freshness/quality and unavailable states across UI/API | B08-B09, B15, B18-B19 |
| Fundamentals, peers and market context | Covered and permitted sources, normalized financial units, comparable peers, index/sector/movers semantics, timestamps and honest coverage | B13, B15-B16, B19 |
| History, benchmarks and snapshots | Persisted/rebuildable history, benchmark comparisons and immutable revision/as-of snapshots with declared missing-data/adjustment policy | B14-B16, B19 |
| Risk, optimization and simulation | Correct risk/correlation/drawdown/performance methods, constrained optimization and what-if behavior; deterministic examples and accurate labels | B17, B19 |
| AI advisor and portfolio recommendations | Executed provider and validated quality-aware context/output, consent, quotas/cost, evaluation and failure handling; distinguish advice/recommendation claims and hypothetical outputs | B17, B20, B23, B25 |
| Standalone AI chat | Real chat experience, isolated stored conversations, retention/export/delete, streaming/cancel/retry policy, evaluations and budget controls | B20, B25 |
| News and corporate events/calendar | Executed permitted feeds, source attribution, instrument matching, exchange/timezone semantics, dedup/update/cancel and unavailable-versus-empty states | B15, B20, B25 |
| Billing, subscriptions and entitlements | Eligible processor and approved plans; checkout, signed/idempotent events, server-side access, lifecycle reconciliation, cancellation/refund/invoice/support procedures | B07-B09, B21-B23, B25 |
| Zerodha and IBKR broker integrations | Defined supported accounts/assets, approved integration access, consent/callback/token encryption/refresh/revoke, tenant-safe durable sync and position reconciliation | B07-B14, B15, B21, B25 |
| Screener | Defined permitted universe, filters/sorts/pagination, freshness/coverage, plan limits and browser/API acceptance | B08, B15, B19, B25 |
| US-market expansion | Specify supported exchanges/instruments, identifiers, calendars, currency/FX and benchmark/data coverage; reconcile representative multi-market portfolios | B08-B09, B15-B17, B25 |
| Real-time analytics | Define latency/freshness target and required live transport/feeds, source rights, reconnect/backpressure/limits and measured end-to-end behavior; do not relabel daily bars as real-time | B13-B17, B21-B23, B25 |
| Advanced/broker analytics | Define metrics and actual-investor-performance claims; establish transaction/cashflow/lot/corporate-action/FX inputs where required, with independently reviewed examples | B08-B09, B16-B17, B25 |
| Operated customer-ready service | Production services, email/domain/TLS, monitoring, controlled CI promotion, restore/reconciliation, policies, support and measured capacity/cost | B06, B21-B24 |

Specification must clarify tax/lot or other advanced promises; this does not invent a tax product. A disabled flag/stub/key/mock never means a feature passed. It is an honest exclusion for R1's explicitly deferred modules, not permission to exclude an R1 requirement. Temporary data gaps remain explicit states, not invented results.

**Release dependency:** R1 follows C0-C5 in CORE_RELEASE, mapping applicable portions of existing batches without declaring whole batches complete. Early synthetic staging and code-only identity/contracts may proceed alongside unresolved administrative/license decisions; those decisions still block affected use/release. Full-product B24 still requires accepted applicable B02-B23/B20/B25 scope. Deferred modules proceed after shared contracts stabilize. No delivery date is committed.

## Capability Map

| Area | Current implementation | Frameworks/tools | Remaining acceptance |
|---|---|---|---|
| Accounts and portfolios | Authentication scaffolding/signing support, portfolio CRUD/read models | Supabase JS/Auth, PyJWT/cryptography, FastAPI, SQLAlchemy | Full identity/ownership/session/customer lifecycle matrix |
| Upload and enrichment | File parsing, mapping/classification, base holdings and enrichment stages | pandas/openpyxl, Pydantic, Python services/provider adapters | One bounded, transactional, durable and revision-safe lifecycle |
| Holdings and dashboard | Valuation/allocation/read DTOs and charts | FastAPI/Pydantic, React, Recharts | Consistent instrument/price/quality/as-of semantics |
| Fundamentals, peers and market | Provider-backed views and watchlist | Python adapters, HTTPX/yfinance, React hooks | Production-permitted coverage, units, calendars and unavailable states |
| History, snapshots and quant | Stored snapshots/history and numerical analytics | SQLAlchemy, pandas/NumPy/SciPy, scikit-learn | Methodology, observations, constraints, concurrency and reconciliation fixtures |
| Simulation and advisory | Client what-if/rules and incomplete LLM integration | TypeScript/React, Python context/services, Anthropic SDK in current implementation | Required executed advisory, hypothetical labeling, quality-aware context, provider selection/quotas/consent |
| Broker/screener/chat/events/billing roadmap | Mixed disabled scaffolding and roadmap work | Connector/feature interfaces and placeholders; billing provider not selected | Required specifications, real integrations and explicit prelaunch gates |
| Delivery and operations | CI/migrations and local development setup | GitHub Actions, pytest/Ruff, TypeScript/Next.js, Alembic | Operated services, recovery, monitoring, email, support and release acceptance |

Keep the current modular-monolith direction: narrow backend ownership boundaries plus a separately operated durable worker, not a wholesale framework rewrite. Delegate UI through contracts and synthetic component/API states; the backend remains responsible for ownership, persistence, data quality and authoritative calculations.

## Launch Gates

R1 must pass its own [non-placeholder gates](CORE_RELEASE.md#release-gates-that-cannot-be-placeholders). The following register describes broader full-product/public-release acceptance; apply every relevant privacy/correctness/operations gate to R1 rather than requiring every deferred module. No implementation checkbox is completed by the scope decision.

- [x] Owner-approved core-first development order (2026-10-27); full roadmap retained as later modules, earlier decision #12 historical.
- [ ] Bounded specifications for every manifest row, supported assets/geographies/currencies and public data/performance claims approved.
- [ ] All required B20/B25 roadmap paths implemented and accepted; open specifications and vendor blockers resolved before B24.
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
- [ ] Full-product rehearsal, no unresolved release blocker, explicit go-live approval, controlled public/paid rollout and monitored observation.

Every roadmap integration needs its own evidence before enablement: broker consent/reconciliation/revocation, paid entitlements/idempotent events, screener universe/freshness, chat isolation/retention, events and US/FX/real-time correctness. Explicitly deferred modules do not block R1; an incomplete R1 requirement does. Do not call a placeholder functional because a flag or key exists.

## Delivery Controls

The repository declares a PR checklist and default code ownership. Existing CI job names are `Backend (ruff + pytest + alembic)` and `Frontend (type-check + build)`. Their successful B00 runs are linked from the checkpoint.

Repository rules, required-check enforcement, reviewer availability and any external deployment linkage must be verified before relying on them. B01 adds no server-side enforcement, purchase, hosting account or deployment. B06/B21 own the remaining control verification. Recheck dependency advisories at execution/release time; this summary pins no dated security release as permanently current.

Full local audit material is retained outside the public publication set. Public summaries can be expanded after a separate disclosure and sanitization review; never bulk-stage the private archive.
