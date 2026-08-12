# BOM handoff — 2026-08-12

## Committed, verified scope

- Added six white LED-strip materials: `DD0500WH`, `DD0650WH`,
  `DD0900WH`, `DD1050WH`, `DD1350WH`, and `DD1500WH`.
- Rewired the eight WH product-component BOM rows to their matching white
  LED-strip material. BH and KD continue to use the black material.
- Kept 300 square-tube parent-child relationships. Removed the erroneous
  `41底脚 -> FG1515065680` relationship; the valid `51底脚` relationship is
  retained.
- Rounded all stored square-tube relationship quantities to no more than six
  decimal places.
- Corrected the 9款 center-foot references:
  - `LGS032`, `LGS132`, and `LGS232` now use `ZJG150651BH` (`51底脚`).
  - `ZJG150651BH` is `65.5×15×15mm`.
  - 11款 continues to use the `54底脚` material codes.

## Evidence already inspected

- `铁件BOM(1).xlsx` contains square tubes plus non-tube items such as
  `三槽螺母`, `拉铆螺母`, `连接片`, `固定片`, and screws.
- The legacy 101/111 BOM confirms:
  - `LM139M6` = `三槽螺母`, `M6×13.9mm`.
  - `LM999M6` = `拉铆螺母`, `M6棱形拉铆螺母`.
- 2D drawings confirm that drawing label `M6圆螺母` means the same physical
  item as legacy `三槽螺母`.
- The similar-material workbook is valid only for `侧框` and `中框`; do not use
  it to infer any `横杆` or `横梁` relationship.
- Direct drawing evidence includes:
  - `LGS101-S-侧框左/右`: each has `2×M6拉铆螺母` and `2×M6管塞`.
  - `LGS101-S-顶部横杆`: two `M6圆螺母`.
  - `51底脚` and `54底脚`: both contain an M6 pipe-plug assembly.
  - Manufacturing documents describe the pipe-plug assembly as `15×15mm,
    M6`, `注塑+钢`, black. Its final PDM code and cross-color policy are not
    confirmed.

## Intentionally deferred

Do not create or map these until every parent-child quantity is reconciled
against both the 2D drawing and the product total in `铁件BOM(1).xlsx`:

- `M6管塞`
- `LM139M6` / `三槽螺母` relationships
- `LM999M6` / `拉铆螺母` relationships
- `连接片`, `固定片`, and `M6×17`, `M6×18`, `M6×30` screw relationships

There are local, untracked OCR renders and downloaded drawing PDFs under
`tmp/`. They are workspace aids only and must not be committed. A next agent
should either reuse them locally or reproduce the evidence from the original
drawings.

## PDM data model reminder

Product JSON files contain only product-level BOM rows. Component-to-raw-
material relationships belong in `data/materials.json` under `bomEntries`
with `parentType: "material"`; the runtime expands those rows as BOM level 2.

## Validation completed for this commit

- `npm run audit:data`: 0 errors, 0 warnings.
- `npm run test:node`: 739 passed, 0 failed.
- `git diff --check`: passed.

The full browser E2E suite was not used as a final gate in this session after
an earlier timed-out invocation left a duplicate E2E process running. The
duplicate process was stopped before the Node suite was run.
