# BOM Viewer / PDM Context

AI debugging entrypoint: read `AI_DEBUG_GUIDE.md` first. It is self-contained; the remaining context files provide current integration state and handoff detail.

## Canonical Source And Build

- Canonical project root: `work/remote-bom-viewer-sync/bom-viewer-sync/`; editable application source lives in `src/`.
- Current integrated branch: `main`; active Phase B.3 review branch: `codex/sharded-atomic-writer-phase-b3`.
- PR #1, Phase A PR #5, Phase B PR #6, Phase B.1 PR #8, and Phase B.2 PR #9 are squash-merged. Phase B.3 implements Atomic Sharded Writer Foundation.
- Build command: `npm run build`; complete repository gate: `npm run check`.
- Generated files: `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html`.
- Never edit generated files directly. Edit source or build scripts, then rebuild.
- Phase B.2 generated build ID: `94069c453df8`. Phase B.3 is code-only infrastructure.

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
- Save Material updates local payload only. Save to GitHub remains a separate explicit action using the current remote payload and SHA.

## Material Master GitHub Asset Upload

Phase A PR #5 and Phase B PR #6 integrated the Content API adapter. Phase B.1 PR #8 implemented the Sharded Data Compatibility Layer. Phase B.2 PR #9 implemented an In-memory Migration Dry-Run. Phase B.3 implemented an Atomic Sharded Writer Foundation. `src/features/material-asset-upload.js` validates selected files and resolves only asset records carrying a `pendingAssetId` in a cloned outgoing payload. `src/application.js` owns in-memory pending bytes and the remote save boundary.

- PDF requires `.pdf`, `application/pdf`, and `%PDF-` bytes.
- GLB requires `.glb` and `glTF` magic bytes.
- GLTF requires `.gltf`, valid JSON, and only `data:` or absolute HTTPS buffer/image URIs.
- Empty files and files larger than 20,000,000 bytes are rejected.
- Selecting a file and Save Material perform no upload. Save Material may store an internal pending ID locally with a blank public URL.
- Save to GitHub uploads referenced binaries first, reads the current BOM payload/SHA second, and writes BOM data last. A binary failure prevents the BOM write; if only the BOM write fails, retry reuses the resolved immutable URL instead of re-uploading.
- Existing `path`, `sourceUrl`, `driveId`, `previewUrl`, and unknown metadata are preserved; only the target URL and 3D `previewUrl` are replaced in the outgoing clone.

Phase B PR #6 was approved for squash merge on 2026-07-14. Phase B.1 (PR #8) compatibility layer is intact where `loadPublic()` tries sharded manifest first and only falls back to `data.js` if the manifest is HTTP 404. Phase B.2 introduces an in-memory dry-run to prove that `data.js` can be sharded and re-assembled without data loss. Phase B.3 introduces an Atomic Sharded Writer Foundation for concurrent multi-file writes. The writer remains inactive and no real remote writes happen yet. `loadForWrite()` and `write()` still ONLY use `data.js`. No data migration has occurred, and there is no sharded production data yet. `data.js`, `outputs/`, and Desktop remain unchanged.

## Notification Diff Coverage

`src/features/notifications.js` now reports product additions, material additions/deletions/field edits and BOM additions/deletions/quantity changes. BOM child resolution must prefer `childMaterialId` and fall back to `materialId`; quantity serialization must use nullish fallback so numeric zero is preserved.

## Current Synchronization State

| Surface | State | Rule |
|---|---|---|
| Canonical `main` checkout | Integrated implementation, current data and generated artifacts | Source of truth |
| Outer `outputs/` runtime artifacts | Rebuilt from integrated `main` | Portable runtime mirror |
| Outer `outputs/` context documents | Current | Keep byte-identical to the canonical context documents |
| Desktop `admin.html` / `viewer.html` | Release copies synchronized from the verified integrated build | Replace only after future integrated builds pass |
| Canonical `data.js` | Current merged GitHub/main data: 646 materials, 1 notification | Do not overwrite from mirrors |
| Outer `outputs/data.js` | Older clean snapshot: 643 materials, 6 notifications | Intentional; never copy over canonical data |

The Viewer uses a cache-busted GitHub Contents API read, so remote data can be newer than the local `data.js`. Admin saves must read the current remote payload and SHA immediately before diffing and writing.

## Verified Baseline (2026-07-14)

- `npm run check`: 89/89 tests passed.
- Canonical data audit: 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors, 0 warnings.
- Outer Material Master/revision contracts: 23/23 passed.
- Outer runtime contracts: 13/13 passed.
- Generated artifact check and JavaScript syntax check passed.
- Browser smoke verified Material Asset draft behavior and a real GLB render; manual clean-profile `file://` verification remains the final distribution check because automation blocks that protocol.

Do not treat a hard-coded test count as permanent; always report the current command output.

## Phase B.3 Verification

- Latest repository gate: 146/146 tests; canonical data audit remains 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors and 0 warnings.
- The `migrate:dry-run` script verified 24 virtual shards correctly split and re-assembled without losing any deep properties or stable identifiers. The Phase B.2 dry-run aggregate hash is `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`.
- Admin browser smoke legacy fallback still passed flawlessly with no missing data or unhandled errors.
- The `github-git-data` module is confirmed isolated and completely inactive at runtime.
