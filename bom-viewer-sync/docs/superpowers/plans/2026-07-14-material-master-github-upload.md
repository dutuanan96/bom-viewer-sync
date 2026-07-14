# Material Master GitHub Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Admin users stage PDF, GLB, and portable GLTF files from Material Master, then upload them to the satellite GitHub repository only when Save to GitHub succeeds.

**Architecture:** A pure feature module validates user-selected files and replaces only asset records carrying a deterministic pending ID. `BomApplication` owns in-memory bytes and resolved retry metadata, while the existing GitHub Contents asset adapter owns binary transport. Material Master renders per-row Upload controls; Save Material commits only the draft and Save to GitHub uploads referenced pending assets into a cloned outgoing payload.

**Tech Stack:** Browser ES modules, Node.js built-in test runner, GitHub Contents API adapter, jsDelivr, existing build pipeline, Playwright browser smoke.

## Global Constraints

- Work only on `codex/material-asset-upload`, created from current `origin/main`.
- Source changes stay under `src/`; generated artifacts are produced only by `npm run build`.
- Code, variables, and comments use English. PDM UI uses zh-CN/vi dictionary keys.
- Do not modify, copy, or overwrite `data.js`.
- Viewer remains one standalone read-only HTML file.
- Selecting or deleting a file never mutates the stored material before Save Material.
- Save Material remains local and performs no upload.
- Save to GitHub reads the current remote payload/SHA immediately before the BOM PUT.
- Preserve all existing 2D/3D metadata. For 3D, update `previewUrl` only in the resolved outgoing clone.
- Upload only to public satellite repository `dutuanan96/bom-viewer-assets`.
- File limit is exactly 20,000,000 bytes.
- Do not publish to `outputs/` or Desktop and do not merge the Phase B PR without user approval.

---

### Task 1: Validate selected files and resolve targeted pending records

**Files:**
- Create: `src/features/material-asset-upload.js`
- Create: `tests/material-asset-upload.test.mjs`

**Interfaces:**
- Produces: `MaterialAssetUploadError`, `validateMaterialAssetFile({ file, typeKey })`, and `resolvePendingMaterialAssets({ payload, pendingAssets, upload })`.
- `validateMaterialAssetFile` returns `{ bytes, kind, contentType, originalName }`.
- `resolvePendingMaterialAssets` returns `{ payload, completedPendingIds }` and stores successful upload metadata in `pending.resolved` for retry.

- [x] **Step 1: Write failing validation tests**

Add tests that construct browser-like file objects with `name`, `type`, `size`, and `arrayBuffer()` and assert:

```js
const pdf = fakeFile('drawing.pdf', 'application/pdf', '%PDF-1.4\n');
const validated = await validateMaterialAssetFile({ file: pdf, typeKey: 'drawings' });
assert.equal(validated.kind, 'pdf');
assert.equal(validated.contentType, 'application/pdf');

await assert.rejects(
  validateMaterialAssetFile({
    file: fakeFile('fake.pdf', 'application/pdf', 'not-pdf'),
    typeKey: 'drawings',
  }),
  (error) => error.code === 'INVALID_PDF_FILE',
);
```

Cover valid PDF, PDF MIME/signature mismatch, valid GLB `glTF` magic, invalid GLB, portable GLTF with `data:`/HTTPS URIs, relative GLTF URI rejection, empty files, and both sides of the 20,000,000-byte boundary.

- [x] **Step 2: Run validation tests and verify RED**

Run:

```powershell
node --test tests/material-asset-upload.test.mjs
```

Expected: FAIL because `src/features/material-asset-upload.js` does not exist.

- [x] **Step 3: Implement minimal file validation**

Create the feature module with these exact error codes and transport metadata:

```js
export class MaterialAssetUploadError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MaterialAssetUploadError';
    this.code = code;
  }
}

export async function validateMaterialAssetFile({ file, typeKey }) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new MaterialAssetUploadError('INVALID_ASSET_FILE');
  }
  if (file.size > 20_000_000) {
    throw new MaterialAssetUploadError('ASSET_FILE_TOO_LARGE');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.byteLength) throw new MaterialAssetUploadError('INVALID_ASSET_FILE');
  if (bytes.byteLength > 20_000_000) {
    throw new MaterialAssetUploadError('ASSET_FILE_TOO_LARGE');
  }
  // Validate PDF extension, MIME and %PDF- signature.
  // Validate GLB extension and glTF magic.
  // Parse GLTF JSON and reject non-data, non-HTTPS buffer/image URIs.
  return { bytes, kind, contentType, originalName: file.name };
}
```

The comments above identify the three explicit branches; implement each branch directly without accepting other extensions or media types.

- [x] **Step 4: Add failing targeted-resolution tests**

Use a payload with two materials and hidden metadata:

```js
const pendingAssets = {
  'assets/models/M1_hash_model.glb': {
    path: 'assets/models/M1_hash_model.glb',
    contentType: 'model/gltf-binary',
    contentHash: 'a'.repeat(64),
    bytes: new Uint8Array([1, 2, 3]),
  },
};
const result = await resolvePendingMaterialAssets({
  payload,
  pendingAssets,
  upload: async () => ({ url: pinnedUrl }),
});
assert.equal(result.payload.materialDb.materials.m1.models3d[0].url, pinnedUrl);
assert.equal(result.payload.materialDb.materials.m1.models3d[0].previewUrl, pinnedUrl);
assert.equal(result.payload.materialDb.materials.m1.models3d[0].sourceUrl, 'preserved');
assert.equal(result.payload.materialDb.materials.m2.models3d[0].url, 'https://unchanged/model.glb');
assert.equal('pendingAssetId' in result.payload.materialDb.materials.m1.models3d[0], false);
assert.equal(payload.materialDb.materials.m1.models3d[0].pendingAssetId, pendingId);
```

Also assert missing pending metadata throws `PENDING_ASSET_MISSING`, and a second call reuses `pending.resolved` without invoking `upload` again.

- [x] **Step 5: Run resolution tests and verify RED**

Run the focused test again. Expected: file validation tests pass and resolution tests fail because `resolvePendingMaterialAssets` is missing.

- [x] **Step 6: Implement targeted clone resolution**

Implement only known Material Master arrays:

```js
export async function resolvePendingMaterialAssets({ payload, pendingAssets, upload }) {
  const nextPayload = clone(payload);
  const completedPendingIds = new Set();
  for (const material of Object.values(nextPayload.materialDb?.materials || {})) {
    for (const typeKey of ['drawings', 'models3d']) {
      for (const asset of material[typeKey] || []) {
        const pendingId = asset.pendingAssetId;
        if (!pendingId) continue;
        const pending = pendingAssets[pendingId];
        if (!pending) throw new MaterialAssetUploadError('PENDING_ASSET_MISSING');
        const resolved = pending.resolved || await upload(pending);
        pending.resolved = resolved;
        asset.url = resolved.url;
        if (typeKey === 'models3d') asset.previewUrl = resolved.url;
        delete asset.pendingAssetId;
        completedPendingIds.add(pendingId);
      }
    }
  }
  return { payload: nextPayload, completedPendingIds: Array.from(completedPendingIds) };
}
```

Do not stringify the payload and do not run global replacement.

- [x] **Step 7: Verify GREEN and commit**

Run:

```powershell
node --test tests/material-asset-upload.test.mjs
npm test
git add src/features/material-asset-upload.js tests/material-asset-upload.test.mjs
git commit -m "feat: validate pending material assets"
```

Expected: focused and full unit tests pass.

---

### Task 2: Stage file bytes without crossing the Material Draft boundary

**Files:**
- Modify: `src/application.js`
- Modify: `tests/material-assets.test.mjs`

**Interfaces:**
- Consumes: Task 1 validation plus Phase A `buildAssetPath()` and `sha256Hex()`.
- Produces: `state.pendingMaterialAssets`, `handleMaterialAssetFileInput(input)`, `openMaterialAssetFilePicker(button)`, and `prunePendingMaterialAssets()`.

- [x] **Step 1: Write failing draft-isolation tests**

Add tests that inject a browser-like PDF, call `handleMaterialAssetFileInput`, and assert:

```js
assert.equal(assetStorageCalls.length, 0);
assert.equal(app.state.materialDb.materials['mat-1'].drawings.length, 0);
assert.equal(app.state.materialDraft.drawings[0].url, '');
assert.match(app.state.materialDraft.drawings[0].pendingAssetId, /^assets\/pdfs\//);
assert.equal(Object.keys(app.state.pendingMaterialAssets).length, 1);
```

Then call `saveMaterialMaster()` and assert the local material record contains the internal pending ID, still with zero upload calls. Assert Back before Save Material removes unreferenced pending bytes.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/material-assets.test.mjs
```

Expected: FAIL because the file staging methods and pending state do not exist.

- [x] **Step 3: Add adapter injection and pending state**

In `src/application.js`:

```js
import { buildAssetPath, createGithubAssetStorageAdapter, sha256Hex } from './infrastructure/github-asset-storage.js';
import { MaterialAssetUploadError, resolvePendingMaterialAssets, validateMaterialAssetFile } from './features/material-asset-upload.js';

const ASSET_STORAGE_CONFIG = {
  owner: 'dutuanan96',
  repo: 'bom-viewer-assets',
  branch: 'main',
};

this.githubAssetStorage = options.githubAssetStorage
  || (this.mode === 'admin' ? createGithubAssetStorageAdapter({ config: ASSET_STORAGE_CONFIG }) : null);
```

Add `pendingMaterialAssets: {}` beside `materialDraft` in `initialState()`.

- [x] **Step 4: Implement deterministic staging**

`handleMaterialAssetFileInput(input)` must:

1. synchronize current form fields into `materialDraft`;
2. validate the selected file;
3. compute SHA-256 and `buildAssetPath()` using the current draft material code;
4. store bytes and transport metadata under the path key;
5. spread the targeted draft asset and set only `name`, blank `url`, and `pendingAssetId`;
6. render the editor and show an i18n status key;
7. map validation error codes to i18n keys without exposing bytes or token.

`syncMaterialMasterFormToDraft()` must preserve a pending ID while URL remains blank, and remove it when the user enters a manual URL. `saveMaterialMaster()` must accept a blank URL only when the pending ID exists in `state.pendingMaterialAssets`; it must not set `previewUrl` until upload resolves.

- [x] **Step 5: Prune only unreferenced pending bytes**

Implement `prunePendingMaterialAssets()` by collecting pending IDs from `state.materialDraft` and every stored material's `drawings`/`models3d`. Call it after a draft/row is discarded. `applyPayload()` clears all pending entries because cloud data contains no valid in-memory bytes.

- [x] **Step 6: Verify GREEN and commit**

Run:

```powershell
node --test tests/material-assets.test.mjs
npm test
git add src/application.js tests/material-assets.test.mjs
git commit -m "feat: stage material asset uploads"
```

Expected: existing draft tests and new staging tests pass; no adapter upload occurs before Save to GitHub.

---

### Task 3: Resolve pending binaries atomically at Save to GitHub

**Files:**
- Modify: `src/application.js`
- Modify: `tests/github-data.test.mjs`

**Interfaces:**
- Consumes: `resolvePendingMaterialAssets()` and `this.githubAssetStorage.uploadAsset()`.
- Produces: GitHub save ordering `asset upload -> load current BOM SHA -> BOM write`, with retry metadata retained after a failed BOM write.

- [x] **Step 1: Write failing save-boundary tests**

Add application tests with injected adapters and call ordering:

```js
app.githubAssetStorage = {
  async uploadAsset(input) {
    calls.push({ type: 'uploadAsset', input });
    return { url: pinnedUrl, path: input.path, contentHash: hash, commitSha };
  },
};
app.githubData = {
  async loadForWrite() {
    calls.push({ type: 'loadForWrite' });
    return { sha: 'current-sha', payload: remotePayload };
  },
  async write(input) {
    calls.push({ type: 'write', input });
  },
};
await app.writeGithubData('token');
assert.deepEqual(calls.map(({ type }) => type), ['uploadAsset', 'loadForWrite', 'write']);
assert.match(calls[2].input.source, new RegExp(pinnedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.doesNotMatch(calls[2].input.source, /pendingAssetId/);
```

Add two failure tests:

- asset upload failure means `githubData.write` is never called and pending bytes remain;
- BOM write failure after a successful upload retains `pending.resolved`, and retry performs no second binary upload.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/github-data.test.mjs
```

Expected: FAIL because `writeGithubData()` does not resolve pending assets.

- [x] **Step 3: Resolve a cloned outgoing payload before reading the remote SHA**

In `writeGithubData(token)`:

```js
const localPayload = normalizePayload({ /* current state fields */ });
const resolution = await resolvePendingMaterialAssets({
  payload: localPayload,
  pendingAssets: this.state.pendingMaterialAssets,
  upload: (pending) => this.githubAssetStorage.uploadAsset({
    token,
    path: pending.path,
    contentType: pending.contentType,
    bytes: pending.bytes,
  }),
});
let payload = resolution.payload;
const remoteFile = await this.githubData.loadForWrite(token);
```

Preserve the existing remote notification merge and current-SHA PUT. Only after `githubData.write()` succeeds:

- adopt `payload` into all corresponding state references;
- delete `resolution.completedPendingIds` from pending state;
- set `loadedPayload`, clear dirty, render, and show saved status.

Do not mutate local asset URLs before the BOM write succeeds.

- [x] **Step 4: Verify GREEN and commit**

Run:

```powershell
node --test tests/github-data.test.mjs
npm test
git add src/application.js tests/github-data.test.mjs
git commit -m "feat: publish pending material assets"
```

Expected: exact call ordering, failure atomicity, and retry reuse tests pass.

---

### Task 4: Add localized Material Master Upload controls

**Files:**
- Modify: `src/application.js`
- Modify: `src/ui/material-view.js`
- Modify: `src/styles/app.css`
- Modify: `tests/material-assets.test.mjs`
- Modify: `tests/ui-contract.test.mjs`

**Interfaces:**
- Produces: `data-action="upload-asset-file"`, hidden `data-asset-file-input`, localized pending filename/status, and per-type `accept` values.

- [x] **Step 1: Write failing UI contract tests**

Assert Material Master output contains:

```js
assert.match(html, /data-action="upload-asset-file"/);
assert.match(html, /data-asset-file-input/);
assert.match(html, /accept="\.pdf,application\/pdf"/);
assert.match(modelHtml, /accept="\.glb,\.gltf,model\/gltf-binary,model\/gltf\+json"/);
assert.match(modelHtml, /asset-pending-upload/);
```

Assert `runAction()` routes `upload-asset-file`, and delegated change handling routes the selected file input.

- [x] **Step 2: Run UI tests and verify RED**

Run:

```powershell
node --test tests/material-assets.test.mjs tests/ui-contract.test.mjs
```

Expected: FAIL because Upload controls are absent.

- [x] **Step 3: Add i18n keys and controls**

Add matching zh/vi keys for:

```text
uploadAsset, assetPendingUpload, assetFileQueued, invalidAssetFile,
assetFileTooLarge, invalidPdfFile, invalidGlbFile, invalidGltfFile,
pendingAssetMissing, uploadingAssets, assetUploadFailed
```

Render one Upload button and hidden file input in each editable asset row. Use the pending map to render the selected filename without writing bytes or blob URLs into HTML. Add CSS classes for the row, actions, hidden input, and pending status; do not add new inline styles.

- [x] **Step 4: Bind picker and file change events**

`openMaterialAssetFilePicker(button)` finds the input inside the same asset row and calls `click()`. The delegated change handler calls `handleMaterialAssetFileInput(input)` and resets `input.value` afterward so the same file can be reselected.

- [x] **Step 5: Run focused tests, build, and i18n scan**

Run:

```powershell
node --test tests/material-assets.test.mjs tests/ui-contract.test.mjs
npm run build
npm run check
rg -n "uploadAsset|assetPendingUpload|assetFileQueued|invalidAssetFile|assetFileTooLarge|invalidPdfFile|invalidGlbFile|invalidGltfFile|pendingAssetMissing|uploadingAssets|assetUploadFailed" src/application.js src/ui/material-view.js
```

Expected: tests pass, generated artifacts are current, and each new UI string is reached through a dictionary key.

- [x] **Step 6: Commit localized UI**

```powershell
git add src/application.js src/ui/material-view.js src/styles/app.css tests/material-assets.test.mjs tests/ui-contract.test.mjs admin.html app-admin.js styles.css viewer.html
git commit -m "feat: add Material Master upload controls"
```

---

### Task 5: Browser gate, context, full review, and Draft PR

**Files:**
- Modify: `AI_DEBUG_GUIDE.md`
- Modify: `HANDOVER.md`
- Modify: `PROJECT_CONTEXT.md`
- Modify: `REVIEW_CONTEXT.md`
- Modify: `README_SYNC.md`
- Modify: `docs/superpowers/plans/2026-07-14-material-master-github-upload.md`

**Interfaces:**
- Records the active Phase B flow, verification evidence, retry behavior, and publication boundary for the next AI.

- [x] **Step 1: Run a real Admin browser smoke without saving remote data**

Use a local HTTP server and Playwright. In Admin Material Master:

1. select a valid PDF and verify the pending filename appears;
2. verify the stored material record is unchanged before Save Material;
3. verify Back discards the draft and pending bytes;
4. repeat selection, Save Material, and verify the local record has a pending ID but no public URL;
5. inject mocked asset/data adapters in a controlled browser harness or use unit evidence for the remote boundary; do not write production `data.js` during UI smoke;
6. confirm zero browser console errors and Viewer still opens as a standalone build artifact.

Result: the pending filename and blank draft URL rendered correctly; Back restored the original URL; Save Material stayed local-only; Viewer loaded 22 products and 646 materials. No application error occurred. Chromium reported only the pre-existing missing `favicon.ico` resource, and no remote save was attempted.

- [x] **Step 2: Update context documents**

Record:

- Phase A PR #5 merge commit;
- Phase B branch and module ownership;
- exact file validation rules;
- pending state lifecycle;
- upload/BOM save ordering and retry behavior;
- browser evidence;
- `data.js`, `outputs/`, and Desktop unchanged;
- PR remains unmerged until user approval.

- [x] **Step 3: Run the complete verification gate**

```powershell
npm run build
npm run check
node --check app-admin.js
node --check src/features/material-asset-upload.js
node --check src/infrastructure/github-asset-storage.js
git diff --check
git diff --exit-code -- data.js
npm audit
```

Expected: every command exits 0, data audit has zero errors/warnings, and audit has zero vulnerabilities.

- [x] **Step 4: Self-review the net diff**

```powershell
git fetch origin --prune
git diff --check origin/main
git diff --stat origin/main
git diff origin/main -- src/features/material-asset-upload.js src/application.js src/ui/material-view.js src/styles/app.css tests
git diff --exit-code origin/main -- data.js
rg -n "gho_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{20,}" . --glob "!node_modules/**" --glob "!.git/**"
```

Expected: only Phase B source, tests, generated artifacts, plan, and context files differ; secret scan has no matches.

- [x] **Step 5: Commit context and publish a Draft PR**

```powershell
git add AI_DEBUG_GUIDE.md HANDOVER.md PROJECT_CONTEXT.md REVIEW_CONTEXT.md README_SYNC.md docs/superpowers/plans/2026-07-14-material-master-github-upload.md
git commit -m "docs: record Material asset upload flow"
git push -u origin codex/material-asset-upload
gh pr create --draft --base main --head codex/material-asset-upload --title "feat: upload Material Master assets to GitHub"
```

The PR must state that Save Material is local-only, list failure/retry evidence, confirm `data.js` is unchanged, and state that `outputs/` and Desktop were not published. Do not merge it.
