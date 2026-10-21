# Build and Delivery Contract

B06 first slice. [Issue #9](https://github.com/dhruvtantia/P-insight-Beta-version/issues/9)
owns live review, exact-revision checks and delivery evidence. This is not whole-batch
acceptance or production certification.

## Supported Verification Target

| Component | Version source | Install source |
|---|---|---|
| Python | Root `.python-version`: 3.12.13 | Backend isolated virtual environment |
| pip | `backend/requirements-bootstrap.txt`: 26.1 | Exact bootstrap requirement |
| Backend app and test packages | `backend/requirements-lock.txt` | Exact existing pins; no subsequent test-tool upgrades |
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
scripts remain errors. The reviewed native-package hooks (`sharp@0.34.5` and
`unrs-resolver@1.11.1`) are explicitly disabled: their platform binaries are already
integrity-locked optional dependencies. The resolver hook includes an independent
npm/download fallback when binaries are missing, so it is not an approved repair
path. Executable tests check image processing and native module resolution without
these hooks. Unsupported platforms must fail and be reviewed, not fetch a repair.

Backend compatibility is certified only by the recorded checks on the target above,
not by the wider Python range in the existing Poetry manifest. `pyproject.toml`
and `poetry.lock` remain for the next B06 lock-consolidation review; they are not
an interchangeable tested installation path. Do not regenerate either as a side
effect of running the app. The current pip file still mixes application, test and
Poetry tooling, lacks artifact hashes, and may require platform-specific transitive
dependencies. Exact pins and `pip check` improve control but do **not** establish
a fully closed, hash-verified backend environment.

## Local Checks

Start with the exact Python and Node versions above installed. From the repository
root, create a new environment rather than changing an existing one:

```bash
python3.12 --version
python3.12 -m venv backend/.venv
cd backend
. .venv/bin/activate
python -m pip install -r requirements-bootstrap.txt
python -m pip install -r requirements-lock.txt
python -m pip check
python -m ruff check app tests
python -m pytest tests -q
```

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
pnpm run build
pnpm run type-check
```

The current Next.js layout uses `next/font/google`: a clean production build needs
access to Google Fonts in addition to the package registry. A successful build is
not evidence of offline/hermetic reproducibility. Bundling licensed font files is
a separately reviewed follow-up; do not disable certificate checks or substitute
unreviewed downloads to make builds pass. No deployment runs in this workflow.

## Delivery Controls

CI actions use verified full commit references, job tokens have `contents: read`,
and checkout does not persist credentials. Updates to runtime pins, action SHAs,
lockfiles or engine declarations require a reviewed PR and exact-head checks.
`test_build_contract.py` checks the coupled declarations and fail-closed install
commands. Executable frontend tests prove that stale lock specifications and
unsupported Node engines are rejected without resolving or downloading a repair,
and smoke-test both locked native dependencies.
Both jobs keep their existing names:

- `Backend (ruff + pytest + alembic)`
- `Frontend (type-check + build)`

On 2026-10-20, GitHub's branch API reported `main.protected=false`, required status
checks `enforcement_level=off`, and the effective branch-rules endpoint returned
an empty list. This is an observed gap, **not** server enforcement. CODEOWNERS,
green checks and our merge procedure do not prevent another unguarded push.
No repository rules were changed by this slice. Before relying on protection,
verify exact successful job contexts and configure/test required checks and
direct-push restrictions without requiring the sole maintainer to approve their
own PR. Agent COMMENT review is not independent human approval.

## B06 Remaining Gates

1. Consolidate backend dependency ownership and supported Python constraints;
   separate runtime/test/build tooling and verify a complete Linux dependency
   closure with artifact integrity. Compare import, numerical and migration
   behavior before changing packages. Do not claim the existing Poetry/pip files
   already agree.
2. Review current advisories and licenses across both resolved dependency graphs;
   fix or record justified, owned, expiring exceptions. Define secret scanning
   and CI enforcement. No advisory clearance or approved exception is implied here.
3. Configure and exercise repository enforcement after the required context names
   are confirmed, preserving a usable single-maintainer review process.
4. Review the tracked local-runtime directory separately, including references and
   history implications, before any approved cleanup. No runtime artifacts or
   unrelated local evidence are deleted in this slice.
5. Record exact-head and post-merge Linux checks plus safe local reconciliation in
   issue #9. Keep B06 open until **all** acceptance criteria are evidenced; B07 and
   production promotion do not start merely because this first slice passes.
