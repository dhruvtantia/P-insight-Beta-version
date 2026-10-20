# Production Readiness and Release Decisions

Updated: 2026-10-19. **Not approved for a customer-facing production launch.** [Execution plan](EXECUTION_PLAN.md) | [Checkpoint](EXECUTION_STATUS.md).

This public summary describes capability and acceptance boundaries. It intentionally omits sensitive audit diagnostics, customer data and security reproduction material. A working local feature or passing build is not a production-readiness claim.

## Product Scope Decision

**Owner-approved breadth (2026-10-19): "Full roadmap required at launch"**, recorded in [decision #12](https://github.com/dhruvtantia/P-insight-Beta-version/issues/12). The earlier invite-only uploaded-INR beta proposal is superseded. Public signup, paid functionality and the extended roadmap are first-launch prerequisites, not subsequent releases.

This approves feature breadth, not readiness, a delivery date, a vendor purchase or go-live. Controlled staging and invited rehearsals can precede launch but do not fulfill this scope. Every requirement below needs a bounded specification and evidence; unresolved details are blockers, not permission to omit functionality. Any later deferral needs a new explicit owner-approved scope change.

| Decision | Owner input needed | Effect |
|---|---|---|
| Audience and commercial capability | Public signup and paid functionality required; exact plans, eligibility and rollout procedure remain open | Abuse/capacity/entitlement/customer-operations gates |
| Geography and assets | Supported exchanges, types, currencies and identifiers | Instrument identity, provider coverage and financial domain rules |
| Data claims | Delayed/end-of-day versus licensed intraday; hypothetical versus actual investor performance | Sources, timestamp/quality disclosure and methodology |
| Required integrations | AI, news/events, payments, brokers and screener included; providers and detailed specifications remain open | Integrations, permissions, quotas, customer obligations and acceptance |
| Extended roadmap semantics | Define US-market assets/currencies, real-time latency, recommendations and advanced/broker analytics | Feed entitlements, instrument/FX model, financial methodology and acceptance fixtures |
| Budget and region | Staging/production allowance and permitted data regions | Service plans, recovery, latency and procurement |
| Retention and customer lifecycle | Raw-file TTL, export/delete/recovery/support policy | Storage, deletion, backups and operational procedures |

No provider key alone establishes coverage, production use rights or redistribution permission. Confirm contracts, supported symbols, quota, attribution, caching/retention terms and cost before committing to a customer-facing feed. Obtain qualified jurisdiction-specific review where product/advice/data obligations require it; this document is not legal advice.

## Required-Feature Manifest

This consolidates the audited feature areas and existing README/monetization promises; it is not a claim that they work today. Split these rows into delivery issues with module owners, specifications, tests and live evidence. Reconcile any additional legacy promise before declaring scope complete; do not infer that an unlisted promise was waived. A superseded duplicate route is not a requirement to resurrect obsolete implementations.

| Required area | Acceptance before first launch | Main batches |
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

Specification must clarify whether tax/lot reporting or other detailed advanced metrics are promised; this decision does not invent a jurisdiction-specific tax product. No required feature may pass merely through a disabled flag, stub, API key or mock. Temporary data gaps remain legitimate explicit states after the feature itself is accepted.

**Release dependency:** retain B02-B23 engineering order, complete all required B20 and B25 integration acceptance, then run B24 full-product rehearsal/go-no-go/launch. B25 can be split and developed alongside later batches after its prerequisite contracts; its number does not put it after launch. Re-estimate effort, procurement lead times, cost and critical path after specifications/provider eligibility. Earlier beta-only estimates are not a full-roadmap schedule, and no new date is committed here.

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

All implementation and operational gates below need dated evidence. Only the owner's feature-breadth decision is complete here.

- [x] Owner-approved first-launch feature breadth: full roadmap, decision #12 (2026-10-19).
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

Every required roadmap integration needs its own evidence: broker token/consent/reconcile/revoke; paid entitlements and idempotent payment events; screener universe/filter/freshness; chat isolation/retention/budget; event-source correctness; US-market/FX coverage and measured real-time behavior. A disabled required feature blocks first launch unless the owner explicitly approves a later scope change. Do not call a placeholder functional merely because a flag or API key exists.

## Delivery Controls

The repository declares a PR checklist and default code ownership. Existing CI job names are `Backend (ruff + pytest + alembic)` and `Frontend (type-check + build)`. Their successful B00 runs are linked from the checkpoint.

Repository rules, required-check enforcement, reviewer availability and any external deployment linkage must be verified before relying on them. B01 adds no server-side enforcement, purchase, hosting account or deployment. B06/B21 own the remaining control verification. Recheck dependency advisories at execution/release time; this summary pins no dated security release as permanently current.

Full local audit material is retained outside the public publication set. Public summaries can be expanded after a separate disclosure and sanitization review; never bulk-stage the private archive.
