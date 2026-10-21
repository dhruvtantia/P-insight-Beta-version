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

## Remaining B06 Work

- Frontend resolved-graph advisory review and any bounded remediation.
- License inventory/approval and repository secret-scanning policy/enforcement.
- Owner-approved GitHub protection setup and effective-rule verification; the
  connected integration currently lacks repository-administration access.
- Separate inventory/review of tracked local-runtime artifacts before any approved
  cleanup. No blanket deletion or history rewrite.

These remain acceptance gates. Passing the backend dependency slice does not
start B07, enable paid/broker features, deploy services or approve a launch.
