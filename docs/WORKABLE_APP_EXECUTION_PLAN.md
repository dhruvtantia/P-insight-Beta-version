# P-Insight: Executable Plan From Current State To A Workable Product

**Status:** planned, based on repository main `03b113a3d9e2053684998a294067efb95e6ec23b` and the live GitHub state checked on 2026-11-18.

**Purpose:** turn the current codebase into a usable local application first, then into a private India-only operated release, and finally into the broader product roadmap. This is an execution plan, not a claim that the unfinished stages are already complete.

**Important open baseline item:** PR #31 (`fix: remove build and dependency security blockers`) is open and not merged. Its head is `f9ab34b4cce98c4448413579632047d6d33ee8d3`. Its reported verification is useful evidence, but it is not part of main until GitHub checks and an authorised merge are complete.

## 1. The Short Version

Build one small, dependable product spine before building the large feature set:

```text
local developer setup
  -> local database and local identity adapter
  -> portfolio and revision data model
  -> upload parse and review
  -> atomic import
  -> durable enrichment job and worker
  -> correct portfolio read model
  -> browser upload-to-dashboard journey
  -> fault, restart, ownership and mobile tests
  -> synthetic local release gate
  -> India-only staging design and provider selection
  -> private hosted release
  -> one deferred module at a time
```

The first real target is **Local Working Core (LWC)**. It is complete only when a clean checkout can run the full invited-user-shaped journey with synthetic identities and local services, including an upload that survives restart and can be safely refreshed. It is not complete merely because `/upload` returns 200 or because the dashboard has sample data.

The recommended architecture is a **modular monolith with a separately operated worker**:

- Next.js and React remain the presentation layer.
- FastAPI remains the API and application layer.
- SQLAlchemy and Alembic remain the persistence layer.
- PostgreSQL is the target local acceptance database; SQLite remains useful for unit tests and demos.
- A durable queue/outbox and worker own enrichment execution.
- Providers are adapters behind explicit contracts.
- Feature flags hide modules that are not accepted.
- Generated API types and fixtures are the handoff between backend and frontend.

Do not split into one microservice per screen. That would add deployment, tracing, authentication and data-consistency work before the core journey is reliable.

## 2. Current State: What Exists And What It Means

### 2.1 Verified strengths

| Area | Evidence in the repository | Meaning |
|---|---|---|
| Backend framework | `backend/app/main.py`, FastAPI routers, SQLAlchemy models, Alembic | A usable server foundation exists. |
| Frontend framework | `frontend/src/app`, Next.js App Router, TypeScript, Tailwind, Zustand, Recharts, Lucide | There is a substantial UI shell and many feature screens. |
| Core upload path | `upload.py`, `upload_v2_service.py`, parser, normalizer, row classification | CSV/XLSX parsing, mapping, validation and base persistence are implemented as a prototype path. |
| Enrichment records | Holding fields for status, source, timestamp and failure reason | The database has useful observability fields, but the job lifecycle is not yet durable enough. |
| Portfolio reads | `/portfolio/full`, summary, sectors and management routes | A dashboard data contract exists. |
| Feature registry | `feature_registry.py`, system feature route, frontend registry hook | Features can be disabled centrally, but every route and page still needs boundary verification. |
| Auth boundary | `backend/app/core/auth.py`, user model, owner-scoped queries | The code has an identity direction, but real provider integration and complete isolation proof remain open. |
| Local proof | Previous synthetic CSV proof: parse, import, enrichment, portfolio bundle and frontend HTTP checks | The happy path works locally under controlled conditions. It does not prove restart, concurrency, hosted operation or real-user privacy. |
| Test baseline | Fresh lock-matched backend environment reported 639 passing tests; frontend type-check, lint and build passed in a disposable environment | The code is testable. The tests do not yet cover the full durable-worker contract. |

### 2.2 Current blockers to calling it a working product

1. The V2 path schedules FastAPI `BackgroundTasks` work inside the API process. A process restart can lose the work, and scheduling failure is not a durable failure record.
2. Holdings are currently addressed primarily by portfolio and ticker, not by an immutable accepted revision. An older enrichment result can publish after a newer refresh unless revision fencing is added.
3. A single portfolio-level status does not represent all required stages such as enrichment, price, fundamentals, history and quant pre-warm.
4. Upload source files are written to local filesystem paths. This is fine for a controlled demo, but not a multi-instance private storage design.
5. The UI has many routes, but several are roadmap screens or scaffolded integrations. A visible route is not evidence that the feature is complete.
6. Real Supabase/auth, India-only hosting, private storage, email, monitoring, backup/restore and provider rights are not yet proven for this project.
7. Current main is not the same thing as a hosted release. GitHub protection and CI evidence must be checked for each accepted change.

### 2.3 Scope of the first workable version

The first version must support:

- private or local test sign-in with a clearly labelled local adapter;
- one owner seeing only their own portfolios, holdings, files and jobs;
- uploaded INR Indian-equity/ETF CSV and XLSX files;
- parse, mapping, preview, row errors and warnings;
- atomic accepted revisions and repeat-safe imports;
- durable enrichment with truthful progress, retries, failure and restart recovery;
- holdings, basic totals and allocation with currency, source and as-of metadata;
- portfolio create, list, rename, activate, refresh and delete semantics;
- browser reload, slow network, logout and mobile layouts;
- deterministic synthetic fixtures and a repeatable local acceptance script.

It must not pretend to provide live prices, time-weighted returns, broker sync, AI advice, news, public signup, billing, US/FX support or advanced analytics until those modules have their own contracts and evidence.

## 3. Definition Of Done For The Local Working Core

The LWC gate is a checklist, not a feeling. All items below must pass on a fresh checkout in a disposable environment:

### Runtime

- `make` or documented commands start API, frontend, database, queue and worker locally.
- Configuration fails clearly when a required setting is missing.
- Migrations run from an empty PostgreSQL database and from a database containing the prior schema.
- API and worker can be started separately and restarted independently.
- No test relies on the developer's home directory, hidden credentials or a previously populated database.

### Data and ownership

- Two synthetic users can import the same ticker and cannot read or mutate each other's records.
- Every portfolio, source file, revision, job, outbox item, holding observation and snapshot has an owner or an explicitly public classification.
- Delete/export behavior is specified and tested before any real data is used.

### Upload and enrichment

- CSV and XLSX fixtures pass the same mapping and validation contract.
- Invalid rows are rejected with bounded, useful reasons; accepted rows are never silently changed.
- Duplicate confirmation is idempotent when the same request key and source digest are repeated.
- A new import creates a new accepted revision without destroying the prior accepted revision.
- A worker restart resumes or safely retries work.
- An older worker result cannot overwrite a newer revision.
- Provider timeout, rate limit, malformed response and missing symbol produce honest per-stage outcomes.
- A terminal job is terminal for a reason: succeeded, partial, failed, cancelled or superseded.

### Browser

- A user can sign in, upload, review, confirm, see progress, reach the dashboard, refresh, switch portfolios, reload the browser and return to saved data.
- No page shows a complete total when a required price is missing.
- Error, empty, loading, partial and retry states exist for every core request.
- The same journey works at desktop and mobile viewport sizes.

### Evidence

- Backend tests, frontend checks, browser tests, fault-injection tests and a short evidence report are attached to the GitHub issue.
- The tested commit is known, CI is green, and the local checkout is fast-forwarded only after merge.

## 4. Target Module Map

Each module below owns a small number of responsibilities. The rule is simple: a module may use another module's public contract, but it may not reach into its private tables, provider clients or UI state.

| Module | Owns | Exposes | Must not own |
|---|---|---|---|
| M0 Feedback loop | acceptance commands, fixtures, evidence, status files | repeatable checks and reports | product behavior |
| M1 Runtime/config | settings, startup checks, dependency versions | typed config and health checks | feature decisions |
| M2 Identity | sessions, claims, user provisioning, access policy | current user, authorization decisions | portfolio calculations |
| M3 Portfolio | portfolio lifecycle and active selection | portfolio commands and metadata | provider enrichment |
| M4 Revision/source | source digest, immutable accepted revision, source metadata | revision IDs and read scope | UI polling logic |
| M5 Import | file limits, parsing, mapping, validation, row classification | preview and import command | direct provider calls |
| M6 Jobs/outbox | durable work requests, lease, retry, cancel, supersede | job receipt, status and commands | financial calculations |
| M7 Worker | stage execution and bounded concurrency | stage outcomes and metrics | HTTP request lifecycle |
| M8 Observations/providers | prices, names, sectors, fundamentals, peers and provenance | normalized observations | ownership rules |
| M9 Portfolio read model | verified holdings and summaries | dashboard bundle and quality metadata | writing provider data without revision checks |
| M10 Frontend shell | navigation, auth boundary, feature visibility, common states | screen composition and typed API calls | authority over financial truth |
| M11 Analytics | risk, history, snapshots, valuation and later methods | labelled computations with methodology | changing imported source rows |
| M12 Optional product modules | watchlist, news, AI, broker, screener, optimization, billing | isolated feature contracts | bypassing M2-M9 |
| M13 Operations | deploy, secrets, data residency, backups, alerts, support | release evidence and runbooks | hidden manual production fixes |

### Connection rule

The core connection should look like this:

```text
Identity -> Portfolio -> Revision/Source -> Import -> Job/Outbox
                                              -> Worker -> Providers
                                              -> Read Model -> API DTOs -> Frontend
```

The frontend never calls a provider directly. The dashboard never reads an unscoped table. The worker never writes a row without checking the revision token. The UI never converts `missing` into zero and never treats `partial` as `complete`.

## 5. The Feedback Loop Codex Must Use For Every Feature

Every feature is built as a short loop. The loop is repeated until its exit criteria pass, then the feature is attached through its public contract.

### Loop steps

1. **State the contract.** Write the user action, input, output, error states, ownership rule, persistence rule and non-goals in `docs/features/<feature-id>.md`.
2. **Record the baseline.** Capture the base SHA, current tests, current feature flag, known failures and allowed files.
3. **Write failing acceptance tests.** Start with one API test, one persistence or domain test, and one browser or contract test where applicable.
4. **Implement the smallest vertical slice.** Change one module boundary at a time. Do not mix a redesign with a data-model migration unless the migration is part of the contract.
5. **Run focused checks.** Run the smallest relevant test command after each meaningful change.
6. **Run cross-module checks.** Regenerate API types if needed, run the core journey, and check the feature flag disabled path.
7. **Inject failure.** Test timeout, malformed input, restart, duplicate request, missing dependency and unauthorized access as relevant.
8. **Inspect the result.** Compare stored rows, API response, logs and rendered UI. The machine must inspect both success and error states.
9. **Self-review.** Check changed files for ownership leaks, new direct provider calls, unbounded retries, secrets, stale generated files and accidental route enablement.
10. **Collect evidence.** Save redacted logs, test output, screenshots and the exact commit in the issue or PR.
11. **Open a PR.** CI and review must pass before merge. A plan or code change is not accepted because local tests passed alone.
12. **Attach.** Merge only with authorization, verify post-merge CI, then re-run the unchanged core journey on the merged SHA.

### Loop limits

- One loop should have one clear objective.
- Use at most three repair iterations before stopping and writing the actual blocker.
- Stop automatically when the product contract is ambiguous, the data rights are unknown, a secret is needed, a paid service would be created, or a real customer record would be touched.
- Codex may implement, test and prepare a PR. It must not silently merge, deploy, spend money, change DNS, rotate credentials or enable a feature for real users.

### Required feature record

Every feature record must include:

```text
Feature ID and owner:
User-visible outcome:
Current status:
Dependencies:
Backend contract:
Frontend contract:
Data model and migration:
Failure states:
Security/ownership rules:
Test fixtures:
Feedback-loop commands:
Evidence location:
Exit criteria:
Attachment plan:
```

## 6. Chronological Build Plan

### W0 - Freeze the baseline and make progress visible

**Goal:** make every later change traceable.

Tasks:

1. Verify local `main`, GitHub `main`, open PRs and untracked files. Preserve the existing untracked artifacts.
2. Resolve PR #31 through the normal GitHub review/check process before treating the dependency/build baseline as accepted.
3. Add a single status table to the execution issue with one row per module and one of: `NOT_STARTED`, `BUILDING`, `BLOCKED`, `LOCAL_VERIFIED`, `CI_VERIFIED`, `STAGING_VERIFIED`, `RELEASE_ACCEPTED`.
4. Create `docs/features/` records for M2-M10 and later roadmap modules. Keep the documents short and link them to one issue each.
5. Add a `scripts/check_workable_core.sh` or equivalent documented command that runs the complete local gate.
6. Define the clean checkout contract: exact Node/pnpm/Python versions, PostgreSQL version, optional Redis/queue version, migration command and seed command.

Exit criteria:

- The baseline SHA is recorded.
- A new contributor can see one next action without reading every historical document.
- The full test command produces a timestamped, redacted report.

### W1 - Make local services reproducible

**Goal:** run the real architecture locally before any hosted service is selected.

Tasks:

1. Extend `docker-compose.dev.yml` with a local PostgreSQL service, health checks, persistent-but-disposable volumes and separate API/worker process commands.
2. Keep Redis only if the selected queue implementation actually uses it. Do not call Redis a durable queue until recovery tests prove it.
3. Add an explicit `.env.example` split for API, worker, database, frontend and local auth. Never use a production key in local tests.
4. Add startup validation for database connectivity, migration state, queue connectivity and allowed data region.
5. Add a deterministic seed command that creates two synthetic users and a small INR fixture only.
6. Add a teardown/reset command that targets only the named disposable environment.

Exit criteria:

- Empty PostgreSQL database migrates successfully.
- API and worker start independently.
- A clean machine can run the health and seed checks with documented commands.

### W2 - Finish identity and tenancy for local use

**Goal:** test the privacy boundary before building more screens.

Tasks:

1. Keep Supabase JWT verification behind an identity adapter, but add a deterministic local identity adapter for tests and local development.
2. Define the user identity matrix: valid token, expired token, wrong issuer, wrong audience, missing subject, disabled user, auth-disabled local mode and cross-user ID attempts.
3. Make user provisioning race-safe with a unique external subject and an explicit transaction.
4. Require ownership on every core read and mutation. Audit portfolio, holding, snapshot, watchlist, upload status and job status routes.
5. Make auth-disabled mode impossible in staging/production configuration.
6. Add an account lifecycle boundary now: logout/session rejection, export request, delete request and recovery hooks, even if email delivery is deferred.

Exit criteria:

- Two synthetic users pass the complete isolation suite.
- Direct URLs and guessed IDs cannot cross the ownership boundary.
- The local adapter cannot be mistaken for production authentication in UI copy or logs.

### W3 - Introduce immutable portfolio revisions

**Goal:** give every accepted import an edition number so old work cannot overwrite new work.

Add these concepts, with names chosen consistently in code:

- `Portfolio` remains the stable container.
- `PortfolioRevision` represents one accepted source state.
- `SourceObject` represents the uploaded file metadata and digest; raw bytes are behind a storage adapter.
- `HoldingRevision` represents a holding within a revision, or an equivalent revision-scoped relation.
- `Job` represents one durable workflow for one revision.
- `JobStage` represents parse/accept/enrich/price/fundamentals/history or other required stages.
- `OutboxEvent` represents work that must be dispatched after the acceptance transaction.

Tasks:

1. Write the state transitions before writing models.
2. Add unique constraints for portfolio/revision numbers, source digest/idempotency key and stage identity.
3. Add repository methods that always require `user_id` and `revision_id`.
4. Add migration tests from current main schema and from an empty schema.
5. Preserve old accepted data until the new revision is accepted and readable.
6. Replace the timestamp surrogate used by computation cache identity with persisted revision identity when the revision is available.

Exit criteria:

- Two imports create two revisions.
- Reads can request the active revision explicitly.
- A failed new revision does not destroy the last accepted revision.

### W4 - Harden import as a standalone module

**Goal:** make upload a reliable command, not a collection of endpoint helpers.

Tasks:

1. Put file size, row count, sheet count, cell count, encoding and decompression limits in configuration.
2. Define the supported CSV/XLSX contract: required fields, optional fields, date grammar, decimal grammar, currency, asset class, exchange/ticker/ISIN policy and duplicate policy.
3. Make parsing pure where possible: bytes plus contract in, preview/classification out.
4. Ensure preview and confirm use the same parser and mapping validator.
5. Return a bounded list of row-level errors and warnings, plus counts and a stable source digest.
6. Require an idempotency key on confirm. Repeat requests must return the original accepted result or a safe conflict, not create a second active portfolio silently.
7. Store canonical data as a revision-owned private source object, not a shared `portfolio_uploaded.csv` compatibility file.
8. Preserve legacy endpoints only as explicit compatibility wrappers; all new UI calls use one canonical command.

Exit criteria:

- CSV and XLSX golden fixtures have identical canonical output.
- Malformed, oversized, ambiguous, duplicate and unsupported files fail predictably.
- Confirming the same request twice is safe.

### W5 - Replace process-local background work with durable jobs

**Goal:** make enrichment survive API restarts and become observable.

Tasks:

1. Choose one queue implementation compatible with the local and eventual India-hosted runtime. Keep the worker interface independent of the queue library.
2. In the same database transaction as revision acceptance, create the job and outbox row.
3. Add a dispatcher that can replay unsent outbox rows safely.
4. Add worker leases, heartbeat/expiry, attempt count, backoff, max attempts, cancellation and superseded states.
5. Define stage states: `queued`, `running`, `retrying`, `succeeded`, `partial`, `failed`, `cancelled`, `superseded`.
6. Make each stage idempotent. A duplicate delivery must not duplicate observations or history rows.
7. Check `revision_id` and job state before every write. A superseded job must not publish to the active revision.
8. Add a sweeper for expired leases and abandoned outbox rows.
9. Make status response include job ID, revision ID, stage counts, timestamps, attempt counts and safe reason codes.
10. Move all provider/network work out of request handlers and out of `BackgroundTasks`.

Exit criteria:

- Kill API after commit but before dispatch: the outbox replay completes the job.
- Kill worker during every stage: lease expiry and retry complete or reach an honest terminal state.
- Deliver a job twice: final data is unchanged.
- Start a second refresh: the first job becomes superseded and cannot overwrite the second revision.

### W6 - Normalize providers and make data quality visible

**Goal:** ensure numbers have meaning and missing data is not disguised.

Tasks:

1. Define provider adapter interfaces for instrument resolution, name/sector, price, fundamentals, peers and history.
2. Keep provider-specific names, raw payloads and credentials inside adapters.
3. Normalize every observation to ticker, value, currency, unit, as-of time, source, coverage and quality state.
4. Add timeout, retry, rate-limit and concurrency budgets per provider.
5. Store `missing`, `stale`, `provider_failed`, `unsupported` and `uploaded_current_price` distinctly.
6. Refuse to calculate a total that requires missing values unless the API explicitly returns a partial total and coverage metadata.
7. Make the local provider deterministic for acceptance tests. Keep yfinance or other external providers in integration tests only.
8. Record provider rights and retention assumptions before enabling a customer-facing feed.

Exit criteria:

- Synthetic provider failures produce stable API responses and UI states.
- Every displayed price has source, timestamp, currency and status.
- No fallback silently changes currency or turns an unavailable price into zero.

### W7 - Build the core read model and calculations

**Goal:** give the UI one trustworthy data bundle.

Tasks:

1. Add an owner/revision-scoped portfolio read service.
2. Compute quantity, cost, available valuation, coverage and allocation from accepted revision data.
3. Define what unrealized P&L means and display it only when current-price inputs support it.
4. Make all totals deterministic with fixed decimal/rounding rules and tests.
5. Add as-of timestamps and provenance to dashboard, holdings and sector responses.
6. Keep history, risk and quant out of the R1 bundle until their methodology and data availability contracts pass.
7. Add a consistency check: dashboard total equals the sum of displayed holdings for the same revision and coverage policy.

Exit criteria:

- Fixed fixtures produce expected totals and allocation.
- Partial price coverage is visible and mathematically consistent.
- A revision-scoped read cannot see a different user's or different revision's rows.

### W8 - Make the core browser experience real

**Goal:** connect existing UI components to the canonical contracts.

Tasks:

1. Keep `frontend/src/services/api.ts` as the only transport boundary; regenerate types from the accepted OpenAPI contract.
2. Create core page states: auth, portfolio empty, upload, mapping, preview, confirm, progress, success, partial, failed, retry, stale session and unavailable feature.
3. Make the upload wizard preserve the revision/job IDs through navigation and browser reload.
4. Poll the durable job status with backoff and stop on terminal state; do not use a fixed "looks done" timer.
5. Remove or hide deferred sidebar routes and direct pages using the feature registry. A direct URL must receive an honest unavailable response.
6. Ensure dashboard, holdings and portfolio switcher all use the same active portfolio/revision source.
7. Add accessible labels, keyboard operation, focus handling, table overflow and mobile layouts.
8. Use synthetic API fixtures so UI work can proceed without provider keys.

Exit criteria:

- Playwright completes upload, review, confirm, progress, dashboard, switch, refresh and logout.
- Browser refresh during processing resumes from the server's job state.
- Mobile screenshot and accessibility checks pass for upload and holdings.

### W9 - Run the local working-core release rehearsal

**Goal:** prove the application is usable before outside deployment services are considered.

Tasks:

1. Start the full local stack from a clean checkout.
2. Run migrations and seed two synthetic users.
3. Execute the golden CSV and XLSX journeys.
4. Run the fault matrix: API restart, worker restart, queue outage, provider timeout, provider partial failure, duplicate confirm, refresh race, delete during job, logout during job and malformed upload.
5. Inspect database state, API responses, logs and browser screenshots.
6. Run backend tests, frontend type-check, lint, production build, dependency checks and browser tests.
7. Produce `docs/evidence/lwc-<date>/README.md` with the exact SHA, commands, environment versions, results and known limits.
8. Mark LWC accepted only through a reviewed PR and issue checklist.

This is the first point at which it is reasonable to say: "there is a usable version to show." It is still not a public or real-data release.

## 7. India-Only Staging After The Local Gate

Only after LWC passes should outside services be selected. The data requirement is stronger than "the database is in Mumbai." The complete flow must be checked:

```text
browser -> frontend -> API -> database
                         -> private source storage
                         -> queue
                         -> worker
                         -> market/data providers
                         -> logs, backups, alerts and support tools
```

For each component, record country/region, subprocessors, backups, logs, support access, encryption, retention, egress and contract terms. The previous Singapore/Render candidate is not eligible for portfolio data.

### Staging sequence

1. Produce an itemized India-region architecture and cost review within the approved US$120-150 planning envelope. Do not provision automatically.
2. Choose the hosting profile only after region, data flow and runtime compatibility are documented.
3. Create separate staging accounts/projects with least privilege and billing alerts.
4. Provision private database, private object storage, queue, worker, API and frontend independently.
5. Apply migrations through a controlled release job, never from an arbitrary web process.
6. Configure real identity/email only after the auth claims and recovery flows are tested.
7. Upload synthetic data first and confirm that logs, backups and provider paths stay within the approved boundary.
8. Run the same LWC browser and fault suite against staging.
9. Test backup restore, rollback, worker redeploy, expired lease recovery, alert delivery and access revocation.
10. Obtain explicit release approval before inviting real users.

## 8. Full Roadmap After The Working Core

Each row becomes a separate module issue and feedback loop. It is attached only after its contract passes and the unchanged core journey remains green.

### R1: Core private portfolio product

- identity and recovery;
- portfolio lifecycle;
- CSV/XLSX upload and refresh;
- durable enrichment and source quality;
- holdings, dashboard and allocation;
- basic snapshots and changes only if their data contract is accepted;
- export/delete and support controls;
- private staging and controlled invited release.

### R2: Watchlist and market views

Build watchlist and market modules on the provider/observation contract. Define quote freshness, rights, rate limits, empty versus unavailable states and per-user ownership. Keep them disabled until the provider contract and quota tests pass.

### R3: Fundamentals and peer research

Define metric methodology, fiscal period, currency and source. Add observation timestamps and comparable-company rules. Test provider gaps and stale values. Never present scaffold data as research.

### R4: History, snapshots and changes

Define adjusted/unadjusted prices, timezone, benchmark, missing days and portfolio cashflow assumptions. Make snapshots immutable and revision-linked. Add reconciliation fixtures before charts.

### R5: Risk, quant, optimization and simulation

Write methods and input requirements first. Keep calculators pure and deterministic where possible. Label estimates and unavailable inputs. Add numerical fixtures, constraints and performance budgets. Do not let a disclaimer excuse an incorrect calculation.

### R6: News and corporate events

Select permitted feeds, source attribution, instrument matching, exchange timezone, event update/cancel behavior, retention and cost. Add deduplication and unavailable-versus-empty states.

### R7: AI advisor and chat

Add a provider adapter, prompt/context boundary, user consent, no-secret logging, budget limits, conversation ownership, retention/export/delete, cancellation and evaluation fixtures. The AI must read a revision-scoped portfolio context and must not invent missing prices or advice certainty.

### R8: Broker connections

Select broker permissions and OAuth flows. Store tokens only in an approved secret store. Add connection states, sync revisions, revoke behavior, rate limits, account ownership and read-only first. Never enable account mutation without a separate approval and rehearsal.

### R9: Screener and public/paid product

Define universe, freshness, licensing, query limits, entitlements, billing processor, signed idempotent webhooks, cancellation/refund, invoices and support. Enforce plans server-side. Public signup and billing are not UI-only features.

### R10: Commercial release operations

Add customer support workflow, privacy/terms/disclosures, export/delete, retention, incident response, audit logging, cost dashboards, quotas, backups, restore drills, rollout/rollback and accountable on-call ownership.

## 9. Progress Tracking That Shows Real Results

Use one GitHub issue for the release and one child issue per module. Every issue has the same checklist:

```markdown
- [ ] Contract written and linked
- [ ] Baseline SHA recorded
- [ ] Feature flag and route boundary defined
- [ ] Backend tests written
- [ ] Frontend/API contract tests written
- [ ] Failure and ownership tests written
- [ ] Implementation complete
- [ ] Local vertical slice proven
- [ ] Restart/concurrency/provider fault checks proven
- [ ] Browser desktop/mobile checks proven
- [ ] CI green on exact PR head
- [ ] Merged and post-merge check passed
- [ ] Attached to the core journey without regression
```

For each week/session, record only:

- current milestone;
- one active issue;
- one blocked issue, if any;
- last proven SHA;
- tests passed/failed/not run;
- next command or next decision;
- visible artifact produced.

Useful visible artifacts are a working browser journey, a database state report, a fault-test report, screenshots, an API contract diff and a staging runbook. A higher test count without a new end-to-end artifact is not progress toward usability.

## 10. The First Codex Task After This Plan

The next implementation task should be exactly this, and no broader:

> From current GitHub main, verify the accepted dependency/build baseline, add the local PostgreSQL/API/worker runtime contract and a two-user deterministic seed, then open a PR with startup checks and no product-route changes. Run the clean-checkout gate and record the exact output. Do not provision services, change DNS, use real user data or merge without approval.

After that PR is accepted, the next task is the identity/tenancy matrix, then revisions, then the import module, then durable jobs. Do not start advanced UI modules before W5 and W7 are accepted.

## 11. Stop Conditions And Honest Status

Mark a stage `BLOCKED` when progress requires one of these external decisions:

- India-region provider eligibility or data-processing terms;
- a paid service or billing account;
- production credentials or domain/DNS access;
- unsupported asset/geography/methodology requirements;
- legal, privacy, advice or data-license approval;
- a product decision that changes the contract.

Do not mark a feature complete because:

- a page exists;
- a route returns a scaffold response;
- a provider key is present;
- a mock has the same shape as real data;
- a background task was scheduled;
- a test passed in a stale environment;
- a PR was opened but not merged;
- a feature flag hides a broken dependency.

The honest current position is: **the project is a strong, testable prototype with a locally demonstrated happy path; it is not yet a durable private application.** The plan above makes the missing work finite, testable and modular. The first meaningful product milestone is W9, not the completion of every visible route.
