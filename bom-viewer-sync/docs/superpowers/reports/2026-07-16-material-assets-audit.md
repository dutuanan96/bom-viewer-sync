# Material-owned asset audit

Date: 2026-07-16

## Decision

Each record in `materialDb.materials` owns at most one active 2D PDF and at most
one active 3D GLB. Every LGS product that references the same `materialId` uses
those same material-owned assets.

Product-level assembly models remain separate in the top-level `models3d`
collection.

## Selection rule

Canonical assets were selected from existing references. Selection starts from:

1. the material identity (`materialId`, code, and name);
2. all products that currently reference that material through
   `materialDb.bomEntries`;
3. the PDF/GLB candidates belonging to those products;
4. local PDF content under `D:\1.金汰产品\2D图纸_按LGS分组` and repository GLB
   content.

Folder names and filenames are evidence, not identity. For example:

- `mat_1m5b6t5` is `ZJG150654BH / 51底脚`; it keeps the 51 asset from a product
  that actually uses the material, rather than an unrelated first filename.
- `mat_1tlmea4` is the corresponding 54 material and keeps the 54 PDF/GLB.
- The two drawer PDFs found under `LGS043-S` and `LGS420-S` belong to different
  LGS products. They are only treated as interchangeable for a shared material
  after both product sources are explicitly mapped and their SHA-256 content is
  verified identical.

## Result

| Metric | Before | After |
| --- | ---: | ---: |
| Materials | 628 | 628 |
| BOM entries | 2,725 | 2,725 |
| Material PDF references | 524 | 361 |
| Material GLB references | 443 | 433 |
| Maximum PDFs on one material | 20 | 1 |
| Maximum GLBs on one material | 3 | 1 |
| Materials changed | 43 | 43 |
| Missing asset sources | 0 | 0 |
| Duplicate/conflicting material asset groups | 48 | 0 |

The migration removed 163 extra PDF references and 10 extra GLB references.
It did not delete physical files from Google Drive, the local PDF folder, or
Git. Physical deletion is intentionally deferred until viewer verification and
an independent cleanup list are complete.

## Safety checks

- All 552 unique referenced asset locators were content-hashed.
- Explicit multi-product source mappings must resolve to identical hashes or the
  audit stops with `SOURCE_CONTENT_CONFLICT`.
- The migration is idempotent: a second apply reports no data change.
- After stripping `drawings` and `models3d` from material records, the complete
  JSON payload is byte-equivalent in structure and values to the pre-migration
  payload.
- Top-level product drawings and product assembly models remain unchanged.

## Commands

```powershell
npm run audit:material-assets -- --pdf-root "D:\1.金汰产品\2D图纸_按LGS分组"
npm run migrate:material-assets -- --apply --pdf-root "D:\1.金汰产品\2D图纸_按LGS分组"
```

The canonical selection and exceptional source mappings are recorded in
`scripts/material-asset-mapping.json`.
