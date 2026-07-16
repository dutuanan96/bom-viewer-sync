# Material-Owned 2D and 3D Assets Design

## Objective

Make `materialDb.materials[materialId]` the single owner of a material's 2D drawing and 3D model. A material reused by many LGS products must expose the same canonical assets everywhere without accumulating one copy per product.

## Data contract

- `materialDb.materials[materialId].drawings` owns the material drawing.
- `materialDb.materials[materialId].models3d` owns the material model.
- Each material may have at most one active 2D drawing and one active 3D model.
- `materialDb.bomEntries` references the material through `materialId`; it does not own assets.
- Top-level `models3d[productCode]` remains available only for whole-product assembly models.
- Top-level `drawings[productCode]` and material-level entries in top-level `models3d[productCode]` are legacy migration inputs, not runtime ownership.

## Canonicalization rules

1. Group assets by `materialId` and asset kind.
2. Verify every referenced file is readable.
3. Calculate SHA-256 for downloaded PDFs and local GLB/GLTF files.
4. Collapse byte-identical files automatically.
5. When files differ:
   - compare the asset name, material code, specification, source product and rendered/geometry evidence;
   - select the asset that matches the material identity;
   - split the material identity or leave the material blocked when the files represent different parts or revisions.
6. Never select a canonical asset solely because its product code sorts first.
7. Never delete the physical Drive PDF or catalog model during this phase.

## Runtime behavior

Material rows resolve 2D and 3D only from `_materialRecord`. Product-level fallback is removed for material rows. Whole-product assembly 3D continues through the existing `productModels3d()` path.

The Material Database editor remains the only UI used to add, replace or remove material assets. Updating a material asset changes the asset shown by every BOM row that references the same `materialId`.

## Legacy migration behavior

Legacy payload conversion may seed a material asset from the first non-empty matching source, but it must not merge later product-owned copies into an already seeded material. Conflicting legacy candidates are reported by the audit/migration tooling rather than silently accumulated.

## Audit and migration

A Node.js audit module provides deterministic, testable functions for:

- indexing material usage by product;
- hashing local or downloaded asset bytes;
- classifying asset groups as `clean`, `duplicate`, `conflict` or `missing`;
- applying an explicit canonical mapping to a cloned payload;
- proving that only `drawings` and `models3d` changed.

The CLI defaults to dry-run. Applying changes requires an explicit flag and a checked-in mapping. Running the same migration twice must produce no second change.

## Safety and rollout

- Baseline commit: `9cb9fdd2ea51899158ebdbf42076831f3ce8b003`.
- Work only on `codex/material-owned-assets`.
- Primary gate: `npm run check`.
- Supporting gates: targeted tests, repeated dry-runs, `git diff --check`, asset audit, and browser smoke tests.
- Rollback is the commit immediately before the data migration.
- Deployment is through branch review and merge; no direct push to `main`.

## Success criteria

- A material used by 20 products still has at most one 2D and one 3D asset.
- All 628 material records satisfy the one-active-asset invariant.
- The known 2D accumulation groups are eliminated from `materialDb`.
- The nine materials with multiple 3D entries are either deduplicated or corrected to the model matching their material identity.
- Runtime material rows never read material assets from product-level legacy maps.
- Product assembly 3D still loads through its separate path.
- Migration is deterministic and idempotent.
