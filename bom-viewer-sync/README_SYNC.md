# BOM Viewer GitHub Sync

The canonical source is `work/remote-bom-viewer-sync/bom-viewer-sync/`. Build and test there; never edit generated artifacts in `outputs/` or on the Desktop.

## Current Release State

PR #1 was squash-merged into `main` on 2026-07-14 as `72debab`; Phase A PR #5 was squash-merged as `de35ea2`; Phase B PR #6 was merged. Product revision/effectivity, Material Master draft editing, notifications, and the create-only satellite adapter are integrated. Phase B.1 PR #8 and Phase B.2 PR #9 were merged. Phase B.3 implements the Atomic Sharded Writer Foundation. Phase B.4 PR #11 and its PR #12 readback hotfix are merged. Phase B.5 PR #14 completed the sharded runtime cutover. Phase B.6 release acceptance passed against `main` commit `d477f884ccc572e3559f78220d0abe9cdcb6cb42`.

- Canonical `main` artifacts are the source of truth.
- `outputs/` contains the hash-verified Phase B.6 four-file runtime release and synchronized five-document context set.
- Desktop contains the current four-file runtime set: `viewer.html`, `admin.html`, `app-admin.js`, and `styles.css`.
- This material-owned-asset branch audits at 628 active runtime material
  records and 5 notifications; `outputs/data.js` and `outputs/data/` are absent
  by design.

Runtime publication and data synchronization are separate operations. Never create or copy mirror `data.js`/`data/` over canonical GitHub shards.

## Material Master Asset Upload

Phase B lets Admin select validated PDF, GLB, or portable GLTF files from Material Master. Selection and Save Material are local-only: bytes remain in application memory and the stored draft carries an internal pending ID with no public URL. Save to GitHub uploads only referenced binaries to public repository `dutuanan96/bom-viewer-assets`, reads the current shard payload/expected HEAD, then performs one atomic 24-shard write with commit-pinned jsDelivr URLs. Upload failure prevents the shard write; shard-write retry reuses any already resolved immutable URL. Existing asset metadata is preserved.

Material PDF/GLB ownership is centralized in `materialDb.materials`: one active
2D asset and one active 3D asset per `materialId`, shared by every LGS product
that uses that material. Product assembly models stay separate. The offline
product-aware audit uses:

```powershell
npm run audit:material-assets -- --pdf-root "D:\1.金汰产品\2D图纸_按LGS分组"
```

The canonical mapping removes duplicate references only. It does not delete
physical files from Drive, the local PDF source, or Git.

Phase B.1 (PR #8) adds a compatibility layer. Phase B.2 (PR #9) proves data sharding integrity in memory. Phase B.3 adds the Atomic Sharded Writer Foundation. Phase B.4 (PR #11) used it for one guarded write to staging branch `codex/phase-b4-shards-20260715T041629Z-db11b4a`; commit `227db46` contains 24 verified shards. Phase B.5 (PR #14) activates the sharded adapter and atomic writer in application runtime. The runtime now reads and writes the exact 24 files in `data/`; tracked `data.js` remains rollback/migration input only. The old local upload commits `1ad16cb` and `2db18d5` are superseded by the separately reviewed asset-storage and pending-asset work merged through PR #5 and PR #6.

## Sync Rules

- Build generates `admin.html`, `app-admin.js`, `styles.css`, and standalone `viewer.html`.
- Mirror runtime artifacts only after the feature is integrated into `main` and the complete gate passes.
- Never copy or modify `data.js` for a code-only release.
- Canonical GitHub `data/` shards are authoritative; tracked and mirrored `data.js` files are rollback/legacy snapshots and must never overwrite the shards.
- Verify SHA-256 equality after every approved mirror operation.
- Replace Desktop shareable files only from the verified integrated build.
- After changing source, rebuild and rerun the full gate before mirroring; after changing only cloud data, Viewer users only need reload.

## Publication Flow

1. Merge the approved feature PR and fast-forward canonical `main` from `origin/main`.
2. Run `npm run build` and `npm run check` in the canonical checkout.
3. Run `node work\build_standalone_viewer.mjs` from the outer project root.
4. Run the outer compatibility tests and data audit.
5. Compare hashes for the four runtime artifacts and five context documents.
6. Copy the verified `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html` to the Desktop release location.

## Phase B.6 Acceptance Record

- Live UAT branch `codex/phase-b6-uat-2026-07-15T112949034Z-d477f88` is at `e843f276d1cedcfa30615b4177989a4e76170bd1` with 24 shards and aggregate SHA-256 `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`.
- Authenticated/public readbacks matched; manual clean-profile Viewer/Admin acceptance passed with zero console errors and zero `data.js` requests.
- Phase B.6 is closed. Do not rerun its one-time UAT flow unless a new independently scoped phase explicitly requires it.

Viewer reloads fetch current remote data through cache-busted, commit-pinned GitHub shard requests. Admin writes must use the current remote shard payload and expected HEAD, and credentials must never be committed.
