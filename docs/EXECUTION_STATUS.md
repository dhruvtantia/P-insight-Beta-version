# P-Insight: Execution Checkpoint

Updated: 2026-10-19. [Operating plan](EXECUTION_PLAN.md) | [Release decisions and gates](PRODUCTION_READINESS.md).

## Accepted Baseline

B00 was reviewed and accepted through [PR #3](https://github.com/dhruvtantia/P-insight-Beta-version/pull/3), merged at `9b71c53953373421bbc360244b794d8a78edc435`.

- 91 backend tests passed during final local review; Ruff and diff checks passed.
- [Exact-head CI](https://github.com/dhruvtantia/P-insight-Beta-version/actions/runs/39319125469) passed backend checks/PostgreSQL migrations and frontend build/type checking.
- [Post-merge CI](https://github.com/dhruvtantia/P-insight-Beta-version/actions/runs/39335580474) passed both jobs.
- Local main and the prior development baseline were reconciled to the accepted merge without discarding working source, unrelated local evidence or the existing locked linked worktree.

This records accepted development evidence, not production certification. The SHA is a historical acceptance anchor; always verify live GitHub/local state before starting work.

## Current Delivery Record

**B01 accepted:** [issue #4](https://github.com/dhruvtantia/P-insight-Beta-version/issues/4), [PR #11](https://github.com/dhruvtantia/P-insight-Beta-version/pull/11), merged at historical anchor `ab06e960df7ca9a6c69851e32493626df4961636`. Exact-head and post-merge CI passed, and local main/development baseline were safely reconciled. The issue owns detailed acceptance evidence.

**Later scope decision:** on 2026-10-19 the owner answered **"Full roadmap required at launch"**. [Decision #12](https://github.com/dhruvtantia/P-insight-Beta-version/issues/12) owns this follow-up's PR/CI and reconciliation evidence. B01 remains accepted; the former proposed beta scope is superseded. See the [required-feature manifest](PRODUCTION_READINESS.md#required-feature-manifest).

**Next implementation batch:** [B02, issue #5](https://github.com/dhruvtantia/P-insight-Beta-version/issues/5). It has not been implemented by either documentation publication. Safety remains first; B25 is required before B24, not a post-launch extension.

## Near-Term Queue

| Order | Batch / delivery issue | Acceptance focus |
|---|---|---|
| 1 | [B02: import-progress access contracts](https://github.com/dhruvtantia/P-insight-Beta-version/issues/5) | Synthetic multi-user progress/read/error contracts |
| 2 | [B03: supported import-command consistency](https://github.com/dhruvtantia/P-insight-Beta-version/issues/6) | Required owner context and creation/activation invariants |
| 3 | [B04: revision-aware analytics cache contracts](https://github.com/dhruvtantia/P-insight-Beta-version/issues/7) | Full computation identity and invalidation |
| 4 | [B05: environment and startup safety](https://github.com/dhruvtantia/P-insight-Beta-version/issues/8) | Validated environment, configuration and diagnostic boundaries |
| 5 | [B06: reproducible builds and checks](https://github.com/dhruvtantia/P-insight-Beta-version/issues/9) | Compatible frozen install and verified delivery controls |
| 6 | [B07: identity lifecycle and access matrix](https://github.com/dhruvtantia/P-insight-Beta-version/issues/10) | Signing/claim/provisioning and private-operation contracts |

Issues contain desired acceptance, not proof of completion. Do not infer that an open issue was tested or fixed. Later B08-B25 batches are defined in the operating plan and receive delivery issues as they approach execution.

## Milestone Evidence

| Milestone | Current evidence / gate |
|---|---|
| M0 baseline/tracking | B00 accepted; B01 publication acceptance is recorded in issue #4 |
| M1 safe foundation | B02-B07 delivery issues above; not established by B00's narrow auth tests |
| M2 data contracts | B08/B09 ownership/revision/API/database gates remain |
| M3 import/enrichment | B10-B14 durable lifecycle and recovery gates remain |
| M4 financial correctness | B15-B17 provider/quality/numerical acceptance remains |
| M5 browser experience | B18-B20 session, UI and integration acceptance remains |
| M6 operations | B21-B23 deploy/email/alerts/restore/customer/capacity gates remain |
| M7 full-roadmap launch | B25 required-feature acceptance must precede B24 full-product rehearsal and launch decision; both remain |

## Scope and Open Decisions

| Decision | State | Before it is needed |
|---|---|---|
| First-launch feature breadth | APPROVED: full roadmap, including public signup and required integrations; decision #12 | Fulfill manifest before B24; no silent deferrals |
| Markets/assets/currencies and real-time/advanced specifications | OPEN; includes defining README US expansion and real-time analytics promises | Instrument/feed/methodology contracts and full-scope estimate |
| AI/news/events/billing/brokers/screener implementation choices | OPEN; inclusion is required, provider/pricing/permissions details are not selected | Affected specification, integration or purchase |
| Data contracts/rights, region and budget | OPEN | Production provider/hosting commitment |
| Retention, export/delete, support and disclosures | OPEN | Customer lifecycle and release acceptance |
| Required-check/review enforcement and deployment linkage | VERIFY in B06/B21 | Relying on server enforcement or production promotion |

Open specification and commercial decisions do not prevent the next code-only safety batch. Required features with unresolved specifications remain launch blockers, not exclusions. Scope approval is not vendor-purchase or go-live approval. Re-estimate the full roadmap after specification and provider eligibility; do not reuse a beta-only delivery estimate.

## Delivery Evidence Required Each Time

Record in the linked issue: selected batch/slice; allowed ownership surface; actual base/head; tests and environment; review findings; PR URL and exact-head checks; final merge/post-merge checks; safe local reconciliation; remaining dependencies; next action. Sanitize all public evidence.

GitHub Issues own live delivery state. The checkpoint owns the durable navigation and accepted evidence anchors. A merged PR is not a production deployment, and CODEOWNERS is not proof that branch protection is configured.

## Next Session

Read accepted B01 issue #4 and later scope decision #12, then start B02 issue #5 on a verified current main; implement only that slice with synthetic tests, review and exact-revision checks. Preserve local audit evidence and linked worktrees. Do not repeat B00/B01 or start a broad import rewrite. Required roadmap integration slices can be planned alongside the safety work without bypassing its contracts.
