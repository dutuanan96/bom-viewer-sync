# BOM Viewer / PDM Context - Updated 2026-07-09

## Current Goal
Static JinTai BOM/PDM system for 22 LGS furniture products. It has:
- `admin.html`: admin edits BOM/material data and saves to GitHub.
- `viewer.html`: read-only viewer for end users, distributed as a local file.
- PDM-style modules: product BOM, material database, parent-child structure, 2D drawings, 3D GLB viewer, product images, and notification center.

## Important Paths
- Workspace: `C:\Users\HP\Documents\Codex\2026-06-30\ew-html-and-add-real-time`
- Source/output files: `outputs\admin.html`, `outputs\viewer.html`, `outputs\styles.css`, `outputs\app-core.js`, `outputs\app-admin.js`, `outputs\app-viewer.js`, `outputs\data.js`
- Desktop files used by the user: `C:\Users\HP\Desktop\admin.html`, `C:\Users\HP\Desktop\viewer.html`
- Local GitHub clone: `work\remote-bom-viewer-sync\bom-viewer-sync\`
- GitHub repo: `dutuanan96/bom-viewer-sync`, branch `main`, folder `bom-viewer-sync/`

## Current Source Of Truth
Use the latest GitHub `main` plus `outputs/`.

As of 2026-07-09, the Data Integrity Audit was successfully completed:
- `03d4833 chore: remove deprecated unused methods in app-core`
- `ac70cfc fix: merge all remaining duplicate materials with specific rules for MS6030YS and BCDB`
- `8c21114 fix: add missing ZGLS3560WH material and map white products to it`

Runtime files were synced to `outputs/` and pushed to GitHub. `data.js` is perfectly clean.

## Data Structure Highlights (Data Audit 2026-07-09)
The `materialDb` previously suffered from 25 Duplicate Material Codes.
This occurred because the old system required duplicating a material code to differentiate versions (e.g., Zinc-plated vs. Black, or White vs. Black vs. Wood color).
This has been fully audited and migrated:
1. **Zero Duplicates**: All duplicate codes were automatically merged into a single unique SKU. All corresponding `bomEntries` were updated instantly without data loss.
2. **Missing `ZGLS3560WH`**: Fixed an old typo where the zinc-plated screw was incorrectly named `ZGLS3560BH`. It was moved to the newly created `ZGLS3560WH` for white products.
3. **Dead Code**: Cleaned up `structureRows` and `structureRowHtml`.
4. **Data Stats**: 643 unique materials, 2725 BOM entries, 22 products. 0 duplicates, 0 errors, 0 warnings.

## Data Loading / Cache Rules
Do not rely on `raw.githubusercontent.com` for freshness. It can cache after a save.

Current runtime flow:
- Viewer/admin first read `data.js` through GitHub Contents API raw:
  `https://api.github.com/repos/dutuanan96/bom-viewer-sync/contents/bom-viewer-sync/data.js?ref=main&t=<timestamp>`
- Header for public read is only:
  `Accept: application/vnd.github.raw`
- Raw GitHub URL remains fallback only.
- Admin save uses GitHub Contents API JSON, not raw URL.

Admin HTML cache-bust versions were bumped:
- `data.js?v=22`
- `app-core.js?v=23`
- `app-admin.js?v=21`

If user reports old behavior, ask them to close/reopen `admin.html` or Ctrl+F5 so it loads `app-core.js?v=23`.

## Notification System
The bell notification is now functional.

Current behavior:
- Every admin `保存到 GitHub` creates a `github-save` notification in `data.js`.
- Viewer loads notifications from GitHub data.
- Opening the bell marks notifications read in localStorage, so badge may go to `0`; item remains in the panel.

Notification detail logic:
- `describePayloadChanges(previousPayload, nextPayload)` compares material master records.
- It currently tracks `materialDb.materials` fields:
  `name`, `spec`, `material`, `color`, `attr`
- It stores up to `NOTIFICATION_CHANGE_LIMIT = 8` changes per notification.
- Viewer renders the first 3 change lines, then `+N` for remaining changes.
- Save flow now diffs against the current GitHub file, not stale local state:
  `writeGithubData()` calls `fetchGithubFile(token)` and then `describePayloadChanges(remoteFile.payload, payload)`.
- This fixed the case where admin had an old cached baseline and notification became generic.

Important helper functions in `outputs\app-core.js`:
- `fetchCloudPayload()` - viewer/admin read latest data via GitHub Contents API raw first.
- `fetchGithubFile(token)` - admin fetches current GitHub JSON, SHA, and payload before saving.
- `decodeBase64Utf8()` - decodes Contents API JSON `content`.
- `describePayloadChanges()` - computes notification `changes`.
- `appendNotificationEvent()` - prepends notification event.
- `notificationBody()` / `notificationChangeText()` - renders detail in the bell panel.

## Current UI State
- Sidebar and product catalog are PDM-style vanilla HTML/CSS/JS.
- Product catalog is SPU-level.
- Product detail supports 2D PDF and 3D GLB modal.
- Material Database and Parent-child structure use per-row edit actions.
- Notification panel appears in top nav with Material Symbols icon.

## Verification Performed After Latest Push
Browser smoke tests:
- Opened `file:///C:/Users/HP/Desktop/viewer.html`.
- Confirmed it requested GitHub Contents API with status `200`.
- Verified UI functionality.
Data Validation:
- Ran `audit_data_integrity.mjs`. Confirmed 0 duplicate material codes remain and BOM structure is 100% intact.

## Known Limitations / Next Improvements
- Notification diff currently focuses on material master fields only. If future edits are product-level metadata only, such as product color display name or product size not reflected in `materialDb.materials`, add product/color diff coverage to `describePayloadChanges()`.
- Existing notification rendering shows only first 3 changes plus `+N`. For a more PDM-like audit view, add expandable detail rows.
- `data.js` is large; always verify after edits and avoid hand-editing it without parser/helper scripts.

## Recommended Skills For Next AI Agent
- `systematic-debugging` for notification/cache/data sync issues.
- `pdm-workflow` for BOM/material semantics.
- `test-driven-development` for behavior changes.
- `verification-before-completion` before claiming done.

## Do Not Do
- Do not expose or commit GitHub tokens or secrets.
- Do not hardcode new zh-CN/vi UI text outside i18n dictionaries.
- Do not push from clone before syncing from `outputs/` or pulling latest remote.
