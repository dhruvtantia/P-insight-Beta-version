# P-Insight: Gradual Execution Plan

Updated: 2026-10-27. Start with the [core-first release](CORE_RELEASE.md) and [checkpoint](EXECUTION_STATUS.md). This is an operating plan, not production certification. Detailed local audit evidence is not published here.

## Baseline and Scope

B00 is accepted through [PR #3](https://github.com/dhruvtantia/P-insight-Beta-version/pull/3), merged at `9b71c53953373421bbc360244b794d8a78edc435`. Its exact-head and post-merge CI passed. The original foundation commits were preserved, and the local baseline was reconciled without discarding existing work.

**Current order: working core first, roadmap modules later.** On 2026-10-27 the owner requested a usable main product with incomplete parts separate/placeholdered, then accepted the recommended option. [CORE_RELEASE.md](CORE_RELEASE.md) owns R1's private invited upload-to-dashboard scope, deferred modules, modular boundaries and C0-C6 acceptance. It supersedes release ordering from [historical decision #12](https://github.com/dhruvtantia/P-insight-Beta-version/issues/12), not accepted engineering evidence or the long-term roadmap.

The [full-product manifest](PRODUCTION_READINESS.md#required-feature-manifest) retains public/paid accounts, brokers, screener, AI/news/events, US/FX, real-time and advanced analytics. These may be developed/attached later with explicit acceptance, not counted complete because hidden. R1 still requires safe accounts, strict ingestion, durable revision-safe processing, verified displayed values and operated recovery. Its uploaded-INR equity/ETF contract and later specifications must be tested before claims; no old calendar estimate is reused.

Security and correctness work can proceed while commercial decisions remain open. A release, purchase, real-account mutation or customer-data migration needs its own approved scope. This plan configures no unattended work or automatic production rollout.

## Source of Truth

- This file owns batch order, scope, original T00-T58 traceability and acceptance boundaries.
- [EXECUTION_STATUS.md](EXECUTION_STATUS.md) is the durable entry point to accepted evidence and the next work item.
- Linked GitHub issues own current delivery state, acceptance checklists and PR/CI evidence. Do not copy volatile states into several competing trackers.
- PRs own the reviewed change and exact tested revision; GitHub main is the integration baseline, not a production-release guarantee.
- Earlier master plans and hardening trackers are historical context. Their old completion statements are not current acceptance evidence.

## One Working Cycle

1. Read the checkpoint; inspect local changes, linked worktrees, live GitHub main and any open PR. Re-read the source relevant to the selected batch.
2. Pick one batch or smaller subtask. State its desired behavior, allowed files, tests and external dependencies. Separate behavior fixes from broad folder reorganizations.
3. Prepare a short-lived branch from the verified baseline. Preserve unrelated work; coordinate overlapping file ownership. Do not remove another process's Git lock.
4. Add desired-behavior regression tests and implement the narrow change. Record any API, migration, data-quality or feature-scope change explicitly.
5. Run focused and applicable shared checks, review the diff, and record passed, failed and unrun checks with environment boundaries.
6. Commit explicit reviewed files, push the branch and open/update a PR using the repository template. Link the batch issue and exact revision. Never stage local evidence or credentials indiscriminately.
7. Inspect actual CI and review findings. Do not merge red or unknown required checks. Obtain required approval; do not bypass repository protections.
8. After merge, verify the accepted main revision and post-merge checks. Reconcile the local baseline with a fast-forward only, preserve unrelated artifacts, update the delivery issue and identify the next slice.

Do not force-push main, reset user changes, automatically stash/drop work, delete branches/worktrees, or treat a push as a completed batch. If a dirty tree blocks safe synchronization, resolve ownership and preserve the work first. A final merge SHA or CI outcome belongs in the delivery record after it exists, not in a self-referential commit claim.

## Ownership and Collaboration

| Area | Engineering assistance | Owner/maintainer responsibility |
|---|---|---|
| Product | Translate scope into tests and identify tradeoffs | Confirm release scope, priorities, budget and supported markets/assets |
| Implementation | Inspect, implement, test, review and document scoped changes | Review product acceptance and approve exceptional risk |
| GitHub | Check baseline, prepare branches/PRs and inspect CI | Own permissions, protection settings and required approvals |
| External services | Prepare configuration and verification procedures | Own accounts, billing, domains, contracts and approved credentials |
| Release | Show test evidence, recovery and remaining uncertainty | Approve customer-facing scope and go-live |

The default repository owner is recorded in [CODEOWNERS](../.github/CODEOWNERS). The file identifies review ownership; server-side enforcement is a separate setting. B01 does not change repository rules or claim that required reviews/checks are enforced. B06 verifies these controls without creating an impossible self-review requirement for a sole maintainer. See [GitHub's CODEOWNERS documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

UI contributors own presentation, accessible interactions and component states. Backend/domain owners retain identity, authorization, persistence, jobs, instrument/data rules and authoritative financial calculations. Use generated DTOs and shared synthetic API fixtures for handoff; never give a UI-only contributor production secrets just to style a screen.

## Milestones

| Milestone | Batches | Acceptance boundary |
|---|---|---|
| M0: baseline and tracking | B00-B01 | Existing work accepted, operating plan tracked, publication state and open decisions explicit |
| M1: safe foundation | B02-B07 | Access, startup/auth, dependency and delivery contracts verified |
| M2: data contracts | B08-B09 | Canonical identity/quality/API contracts and PostgreSQL ownership/revision invariants |
| M3: reliable import | B10-B14 | One validated import/refresh workflow with durable, bounded, revision-safe enrichment |
| M4: financial correctness | B15-B17 | Valuation/history/snapshots/analytics reconcile with declared methodology and quality |
| M5: browser experience | B18-B20 | Session-safe UI, component handoff, browser acceptance and required AI/news/events integrations |
| M6: operated release | B21-B23 | Hosting, auth/email, monitoring, CI promotion, recovery, support and capacity verified |
| M7: full-roadmap launch | B25 then B24 | All required roadmap tracks accepted before full-product rehearsal, go/no-go and controlled rollout |

These remain full-project milestones. R1 uses applicable subsets under C0-C5
in CORE_RELEASE; it need not complete all deferred/full-roadmap modules first.
A partial batch is never marked wholly accepted because R1 ships.

Staging/provider procurement can start after the safety baseline rather than waiting for M6. Frontend work can overlap domain work after B08 contracts are stable. Parallel contributors must coordinate ownership; no concurrent edits to the same surface without agreement.

## Ordered Batches

A batch is a bounded work package, not a promise to finish a subsystem in one chat. Split large batches into smaller PRs, for example B12a/B12b, while retaining the parent acceptance boundary. The near-term issues are linked from the checkpoint; later issues are created when their scope is ready.

**Full-product dependency: applicable B02-B23 -> B25 acceptance -> B24 full-product launch.** IDs/task traceability remain stable. R1 follows C0-C5: synthetic staging early; identity/API/revisions; durable import; correct core browser; operated private release. Applicable B06 security/delivery/license decisions still gate affected use/release, but pending owner-admin/commercial work need not block code-only C2 or safe C1 preparation. B20/deferred B25 modules are not R1 prerequisites. Later modules receive separate acceptance after their safety/domain prerequisites.

| Batch | Deliverable | Original tasks | Acceptance boundary |
|---|---|---|---|
| B00 | Recover, verify and reconcile existing foundation | T00 | Accepted PR, verified tests/CI, preserved history and safe local reconciliation |
| B01 | Operating plan, scope decisions and work tracking | T01,T06 | Public-safe versioned docs; assumptions approved or explicitly open; linked work queue and review conventions |
| B02 | Import-progress access contracts | T02 | Synthetic owner/access/error cases pass consistently across supported progress reads |
| B03 | Supported import-command consistency | T02 | Owner context and per-owner creation/activation invariants hold; compatibility policy explicit |
| B04 | Revision-aware private computation caching | T02,T14 | Full computation identity and mutation/invalidation behavior tested |
| B05 | Environment, startup and diagnostics safety | T03 | Production-incompatible settings rejected; documented configuration and sanitized errors tested |
| B06 | Reproducible builds and delivery controls | T04,T05,T06 | Compatible frozen runtimes/locks, current dependency review, verified check/enforcement decisions |
| B07 | Identity lifecycle and access matrix | T07,T08 | Private operation matrix, claim/signing policies and concurrent provisioning verified |
| B08 | Instrument, quantity/cost, quality/error and API contracts | T09,T13 | Supported identity/duplicate/currency policy explicit; runtime/export/generated types agree |
| B09 | PostgreSQL revisions and transactional ownership | T10,T11,T12 | Fresh/existing migrations, legacy ownership treatment, concurrency and controlled schema changes verified |
| B10 | Strict parsing and row classification | T15 | Format, mapping, numeric/date, identity and resource limits deterministic and tested |
| B11 | Canonical import/refresh and private file lifecycle | T16,T17 | Supported callers share contracts; private object access, names and retention verified |
| B12 | Atomic import acceptance and durable jobs/outbox | T18,T19 | Retry-safe accepted revision and recoverable dispatch/worker lifecycle |
| B13 | Bounded enrichment stages and provider normalization | T20,T23 | Persisted field outcomes/provenance, explicit units, actual transport/retry/concurrency bounds |
| B14 | Revision-safe refresh, progress and repair tools | T21,T22,T24 | Supersession/cancel/retry outcomes correct; required stages accounted for; scoped repair demonstrated |
| B15 | Data entitlement/coverage and coherent valuations | T25,T26,T27,T33 | Supported instruments and source rights verified; quality, timestamps, currency and units consistent |
| B16 | History, benchmarks and immutable snapshots | T28,T29,T32 | Missing-data/adjustment policy, concurrent builds and revision/as-of snapshot reconciliation tested |
| B17 | Quant/optimization/simulation methodology | T30,T31,T42 | Actual methods labeled, constraints respected, deterministic numerical fixtures agree |
| B18 | Session/query lifecycle and upload workflow state | T36,T37,T38,T39 | Identity/portfolio changes invalidate private state; late responses fenced; progress resumes; typed errors |
| B19 | UI handoff and browser/accessibility coverage | T40,T41,T43 | Synthetic component states; representative desktop/mobile/browser workflows and accessible interactions |
| B20 | Required AI/news/events integration | T34,T35 | Executed integrations, consent/quota/fallback/quality evidence and browser acceptance; no placeholder/exclusion substitute |
| B21 | Staging/production hosting, auth/email and services | T44,T45,T46,T47 | Isolated environments/secrets, deployed API/worker/scheduler, real email and dependency checks |
| B22 | CI promotion, observability and rollout controls | T48,T49 | Exact-revision checks, tested redacted alerts, serialized migrations and controlled promotion |
| B23 | Recovery, customer lifecycle, support and capacity | T50,T51,T52 | Measured restore, account export/delete/recovery, policy review, load/quota/budget evidence |
| B25 | Required public/paid/broker/screener/extended tracks | T58 | All manifest tracks implemented and accepted with specifications, data/permissions/operations evidence before B24 |
| B24 | Full-product rehearsal, release decision and rollout | T53,T54,T55,T56,T57 | B02-B23 and B25 gates passed, outage/deploy drills passed, no release blocker, approved monitored launch |

## Priority: Import and Enrichment

B10-B14 are the largest initial reliability investment after safety and contracts. Acceptance covers parse -> review -> confirm -> revision -> durable job -> observable enrichment -> terminal outcome -> safe refresh/retry, not merely a successful upload response.

Use synthetic fixtures for multiple owners, repeated commands, duplicate instruments, bounded file resources, API/worker interruption, provider failure and refresh during ongoing work. Accepted holdings remain available while unavailable derived observations are explicitly labeled; missing data must never be presented as verified data. Honest per-instrument missing-data or temporary outage states do not waive a required feature's implementation and acceptance.

## Scope and Schedule Control

Break deferred modules into reviewed slices with owners, API/schema contracts, vendor prerequisites and deterministic/live evidence. Reconcile legacy promises before claiming the full product. Estimate R1 from its demonstrated hosted journey and later releases from their own scope/eligibility, not one blended percentage. No date or service cost is approved here.

Current explicit deferrals are recorded in CORE_RELEASE. New scope changes require owner approval and a delivery record. Flags/mocks/unfinished specifications never satisfy an enabled/R1 requirement. Scope approval does not approve purchases, provisioning, customer-data use, production deployment or real-account mutations.

## Public-Safe Collaboration

- Keep secrets, customer uploads, raw diagnostics, machine-specific paths and unfixed security reproduction material out of public issues, PRs and docs.
- The local audit archive is intentionally ignored. Publish reviewed summaries separately; preserving local evidence does not authorize publishing it.
- Use repository-relative links in versioned docs and synthetic/redacted evidence in PRs.
- Public issues describe desired behavior and acceptance, not sensitive reproduction steps. If private reporting is needed, verify an appropriate private route with the maintainer first; do not assume it is enabled.
- Do not upload local configuration or remove another contributor's workspace as housekeeping.

## Session Handoff and Completion

Every handoff identifies the release milestone/batch/subtask, branch/base, owned changes, tests, PR/CI state, external dependencies and next action. Use PLANNED, IN_PROGRESS, LOCAL_VERIFIED, CI_PENDING, REVIEW_READY, MERGED, STAGING_VERIFIED or BLOCKED accurately. R1 exclusions are explicit in CORE_RELEASE, not implementation or approval of later modules. Further exclusions require a new decision.

A code batch requires tests, review, accepted PR, verified CI and safe baseline reconciliation. An operational batch additionally requires its live acceptance evidence. Record final merge and post-merge CI in the linked issue once known; the next code snapshot can reference that accepted evidence without an endless status-only commit loop.

Resume instruction: **Read docs/EXECUTION_STATUS.md and the next issue, verify local/GitHub state, work only on the next ready slice, preserve unrelated files/worktrees, and finish with tests, PR/CI evidence and an updated delivery record.**
