# PDM BOM Viewer - Review Context

## Quick Start

```powershell
cd C:\Users\HP\Documents\Codex\2026-06-30\ew-html-and-add-real-time
```

Review these first:
- `outputs\app-core.js`: shared runtime behavior.
- `outputs\admin.html`: Admin shell and cache versions.
- `outputs\viewer.html`: generated standalone Viewer.
- `outputs\data.js`: GitHub-backed PDM data.
- `work\material-master-editor.test.mjs`: focused UI behavior contracts.
- `work\restructure.test.mjs`: runtime/build contracts.

## Current Behavior Contract

- BOM view must keep the floating inspector hidden and empty.
- Plain BOM row clicks must not select entries solely to open the inspector.
- Admin row controls remain functional.
- Material Database and structure views retain their existing behavior.
- Cache version is `app-core.js?v=25`.

## Build And Verification

```powershell
node work\build_standalone_viewer.mjs
node --check outputs\app-core.js
node --check outputs\app-admin.js
node --check outputs\app-viewer.js
node work\material-master-editor.test.mjs
node work\restructure.test.mjs
node work\audit_data_integrity.mjs
```

Expected baseline after the 2026-07-10 change:
- Material editor tests: 16/16 pass.
- Restructure tests: 13/13 pass.
- Audit: 643 materials, 2725 BOM entries, 22 products, 0 errors, 0 warnings.

## GitHub Data Flow

Read path:
- `fetchCloudPayload()` requests GitHub Contents API raw with `?t=<timestamp>`.
- Header: `Accept: application/vnd.github.raw`.
- Raw GitHub is fallback only.

Admin save path:
- Normalize/sync legacy BOM data.
- Fetch the current remote payload and SHA.
- Diff material master fields against the remote payload.
- Append a notification event.
- PUT the new `data.js` through GitHub Contents API.

Do not change the save diff back to a stale local baseline.

## Clone And Push Flow

```powershell
cd work\remote-bom-viewer-sync\bom-viewer-sync
git remote set-url origin https://github.com/dutuanan96/bom-viewer-sync.git
git pull --rebase origin main
```

For UI-only changes, copy only runtime files such as `app-core.js`, `admin.html`, and rebuilt `viewer.html`. Copy `data.js` only when data was intentionally changed.

Before commit:

```powershell
git diff --check
node --check app-core.js
node --check app-admin.js
node --check app-viewer.js
```

Then stage explicit files, commit conventionally, and `git push origin main` without force.

## Browser Smoke Pattern

- Verify Viewer and Admin separately.
- Click a non-control area of a BOM row.
- Confirm `#inspectorPanel` remains hidden and its HTML remains empty.
- Confirm row action buttons still work in Admin.
- Confirm the Material Database and structure modules still navigate/render.
- Confirm the GitHub Contents API data request returns `200`.

The ChatGPT Chrome extension blocks automatic navigation to local `file:///` URLs. If the file is not already open in a user-controlled Chrome tab, record this smoke check as unavailable instead of bypassing the browser policy.

## Current Gotchas

- Opening the notification bell clears the unread badge locally but does not remove events.
- Root workspace is not a Git repository; the clone is the Git working tree.
- PowerShell does not support `&&` in this environment.
- `data.js` contains both legacy BOM rows and `materialDb`; use application/helpers to keep them synchronized.
- Pull/rebase before every push because Admin may update remote `data.js` at any time.
- Never print a token-bearing remote URL; set the tokenless origin URL directly.
