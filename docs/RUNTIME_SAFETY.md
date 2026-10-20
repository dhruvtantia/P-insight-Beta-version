# Runtime Safety Contract

Updated: 2026-10-20. B05 is delivered in reviewed slices under [issue #8](https://github.com/dhruvtantia/P-insight-Beta-version/issues/8). The [checkpoint](EXECUTION_STATUS.md) records acceptance. This is not deployment approval or a replacement for the remaining launch gates.

## Environment Selection

`Settings` loads environment variables and optional `backend/.env` using Pydantic Settings. Supported, case-sensitive `APP_ENV` names are `development`, `test`, `staging` and `production`. Unknown names fail on import, before the database engine or API can serve requests. Development remains the default for local compatibility; future deployment manifests must explicitly select staging/production. Configuration error text omits input values; never publish exception objects or settings dumps.

Staging and production have the same safety rules:

- `AUTH_ENABLED=true`, `DEBUG=false`, `LOG_LEVEL` not `DEBUG`, `DOCS_ENABLED=false`.
- A supported synchronous PostgreSQL URL with explicit host/database; SQLite and async drivers are rejected. Supported driver names are `postgresql` and `postgresql+psycopg2`.
- `LOCAL_DB_BOOTSTRAP=false`.
- A non-local HTTPS Supabase project origin and non-empty expected JWT audience. ES256/RS256 use JWKS; the legacy HS256 secret is not mandatory for asymmetric projects. This does not certify issuer/claim/rotation behavior; B07 still owns that policy.
- Exact, non-local HTTPS browser origins. The checks reject loopback/unspecified literal IPs and localhost names; they do not validate DNS, network routing, TLS availability, cloud eligibility or provider subscriptions.
- A supported default data-mode name (`uploaded`, `live`, `broker`). A valid name is not evidence that its provider is implemented or available.

SQLAlchemy parses database URLs; the app does not invent its own DSN parser. Password escaping and provider-specific TLS/network requirements still need deployment verification. These checks do not connect to or configure real cloud accounts.

## Local Setup

`backend/.env.example` is explicitly a local example. It enables the existing SQLite bootstrap with `LOCAL_DB_BOOTSTRAP=true`. Auth-disabled legacy single-user behavior is restricted to local/test configurations, not endorsed for a remotely accessible development server.

Run from `backend/` with the project's installed/locked dependencies:

```sh
uvicorn app.main:app --reload --port 8000
```

Alternatively, leave `LOCAL_DB_BOOTSTRAP=false`, run `alembic upgrade head` against a disposable empty database, then start the server. Never stamp a legacy database as migrated merely to bypass startup. A pre-existing locally bootstrapped database needs a separately reviewed migration/conversion procedure; do not run an initial create-table migration over it blindly. Back up data first.

The local bootstrap creates tables and adds missing legacy columns only for SQLite in development/test. Existing columns are inspected rather than treating every DDL error as harmless. Other errors stop startup. No demo portfolio is seeded. Tests explicitly select their own temporary SQLite bootstrap; no customer database is used.

## Managed Startup

With bootstrap disabled, SQLAlchemy/Alembic read database migration heads and compare them to the repository's migration heads. Missing, older, unknown or mismatched stamps stop startup with a static message. Connection failure also stops startup without returning a DSN. The application does not issue `CREATE`, `ALTER`, upgrade or stamp operations on this path.

Run reviewed Alembic migrations as a separate deployment step. Checking the stamp is not a full schema-drift audit or a transaction spanning deployment and requests. B09 owns PostgreSQL constraints/revisions; B21 owns deployment ordering, permissions, managed secrets, TLS, recovery and rollout checks.

CI's disposable PostgreSQL service runs migrations, then boots the real application with synthetic staging settings and checks health, readiness, unauthenticated rejection and disabled schema publication. It does not connect to Supabase or any production database.

## Browser Origins

Both previously documented comma-separated values and JSON string lists are supported:

```dotenv
ALLOWED_ORIGINS=https://app.example.com,https://www.example.com
```

```dotenv
ALLOWED_ORIGINS=["https://app.example.com","https://www.example.com"]
```

A non-empty list takes precedence over `FRONTEND_URL`; otherwise that single origin is used. Empty input means fallback, not a wildcard. No localhost entry is appended implicitly. Paths other than `/`, credentials, query strings, fragments, wildcards, malformed JSON, non-string items and empty comma-separated items are rejected. Origins are normalized with Pydantic's HTTP URL parser; default ports and an optional trailing slash normalize to the browser origin. CORS is a browser rule, not authentication or network access control.

## External Boundaries

| Surface | Policy |
|---|---|
| `GET /health` | Public liveness: only `{"status":"healthy"}`. It does not test providers, authentication or product readiness. |
| `GET /readiness` | Public database connectivity: existing status/database shape retained. Failure returns HTTP 503 and driver `unavailable`, never raw exception text. Startup separately checks migration stamps. |
| `GET /api/v1/system/diagnostics` | Development/test only; staging/production return 404 after the API authentication gate. When authentication is enabled, a valid user is still required locally. Key values are never returned, only booleans. No remote operator role is invented. |
| `/docs`, `/redoc`, `/openapi.json` | All disabled unless `DOCS_ENABLED=true`; that flag is rejected in staging/production. Offline `app.openapi()` export still works. |
| Unexpected HTTP/server exceptions | Central FastAPI/Starlette handlers return a constant generic detail for HTTP 5xx/unhandled exceptions. Ordinary client-error status/details/headers are retained. |
| Reviewed service failures | Explicit `PublicServiceError` preserves existing typed feature-unavailability and static enrichment-status messages. Only reviewed public data belongs here, never raw provider/exception strings. |
| JWT/JWKS errors | Token parsing, invalid signatures/claims and JWKS failures do not echo library/provider exception text or untrusted algorithm values. Existing authentication status/header behavior is retained. |
| Reviewed embedded failures | Provider/news/events/peer/optimizer/advisor errors and job/holding/broker status reasons use approved messages, not exception strings. Existing status distinctions, data fields and response shapes remain. |

Intentional compatibility change: `/health` no longer carries environment, version, feature or key-presence inventory. The debug panel's key section calls the local-only diagnostics route instead. Existing API feature registry and provider availability contracts remain authenticated application capabilities, not public health probes. Existing upload creation/progress routes remain available.

## Tools and Ownership

| Responsibility | Existing tools / owning module |
|---|---|
| Configuration, URL validation, environment parsing | Pydantic, Pydantic Settings; `backend/app/core/config.py` |
| Database URL parsing, local bootstrap, read-only startup check | SQLAlchemy, Alembic; `backend/app/db/` |
| External failure policy | FastAPI/Starlette exception handlers; `backend/app/core/errors.py` |
| Embedded/legacy failure messages | Shared exact approved-message catalog and Pydantic `AfterValidator` string annotations; `backend/app/core/public_errors.py`. Producers and DTO/read boundaries apply the same policy. |
| Column-mapping structure | Shared Pydantic `TypeAdapter` JSON parser; `backend/app/services/upload_file_utils.py`. Required-column rules remain with their existing workflow owners. |
| Authentication and diagnostics | PyJWT/Supabase JWKS, API system router; `backend/app/core/auth.py`, `backend/app/api/v1/endpoints/system.py` |
| Browser consumption | Existing Next.js/TypeScript API client and debug panel; no database or credential logic moved into UI |
| Verification | pytest/TestClient with synthetic data, Ruff, TypeScript, GitHub Actions |

## Embedded Failures

Transport handlers cannot sanitize errors already embedded in JSON. The second B05 slice therefore uses explicit producer and read boundaries rather than a blanket response rewrite:

- `public_errors.py` owns approved plain-string messages. Unknown stored/provider error strings become a contextual safe message. Only exact approved legacy reasons are preserved; matching a prefix, truncating text or attempting to remove known secrets is not an approval rule. `None` remains absent, and failure states/counts remain failures.
- Holding price/enrichment, broker status and advisor response models apply the shared policy using Pydantic string validators, keeping their JSON schemas unchanged. History status and raw holding-metrics reads filter old reasons without modifying stored rows. Newly persisted price, enrichment, history and broker failures also use safe messages.
- Upload file/model/database failures use static messages. Both confirm flows and refresh share a strict object-of-string-or-null column-mapping parser; malformed JSON, lists/scalars and nested/non-string values return 422 before importing holdings. Existing required-column checks, accepted-row rules and owner context are retained.
- Provider/news/event/peer/benchmark/optimizer/advisor catches return approved messages while preserving unavailable/empty/fallback distinctions. Fundamentals adapters also filter a returned/cached `error` field, not only raised exceptions. Calculations, source selection and cache ownership are not redesigned.
- A broker `SyncResult.error` now stops before portfolio refresh. Failure metadata remains safe and existing holdings are not replaced by a reported failed sync. Broker integration is still scaffolded; this guard is not connector launch acceptance.

Intentional compatibility changes are failure-message text and wrong-shaped mapping inputs becoming 422 instead of an internal crash. No routes, response fields, model components or success numerical outputs are intentionally changed in this slice. Existing ownership tests still verify the originating owner guard and unchanged database state; service wrappers now expose only a static save-failure message. The first slice's health/diagnostics changes remain as documented above.

Synthetic regressions cover producer exceptions, returned/cached error payloads, malformed mapping shapes, old saved reasons, failure-state preservation, untouched stored rows, no holdings replacement on broker failure, and diagnostics denial even after the user dependency resolves. Tests never require real provider credentials or customer portfolios. B05 closure still requires the reviewed issue's exact-revision delivery evidence, not this document alone.

## Remaining Launch Gates

This is a bounded review of present exception-derived failure boundaries, not a guarantee that arbitrary future provider content is safe. Ordinary user data, uploaded previews, tickers and model-generated content are not globally rewritten or certified by this policy. New error producers must use the catalog; new DTO paths must enforce the same read policy. Full identity/access review remains B07, numerical/provider methodology and rights B15-B17, and browser integration B18-B20.

Broader typed API-contract generation remains B08; durable job/private-file lifecycle is B11-B14; provider contracts and observability are B15/B21. Logging throughout services has not been globally redacted, and the server/framework may still log raised exceptions. Controlled log access and a separate redaction review remain necessary. No production deployment, account setup, credential rotation or migration of real data was performed.

The existing checked-in OpenAPI/TypeScript artifacts predate accepted runtime changes; they are not proof of current API completeness. The first slice compared complete live-generated schemas against B04: existing operation shapes/components stayed unchanged except health/readiness descriptions, with one local-only diagnostic operation added. The second slice preserves operation shapes/components and corrects only the broker-sync description, which incorrectly promised HTTP 501 for the existing structured scaffold response. B08 must regenerate and enforce checked-in artifact drift checks.
