# JinTai PDM System - Handover

## Summary
The project is a static vanilla JS PDM/BOM system. The recent work focused on making the bell notification behave like a real PDM notification/audit event when admin saves to GitHub.

The important current state is:
- Notification code has been pushed through `9763e71 fix: diff notifications against github data`.
- The user’s latest known real data save is `6528656 chore: update bom data 2026-07-09T09:42:48.153Z`.
- Desktop files have been synced from `outputs/`.
- Notifications `notif_1msiku0` and `notif_c8cxp6` contain detailed `changes`.

## What Was Fixed
Originally the bell only showed a generic message:

`Admin 已保存 BOM/物料数据，Viewer 可同步最新版本。`

It did not show what changed.

The fix added:
- Notification events stored in `data.js`.
- Change detail capture in `changes`.
- Viewer rendering of changed material code, field, before value, and after value.
- GitHub Contents API raw read to avoid `raw.githubusercontent.com` cache delay.
- Admin save diff against current GitHub data, not only local `loadedPayload`.

## Why Remote Baseline Matters
The user saved from admin and saw notification `2026/7/9 13:11:11` without details. Investigation showed:
- Remote `data.js` had notification `notif_c8cxp6`, but it had no `changes`.
- The edited drawer materials were already changed in `materialDb`.
- Generic notification happened because admin either ran old/cached code or diffed against a stale local baseline.

The final save flow now:
1. Admin builds the next payload.
2. Admin fetches current GitHub `data.js` and SHA with `fetchGithubFile(token)`.
3. Admin computes `describePayloadChanges(remoteFile.payload, payload)`.
4. Admin writes notification with `changes`.
5. Admin PUTs with the same SHA.

Do not regress this flow.

## Latest Real User Edit
User changed cloth drawer material name/spec:
- `LGS布抽25.7x28x16.8` -> `LGS布抽25.7x28.2x16.8`
- `257x280x168mm` -> `257x282x168mm`

Affected material codes:
- `BC255282166KD`
- `BC255282166WH`
- `BC255282166BH`

Notification `notif_c8cxp6` was enriched with six changes:
- name/spec for KD
- name/spec for WH
- name/spec for BH

Viewer smoke test confirmed body contains:
- `BC255282166KD`
- `LGS布抽25.7x28.2x16.8`
- `257x282x168mm`

After the remote-baseline fix, the user saved another real edit:
- Commit: `6528656 chore: update bom data 2026-07-09T09:42:48.153Z`
- Notification: `notif_1msiku0`
- Affected material codes:
  `BC298282166BH`, `BC298282166KD`, `BC298282166WH`
- Automatically captured changes:
  `LGS布抽30x28x16.8` -> `LGS布抽30x28.2x16.8`
  and `300x280x168mm` -> `300x282x168mm`

## Important Files
- `outputs\app-core.js`
  - `fetchCloudPayload()`
  - `fetchGithubFile(token)`
  - `decodeBase64Utf8()`
  - `describePayloadChanges()`
  - `appendNotificationEvent()`
  - `notificationBody()`
- `outputs\data.js`
  - contains latest BOM data and notification payloads.
- `outputs\admin.html`
  - cache-bust scripts:
    - `data.js?v=22`
    - `app-core.js?v=23`
    - `app-admin.js?v=21`
- `outputs\viewer.html`
  - rebuilt standalone viewer.
- `work\remote-bom-viewer-sync\bom-viewer-sync\`
  - Git clone pushed to GitHub.

## Verification Already Done
Commands passed:

```powershell
node --check outputs\app-core.js
node --check work\remote-bom-viewer-sync\bom-viewer-sync\app-core.js
node work\restructure.test.mjs
node work\material-master-editor.test.mjs
```

Results:
- `restructure.test.mjs`: 13/13 pass.
- `material-master-editor.test.mjs`: 14/14 pass.

Remote verification:
- GitHub Contents API returned status `200`.
- Remote notification `notif_c8cxp6` has six `changes`.
- Remote notification `notif_1msiku0` has six `changes`, proving automatic diff works after the fix.
- Latest remote material records for `BC298282166BH/KD/WH` have `300x282x168mm`.

Browser verification:
- Opened `file:///C:/Users/HP/Desktop/viewer.html`.
- Cleared localStorage.
- Confirmed notification body shows detailed drawer changes.
- Confirmed opening bell marks notifications as read and badge becomes `0`.

## Current Limitations
- Diff tracks `materialDb.materials` only for fields:
  `name`, `spec`, `material`, `color`, `attr`.
- If future user edits are product/color-only fields not reflected in `materialDb`, extend `describePayloadChanges()`.
- Notification panel shows first 3 changes plus `+N`; it does not yet expand all changes in UI.

## Recommended Skills For Next Agent
- `systematic-debugging`: if notification/detail/cache does not match expectation.
- `pdm-workflow`: for BOM/material semantics.
- `test-driven-development`: for any new behavior.
- `verification-before-completion`: before reporting done.

## Warnings
- Never expose GitHub tokens.
- Do not hardcode zh/vi UI strings outside the existing i18n dictionaries.
- Always pull latest GitHub clone before pushing, because admin may have saved new data.
- Do not restore the temporary `LGS111WJBBH` test edit. It was overwritten by the user’s later real save.
