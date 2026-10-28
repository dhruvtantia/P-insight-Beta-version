# India-Only Portfolio Data

Owner decision: 2026-10-28. Initial users are in India and **portfolio data must
stay in India**. This supersedes the earlier proposed Render/Singapore hosting
direction. [Issue #26](https://github.com/dhruvtantia/P-insight-Beta-version/issues/26)
owns current decisions and delivery evidence. This document defines requirements,
not an implemented residency guarantee, approved vendor or legal certification.

## Scope And Default Boundary

Require Indian storage and application processing for customer portfolio data,
including files, holdings, derived results and identifiers that link to them.
The requirement follows the data through the whole workflow, not just its main
database. Until a flow is reviewed, do not send portfolio data through it.

| Surface | Required treatment before real-data use |
|---|---|
| Uploads, review previews, exports and reports | Private India-region storage and processing; no public/global file delivery or overseas diagnostic copies |
| Portfolio database and derived values | India-region database and API execution; no foreign-region replicas or automatic foreign failover |
| Enrichment and refresh | India-region worker, temporary files, persisted jobs/outbox, queues and caches; no offshore processing fallback |
| Backups and recovery | India-only backup/snapshot destinations and restore targets; prove both database and source-file recovery |
| Private browser requests and server rendering | Review frontend hosting, proxies, server actions, redirects, caching and error capture; no unreviewed foreign processing of private responses, identifiers or tokens |
| Logs, metrics, support and debugging | Keep any portfolio-bearing records in India; prevent bodies/files/private identifiers from entering foreign telemetry, tickets or screenshots |
| Market-data and AI adapters | Review actual outbound payloads and provider processing locations; do not send holdings, source files or private context to an unapproved provider |
| Development, CI and GitHub | Synthetic data only; never copy real portfolios into developer machines, tests, source, artifacts or public issue evidence |

Public application code/assets and non-portfolio billing/control-plane metadata
are distinct from portfolio data. Do not assume they contain no private content:
inspect URLs, headers, cookies, logs and embedded state. Review identity-provider
and support flows as part of the data map. User-directed exports, travel access
and remote operator access need an explicit policy, not an assumed exception.
Do not promise control over every physical internet transit route from a region
setting alone.

## Provider Consequences

- Render has no Indian region in its published region list. The existing
  [Render template](../deploy/staging/render-api.template.yaml) is retained as
  historical, unapplied C0 evidence, **not an eligible deployment profile for
  this requirement**. Do not apply it for the new R1 environment.
- Supabase offers Mumbai for primary project data, but its published residency
  description also identifies overseas operational/support/logging and possible
  CDN handling. Mumbai alone is not proof of this application's complete data
  boundary. Do not approve a hosted Supabase flow without verifying relevant
  controls and contractual/provider evidence.
- Vercel/global frontend hosting is not automatically approved for private app
  traffic. Public static assets are a separate candidate only if the reviewed
  design keeps private data/identifiers/session material out of foreign server,
  cache and logging paths. Otherwise host the private frontend regionally too.
- AWS Mumbai (`ap-south-1`) is an India-region reference candidate for the next
  service/architecture/cost review, not a selected or provisioned stack. Confirm
  each proposed service's availability and data-handling details, including
  replicas, backups, support and operational metadata. Other India-based options
  can be compared against the same evidence requirements.

The application stays Next.js/React + FastAPI/SQLAlchemy, with a separately
operated durable worker. Do not rewrite it into microservices or a new UI builder
to change hosting. Current Supabase JWT code/tests remain accepted engineering
evidence, not approval of hosted Supabase residency. A different identity vendor
requires a separate reviewed adapter/claims/session contract and regression tests;
do not silently replace it or weaken accepted issuer/signature checks.

## Cost And Quality

The owner approved an initial US$120-150/month planning envelope: aim near $120
in base costs and preserve headroom toward $150. The earlier Render/Vercel/
Supabase $120 breakdown is historical, **not a verified India-only quote**.
Re-price compute, frontend, database/auth, private storage, worker/queue, backups,
networking, logs, email/domain, taxes and usage allowances together. Avoid
unreviewed NAT/load-balancer/extra-instance charges and automatic upgrades.
No assurance of fitting the ceiling or serving a user count follows from naming
a cloud. Return for approval or reduce optional scope if the reviewed total
cannot fit; do not bypass residency, security or recovery to make a price work.

Professional mobile/desktop UI, truthful charts and usable error/loading/review
states remain required. Use the existing frontend/component stack and verify it
in the browser. Hosting changes do not relax correctness or visual acceptance.
Deferred AI remains outside the initial core and must not become a paid or
offshore dependency of the upload path.

## Required Evidence And Next Work

1. Map every source, processor and destination for the upload-to-dashboard flow,
   including frontend, identity, worker, data providers, backups and operations.
2. Compare India-region services using current documentation/terms and an
   itemized budget. Record uncertainty and obtain any necessary provider answers.
3. Review the selected profile: regional endpoints, runtime pins, least-privilege
   roles, private storage, TLS, restricted egress, no private CDN caching, redacted
   telemetry, India-only backups/restore and controlled deployments.
4. Create services only after account access, cost review and explicit scope are
   ready. Use synthetic data first; verify actual deployed region/configuration,
   access protection, traffic/log destinations and rollback/restore behavior.
5. Obtain operational/privacy/release acceptance before real portfolio use.
   Region choice alone is not proof that application code enforces the policy.

Code-only B07 concurrency/private-access and B08/B09 work can continue while
this review proceeds. Original batch/task IDs, accepted PRs and the core-first
order remain. No paid service, account, real-data migration, external credentials
or automatic deployment is created by this documentation change.

## Official References

Checked 2026-10-28; recheck availability, terms and prices before provisioning.

- [Render regions](https://render.com/docs/regions)
- [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- [Supabase residency and transfers](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq)
- [AWS regions](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html)
- [Regional S3 buckets](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingBucket.html)
