# JinTai PDM System Handover

## Working Rule

Work in the canonical project root: `work/remote-bom-viewer-sync/bom-viewer-sync/`. Application source lives in `src/`; build scripts, tests, and project configuration remain editable source-of-truth files. The generated deliverables are `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html`; never edit them directly.

Build with `npm run build`, then run the complete local gate with `npm run check`. The current generated build ID is `7ab045092fbb`, but it is a dynamic 12-character source hash rather than a release version. A changed program, stylesheet, or shell requires rebuilding and redistributing `viewer.html`.

## Mirror And Compatibility Flow

1. Verify the feature worktree first.
2. Mirror only the four generated files and the four workflow documents to outer `outputs/`.
3. Treat `outputs/` as a verified runtime mirror, never as the source tree.
4. Do not copy `data.js` for a code-only change.
5. Use the outer `work/*.mjs` compatibility wrappers only after the canonical main clone contains the integrated build; before merge, run their direct feature-worktree equivalents.

Viewer reloads continue to fetch current GitHub/Drive data and assets. Admin saves must read the current remote payload and SHA before producing a GitHub Contents API write. The notification bell only clears local unread state.

## Required Checks

```powershell
cd work\remote-bom-viewer-sync\bom-viewer-sync
npm run build
npm run check
node --check app-admin.js
git diff --check
```

Expected baselines are 55 repository tests, Material Master 16/16, runtime 13/13, and audit 643 materials / 2725 BOM entries / 22 products / 0 errors / 0 warnings.

## Guardrails

- Keep the BOM inspector hidden and empty for plain BOM-row clicks.
- Do not hardcode UI translations outside the i18n dictionary.
- Do not expose tokens or local paths in generated artifacts.
- Do not push unless explicitly requested.
