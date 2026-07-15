# JinTai PDM System Handover

Read `AI_DEBUG_GUIDE.md` before project files.

## Current State

- Canonical checkout: `work/remote-bom-viewer-sync/bom-viewer-sync/`.
- PR #1, Phase A PR #5, Phase B PR #6, Phase B.1 PR #8, Phase B.2 PR #9, Phase B.4 PR #11, Phase B.4 readback hotfix PR #12, and Phase B.5 PR #14 are squash-merged to `main`.
- Product revision/effectivity, draft-safe Material Master 2D/3D editing, asset publication, and expanded payload notifications are integrated.
- Phase B.5 activates `createGithubShardedDataAdapter()` with the Git Data writer. Application runtime reads and writes the exact 24 JSON shards in `data/`; tracked `data.js` remains only rollback/migration input.
- Use a fresh `npm run check` result for the current test count. The last canonical audit reported 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors and 0 warnings.
- Phase B.4 staging branch `codex/phase-b4-shards-20260715T041629Z-db11b4a` remains at `227db46` with verified aggregate SHA-256 `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`; do not rerun or delete it.
- The old local upload commits `1ad16cb` and `2db18d5` are superseded by the independently reviewed Phase A/B asset-storage and pending-asset flow merged through PR #5 and PR #6. No code from those commits was ported.
- `outputs/` and Desktop are non-canonical mirrors and remain pre-Phase-B.5 until the post-merge publication flow is run and hash-verified. Never copy their `data.js` into the repository.

## Continue This Flow

1. Run `git fetch origin --prune`, inspect `git status --short`, current branch and recent commits before changing code.
2. Work only in the canonical checkout and edit `src/`, tests, scripts, or context documents. Never hand-edit generated files.
3. Preserve the PDM rule: latest design and effective production revision are separate concepts; exactly one valid revision is effective.
4. Material Master edits use one isolated `state.materialDraft`; Add/Delete/Open assets must not mutate the stored material before Save Material.
5. Preserve hidden asset metadata. For 3D editing, render `url` before fallback `previewUrl`, then update `previewUrl = url` only on successful save.
6. Do not copy `data.js` or `data/` from mirrors during code-only work. Canonical GitHub/main shards are authoritative.
7. Verify `origin/main` passes the complete gate and read the Phase B.4 execution report before planning any later publication or cutover work.
8. Run `npm run check`, `node --check app-admin.js`, `git diff --check`, and inspect both `data.js` and `data/` diffs before pushing.

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
- Historical Phase B.1 (PR #8) smoke verified the temporary `data.js` fallback. Phase B.5 removed that fallback; current acceptance must load the exact 24 shards directly.
- Phase B.2 repository gate passed 132/132 tests, including 8 new tests verifying the in-memory split and re-assembly logic. The `migrate:dry-run` script executed successfully on local `data.js`, reporting exactly 24 virtual files created and matching identical deepStrictEqual structures without loss.
- Phase B.3 writer tests cover atomic ordering, strict shard paths, full expected-HEAD concurrency, 409/422 ref conflicts, response schemas, UTF-8 encoding, and token redaction. Phase B.5 activates this writer through `github-sharded-data.js`; treat only fresh command output as the current gate count.
- Phase B.4 staging evidence: source `db11b4a`, staging commit `227db46`, 24 shards, exact aggregate match, full round-trip equality, and unchanged `data.js`. The complete record is `docs/superpowers/reports/2026-07-15-phase-b4-staging-execution.md`.

## Environment Caveat

The outer project folder contains an empty `.git` directory, but it is not a valid repository. The real Git repository root is `work/remote-bom-viewer-sync/`. Do not delete or initialize the outer marker without explicit user approval.

## Suggested Skills For The Next AI

- `pdm-workflow` for revision/BOM lifecycle work.
- `systematic-debugging` when behavior or tests regress.
- `i18n-checker` when changing PDM UI text.
- `verification-before-completion` before reporting or publishing.
- `finishing-a-development-branch` after PR approval and merge readiness.
