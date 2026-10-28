# Core-First Working Release

Approved direction: 2026-10-27. The owner asked for a working main product with
unfinished features developed separately, then accepted the recommended
core-first approach. This supersedes the earlier requirement to finish the full
roadmap before the first usable milestone. It does not approve public go-live,
spending, service provisioning, provider contracts or real customer-data use.
Current acceptance/delivery evidence belongs to
[issue #26](https://github.com/dhruvtantia/P-insight-Beta-version/issues/26).

The full roadmap remains the destination. [Production readiness](PRODUCTION_READINESS.md)
retains its feature register; [the execution plan](EXECUTION_PLAN.md) retains B00-B25
and original task traceability. This file owns the smaller release boundary and
its ordered acceptance milestones, not a competing volatile delivery tracker.

## First Usable Journey

`invited sign-in -> upload -> review -> confirm -> durable processing -> correct
holdings/basic summaries -> refresh/switch safely -> return later to saved data`

R1 is an invited, private working core, not unrestricted public signup or a paid
product. Initial data scope is uploaded INR Indian-equity/ETF portfolios, with
explicit exchange/instrument mapping. CSV and XLSX are the target inputs; neither
format is accepted until its fixtures pass. Legacy XLS, other assets, US/FX,
transactions/cashflow returns and real-time claims are outside R1. Reject unsupported
inputs explicitly; do not silently convert currency or guess identifiers.

| R1 requirement | Acceptance, not merely a screen or setting |
|---|---|
| Invited accounts | Controlled onboarding/login/logout/recovery, correct signing/claims, per-owner records/files/jobs, old-session response rejection; two-user tests |
| Upload review | Current mapping regenerates preview; finite bounded numbers; duplicate/header/instrument rules; row-level errors and deterministic counts |
| Saved holdings | Idempotent accepted revision; source binding; portfolio create/list/switch/rename/delete lifecycle; reload does not lose data |
| Enrichment | Separately run durable worker; persisted stages/retries; honest unavailable/partial/failed states; restart recovery and bounded provider calls |
| Refresh/progress | Same command/lifecycle as first import; old jobs cannot publish to new revisions; processing survives navigation; retry/cancel/supersession semantics |
| Basic dashboard | Verified quantities/cost/value/allocation and explicitly defined unrealized P&L only where inputs support it; correct units/currency/as-of/source; no invented prices |
| Browser experience | Correct owner/portfolio/revision after upload, refresh, switch, logout and slow responses; usable desktop/mobile input/table/error states |
| Operated private service | External URL with invitation/access restrictions; managed DB/private files; monitoring, tested restore/rollback, retention/export/delete/support and a controlled release |

An uploaded valuation is not a live quote. Missing prices must remain missing;
partial coverage cannot appear to be a complete total. Basic P&L is not an
investor's time-weighted/money-weighted return. Validate those meanings before
displaying them. Market data may only be enabled with suitable rights, tested
coverage, quotas and timestamps; no key or SDK alone satisfies that gate.

## Deferred Modules

R1 does not require paid plans, broker sync (Zerodha/IBKR), standalone chat,
screeners, AI recommendations/advisor, news/events, public market dashboards,
peer/fundamental research, historical benchmark/return charts, optimization,
simulation or advanced risk analytics. Watchlist is also outside the critical
R1 path. Keep these in the full roadmap rather than claiming they are complete.

Hide unfinished routes or show a clearly unavailable/coming-later state. No
placeholder may fabricate quotes, risk/performance numbers, broker connection,
job success or payment status. Backend operations must reject unavailable
features independently of navigation. A direct URL must not bypass the boundary.
Known flawed calculations stay disabled until their own acceptance; a disclaimer
does not make wrong numbers acceptable.

## Modular Ownership

Keep Next.js/React + FastAPI/SQLAlchemy and a modular monolith with a separately
operated worker. Do not create one microservice per feature or replace working
frameworks. Each module owns its commands/queries, persistence and failure states.

Identity owns sessions/access; import owns source/preview/acceptance; jobs own
durable execution; observations own provider normalization; portfolio queries
own revision-scoped display data. Optional features call those boundaries rather
than importing private helpers or changing the upload workflow directly.

The UI consumes versioned API/generated types and synthetic states. UI-only
contributors do not implement authoritative financial logic, access control or
provider credentials. Enabling a completed module requires its own tests plus
the unchanged R1 browser journey; flags support isolation/rollback, not approval.

Existing feature switches are a starting mechanism, not proof of complete UI/API
isolation. Audit direct routes, dependent jobs and stores when enabling each one.
The API bootstrap template intentionally disables **all** product features;
it is not an R1-enable profile or evidence that a user journey already works.

## Execution Milestones

| Order | Owned work / existing batches | Proof before moving to the next acceptance level |
|---|---|---|
| C0: release boundary | This decision, feature deferrals, provider fit and non-provisioning staging setup | Reviewed plan/template tests and GitHub delivery; no actual deployment claimed |
| C1: private staging skeleton | Early subset of B21/B22, with applicable B06 controls | Approved budget/regions/accounts; exact runtime compatibility; isolated empty/synthetic DB; controlled migrations; access-restricted frontend/API health; documented URL/revision and logs |
| C2: identity and data foundation | B07/B08 and the revision/transaction portion of B09 | Issuer/required claims/session/owner/file/job matrix, generated API agreement, PostgreSQL ownership/revision invariants and migration tests |
| C3: reliable import/enrichment | B10-B14, required B15 observation semantics | One parse/review/import/refresh command; private sources; durable job/outbox/worker; idempotency; bounded providers; interruption/retry/supersession tests |
| C4: trustworthy core browser | Core B15/B17 correctness and B18/B19 | Independently checked basic totals/units; session/portfolio/revision-scoped queries; no stale responses; desktop/mobile end-to-end journey |
| C5: private working release | Core subset of B21-B24, not full-batch completion | External two-user journey, restart/outage/recovery/restore/rollback drills, email and support, privacy/license/data decisions for actual use, owner release approval |
| C6: attach roadmap modules | Deferred B16/B17/B20/B25 and remaining operations | Module-specific specifications/rights/acceptance plus R1 regression before enablement; broader public/paid release gets its own rehearsal/go-no-go |

C1 uses synthetic data only and can be prepared alongside identity/contracts.
It must not accept customer uploads before C2-C4 and applicable release gates.
C2/C3 code work may progress while owner-admin setup and legal/commercial
decisions proceed in parallel; this is not completion or waiver of B06. Unresolved
access/security or artifact/data rights still block the affected use and release.
Existing safety work is retained, not reopened wholesale. B00-B25 identifiers
remain stable; finishing a core subset never marks a whole batch complete.

## Hosting Choice And Limits

Preferred architecture: Vercel frontend; Render FastAPI API and later an actual
durable worker; Supabase PostgreSQL/Auth/private storage. This reduces custom
infrastructure while retaining backend/domain ownership. Budget, region, account
access and service/runtime compatibility still require verification. See the
[staging setup](../deploy/staging/README.md).

Vercel controls Node minor/patch updates; this repository currently requires an
exact Node patch. Verify the actual build/runtime before applying project
settings. Never relax the engine gate to get a green deploy. If exact-patch
compatibility cannot be achieved, bring back a reviewed deployment-specific
runtime policy or container-hosted frontend alternative. Do not silently switch
the application framework or treat provider fit as already proven.

No account, service, bucket, domain or paid plan is created by this change.
There is no automatic deployment or migration. Redis/queue/worker and private
storage adapters are not implemented merely by naming them here. Existing local
Compose Redis is an optional local service, not proof a durable worker uses it.

## Release Gates That Cannot Be Placeholders

- Correct login/access and private owner/session/portfolio/revision isolation.
- Strict ingestion and genuine persistence; no lost or double-accepted imports.
- Durable processing, terminal status truth and stale-job write prevention.
- Correct displayed values, provenance/coverage and unavailable data handling.
- Applicable package/component notices, rights and approved data-provider use.
- Exact tested deployment revision, required checks, redacted monitoring,
  recovery/retention/customer lifecycle and accountable operator.
- Real external acceptance and explicit approval before invited real-data use;
  separate approval and appropriate controls for broader public/paid availability.

## Immediate Next Work

1. C0 is accepted via PR #27; issue #26 owns delivery evidence. Resolve owner
   budget/region/account inputs without posting credentials in GitHub/chat.
   Verify Vercel/runtime fit before relying on it.
2. Prepare C1's protected synthetic-only environment and start C2 identity
   contracts; keep PR #25's artifact evidence separate and refresh it against
   current main before any separately authorized delivery.
3. Turn the upload audit's core reproductions into ordinary regression tests
   while implementing C2/C3. Prefer one working end-to-end flow over broad polish
   or extra general-purpose tooling.

No delivery date is promised. Estimate from the first hosted flow, demonstrated
acceptance and remaining integration decisions, not test counts or batch numbers.
