# Tracked Local Runtime Inventory

Read-only B06 inventory at accepted source
`65e23b007ecea44d49d9e7b9bb1132025fb3ca25`, reviewed 2026-10-22. Live acceptance
belongs to [issue #9](https://github.com/dhruvtantia/P-insight-Beta-version/issues/9).
No files are deleted, untracked, executed, upgraded or rewritten by this review.

## Observed State

`.codex_phase11_poetry/` is an installed, machine-specific Python tooling environment
tracked in Git, not application source or an authoritative dependency manifest.
Git tree metadata shows:

| Item | Count |
|---|---:|
| Tracked tree entries | 1,968 |
| Regular non-executable files | 1,929 |
| Executable regular files | 36 |
| Symlinks | 3 |
| Uncompressed Git blob content bytes | 35,819,356 |

Bytes are not checkout disk use, Git pack size or space recoverable by deleting
current files. Installed scripts, metadata, licenses and macOS extension binaries
are present. Symlinks and environment launchers make it unsuitable as a portable
build environment. Absolute machine-specific values are not reproduced here.

The directory entered tracked history in `50d0ef5` (2026-05-26). A bounded search
of `.github/`, `backend/scripts/`, `backend/tests/`, `docs/`, root `.gitignore` and
`frontend/package.json` found no references to its name before this inventory.
This is not proof no external workflow uses it. Accepted CI does not install or
execute it; it creates fresh environments from the reviewed hash-qualified exports.

Reproduce the inventory without reading private environment/data files:

```bash
git ls-files .codex_phase11_poetry | wc -l
git ls-tree -r --long HEAD .codex_phase11_poetry
git log --format='%h %ad %s' --date=short -- .codex_phase11_poetry
```

## Safe Disposition

Preserve the directory and history in this slice. Do not use it as the app runtime,
license inventory source or trusted bootstrap; use [BUILD_DELIVERY.md](BUILD_DELIVERY.md).
Its installed license files do not establish the current lock's obligations.

A separately approved cleanup can stop tracking only this directory while retaining
the local copy, with a root ignore rule. First confirm external consumers with the
owner, create a recoverable backup, verify the fresh supported toolchain, review
the exact index-only removal and test both CI jobs on that cleanup PR. Do not
combine this with unrelated generated-data deletion. Current-tree removal does
not erase historical blobs or guarantee smaller clones. History rewriting/purging
requires a separate explicit decision and branch/clone/worktree coordination.

This inventory does not authorize cleanup or complete license/security review.
No broad clean, reset, force push, credential search or environment-file read is
part of the proposed disposition. Preserve locked worktrees, private audit archives
and untracked owner files.
