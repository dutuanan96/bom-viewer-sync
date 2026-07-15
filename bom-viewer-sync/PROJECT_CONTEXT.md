# BOM Viewer / PDM Context

AI debugging entrypoint: read `AI_DEBUG_GUIDE.md` first. It is self-contained; the remaining context files provide current integration state and handoff detail.

## Canonical Source And Build

- Canonical project root: `work/remote-bom-viewer-sync/bom-viewer-sync/`; editable application source lives in `src/`.
- Current integrated branch: `main`; Phase B.5 cutover is complete.
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

- Material text fields, `drawings` and `models3d` are edited through one isolated `state.materialDraft`.
- Add/Delete/Open operate on the draft. Back, material switch and module switch discard it; silent refresh cannot replace an active draft.
- Existing asset objects are spread before updating `name` and `url`, preserving `path`, `sourceUrl`, `driveId`, `previewUrl` and unknown metadata.
- 3D rows render the edited `url` before stale `previewUrl`; successful save synchronizes `previewUrl = url` for `<model-viewer>`.
- 2D requires HTTPS Drive/PDF; 3D requires a direct HTTPS GLB/GLTF URL. Empty, invalid and duplicate URLs block local save through i18n errors.
- Save Material updates local payload only. Save to GitHub remains a separate explicit action using the current remote shard payload and expected HEAD.

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
| Outer `outputs/` runtime artifacts | Last approved portable release; not synchronized with later code-only phases | Publish only after explicit approval |
| Outer `outputs/` context documents | Last approved portable release; may lag this review branch | Synchronize only as part of an approved publication |
| Desktop `admin.html` / `viewer.html` | Last approved shareable release; not synchronized with later code-only phases | Replace only after explicit publication approval and complete verification |
| Canonical `data/` | Active runtime payload: exact 24 shards, 646 materials, 1 notification | Source of truth for application reads/writes |
| Canonical `data.js` | Tracked rollback/migration snapshot | Never use as an application runtime target |
| Outer `outputs/data.js` | Older clean legacy snapshot: 643 materials, 6 notifications | Intentional; never copy over canonical shards |

Viewer resolves the configured branch to an exact commit and reads cache-busted, commit-pinned shards. Admin loads the current ref/tree/blob set and must re-read the remote payload and expected HEAD immediately before diffing and performing one atomic non-force ref update.

## Verified Release-Closure Baseline (2026-07-15)

- `npm run check`: 194/194 tests passed for the release-closure commit; always rerun for the current count.
- Canonical data audit: 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors, 0 warnings.
- Outer Material Master/revision contracts: 23/23 passed.
- Outer runtime contracts: 13/13 passed.
- Generated artifact check and JavaScript syntax check passed.
- Antigravity browser evidence shows sharded Admin/Viewer counts and Material Master rendering. Independent console-clean and clean-profile `file://` verification remain final distribution checks because the local automation runtime was unavailable.

Do not treat a hard-coded test count as permanent; always report the current command output.

## Phase B.5 Verification

- Run `npm run check` fresh for the current test count; the last canonical data audit reported 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors and 0 warnings.
- The `migrate:dry-run` script verified 24 virtual shards correctly split and re-assembled without losing any deep properties or stable identifiers. The Phase B.5 dry-run aggregate hash is `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`.
- The sharded runtime adapter `github-sharded-data.js` owns shard reads/writes and delegates atomic commits to `github-git-data.js`. Asset bytes remain owned by the separate `material-asset-upload.js` and `github-asset-storage.js` boundary.
