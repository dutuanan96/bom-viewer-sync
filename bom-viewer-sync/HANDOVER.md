# JinTai PDM System Handover

Read `AI_DEBUG_GUIDE.md` before project files.

## Current State

- Canonical checkout: `work/remote-bom-viewer-sync/bom-viewer-sync/`.
- Phase B integration PR #6 from `codex/material-asset-upload` was squash-merged to `main` as `6fcdaad` on 2026-07-14.
- PR #1 was squash-merged on 2026-07-14 as `72debab`; Phase A PR #5 was squash-merged as `de35ea2`.
- Product revision/effectivity, draft-safe Material Master 2D/3D editing and expanded payload notifications are integrated.
- Current Phase B generated build ID is `21ca427a7b66`.
- The latest Phase B repository gate passed 115/115 tests. Canonical audit: 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors and 0 warnings.
- Outer runtime artifacts have been rebuilt from integrated `main`. Outer `outputs/data.js` intentionally remains an older 643-material/6-notification snapshot because code publication must not overwrite runtime data.
- Phase B connects the Phase A create-only adapter to Admin Material Master. Selected PDF/GLB/portable-GLTF bytes remain only in `state.pendingMaterialAssets`; Save Material is local-only; Save to GitHub performs binary upload, reads the current BOM payload/SHA, then writes BOM data. Upload failure prevents the BOM write, while a BOM-write retry reuses an already resolved immutable URL.
- Phase B runtime publication was approved and completed on 2026-07-14. The four outer runtime artifacts match merged `main`; Desktop `admin.html` and `viewer.html` match the verified outer copies. No `data.js` was copied or changed.

## Continue This Flow

1. Run `git fetch origin --prune`, inspect `git status --short`, current branch and recent commits before changing code.
2. Work only in the canonical checkout and edit `src/`, tests, scripts, or context documents. Never hand-edit generated files.
3. Preserve the PDM rule: latest design and effective production revision are separate concepts; exactly one valid revision is effective.
4. Material Master edits use one isolated `state.materialDraft`; Add/Delete/Open assets must not mutate the stored material before Save Material.
5. Preserve hidden asset metadata. For 3D editing, render `url` before fallback `previewUrl`, then update `previewUrl = url` only on successful save.
6. Do not copy `data.js` between canonical, `outputs/` or Desktop during code-only work. GitHub/main data is authoritative.
7. For future publication, verify the target PR is merged and `origin/main` passes the complete gate before copying runtime artifacts.
8. Run `npm run check`, `node --check app-admin.js`, `git diff --check`, and inspect any `data.js` diff before pushing.

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
- Satellite asset smoke uploaded a 599-byte PDF at commit `fbca2d4ba3feb4ad7c210885102b82988ed7333f` and a 1288-byte GLB at commit `673a7f6b05106438a58335d04f2d685508a6d6c7`. jsDelivr returned correct MIME types, no attachment disposition, CORS `*`, and `<model-viewer>` loaded the GLB with zero browser errors or warnings. The deterministic second run reused both paths.
- Phase A repository gate passed 100/100 tests. The post-merge Phase B gate passed 115/115 tests; the canonical data audit reports 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors, and 0 warnings.
- Phase B Admin smoke selected a valid PDF, showed the localized pending filename with a blank draft URL, confirmed Back restored the original URL, and confirmed Save Material remained local-only. Post-publication smoke loaded 646 materials in Admin, showed 2D/3D upload controls, and loaded 22 products/646 materials in the exact Desktop Viewer copy served over localhost. The only browser resource error was the pre-existing missing `favicon.ico`; no application error occurred and no remote save was attempted.
- Publication hashes: `outputs/data.js` remained `D3D5C706D08FE11A8DD69B1F3D4E1B30E2B4E36BA5F28569965DE7950E8472E8`; Desktop and outer Admin matched `2BBB40D86C50AD49226ECC20A262C61C1F736F4E65837DE65DDA81BE31FC4F46`; Desktop and outer Viewer matched `CBF642FF1CCECA776FBF91AAB2DA6217C637399C70CD2283FC21DD7AA90301EB`.
- Phase B unit coverage verifies PDF/GLB/GLTF signature and portability validation, the 20,000,000-byte limit, metadata-preserving targeted replacement, upload-before-BOM ordering, upload-failure isolation, and resolved-URL retry reuse.

## Environment Caveat

The outer project folder contains an empty `.git` directory, but it is not a valid repository. The real Git repository root is `work/remote-bom-viewer-sync/`. Do not delete or initialize the outer marker without explicit user approval.

## Suggested Skills For The Next AI

- `pdm-workflow` for revision/BOM lifecycle work.
- `systematic-debugging` when behavior or tests regress.
- `i18n-checker` when changing PDM UI text.
- `verification-before-completion` before reporting or publishing.
- `finishing-a-development-branch` after PR approval and merge readiness.
