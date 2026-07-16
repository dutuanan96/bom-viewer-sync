# BOM Viewer / PDM Context

AI debugging entrypoint: read `AI_DEBUG_GUIDE.md` first. It is self-contained; the remaining context files provide current integration state and handoff detail.

## Canonical Source And Build

- Canonical project root: `work/remote-bom-viewer-sync/bom-viewer-sync/`; editable application source lives in `src/`.
- Current integrated branch: `main` at reviewed commit `d477f884ccc572e3559f78220d0abe9cdcb6cb42`; Phase B.6 release acceptance is complete.
- PR #1, Phase A PR #5, Phase B PR #6, Phase B.1 PR #8, Phase B.2 PR #9, Phase B.4 PR #11, Phase B.4 readback hotfix PR #12, and Phase B.5 PR #14 are squash-merged.
- Build command: `npm run build`; complete repository gate: `npm run check`.
- Generated files: `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html`.
- Never edit generated files directly. Edit source or build scripts, then rebuild.
- Phase B.5 completes the sharded runtime cutover. Generated build IDs are deterministic across LF/CRLF worktrees; `data.js` is no longer an application runtime read/write target.

## Product Revision And Effectivity Model

- `currentRevision` is the latest design revision; `effectiveRevision` is the single revision currently used in production.
- Creating a revision from a released product creates a Draft and preserves the previous BOM as an immutable snapshot.
- Creating Draft `V3.1` does not automatically release it and does not move effectivity away from released `V3`.
- Releasing the clean latest Draft requires a reason, makes it the sole effective revision, and leaves earlier revisions released but non-current.
- Released and historical revisions are read-only. A new revision may be created from the current released revision.
- Transition metadata and events must preserve the source revision and release history.

The main domain owner is `src/domain/revisions.js`; orchestration is in `src/application.js`, and the BOM selectors are rendered by `src/ui/bom-view.js`.

## Material Master 2D/3D Editing

- Each material record owns at most one active PDF and one active GLB/GLTF.
  Every product that references the same `materialId` uses those same assets;
  BOM material rows do not fall back to product-scoped asset maps.
- Top-level product assembly models remain separate from material models.
- Material text fields, `drawings` and `models3d` are edited through one isolated `state.materialDraft`.
- Add/Delete/Open operate on the draft. Back, material switch and module switch discard it; silent refresh cannot replace an active draft.
- The Add control is available only when that material asset type is empty.
  Saving legacy multi-row data retains only the first active row.
- Existing asset objects are spread before updating `name` and `url`, preserving `path`, `sourceUrl`, `driveId`, `previewUrl` and unknown metadata.
- 3D rows render the edited `url` before stale `previewUrl`; successful save synchronizes `previewUrl = url` for `<model-viewer>`.
- 2D requires HTTPS Drive/PDF; 3D requires a direct HTTPS GLB/GLTF URL. Empty, invalid and duplicate URLs block local save through i18n errors.
- Save Material updates local payload only. Save to GitHub remains a separate explicit action using the current remote shard payload and expected HEAD.

The product-aware migration and offline hash audit are documented in
`docs/superpowers/reports/2026-07-16-material-assets-audit.md`. Superseded
references were removed from material records, but physical Drive/local/Git
files were intentionally not deleted.

## Material Master GitHub Asset Upload

Phase A PR #5 and Phase B PR #6 integrated the Content API adapter. Phase B.1 PR #8 implemented the Sharded Data Compatibility Layer. Phase B.2 PR #9 implemented an In-memory Migration Dry-Run. Phase B.3 implemented an Atomic Sharded Writer Foundation. `src/features/material-asset-upload.js` validates selected files and resolves only asset records carrying a `pendingAssetId` in a cloned outgoing payload. `src/application.js` owns in-memory pending bytes and the remote save boundary.

- PDF requires `.pdf`, `application/pdf`, and `%PDF-` bytes.
- GLB requires `.glb` and `glTF` magic bytes.
- GLTF requires `.gltf`, valid JSON, and only `data:` or absolute HTTPS buffer/image URIs.
- Empty files and files larger than 20,000,000 bytes are rejected.
- Selecting a file and Save Material perform no upload. Save Material may store an internal pending ID locally with a blank public URL.
- Save to GitHub uploads referenced binaries first, reads the current shard payload/expected HEAD second, and performs the atomic 24-shard write last. A binary failure prevents the shard write; if only the shard write fails, retry reuses the resolved immutable URL instead of re-uploading.
- Existing `path`, `sourceUrl`, `driveId`, `previewUrl`, and unknown metadata are preserved; only the target URL and 3D `previewUrl` are replaced in the outgoing clone.

Phase B PR #6 was approved for squash merge on 2026-07-14. Phase B.1 (PR #8) introduced the compatibility layer. Phase B.2 proved that `data.js` can be sharded and re-assembled without data loss. Phase B.3 integrated the Atomic Sharded Writer Foundation. Phase B.4 (PR #11) used that foundation once on staging branch `codex/phase-b4-shards-20260715T041629Z-db11b4a`. Phase B.5 (PR #14) then activated `createGithubShardedDataAdapter()` and the Git Data writer for application runtime, which now reads and writes the exact 24 files in `data/`. `github-sharded-data.js` reuses normalization and decoding helpers from `github-data.js`; it does not own asset upload. The `pendingMaterialAssets` boundary and content-addressed `githubAssetStorage` flow came from the independently reviewed Phase A/B work in PR #5 and PR #6, which supersedes local commits `1ad16cb` and `2db18d5`. `main` is authoritative.

## Notification Diff Coverage

`src/features/notifications.js` now reports product additions, material additions/deletions/field edits and BOM additions/deletions/quantity changes. BOM child resolution must prefer `childMaterialId` and fall back to `materialId`; quantity serialization must use nullish fallback so numeric zero is preserved.

## Current Synchronization State

| Surface | State | Rule |
|---|---|---|
| Canonical `main` checkout | Integrated implementation, current data and generated artifacts | Source of truth |
| Outer `outputs/` runtime artifacts | Phase B.6 verified four-file portable release | Mirror only from a later verified integrated build |
| Outer `outputs/` context documents | Phase B.6 synchronized five-document handoff set | Keep hash-equal with the canonical release docs |
| Desktop runtime set | Current `viewer.html`, `admin.html`, `app-admin.js`, and `styles.css` | Keep these four adjacent; remove superseded review/build copies |
| Canonical `data/` | Active runtime payload on this branch: exact 24 shards, 628 material records, 5 notifications | Source of truth for application reads/writes |
| Canonical `data.js` | Tracked rollback/migration snapshot | Never use as an application runtime target |
| Outer `outputs/data.js` / `outputs/data/` | Absent by design | Never create them during runtime publication |

Viewer resolves the configured branch to an exact commit and reads cache-busted, commit-pinned shards. Admin loads the current ref/tree/blob set and must re-read the remote payload and expected HEAD immediately before diffing and performing one atomic non-force ref update.

## Verified Release-Closure Baseline (2026-07-15)

- `npm run check`: 194/194 tests passed for the release-closure commit; always rerun for the current count.
- Canonical data audit: 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors, 0 warnings.
- Outer Material Master/revision contracts: 23/23 passed.
- Outer runtime contracts: 13/13 passed.
- Generated artifact check and JavaScript syntax check passed.
- Manual clean-profile `file://` acceptance passed for Viewer and Admin: 22 products, 646 materials, zero console errors, zero `data.js` requests, and no GitHub save.

## Phase B.6 Final Acceptance

- Reviewed `main`: `d477f884ccc572e3559f78220d0abe9cdcb6cb42`.
- Live UAT branch: `codex/phase-b6-uat-2026-07-15T112949034Z-d477f88` at `e843f276d1cedcfa30615b4177989a4e76170bd1`.
- Authenticated and public readbacks matched the expected payload, exact 24-shard set, and aggregate SHA-256 `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`.
- Phase B.6 is closed. The next AI should begin from canonical source, inspect current Git state, and treat any new request as a separate feature or maintenance phase.

Do not treat a hard-coded test count as permanent; always report the current command output.

## Phase B.5 Verification

- Run `npm run check` fresh for the current test count; this branch's latest
  data audit reports 628 material records, 2725 BOM entries, 22 products, 5
  notifications, 0 errors and 0 warnings.
- The `migrate:dry-run` script verified 24 virtual shards correctly split and re-assembled without losing any deep properties or stable identifiers. The Phase B.5 dry-run aggregate hash is `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`.
- The sharded runtime adapter `github-sharded-data.js` owns shard reads/writes and delegates atomic commits to `github-git-data.js`. Asset bytes remain owned by the separate `material-asset-upload.js` and `github-asset-storage.js` boundary.
