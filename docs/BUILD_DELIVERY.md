# Build and Delivery Contract

B06 build and dependency slices. [Issue #9](https://github.com/dhruvtantia/P-insight-Beta-version/issues/9)
owns live review, exact-revision checks and delivery evidence. See the
[dependency ownership/security policy](DEPENDENCY_POLICY.md). This is not
whole-batch acceptance or production certification.

## Supported Verification Target

| Component | Version source | Install source |
|---|---|---|
| Python | Root `.python-version`: 3.12.13 | Backend isolated virtual environment |
| pip/build bootstrap | Generated `backend/requirements-bootstrap.txt`: pip 26.2.2 | Hash-verified build group |
| Backend runtime | Generated `backend/requirements-lock.txt` | Main group; no test/Poetry tools |
| Backend tests | Generated `backend/requirements-dev-lock.txt` | Main and dev groups; no subsequent test-tool upgrades |
| Lock/audit maintenance | Generated `backend/requirements-tools-lock.txt` | Separate environment: Poetry 2.3.4, export plugin 1.10.0, pip-audit 2.10.1 |
| Node | Root `.node-version`: 24.19.0 | Same target in frontend `engines.node` |
| pnpm | `frontend/package.json`: 11.15.1 plus SHA-512 | `pnpm/action-setup` reads that manifest in CI |
| Frontend packages | `frontend/pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
| Linux CI | `ubuntu-24.04` | Both existing named jobs, each with a 20-minute timeout |

The old CI Node 20 target did not match pnpm 11's engine requirement. The frontend
now rejects unsupported Node/pnpm versions through `engines` and `engineStrict` in
`frontend/pnpm-workspace.yaml` (pnpm 11 does not read this setting from `.npmrc`).
There is no npm install fallback or second frontend lockfile. Do not repair a
failed frozen install by removing the lock or installing newer packages.

After installation, pnpm's dependency-status check is configured to error on drift
instead of silently installing again (`verifyDepsBeforeRun: error`). Always run
the frozen install first; this setting is not proof of a complete installation.
Unknown dependency build
scripts remain errors. The reviewed native-package hook policy (`sharp@0.35.5` and
`unrs-resolver@1.11.1`) are explicitly disabled: their platform binaries are already
integrity-locked optional dependencies. The resolver hook includes an independent
npm/download fallback when binaries are missing, so it is not an approved repair
path. Executable tests check image processing and native module resolution without
these hooks. Unsupported platforms must fail and be reviewed, not fetch a repair.

`backend/pyproject.toml` is the manifest and `backend/poetry.lock` is the single
resolved graph for the Python 3.12 line. The four installation exports include
platform markers and artifact hashes; the export-check command rejects drift.
Installations neither resolve additional dependencies nor create an unpinned
isolated build environment. `pip check` must pass afterward. Do not regenerate
the lock/exports as a side effect of starting the app or silently install tools
into the API environment. This is not a claim of hermetic native/system builds;
see the dependency policy for the pinned sdist build and external-input limits.

## Local Checks

Start with the exact Python and Node versions above installed. From the repository
root, create a new environment rather than changing an existing one:

```bash
python3.12 --version
python3.12 -m venv backend/.venv
cd backend
. .venv/bin/activate
python -m pip --isolated install --require-hashes --no-deps -r requirements-bootstrap.txt
python -m pip --isolated install --require-hashes --no-deps --no-build-isolation -r requirements-dev-lock.txt
python -m pip check
python -m ruff check app tests
python -m pytest tests -q
```

For an application-only environment, use `requirements-lock.txt` instead of the
dev export; the bootstrap command is unchanged. To verify/update exports, use a
separate empty virtual environment, install bootstrap then tools export with the
same hash/no-deps/no-build-isolation flags, and run the commands in the dependency
policy. CI demonstrates this exact split and blocks stale exports or advisory
matches. Do not use Poetry's implicit environment installation as an alternative
to these checked pip commands.

The Python version must match `.python-version`, not just its major/minor number.
If `.venv` already exists, choose another empty environment path; do not overwrite
it. This install requires package-index access. See [runtime safety](RUNTIME_SAFETY.md)
before starting the server or choosing any database. Tests use disposable data;
production configuration and migrations are a separate operation.

With Node 24.19.0 active, install pnpm 11.15.1 using your existing package-manager
setup (for example, `npm install --global pnpm@11.15.1`). Then from `frontend`:

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm run test:toolchain
pnpm run test:dependencies
pnpm run test:patches
pnpm run test:remediation
pnpm run test:licenses
pnpm run test:lint
pnpm run lint
pnpm run license:inventory /tmp/frontend-licenses-new.json
pnpm run build
pnpm run type-check
pnpm run audit:dependencies
```

The current Next.js layout uses `next/font/google`: a clean production build needs
access to Google Fonts in addition to the package registry. A successful build is
not evidence of offline/hermetic reproducibility. Bundling licensed font files is
a separately reviewed follow-up; do not disable certificate checks or substitute
unreviewed downloads to make builds pass. No deployment runs in this workflow.
The raw frontend audit still flags the build-only `braces` version; use
`pnpm run audit:raw` to inspect its original result. The owner explicitly approved
the exact-backport verification rule in the dependency policy. The required
`audit:dependencies` check prints the raw finding, verifies the installed fix and
scope, and reports `verified-local-backport`, not a clean scan. It fails on
2026-11-20 at 00:00 America/Toronto unless explicitly re-reviewed/replaced.
A successful build, patch test or production-only scan is not whole-batch
acceptance. No blanket advisory suppression or automatic renewal is permitted.

## Delivery Controls

Frontend [linting](FRONTEND_LINT.md) is an unattended ESLint CLI check using the
existing Next 15 preset and a directly declared, already-locked FlatCompat tool.
CI runs real rejection tests and lint before Build in the existing frontend job.
All errors fail; five pre-existing hook/accessibility warnings remain visible
under a fixed ceiling, not disabled or declared resolved. Unused suppression
comments fail. Financial/browser-state fixes remain separate acceptance work.

CI actions use verified full commit references, job tokens have `contents: read`,
and checkout does not persist credentials. All four pinned action implementations
declare the supported Node 24 action runtime, rather than relying on the runner
to upgrade a deprecated Node 20 action. Updates to runtime pins, action SHAs,
lockfiles or engine declarations require a reviewed PR and exact-head checks.
`test_build_contract.py` checks the coupled declarations and fail-closed install
commands. Dependency tests check exact hashes/group separation, reject stale
exports without repairing them, and exercise real pip hash/dependency failures
with offline synthetic wheels. Executable frontend tests prove that stale lock specifications and
unsupported Node engines are rejected without resolving or downloading a repair,
and smoke-test both locked native dependencies.
Both jobs keep their existing names:

- `Backend (ruff + pytest + alembic)`
- `Frontend (type-check + build)`

The backend job also runs [committed-history secret checks](SECRET_SCANNING.md)
before application dependency installation: a hash-pinned disposable scanner,
full-history checkout and synthetic rejection tests. It adds no runtime dependency
or third required-check name. Count-only output is deliberate; raw reports must
never become public CI artifacts. The [tracked-runtime inventory](TRACKED_RUNTIME_REVIEW.md)
is read-only, not cleanup approval.

CI also validates [license inventories](LICENSE_REVIEW.md) in the separate
Python runtime/dev/maintenance environments and the frozen frontend install.
Only four named sanitized JSON inventories are retained as GitHub artifacts for
14 days, using the pinned Node 24 upload action; no secret-scan report or broad
directory upload is permitted. A successful inventory check still says license
review is required. Artifact text verification, notices and owner/legal approval
remain gates, not implied by these reports. Choose unused output paths for local
inventory commands: existing files are never overwritten.

On 2026-10-20, GitHub's branch API reported `main.protected=false`, required status
checks `enforcement_level=off`, and the effective branch-rules endpoint returned
an empty list. This is an observed gap, **not** server enforcement. CODEOWNERS,
green checks and our merge procedure do not prevent another unguarded push.
No repository rules were changed by this slice. Before relying on protection,
verify exact successful job contexts and configure/test required checks and
direct-push restrictions without requiring the sole maintainer to approve their
own PR. Agent COMMENT review is not independent human approval.

## B06 Remaining Gates

1. Use issue #9's accepted PR #19-#24 evidence for toolchain, dependency,
   secret/runtime-review, inventory and lint slices; do not repeat delivery that
   already passed. Preserve reviewed framework schema differences and scan limits.
2. Finish exact artifact/component texts, notices and explicit license choices
   for actual distribution. PR #25's separate evidence draft needs current-main
   integration/review/checks before authorized delivery; it is not legal approval.
3. Configure and exercise repository enforcement after the required context names
   are confirmed, preserving a usable single-maintainer review process.
4. Preserve the tracked-runtime disposition accepted in PR #22. No artifact
   cleanup, index removal or history rewrite is authorized.
5. Record exact-head and post-merge Linux checks plus safe local reconciliation in
   issue #9. Keep B06 open until **all** criteria are evidenced. Under the owner's
   [core-first order](CORE_RELEASE.md), code-only C2/B07 and private synthetic C1
   preparation can overlap pending admin/commercial work; applicable controls
   still block affected data use/release. No automatic production promotion.
