# BOM Viewer / PDM Context

AI debugging entrypoint: read `AI_DEBUG_GUIDE.md` first. It is self-contained; the remaining context files provide current integration state and handoff detail.

## Canonical Source And Build

- Canonical project root: `work/remote-bom-viewer-sync/bom-viewer-sync/`; editable application source lives in `src/`.
- Current feature branch: `codex/product-bom-revisions`.
- Draft pull request: `#1` (`codex/product-bom-revisions` -> `main`).
- Build command: `npm run build`; complete repository gate: `npm run check`.
- Generated files: `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html`.
- Never edit generated files directly. Edit source or build scripts, then rebuild.
- Current generated build ID on the feature branch: `1f21d89ccd2a`.

## Product Revision And Effectivity Model

- `currentRevision` is the latest design revision; `effectiveRevision` is the single revision currently used in production.
- Creating a revision from a released product creates a Draft and preserves the previous BOM as an immutable snapshot.
- Creating Draft `V3.1` does not automatically release it and does not move effectivity away from released `V3`.
- Releasing the clean latest Draft requires a reason, makes it the sole effective revision, and leaves earlier revisions released but non-current.
- Released and historical revisions are read-only. A new revision may be created from the current released revision.
- Transition metadata and events must preserve the source revision and release history.

The main domain owner is `src/domain/revisions.js`; orchestration is in `src/application.js`, and the BOM selectors are rendered by `src/ui/bom-view.js`.

## Current Synchronization State

| Surface | State | Rule |
|---|---|---|
| Canonical feature checkout | Current implementation and generated artifacts | Review and test here |
| Outer `outputs/` runtime artifacts | Intentionally pre-feature until PR #1 is merged | Do not publish the feature from this mirror yet |
| Outer `outputs/` context documents | Current | Keep byte-identical to the canonical context documents |
| Desktop `admin.html` / `viewer.html` | Older shareable copies | Replace only after the integrated `main` build passes |
| Local `data.js` | Test/snapshot data, older than current `origin/main` | Never copy or commit it for code-only work |

The Viewer uses a cache-busted GitHub Contents API read, so remote data can be newer than the local `data.js`. Admin saves must read the current remote payload and SHA immediately before diffing and writing.

## Verified Baseline (2026-07-13)

- `npm run check`: 71/71 tests passed.
- Data audit: 643 materials, 2725 BOM entries, 22 products, 0 errors, 0 warnings.
- Outer Material Master/revision contracts: 23/23 passed.
- Outer runtime contracts: 13/13 passed.
- Generated artifact check and JavaScript syntax check passed.

Do not treat a hard-coded test count as permanent; always report the current command output.
