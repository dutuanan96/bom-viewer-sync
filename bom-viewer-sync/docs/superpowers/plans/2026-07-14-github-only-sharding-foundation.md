# GitHub-Only Sharding Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, reversible sharding foundation for the current BOM payload without switching production reads or writes away from `data.js`.

**Architecture:** A pure domain codec splits one normalized payload into a manifest, shared material catalog, compact where-used index, notifications shard, and one product shard per product. A migration CLI validates a full round trip before optionally writing JSON files to an explicit output directory. An infrastructure repository exposes lazy shard reads with promise caching and falls back to the legacy loader only when the manifest is absent.

**Tech Stack:** Node.js ES modules, browser-compatible JavaScript, Node test runner, GitHub-hosted JSON files.

## Global Constraints

- Do not modify, overwrite, or copy `data.js`.
- Runtime remains on the legacy `data.js` flow in this PR; no production cutover.
- Preserve `currentRevision`, `effectiveRevision`, immutable historical snapshots, notifications, and all 2D/3D metadata.
- Keep Viewer as one standalone HTML file.
- Source lives in `src/`; code, variables, and comments use English.
- Do not add UI text or dependencies.

---

### Task 1: Sharded payload codec

**Files:**
- Create: `src/domain/sharded-data.js`
- Create: `tests/sharded-data.test.mjs`

**Interfaces:**
- Produces: `splitPayloadIntoShards(payload, { datasetVersion })`
- Produces: `composePayloadFromShards({ manifest, materials, notifications, products })`
- Produces: `shardFiles(shardSet)`

- [ ] **Step 1: Write failing round-trip and invariant tests**

Test a representative payload with product BOM entries, material-parent entries, asset metadata, notifications, and revision snapshots. Assert that splitting then composing reproduces `normalizePayload(payload)`, that each BOM entry is placed in exactly one product shard, and that unsafe product codes are rejected before constructing a path.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/sharded-data.test.mjs`

Expected: failure because `src/domain/sharded-data.js` does not exist.

- [ ] **Step 3: Implement the minimal deterministic codec**

Use schema version `1`. Emit `data/manifest.json`, `data/materials.json`, `data/indexes/where-used.json`, `data/notifications.json`, and `data/products/<ProductCode>.json`. Product shards contain the product record, product-scoped BOM entries, per-product assets, and the complete revision registry entry. The materials shard contains only the shared material records and material database version.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/sharded-data.test.mjs`

Expected: all codec tests pass.

### Task 2: Safe migration CLI

**Files:**
- Create: `scripts/migrate-data.mjs`
- Modify: `package.json`
- Create: `tests/migrate-data.test.mjs`

**Interfaces:**
- Consumes: `splitPayloadIntoShards` and `shardFiles`
- Produces: default dry-run command `npm run migrate:data`
- Produces: explicit output command `npm run migrate:data -- --write --out <directory>`

- [ ] **Step 1: Write failing CLI tests**

Assert that the default command reads but does not modify the source file or create a `data/` directory, reports parity counts, requires `--out` with `--write`, and writes only the known shard paths when explicitly requested.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/migrate-data.test.mjs`

Expected: failure because the CLI does not exist.

- [ ] **Step 3: Implement the CLI**

Parse `data.js` through the existing GitHub data parser, normalize it, calculate a SHA-256 dataset version, split it, compose it again, and fail unless the normalized payload matches byte-for-byte JSON serialization. Keep dry-run as the default. Never perform network access or GitHub writes in this PR.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/migrate-data.test.mjs`

Expected: all migration tests pass.

### Task 3: Lazy shard repository with legacy fallback

**Files:**
- Create: `src/infrastructure/sharded-data.js`
- Create: `tests/sharded-repository.test.mjs`

**Interfaces:**
- Produces: `createShardedDataRepository({ loadJson, loadLegacyPayload, manifestPath })`
- Repository methods: `loadManifest()`, `loadMaterials()`, `loadWhereUsedIndex()`, `loadNotifications()`, `loadProduct(productCode)`, `loadCompletePayload()`

- [ ] **Step 1: Write failing repository tests**

Assert manifest-first loading, one request per cached shard, product-code validation, dataset-version consistency, full payload reconstruction, and legacy fallback only for a missing manifest. Assert that an invalid existing shard fails instead of silently returning legacy data.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/sharded-repository.test.mjs`

Expected: failure because the repository module does not exist.

- [ ] **Step 3: Implement the minimal repository**

Inject all network behavior through `loadJson`. Cache in-flight promises by path. Treat only an error with `code === 'NOT_FOUND'` while reading the manifest as permission to call `loadLegacyPayload`; propagate all other errors.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/sharded-repository.test.mjs`

Expected: all repository tests pass.

### Task 4: Context and completion gates

**Files:**
- Modify: `AI_DEBUG_GUIDE.md`
- Modify: `HANDOVER.md`
- Modify: `PROJECT_CONTEXT.md`
- Modify: `REVIEW_CONTEXT.md`
- Modify: `README_SYNC.md`

- [ ] **Step 1: Document the new non-runtime foundation**

Record that `data.js` remains authoritative, the migration defaults to dry-run, generated shards are preview output only, and future cutover requires an atomic Git Trees writer plus Release Asset browser proof-of-concept.

- [ ] **Step 2: Run focused and full verification**

Run:

```powershell
node --test tests/sharded-data.test.mjs tests/migrate-data.test.mjs tests/sharded-repository.test.mjs
npm run migrate:data
npm run build
npm run check
node --check app-admin.js
git diff --check
git diff -- data.js
```

Expected: every command exits `0`; `git diff -- data.js` is empty.

- [ ] **Step 3: Review and publish**

Review the full diff, commit with a conventional commit message, push `codex/github-only-sharding-foundation`, and open a new draft pull request. Do not merge or publish to `outputs/` or Desktop.
