# JinTai PDM System Handover

Read `AI_DEBUG_GUIDE.md` before project files.

## Current State

- Canonical checkout: `work/remote-bom-viewer-sync/bom-viewer-sync/`.
- PR #1, Phase A PR #5, Phase B PR #6, Phase B.1 PR #8, and Phase B.2 PR #9 are squash-merged to `main`.
- Phase B.3 is integrated after its independent review and debug gate.
- Product revision/effectivity, draft-safe Material Master 2D/3D editing and expanded payload notifications are integrated.
- Current generated build ID is `9cf37d413370`. Phase B.3 is infrastructure only and does not change the build output.
- Use a fresh `npm run check` result for the current test count. The last canonical audit reported 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors and 0 warnings.
- Phase B.2 implements an in-memory data migration dry-run. `scripts/migrate-data-dry-run.mjs` splits and re-assembles the legacy payload to prove structural integrity without loss. No actual files are created or uploaded to GitHub.
- Phase B.3 implements an Atomic Sharded Writer Foundation (`src/infrastructure/github-git-data.js`). The writer is inactive and performs no actual remote writes yet.
- Phase B.1 Compatibility Layer remains: `loadPublic()` tries sharded manifest first and only falls back to `data.js` if the manifest is an HTTP 404. `loadForWrite()` and `write()` still ONLY use `data.js`.
- Phase B.3 did not publish runtime or data. `data.js`, `outputs/`, and Desktop remain unchanged from their last separately approved states.
- The user authorized Phase B.4 to begin after the Phase B.3 merge. Phase B.4 must remain a separate, plan-first change; no staging write, runtime wiring, migration, or publication belongs in the Phase B.3 merge.

## Continue This Flow

1. Run `git fetch origin --prune`, inspect `git status --short`, current branch and recent commits before changing code.
2. Work only in the canonical checkout and edit `src/`, tests, scripts, or context documents. Never hand-edit generated files.
3. Preserve the PDM rule: latest design and effective production revision are separate concepts; exactly one valid revision is effective.
4. Material Master edits use one isolated `state.materialDraft`; Add/Delete/Open assets must not mutate the stored material before Save Material.
5. Preserve hidden asset metadata. For 3D editing, render `url` before fallback `previewUrl`, then update `previewUrl = url` only on successful save.
6. Do not copy `data.js` between canonical, `outputs/` or Desktop during code-only work. GitHub/main data is authoritative.
7. Verify Phase B.2 is merged and `origin/main` passes the complete gate before any publication work.
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
- Phase A repository gate passed 100/100 tests; the canonical data audit still reports 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors, and 0 warnings. Phase B merge is approved; publication still requires separate user approval.
- Phase B Admin smoke selected a valid PDF, showed the localized pending filename with a blank draft URL, confirmed Back restored the original URL, and confirmed Save Material remained local-only.
- Phase B.1 (PR #8) Admin browser smoke passed on local server. Viewer loaded 22 products and 646 materials from `data.js` fallback successfully. The repository gate passed 124/124 tests.
- Phase B.2 repository gate passed 132/132 tests, including 8 new tests verifying the in-memory split and re-assembly logic. The `migrate:dry-run` script executed successfully on local `data.js`, reporting exactly 24 virtual files created and matching identical deepStrictEqual structures without loss.
- Phase B.3 writer tests cover atomic ordering, strict shard paths, full expected-HEAD concurrency, 409/422 ref conflicts, response schemas, UTF-8 encoding, and token redaction. Treat only fresh command output as the current gate count. The module is entirely isolated and inactive at runtime.

## Environment Caveat

The outer project folder contains an empty `.git` directory, but it is not a valid repository. The real Git repository root is `work/remote-bom-viewer-sync/`. Do not delete or initialize the outer marker without explicit user approval.

## Suggested Skills For The Next AI

- `pdm-workflow` for revision/BOM lifecycle work.
- `systematic-debugging` when behavior or tests regress.
- `i18n-checker` when changing PDM UI text.
- `verification-before-completion` before reporting or publishing.
- `finishing-a-development-branch` after PR approval and merge readiness.
