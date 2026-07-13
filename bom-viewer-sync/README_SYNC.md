# BOM Viewer GitHub Sync

The canonical source is `work/remote-bom-viewer-sync/bom-viewer-sync/`. Build and test there; never edit generated artifacts in `outputs/` or on the Desktop.

## Current Release State

The product revision/effectivity feature is on `codex/product-bom-revisions` in draft PR #1. Its generated build ID is `1f21d89ccd2a`.

- Canonical feature artifacts are current for PR review.
- `outputs/` runtime artifacts are intentionally still the pre-feature build.
- Desktop `admin.html` and `viewer.html` are older shareable copies.
- Context documents in canonical and `outputs/` describe the current state even while runtime publication is pending.

This is an intentional staged release, not an instruction to copy the feature artifacts before merge.

## Sync Rules

- Build generates `admin.html`, `app-admin.js`, `styles.css`, and standalone `viewer.html`.
- Mirror runtime artifacts only after the feature is integrated into `main` and the complete gate passes.
- Never copy or modify `data.js` for a code-only release.
- Remote GitHub data is authoritative; local `data.js` may be older than `origin/main`.
- Verify SHA-256 equality after every approved mirror operation.
- Replace Desktop shareable files only from the verified integrated build.

## Post-Merge Publication

1. Fast-forward canonical `main` from `origin/main`.
2. Run `npm run build` and `npm run check` in the canonical checkout.
3. Run `node work\build_standalone_viewer.mjs` from the outer project root.
4. Run the outer compatibility tests and data audit.
5. Compare hashes for the four runtime artifacts and five context documents.
6. Copy the verified `admin.html` and `viewer.html` to the Desktop release location.

Viewer reloads fetch current remote data through cache-busted GitHub requests. Admin writes must use the current remote payload and SHA, and credentials must never be committed.
