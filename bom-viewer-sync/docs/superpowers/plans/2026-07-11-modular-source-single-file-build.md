# Modular Source and Single-File Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic handwritten browser runtime with maintainable source modules and a deterministic build that still publishes one shareable `viewer.html`.

**Architecture:** The Git clone is the canonical source tree. ES modules under `src/` are bundled by `esbuild` into a complete Admin program and an inline Viewer program; `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html` are generated artifacts. Remote PDM data and linked assets remain outside the bundle and retain the existing GitHub Contents API and Google Drive behavior.

**Tech Stack:** Vanilla JavaScript ES modules, Node.js 22, `esbuild` 0.28.1, Node's built-in test runner, static HTML/CSS, GitHub Contents API.

## Global Constraints

- This is a structural refactor: do not change user-visible behavior, data shape, UI layout, or PDM workflows.
- Keep the floating BOM inspector hidden and empty; plain BOM-row clicks must not re-enable it.
- Keep zh-CN user-facing UI text in the existing i18n dictionary; do not add hardcoded Chinese or Vietnamese strings to source logic.
- Public reads must try the cache-busted GitHub Contents API raw response first and use `raw.githubusercontent.com` only as fallback.
- Admin saves must fetch the current remote payload and SHA before diffing and writing; never diff against only a stale local baseline.
- Opening the bell updates local read state but does not delete GitHub-backed notification events.
- Do not embed `data.js`, images, drawings, or GLB files in `viewer.html`.
- `esbuild` is development-only. The final Viewer must require no Node.js installation.
- Do not emit inline source maps, secrets, tokens, or local absolute paths into generated files.
- Generated artifacts are committed but never edited manually.
- Do not copy or modify `data.js` for this code-only refactor.
- Use PowerShell-compatible commands; do not use `&&`.
- Required baseline gates are: syntax checks pass; Material Master tests 16/16; restructure tests 13/13; audit reports 643 materials, 2725 BOM entries, 22 products, 0 errors, and 0 warnings.
- `work/material-db.test.mjs` currently passes 8/10 before this refactor. Its two stale expectations are not a release gate; do not change runtime behavior merely to satisfy them.
- Do not push to GitHub during implementation unless the user explicitly requests it.

## File Map

**Create:**

- `.gitignore` — excludes development dependencies and temporary build directories.
- `package.json`, `package-lock.json` — reproducible local build and test commands.
- `src/shell.html` — one tokenized HTML shell for Admin and Viewer.
- `src/styles/app.css` — human-maintained CSS source.
- `src/domain/materials.js` — material normalization, filtering, mutation, and synchronization.
- `src/domain/relationships.js` — parent-child relationship queries and BOM tree expansion.
- `src/domain/bom.js` — product/BOM navigation and row resolution.
- `src/infrastructure/assets.js` — asset matching and Google Drive URL conversion.
- `src/infrastructure/github-data.js` — GitHub configuration, parsing, reads, and writes.
- `src/features/notifications.js` — notification normalization, diffing, append behavior, and read calculations.
- `src/ui/catalog-view.js`, `src/ui/bom-view.js`, `src/ui/material-view.js`, `src/ui/structure-view.js`, `src/ui/shared-view.js` — focused UI method groups.
- `src/application.js` — state, event routing, orchestration, and Admin/Viewer policy.
- `src/admin-entry.js`, `src/viewer-entry.js` — minimal build entry points.
- `scripts/build.mjs` — deterministic bundle and HTML generation.
- `scripts/check-generated.mjs`, `scripts/check-all.mjs` — detect stale artifacts and run cross-platform verification.
- `scripts/audit-data.mjs` — repository-contained data integrity audit.
- `tests/helpers/load-data.mjs` — safe test loader for `data.js`.
- `tests/baseline-contract.test.mjs`, `tests/legacy-ui-contract.test.mjs`, `tests/runtime-contract.test.mjs`, `tests/build.test.mjs`, `tests/domain.test.mjs`, `tests/assets-notifications.test.mjs`, `tests/github-data.test.mjs`, `tests/ui-contract.test.mjs` — characterization, module, and artifact tests.

**Modify:**

- `admin.html`, `app-admin.js`, `styles.css`, `viewer.html` — generated outputs.
- `PROJECT_CONTEXT.md`, `HANDOVER.md`, `REVIEW_CONTEXT.md`, `README_SYNC.md` — canonical source/build/verification workflow.
- Outer workspace mirrors under `outputs/` — generated runtime and context copies only, after clone verification.

**Remove after all gates pass:**

- `app-core.js`, `app-viewer.js` — legacy generated/runtime chain superseded by `app-admin.js` and inline Viewer bundle.

---

### Task 1: Establish a Repository-Contained Baseline Harness

**Files:**

- Create: `.gitignore`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tests/helpers/load-data.mjs`
- Create: `tests/baseline-contract.test.mjs`
- Create: `tests/legacy-ui-contract.test.mjs`
- Create: `tests/runtime-contract.test.mjs`

**Interfaces:**

- Consumes: current `app-core.js`, `admin.html`, `viewer.html`, and `data.js`.
- Produces: `loadLegacyCoreUtils()` and `loadDataPayload()` for characterization tests; standard `npm test` command.

- [ ] **Step 1: Add the package and ignore files**

Create `.gitignore`:

```gitignore
node_modules/
.build-tmp/
*.tmp
```

Create `package.json`:

```json
{
  "name": "bom-viewer-sync",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs"
  },
  "devDependencies": {
    "esbuild": "0.28.1"
  }
}
```

- [ ] **Step 2: Install the exact development dependency**

Run:

```powershell
npm install
```

Expected: `package-lock.json` records `esbuild` 0.28.1 and `npm audit` reports no unresolved installation failure.

- [ ] **Step 3: Add safe legacy/data test loaders**

Create `tests/helpers/load-data.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const repoRoot = path.resolve(import.meta.dirname, '..', '..');

export function loadLegacyCoreUtils() {
  const source = fs.readFileSync(path.join(repoRoot, 'app-core.js'), 'utf8');
  const context = {
    console,
    TextEncoder,
    TextDecoder,
    window: { location: { search: '', hash: '' } },
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'app-core.js' });
  return context.window.BomCoreUtils;
}

export function loadDataPayload(filePath = path.join(repoRoot, 'data.js')) {
  const source = fs.readFileSync(filePath, 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'data.js' });
  return context.window.BOM_VIEWER_DATA;
}
```

- [ ] **Step 4: Write baseline contract tests before changing runtime structure**

Create `tests/baseline-contract.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadDataPayload, loadLegacyCoreUtils, repoRoot } from './helpers/load-data.mjs';

test('legacy runtime exports the behavior required by the modular migration', () => {
  const utils = loadLegacyCoreUtils();
  for (const name of [
    'appendNotificationEvent',
    'buildGithubUpdateRequest',
    'buildBomTreeRows',
    'createPdmNavigation',
    'describePayloadChanges',
    'findBomAssets',
    'normalizePayload',
    'resolveBomRows',
    'syncLegacyBomFromMaterialDb',
  ]) {
    assert.equal(typeof utils[name], 'function', `${name} must remain available`);
  }
});

test('current data baseline remains clean enough to normalize', () => {
  const utils = loadLegacyCoreUtils();
  const payload = utils.normalizePayload(loadDataPayload());
  assert.equal(Object.keys(payload.bom).length, 22);
  assert.equal(Object.keys(payload.materialDb.materials).length, 643);
  assert.equal(payload.materialDb.bomEntries.length, 2725);
});

test('current Viewer is standalone and current Admin uses the shared runtime chain', () => {
  const viewer = fs.readFileSync(path.join(repoRoot, 'viewer.html'), 'utf8');
  const admin = fs.readFileSync(path.join(repoRoot, 'admin.html'), 'utf8');
  assert.doesNotMatch(viewer, /<script src="(?:data|app-core|app-viewer)\.js/);
  assert.match(viewer, /mode:\s*['"]viewer['"]/);
  assert.match(admin, /app-core\.js\?v=/);
  assert.match(admin, /app-admin\.js\?v=/);
});
```

- [ ] **Step 5: Copy the two required acceptance suites into the repository**

Create `tests/legacy-ui-contract.test.mjs` from the complete contents of outer `work/material-master-editor.test.mjs`. Change only its source path:

```js
const rootDir = path.resolve(import.meta.dirname, '..');
const appCore = fs.readFileSync(path.join(rootDir, 'app-core.js'), 'utf8');
```

Create `tests/runtime-contract.test.mjs` from the complete contents of outer `work/restructure.test.mjs`. Change only its output directory:

```js
const rootDir = path.resolve(import.meta.dirname, '..');
const outputDir = rootDir;
```

Do not remove or rename any of the original 16 and 13 test cases.

- [ ] **Step 6: Run baseline tests and the current data audit**

Run:

```powershell
npm test
node ..\..\audit_data_integrity.mjs
```

Expected: 32 repository tests pass (3 baseline + 16 UI contracts + 13 runtime contracts); audit reports 643/2725/22 and 0 errors/0 warnings.

- [ ] **Step 7: Commit the baseline harness**

```powershell
git add .gitignore package.json package-lock.json tests
git commit -m "test: add modularization baseline"
```

---

### Task 2: Add the Deterministic Build Without Changing Behavior

**Files:**

- Create: `src/shell.html`
- Create: `src/styles/app.css`
- Create: `src/legacy-core.js`
- Create: `src/admin-entry.js`
- Create: `src/viewer-entry.js`
- Create: `scripts/build.mjs`
- Create: `scripts/check-generated.mjs`
- Create: `tests/build.test.mjs`
- Modify: `package.json`
- Generate: `admin.html`, `app-admin.js`, `styles.css`, `viewer.html`

**Interfaces:**

- Consumes: `src/shell.html`, `src/styles/app.css`, and the two entry modules.
- Produces: `npm run build`, `npm run check:generated`, deterministic Admin artifacts, and one inline Viewer HTML.

- [ ] **Step 1: Create behavior-identical source copies**

Copy `styles.css` byte-for-byte to `src/styles/app.css` and copy `app-core.js` byte-for-byte to `src/legacy-core.js`. Verify before any wrapper edit:

```powershell
(Get-FileHash styles.css -Algorithm SHA256).Hash -eq (Get-FileHash src\styles\app.css -Algorithm SHA256).Hash
(Get-FileHash app-core.js -Algorithm SHA256).Hash -eq (Get-FileHash src\legacy-core.js -Algorithm SHA256).Hash
```

Expected: both expressions print `True`.

- [ ] **Step 2: Create explicit Admin and Viewer entry modules**

Create `src/admin-entry.js`:

```js
import './legacy-core.js';

globalThis.BomApp.start({
  mode: 'admin',
  config: globalThis.BOM_REPO_CONFIG,
});
```

Create `src/viewer-entry.js`:

```js
import './legacy-core.js';

globalThis.BomApp.start({
  mode: 'viewer',
  config: globalThis.BOM_REPO_CONFIG,
});
```

- [ ] **Step 3: Convert the current Admin shell into one tokenized source shell**

Copy `admin.html` to `src/shell.html`, then make these exact substitutions:

```text
<title>BOM Admin</title>                                  -> <title>{{TITLE}}</title>
<link rel="stylesheet" href="styles.css?v=20">          -> {{STYLE_TAG}}
<span class="mode-badge" id="modeBadge">Admin</span>    -> <span class="mode-badge" id="modeBadge">{{MODE_LABEL}}</span>
<section class="sync-panel admin" id="syncPanel">       -> <section class="sync-panel {{SYNC_CLASS}}" id="syncPanel">
<div class="admin-config" id="adminControls">           -> <div class="admin-config" id="adminControls"{{ADMIN_HIDDEN}}>
<script src="data.js?v=22"></script>                     -> {{DATA_SCRIPT}}
<script src="app-core.js?v=26"></script>                 -> remove
<script src="app-admin.js?v=21"></script>                -> {{APP_SCRIPT}}
```

Add this deterministic diagnostic marker inside `<head>`:

```html
<meta name="pdm-build" content="{{BUILD_ID}}">
```

Retain the GitHub configuration, Google Fonts, `@google/model-viewer`, and SheetJS URLs unchanged.

- [ ] **Step 4: Implement the build script**

Create `scripts/build.mjs` with this interface and behavior:

```js
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, transform } from 'esbuild';

const repoRoot = path.resolve(import.meta.dirname, '..');

function outputDirectory(argv) {
  const index = argv.indexOf('--outdir');
  return index >= 0 ? path.resolve(argv[index + 1]) : repoRoot;
}

async function bundle(entryPoint) {
  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: [entryPoint],
    bundle: true,
    charset: 'utf8',
    format: 'iife',
    legalComments: 'none',
    minify: true,
    platform: 'browser',
    target: ['es2020'],
    write: false,
  });
  return result.outputFiles[0].text.trim();
}

function replaceTokens(template, values) {
  const result = Object.entries(values).reduce(
    (html, [name, value]) => html.replaceAll(`{{${name}}}`, value),
    template,
  );
  const unresolved = result.match(/\{\{[A-Z_]+\}\}/g);
  if (unresolved) throw new Error(`Unresolved shell tokens: ${unresolved.join(', ')}`);
  return result;
}

async function writeAtomic(outDir, name, content) {
  const tempDir = path.join(outDir, '.build-tmp');
  await mkdir(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `${name}.tmp`);
  const finalPath = path.join(outDir, name);
  await writeFile(tempPath, content, 'utf8');
  await rm(finalPath, { force: true });
  await rename(tempPath, finalPath);
}

export async function generateArtifacts(outDir = repoRoot) {
  const [shell, cssSource, adminBundle, viewerBundle] = await Promise.all([
    readFile(path.join(repoRoot, 'src', 'shell.html'), 'utf8'),
    readFile(path.join(repoRoot, 'src', 'styles', 'app.css'), 'utf8'),
    bundle('src/admin-entry.js'),
    bundle('src/viewer-entry.js'),
  ]);
  const css = (await transform(cssSource, { loader: 'css', minify: true })).code.trim();
  const buildId = createHash('sha256')
    .update(shell)
    .update(css)
    .update(adminBundle)
    .update(viewerBundle)
    .digest('hex')
    .slice(0, 12);

  const shared = { BUILD_ID: buildId };
  const adminHtml = replaceTokens(shell, {
    ...shared,
    TITLE: 'BOM Admin',
    MODE_LABEL: 'Admin',
    SYNC_CLASS: 'admin',
    ADMIN_HIDDEN: '',
    STYLE_TAG: `<link rel="stylesheet" href="styles.css?v=${buildId}">`,
    DATA_SCRIPT: `<script src="data.js?v=22"></script>`,
    APP_SCRIPT: `<script src="app-admin.js?v=${buildId}"></script>`,
  });
  const viewerHtml = replaceTokens(shell, {
    ...shared,
    TITLE: 'BOM Viewer',
    MODE_LABEL: 'Viewer',
    SYNC_CLASS: 'viewer',
    ADMIN_HIDDEN: ' hidden',
    STYLE_TAG: `<style>\n${css}\n</style>`,
    DATA_SCRIPT: '<!-- data.js loaded from GitHub via loadCloud() -->',
    APP_SCRIPT: `<script>\n${viewerBundle.replaceAll('</script', '<\\/script')}\n</script>`,
  });

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeAtomic(outDir, 'styles.css', `${css}\n`),
    writeAtomic(outDir, 'app-admin.js', `${adminBundle}\n`),
    writeAtomic(outDir, 'admin.html', adminHtml),
    writeAtomic(outDir, 'viewer.html', viewerHtml),
  ]);
  await rm(path.join(outDir, '.build-tmp'), { recursive: true, force: true });
  return { buildId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await generateArtifacts(outputDirectory(process.argv.slice(2)));
}
```

- [ ] **Step 5: Add stale-artifact detection**

Create `scripts/check-generated.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateArtifacts } from './build.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'bom-build-'));

try {
  await generateArtifacts(tempDir);
  for (const name of ['admin.html', 'app-admin.js', 'styles.css', 'viewer.html']) {
    const [committed, generated] = await Promise.all([
      readFile(path.join(repoRoot, name), 'utf8'),
      readFile(path.join(tempDir, name), 'utf8'),
    ]);
    assert.equal(committed, generated, `${name} is stale; run npm run build`);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
```

- [ ] **Step 6: Add build scripts to `package.json`**

Replace the scripts object with:

```json
{
  "build": "node scripts/build.mjs",
  "check:generated": "node scripts/check-generated.mjs",
  "test": "node --test tests/*.test.mjs"
}
```

- [ ] **Step 7: Write artifact tests and verify they fail before the first build**

Create `tests/build.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers/load-data.mjs';

test('generated Viewer is one file with inline local code and CSS', () => {
  const viewer = fs.readFileSync(path.join(repoRoot, 'viewer.html'), 'utf8');
  assert.match(viewer, /<meta name="pdm-build" content="[a-f0-9]{12}">/);
  assert.match(viewer, /<style>[\s\S]+<\/style>/);
  assert.doesNotMatch(viewer, /<script src="(?:data|app-admin|app-core|app-viewer)\.js/);
  assert.match(viewer, /mode:\s*['"]viewer['"]/);
});

test('generated Admin loads only the complete local Admin bundle', () => {
  const admin = fs.readFileSync(path.join(repoRoot, 'admin.html'), 'utf8');
  assert.match(admin, /<script src="data\.js\?v=22"><\/script>/);
  assert.match(admin, /<script src="app-admin\.js\?v=[a-f0-9]{12}"><\/script>/);
  assert.doesNotMatch(admin, /app-core\.js|app-viewer\.js/);
});
```

Run `npm test` before the build. Expected: the two new artifact tests fail because generated artifacts do not yet contain the new marker and script structure.

- [ ] **Step 8: Update the baseline shell assertion at the build seam**

In `tests/baseline-contract.test.mjs`, replace only the two legacy Admin-chain assertions:

```js
assert.match(admin, /app-admin\.js\?v=[a-f0-9]{12}/);
assert.doesNotMatch(admin, /app-core\.js|app-viewer\.js/);
```

The Viewer standalone assertions and all behavior assertions remain unchanged.

In `tests/runtime-contract.test.mjs`, add this source-tree loader and use it for source assertions:

```js
function readSourceTree() {
  return fs.readdirSync(path.join(rootDir, 'src'), { recursive: true })
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => fs.readFileSync(path.join(rootDir, 'src', name), 'utf8'))
    .join('\n');
}
```

Make `loadCoreUtils()` evaluate `src/legacy-core.js` instead of root `app-core.js`. In the linked-asset contract, replace `readOutput('app-core.js')` with `readSourceTree()`.

Update only the generated-shell assertions to the new artifact structure:

```js
assert.match(adminHtml, /app-admin\.js\?v=[a-f0-9]{12}/);
assert.doesNotMatch(adminHtml, /app-core\.js|app-viewer\.js/);
assert.doesNotMatch(viewerHtml, /app-admin\.js/);
assert.match(viewerHtml, /<meta name="pdm-build" content="[a-f0-9]{12}">/);
assert.match(viewerHtml, /mode:\s*['"]viewer['"]/);
```

Remove the two minification-sensitive assertions for the literal strings `global.BomApp =` and `global.BomApp.start(...)`; the build test and Viewer-mode assertion cover the same runtime contract without depending on bundle variable spelling. Keep all 13 test titles.

- [ ] **Step 9: Build and verify deterministic artifacts**

Run:

```powershell
npm run build
npm test
npm run check:generated
node --check app-admin.js
```

Expected: all repository tests pass, `check:generated` exits 0, and `app-admin.js` passes syntax validation.

- [ ] **Step 10: Run repository acceptance gates and commit**

Run `npm test` again and confirm the copied 16 UI contracts and 13 runtime contracts still pass against the repository artifacts. Run `node ..\..\audit_data_integrity.mjs` to reconfirm the unchanged data baseline.

Commit:

```powershell
git add package.json src scripts tests admin.html app-admin.js styles.css viewer.html
git commit -m "build: add deterministic standalone pipeline"
```

---

### Task 3: Extract Pure Material, Relationship, and BOM Modules

**Files:**

- Create: `src/domain/materials.js`
- Create: `src/domain/relationships.js`
- Create: `src/domain/bom.js`
- Create: `src/application.js`
- Create: `scripts/audit-data.mjs`
- Create: `tests/domain.test.mjs`
- Modify: `package.json`
- Modify: `src/admin-entry.js`
- Modify: `src/viewer-entry.js`
- Remove: `src/legacy-core.js`

**Interfaces:**

- Produces from `materials.js`: `clone`, `normalizeText`, `escapeRegExp`, `localizedPair`, `localizedValue`, `createMaterialDatabase`, `normalizeMaterialDatabase`, `materialWhereUsed`, `replaceBomEntryMaterial`, `updateMaterialRecord`, `syncLegacyBomFromMaterialDb`, `filterMaterials`, `sortMaterials`, `stripProductColorName`.
- Produces from `relationships.js`: `buildBomTreeRows`, `childMaterialId`, `groupMaterialChildRows`, `hasChildMaterialRelation`, `scopeLabel`.
- Produces from `bom.js`: `resolveBomRows`, `createSidebarIndex`, `createPdmNavigation`.
- Produces from `application.js`: `BomApplication`, `createApp`, and `coreUtils`.
- Produces: `npm run audit:data`, which audits either repository `data.js` or an explicit `--data` path using the new source modules.

- [ ] **Step 1: Write direct domain tests before extraction**

Create `tests/domain.test.mjs` using direct imports that do not exist yet:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBomTreeRows } from '../src/domain/relationships.js';
import { materialWhereUsed, updateMaterialRecord } from '../src/domain/materials.js';
import { resolveBomRows } from '../src/domain/bom.js';
import { coreUtils } from '../src/application.js';
import { loadDataPayload } from './helpers/load-data.mjs';

const { normalizePayload } = coreUtils;

test('shared MaterialID edits update every resolved BOM row', () => {
  const payload = normalizePayload(loadDataPayload());
  const original = resolveBomRows(payload, 'LGS101', '\u590d\u53e4\u8272')
    .find((row) => row.mat_code === 'LGS101DB101KD');
  updateMaterialRecord(payload, original._materialId, {
    name: { zh: 'Test top panel', vi: 'Test top panel' },
  });
  const rows = resolveBomRows(payload, 'LGS111', '\u590d\u53e4\u8272');
  assert.equal(rows.find((row) => row._materialId === original._materialId).name_zh, 'Test top panel');
});

test('BOM tree expands recursive material parents', () => {
  const payload = {
    materialDb: {
      materials: {
        parent: { id: 'parent', code: 'PARENT', name: { zh: 'Parent' } },
        child: { id: 'child', code: 'CHILD', name: { zh: 'Child' } },
        leaf: { id: 'leaf', code: 'LEAF', name: { zh: 'Leaf' } },
      },
      bomEntries: [
        { id: 'p', parentType: 'product', productCode: 'P1', color: 'black', materialId: 'parent', order: 1 },
        { id: 'c', parentType: 'material', parentId: 'parent', productCode: 'P1', color: 'black', materialId: 'child', childMaterialId: 'child', order: 1 },
        { id: 'l', parentType: 'material', parentId: 'child', productCode: 'P1', color: 'black', materialId: 'leaf', childMaterialId: 'leaf', order: 1 },
      ],
    },
  };
  assert.deepEqual(buildBomTreeRows(payload, 'P1', 'black').map((row) => row._level), [1, 2, 3]);
});

test('where-used remains a pure domain query', () => {
  const payload = normalizePayload(loadDataPayload());
  const material = Object.values(payload.materialDb.materials).find((item) => item.code === 'LGS101WJBBH');
  const result = materialWhereUsed(payload, material.id);
  assert.ok(result.productEntries.some((entry) => entry.productCode === 'LGS101'));
  assert.ok(result.childEntries.length > 0);
});
```

Run `npm test`. Expected: module-not-found failure for the new `src/domain` modules.

- [ ] **Step 2: Move pure functions without rewriting their implementations**

Move these exact existing function implementations out of `src/legacy-core.js`; do not duplicate them:

```text
materials.js:
  clone, normalizeText, escapeRegExp, localizedPair,
  canonicalSharedName, canonicalLegacyMaterial,
  materialIdentity, materialIdFor, mergeAssets, materialRecordFromLegacy,
  isHardwarePackSummary, legacyRowFromRecord, createMaterialDatabase,
  normalizeMaterialDatabase, materialWhereUsed, localizedValue, uniqueValues,
  queryMatches, productColorNameTokens, stripProductColorName,
  replaceBomEntryMaterial, updateMaterialRecord, syncLegacyBomFromMaterialDb,
  parseQty, materialText, materialSearchMatch, sortMaterials,
  compareMaterial, directional, filterMaterials

relationships.js:
  childMaterialId, relationMatchesScope, materialChildEntries,
  productEntryCoveredByParent, buildBomTreeRows, scopeLabel,
  groupMaterialChildRows, hasChildMaterialRelation

bom.js:
  isRenderableProductEntry, resolveBomRows, productSidebarItem,
  relationProducts, materialSidebarItem, createSidebarIndex,
  createPdmNavigation
```

Use named exports only. Import dependencies explicitly between these three files; no domain file may read `window`, `document`, storage, or network state.

- [ ] **Step 3: Convert the legacy wrapper into `application.js`**

Rename `src/legacy-core.js` to `src/application.js`. Delete the opening `(function (global) {` line and the closing `}(typeof window !== 'undefined' ? window : globalThis));` line, retain `'use strict';`, add `const global = globalThis;`, and add these imports at the top:

```js
import {
  clone,
  createMaterialDatabase,
  filterMaterials,
  localizedValue,
  materialText,
  materialWhereUsed,
  normalizeMaterialDatabase,
  normalizeText,
  queryMatches,
  replaceBomEntryMaterial,
  sortMaterials,
  stripProductColorName,
  syncLegacyBomFromMaterialDb,
  updateMaterialRecord,
} from './domain/materials.js';
import { createPdmNavigation, createSidebarIndex, resolveBomRows } from './domain/bom.js';
import {
  buildBomTreeRows,
  childMaterialId,
  groupMaterialChildRows,
  hasChildMaterialRelation,
  scopeLabel,
} from './domain/relationships.js';

const global = globalThis;
```

Every existing statement not listed for extraction remains byte-for-byte in `application.js`. Replace the two global assignments at the bottom with this complete export block:

```js
export const coreUtils = {
  appendNotificationEvent,
  buildGithubUpdateRequest,
  createPdmNavigation,
  createSidebarIndex,
  describePayloadChanges,
  createMaterialDatabase,
  findBomAssets,
  filterMaterials,
  materialWhereUsed,
  normalizePayload,
  normalizeConfig,
  parseDataJsPayload,
  rawUrl,
  buildBomTreeRows,
  groupMaterialChildRows,
  hasChildMaterialRelation,
  replaceBomEntryMaterial,
  resolveBomRows,
  syncLegacyBomFromMaterialDb,
  updateMaterialRecord,
  serializeDataJs,
  stripProductColorName,
};

global.BomApp = { createApp, start: createApp };
global.BomCoreUtils = coreUtils;

export { BomApplication, createApp };
```

- [ ] **Step 4: Update entry modules to import the explicit interface**

Use this pattern in both entries:

```js
import { createApp } from './application.js';

createApp({
  mode: 'admin', // viewer-entry.js uses 'viewer'
  config: globalThis.BOM_REPO_CONFIG,
});
```

Update `tests/runtime-contract.test.mjs` at the same seam so it tests the new source interface immediately:

```js
import { coreUtils } from '../src/application.js';

function loadCoreUtils() {
  return coreUtils;
}
```

Remove its `node:vm` import and VM context setup. Keep the source-tree and generated-artifact assertions introduced in Task 2.

- [ ] **Step 5: Port the data audit to the new source interface**

Create `scripts/audit-data.mjs` from the complete current outer `work/audit_data_integrity.mjs`. Replace its dynamic `app-core.js` loader and fixed data path with:

```js
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { coreUtils } from '../src/application.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const dataArgumentIndex = process.argv.indexOf('--data');
const dataPath = dataArgumentIndex >= 0
  ? path.resolve(process.argv[dataArgumentIndex + 1])
  : path.join(repoRoot, 'data.js');
const utils = coreUtils;
const payload = utils.parseDataJsPayload(readFileSync(dataPath, 'utf8'));
```

Replace the old imports and dynamic source loader completely with the block above. Keep all ten existing audit sections and add this exact failure behavior after computing `errors` and `warnings`:

```js
if (errors.length || warnings.length) process.exitCode = 1;
```

Add to `package.json` scripts:

```json
"audit:data": "node scripts/audit-data.mjs"
```

- [ ] **Step 6: Build and run focused plus acceptance tests**

Run:

```powershell
npm run build
npm test
npm run audit:data
npm run check:generated
node --check app-admin.js
```

Run `node --test tests\legacy-ui-contract.test.mjs` and `node --test tests\runtime-contract.test.mjs` explicitly so their counts remain visible. Expected: direct domain tests pass; Material Master 16/16; restructure 13/13; audit remains 643/2725/22 with 0/0.

- [ ] **Step 7: Confirm extraction removed duplicate implementations**

Run:

```powershell
rg -n "function (createMaterialDatabase|buildBomTreeRows|resolveBomRows|updateMaterialRecord)" src
```

Expected: each named implementation appears exactly once in its owning domain module.

- [ ] **Step 8: Commit the domain extraction**

```powershell
git add package.json src scripts tests admin.html app-admin.js viewer.html
git commit -m "refactor: extract bom domain modules"
```

---

### Task 4: Extract Asset and Notification Modules

**Files:**

- Create: `src/infrastructure/assets.js`
- Create: `src/features/notifications.js`
- Create: `tests/assets-notifications.test.mjs`
- Modify: `src/application.js`

**Interfaces:**

- `assets.js` produces `findBomAssets(assetMap, material)`, `driveFileId(url)`, `assetDisplayUrl(asset, locationLike)`, and `pdfFrameUrl(url)`.
- `notifications.js` produces `normalizeNotifications(notifications)`, `describePayloadChanges(previousPayload, nextPayload)`, and `appendNotificationEvent(payload, event)`.

- [ ] **Step 1: Write failing direct tests**

Create `tests/assets-notifications.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { assetDisplayUrl, driveFileId, findBomAssets, pdfFrameUrl } from '../src/infrastructure/assets.js';
import { appendNotificationEvent, describePayloadChanges } from '../src/features/notifications.js';
import { coreUtils } from '../src/application.js';

const { normalizePayload } = coreUtils;

test('asset matching remains color-neutral and Drive-aware', () => {
  const assets = findBomAssets({ 'abc123bh|panel': [{ name: 'panel.pdf' }] }, {
    mat_code: 'ABC123WH',
    name_zh: 'Panel',
  });
  assert.equal(assets[0].name, 'panel.pdf');
  assert.equal(driveFileId('https://drive.google.com/file/d/file-id/view'), 'file-id');
  assert.equal(pdfFrameUrl('https://drive.google.com/file/d/file-id/view'), 'https://drive.google.com/file/d/file-id/preview');
  assert.match(assetDisplayUrl({ driveId: 'file-id' }, { protocol: 'file:', hostname: '' }), /thumbnail\?id=file-id/);
});

test('material diffs become persistent GitHub-save notifications', () => {
  const previous = normalizePayload({
    bom: {},
    materialDb: { materials: { m1: { id: 'm1', code: 'M1', name: { zh: 'Old name' } } }, bomEntries: [] },
  });
  const next = structuredClone(previous);
  next.materialDb.materials.m1.name.zh = 'New name';
  const changes = describePayloadChanges(previous, next);
  const updated = appendNotificationEvent(next, {
    id: 'notification-1',
    type: 'github-save',
    actor: 'admin',
    createdAt: '2026-07-11T00:00:00.000Z',
    changes,
  });
  assert.deepEqual(changes.map(({ code, field }) => ({ code, field })), [{ code: 'M1', field: 'name' }]);
  assert.equal(updated.notifications[0].id, 'notification-1');
});
```

Run `npm test`. Expected: module-not-found failure.

- [ ] **Step 2: Extract the complete asset implementation**

Move these existing helpers into `assets.js`: `assetKey`, `colorNeutralCode`, `assetParts`, `materialAssetParts`, `findBomAssetEntry`, and `findBomAssets`. Import `normalizeText` from `domain/materials.js`.

Convert the three state-free class methods to these pure forms:

```js
export function driveFileId(url) {
  const value = String(url || '');
  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch) return fileMatch[1];
  const idMatch = value.match(/[?&]id=([^&#]+)/i);
  return idMatch ? decodeURIComponent(idMatch[1]) : '';
}

export function assetDisplayUrl(asset, locationLike = globalThis.location) {
  const pathUrl = asset?.path || '';
  const remoteUrl = asset?.directUrl || asset?.url || '';
  const driveId = asset?.driveId || driveFileId(remoteUrl) || driveFileId(asset?.url || '');
  if (driveId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1600`;
  const isLocalDocument = ['file:', 'http:'].includes(locationLike?.protocol)
    && ['', 'localhost', '127.0.0.1'].includes(locationLike?.hostname || '');
  return isLocalDocument && pathUrl ? pathUrl : remoteUrl || pathUrl;
}

export function pdfFrameUrl(url) {
  const value = String(url || '').trim();
  const match = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  return match ? `https://drive.google.com/file/d/${encodeURIComponent(match[1])}/preview` : value || 'about:blank';
}
```

Replace the former class-method calls with imported functions; do not keep wrappers with identical names unless a call site genuinely requires a method interface.

- [ ] **Step 3: Extract the notification implementation**

Move constants `NOTIFICATION_LIMIT`, `NOTIFICATION_CHANGE_LIMIT`, and `MATERIAL_CHANGE_FIELDS`, plus these functions: `stableId`, `normalizeNotificationChanges`, `localizedPairSummary`, `materialChangeValue`, `describePayloadChanges`, `normalizeNotifications`, and `appendNotificationEvent`.

Import `clone` and `localizedValue` from `domain/materials.js`. Inside the moved `describePayloadChanges()` implementation, replace exactly:

```js
const previous = normalizePayload(previousPayload);
const next = normalizePayload(nextPayload);
```

with:

```js
const previous = previousPayload || {};
const next = nextPayload || {};
```

In `appendNotificationEvent()`, replace `const source = normalizePayload(payload);` with `const source = clone(payload || {});`; retain every other statement in both moved implementations unchanged.

In `application.js`, preserve the public normalize-before-diff behavior without creating a circular import:

```js
import {
  appendNotificationEvent as appendNormalizedNotificationEvent,
  describePayloadChanges as describeNormalizedPayloadChanges,
  normalizeNotifications,
} from './features/notifications.js';

function describePayloadChanges(previousPayload, nextPayload) {
  return describeNormalizedPayloadChanges(
    normalizePayload(previousPayload),
    normalizePayload(nextPayload),
  );
}

function appendNotificationEvent(payload, event) {
  return appendNormalizedNotificationEvent(normalizePayload(payload), event);
}
```

`normalizePayload()` uses the imported `normalizeNotifications()`. The notification module never imports `application.js` or `github-data.js`.

- [ ] **Step 4: Build, verify, and commit**

Run repository tests, both explicit 16/16 and 13/13 contract files, generated check, syntax check, and audit. Expected results remain unchanged.

```powershell
git add src tests admin.html app-admin.js viewer.html
git commit -m "refactor: extract assets and notifications"
```

---

### Task 5: Introduce the GitHub Data Adapter Seam

**Files:**

- Create: `src/infrastructure/github-data.js`
- Create: `tests/github-data.test.mjs`
- Modify: `src/application.js`
- Modify: `src/features/notifications.js`

**Interfaces:**

- Produces pure functions: `normalizeConfig`, `rawUrl`, `contentsUrl`, `rawContentsUrl`, `encodeBase64Utf8`, `decodeBase64Utf8`, `normalizePayload`, `serializeDataJs`, `parseDataJsPayload`, `buildGithubUpdateRequest`.
- Produces adapter: `createGithubDataAdapter({ config, fetchImpl, now })` returning `{ loadPublic(), loadForWrite(token), write({ token, sha, source, message }) }`.

- [ ] **Step 1: Write adapter tests with injected fetch**

Create `tests/github-data.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGithubDataAdapter, serializeDataJs } from '../src/infrastructure/github-data.js';

const config = {
  owner: 'acme',
  repo: 'bom-data',
  branch: 'main',
  path: 'nested/data.js',
  rawUrl: 'https://raw.githubusercontent.com/acme/bom-data/main/nested/data.js',
};
const payload = { version: 2, bom: {}, materialDb: { materials: {}, bomEntries: [] } };

test('public load prefers cache-busted Contents API raw', async () => {
  const requests = [];
  const adapter = createGithubDataAdapter({
    config,
    now: () => 123,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, text: async () => serializeDataJs(payload) };
    },
  });
  await adapter.loadPublic();
  assert.match(requests[0].url, /api\.github\.com.*ref=main&t=123/);
  assert.equal(requests[0].options.headers.Accept, 'application/vnd.github.raw');
});

test('public load uses raw GitHub only after the Contents API fails', async () => {
  const requests = [];
  const adapter = createGithubDataAdapter({
    config,
    now: () => 123,
    fetchImpl: async (url) => {
      requests.push(url);
      if (requests.length === 1) return { ok: false, status: 503, statusText: 'Unavailable' };
      return { ok: true, text: async () => serializeDataJs(payload) };
    },
  });
  await adapter.loadPublic();
  assert.equal(requests.length, 2);
  assert.match(requests[0], /api\.github\.com/);
  assert.match(requests[1], /raw\.githubusercontent\.com/);
});

test('write baseline is decoded from the current remote file', async () => {
  const source = serializeDataJs(payload);
  const content = Buffer.from(source, 'utf8').toString('base64');
  const adapter = createGithubDataAdapter({
    config,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ sha: 'remote-sha', content }),
    }),
  });
  const remote = await adapter.loadForWrite('token');
  assert.equal(remote.sha, 'remote-sha');
  assert.deepEqual(remote.payload.bom, {});
});
```

Run `npm test`. Expected: import/export failure until the adapter exists.

- [ ] **Step 2: Move the pure GitHub/data functions**

Move the existing implementations for `normalizeConfig`, `apiPath`, `rawUrl`, `contentsUrl`, `rawContentsUrl`, `encodeBase64Utf8`, `decodeBase64Utf8`, `normalizePayload`, `serializeDataJs`, `parseDataJsPayload`, and `buildGithubUpdateRequest` into `github-data.js`.

Import the application-facing interface into `application.js`:

```js
import {
  buildGithubUpdateRequest,
  createGithubDataAdapter,
  normalizeConfig,
  normalizePayload,
  parseDataJsPayload,
  rawUrl,
  serializeDataJs,
} from './infrastructure/github-data.js';
```

Import `clone` and `normalizeMaterialDatabase` from `domain/materials.js`, and import `normalizeNotifications` from `features/notifications.js`. Use this complete `normalizePayload` implementation:

```js
export function normalizePayload(payload, fallbackProductImages = globalThis.BOM_VIEWER_DATA?.productImages || globalThis.PRODUCT_IMAGE_INDEX || {}) {
  const source = payload || {};
  const normalized = {
    version: source.version != null ? source.version : 2,
    updatedAt: String(source.updatedAt || ''),
    bom: clone(source.bom),
    drawings: clone(source.drawings),
    manuals: clone(source.manuals),
    models3d: clone(source.models3d),
    productImages: clone({ ...fallbackProductImages, ...(source.productImages || {}) }),
    notifications: normalizeNotifications(source.notifications),
  };
  normalized.materialDb = normalizeMaterialDatabase({ ...source, ...normalized });
  return normalized;
}
```

In `decodeBase64Utf8()`, replace references to the old IIFE variable `global` with `globalThis`. Keep `currentPayloadFromWindow()` in `application.js` and make it call the imported `normalizePayload()`.

- [ ] **Step 3: Implement the adapter around the existing request behavior**

Use this public shape:

```js
export function createGithubDataAdapter({ config, fetchImpl = globalThis.fetch, now = Date.now }) {
  const cleanConfig = normalizeConfig(config);

  return {
    async loadPublic() {
      const cacheBust = now();
      const requests = [
        rawContentsUrl(cleanConfig) && {
          url: `${rawContentsUrl(cleanConfig)}&t=${cacheBust}`,
          options: { cache: 'no-store', headers: { Accept: 'application/vnd.github.raw' } },
        },
        rawUrl(cleanConfig) && {
          url: `${rawUrl(cleanConfig)}${rawUrl(cleanConfig).includes('?') ? '&' : '?'}t=${cacheBust}`,
          options: { cache: 'no-store' },
        },
      ].filter(Boolean);
      let lastError;
      for (const request of requests) {
        try {
          const response = await fetchImpl(request.url, request.options);
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          return parseDataJsPayload(await response.text());
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('No cloud data source');
    },

    async loadForWrite(token) {
      const response = await fetchImpl(`${contentsUrl(cleanConfig)}?ref=${encodeURIComponent(cleanConfig.branch)}`, {
        headers: githubHeaders(token),
      });
      if (response.status === 404) return { sha: '', payload: null };
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      return {
        sha: data.sha || '',
        payload: data.content ? parseDataJsPayload(decodeBase64Utf8(data.content)) : null,
      };
    },

    async write({ token, sha, source, message }) {
      const request = buildGithubUpdateRequest({ config: cleanConfig, token, sha, source, message });
      const response = await fetchImpl(request.url, request.options);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    },
  };
}
```

Keep `githubHeaders(token)` private to the module and preserve `X-GitHub-Api-Version: 2022-11-28`.

- [ ] **Step 4: Inject one adapter into `BomApplication`**

Update constructor wiring:

```js
constructor(options) {
  this.mode = options.mode === 'admin' ? 'admin' : 'viewer';
  this.config = normalizeConfig(options.config);
  this.githubData = options.githubData || createGithubDataAdapter({ config: this.config });
  this.notificationToastTimer = null;
  this.state = this.initialState();
}
```

In `loadCloud()`, replace `await this.fetchCloudPayload()` with `await this.githubData.loadPublic()`. In `writeGithubData()`, replace `await this.fetchGithubFile(token)` with `await this.githubData.loadForWrite(token)`, and replace the direct PUT `fetch()` with `await this.githubData.write({ token, sha: remoteFile.sha, source, message })`. Delete the obsolete class methods `fetchCloudPayload()`, `fetchGithubFile()`, and `githubHeaders()`. Keep status display and state updates in `application.js`.

Verify `writeGithubData()` still performs this order:

```text
normalize/sync local payload
load current remote payload and SHA
describe changes against remote payload
append notification
serialize data.js
write using current SHA
update local loaded state
```

- [ ] **Step 5: Build, test, and commit**

Run all repository tests, both explicit contract files, generated check, syntax check, and audit. Expected results remain unchanged.

```powershell
git add src tests admin.html app-admin.js viewer.html
git commit -m "refactor: isolate github data access"
```

---

### Task 6: Split UI Rendering Into Focused Modules

**Files:**

- Create: `src/ui/catalog-view.js`
- Create: `src/ui/bom-view.js`
- Create: `src/ui/material-view.js`
- Create: `src/ui/structure-view.js`
- Create: `src/ui/shared-view.js`
- Create: `tests/ui-contract.test.mjs`
- Modify: `src/application.js`

**Interfaces:**

- Each UI file produces one method collection named `<viewName>Methods`.
- `application.js` installs those collections on `BomApplication.prototype` once, before `createApp()` constructs an instance.
- UI modules may read application state through `this`, but may not call `fetch`, GitHub URLs, or storage directly.

- [ ] **Step 1: Write failing ownership tests**

Create `tests/ui-contract.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { bomViewMethods } from '../src/ui/bom-view.js';
import { catalogViewMethods } from '../src/ui/catalog-view.js';
import { materialViewMethods } from '../src/ui/material-view.js';
import { structureViewMethods } from '../src/ui/structure-view.js';

test('view modules own their public render entry points', () => {
  assert.equal(typeof catalogViewMethods.renderProductCatalog, 'function');
  assert.equal(typeof bomViewMethods.renderTable, 'function');
  assert.equal(typeof bomViewMethods.renderInspector, 'function');
  assert.equal(typeof materialViewMethods.renderMaterialDatabase, 'function');
  assert.equal(typeof materialViewMethods.renderMaterialMasterEditor, 'function');
  assert.equal(typeof structureViewMethods.renderStructureView, 'function');
  assert.equal(typeof structureViewMethods.renderStructureDetail, 'function');
});

test('BOM view keeps the redundant inspector hidden', () => {
  const source = String(bomViewMethods.renderInspector);
  assert.match(source, /adminView === 'bom'/);
  assert.match(source, /panel\.classList\.toggle\('visible', false\)/);
  assert.match(source, /panel\.innerHTML = ''/);
  assert.doesNotMatch(source, /bomInspectorHtml\(\)/);
});
```

Run `npm test`. Expected: module-not-found failure.

- [ ] **Step 2: Move catalog ownership as one mechanical slice**

Move these existing methods without changing their bodies:

```text
catalog-view.js:
  renderProductList, moduleButtonHtml, filteredProductItems,
  productSelectHtml, productButtonHtml, productName, renderProductCatalog,
  productCatalogRows, productCatalogRowHtml, productDisabled, getSpuVersion,
  productColorDotHtml, colorDotClass, contentHeaderHtml, headerActionsHtml,
  productSpecCardHtml, assemblyPreviewHtml, productImagePreviewHtml,
  productPreviewImage, renderSku, metaHtml, metaItem, colorTabsHtml,
  localizedProductName, colorLabel, productInput, manualButtons,
  productModel3dButtons
```

Export them as:

```js
export const catalogViewMethods = {
  renderProductList,
  moduleButtonHtml,
  filteredProductItems,
  productSelectHtml,
  productButtonHtml,
  productName,
  renderProductCatalog,
  productCatalogRows,
  productCatalogRowHtml,
  productDisabled,
  getSpuVersion,
  productColorDotHtml,
  colorDotClass,
  contentHeaderHtml,
  headerActionsHtml,
  productSpecCardHtml,
  assemblyPreviewHtml,
  productImagePreviewHtml,
  productPreviewImage,
  renderSku,
  metaHtml,
  metaItem,
  colorTabsHtml,
  localizedProductName,
  colorLabel,
  productInput,
  manualButtons,
  productModel3dButtons,
};
```

Define each named function in the same module with the original method body and a `function name(...)` declaration. This preserves readable stack traces and avoids anonymous mixin entries.

- [ ] **Step 3: Move material and structure ownership**

Move exact implementations into named functions and export collections:

```text
material-view.js:
  renderMaterialDatabase, materialDbFilterBar, materialDbToolbar,
  materialDbActionsHtml, filteredMaterialRecords, materialDbRowHtml,
  renderMaterialMasterEditor, materialMasterFormHtml,
  materialMasterReadonly, materialMasterCodeInput, materialMasterInput,
  materialMasterRelationshipsHtml, materialMasterProductUsage,
  materialMasterRelationList, materialMasterRelationRow,
  materialMasterAssetsHtml, materialMasterAssetList

structure-view.js:
  renderStructureView, parentStructureRows, parentStructureRowHtml,
  renderStructureDetail, structureToolbar, structureActionsHtml,
  renderAssetsView, assetRows, assetRowHtml
```

Editing commands such as `saveMaterialMaster`, `deleteDatabaseMaterial`, `saveStructureDraft`, and `deleteParentStructure` remain in `application.js` because they mutate application state; rendering stays in UI modules.

- [ ] **Step 4: Move BOM and shared rendering ownership**

Move exact implementations:

```text
bom-view.js:
  renderInspector, bomInspectorHtml, productInspectorHtml,
  materialInspectorHtml, emptyInspectorHtml, inspectorField,
  replaceControlHtml, materialOptionsHtml, materialAssetsSummaryHtml,
  renderTable, filteredRows, attrOrder, emptyTableHtml, tableHtml,
  tableColgroupHtml, bomActionsHtml, toolbarHtml, adminActionsHtml,
  tableHeadHtml, rowHtml, partNumberCellHtml,
  componentNumberCellHtml, materialStackCellHtml, cellHtml,
  renderAttrBadge, renderColorDot, editInput, highlight,
  drawingCellHtml, model3dCellHtml, assetDeleteButton,
  deleteAssetLabel, drawingsFor, models3dFor, productModels3d,
  drawingKey, sortIcon

shared-view.js:
  escapeHTML,
  renderStaticText, renderStatus, renderStats, renderNotifications,
  renderFilterBar, clearContentTable, renderEmpty, genericToolbar,
  showModal, showModel3dModal, ensureModelViewer, closeModal,
  openPdmPrompt, openPdmConfirm, openMaterialSelector
```

Keep event binding, navigation decisions, async I/O, state mutation, and export commands in `application.js`.

Export `escapeHTML` as a named function from `shared-view.js`. Add these exact dependency imports so moved functions do not depend on former file scope:

```text
catalog-view.js:
  escapeHTML from shared-view.js
  normalizeText, queryMatches, stripProductColorName from domain/materials.js
  assetDisplayUrl, driveFileId from infrastructure/assets.js

material-view.js:
  escapeHTML from shared-view.js
  localizedValue, materialWhereUsed, normalizeText, queryMatches from domain/materials.js
  childMaterialId from domain/relationships.js

structure-view.js:
  escapeHTML from shared-view.js
  localizedValue, materialWhereUsed, normalizeText, queryMatches from domain/materials.js
  childMaterialId, groupMaterialChildRows, scopeLabel from domain/relationships.js

bom-view.js:
  escapeHTML from shared-view.js
  filterMaterials, localizedValue, materialText, materialWhereUsed, sortMaterials from domain/materials.js
  assetDisplayUrl, driveFileId, findBomAssets from infrastructure/assets.js

shared-view.js:
  localizedValue from domain/materials.js
  pdfFrameUrl from infrastructure/assets.js
```

Remove the former `escapeHTML` implementation from `application.js`. No UI module may rely on an undeclared identifier from the old monolith.

- [ ] **Step 5: Install UI method collections through one explicit seam**

Add to `application.js` after the class declaration and before `createApp()` can be called:

```js
Object.assign(
  BomApplication.prototype,
  sharedViewMethods,
  catalogViewMethods,
  bomViewMethods,
  materialViewMethods,
  structureViewMethods,
);
```

Import each method collection at the top. If two collections define the same method, treat it as an error and move ownership to exactly one file.

- [ ] **Step 6: Verify UI modules contain no network or storage access**

Run:

```powershell
rg -n "fetch\(|api\.github\.com|raw\.githubusercontent\.com|localStorage|sessionStorage" src\ui
```

Expected: no matches.

- [ ] **Step 7: Build, run all gates, and commit**

Expected: repository tests pass, generated check exits 0, Material Master 16/16, restructure 13/13, audit 0/0, and the BOM inspector contract remains green.

```powershell
git add src tests admin.html app-admin.js viewer.html
git commit -m "refactor: split pdm view modules"
```

---

### Task 7: Make Verification Self-Contained and Retire Legacy Artifacts

**Files:**

- Create: `scripts/check-all.mjs`
- Modify: `scripts/audit-data.mjs`
- Modify: `package.json`
- Modify: `tests/baseline-contract.test.mjs`
- Modify: `tests/helpers/load-data.mjs`
- Modify: `tests/ui-contract.test.mjs`
- Remove: `tests/legacy-ui-contract.test.mjs`
- Remove: `app-core.js`
- Remove: `app-viewer.js`

**Interfaces:**

- Produces: `npm run audit:data` and `npm run check` as complete repository gates.
- Removes all runtime dependence on `app-core.js` and `app-viewer.js`.

- [ ] **Step 1: Point the data audit at direct module imports**

Replace the temporary `coreUtils` import in `scripts/audit-data.mjs` with direct imports:

```js
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveBomRows } from '../src/domain/bom.js';
import { parseDataJsPayload } from '../src/infrastructure/github-data.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const dataArgumentIndex = process.argv.indexOf('--data');
const dataPath = dataArgumentIndex >= 0
  ? path.resolve(process.argv[dataArgumentIndex + 1])
  : path.join(repoRoot, 'data.js');
const payload = parseDataJsPayload(readFileSync(dataPath, 'utf8'));
```

Replace each `utils.resolveBomRows(...)` call with `resolveBomRows(...)`. Keep all duplicate-code, orphan-reference, empty-field, cycle, notification, product, and summary checks.

- [ ] **Step 2: Replace legacy baseline assertions with source-module assertions**

Update `tests/baseline-contract.test.mjs` to import `coreUtils` from `src/application.js` and remove `loadLegacyCoreUtils()`. Keep the same required exported names and data counts.

Remove `loadLegacyCoreUtils()`, the `node:vm` import, and its unused legacy-runtime setup from `tests/helpers/load-data.mjs`. Keep `repoRoot` and `loadDataPayload(filePath)` unchanged.

- [ ] **Step 3: Move all 16 UI contracts off the removed monolith**

In `tests/ui-contract.test.mjs`, replace the two temporary Task 6 tests with all 16 test blocks from `tests/legacy-ui-contract.test.mjs`. Fold the direct module-ownership checks into the matching original render tests so the final file still contains exactly 16 contracts. Load the source with:

```js
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './helpers/load-data.mjs';

const sourceFiles = [
  'src/application.js',
  'src/ui/shared-view.js',
  'src/ui/catalog-view.js',
  'src/ui/bom-view.js',
  'src/ui/material-view.js',
  'src/ui/structure-view.js',
];
const appSource = sourceFiles
  .map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8'))
  .join('\n');

function methodSource(name) {
  const functionMatch = appSource.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  const classMethodMatch = appSource.match(new RegExp(`\\n\\s{4}${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\s{4}\\}`));
  const match = functionMatch || classMethodMatch;
  assert.ok(match, `expected ${name} function`);
  return match[0];
}
```

Keep every original test title and assertion. Change only the source variable from `appCore` to `appSource` and the `methodSource()` extractor shown above. Delete `tests/legacy-ui-contract.test.mjs` only after all 16 migrated contracts pass.

- [ ] **Step 4: Confirm the 13 runtime contracts remain source-backed**

Confirm `tests/runtime-contract.test.mjs` still imports `coreUtils` from `src/application.js`, contains no `node:vm` import, and keeps all 13 test titles and assertions. Tests that inspect HTML continue to read generated repository-root `admin.html` and `viewer.html`.

- [ ] **Step 5: Add a cross-platform complete check**

Create `scripts/check-all.mjs`:

```js
import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const checks = [
  [npmCommand, ['run', 'test']],
  [npmCommand, ['run', 'audit:data']],
  [npmCommand, ['run', 'check:generated']],
  [process.execPath, ['--check', 'app-admin.js']],
];

for (const [command, args] of checks) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
```

- [ ] **Step 6: Add complete package commands**

Use:

```json
{
  "build": "node scripts/build.mjs",
  "test": "node --test tests/*.test.mjs",
  "audit:data": "node scripts/audit-data.mjs",
  "check:generated": "node scripts/check-generated.mjs",
  "check": "node scripts/check-all.mjs"
}
```

- [ ] **Step 7: Prove legacy artifacts are unused before removing them**

Run:

```powershell
rg -n "app-core\.js|app-viewer\.js" admin.html viewer.html src scripts tests
```

Expected: only negative assertions or migration documentation match; no runtime reference matches.

- [ ] **Step 8: Remove legacy files and rebuild**

Remove `app-core.js` and `app-viewer.js`, then run:

```powershell
npm run build
npm test
npm run audit:data
npm run check:generated
node --check app-admin.js
```

Expected: all commands pass without the legacy files.

- [ ] **Step 9: Commit self-contained verification and cleanup**

```powershell
git add package.json scripts tests admin.html app-admin.js styles.css viewer.html
git rm app-core.js app-viewer.js
git commit -m "refactor: retire legacy runtime artifacts"
```

---

### Task 8: Update Workflow Documentation, Preserve Compatibility Commands, Mirror Outputs, and Perform Final Verification

**Files:**

- Modify: `PROJECT_CONTEXT.md`
- Modify: `HANDOVER.md`
- Modify: `REVIEW_CONTEXT.md`
- Modify: `README_SYNC.md`
- Modify outside clone: outer `work/build_standalone_viewer.mjs`
- Modify outside clone: outer `work/material-master-editor.test.mjs`
- Modify outside clone: outer `work/restructure.test.mjs`
- Modify outside clone: outer `work/audit_data_integrity.mjs`
- Mirror: outer `outputs/admin.html`, `outputs/app-admin.js`, `outputs/styles.css`, `outputs/viewer.html`
- Mirror: outer `outputs/PROJECT_CONTEXT.md`, `outputs/HANDOVER.md`, `outputs/REVIEW_CONTEXT.md`, `outputs/README_SYNC.md`
- Remove from outer runtime mirror: `outputs/app-core.js`, `outputs/app-viewer.js`

**Interfaces:**

- Produces: one documented canonical workflow and a verified local runtime mirror.
- Preserves: outer `outputs/data.js` and clone `data.js` unchanged.

- [ ] **Step 1: Update all workflow documents**

Document these exact operational rules:

```text
Canonical editable source: work/remote-bom-viewer-sync/bom-viewer-sync/src/
Build command: npm run build
Complete local gate: npm run check
Generated files: admin.html, app-admin.js, styles.css, viewer.html
Never edit generated files directly.
Viewer program changes require rebuilding and redistributing viewer.html.
GitHub/Drive data changes continue to appear when Viewer reloads.
Outer outputs/ is a verified runtime mirror, not the editable source tree.
Do not copy data.js for code-only changes.
```

Update cache/version references to the generated 12-character build ID and remove stale fixed references such as `app-core.js?v=25` or `v=26`.

- [ ] **Step 2: Replace duplicated outer-workspace tools with thin compatibility wrappers**

Replace outer `work/build_standalone_viewer.mjs` with:

```js
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '..');
const buildScript = path.join(
  workspaceRoot,
  'work',
  'remote-bom-viewer-sync',
  'bom-viewer-sync',
  'scripts',
  'build.mjs',
);
const outputDir = path.join(workspaceRoot, 'outputs');
const result = spawnSync(process.execPath, [buildScript, '--outdir', outputDir], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
```

Replace outer `work/material-master-editor.test.mjs` with this one-line canonical test import:

```js
import './remote-bom-viewer-sync/bom-viewer-sync/tests/ui-contract.test.mjs';
```

Replace outer `work/restructure.test.mjs` with:

```js
import './remote-bom-viewer-sync/bom-viewer-sync/tests/runtime-contract.test.mjs';
```

Replace outer `work/audit_data_integrity.mjs` with:

```js
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '..');
const auditScript = path.join(
  workspaceRoot,
  'work',
  'remote-bom-viewer-sync',
  'bom-viewer-sync',
  'scripts',
  'audit-data.mjs',
);
const dataPath = path.join(workspaceRoot, 'outputs', 'data.js');
const result = spawnSync(process.execPath, [auditScript, '--data', dataPath], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
```

These wrappers preserve familiar commands without maintaining duplicate implementation or test logic outside the Git clone.

- [ ] **Step 3: Run the complete clone gate**

```powershell
npm run build
npm run check
node --check app-admin.js
git diff --check
```

Expected: all commands exit 0 and the build produces only the intentional artifact diff.

- [ ] **Step 4: Mirror code-only generated artifacts to outer `outputs/`**

Copy exactly these files from the clone to the outer `outputs/` directory:

```text
admin.html
app-admin.js
styles.css
viewer.html
PROJECT_CONTEXT.md
HANDOVER.md
REVIEW_CONTEXT.md
README_SYNC.md
```

Do not copy `data.js`. Do not copy `node_modules` or temporary build output.

- [ ] **Step 5: Remove obsolete files from the runtime mirror**

After resolving and confirming both targets are inside `C:\Users\HP\Documents\Codex\2026-06-30\ew-html-and-add-real-time\outputs`, remove only:

```text
outputs/app-core.js
outputs/app-viewer.js
```

Do not remove backups or `data.js`.

- [ ] **Step 6: Run compatibility gates against the mirror**

From the outer workspace run the preserved compatibility commands:

```powershell
node work\build_standalone_viewer.mjs
node work\material-master-editor.test.mjs
node work\restructure.test.mjs
node work\audit_data_integrity.mjs
node --check outputs\app-admin.js
```

Expected: Material Master 16/16; restructure 13/13; audit 643/2725/22 and 0/0.

- [ ] **Step 7: Verify mirror hashes and secret hygiene**

For each mirrored file, compare SHA-256 between clone and `outputs/`. Expected: every pair matches.

Run:

```powershell
rg -n "github_pat_|ghp_|Authorization:\s*Bearer\s+[A-Za-z0-9]" admin.html app-admin.js viewer.html
rg -n "C:\\Users\\HP|sourceMappingURL=data:" admin.html app-admin.js viewer.html
```

Expected: no token, local absolute path, or inline source map matches.

- [ ] **Step 8: Browser smoke-test Viewer and Admin separately**

Viewer checks:

```text
Open viewer.html through file:///
Confirm GitHub Contents API data load succeeds
Open BOM, Material Database, parent-child structure, notifications, drawings, and one GLB model
Click a plain BOM row and confirm #inspectorPanel stays hidden and empty
```

Admin checks:

```text
Open admin.html
Confirm data load succeeds without exposing a token
Confirm row actions, Material Master, and structure editing still render
Do not perform a save during this code-only smoke test
```

- [ ] **Step 9: Commit documentation and synchronized workflow**

```powershell
git add PROJECT_CONTEXT.md HANDOVER.md REVIEW_CONTEXT.md README_SYNC.md
git commit -m "docs: document modular build workflow"
```

- [ ] **Step 10: Final review without pushing**

Run:

```powershell
git status --short --branch
git log --oneline --decorate -8
git diff origin/main...HEAD --check
```

Expected: clone is clean and ahead of `origin/main`; report commits, generated artifact size, tests, audit, browser result, and the known non-gating `material-db.test.mjs` baseline. Do not push until the user asks.
