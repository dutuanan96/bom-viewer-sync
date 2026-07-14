# BOM Viewer GitHub Sync

The canonical source is `work/remote-bom-viewer-sync/bom-viewer-sync/`. Build and test there; never edit generated artifacts in `outputs/` or on the Desktop.

## Current Release State

PR #1 was squash-merged into `main` on 2026-07-14 as `72debab`; Phase A PR #5 was squash-merged as `de35ea2`. Product revision/effectivity, Material Master draft editing, notifications, and the create-only satellite adapter are integrated. Phase B PR #6 was approved for squash merge on 2026-07-14; its submitted generated build ID is `21ca427a7b66`.

- Canonical `main` artifacts are the source of truth.
- `outputs/` runtime artifacts have been rebuilt from integrated `main` and match canonical bytes.
- Desktop `admin.html` and `viewer.html` are release copies from the verified integrated build.
- Context documents in canonical and `outputs/` must remain byte-identical.
- Canonical data audits at 646 materials/1 notification; `outputs/data.js` remains the older 643-material/6-notification snapshot by design.

Runtime publication and data synchronization are separate operations. Never copy `outputs/data.js` over canonical or GitHub data.

## Material Master Asset Upload

Phase B lets Admin select validated PDF, GLB, or portable GLTF files from Material Master. Selection and Save Material are local-only: bytes remain in application memory and the stored draft carries an internal pending ID with no public URL. Save to GitHub uploads only referenced binaries to public repository `dutuanan96/bom-viewer-assets`, reads the current BOM payload/SHA, then writes BOM data with commit-pinned jsDelivr URLs. Upload failure prevents the BOM write; BOM-write retry reuses any already resolved immutable URL. Existing asset metadata is preserved.

`data.js`, `outputs/`, and Desktop remain unchanged. Do not publish them until PR #6 is verified merged, the post-merge `main` gate passes, and publication is separately approved.

## Sync Rules

- Build generates `admin.html`, `app-admin.js`, `styles.css`, and standalone `viewer.html`.
- Mirror runtime artifacts only after the feature is integrated into `main` and the complete gate passes.
- Never copy or modify `data.js` for a code-only release.
- Remote GitHub data is authoritative; local `data.js` may be older than `origin/main`.
- Verify SHA-256 equality after every approved mirror operation.
- Replace Desktop shareable files only from the verified integrated build.
- After changing source, rebuild and rerun the full gate before mirroring; after changing only cloud data, Viewer users only need reload.

## Publication Flow

1. Merge the approved feature PR and fast-forward canonical `main` from `origin/main`.
2. Run `npm run build` and `npm run check` in the canonical checkout.
3. Run `node work\build_standalone_viewer.mjs` from the outer project root.
4. Run the outer compatibility tests and data audit.
5. Compare hashes for the four runtime artifacts and five context documents.
6. Copy the verified `admin.html` and `viewer.html` to the Desktop release location.

Viewer reloads fetch current remote data through cache-busted GitHub requests. Admin writes must use the current remote payload and SHA, and credentials must never be committed.
