# BOM Viewer / PDM Context - Updated 2026-07-10

## Current Goal

Static JinTai BOM/PDM system for 22 LGS furniture products:
- `admin.html`: edits BOM/material data and saves through GitHub Contents API.
- `viewer.html`: standalone read-only local-file Viewer.
- Modules: product BOM, Material Database, parent-child structure, 2D drawings, 3D GLB models, product images, and notification center.

## Important Paths

- Workspace: `C:\Users\HP\Documents\Codex\2026-06-30\ew-html-and-add-real-time`
- Runtime source: `outputs\`
- Build script: `work\build_standalone_viewer.mjs`
- Test scripts: `work\material-master-editor.test.mjs`, `work\restructure.test.mjs`, `work\audit_data_integrity.mjs`
- GitHub working directory: `work\remote-bom-viewer-sync\bom-viewer-sync\`
- Repository: `dutuanan96/bom-viewer-sync`, branch `main`, app folder `bom-viewer-sync/`

## Current Source Of Truth

Use the latest GitHub `main` together with verified files under `outputs\`.

Latest relevant commits:
- `a584029 UI improvements: pagination, search reset, modal scroll fix
- 7b90662 fix: remove redundant bom inspector`
- `ed585e7 fix: improve pdm viewer and admin interactions`
- `a400200 docs: update handover and project context with data audit results`

Data audit state:
- 643 unique materials
- 2725 BOM entries
- 22 products
- 0 duplicate codes
- 0 errors
- 0 warnings

## Intentional BOM UX Decision

The BOM table already displays the required row data. The floating BOM inspector was removed because it duplicated information and reduced table width.

Required behavior:
- `renderInspector()` keeps `#inspectorPanel` hidden and empty in BOM view.
- Plain BOM row clicks do not call `selectBomEntry()`.
- Admin actions inside the table remain available.
- Do not re-enable the BOM inspector unless the user explicitly requests it.

## Data Loading And Cache

Viewer/Admin read latest `data.js` from GitHub Contents API raw first:
`https://api.github.com/repos/dutuanan96/bom-viewer-sync/contents/bom-viewer-sync/data.js?ref=main&t=<timestamp>`

Rules:
- Use `Accept: application/vnd.github.raw` for public reads.
- Keep raw GitHub as fallback only.
- Admin writes through Contents API JSON and uses the current remote SHA.
- Current Admin versions: `data.js?v=22`, `app-core.js?v=26`, `app-admin.js?v=21`.
- If old behavior appears, close/reopen Admin or use Ctrl+F5.

## Notification Flow

- Admin fetches the current remote payload before saving.
- `describePayloadChanges()` diffs material master fields against that remote payload.
- `appendNotificationEvent()` stores a `github-save` event in `data.js`.
- Viewer reads notifications from GitHub-backed data.
- Opening the bell marks events read locally; it does not delete them.
- Current diff coverage is limited to material fields: `name`, `spec`, `material`, `color`, and `attr`.

## Working Flow For AI Agents

1. Read `HANDOVER.md`, `PROJECT_CONTEXT.md`, and `REVIEW_CONTEXT.md`.
2. Work in `outputs\` first and preserve existing vanilla JavaScript patterns.
3. Add/update a regression test before runtime behavior changes.
4. Rebuild standalone Viewer after runtime or shell changes.
5. Run syntax, behavior, restructure, and data-audit checks.
6. For browser testing, confirm Viewer and Admin separately. The Chrome extension cannot automatically navigate to `file:///` URLs; record the smoke test as unavailable unless the local page is already user-opened in Chrome.
7. Pull/rebase the clone before copying files because Admin may have updated `data.js` remotely.
8. Copy `data.js` only for intentional data changes.
9. Verify the clone diff, commit conventionally, and push without force.

## Known Limitations

- Notification diffs do not yet cover arbitrary product/color metadata.
- `data.js` is large and should be changed through application/helper logic, not manual string edits.
- Browser export success has not been verified as a physical downloaded file in the latest run.

