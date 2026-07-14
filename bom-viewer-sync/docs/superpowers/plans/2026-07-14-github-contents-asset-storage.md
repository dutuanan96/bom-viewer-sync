# GitHub Contents Asset Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and prove an inactive browser-compatible adapter that stores immutable PDF, GLB, and portable GLTF binaries in `dutuanan96/bom-viewer-assets` through the GitHub Contents API and returns commit-pinned jsDelivr URLs.

**Architecture:** A dedicated infrastructure module owns binary encoding, deterministic content-addressed paths, create-only Contents API writes, exact retry recovery, and CDN URL construction. A separate explicit smoke script uploads one generated PDF and one existing GLB, then real-browser verification gates all later Material Master integration. Phase A does not modify Admin, Viewer, Material Draft, runtime asset arrays, or `data.js`.

**Tech Stack:** ES modules, browser `fetch`, Web Crypto SHA-256, GitHub REST Contents/Commits APIs, jsDelivr GitHub CDN, Node test runner, GitHub CLI, Playwright CLI.

## Global Constraints

- Work only on `codex/github-contents-assets`, created from current `origin/main`.
- Store assets only in public repository `dutuanan96/bom-viewer-assets`, branch `main`.
- Maximum file size is exactly 20,000,000 bytes for PDF, GLB, and GLTF.
- Use only `assets/pdfs/` and `assets/models/` destinations.
- Every stored path contains the lowercase full SHA-256 digest of the original bytes.
- Contents API uploads are create-only and omit `sha`; never overwrite or DELETE an asset.
- Public URLs use the full 40-character Git commit SHA, never a branch name.
- Never print, return, embed, or commit a PAT.
- Do not modify `src/application.js`, `src/ui/material-view.js`, Material Draft behavior, runtime asset data, `data.js`, `outputs/`, or Desktop files.
- Leave the existing `assets-v1` release and PR #4 unchanged.
- Code, variables, and comments remain English; no PDM UI strings are added in Phase A.

---

### Task 1: Binary encoding and deterministic asset identity

**Files:**
- Create: `src/infrastructure/github-asset-storage.js`
- Create: `tests/github-asset-storage.test.mjs`

**Interfaces:**
- Produces: `MAX_ASSET_BYTES = 20_000_000`
- Produces: `GithubAssetStorageError`
- Produces: `encodeBase64Bytes(bytes)`
- Produces: `sha256Hex(bytes)`
- Produces: `buildAssetPath({ kind, materialCode, originalName, contentHash })`
- Produces: `buildCdnUrl({ config, commitSha, path })`

- [x] **Step 1: Write failing primitive tests**

Create `tests/github-asset-storage.test.mjs` with:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ASSET_BYTES,
  buildAssetPath,
  buildCdnUrl,
  encodeBase64Bytes,
  sha256Hex,
} from '../src/infrastructure/github-asset-storage.js';

const config = { owner: 'acme', repo: 'bom-viewer-assets', branch: 'main' };

test('encodes arbitrary binary bytes without UTF-8 conversion', () => {
  const bytes = new Uint8Array([0x00, 0xff, 0x80, 0x01]);
  assert.equal(encodeBase64Bytes(bytes), 'AP+AAQ==');
});

test('builds a deterministic content-addressed PDF path', async () => {
  const bytes = new Uint8Array([0x00, 0xff, 0x80, 0x01]);
  const contentHash = await sha256Hex(bytes);
  assert.equal(contentHash, '6509423fd9da5c225d2f8619ffae394b40f9f7686fee55a38c54b1424ac65f46');
  assert.equal(buildAssetPath({
    kind: 'pdf',
    materialCode: 'LGS 032/S',
    originalName: '../drawing final.pdf',
    contentHash,
  }), `assets/pdfs/LGS_032_S_${contentHash}_drawing_final.pdf`);
});

test('builds an encoded commit-pinned jsDelivr URL', () => {
  assert.equal(buildCdnUrl({
    config,
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    path: 'assets/models/M1_hash_model.glb',
  }), 'https://cdn.jsdelivr.net/gh/acme/bom-viewer-assets@0123456789abcdef0123456789abcdef01234567/assets/models/M1_hash_model.glb');
});

test('rejects unsupported kinds, invalid hashes, and non-commit refs', () => {
  assert.equal(MAX_ASSET_BYTES, 20_000_000);
  assert.throws(() => buildAssetPath({
    kind: 'obj',
    materialCode: 'M1',
    originalName: 'model.obj',
    contentHash: 'a'.repeat(64),
  }), /Unsupported asset kind/);
  assert.throws(() => buildAssetPath({
    kind: 'pdf',
    materialCode: 'M1',
    originalName: 'drawing.pdf',
    contentHash: 'short',
  }), /contentHash/);
  assert.throws(() => buildCdnUrl({ config, commitSha: 'main', path: 'assets/pdfs/file.pdf' }), /commitSha/);
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/github-asset-storage.test.mjs
```

Expected: module-not-found failure for `src/infrastructure/github-asset-storage.js`.

- [x] **Step 3: Implement the primitive module**

Create `src/infrastructure/github-asset-storage.js` with:

```js
export const MAX_ASSET_BYTES = 20_000_000;

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const BASE64_CHUNK_SIZE = 0x8000;

export class GithubAssetStorageError extends Error {
  constructor(message, { code, status, endpoint } = {}) {
    super(message);
    this.name = 'GithubAssetStorageError';
    this.code = code || 'GITHUB_ASSET_REQUEST_FAILED';
    if (status !== undefined) this.status = status;
    if (endpoint !== undefined) this.endpoint = endpoint;
  }
}

function requireBytes(value) {
  if (!(value instanceof Uint8Array)) throw new TypeError('bytes must be a Uint8Array');
  return value;
}

function sanitizeSegment(value, label) {
  const sanitized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .replace(/_+/g, '_')
    .slice(0, 120);
  if (!sanitized) throw new TypeError(`${label} is required`);
  return sanitized;
}

function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

export function encodeBase64Bytes(value) {
  const bytes = requireBytes(value);
  if (typeof globalThis.btoa !== 'function') throw new Error('Base64 encoder unavailable');
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE)));
  }
  return globalThis.btoa(chunks.join(''));
}

export async function sha256Hex(value) {
  const bytes = requireBytes(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildAssetPath({ kind, materialCode, originalName, contentHash }) {
  if (!HASH_PATTERN.test(String(contentHash || ''))) throw new TypeError('contentHash must be a lowercase SHA-256 digest');
  const folders = { pdf: 'pdfs', glb: 'models', gltf: 'models' };
  const folder = folders[kind];
  if (!folder) throw new TypeError(`Unsupported asset kind: ${kind}`);
  const code = sanitizeSegment(materialCode, 'materialCode');
  const name = sanitizeSegment(originalName, 'originalName');
  return `assets/${folder}/${code}_${contentHash}_${name}`;
}

export function buildCdnUrl({ config, commitSha, path }) {
  if (!COMMIT_PATTERN.test(String(commitSha || ''))) throw new TypeError('commitSha must be a full Git commit SHA');
  const owner = sanitizeSegment(config?.owner, 'owner');
  const repo = sanitizeSegment(config?.repo, 'repo');
  return `https://cdn.jsdelivr.net/gh/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}@${commitSha}/${encodePath(path)}`;
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test tests/github-asset-storage.test.mjs
```

Expected: 4 tests pass, 0 fail.

- [x] **Step 5: Commit the primitive boundary**

```powershell
git add src/infrastructure/github-asset-storage.js tests/github-asset-storage.test.mjs
git commit -m "feat: add asset storage primitives"
```

### Task 2: Create-only Contents API upload

**Files:**
- Modify: `src/infrastructure/github-asset-storage.js`
- Modify: `tests/github-asset-storage.test.mjs`

**Interfaces:**
- Consumes: `encodeBase64Bytes`, `sha256Hex`, `buildCdnUrl`, `MAX_ASSET_BYTES`
- Produces: `createGithubAssetStorageAdapter({ config, fetchImpl })`
- Produces method: `uploadAsset({ token, path, contentType, bytes })`
- Successful result: `{ path, size, contentHash, commitSha, url, reused: false }`

- [x] **Step 1: Add failing upload and validation tests**

Append:

```js
import {
  createGithubAssetStorageAdapter,
  GithubAssetStorageError,
} from '../src/infrastructure/github-asset-storage.js';

function jsonResponse(body, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  };
}

test('uploads binary as a create-only Contents API request', async () => {
  const bytes = new Uint8Array([0x00, 0xff, 0x80, 0x01]);
  const hash = await sha256Hex(bytes);
  const path = `assets/models/M1_${hash}_model.glb`;
  const requests = [];
  const adapter = createGithubAssetStorageAdapter({
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({
        content: { path, size: bytes.byteLength },
        commit: { sha: '0123456789abcdef0123456789abcdef01234567' },
      }, 201, 'Created');
    },
  });

  const result = await adapter.uploadAsset({
    token: 'secret-token',
    path,
    contentType: 'model/gltf-binary',
    bytes,
  });

  assert.equal(requests[0].url, `https://api.github.com/repos/acme/bom-viewer-assets/contents/${path}`);
  assert.equal(requests[0].options.method, 'PUT');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer secret-token');
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.content, 'AP+AAQ==');
  assert.equal(body.branch, 'main');
  assert.equal('sha' in body, false);
  assert.equal(result.reused, false);
  assert.equal(result.contentHash, hash);
  assert.match(result.url, /@0123456789abcdef0123456789abcdef01234567\//);
});

test('rejects invalid upload input before a network call', async () => {
  let requestCount = 0;
  const adapter = createGithubAssetStorageAdapter({
    config,
    fetchImpl: async () => {
      requestCount += 1;
      return jsonResponse({});
    },
  });
  const cases = [
    { path: 'other/file.pdf', contentType: 'application/pdf', bytes: new Uint8Array([1]) },
    { path: 'assets/pdfs/file.pdf', contentType: 'text/plain', bytes: new Uint8Array([1]) },
    { path: 'assets/pdfs/file.pdf', contentType: 'application/pdf', bytes: new Uint8Array() },
    { path: 'assets/pdfs/file.pdf', contentType: 'application/pdf', bytes: new Uint8Array(MAX_ASSET_BYTES + 1) },
  ];
  for (const input of cases) await assert.rejects(adapter.uploadAsset({ token: 'token', ...input }));
  assert.equal(requestCount, 0);
});

test('accepts portable GLTF content in the models folder', async () => {
  const bytes = new TextEncoder().encode('{"asset":{"version":"2.0"}}');
  const hash = await sha256Hex(bytes);
  const path = `assets/models/M1_${hash}_model.gltf`;
  const adapter = createGithubAssetStorageAdapter({
    config,
    fetchImpl: async () => jsonResponse({
      content: { path, size: bytes.byteLength },
      commit: { sha: '0123456789abcdef0123456789abcdef01234567' },
    }, 201, 'Created'),
  });

  const result = await adapter.uploadAsset({
    token: 'token',
    path,
    contentType: 'model/gltf+json',
    bytes,
  });

  assert.equal(result.path, path);
  assert.equal(result.reused, false);
});

test('rejects malformed upload metadata without exposing the token', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = await sha256Hex(bytes);
  const path = `assets/pdfs/M1_${hash}_drawing.pdf`;
  const adapter = createGithubAssetStorageAdapter({
    config,
    fetchImpl: async () => jsonResponse({ content: { path, size: 3 }, commit: { sha: 'short' } }, 201),
  });
  await assert.rejects(
    adapter.uploadAsset({ token: 'do-not-expose', path, contentType: 'application/pdf', bytes }),
    (error) => error instanceof GithubAssetStorageError
      && error.code === 'GITHUB_ASSET_INVALID_RESPONSE'
      && !error.message.includes('do-not-expose'),
  );
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run `node --test tests/github-asset-storage.test.mjs`.

Expected: failures because `createGithubAssetStorageAdapter` is not exported.

- [x] **Step 3: Implement request validation and upload**

Add to `src/infrastructure/github-asset-storage.js`:

```js
const MEDIA_PREFIX = {
  'application/pdf': 'assets/pdfs/',
  'model/gltf-binary': 'assets/models/',
  'model/gltf+json': 'assets/models/',
};
const ASSET_PATH_PATTERN = /^assets\/(?:pdfs|models)\/[A-Za-z0-9._-]+$/;

function normalizeConfig(config) {
  return {
    owner: sanitizeSegment(config?.owner, 'owner'),
    repo: sanitizeSegment(config?.repo, 'repo'),
    branch: sanitizeSegment(config?.branch || 'main', 'branch'),
  };
}

function validateUpload({ path, contentType, bytes }) {
  requireBytes(bytes);
  if (bytes.byteLength === 0) throw new TypeError('bytes must not be empty');
  if (bytes.byteLength > MAX_ASSET_BYTES) throw new TypeError(`bytes must not exceed ${MAX_ASSET_BYTES}`);
  const prefix = MEDIA_PREFIX[contentType];
  if (!prefix) throw new TypeError(`Unsupported contentType: ${contentType}`);
  if (!String(path).startsWith(prefix) || !ASSET_PATH_PATTERN.test(String(path))) {
    throw new TypeError('Invalid asset path');
  }
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function validateCreatedAsset(data, { config, path, size, contentHash, endpoint }) {
  const commitSha = String(data?.commit?.sha || '');
  if (data?.content?.path !== path
    || data?.content?.size !== size
    || !COMMIT_PATTERN.test(commitSha)) {
    throw new GithubAssetStorageError(`Invalid GitHub asset response from ${endpoint}`, {
      code: 'GITHUB_ASSET_INVALID_RESPONSE',
      endpoint,
    });
  }
  return {
    path,
    size,
    contentHash,
    commitSha,
    url: buildCdnUrl({ config, commitSha, path }),
    reused: false,
  };
}

export function createGithubAssetStorageAdapter({ config, fetchImpl = globalThis.fetch }) {
  const cleanConfig = normalizeConfig(config);
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(cleanConfig.owner)}/${encodeURIComponent(cleanConfig.repo)}`;

  return {
    async uploadAsset({ token, path, contentType, bytes }) {
      validateUpload({ path, contentType, bytes });
      const contentHash = await sha256Hex(bytes);
      if (!String(path).includes(`_${contentHash}_`)) throw new TypeError('path must contain the full content hash');
      const endpoint = `/contents/${encodePath(path)}`;
      let response;
      try {
        response = await fetchImpl(`${apiBase}${endpoint}`, {
          method: 'PUT',
          headers: githubHeaders(token),
          body: JSON.stringify({
            message: `Upload BOM asset ${path}`,
            content: encodeBase64Bytes(bytes),
            branch: cleanConfig.branch,
          }),
        });
      } catch {
        throw new GithubAssetStorageError(`PUT ${endpoint} failed: network error`, { endpoint });
      }
      if (!response.ok) {
        throw new GithubAssetStorageError(
          `PUT ${endpoint} failed: ${response.status} ${response.statusText}`,
          { status: response.status, endpoint },
        );
      }
      let data;
      try {
        data = await response.json();
      } catch {
        throw new GithubAssetStorageError(`Invalid JSON response from ${endpoint}`, {
          code: 'GITHUB_ASSET_INVALID_RESPONSE',
          endpoint,
        });
      }
      return validateCreatedAsset(data, {
        config: cleanConfig,
        path,
        size: bytes.byteLength,
        contentHash,
        endpoint,
      });
    },
  };
}
```

- [x] **Step 4: Run focused and full unit tests**

Run:

```powershell
node --test tests/github-asset-storage.test.mjs
npm test
```

Expected: all focused tests and the complete suite pass.

- [x] **Step 5: Commit create-only upload**

```powershell
git add src/infrastructure/github-asset-storage.js tests/github-asset-storage.test.mjs
git commit -m "feat: upload immutable GitHub assets"
```

### Task 3: Deterministic retry recovery

**Files:**
- Modify: `src/infrastructure/github-asset-storage.js`
- Modify: `tests/github-asset-storage.test.mjs`

**Interfaces:**
- Produces method: `resolveExistingAsset({ token, path, expectedSize, contentHash })`
- Existing result: `{ path, size, contentHash, commitSha, url, reused: true }`
- `uploadAsset` delegates status `409` and `422` to `resolveExistingAsset`

- [x] **Step 1: Add failing exact-retry and conflict tests**

Append:

```js
test('recovers an exact immutable upload after a create conflict', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = await sha256Hex(bytes);
  const path = `assets/pdfs/M1_${hash}_drawing.pdf`;
  const requests = [];
  const responses = [
    jsonResponse({}, 422, 'Unprocessable Entity'),
    jsonResponse({ path, size: bytes.byteLength }),
    jsonResponse([{ sha: 'fedcba9876543210fedcba9876543210fedcba98' }]),
  ];
  const adapter = createGithubAssetStorageAdapter({
    config,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return responses.shift();
    },
  });

  const result = await adapter.uploadAsset({ token: 'token', path, contentType: 'application/pdf', bytes });

  assert.equal(result.reused, true);
  assert.equal(result.commitSha, 'fedcba9876543210fedcba9876543210fedcba98');
  assert.equal(requests.some(({ options }) => options.method === 'DELETE'), false);
  assert.equal(JSON.parse(requests[0].options.body).sha, undefined);
});

test('rejects an existing path when size or hash identity does not match', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = await sha256Hex(bytes);
  const path = `assets/models/M1_${hash}_model.glb`;
  const adapter = createGithubAssetStorageAdapter({
    config,
    fetchImpl: async (_url, options = {}) => options.method === 'PUT'
      ? jsonResponse({}, 409, 'Conflict')
      : jsonResponse({ path, size: 999 }),
  });

  await assert.rejects(
    adapter.uploadAsset({ token: 'token', path, contentType: 'model/gltf-binary', bytes }),
    (error) => error instanceof GithubAssetStorageError
      && error.code === 'GITHUB_ASSET_CONFLICT',
  );
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run `node --test tests/github-asset-storage.test.mjs`.

Expected: the recovery test fails because `422` is thrown directly.

- [x] **Step 3: Implement exact-path recovery**

Inside `createGithubAssetStorageAdapter`, add this function before the returned object:

```js
  async function requestJson(url, options, endpoint) {
    let response;
    try {
      response = await fetchImpl(url, options);
    } catch {
      throw new GithubAssetStorageError(`GET ${endpoint} failed: network error`, { endpoint });
    }
    if (!response.ok) {
      throw new GithubAssetStorageError(
        `GET ${endpoint} failed: ${response.status} ${response.statusText}`,
        { status: response.status, endpoint },
      );
    }
    try {
      return await response.json();
    } catch {
      throw new GithubAssetStorageError(`Invalid JSON response from ${endpoint}`, {
        code: 'GITHUB_ASSET_INVALID_RESPONSE',
        endpoint,
      });
    }
  }

  async function resolveExistingAsset({ token, path, expectedSize, contentHash }) {
    if (!HASH_PATTERN.test(String(contentHash || '')) || !String(path).includes(`_${contentHash}_`)) {
      throw new GithubAssetStorageError(`Existing asset identity mismatch: ${path}`, {
        code: 'GITHUB_ASSET_CONFLICT',
      });
    }
    const contentsEndpoint = `/contents/${encodePath(path)}?ref=${encodeURIComponent(cleanConfig.branch)}`;
    const existing = await requestJson(
      `${apiBase}${contentsEndpoint}`,
      { headers: githubHeaders(token) },
      contentsEndpoint,
    );
    if (existing?.path !== path || existing?.size !== expectedSize) {
      throw new GithubAssetStorageError(`Existing asset does not match: ${path}`, {
        code: 'GITHUB_ASSET_CONFLICT',
        endpoint: contentsEndpoint,
      });
    }
    const commitsEndpoint = `/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(cleanConfig.branch)}&per_page=1`;
    const commits = await requestJson(
      `${apiBase}${commitsEndpoint}`,
      { headers: githubHeaders(token) },
      commitsEndpoint,
    );
    const commitSha = String(commits?.[0]?.sha || '');
    if (!COMMIT_PATTERN.test(commitSha)) {
      throw new GithubAssetStorageError(`Invalid commit history for ${path}`, {
        code: 'GITHUB_ASSET_INVALID_RESPONSE',
        endpoint: commitsEndpoint,
      });
    }
    return {
      path,
      size: expectedSize,
      contentHash,
      commitSha,
      url: buildCdnUrl({ config: cleanConfig, commitSha, path }),
      reused: true,
    };
  }
```

Change the existing returned-object opening to:

```js
  return {
    resolveExistingAsset,
    async uploadAsset({ token, path, contentType, bytes }) {
```

In `uploadAsset`, replace the non-OK branch with:

```js
      if (response.status === 409 || response.status === 422) {
        return resolveExistingAsset({
          token,
          path,
          expectedSize: bytes.byteLength,
          contentHash,
        });
      }
      if (!response.ok) {
        throw new GithubAssetStorageError(
          `PUT ${endpoint} failed: ${response.status} ${response.statusText}`,
          { status: response.status, endpoint },
        );
      }
```

- [x] **Step 4: Run focused and full unit tests**

Run:

```powershell
node --test tests/github-asset-storage.test.mjs
npm test
```

Expected: all tests pass, and recorded requests contain no DELETE or update `sha`.

- [x] **Step 5: Commit retry recovery**

```powershell
git add src/infrastructure/github-asset-storage.js tests/github-asset-storage.test.mjs
git commit -m "fix: recover immutable asset retries"
```

### Task 4: Explicit satellite live smoke

**Files:**
- Create: `scripts/smoke-github-contents-assets.mjs`
- Modify: `tests/github-asset-storage.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes environment variable: `GH_TOKEN`
- Optional environment variables: `ASSET_OWNER`, `ASSET_REPO`, `ASSET_BRANCH`
- Produces command: `npm run smoke:contents-assets`
- Produces JSON fields: `pdf.url`, `pdf.commitSha`, `glb.url`, `glb.commitSha`; never token data

- [ ] **Step 1: Add a failing smoke-PDF contract test**

Append:

```js
import { buildSmokePdf } from '../scripts/smoke-github-contents-assets.mjs';

test('builds a valid self-contained PDF for live smoke', () => {
  const source = new TextDecoder().decode(buildSmokePdf());
  const startXref = Number(source.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
  assert.match(source, /^%PDF-1\.4/);
  assert.equal(source.slice(startXref, startXref + 4), 'xref');
  assert.match(source, /BOM Contents Asset Smoke/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `node --test tests/github-asset-storage.test.mjs`.

Expected: module-not-found failure for `scripts/smoke-github-contents-assets.mjs`.

- [ ] **Step 3: Create the smoke script and package command**

Create `scripts/smoke-github-contents-assets.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildAssetPath,
  createGithubAssetStorageAdapter,
  sha256Hex,
} from '../src/infrastructure/github-asset-storage.js';

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

export function buildSmokePdf() {
  const content = 'BT /F1 18 Tf 30 100 Td (BOM Contents Asset Smoke) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 160] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let source = '%PDF-1.4\n';
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) source += `${String(offset).padStart(10, '0')} 00000 n \n`;
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(source);
}

async function upload(adapter, { token, kind, materialCode, originalName, contentType, bytes }) {
  const contentHash = await sha256Hex(bytes);
  const path = buildAssetPath({ kind, materialCode, originalName, contentHash });
  return adapter.uploadAsset({ token, path, contentType, bytes });
}

async function run() {
  const token = String(process.env.GH_TOKEN || '').trim();
  if (!token) throw new Error('GH_TOKEN is required');
  const config = {
    owner: process.env.ASSET_OWNER || 'dutuanan96',
    repo: process.env.ASSET_REPO || 'bom-viewer-assets',
    branch: process.env.ASSET_BRANCH || 'main',
  };
  const adapter = createGithubAssetStorageAdapter({ config });
  const pdfBytes = buildSmokePdf();
  const glbBytes = new Uint8Array(await readFile(new URL('../models3d/catalog/LGS-35x32-5-ad72669d.glb', import.meta.url)));
  const pdf = await upload(adapter, {
    token,
    kind: 'pdf',
    materialCode: 'SMOKE',
    originalName: 'contents-smoke.pdf',
    contentType: 'application/pdf',
    bytes: pdfBytes,
  });
  const glb = await upload(adapter, {
    token,
    kind: 'glb',
    materialCode: 'SMOKE',
    originalName: 'contents-smoke.glb',
    contentType: 'model/gltf-binary',
    bytes: glbBytes,
  });
  process.stdout.write(`${JSON.stringify({ repository: `${config.owner}/${config.repo}`, pdf, glb }, null, 2)}\n`);
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entryUrl === import.meta.url) {
  run().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      name: error.name,
      code: error.code || 'SMOKE_FAILED',
      message: error.message,
      status: error.status,
      endpoint: error.endpoint,
    })}\n`);
    process.exitCode = 1;
  });
}
```

Add to `package.json` scripts:

```json
"smoke:contents-assets": "node scripts/smoke-github-contents-assets.mjs"
```

- [ ] **Step 4: Run unit and syntax checks**

Run:

```powershell
node --test tests/github-asset-storage.test.mjs
node --check scripts/smoke-github-contents-assets.mjs
npm test
```

Expected: all commands exit `0`.

- [ ] **Step 5: Run the real upload without printing the token**

Run:

```powershell
$env:GH_TOKEN = gh auth token
npm run smoke:contents-assets
Remove-Item Env:\GH_TOKEN
```

Expected: both results use `https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-assets@<40-character-sha>/...` and contain no token.

- [ ] **Step 6: Run the browser compatibility gate**

Capture the smoke JSON and use Playwright CLI from a normal HTTPS origin:

```powershell
$smokeJson = npm run --silent smoke:contents-assets
$smoke = $smokeJson | ConvertFrom-Json
$pdfUrl = $smoke.pdf.url
$glbUrl = $smoke.glb.url
npx --yes --package @playwright/cli playwright-cli -s=contents-smoke open https://example.com --headed
$fetchScript = "async () => { const urls = { pdf: '$pdfUrl', glb: '$glbUrl' }; const output = {}; for (const [name, url] of Object.entries(urls)) { const response = await fetch(url); output[name] = { status: response.status, contentType: response.headers.get('content-type'), disposition: response.headers.get('content-disposition'), cors: response.headers.get('access-control-allow-origin'), size: (await response.arrayBuffer()).byteLength }; } return output; }"
npx --yes --package @playwright/cli playwright-cli -s=contents-smoke eval $fetchScript
npx --yes --package @playwright/cli playwright-cli -s=contents-smoke tab-new $pdfUrl
npx --yes --package @playwright/cli playwright-cli -s=contents-smoke tab-list
```

The fetch result must be:

```text
PDF: status 200, Content-Type application/pdf, no Content-Disposition attachment, Access-Control-Allow-Origin *
GLB: status 200, Content-Type model/gltf-binary, Access-Control-Allow-Origin *
```

For the GLB rendering check, return to the HTTPS tab and load `<model-viewer>` explicitly:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=contents-smoke tab-select 0
$modelScript = "async () => { const loader = document.createElement('script'); loader.type = 'module'; loader.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js'; document.head.append(loader); await customElements.whenDefined('model-viewer'); const viewer = document.createElement('model-viewer'); viewer.src = '$glbUrl'; document.body.replaceChildren(viewer); return await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('model-viewer timeout')), 15000); viewer.addEventListener('load', () => { clearTimeout(timeout); resolve({ loaded: true, url: viewer.src }); }, { once: true }); viewer.addEventListener('error', (event) => { clearTimeout(timeout); reject(new Error(event.detail?.type || 'model-viewer error')); }, { once: true }); }); }"
npx --yes --package @playwright/cli playwright-cli -s=contents-smoke eval $modelScript
npx --yes --package @playwright/cli playwright-cli -s=contents-smoke close
```

Direct PDF navigation must remain on `$pdfUrl`, and the model result must contain `loaded: true`. If any assertion fails, close the session and stop without changing runtime code.

- [ ] **Step 7: Commit the smoke utility after the gate passes**

```powershell
git add package.json scripts/smoke-github-contents-assets.mjs tests/github-asset-storage.test.mjs
git commit -m "chore: add Contents asset live smoke"
```

### Task 5: Context, complete gate, and Draft PR

**Files:**
- Modify: `AI_DEBUG_GUIDE.md`
- Modify: `HANDOVER.md`
- Modify: `PROJECT_CONTEXT.md`
- Modify: `REVIEW_CONTEXT.md`
- Modify: `README_SYNC.md`

**Interfaces:**
- Records: adapter inactive status, public repo/path contract, 20,000,000-byte limit, commit-pinned URL rule, browser evidence, and Phase B blocker.

- [ ] **Step 1: Record the verified inactive adapter state**

Apply the following exact locations:

- `AI_DEBUG_GUIDE.md`: add adapter/test ownership rows beside `github-data.js`, then add `### GitHub Contents asset storage experiment` immediately after the numbered invariants.
- `HANDOVER.md`: add one Current State bullet and one Latest Debug Evidence bullet.
- `PROJECT_CONTEXT.md`: add `## Inactive Contents Asset Storage Experiment` immediately after `## Material Master 2D/3D Editing`.
- `REVIEW_CONTEXT.md`: add `## Contents Asset Storage Review Gate` immediately after `## Material Asset Contracts`.
- `README_SYNC.md`: add `## Contents Asset Storage Experiment` immediately after `## Current Release State`.

Each new status section must contain these exact facts:

```text
- `src/infrastructure/github-asset-storage.js` is an inactive adapter; Admin and Viewer do not import it.
- Binary storage uses create-only GitHub Contents API writes to `dutuanan96/bom-viewer-assets`.
- Asset paths contain the full SHA-256 content hash and are limited to 20,000,000 bytes.
- Viewer URLs are pinned to the full asset-repository commit SHA on jsDelivr.
- The satellite PDF/GLB browser smoke result and exact MIME/CORS headers are the Phase B gate.
- `data.js`, Material Draft, asset metadata, `outputs/`, and Desktop remain unchanged.
```

Keep `AI_DEBUG_GUIDE.md` operational by adding the new adapter and focused test to its ownership tables. Do not mark Phase B approved; state that UI integration requires separate user approval.

- [ ] **Step 2: Run the complete verification gate**

Run fresh:

```powershell
npm run build
npm run check
node --check app-admin.js
node --check src/infrastructure/github-asset-storage.js
node --check scripts/smoke-github-contents-assets.mjs
git diff --check
git diff --exit-code -- data.js
npm audit
```

Expected: every command exits `0`; all tests pass; data audit reports zero errors and warnings; `data.js` has no diff; audit reports zero vulnerabilities.

- [ ] **Step 3: Self-review the complete branch diff**

Run:

```powershell
git diff --check origin/main
git diff --stat origin/main
git diff origin/main -- src/infrastructure/github-asset-storage.js tests/github-asset-storage.test.mjs scripts/smoke-github-contents-assets.mjs package.json
git diff --exit-code origin/main -- data.js src/application.js src/ui/material-view.js
rg -n "gho_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{20,}" . --glob "!node_modules/**"
```

Expected: only Phase A files and context documents differ; secret scan has no matches; runtime and data diff is empty.

- [ ] **Step 4: Commit context evidence**

```powershell
git add AI_DEBUG_GUIDE.md HANDOVER.md PROJECT_CONTEXT.md REVIEW_CONTEXT.md README_SYNC.md
git commit -m "docs: record Contents asset browser gate"
```

- [ ] **Step 5: Push and create a Draft PR**

```powershell
git push -u origin codex/github-contents-assets
gh pr create --draft --base main --head codex/github-contents-assets --title "feat: add GitHub Contents asset storage adapter"
```

The PR body must state that Phase A is inactive, list the live PDF/GLB headers, confirm `data.js` and runtime are unchanged, and link the public satellite repository. Do not merge the PR and do not publish to `outputs/` or Desktop.
