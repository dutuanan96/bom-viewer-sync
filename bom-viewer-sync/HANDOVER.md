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
- The sharding foundation branch adds a deterministic payload codec, a dry-run migration CLI, and a lazy repository adapter with legacy fallback. It does not switch runtime reads/writes and does not create committed shard data.
- Foundation verification passes 100/100 tests. Current-data dry-run preserves 22 products, 646 materials, 2725 BOM entries, 1 notification, and produces an in-memory plan for 26 shard files.

## Continue This Flow

1. Run `git fetch origin --prune`, inspect `git status --short`, current branch and recent commits before changing code.
2. Work only in the canonical checkout and edit `src/`, tests, scripts, or context documents. Never hand-edit generated files.
3. Preserve the PDM rule: latest design and effective production revision are separate concepts; exactly one valid revision is effective.
4. Material Master edits use one isolated `state.materialDraft`; Add/Delete/Open assets must not mutate the stored material before Save Material.
5. Preserve hidden asset metadata. For 3D editing, render `url` before fallback `previewUrl`, then update `previewUrl = url` only on successful save.
6. Do not copy `data.js` between canonical, `outputs/` or Desktop during code-only work. GitHub/main data is authoritative.
7. Create a new feature branch and PR for future changes; PR #1 is closed and must not be reused.
8. Run `npm run check`, `node --check app-admin.js`, `git diff --check`, and inspect any `data.js` diff before pushing.
9. Use `npm run migrate:data` to validate current `data.js` in memory. Only use `--write --out <preview-directory>` for an explicit local preview; never target canonical runtime paths during code review.

## Sharding Continuation Boundary

- `data.js` remains the production source of truth and the Viewer/Admin runtime contract.
- Product shards preserve product-scoped material-parent relationships, complete revision registries and immutable snapshots, and all asset metadata.
- The repository falls back only when the manifest is absent. A corrupt or mixed-version shard must fail visibly.
- Do not enable sharded reads until sharded Admin saves can update manifest, materials, indexes, notifications, and product shards in one optimistic Git tree commit.
- Release Asset integration remains a separate follow-up and requires a public-download/CORS smoke test before real PDF/GLB data is moved.

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

## Environment Caveat

The outer project folder contains an empty `.git` directory, but it is not a valid repository. The real Git repository root is `work/remote-bom-viewer-sync/`. Do not delete or initialize the outer marker without explicit user approval.

## Suggested Skills For The Next AI

- `pdm-workflow` for revision/BOM lifecycle work.
- `systematic-debugging` when behavior or tests regress.
- `i18n-checker` when changing PDM UI text.
- `verification-before-completion` before reporting or publishing.
- `finishing-a-development-branch` after PR approval and merge readiness.
