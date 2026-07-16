# JinTai PDM/BOM Viewer Architecture

Stable system architecture and domain contracts for the canonical project.
Use `AI_DEBUG_GUIDE.md` for the change workflow and `docs/RELEASE.md` for
publication.

## System Surfaces

Viewer is a standalone read-only application. It resolves a configured Git
branch to an exact commit, loads commit-pinned data shards, and renders product,
BOM, material, revision, and structure views.

Admin uses the same shared application source with editing capabilities. It
loads the current Git ref and shard blobs, retains the expected remote HEAD,
keeps edits local, and performs an explicit GitHub save only after user action.

## Source Ownership

| Path | Responsibility |
|---|---|
| `src/application.js` | Application state, event binding, and orchestration |
| `src/domain/bom.js` | BOM row resolution and navigation indexes |
| `src/domain/materials.js` | Material normalization, lookup, and where-used |
| `src/domain/relationships.js` | Parent-child material relationships |
| `src/domain/revisions.js` | Revision history, snapshots, and effectivity |
| `src/features/notifications.js` | Payload diff and notification events |
| `src/features/material-asset-upload.js` | Pending file validation and resolution |
| `src/infrastructure/github-sharded-data.js` | Exact shard reads and writer delegation |
| `src/infrastructure/github-git-data.js` | Atomic Git Data write sequence |
| `src/infrastructure/github-asset-storage.js` | Create-only binary asset publication |
| `src/ui/` | Rendering and UI interaction |
| `src/shell.html` | Shared Viewer/Admin HTML shell |
| `src/styles/app.css` | Canonical stylesheet source |
| `scripts/` | Build, audit, migration, and verification utilities |
| `tests/` | Behavior and contract tests |

Domain modules do not depend on DOM or network behavior. UI modules do not
perform direct GitHub writes.

## Build Boundary

Editable build inputs are under `src/`. The generated runtime set is:

```text
admin.html
app-admin.js
viewer.html
styles.css
```

Generated artifacts are never hand-edited. `scripts/build.mjs` produces them,
and `scripts/check-generated.mjs` verifies freshness while normalizing LF/CRLF
line endings.

## Runtime Data

Canonical runtime data is the exact 24 shards:

```text
data/manifest.json
data/materials.json
data/products/*.json
```

`data.js` is a rollback and migration snapshot. Viewer and Admin do not use it
as a runtime source or fallback.

Viewer data flow:

```text
configured branch
  -> exact commit
  -> cache-busted commit-pinned shard URLs
  -> exact shard validation
  -> payload assembly and normalization
  -> read-only rendering
```

Admin save flow:

```text
current ref and shard blobs
  -> local application edits
  -> referenced pending asset uploads
  -> fresh remote payload and expectedHeadSha
  -> preserved remote notification history
  -> complete outgoing payload
  -> exact shard serialization
  -> blobs, tree, and commit
  -> one non-force ref update
```

The final diff is calculated from the fresh remote payload, not from a stale
payload loaded at the start of the editing session. The ref update uses
`force:false`.

## Product Revisions

- `currentRevision` is the latest design revision.
- `effectiveRevision` is the single production-effective revision.
- A new revision starts as Draft.
- Draft creation preserves the previous BOM as an immutable snapshot.
- Draft creation does not change effectivity.
- Release requires a clean latest Draft and a reason.
- Release moves effectivity atomically.
- Released and historical revisions are read-only.

## Materials And BOM

- Material records are reusable canonical entities.
- BOM entries connect products or parent materials to child materials.
- Traversal and where-used behavior use stable material IDs.
- BOM child resolution prefers `childMaterialId` and falls back to
  `materialId`.
- Numeric quantity zero remains zero.

## Material Assets

- Each `materialId` owns at most one active PDF and one active GLB/GLTF.
- Products using the same material share those material assets.
- Product assembly models remain product-scoped.
- Material fields and asset arrays are edited through an isolated draft.
- Save Material updates local payload only.
- Save to GitHub is a separate explicit operation.
- Selecting a file performs no upload.
- Pending bytes remain in memory until the cloud save.
- Asset upload failure prevents the shard write.
- A resolved immutable asset URL is reused if the later shard write fails.
- Serialized shards contain no pending IDs, file bytes, or blob URLs.
- Physical asset deletion requires separate scope and approval.

## Notifications

Payload diff covers product additions, material additions or deletions,
material field changes, and BOM additions, deletions, or quantity changes.
Remote notification history is preserved before the current save notification
is appended.

## Localization And Security

- Code, comments, identifiers, and technical logs are English.
- PDM UI defaults to zh-CN through i18n keys.
- Chinese or Vietnamese UI text is not hardcoded in source modules.
- Viewer contains no write credential and performs no data mutation.
- Credentials, tokens, pending file bytes, and machine-specific paths never
  enter tracked or generated files.

## Non-Canonical Surfaces

Outer `outputs/` and Desktop copies are release/shareable mirrors. Mirrors are
non-canonical, may lag `main`, and never feed data or code back into the
repository. Runtime data shards are not copied into those mirrors.
