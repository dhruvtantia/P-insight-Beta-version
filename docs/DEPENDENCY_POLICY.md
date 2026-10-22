# Dependency Ownership and Security Checks

The live B06 delivery state belongs to [issue #9](https://github.com/dhruvtantia/P-insight-Beta-version/issues/9).
This policy does not certify production or close the remaining B06 gates.

## One Source of Truth

`backend/pyproject.toml` declares the application, test, build-bootstrap and
maintenance-tool groups. `backend/poetry.lock` resolves those groups, including
platform markers and artifact hashes. Python support is the verified 3.12 line;
the exact CI/local target remains the root `.python-version`.

Do not hand-edit these generated installation files:

| File | Exported groups | Purpose |
|---|---|---|
| `backend/requirements-lock.txt` | main | Application environment only |
| `backend/requirements-dev-lock.txt` | main,dev | Application plus tests/lint |
| `backend/requirements-bootstrap.txt` | build | Pinned pip, setuptools, wheel and their dependencies |
| `backend/requirements-tools-lock.txt` | lock | Poetry, export plugin, pip-audit and their dependencies |

Poetry/export/audit tools are not installed in the API environment. CI creates a
separate disposable maintenance environment. Runtime and test exports use the
same resolved versions; every exported requirement is exact and hash-qualified.
Security floors for affected transitive dependencies are explicit in the manifest.
Numerical and numerical-support versions are deliberately retained, not upgraded
as incidental resolver churn.

## Installation and Updates

Use the [build instructions](BUILD_DELIVERY.md) for ordinary installation. Hashed
installation uses `--no-deps`: the resolver has already supplied the complete
graph. `pip check` must then pass; a missing transitive dependency is an error,
not permission to install another version. `--no-build-isolation` prevents an
sdist build from resolving additional unpinned build dependencies. The pinned
bootstrap supplies the existing `multitasking` sdist's setuptools/wheel toolchain.

This is artifact-verified Python installation, not a claim of bit-identical native
builds or fully offline delivery. The selected runner image/system libraries,
registry availability and existing Google Fonts build request remain external
inputs. Production images, wheel promotion and operating-system provenance belong
to the later deployment/promotion gates. Never disable TLS verification, hash
checking or dependency-build restrictions to repair an install.

In the separate maintenance environment with its exact locked tools installed:

```bash
cd backend
python -m poetry lock
python scripts/export_dependencies.py
python scripts/export_dependencies.py --check
python -m pip_audit --disable-pip --no-deps --strict -r requirements-dev-lock.txt -r requirements-tools-lock.txt -r requirements-bootstrap.txt
```

`--check` verifies manifest/lock consistency and exact export bytes without
rewriting them. CI runs it on the pushed revision, along with backend tests,
PostgreSQL migrations/startup and frontend build/type checks. Updates require a
reviewed PR and new exact-head/post-merge evidence; an older green check does not
authorize a new dependency graph.

## Advisory Review Boundary

On 2026-10-21, pip-audit 2.10.1 scanned the previous 103-pin installation list and
reported advisory matches in 14 packages. Its 93 returned records include duplicate
records/aliases and are not 93 distinct confirmed application vulnerabilities.
The old bootstrap pip was also reviewed separately. Package matches establish a
need for remediation/triage, not proof that the application was exploited.

The reviewed update covers the upload parser, compatible FastAPI/Starlette pair,
JWT/cryptography/settings dependencies, affected transitives, pytest and the
separate maintenance/build tools. Keep scans current: a clean result means no
known matches in that database at that time, not absence of vulnerabilities.
Final scan and Linux installation/test outcomes belong to issue #9 once run.

The backend audit gate has no ignored advisory IDs, automatic fixes or
`continue-on-error`. Service/network failures and unknown packages must not become
a green result. No vulnerability exception is approved by this slice. Any future
exception needs documented applicability, mitigation, an owner, expiry and explicit
maintainer review before changing the gate.

## Compatibility Review

FastAPI 0.135.2 supports the patched Starlette 1.3.1 without the later request/form
semantics changes in the newest FastAPI line. This is a deliberate compatibility
choice, not a floating version or a claim that newest always means safest.

The framework upgrade changes generated OpenAPI metadata: five multipart file
properties use `contentMediaType: application/octet-stream` instead of
`format: binary`, and `ValidationError` documents optional `input` and `ctx` fields.
The multipart transport and file/form parameter names are retained. These are
reviewed schema differences, not an assertion of byte-identical OpenAPI.
Full remaining schema equality and real calculation parity are verification gates.
The already-pending reconciliation of stored OpenAPI/generated frontend artifacts
remains B08; this slice does not silently regenerate unrelated artifacts or claim
that historical generated files are current.

## Frontend Review and Gate

The frontend uses the exact Node/pnpm versions in the build contract and one
integrity-qualified `pnpm-lock.yaml`. Ordinary installation is frozen; only an
explicit dependency-maintenance change may resolve a new graph. Do not use
`audit --fix`, ignore registry errors, ignore unfixable advisories or add ignored
GHSA IDs to make checks pass. The frontend CI job runs
`pnpm run audit:dependencies` with the owner-approved exact-backport verification
rule described below. It queries the raw audit at the low-severity threshold,
including dev and optional dependencies, without a registry-error fallback.
`pnpm run audit:raw` remains available and returns the registry's original exit
status. Real pnpm tests against local
synthetic registry responses prove clean success, low-severity rejection,
registry-outage rejection and malformed-response rejection. The audit runs after
build/type checks so a known advisory does not conceal their compatibility result;
any rejected finding or failed verification still fails the same named frontend job.

The 2026-10-21 baseline report contains 69 advisory records across 13 package
names and 57 distinct GHSA identifiers. These are package matches, not proof of
application exploitation. The candidate retains React 18, Tailwind 3, the API
generator and application code. It updates Next.js/eslint-config-next from
15.5.14 to the patched maintenance release 15.5.28, plus affected supporting
dependencies. See the [upstream security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026).

Reviewed overrides address parents with older/exact dependency constraints:
PostCSS 8.5.31, sharp 0.35.5, js-yaml 4.3.2 and postcss-selector-parser 7.1.6.
The selector parser crosses a major version: actual Tailwind/PostCSS compilation,
synthetic CSS equality, production build and stored-schema API-generation parity
must be checked, not assumed from an audit result. The sharp platform-binary smoke
must pass with dependency hooks disabled. Production optional dependencies are
not excluded from security review.

**Locally remediated build dependency, upstream version finding retained:** `braces@3.0.3`,
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), remains
on Tailwind/watch/lint tooling paths. The public npm advisory response suggests
`>=3.0.4`, but the registry has no published 3.0.4 and the GitHub advisory lists
no patched version as of this review. Do not declare it fixed or use an
unreviewed fork. It is absent from the locked production dependency paths;
that does not make untrusted build inputs safe or establish that all bundled
framework internals have been audited. The raw full scan remains red; it is not
represented as a clean scan. A production-only clean scan is supporting evidence,
not a substitute for the full CI gate.

At the owner's request to investigate a real fix rather than move past the
warning, the candidate includes a [pinned local backport](../frontend/patches/README.md)
of the five depth-guard changes from the closed, unmerged upstream proposal.
pnpm's patch-qualified lock applies it during installation; no remote branch is
executed at build time. Six regression tests cover the 100/101 nesting boundary,
stricter/fractional limits, direct ASTs/cycles, retained ordinary behavior and
actual glob/watch consumer resolution. A reverse-patch negative control proves
the original accepts excessive depth and reproduces stack exhaustion under an
explicit 256-KB test stack, while the candidate rejects the same input with the
intended depth error. Default-stack reproduction is not claimed. This is tested
behavioral remediation for that class of input, not an upstream release or
whole-library security clearance.

### Approved Verified-Fix Rule

On 2026-10-21, the owner explicitly answered **"Approve the verified-fix rule"**.
This approves the bounded frontend remediation check, not a blanket advisory
ignore, automatic future renewal, production launch or whole B06 acceptance.
The [review record](../frontend/security/braces-remediation.json) expires at
**2026-11-20 00:00 America/Toronto**. The check fails at that instant until a new
explicit review is recorded or a supported fixed release replaces the backport.
No recurring automation or automatic renewal is configured.

The check verifies approval/dates, exact patch SHA-256 and lock registration,
every file in the installed package, all four reviewed consumer paths, and the
absence of this dependency from the locked runtime/optional closure. It reruns
the real patch regressions and requires their complete passing TAP summary,
queries the public registry with bounded timeouts, prints the raw finding and
validates report coverage, counts, package/version, development-only paths and
reviewed advisory details. Any new/different advisory, unknown schema, command
failure, drift, missing patch or expired review fails. The only permitted
non-clean classification is `verified-local-backport` with one visible known
version match; it must never be labeled `clean`.

The JSON review record is reviewed source, not a signature or attestation from
the upstream publisher. Exact installed-byte checks and behavioural tests do not
protect a compromised runner or maliciously rewritten verification code; normal
code review, integrity-locked installation and repository enforcement remain
separate requirements. `js-yaml@4.3.2`, already present in the resolved graph, is
declared directly as a dev dependency for structured lock/config parsing.

Recharts 2 and ESLint 9 support/deprecation warnings remain separate maintenance
work; a known-advisory scan cannot certify ongoing upstream support. Broader
framework/UI migrations require their own compatibility review. Stored OpenAPI
and generated-type reconciliation remains B08, not a claim of this slice.

## Remaining B06 Work

- Complete exact-head/post-merge acceptance of the frontend verified-fix slice.
- License inventory/approval and repository secret-scanning policy/enforcement.
- Owner-approved GitHub protection setup and effective-rule verification; the
  connected integration currently lacks repository-administration access.
- Separate inventory/review of tracked local-runtime artifacts before any approved
  cleanup. No blanket deletion or history rewrite.

These remain acceptance gates. Passing the backend dependency slice does not
start B07, enable paid/broker features, deploy services or approve a launch.
