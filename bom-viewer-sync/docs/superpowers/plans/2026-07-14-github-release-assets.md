# GitHub Release Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested browser-compatible adapter for immutable PDF/GLB/GLTF uploads to the public `dutuanan96/bom-viewer-assets` release `assets-v1`, then prove anonymous PDF and GLB delivery before any UI integration.

**Architecture:** The adapter owns release lookup/create, paginated asset listing, raw-binary upload, idempotent duplicate recovery, and stable errors. A separate explicit Node smoke script creates a minimal PDF in memory, uploads it with an existing small GLB, and prints only public metadata. Production Viewer/Admin orchestration remains unchanged.

**Tech Stack:** ES modules, browser `fetch`, Node test runner, GitHub REST Releases API, GitHub CLI, Playwright/browser smoke.

## Global Constraints

- Work only on `codex/github-release-assets`, based on `origin/main`.
- The satellite repository is public and uses the fixed release tag `assets-v1`.
- Use `X-GitHub-Api-Version: 2026-03-10` and raw binary request bodies; never Base64 encode a Release Asset.
- Do not modify `src/application.js`, Material Master UI, `data.js`, `outputs/`, or Desktop files.
- Never log, return, embed, or commit a token.
- Never overwrite or automatically delete an existing Release Asset.
- Keep PR #2 and PR #3 unmerged.

---

### Task 1: Release lifecycle adapter

**Files:**
- Create: `src/infrastructure/github-release.js`
- Create: `tests/github-release.test.mjs`

**Interfaces:**
- Produces: `GithubReleaseError`
- Produces: `createGithubReleaseAdapter({ config, fetchImpl })`
- Produces method: `getOrCreateRelease(token)`
- Config fields: `owner`, `repo`, `releaseTag`, `targetCommitish`

- [x] **Step 1: Write failing release lifecycle tests**

Add tests that inject `fetchImpl` and assert:

```js
const adapter = createGithubReleaseAdapter({
  config: {
    owner: 'acme',
    repo: 'bom-viewer-assets',
    releaseTag: 'assets-v1',
    targetCommitish: 'main',
  },
  fetchImpl,
});

assert.equal((await adapter.getOrCreateRelease('token')).id, 41);
assert.equal(requests[0].url,
  'https://api.github.com/repos/acme/bom-viewer-assets/releases/tags/assets-v1');
```

Cover existing `200`, `404 -> 201`, create-time `422 -> second GET`, non-OK HTTP context, malformed release response, URL encoding, required headers, and absence of the token from thrown error messages.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/github-release.test.mjs`

Expected: module-not-found failure for `src/infrastructure/github-release.js`.

- [x] **Step 3: Implement minimal release lifecycle behavior**

Implement:

```js
export class GithubReleaseError extends Error {
  constructor(message, { code, status, endpoint } = {}) {
    super(message);
    this.name = 'GithubReleaseError';
    this.code = code || 'GITHUB_RELEASE_REQUEST_FAILED';
    if (status !== undefined) this.status = status;
    if (endpoint !== undefined) this.endpoint = endpoint;
  }
}
```

Export `createGithubReleaseAdapter({ config, fetchImpl = globalThis.fetch })`. Its `getOrCreateRelease(token)` method performs GET by encoded tag, POST after a `404`, and one final GET after a create-time `422`. The create body is exactly:

```js
{
  tag_name: releaseTag,
  target_commitish: targetCommitish,
  name: releaseTag,
  body: 'Binary assets for BOM Viewer.',
  draft: false,
  prerelease: false,
  make_latest: 'false',
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/github-release.test.mjs`

Expected: every release lifecycle test passes.

### Task 2: Paginated listing and immutable binary upload

**Files:**
- Modify: `src/infrastructure/github-release.js`
- Modify: `tests/github-release.test.mjs`

**Interfaces:**
- Produces method: `listAssets({ token, releaseId })`
- Produces method: `uploadAsset({ token, releaseId, name, contentType, body })`
- Successful upload result adds `reused: false`; idempotent recovery adds `reused: true`.

- [x] **Step 1: Write failing binary and conflict tests**

Use one `Uint8Array` object and assert body identity:

```js
const body = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
const result = await adapter.uploadAsset({
  token: 'token',
  releaseId: 41,
  name: 'MAT001_upload1_model.glb',
  contentType: 'model/gltf-binary',
  body,
});

assert.equal(requests[0].options.body, body);
assert.equal(requests[0].options.headers['Content-Type'], 'model/gltf-binary');
assert.equal(result.reused, false);
```

Cover `?name=` encoding, list pagination with `per_page=100&page=N`, exact uploaded-name recovery after `422`, unresolved duplicate conflict, `starter` conflict, `502` warning, malformed `201`, invalid empty inputs before network, and no automatic DELETE request.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/github-release.test.mjs`

Expected: failures for missing `listAssets` and `uploadAsset` methods.

- [x] **Step 3: Implement only listing and upload behavior**

Implement paginated GET requests until a page returns fewer than 100 assets. Upload to:

```text
https://uploads.github.com/repos/{owner}/{repo}/releases/{releaseId}/assets?name={encodedName}
```

On upload `422`, call `listAssets` and return an exact `state === "uploaded"` match with `reused: true`. Throw `GITHUB_RELEASE_STARTER_ASSET` for an exact `starter` match and `GITHUB_RELEASE_CONFLICT` when no exact match exists. Map `502` to `GITHUB_RELEASE_STARTER_ASSET`. Validate that successful metadata includes numeric `id`, non-empty `name`, and an HTTPS `browser_download_url`.

- [x] **Step 4: Run the focused and full unit tests**

Run:

```powershell
node --test tests/github-release.test.mjs
npm test
```

Expected: all focused tests and the complete test suite pass.

### Task 3: Explicit live smoke utility

**Files:**
- Create: `scripts/smoke-github-release.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes environment variable: `GH_TOKEN`
- Optional environment variables: `ASSET_OWNER`, `ASSET_REPO`, `ASSET_RELEASE_TAG`
- Produces JSON containing `pdf.browser_download_url` and `glb.browser_download_url`; never includes the token.

- [x] **Step 1: Add an explicit smoke command**

Add to `package.json`:

```json
"smoke:release-assets": "node scripts/smoke-github-release.mjs"
```

The script must:

```js
const token = process.env.GH_TOKEN;
if (!token) throw new Error('GH_TOKEN is required');

const adapter = createGithubReleaseAdapter({
  config: {
    owner: process.env.ASSET_OWNER || 'dutuanan96',
    repo: process.env.ASSET_REPO || 'bom-viewer-assets',
    releaseTag: process.env.ASSET_RELEASE_TAG || 'assets-v1',
    targetCommitish: 'main',
  },
});
```

Build a one-page PDF byte array entirely in memory, read `models3d/catalog/LGS-35x32-5-ad72669d.glb`, generate one stable unique name per run, upload both assets, and print only their public metadata as JSON.

- [x] **Step 2: Create the public satellite repository**

Run:

```powershell
gh repo create dutuanan96/bom-viewer-assets --public --add-readme --description "Public binary assets for BOM Viewer"
gh repo view dutuanan96/bom-viewer-assets --json nameWithOwner,visibility,defaultBranchRef,url
```

Expected: visibility `PUBLIC`, default branch `main`.

- [x] **Step 3: Run the adapter against the real repository**

Run without printing the token:

```powershell
$env:GH_TOKEN = gh auth token
npm run smoke:release-assets
Remove-Item Env:\GH_TOKEN
```

Expected: release `assets-v1` exists and the command prints two HTTPS `browser_download_url` values.

- [x] **Step 4: Run real browser compatibility smoke**

Verify the emitted PDF and GLB URLs anonymously in a real browser. Check final redirects, response headers, PDF iframe/open behavior, and GLB loading in `<model-viewer>` without CORS errors. Also verify localhost standalone behavior; record that manual clean-profile `file://` remains required if automation blocks the protocol.

If either asset fails, stop before UI integration and report the exact header/CORS behavior. Do not add jsDelivr conversion.

Outcome: upload succeeded, but the gate failed. PDF delivery used `Content-Disposition: attachment` with `application/octet-stream`, and the GLB response lacked `Access-Control-Allow-Origin`. Runtime integration stopped as required.

### Task 4: Context, verification, and publication

**Files:**
- Modify: `AI_DEBUG_GUIDE.md`
- Modify: `HANDOVER.md`
- Modify: `PROJECT_CONTEXT.md`
- Modify: `REVIEW_CONTEXT.md`
- Modify: `README_SYNC.md`

- [x] **Step 1: Document the inactive adapter and live-smoke outcome**

Record the public repository/release, raw-binary rule, duplicate recovery, cross-repository orphan caveat, browser result, and the fact that Viewer/Admin runtime is unchanged.

- [x] **Step 2: Run the complete gate**

Run:

```powershell
npm run build
npm run check
node --check app-admin.js
git diff --check
git diff -- data.js
npm audit
```

Expected: every command exits `0`, the current test count has zero failures, audit has zero issues, and `git diff -- data.js` is empty.

Outcome: build and generated checks passed, 103/103 tests passed, the data audit reported zero errors and warnings, `npm audit` reported zero vulnerabilities, and `data.js` had no diff.

- [x] **Step 3: Self-review and publish**

Review the complete diff against `origin/main`, verify no credentials or unintended generated changes, commit with conventional commits, push `codex/github-release-assets`, and open a new draft PR targeting `main`. Do not merge or publish to `outputs/`/Desktop.
