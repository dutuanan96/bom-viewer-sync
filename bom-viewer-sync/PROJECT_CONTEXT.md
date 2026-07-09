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

As of 2026-07-09, the notification code was pushed through:
- `9763e71 fix: diff notifications against github data`

Latest known data save after that code fix:
- `6528656 chore: update bom data 2026-07-09T09:42:48.153Z`

`outputs/`, the local clone, and Desktop files were synced after `9763e71`.

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

## Recent Real Data Events
1. User edited `LGS101WJBBH`; old admin saved data without notification detail. A manual notification was added earlier.
2. Test edit `LGS111WJBBH` changed spec to `详见明细 / xem chi tiết`, but the later user save at `2026-07-09T06:11:11.656Z` overwrote that test edit. Do not restore it unless user asks.
3. User edited cloth drawer material names/specs:
   - `LGS布抽25.7x28x16.8` -> `LGS布抽25.7x28.2x16.8`
   - `257x280x168mm` -> `257x282x168mm`
   - Affected material codes in latest data:
     `BC255282166KD`, `BC255282166WH`, `BC255282166BH`
   - Latest notification `notif_c8cxp6`, created at `2026-07-09T06:11:11.656Z`, was enriched with six changes for those three materials.
4. User then saved another cloth drawer update after the remote-baseline fix:
   - Git commit: `6528656 chore: update bom data 2026-07-09T09:42:48.153Z`
   - Notification: `notif_1msiku0`
   - Affected material codes:
     `BC298282166BH`, `BC298282166KD`, `BC298282166WH`
   - Changes captured automatically:
     `LGS布抽30x28x16.8` -> `LGS布抽30x28.2x16.8`
     and `300x280x168mm` -> `300x282x168mm`
   - This confirms the new save flow can automatically detect admin changes and notify viewer.

## Current UI State
- Sidebar and product catalog are PDM-style vanilla HTML/CSS/JS.
- Product catalog is SPU-level.
- Product detail supports 2D PDF and 3D GLB modal.
- Material Database and Parent-child structure use per-row edit actions.
- Notification panel appears in top nav with Material Symbols icon.

## Verification Performed After Latest Push
Commands passed:
- `node --check outputs\app-core.js`
- `node --check work\remote-bom-viewer-sync\bom-viewer-sync\app-core.js`
- `node work\restructure.test.mjs` -> 13/13 pass
- `node work\material-master-editor.test.mjs` -> 14/14 pass
- `git diff --check` in clone passed

Browser smoke tests:
- Opened `file:///C:/Users/HP/Desktop/viewer.html`.
- Confirmed it requested GitHub Contents API with status `200`.
- Confirmed notification detail body for `notif_c8cxp6` includes:
  - `BC255282166KD`
  - `LGS布抽25.7x28.2x16.8`
  - `257x282x168mm`
- After the later user save, remote `notif_1msiku0` contains detailed changes for:
  - `BC298282166BH`
  - `BC298282166KD`
  - `BC298282166WH`
- Before clicking bell, badge showed unread count; after clicking, badge became `0` because read state is stored locally.

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
- Do not restore the temporary `LGS111WJBBH` test edit unless explicitly requested.
