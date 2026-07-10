# BOM Viewer GitHub Sync

Target: `dutuanan96/bom-viewer-sync`, branch `main`, app folder `bom-viewer-sync/`.

## Entrypoints

- `viewer.html`: generated standalone read-only Viewer. It fetches latest `data.js` from GitHub at runtime.
- `admin.html`: shared-file Admin shell. It reads current data and writes updates through GitHub Contents API.

Shared runtime files:
- `styles.css`
- `app-core.js`
- `app-admin.js`
- `app-viewer.js`
- `data.js`

## Read And Write Rules

- Read with GitHub Contents API raw first and include a cache-busting timestamp.
- Keep `raw.githubusercontent.com` as fallback only.
- Admin tokens must never be hardcoded or committed. The Admin stores the entered token in session storage only.
- The repository must remain public for unauthenticated Viewer reads.
- Current Admin cache versions: `data.js?v=22`, `app-core.js?v=25`, `app-admin.js?v=21`.

## AI Sync Flow

1. Edit and verify files under `outputs\`.
2. Rebuild `viewer.html` with `node work\build_standalone_viewer.mjs`.
3. Run syntax checks, both test suites, and the data audit.
4. Pull/rebase the clone before copying files.
5. Copy only changed runtime/docs. Do not copy `data.js` for UI-only changes.
6. Run clone checks, commit explicit files, and push without force.

The BOM inspector is intentionally disabled in Viewer and Admin because the table already shows the required information.
