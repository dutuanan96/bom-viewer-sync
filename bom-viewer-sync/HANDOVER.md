# JinTai PDM System - Handover (Updated 2026-07-10)

## Summary

This is a static vanilla JavaScript PDM/BOM system for 22 JinTai LGS furniture products.

Current important state:
- Data integrity is clean: 643 materials, 2725 BOM entries, 22 products, 0 duplicate material codes, 0 audit errors, and 0 warnings.
- GitHub reads prefer the Contents API raw response with a cache-busting timestamp. Raw GitHub is fallback only.
- Latest pushed runtime commit: `a584029 UI improvements: pagination, search reset, modal scroll fix`.
- BOM rows intentionally do not open a floating inspector. The BOM table already contains the required Viewer/Admin information.
- Material Database and parent-child structure behavior remains unchanged.

## Latest Runtime Changes

- `partNumber` label in zh locale changed from `鐗╂枡缂栧彿` to `鐗╂枡缂栫爜` to avoid confusion with `缂栧彿` (componentNumber).
- CSV export removed 鈥?only Excel export remains (button and method).
- Admin can add new products via "鏂板浜у搧" button in the Product Catalog toolbar.
- Material Database headers use i18n labels.
- Parent-child structure changes call `markDirty()` and immediately show unsaved status.
- The redundant BOM inspector is suppressed in Viewer and Admin.
- Plain BOM row clicks no longer select a row solely to open the removed inspector.
- Admin cache bust is `app-core.js?v=26`.
- Standalone `viewer.html` was rebuilt after the runtime change.

## Important Files

- `outputs\app-core.js`: main runtime, rendering, i18n, material/BOM behavior, notifications, and GitHub sync.
- `outputs\data.js`: large `window.BOM_VIEWER_DATA` payload. Avoid hand-editing.
- `outputs\admin.html`: Admin shell and cache-busted shared script references.
- `outputs\viewer.html`: generated standalone Viewer.
- `work\build_standalone_viewer.mjs`: rebuilds `outputs\viewer.html`.
- `work\remote-bom-viewer-sync\bom-viewer-sync\`: local GitHub working directory.

## Required Flow For Next Agent

1. Read `HANDOVER.md`, `PROJECT_CONTEXT.md`, and `REVIEW_CONTEXT.md`.
2. Edit verified source/runtime files under `outputs\` first.
3. Rebuild Viewer after shell, style, core, or Viewer runtime changes:
   ```powershell
   node work\build_standalone_viewer.mjs
   ```
4. Run the complete verification set:
   ```powershell
   node --check outputs\app-core.js
   node --check outputs\app-admin.js
   node --check outputs\app-viewer.js
   node work\material-master-editor.test.mjs
   node work\restructure.test.mjs
   node work\audit_data_integrity.mjs
   ```
5. Reset the clone remote to the tokenless URL and pull before copying files:
   ```powershell
   cd work\remote-bom-viewer-sync\bom-viewer-sync
   git remote set-url origin https://github.com/dutuanan96/bom-viewer-sync.git
   git pull --rebase origin main
   ```
6. Copy only intentionally changed runtime/docs into the clone. Do not copy `data.js` for UI-only work.
7. Run `git diff --check` and JavaScript syntax checks in the clone.
8. Commit with a conventional message and push without force.

## Guardrails

- Never expose, log, or commit GitHub tokens.
- Do not re-enable the BOM inspector unless the user explicitly changes this UX decision.
- Do not hardcode zh-CN or Vietnamese UI text outside the i18n dictionaries.
- Do not assume `raw.githubusercontent.com` is fresh immediately after an Admin save.
- The workspace root is not a Git repository; commit and push from the local clone.
- PowerShell here does not support `&&`; run commands separately.

