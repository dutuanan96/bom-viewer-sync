# JinTai PDM System - Handover (Updated 2026-07-09)

## Summary
The project is a static vanilla JS PDM/BOM system. Recent work focused on auditing the data integrity of the `materialDb` and ensuring GitHub synchronization behaves correctly.

The important current state is:
- The system is completely free of Duplicate Material Codes. 25 duplicate codes were audited, merged, and cleaned without causing any data loss or broken BOM structures.
- A missing zinc-plated screw (`ZGLS3560WH`) was added and mapped to all corresponding white products, fixing a legacy data-entry typo.
- Minor dead code was removed.
- GitHub `data.js` was synchronized and verified.

## What Was Fixed
### Data Integrity (Duplicate Material Codes)
Originally, the `materialDb` contained 25 duplicate codes (e.g. two IDs for `ZGLS3560BH`, one for black and one for zinc-plated). This was an artifact of how the old PDM system forced color differentiation without supporting a unified SKU.

The fix involved:
- Node scripts (`merge_duplicates.mjs`, `merge_remaining.mjs`) were written and executed against the `data.js` file to programmatically merge these IDs.
- For each duplicate code, the most frequently used ID was kept.
- All `bomEntries` pointing to the discarded secondary IDs were safely re-pointed to the primary ID.
- Special overrides were applied for `MS6030YS` (forced wood color) and `BCDB32831723BH` (forced correct name).
- `ZGLS3560WH` was split out correctly from `ZGLS3560BH` and 26 BOM entries for white products were reassigned to it.

### Code Cleanup
- Removed legacy hardcoded zh-CN string in the Material Database column headers. Replaced with `this.label(...)` for i18n support.
- Removed dead code (`structureRows` and `structureRowHtml`).
- Removed leftover `console.log` statements in rendering methods.

## Important Files
- `outputs\app-core.js`
  - Core application logic, including the BOM viewer rendering and data state.
- `outputs\data.js`
  - Contains the JSON `window.BOM_VIEWER_DATA` payload. **This is fully cleaned and contains 0 duplicates.**
- `outputs\admin.html`
- `outputs\viewer.html`
  - The standalone HTML packaged file.
- `work\remote-bom-viewer-sync\bom-viewer-sync\`
  - Git clone pushed to GitHub. Always run `git pull --rebase` here before merging changes to `data.js`, as the user actively saves data to this repo using `admin.html`.

## Verification Already Done
- Ran `audit_data_integrity.mjs`. Confirmed 0 duplicate material codes remain, and the BOM structure is 100% intact (643 materials, 2725 BOM entries).
- Rebuilt `viewer.html` using `work\build_standalone_viewer.mjs`.
- Sync'd all changes to the GitHub repo `dutuanan96/bom-viewer-sync`.

## Recommended Skills For Next Agent
- `systematic-debugging`: if notification/detail/cache does not match expectation.
- `pdm-workflow`: for BOM/material semantics.
- `test-driven-development`: for any new behavior.
- `verification-before-completion`: before reporting done.

## Warnings
- Never expose GitHub tokens.
- Do not hardcode zh/vi UI strings outside the existing i18n dictionaries.
- Always pull latest GitHub clone before pushing, because admin may have saved new data. If a merge conflict happens in `data.js`, abort the rebase, fetch the latest, and re-run your Node scripts against the new data instead of manually resolving.
