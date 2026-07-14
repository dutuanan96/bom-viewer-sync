# BOM Viewer GitHub Sync

The canonical source is `work/remote-bom-viewer-sync/bom-viewer-sync/`. Build and test there; never edit generated artifacts in `outputs/` or on the Desktop.

## Current Release State

PR #1 was squash-merged into `main` on 2026-07-14 as `72debab`. Product revision/effectivity, Material Master 2D/3D draft editing and expanded payload notifications are now integrated. Current generated build ID is `238032e12d0f`.

- Canonical `main` artifacts are the source of truth.
- `outputs/` runtime artifacts have been rebuilt from integrated `main` and match canonical bytes.
- Desktop `admin.html` and `viewer.html` are release copies from the verified integrated build.
- Context documents in canonical and `outputs/` must remain byte-identical.
- Canonical data audits at 646 materials/1 notification; `outputs/data.js` remains the older 643-material/6-notification snapshot by design.

Runtime publication and data synchronization are separate operations. Never copy `outputs/data.js` over canonical or GitHub data.

## Release Assets Experiment

The public `dutuanan96/bom-viewer-assets` repository and release `assets-v1` were created for an adapter-only experiment. Binary upload works, but direct Viewer delivery does not: PDFs are forced to download and GLB fetches are blocked by missing CORS headers. The adapter is inactive, no Admin/Viewer flow changed, and no runtime or Desktop artifact should be published from this branch. Do not use jsDelivr repository paths for Release Asset objects.

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
