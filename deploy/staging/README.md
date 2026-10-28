# Private Staging Preparation

## Current Hosting Stop

The owner requires [India-only portfolio data](../../docs/DATA_RESIDENCY.md)
(2026-10-28), with a US$120-150/month initial planning envelope and a polished
functional core. **Do not apply the Render template for the new R1 environment.**
Render has no Indian region; this older preparation is retained as historical,
unapplied C0 evidence, not the current eligible hosting choice. A Mumbai database
alone does not prove that API/worker/frontend/log/support flows stay in India.
The India-region profile, full data-flow review and replacement cost estimate
remain pending. No cloud resource is created by these files.

Part of C0/C1 in the [core release plan](../../docs/CORE_RELEASE.md). Prepared
configuration is not a running service, a paid-plan approval or permission to
process real portfolios. No deployment workflow or account API is invoked.

## Historical Candidate Services (Not Approved For India-Only R1)

| Component | Direction | Current boundary |
|---|---|---|
| Frontend | Vercel, repository root directory `frontend`, Next.js preset | Build/runtime compatibility and protected preview are unverified; do not import until reviewed |
| API | Render native Python, `backend`, one process/instance | Non-provisioning [template](render-api.template.yaml), all product features disabled |
| Database/Auth | Isolated Supabase staging project | No project/roles configured; invitations only, no open signup or production project reuse |
| Private sources | Supabase private bucket with explicit owner/revision policies | Not connected to the upload code; current shared local files are not suitable remote storage |
| Durable jobs | Separately operated Render worker with persisted job/outbox contract | Not implemented/provisioned; no fake worker service/queue or API-as-worker command in template |
| Operations | Controlled GitHub delivery, redacted logs/error/uptime alerts and backups | Existing CI is retained; account integrations, alert routing and restore proof remain |

Keep API credentials, DB passwords, signing secrets and provider keys out of
frontend public variables, GitHub source/issues and screenshots. The browser may
use the project's publishable/anon client key only with appropriate policies;
never use a service-role/secret key there. It calls FastAPI for portfolio domain
commands rather than bypassing application ownership through public DB tables.

## Stop Conditions Before Provisioning

- Resolve the current India-only requirement using the linked data-flow and
  provider evidence checklist. The historical template below is not a shortcut.
- The budget envelope and India-only requirement are confirmed. Actual eligible
  providers/Indian region, complete costs, account/project ownership and release/
  recovery operators still need review. No plan or region is preselected in the
  historical template; provider defaults can incur charges if someone applies it.
- Review provider terms, staging isolation, budget alerts and account access.
- Verify Node/Python/manager compatibility with the pinned build contract. Vercel
  supports Node major selection and automatically changes minor/patch versions;
  it does not offer an arbitrary exact-patch selector. Our exact `24.19.0` gate
  is not weakened here. If unavailable, resolve a reviewed runtime policy or
  container-hosted frontend alternative first. Do not fall back to npm/unlocked
  installs, ignore engines or disable TLS validation.
- Establish preview/access protection covering **frontend and API**. A Render web
  service normally has an Internet-accessible hostname. CORS and hidden navigation
  are not authentication or network protection. The all-disabled bootstrap profile
  is a second barrier, not a substitute for the access decision.

## API Bootstrap Template

The commands and tests below describe the preserved C0 candidate only. Passing
these tests does not make Render eligible under the newer residency requirement.

`render-api.template.yaml` is not an auto-discovered root `render.yaml` and is
not applied by CI. `autoDeployTrigger: off` prevents subsequent automatic
deployments, but does not prevent a first manual Blueprint application from
creating/charging for resources. Leave it unapplied until the checks above pass.

The template uses the current pinned Python and hashed runtime/bootstrap exports,
never dev/maintenance exports. Provider env values are strings. Three required
values use `sync: false`; enter real values only in the provider's secret/config
interface after review, never by committing a filled copy. Missing/incompatible
configuration should prevent startup rather than fall back to local mode.

`AUTH_ENABLED=true`, `APP_ENV=staging`, local DDL/debug/docs off, exact frontend
origin and PostgreSQL are required. Every existing `FEATURE_*` and auxiliary
provider/roadmap switch is explicitly false. Enabling a new feature requires a
separate reviewed profile/change and actual acceptance; registry health alone is
not approval. `/readiness` checks DB connectivity, not financial/job readiness.

No migrations run in the build/start command. Managed startup is read-only and
rejects an unstamped/incompatible database. Before a first start, use a controlled,
serialized migration step against the new isolated staging database, with a
reviewed backup/rollback strategy and separately controlled migration credentials.
Do not run migrations against production to make a staging build green. A
least-privilege application role must not casually receive migration permissions.
Creating those roles/release commands is C1/C2 work, not completed by this file.

For Supabase, copy the actual endpoint/user from its Connect dialog. Long-lived
Python services can use a supported direct connection, or session pooling for an
IPv4-only network. Do not invent a pooler hostname or silently use transaction
mode. Review SQLAlchemy/worker pool sizes against the selected plan's limits.
Require encrypted, certificate/hostname-verified PostgreSQL transport
(`sslmode=verify-full` with the correct root certificate configured in the driver).
Do not copy a raw URL into logs or use the privileged default DB user as an
unreviewed final application role. No real DB connection is tested in C0.

## Frontend Configuration Once Compatible

Set project root `frontend`; use the accepted exact pnpm manager, frozen install,
production build and the reviewed Node environment. Treat actual provider
minor/patch readback as a prerequisite, not proof from `engines` alone.

| Build-time browser variable | Source / restriction |
|---|---|
| `NEXT_PUBLIC_API_URL` | Exact staging API origin, no localhost or production reuse |
| `NEXT_PUBLIC_SUPABASE_URL` | The isolated staging Auth project origin |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Only its permitted browser client key; verify code/SDK naming before setting |

Next public variables are baked into built assets: changing them requires a new
reviewed build. Set Supabase invitation/recovery redirect allowlists to the exact
protected staging origin. Do not allow arbitrary preview origins or enable open
signup just to make a login test pass. Email delivery/redirect/recovery acceptance
is separate from having an Auth SDK installed.

## C1 Live Proof Before Calling It Hosted

Record the actual deployed Git SHA, service versions, account/region names (not
credentials), protected frontend/API URLs, DB migration stamp and settings review.
From an external browser, verify access protection, safe health/readiness,
disabled product routes and no unexpected provider/job traffic. Verify logs are
redacted, alerts reach the operator and rollback works. Use only synthetic data.

Only C2-C5 acceptance can turn this shell into the usable core: real controlled
login, correct persistence/private storage, durable import/refresh, coherent UI
and recovery/customer-life-cycle proof. Never call a health check that result.

## References And Verification

Local tests in `backend/tests/test_staging_bootstrap_contract.py` parse the actual
template, check frozen/pinned install/manual deployment settings, verify every
flag and exercise current disabled route boundaries. They do not validate an
external provider account or prove Blueprint application. Native/schema/live
provider verification remains required before C1 provisioning.

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render Python selection](https://render.com/docs/python-version)
- [Vercel Node version policy](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Supabase PostgreSQL connections/TLS](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase private-storage policies](https://supabase.com/docs/guides/storage/security/access-control)
