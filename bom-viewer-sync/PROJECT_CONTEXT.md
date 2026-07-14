# BOM Viewer / PDM Context

AI debugging entrypoint: read `AI_DEBUG_GUIDE.md` first. It is self-contained; the remaining context files provide current integration state and handoff detail.

## Canonical Source And Build

- Canonical project root: `work/remote-bom-viewer-sync/bom-viewer-sync/`; editable application source lives in `src/`.
- Current integrated branch: `main`; Phase B PR #6 was squash-merged as `6fcdaad` on 2026-07-14.
- PR #1 (`codex/product-bom-revisions` -> `main`) was squash-merged on 2026-07-14 as `72debab`; Phase A PR #5 was squash-merged as `de35ea2`.
- Build command: `npm run build`; complete repository gate: `npm run check`.
- Generated files: `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html`.
- Never edit generated files directly. Edit source or build scripts, then rebuild.
- Phase B generated build ID submitted in PR #6: `21ca427a7b66`.

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

Phase A PR #5 integrated a create-only Contents API adapter for public repository `dutuanan96/bom-viewer-assets`. Phase B PR #6 connects it to Admin Material Master without changing the Viewer schema. `src/features/material-asset-upload.js` validates selected files and resolves only asset records carrying a `pendingAssetId` in a cloned outgoing payload. `src/application.js` owns in-memory pending bytes and the remote save boundary.

- PDF requires `.pdf`, `application/pdf`, and `%PDF-` bytes.
- GLB requires `.glb` and `glTF` magic bytes.
- GLTF requires `.gltf`, valid JSON, and only `data:` or absolute HTTPS buffer/image URIs.
- Empty files and files larger than 20,000,000 bytes are rejected.
- Selecting a file and Save Material perform no upload. Save Material may store an internal pending ID locally with a blank public URL.
- Save to GitHub uploads referenced binaries first, reads the current BOM payload/SHA second, and writes BOM data last. A binary failure prevents the BOM write; if only the BOM write fails, retry reuses the resolved immutable URL instead of re-uploading.
- Existing `path`, `sourceUrl`, `driveId`, `previewUrl`, and unknown metadata are preserved; only the target URL and 3D `previewUrl` are replaced in the outgoing clone.

Phase B PR #6 was squash-merged as `6fcdaad` on 2026-07-14. The post-merge `origin/main` gate passed, and approved runtime publication synchronized outer runtime artifacts plus Desktop `admin.html`/`viewer.html`. `data.js` remained outside the publication flow.

## Deferred GitHub-Only Architecture

The integrated implementation is the upload workflow, not the complete sharding/Release Assets proposal.

- Not implemented: `data/manifest.json`, `data/materials.json`, per-product `data/products/<ProductID>.json`, lazy product loading, migration tooling, and GitHub Git Trees migration.
- Not implemented: GitHub Release Assets. Current PDF/GLB/portable-GLTF storage uses a public satellite repository through the create-only GitHub Contents API and returns commit-pinned jsDelivr URLs.
- No canonical or remote data migration has run. `data.js` remains the production schema and save target.
- The next feature should introduce a tested sharded read/data-access boundary with `data.js` fallback before changing writes or running migration.
- Preserve the standalone Viewer contract explicitly. Network-only lazy loading must not silently remove the ability to send one usable HTML file to another machine.
- Run migration as a dry run or on a feature branch first. Remote `main`, canonical `data.js`, `outputs/data.js`, and Desktop data are outside scope until a separate migration approval.
- Evaluate Release Assets in a separate PR only after validating direct-browser API/CORS behavior, token permissions, duplicate asset names, replacement/deletion policy, download visibility, and retry behavior.

The first sharding milestone is complete when compatibility tests cover both legacy and sharded inputs without migrating production data or publishing runtime copies.

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

- `npm run check`: 115/115 tests passed after the Phase B merge.
- Canonical data audit: 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors, 0 warnings.
- Outer Material Master/revision contracts: 23/23 passed.
- Outer runtime contracts: 13/13 passed.
- Generated artifact check and JavaScript syntax check passed.
- Browser smoke verified Material Asset draft behavior and a real GLB render. Post-publication localhost smoke verified the exact Desktop Viewer copy and outer Admin upload controls; manual clean-profile `file://` verification remains the final external-distribution check because automation blocks that protocol.

Do not treat a hard-coded test count as permanent; always report the current command output.

## Phase B Verification (2026-07-14)

- Latest repository gate: 115/115 tests; canonical data audit remains 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors and 0 warnings.
- Admin browser smoke selected a valid PDF, rendered the pending filename with a blank draft URL, restored the original URL after Back, and kept Save Material local-only. No token was entered and Save to GitHub was not clicked.
- The standalone Viewer build artifact loaded 22 products and 646 materials on localhost. The only console resource error was the pre-existing missing `favicon.ico`; no application error occurred.
- Approved publication preserved `outputs/data.js` at SHA-256 `D3D5C706D08FE11A8DD69B1F3D4E1B30E2B4E36BA5F28569965DE7950E8472E8`. Outer and Desktop Admin matched SHA-256 `2BBB40D86C50AD49226ECC20A262C61C1F736F4E65837DE65DDA81BE31FC4F46`; outer and Desktop Viewer matched `CBF642FF1CCECA776FBF91AAB2DA6217C637399C70CD2283FC21DD7AA90301EB`.
