# JinTai PDM System Handover

Read `AI_DEBUG_GUIDE.md` before project files.

## Current State

- Canonical checkout: `work/remote-bom-viewer-sync/bom-viewer-sync/`.
- Active branch: `main`.
- PR #1 was squash-merged on 2026-07-14 as `72debab`.
- Product revision/effectivity, draft-safe Material Master 2D/3D editing and expanded payload notifications are integrated.
- Current generated build ID is `238032e12d0f`.
- Repository gate passed 89/89 tests. Canonical audit: 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors and 0 warnings.
- Outer runtime artifacts have been rebuilt from integrated `main`. Outer `outputs/data.js` intentionally remains an older 643-material/6-notification snapshot because code publication must not overwrite runtime data.
- Branch `codex/github-release-assets` contains an inactive Release Assets adapter and smoke utility. Raw upload to public release `dutuanan96/bom-viewer-assets@assets-v1` works, but browser delivery failed: PDF is forced to download and GLB lacks CORS. Admin/Viewer runtime and `data.js` remain unchanged.
- The adapter branch gate passed 103/103 tests, zero-error data audit, generated checks, syntax checks, `git diff --check`, empty `data.js` diff, and zero-vulnerability `npm audit`.

## Continue This Flow

1. Run `git fetch origin --prune`, inspect `git status --short`, current branch and recent commits before changing code.
2. Work only in the canonical checkout and edit `src/`, tests, scripts, or context documents. Never hand-edit generated files.
3. Preserve the PDM rule: latest design and effective production revision are separate concepts; exactly one valid revision is effective.
4. Material Master edits use one isolated `state.materialDraft`; Add/Delete/Open assets must not mutate the stored material before Save Material.
5. Preserve hidden asset metadata. For 3D editing, render `url` before fallback `previewUrl`, then update `previewUrl = url` only on successful save.
6. Do not copy `data.js` between canonical, `outputs/` or Desktop during code-only work. GitHub/main data is authoritative.
7. Create a new feature branch and PR for future changes; PR #1 is closed and must not be reused.
8. Run `npm run check`, `node --check app-admin.js`, `git diff --check`, and inspect any `data.js` diff before pushing.
9. Do not connect `src/infrastructure/github-release.js` to Material Master unless the delivery architecture changes and a new PDF/GLB browser gate passes.

## Integrated Publication Flow

After a future PR is merged, update canonical `main` first:

```powershell
git fetch origin --prune
git switch main
git pull --ff-only origin main
npm run build
npm run check
```

Then run the outer compatibility/build flow from the outer project root:

```powershell
node work\build_standalone_viewer.mjs
node work\material-master-editor.test.mjs
node work\restructure.test.mjs
node work\audit_data_integrity.mjs
node --check outputs\app-admin.js
```

Verify SHA-256 equality for generated artifacts and context documents, then replace the Desktop shareable `admin.html` and `viewer.html`. Do not copy `data.js` during code release.

## Latest Debug Evidence

- Material Asset browser smoke: edited 3D URL survived Add/Delete re-render; blank URL was blocked; Back discarded the draft; reopening restored the original stored URL.
- Viewer smoke: loaded 22 products and 646 live GitHub materials, then rendered a real GLB in the model modal.
- `file://` navigation was blocked by the automation policy; standalone structure is covered by repository contracts, but a clean-profile manual `file://` check is still required before external distribution.
- Notification regression covers product/material/BOM additions, material/BOM deletion, quantity changes including `0`, and `childMaterialId` resolution.
- Release Assets smoke: upload succeeded, but PDF returned `Content-Disposition: attachment` plus `application/octet-stream`; cross-origin GLB fetch failed without `Access-Control-Allow-Origin`. This is a deliberate integration blocker, not a Viewer regression.

## Environment Caveat

The outer project folder contains an empty `.git` directory, but it is not a valid repository. The real Git repository root is `work/remote-bom-viewer-sync/`. Do not delete or initialize the outer marker without explicit user approval.

## Suggested Skills For The Next AI

- `pdm-workflow` for revision/BOM lifecycle work.
- `systematic-debugging` when behavior or tests regress.
- `i18n-checker` when changing PDM UI text.
- `verification-before-completion` before reporting or publishing.
- `finishing-a-development-branch` after PR approval and merge readiness.
