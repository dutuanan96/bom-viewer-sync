# BOM Viewer / PDM Context

AI debugging entrypoint: read `AI_DEBUG_GUIDE.md` first. It is self-contained; the remaining context files provide history and handoff detail only.

## Canonical Source And Build

- Canonical project root: `work/remote-bom-viewer-sync/bom-viewer-sync/`; application source lives in `src/`.
- Build command: `npm run build` from `work/remote-bom-viewer-sync/bom-viewer-sync/`.
- Complete local gate: `npm run check`.
- Generated files: `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html`.
- Never edit generated files directly. Edit `src/` or the build scripts, then rebuild.
- The generated 12-character build ID is dynamic. The current build ID is `e20a4df8f465`; it changes whenever the build inputs change.

`viewer.html` remains a standalone read-only local-file Viewer. Program, style, or shell changes require rebuilding and redistributing `viewer.html`. GitHub/Drive data changes continue to appear when Viewer reloads because data and linked assets remain remote.

## Runtime Mirror

Outer `outputs/` is a verified runtime mirror, not the editable source tree. Mirror only the four generated files and these workflow documents after the feature-worktree gates pass. Do not copy `data.js` for code-only changes.

## Data And PDM Guardrails

- Public reads use the cache-busted GitHub Contents API raw response first; raw GitHub is fallback only.
- Admin saves fetch the current remote payload and SHA before diffing and writing.
- Opening the notification bell changes only local read state; it does not delete GitHub-backed notification events.
- Keep the BOM inspector hidden and empty for plain BOM-row clicks.
- Keep zh-CN UI text in the existing i18n dictionary, and never expose or commit tokens.

## Verification Baseline

- `npm run check` verifies 56 tests, the data audit, generated artifacts, and `app-admin.js` syntax.
- The data baseline is 643 materials, 2725 BOM entries, 22 products, 0 errors, and 0 warnings.
- Material Master contracts are 18/18 and runtime contracts are 13/13.
- `work/material-db.test.mjs` has a known non-gating 8/10 baseline; do not change runtime behavior only to satisfy its two stale expectations.
