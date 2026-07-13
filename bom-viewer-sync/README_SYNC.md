# BOM Viewer GitHub Sync

The canonical project root is `work/remote-bom-viewer-sync/bom-viewer-sync/`; application source lives in `src/`. Build from the clone with `npm run build`, then run `npm run check` for the complete local gate.

## Generated Runtime

The build generates `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html`. Never edit these files directly. Their cache/build identifier is a dynamic 12-character source hash (current output: `7ab045092fbb`), not a fixed version string.

`viewer.html` is the shareable standalone Viewer. Rebuild and redistribute it after a program, style, or shell change. Data and linked assets remain remote, so GitHub/Drive data changes appear when Viewer reloads.

## Sync Rules

- Outer `outputs/` is a verified runtime mirror, not the editable source tree.
- For a code-only change, mirror only the four generated files and synchronized workflow documents.
- Do not copy or modify `data.js` for code-only work.
- Public reads use cache-busted GitHub Contents API raw responses first; raw GitHub is fallback only.
- Admin writes use the current remote payload and SHA, and tokens must never be committed.

The BOM inspector is intentionally disabled for plain BOM-row clicks in Viewer and Admin.
