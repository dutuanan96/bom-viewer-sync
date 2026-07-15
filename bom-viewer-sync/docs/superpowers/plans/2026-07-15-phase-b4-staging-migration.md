# Phase B.4 One-Time Staging Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and fully mock-test a guarded CLI that stages the 24 BOM shards on a new one-time GitHub branch, reads them back, and verifies exact payload equivalence without touching `main` or runtime behavior.

**Architecture:** Add backward-compatible `shardRoot` support to the Phase B.3 writer, centralize deterministic logical shard formatting in a Node-only script helper, and add a project-specific GitHub staging orchestrator plus thin CLI. The implementation agent stops after local tests and reports the exact proposed execution command; a human-controlled later checkpoint performs the real remote write.

**Tech Stack:** Node.js 22 ES modules, built-in `node:test`, `node:assert/strict`, `node:crypto`, GitHub Git Data API, existing `createGithubGitDataWriter()`, no new dependencies.

## Global Constraints

- Start from `origin/main` at `39c396e59ff6324afb52d5335866f16411f33ae3` or stop and report the new SHA before coding.
- Repository is fixed to `dutuanan96/bom-viewer-sync`; do not add owner/repo CLI flags.
- Source is fixed to branch `main` and path `bom-viewer-sync/data.js`.
- Runtime shard root is fixed to `bom-viewer-sync/data`.
- Staging branch must match `^codex/phase-b4-shards-\d{8}T\d{6}Z-[0-9a-f]{7}$` and must not exist.
- Real execution requires `--execute`, `--confirm STAGE_24_SHARDS`, a full expected source SHA, the reviewed aggregate SHA-256, and `GH_TOKEN` from the environment.
- Never accept a token in CLI arguments, config files, fixtures that resemble real credentials, logs, errors, or reports.
- Never use `force: true`, `DELETE`, automatic retry, automatic rollback, or automatic branch cleanup.
- Do not modify `data.js`, create a local `data/` directory, wire `src/application.js`, alter Admin/Viewer save behavior, or publish `outputs/`/Desktop files.
- Do not execute the real staging command, commit, push, open a PR, or merge unless the user separately authorizes those actions after review.
- Code, comments, identifiers, and errors are English. No new user-facing PDM UI text is needed.

---

## File map

| Path | Responsibility |
|---|---|
| `src/infrastructure/github-git-data.js` | Existing atomic writer; add validated `shardRoot` only |
| `tests/github-git-data.test.mjs` | Backward compatibility and real repository shard-root tests |
| `scripts/lib/sharded-files.mjs` | Deterministic logical shard formatting, hashing, mapping, and round-trip verification |
| `tests/sharded-files.test.mjs` | Exact 24-file/hash/path/round-trip contracts |
| `scripts/lib/github-sharded-staging.mjs` | CLI validation, Git ref/tree/blob reads, staging ref creation, writer orchestration, readback verification, sanitized summaries |
| `tests/github-sharded-staging.test.mjs` | Route-aware safety and failure-stage tests with no network |
| `scripts/migrate-data-dry-run.mjs` | Reuse the logical shard helper without changing output/hash |
| `scripts/migrate-data-staging.mjs` | Thin executable wrapper only |
| `package.json` | Add `migrate:staging` command |
| Context docs | Record implemented-but-unexecuted Phase B.4 state and execution checkpoint |

---

### Task 1: Make the atomic writer repository-subdirectory aware

**Files:**

- Modify: `tests/github-git-data.test.mjs`
- Modify: `src/infrastructure/github-git-data.js`

**Interfaces:**

- Consumes: existing `createGithubGitDataWriter({ config, fetchImpl })`.
- Produces: optional `config.shardRoot`, default `data`; the accepted file grammar is rooted under that exact value.

- [ ] **Step 1: Add failing writer tests**

Add a test that uses this configuration and asserts the tree contains repository-root-relative paths:

```js
const NESTED_CONFIG = {
  owner: 'test-owner',
  repo: 'test-repo',
  branch: 'feature/phase-b4',
  shardRoot: 'bom-viewer-sync/data',
};

const nestedFiles = {
  'bom-viewer-sync/data/products/widget-1.json': null,
  'bom-viewer-sync/data/materials.json': '{"materialDb":{"materials":{},"bomEntries":[]}}',
  'bom-viewer-sync/data/manifest.json': '{"products":["widget-1"]}',
};
```

Assert sorted tree paths are exactly:

```js
[
  'bom-viewer-sync/data/manifest.json',
  'bom-viewer-sync/data/materials.json',
  'bom-viewer-sync/data/products/widget-1.json',
]
```

Add constructor/input rejection cases for these roots and paths, all before network I/O:

```js
const invalidRoots = [
  '',
  '   ',
  '/data',
  '../data',
  'bom-viewer-sync\\data',
  'bom-viewer-sync//data',
  'bom-viewer-sync/%64ata',
  'bom-viewer-sync/products',
  'src/data/..',
];
```

Also prove the default `data` configuration still accepts the existing B.3 fixtures.

- [ ] **Step 2: Run the focused test and capture RED evidence**

Run:

```powershell
node --test tests/github-git-data.test.mjs
```

Expected: the nested-root happy path fails because the writer still validates only `data/...`; no existing test may fail for another reason.

- [ ] **Step 3: Implement minimal `shardRoot` validation**

Add these helpers near the existing path validators:

```js
const SAFE_ROOT_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

function validateShardRoot(value = 'data') {
  if (!isNonEmptyString(value) || value !== value.trim() || value.includes('\\')) {
    throw new Error('Invalid GitHub shardRoot config');
  }
  const segments = value.split('/');
  if (
    segments.some((segment) => !SAFE_ROOT_SEGMENT_PATTERN.test(segment)
      || segment === '.'
      || segment === '..'
      || segment.includes('%'))
    || segments.at(-1) !== 'data'
  ) {
    throw new Error('Invalid GitHub shardRoot config');
  }
  return segments.join('/');
}

function validateShardPath(path, shardRoot) {
  if (path === `${shardRoot}/manifest.json` || path === `${shardRoot}/materials.json`) return;
  const prefix = `${shardRoot}/products/`;
  if (!path.startsWith(prefix)) throw new Error(`Invalid or unsafe shard path: ${path}`);
  const filename = path.slice(prefix.length);
  const productMatch = /^([A-Za-z0-9_-]+)\.json$/.exec(filename);
  if (!productMatch || RESERVED_PRODUCT_IDS.has(productMatch[1].toLowerCase())) {
    throw new Error(`Invalid or unsafe shard path: ${path}`);
  }
}
```

Inside the factory, resolve once:

```js
const shardRoot = validateShardRoot(config.shardRoot || 'data');
```

Pass `shardRoot` into every `validateShardPath()` call. Do not change the Git API sequence, error sanitization, or `force: false` update.

- [ ] **Step 4: Run GREEN and regression gates**

Run:

```powershell
node --test tests/github-git-data.test.mjs
node --check src/infrastructure/github-git-data.js
```

Expected: all focused tests pass and syntax exit code is 0.

- [ ] **Step 5: Review the task diff**

Run:

```powershell
git diff --check
git diff -- src/infrastructure/github-git-data.js tests/github-git-data.test.mjs
```

Confirm there is no public runtime import and no path grammar broader than the configured shard root.

---

### Task 2: Centralize logical shard generation and preserve the dry-run hash

**Files:**

- Create: `scripts/lib/sharded-files.mjs`
- Create: `tests/sharded-files.test.mjs`
- Modify: `scripts/migrate-data-dry-run.mjs`

**Interfaces:**

- Consumes: `splitPayloadToShards()`, `assembleShardedPayload()`, and `normalizePayload()`.
- Produces:

```js
buildLogicalShardFiles(payload) -> Map<string, string>
computeShardAggregateHash(files) -> string
toRepositoryShardFiles(files, shardRoot) -> Record<string, string>
verifyLogicalShardRoundTrip(payload, files) -> Promise<void>
```

- [ ] **Step 1: Write failing helper contract tests**

The test must load the current `data.js` and assert:

```js
assert.equal(files.size, 24);
assert.deepEqual([...files.keys()].sort(), [
  'manifest.json',
  'materials.json',
  ...Object.keys(payload.bom).sort().map((id) => `products/${id}.json`),
]);
assert.equal(
  computeShardAggregateHash(files),
  'd5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e',
);
```

Assert every file ends with one newline, path ordering does not affect the aggregate hash, repository mapping produces `bom-viewer-sync/data/...`, and `verifyLogicalShardRoundTrip()` resolves.

- [ ] **Step 2: Run RED**

```powershell
node --test tests/sharded-files.test.mjs
```

Expected: module-not-found failure for `scripts/lib/sharded-files.mjs`.

- [ ] **Step 3: Implement the complete helper**

Create `scripts/lib/sharded-files.mjs` with this structure:

```js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { assembleShardedPayload, splitPayloadToShards } from '../../src/domain/sharded-data.js';
import { normalizePayload } from '../../src/infrastructure/github-data.js';

function stringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertLogicalFiles(files) {
  if (!(files instanceof Map) || files.size === 0) throw new Error('Logical shard files are required');
  for (const [path, content] of files) {
    if (!/^(manifest|materials)\.json$|^products\/[A-Za-z0-9_-]+\.json$/.test(path)) {
      throw new Error(`Invalid logical shard path: ${path}`);
    }
    if (typeof content !== 'string') throw new Error(`Invalid logical shard content: ${path}`);
  }
}

export function buildLogicalShardFiles(payload) {
  const { manifest, materials, products } = splitPayloadToShards(payload);
  const files = new Map([
    ['manifest.json', stringify(manifest)],
    ['materials.json', stringify(materials)],
  ]);
  for (const [id, product] of [...products.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    files.set(`products/${id}.json`, stringify(product));
  }
  return files;
}

export function computeShardAggregateHash(files) {
  assertLogicalFiles(files);
  let framed = '';
  for (const path of [...files.keys()].sort()) {
    const content = files.get(path);
    framed += `${Buffer.byteLength(path)}:${path}:${Buffer.byteLength(content)}:${content}`;
  }
  return crypto.createHash('sha256').update(framed).digest('hex');
}

export function toRepositoryShardFiles(files, shardRoot) {
  assertLogicalFiles(files);
  if (typeof shardRoot !== 'string' || (shardRoot !== 'data' && !shardRoot.endsWith('/data'))) {
    throw new Error('Valid repository shard root is required');
  }
  return Object.fromEntries([...files.entries()].map(([path, content]) => [`${shardRoot}/${path}`, content]));
}

export async function verifyLogicalShardRoundTrip(payload, files) {
  assertLogicalFiles(files);
  const manifest = JSON.parse(files.get('manifest.json'));
  const materials = JSON.parse(files.get('materials.json'));
  const assembled = await assembleShardedPayload(manifest, materials, async (id) => {
    const content = files.get(`products/${id}.json`);
    if (!content) throw new Error(`Product shard not found: ${id}`);
    return JSON.parse(content);
  });
  assert.deepEqual(normalizePayload(assembled), normalizePayload(payload));
}
```

Do not generalize this helper for arbitrary files or add dependencies.

- [ ] **Step 4: Refactor the existing dry-run**

Replace its duplicate serialization/hash logic with:

```js
const files = buildLogicalShardFiles(payload);
await verifyLogicalShardRoundTrip(payload, files);
const aggregateHash = computeShardAggregateHash(files);
```

Preserve all existing output labels and counts exactly.

- [ ] **Step 5: Run helper and dry-run gates twice**

```powershell
node --test tests/sharded-files.test.mjs tests/sharded-migration.test.mjs
npm run migrate:dry-run
npm run migrate:dry-run
```

Expected on both dry-runs:

```text
Virtual files created: 24
Aggregate SHA-256: d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e
```

---

### Task 3: Implement local CLI guards before any network boundary

**Files:**

- Create: `scripts/lib/github-sharded-staging.mjs`
- Create: `tests/github-sharded-staging.test.mjs`

**Interfaces:**

- Produces:

```js
STAGING_PROJECT
parseStagingArgs(argv, env)
createGithubShardedStagingMigration(dependencies)
sanitizeMigrationError(error)
```

- [ ] **Step 1: Add table-driven failing validation tests**

Cover missing/duplicate/unknown flags, absent `--execute`, wrong confirmation text, missing `GH_TOKEN`, token-looking CLI flags, invalid source/hash lengths, and invalid branch names.

Use a sentinel fetch:

```js
let fetchCalls = 0;
const fetchImpl = async () => {
  fetchCalls += 1;
  throw new Error('fetch must not run');
};
```

After every invalid case assert `fetchCalls === 0`.

Valid arguments are exactly:

```js
[
  '--execute',
  '--confirm', 'STAGE_24_SHARDS',
  '--expected-source-sha', '39c396e59ff6324afb52d5335866f16411f33ae3',
  '--expected-aggregate-sha256', 'd5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e',
  '--staging-branch', 'codex/phase-b4-shards-20260715T090000Z-39c396e',
]
```

- [ ] **Step 2: Run RED**

```powershell
node --test tests/github-sharded-staging.test.mjs
```

Expected: module-not-found or missing-export failure.

- [ ] **Step 3: Implement constants and parser**

Use this exact project configuration:

```js
export const STAGING_PROJECT = Object.freeze({
  owner: 'dutuanan96',
  repo: 'bom-viewer-sync',
  sourceBranch: 'main',
  dataJsPath: 'bom-viewer-sync/data.js',
  shardRoot: 'bom-viewer-sync/data',
  stagingBranchPattern: /^codex\/phase-b4-shards-\d{8}T\d{6}Z-[0-9a-f]{7}$/,
  expectedShardCount: 24,
});

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const CONFIRMATION = 'STAGE_24_SHARDS';
```

Define safe migration errors without raw causes:

```js
function migrationError(code, message, metadata = {}) {
  const error = new Error(message);
  error.name = 'GithubShardedStagingError';
  error.code = code;
  Object.assign(error, metadata);
  return error;
}

export function sanitizeMigrationError(error) {
  return Object.fromEntries(Object.entries({
    name: error?.name || 'Error',
    code: error?.code || 'STAGING_MIGRATION_FAILED',
    message: String(error?.message || 'Staging migration failed'),
    status: error?.status,
    endpoint: error?.endpoint,
    mutationStage: error?.mutationStage,
    branchCreated: error?.branchCreated,
    stagingBranch: error?.stagingBranch,
  }).filter(([, value]) => value !== undefined));
}
```

The parser must:

1. Reject any argument not in the exact allowed set.
2. Reject duplicates.
3. Require `--execute` and exact confirmation before reading `env.GH_TOKEN`.
4. Require `stagingBranch.endsWith(expectedSourceSha.slice(0, 7))`.
5. Return `{ token, expectedSourceSha, expectedAggregateSha256, stagingBranch }`.
6. Never include `token` in an error message or returned printable summary.

- [ ] **Step 4: Run GREEN**

```powershell
node --test tests/github-sharded-staging.test.mjs
```

Expected: all parser/zero-network cases pass.

---

### Task 4: Implement exact-SHA Git ref/tree/blob reads and one-time branch creation

**Files:**

- Modify: `scripts/lib/github-sharded-staging.mjs`
- Modify: `tests/github-sharded-staging.test.mjs`

**Interfaces:**

- Internal helpers:

```js
githubJson(url, options, token)
readRef(branch, token)
readCommitTree(commitSha, token)
readRecursiveTree(treeSha, token)
readBlob(blobSha, token)
readSnapshot(commitSha, token)
readLogicalShardFiles(snapshot, token)
assertBranchMissing(branch, token)
createBranch(branch, sourceSha, token)
```

`readSnapshot()` returns this exact internal shape:

```js
{
  commitSha,
  treeSha,
  dataJsBlobSha,
  dataJsSource,
  entriesByPath,
}
```

`entriesByPath` is a `Map<string, { path, type, mode, sha }>` built from a non-truncated recursive tree. `readLogicalShardFiles()` requires the exact expected paths under `STAGING_PROJECT.shardRoot`, rejects missing and unexpected paths under that root, fetches each blob by its SHA, and returns a logical `Map` whose keys omit the root prefix.

- [ ] **Step 1: Add failing route-aware tests**

Test these pre-mutation sequences and stop points:

- source ref SHA mismatch: only source ref GET occurs;
- malformed source ref/commit/tree/blob: stop at the malformed response;
- recursive tree `truncated: true`: stop before blob read;
- missing or duplicate `bom-viewer-sync/data.js`: stop before branch lookup;
- target ref returns 200: report already exists and perform no POST;
- target lookup returns non-404 error: perform no POST;
- target 404 then branch creation POST body is exact;
- malformed create-ref response does not claim confirmed branch creation;
- every error repeats the fake token twice and the thrown message/stack contains zero token occurrences.

Mocks must assert method, URL, headers, and request body at each step.

- [ ] **Step 2: Run RED**

```powershell
node --test tests/github-sharded-staging.test.mjs
```

Expected: first new route test fails because GitHub operations are not implemented.

- [ ] **Step 3: Implement validated GitHub helpers**

Use Git Data API endpoints only:

```js
const apiBase = `https://api.github.com/repos/${STAGING_PROJECT.owner}/${STAGING_PROJECT.repo}`;
```

Every successful response must validate its schema. A recursive tree is valid only when `truncated === false`, `tree` is an array, every consumed entry has a safe full SHA, and exactly one entry matches the requested path/type.

Decode blobs only when:

```js
data.encoding === 'base64'
typeof data.content === 'string'
SHA_PATTERN.test(data.sha)
```

Use `decodeBase64Utf8()` from `src/infrastructure/github-data.js`.

Branch creation request must be:

```js
{
  method: 'POST',
  headers,
  body: JSON.stringify({
    ref: `refs/heads/${stagingBranch}`,
    sha: expectedSourceSha,
  }),
}
```

Do not implement DELETE, retry, or recovery mutation.

- [ ] **Step 4: Run GREEN and inspect call ordering**

```powershell
node --test tests/github-sharded-staging.test.mjs
```

Expected: all pre-mutation and branch-create tests pass.

---

### Task 5: Orchestrate atomic write and full remote readback verification

**Files:**

- Modify: `scripts/lib/github-sharded-staging.mjs`
- Modify: `tests/github-sharded-staging.test.mjs`

**Interfaces:**

```js
const migration = createGithubShardedStagingMigration({ fetchImpl, writerFactory });
const result = await migration.run({
  token,
  expectedSourceSha,
  expectedAggregateSha256,
  stagingBranch,
});
```

- [ ] **Step 1: Add a failing happy-path orchestration test**

Inject a writer factory stub that captures its config/input and returns a full staging commit SHA. Assert:

```js
assert.equal(writerConfig.shardRoot, 'bom-viewer-sync/data');
assert.equal(writerConfig.branch, stagingBranch);
assert.equal(Object.keys(writerInput.files).length, 24);
assert.equal(writerInput.expectedHeadSha, expectedSourceSha);
assert.equal(writerInput.message, 'chore: stage 24 sharded BOM files');
assert.ok(Object.keys(writerInput.files).every((path) => path.startsWith('bom-viewer-sync/data/')));
```

The readback mock must return the exact 24 remote blobs. Assert the final result shape from the design spec and that it does not contain the token.

- [ ] **Step 2: Add failing mutation-boundary tests**

Cover:

- computed shard count is not 24: no target branch lookup;
- computed aggregate hash mismatch: no target branch lookup;
- local round-trip failure: no target branch lookup;
- writer failure after confirmed branch creation: error includes `mutationStage: 'branch-created'`, no retry/DELETE;
- writer conflict: preserves `GithubDataConflictError`, no retry/DELETE;
- staging ref does not equal writer commit: verification fails;
- remote tree misses/adds a shard under the shard root: verification fails;
- staging `data.js` blob differs from source: verification fails;
- remote aggregate hash differs: verification fails;
- remote round-trip differs: verification fails;
- final `main` ref differs from expected source SHA: verification fails with `mainUnchanged: false`;
- success has exactly one branch-creation POST and delegates exactly one non-force writer run.

- [ ] **Step 3: Run RED**

```powershell
node --test tests/github-sharded-staging.test.mjs
```

Expected: orchestration test fails before the writer stub is called.

- [ ] **Step 4: Implement `run()` in this exact order**

```js
const sourceRef = await readRef(STAGING_PROJECT.sourceBranch, token);
if (sourceRef.sha !== expectedSourceSha) throw migrationError('SOURCE_HEAD_MISMATCH', 'Source HEAD changed');

const sourceSnapshot = await readSnapshot(expectedSourceSha, token);
const sourcePayload = parseDataJsPayload(sourceSnapshot.dataJsSource);
const logicalFiles = buildLogicalShardFiles(sourcePayload);
await verifyLogicalShardRoundTrip(sourcePayload, logicalFiles);

if (logicalFiles.size !== STAGING_PROJECT.expectedShardCount) {
  throw migrationError('SHARD_COUNT_MISMATCH', `Expected 24 shards but found ${logicalFiles.size}`);
}
const aggregateSha256 = computeShardAggregateHash(logicalFiles);
if (aggregateSha256 !== expectedAggregateSha256) {
  throw migrationError('AGGREGATE_HASH_MISMATCH', 'Logical shard aggregate hash changed');
}

await assertBranchMissing(stagingBranch, token);
await createBranch(stagingBranch, expectedSourceSha, token);

const writer = writerFactory({
  config: {
    owner: STAGING_PROJECT.owner,
    repo: STAGING_PROJECT.repo,
    branch: stagingBranch,
    shardRoot: STAGING_PROJECT.shardRoot,
  },
  fetchImpl,
});

const writeResult = await writer.writeFiles({
  token,
  files: toRepositoryShardFiles(logicalFiles, STAGING_PROJECT.shardRoot),
  message: 'chore: stage 24 sharded BOM files',
  expectedHeadSha: expectedSourceSha,
});

const remoteSnapshot = await readSnapshot(writeResult.commitSha, token);
if (remoteSnapshot.dataJsBlobSha !== sourceSnapshot.dataJsBlobSha) {
  throw migrationError('DATA_JS_CHANGED', 'data.js changed on the staging branch');
}
const remoteLogicalFiles = await readLogicalShardFiles(remoteSnapshot, token);
if (computeShardAggregateHash(remoteLogicalFiles) !== aggregateSha256) {
  throw migrationError('REMOTE_HASH_MISMATCH', 'Remote shard aggregate hash differs');
}
await verifyLogicalShardRoundTrip(sourcePayload, remoteLogicalFiles);
assert.deepEqual(remoteLogicalFiles, logicalFiles);

const finalMainRef = await readRef(STAGING_PROJECT.sourceBranch, token);
if (finalMainRef.sha !== expectedSourceSha) {
  throw migrationError('MAIN_MOVED_DURING_RUN', 'main changed during staging verification');
}
```

Wrap errors only to add safe fields (`code`, `status`, `endpoint`, `mutationStage`, `branchCreated`, `stagingBranch`). Recreate sanitized errors if token text appears in message, stack, or cause. Never retain the raw cause.

- [ ] **Step 5: Run the complete focused suite**

```powershell
node --test tests/github-git-data.test.mjs tests/sharded-files.test.mjs tests/github-sharded-staging.test.mjs
```

Expected: all focused tests pass with zero real network calls.

---

### Task 6: Add the CLI wrapper, package command, and execution-state documentation

**Files:**

- Create: `scripts/migrate-data-staging.mjs`
- Modify: `package.json`
- Modify: `AI_DEBUG_GUIDE.md`
- Modify: `HANDOVER.md`
- Modify: `PROJECT_CONTEXT.md`
- Modify: `REVIEW_CONTEXT.md`
- Modify: `README_SYNC.md`

**Interfaces:**

- Produces command: `npm run migrate:staging -- <required flags>`.

- [ ] **Step 1: Implement the thin wrapper**

Use this entry pattern:

```js
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createGithubShardedStagingMigration,
  parseStagingArgs,
  sanitizeMigrationError,
} from './lib/github-sharded-staging.mjs';

export async function run(argv = process.argv.slice(2), env = process.env) {
  const input = parseStagingArgs(argv, env);
  const migration = createGithubShardedStagingMigration();
  const result = await migration.run(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entryUrl === import.meta.url) {
  run().catch((error) => {
    process.stderr.write(`${JSON.stringify(sanitizeMigrationError(error), null, 2)}\n`);
    process.exitCode = 1;
  });
}
```

Add to `package.json`:

```json
"migrate:staging": "node scripts/migrate-data-staging.mjs"
```

- [ ] **Step 2: Prove the CLI refuses accidental execution**

Run with `GH_TOKEN` absent:

```powershell
Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
npm run migrate:staging
```

Expected: non-zero exit, safe JSON error, no network request, no stack/token/data output.

Do not run the command with `--execute` outside mocked tests.

- [ ] **Step 3: Update all five context documents**

State exactly:

- Phase B.4 implementation exists locally/on its feature branch but has not executed a remote staging write.
- The approved execution target is a one-time branch matching the required pattern.
- `main`, `data.js`, runtime save/read behavior, `outputs/`, and Desktop remain unchanged.
- Real execution requires independent review plus the exact source SHA/hash/branch command.
- On failure after branch creation, leave the branch and orphan Git objects intact for inspection.

Do not hard-code a new total test count in documentation.

- [ ] **Step 4: Run final verification**

Run every command fresh:

```powershell
npm run build
npm run check
npm run migrate:dry-run
npm run migrate:dry-run
node --check scripts/migrate-data-staging.mjs
node --check scripts/lib/github-sharded-staging.mjs
node --check scripts/lib/sharded-files.mjs
node --check src/infrastructure/github-git-data.js
node --check app-admin.js
git diff --check
git diff origin/main -- data.js
Test-Path data
rg -n "github-sharded-staging|createGithubGitDataWriter" src admin.html app-admin.js viewer.html
git status --short
git diff --stat origin/main
```

Required evidence:

- all tests pass with exact count reported from command output;
- audit has 0 errors and 0 warnings;
- both dry-runs report 24 files and identical aggregate hash `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`;
- `git diff origin/main -- data.js` is empty;
- `Test-Path data` is `False`;
- runtime search shows no application/generated-bundle import of the staging module or writer;
- no remote branch was created and no request escaped mocks.

- [ ] **Step 5: Self-review against the design**

Check every safety invariant and failure row in `docs/superpowers/specs/2026-07-15-phase-b4-staging-migration-design.md`. If any invariant lacks a named test, add that test before reporting completion.

Stop after the report. Do not commit, push, open a PR, merge, or run the real command without a new explicit instruction.

---

## Antigravity completion response contract

The implementation response must contain these sections in this order:

1. **Outcome** — one paragraph stating what is implemented and explicitly stating that no real staging write occurred.
2. **Files changed** — repo-relative paths and one-line responsibilities.
3. **TDD evidence** — the first meaningful RED failure and the corresponding GREEN result.
4. **Verification** — exact commands, exit codes, final test count, audit counts, both aggregate hashes, and `data.js` hash/diff evidence.
5. **Safety proof** — show zero DELETE routes, no `force: true`, no runtime import, target branch nonexistence requirement, and token-redaction coverage.
6. **Diff review** — `git diff --stat`, `git status --short`, and confirmation that only planned files changed.
7. **Proposed execution command** — exact PowerShell command with token represented only as an environment placeholder; do not execute it.
8. **Stop point** — explicitly request independent review and operator approval before remote execution.

Do not use phrases such as “should pass”, “probably”, or “ready” without fresh command evidence.
