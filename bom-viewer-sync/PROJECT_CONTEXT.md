# BOM Viewer / PDM Context

AI debugging entrypoint: read `AI_DEBUG_GUIDE.md` first. It is self-contained; the remaining context files provide current integration state and handoff detail.

## Canonical Source And Build

- Canonical project root: `work/remote-bom-viewer-sync/bom-viewer-sync/`; editable application source lives in `src/`.
- Current integration branch: `main`.
- PR #1 (`codex/product-bom-revisions` -> `main`) was squash-merged on 2026-07-14 as `72debab`.
- Build command: `npm run build`; complete repository gate: `npm run check`.
- Generated files: `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html`.
- Never edit generated files directly. Edit source or build scripts, then rebuild.
- Current generated build ID on integrated `main`: `238032e12d0f`.

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

## GitHub-Only Sharding Foundation

- `src/domain/sharded-data.js` deterministically splits and recomposes the normalized payload without changing PDM semantics.
- The preview schema separates a lightweight manifest, shared materials, compact where-used references, notifications, and product-scoped BOM/assets/revision data.
- `scripts/migrate-data.mjs` is dry-run by default, derives a SHA-256 dataset version, and refuses output unless full payload parity succeeds. Explicit preview output requires `--write --out <directory>`.
- `src/infrastructure/sharded-data.js` provides cached lazy reads and uses the legacy loader only when `data/manifest.json` is absent. Existing but invalid shards are errors, not fallback conditions.
- `src/infrastructure/github-git-data.js` can publish a validated set of UTF-8 files and deletions through one Git tree commit. It checks an optional expected HEAD before creating objects and uses a non-force ref update as the final concurrency gate.
- Ref-update `409`/`422` responses use the stable `GITHUB_DATA_CONFLICT` code. Blob, tree or commit failures retain HTTP status and endpoint context. A failed final ref update may leave unreachable objects but cannot partially update the branch tree.
- These modules are deliberately not wired into `src/application.js`; production Viewer/Admin still read and write `data.js` until compatibility cutover orchestration preserves remote notification history and submits every affected shard together.
- Foundation branch verification passes 100/100 tests. The current-data dry-run validates 22 products, 646 materials, 2725 BOM entries, 1 notification, and 26 planned shard files.

## Verified Baseline (2026-07-14)

- `npm run check`: 89/89 tests passed.
- Atomic-writer stacked branch: 108/108 tests passed; production runtime orchestration remains unchanged.
- Canonical data audit: 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors, 0 warnings.
- Outer Material Master/revision contracts: 23/23 passed.
- Outer runtime contracts: 13/13 passed.
- Generated artifact check and JavaScript syntax check passed.
- Browser smoke verified Material Asset draft behavior and a real GLB render; manual clean-profile `file://` verification remains the final distribution check because automation blocks that protocol.

Do not treat a hard-coded test count as permanent; always report the current command output.
