# End-User Token Contract

C2/B07 first code slice, tracked in
[issue #10](https://github.com/dhruvtantia/P-insight-Beta-version/issues/10).
This is a shared backend verification boundary, not completed onboarding,
session revocation, invitation control or production authentication acceptance.

## Verification Boundary

`backend/app/core/auth.py` owns token verification before resolving a local
`User`. API modules continue using the existing shared FastAPI dependencies;
they do not implement independent JWT rules. Pydantic Settings validates the
trusted project origin and non-empty, whitespace-free-at-the-edges audience
whenever `AUTH_ENABLED=true`, including local tests using legacy HS256.
Staging/production retain the stronger non-local HTTPS requirement.

The required signed claims are `iss`, `aud`, `sub`, `iat`, `exp` and `role`:

- Issuer exactly equals configured `SUPABASE_URL` without its optional trailing
  slash, followed by `/auth/v1`. It is not learned from the incoming token.
- Audience must match `SUPABASE_JWT_AUD`; a standard audience array containing
  that audience remains supported. Role must be `authenticated`; anonymous and
  service-role API credentials are not end-user access tokens.
- Subject is an opaque, non-empty string of at most 64 characters, matching the
  existing database column. Whitespace/control characters are rejected, not
  trimmed into another identity. This does not add a UUID-only database migration.
- Issue/expiry times and optional `nbf` use non-negative whole-second integers,
  never booleans, numeric strings, fractional or non-finite numbers. PyJWT checks
  expiry/future issue/not-before times with no clock leeway. Issue/not-before
  must precede expiry. Deployed clocks must be kept accurate.
- Optional email is null or a string of at most 255 characters without control
  characters. It is profile
  metadata, not proof of email verification or invitation. Identity remains the
  configured issuer's subject, never email.

Supabase anonymous-sign-in sessions can also carry the `authenticated` role.
This role check is not an invitation allowlist and does not replace controlling
signup/anonymous sign-in or proving the chosen onboarding policy externally.

HS256 verifies only with the explicitly configured legacy shared secret.
ES256/RS256 verify only with the configured project's JWKS. The selected JWK's
algorithm must agree with the token's approved asymmetric path. Token-supplied
`jku`/`jwk` headers cannot supply the verification endpoint or key. The two key
families never share key material. Unsupported algorithms fail closed.

Malformed/invalid tokens, unavailable keys and malformed JWKS return sanitized
401 responses with `WWW-Authenticate: Bearer`, before creating/updating a local
user. Expired tokens retain the existing static expiry message. No provider
exception, incoming token or arbitrary key identifier is returned in the error.
Auth-disabled local single-user behavior is unchanged and is not a remote mode.

## Key Lifecycle

Use the pinned PyJWT `PyJWKClient`, not a custom crypto/cache implementation:

- Project-keyed client cache; JWKS set lifetime 300 seconds per process.
- No unbounded-lifetime individual signing-key cache.
- Five-second network timeout with normal TLS verification retained.
- Thirty-second unknown-key refresh cooldown. A just-published key can be
  rejected temporarily during this interval; do not disable the cooldown to
  accept it or enable a signature/issuer fallback.
- Cached keys remain usable until cache expiry. Removed or changed keys are
  re-evaluated after expiry, and an unavailable refresh does not establish trust.

This is an application-cache policy, not a guaranteed global revocation time.
Provider-side caches/rotation procedures and each process's state still matter.
Publish new keys before issuing tokens and rehearse rotation externally. A JWT
that remains valid can still work after browser logout; session revocation and
old-browser-response rejection require separate backend/browser work.

## Verification And Remaining Work

Synthetic tests use local HMAC/EC/RSA keys and the real PyJWT verifier. Token
contracts exercise protected API calls, required/malformed claims, exact issuer,
wrong audience, timestamps, database-safe identity/profile fields and no user
creation on rejection. Existing upload creation/progress, cache and tenancy tests
retain their assertions and now issue complete synthetic access tokens.
JWKS tests replace only outbound transport, exercise the real set cache, advance
a local monotonic clock without sleeping, and cover rotation/removal/same-ID key
changes, bounded unknown-key refreshes and malformed provider responses.

This slice does not change dependencies, database schema, feature flags, UI,
uploads, enrichment or deployments. Remaining B07 gates include concurrent
first-user provisioning, complete private identifier/resource coverage, session
lifecycle policy and applicable PostgreSQL/external Supabase acceptance. B08 API
artifact reconciliation and B09 revision/transaction constraints remain separate.
No real provider account, key, customer portfolio or service purchase is required
for these tests. Tests passing do not make the hosted product available.

## Tools And References

| Responsibility | Tool / owner |
|---|---|
| Signature and standard time/issuer/audience checks | Pinned PyJWT and cryptography; `backend/app/core/auth.py` |
| Trusted environment configuration | Pydantic Settings; `backend/app/core/config.py` |
| Shared request identity | FastAPI dependencies and existing SQLAlchemy User lookup |
| Synthetic protocol/database regressions | pytest, TestClient, local keys and disposable SQLite |
| Delivery | Existing Ruff, strict dependency/security controls and GitHub Actions; unchanged |

- [Supabase JWT claims](https://supabase.com/docs/guides/auth/jwt-fields)
- [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts)
- [PyJWT verification options and JWKS client](https://pyjwt.readthedocs.io/en/stable/api.html)
