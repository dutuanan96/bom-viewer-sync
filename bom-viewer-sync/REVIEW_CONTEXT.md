# PDM BOM Viewer Review Context

## Review Scope

PR #1 was squash-merged into `main` on 2026-07-14 as `72debab`; Phase A PR #5 was squash-merged as `de35ea2`; Phase B PR #6 was merged. Phase B.1 PR #8 and Phase B.2 PR #9 were merged. Phase B.3 was independently reviewed, debugged, and integrated into `main`. Phase B.4 PR #11 and recursive-tree readback hotfix PR #12 were independently gated and merged. Phase B.5 PR #14 completed the sharded cutover. Phase B.6 release acceptance passed against reviewed `main` commit `d477f884ccc572e3559f78220d0abe9cdcb6cb42`. Editable code is under `src/`; `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html` are generated evidence.

## Required Revision Contracts

- Existing real product versions are preserved; legacy products are not reset to `V1`.
- Creating a new revision stores an immutable snapshot of the previous BOM.
- A new revision starts as Draft and records its source transition.
- Creating Draft `V3.1` while `V3` is effective must not mark `V3.1` as released/effective.
- Only the clean latest Draft can be released, and a release reason is required.
- Release moves effectivity atomically so exactly one valid revision is effective.
- Released current and historical revisions are read-only; a new revision can still be created from the current released revision.
- Historical entries without a valid product snapshot are not inferred as effective.
- Revision labels, badges, prompts, and errors use i18n keys; PDM user-facing UI remains zh-CN.

## Existing System Contracts

- Public reads resolve an exact commit and load the exact 24 files from cache-busted, commit-pinned raw URLs.
- Admin saves read the current remote shard payload and expected HEAD before atomic diff/write and preserve remote notifications.
- Plain BOM-row clicks do not open the removed inspector.
- Generated artifacts contain no credentials, local absolute paths, or inline source maps.
- Code-only work leaves both `data.js` and `data/` untouched.

## Material Asset Contracts

- Each `materialId` owns at most one active 2D PDF and one active 3D GLB/GLTF,
  shared by all products that reference that material.
- Material-row asset lookup must use `_materialRecord` only. Product-scoped
  assembly models remain available through the top-level product model map.
- Legacy conversion must seed the first existing material asset and must not
  accumulate one reference per LGS.
- Material Master uses one draft for normal fields and asset arrays; Add/Delete must preserve unsaved field edits.
- Add/Delete/Open do not mutate the stored record before Save Material, and Back/module/material switches discard the draft.
- Existing 2D/3D metadata remains intact after save. For 3D, edited `url` wins over stale `previewUrl`, and successful save updates `previewUrl`.
- Empty, invalid and duplicate URLs are rejected through i18n errors. Open reads the current input value, not a stale rendered attribute.
- Successful local save clears the draft so later silent refresh is not permanently blocked.
- Selecting a file changes only the draft plus application-memory pending state. Save Material remains local-only and must not call the asset adapter.
- Pending asset rows may have a blank public URL only when their `pendingAssetId` resolves to in-memory bytes; manual URL entry removes the pending reference.
- Existing hidden metadata must survive pending staging and targeted URL resolution. The resolver must not use global/string replacement.
- Canonical selection must be product-aware and content-verified. The reviewed
  mapping and execution report are in
  `docs/superpowers/reports/2026-07-16-material-assets-audit.md`.
- No physical PDF/GLB deletion is part of this change.

## GitHub Asset Upload Review Gate

Phase A adapter contracts remain unchanged: create-only Contents API requests without an update `sha`, no DELETE path, a 20,000,000-byte maximum, full SHA-256 identity in each path, and jsDelivr URLs pinned to a full Git commit SHA. In Phase B, only Admin may instantiate the adapter; Viewer remains read-only.

- PDF validation requires `.pdf`, `application/pdf` and `%PDF-` signature. GLB requires `.glb` and `glTF` magic. GLTF requires `.gltf`, valid JSON and portable `data:` or absolute HTTPS buffer/image URIs.
- Save to GitHub order must be asset upload, current shard payload/expected HEAD read, then one atomic 24-shard write.
- Asset-upload failure must prevent any shard write and retain pending bytes.
- Shard-write failure after asset success may leave an immutable orphan, but retry must reuse `pending.resolved` and not upload again.
- Only a successful shard write may adopt resolved URLs into local state and clear completed pending entries. No serialized output may contain `pendingAssetId` or file bytes.
- Phase B.2 implements an in-memory dry-run to validate payload splitting/assembly without data loss. No actual files are created or uploaded.
- Phase B.3 implements the Atomic Sharded Writer Foundation (`src/infrastructure/github-git-data.js`). It provides concurrency conflict handling (409/422 mapped to `GithubDataConflictError`) and blob/tree/commit/ref ordering. Phase B.5 activates it through the sharded runtime adapter. Warning: if ref update fails, orphan blob, tree, and commit Git objects might remain.
- Phase B.4 completed one staging-only migration on branch `codex/phase-b4-shards-20260715T041629Z-db11b4a`.
- Phase B.5 cutover is complete. Application runtime reads and writes the exact 24 JSON files in `data/`; tracked `data.js` is rollback/migration input only. The old local upload commits `1ad16cb` and `2db18d5` are superseded by the Phase A/B asset-storage and pending-asset implementation merged through PR #5 and PR #6, not by the sharding layer.
- Asset URLs use Content-Disposition rewriting; legacy blob conversion and raw asset logic remain supported until fully migrated.

## Notification Contracts

- Payload diff covers product additions, material additions/deletions/field edits and BOM additions/deletions/quantity changes.
- BOM rows use `childMaterialId || materialId` and real `parentType` values (`product` or `material`).
- Numeric quantity `0` must remain `"0"` in before/after notification text.

## Verified Gates (2026-07-15)

- Release-closure repository gate: 194/194 tests passed after adding the cross-worktree build-ID regression.
- Phase B.4 focused migration suites: 42/42 tests passed.
- Canonical audit: 646 materials / 2725 BOM entries / 22 products / 1 notification / 0 errors / 0 warnings.
- Phase B.5 dry-run produced exactly 24 virtual shards with aggregate SHA-256 `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`.
- Shard materialization and rollback verification passed.
- Phase B.4 remote read-only verification reconstructed all 24 staging shards exactly and confirmed unchanged `data.js` on staging and `main`.
- Outer Material Master/revision contracts: 23/23 passed.
- Outer runtime contracts: 13/13 passed.
- Generated freshness and JavaScript syntax checks passed.
- Antigravity browser evidence shows sharded Admin/Viewer counts and Material Master rendering. Independent browser automation remained blocked by the local Playwright/browser-controller runtime, so console-clean and `file://` checks remain explicit manual acceptance items before external distribution.
- Use fresh gate output for the current test count. Phase B.5 browser acceptance must exercise shard loading directly; legacy `data.js` fallback is no longer a runtime contract.
- Phase B.6 live UAT passed on branch `codex/phase-b6-uat-2026-07-15T112949034Z-d477f88` at `e843f276d1cedcfa30615b4177989a4e76170bd1`. Its parent is the reviewed `main` commit; authenticated/public readbacks matched all 24 shards and aggregate SHA-256 `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`.
- Manual clean-profile Viewer/Admin acceptance passed with 22 products, 646 materials, zero console errors, zero `data.js` requests, and no GitHub save.

## Integration Risk To Watch

The material-owned-asset branch audits at 628 active runtime material records
and 5 notifications. The prior Phase B.6 `main` evidence remains historical.
Outer `outputs/data.js` and `outputs/data/` are absent by design; never create
or copy mirror data over canonical GitHub shards.

For Phase B.4 staging migration:
- The one-time remote write completed from source `db11b4a` to staging commit `227db46` with exactly 24 shards and aggregate SHA-256 `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`.
- The initial verifier exposed recursive tree directory entries after branch creation. The branch was neither retried nor deleted; PR #12 fixed readback and the existing branch passed a complete read-only round trip.
- `main`, `data.js`, runtime save/read behavior, `outputs/`, and Desktop remained unchanged by the staging operation.
- Keep the staging branch and possible orphan Git objects intact for inspection.
- Phase B.5 runtime read/write cutover is complete.
- Full execution evidence is recorded in `docs/superpowers/reports/2026-07-15-phase-b4-staging-execution.md`.
- `outputs/` and Desktop are non-canonical but now contain the hash-verified Phase B.6 release artifacts. Never treat mirror state as repository truth.
