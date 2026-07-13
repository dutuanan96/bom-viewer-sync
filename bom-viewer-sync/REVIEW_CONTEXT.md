# PDM BOM Viewer Review Context

## Review Targets

Review editable modules under `work/remote-bom-viewer-sync/bom-viewer-sync/src/` and the build scripts. `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html` are generated artifacts, never manual edit targets.

Build with `npm run build`; run `npm run check` for the complete local gate. The generated cache ID is a dynamic 12-character build hash (current output: `afb6a28bd88c`), not a fixed version number. Viewer program changes require a rebuilt and redistributed `viewer.html`; Viewer reloads still receive GitHub/Drive data changes.

## Required Contracts

- The BOM inspector stays hidden and empty when a plain BOM row is clicked.
- Admin reads current remote data and SHA before saving through GitHub Contents API.
- Public data reads prefer cache-busted Contents API raw responses, with raw GitHub only as fallback.
- Notifications are GitHub-backed; opening the bell changes only local read state.
- Generated artifacts must not contain tokens, `Authorization` secrets, local absolute paths, or inline source maps.

## Mirror Review

Outer `outputs/` is a verified runtime mirror, not editable source. For code-only work, mirror the four generated files and synchronized docs only; never copy `data.js`. Verify SHA-256 equality for every mirrored file, confirm obsolete runtime artifacts are absent, and preserve both clone and output `data.js` hashes.

Before integration, syntax-check the outer compatibility wrappers but do not execute them: they intentionally resolve to the canonical main clone. Run the equivalent build, UI-contract (16), runtime-contract (13), and data-audit commands directly from the feature worktree instead.

## Expected Gates

- Repository: 52 tests, audit 643/2725/22 with 0 errors and 0 warnings, generated check, and `app-admin.js` syntax.
- Direct feature contracts: 16 UI tests and 13 runtime tests.
- The non-gating `work/material-db.test.mjs` baseline remains 8/10.
