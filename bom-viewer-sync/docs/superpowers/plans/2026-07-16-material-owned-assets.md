# Material-Owned 2D and 3D Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each Material Database record the single owner of at most one active 2D drawing and one active 3D model, shared by every LGS that references the material.

**Architecture:** Add a pure asset-audit and migration module, drive it through a dry-run-first CLI, clean the current `materialDb`, stop legacy conversion from merging later product copies, and remove product-level fallback for material rows. Preserve the existing whole-product 3D path.

**Tech Stack:** Node.js ES modules, `node:test`, JSON shard data, existing browser runtime and build scripts.

## Global Constraints

- Baseline commit is `9cb9fdd2ea51899158ebdbf42076831f3ce8b003`.
- Work only on branch `codex/material-owned-assets`.
- Do not delete physical Google Drive or catalog model files.
- Do not change BOM quantities, hierarchy, product revisions, manuals or notifications.
- A material has at most one active `drawings` entry and one active `models3d` entry.
- Different content must not be collapsed solely by filename.
- Product assembly 3D remains separate from material 3D.
- The CLI is dry-run by default and apply mode must be explicit.
- `npm run check` is the primary completion gate.

---

### Task 1: Add deterministic material-asset audit primitives

**Files:**
- Create: `scripts/lib/material-asset-audit.mjs`
- Test: `tests/material-asset-audit.test.mjs`

**Interfaces:**
- Produces: `indexMaterialUsage(payload)`, `assetLocator(asset)`, `classifyAssetGroup(assets, hashes)`, `auditMaterialAssets(payload, hashes)`, and `applyCanonicalMaterialAssets(payload, mapping)`.

- [ ] Write tests proving shared BOM rows resolve to one material usage set, identical hashes classify as `duplicate`, different hashes classify as `conflict`, missing hashes classify as `missing`, and an explicit mapping changes only material asset arrays.
- [ ] Run `node --test tests/material-asset-audit.test.mjs` and verify the tests fail because the module does not exist.
- [ ] Implement the pure functions without filesystem or network access.
- [ ] Run the targeted test and verify it passes.
- [ ] Commit with `test: add material asset audit primitives`.

### Task 2: Add dry-run-first audit and migration CLI

**Files:**
- Create: `scripts/audit-material-assets.mjs`
- Create: `scripts/material-asset-mapping.json`
- Modify: `package.json`
- Test: `tests/material-asset-cli.test.mjs`

**Interfaces:**
- Consumes: audit primitives from Task 1.
- Produces: `npm run audit:material-assets` and `npm run migrate:material-assets -- --apply`.

- [ ] Write tests proving default execution does not write, apply requires the checked-in mapping, output is deterministic, and a second apply is idempotent.
- [ ] Run the targeted CLI test and verify the missing CLI fails.
- [ ] Implement Drive-file download hashing, local model hashing, JSON reporting and explicit apply mode.
- [ ] Add package scripts and an initially empty mapping object with schema/version metadata.
- [ ] Run targeted tests and a live dry-run against `data/materials.json`.
- [ ] Commit with `feat: add material asset audit migration`.

### Task 3: Approve and apply the canonical asset mapping

**Files:**
- Modify: `scripts/material-asset-mapping.json`
- Modify: `data/materials.json`
- Create: `docs/superpowers/reports/2026-07-16-material-assets-audit.md`

**Interfaces:**
- Consumes: dry-run report and file hashes.
- Produces: explicit canonical asset selection for every material with more than one candidate.

- [ ] Review every 2D conflict using hash, material code/specification, source product and PDF rendering evidence.
- [ ] Review all nine multi-model materials using hash, material identity and model-name/geometry evidence.
- [ ] Record canonical locators and review reasons in the mapping.
- [ ] Run dry-run twice and verify identical reports.
- [ ] Apply the mapping and verify only `materialDb.materials[*].drawings` and `.models3d` changed.
- [ ] Run apply again and verify zero changes.
- [ ] Commit with `fix(data): canonicalize material assets`.

### Task 4: Stop legacy product assets from accumulating on materials

**Files:**
- Modify: `src/domain/materials.js`
- Test: `tests/materials-domain.test.mjs`

**Interfaces:**
- Produces: legacy conversion seeds the first non-empty asset set and ignores later product copies for the same `materialId`.

- [ ] Add a regression test with one shared material used by 20 products, each carrying a different PDF URL, and assert the converted material does not accumulate 20 drawings.
- [ ] Add a regression test proving the first empty source may be filled by a later non-empty source.
- [ ] Run the tests and verify the current `mergeAssets()` behavior fails the accumulation test.
- [ ] Replace cross-product merging with seed-once behavior while preserving deduplication within the selected source.
- [ ] Run targeted and full domain tests.
- [ ] Commit with `fix: keep legacy assets material-owned`.

### Task 5: Remove material-row product fallback while preserving product assembly 3D

**Files:**
- Modify: `src/ui/bom-view.js`
- Test: `tests/runtime-contract.test.mjs`
- Test: `tests/material-assets.test.mjs`

**Interfaces:**
- Produces: `drawingsFor(material)` and `models3dFor(material)` read only `_materialRecord`; `productModels3d()` remains unchanged.

- [ ] Add tests proving an empty material asset array does not fall back to product maps.
- [ ] Add a test proving product assembly 3D remains available.
- [ ] Run targeted tests and verify the legacy fallback assertions fail.
- [ ] Remove material-level fallback and keep the assembly function unchanged.
- [ ] Run targeted tests.
- [ ] Commit with `fix: resolve assets from material master`.

### Task 6: Update operational documentation and generated artifacts

**Files:**
- Modify: `AI_DEBUG_GUIDE.md`
- Modify: `HANDOVER.md`
- Modify: `PROJECT_CONTEXT.md`
- Modify: `REVIEW_CONTEXT.md`
- Modify: `README_SYNC.md`
- Modify generated: `admin.html`, `app-admin.js`, `styles.css`, `viewer.html`

**Interfaces:**
- Documents the new ownership contract, migration command, rollback boundary and product assembly exception.

- [ ] Update the five context documents with identical ownership terminology and current test totals.
- [ ] Run `npm run build`.
- [ ] Run `npm run check:generated`.
- [ ] Commit with `docs: document material-owned assets`.

### Task 7: Final verification and review handoff

**Files:**
- Create: `docs/superpowers/reports/2026-07-16-material-assets-verification.md`

**Interfaces:**
- Produces: raw command evidence and exact post-migration counts for independent review.

- [ ] Run `npm run audit:material-assets` twice and compare output.
- [ ] Run `npm run check`.
- [ ] Run `git diff --check`.
- [ ] Run browser smoke tests for `把手`, `254拉杆`, `51底脚`, one LGS333/LGS723 case and one product assembly model.
- [ ] Self-review the complete diff and confirm no physical asset deletion.
- [ ] Record branch, baseline SHA, final SHA, commands, exit codes and remaining manual risks.
- [ ] Commit with `docs: add material asset verification`.
