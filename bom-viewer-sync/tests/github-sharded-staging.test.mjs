import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGING_PROJECT,
  parseStagingArgs,
  sanitizeMigrationError,
  createGithubShardedStagingMigration,
} from '../scripts/lib/github-sharded-staging.mjs';
import { buildLogicalShardFiles, computeShardAggregateHash } from '../scripts/lib/sharded-files.mjs';
import { normalizePayload } from '../src/infrastructure/github-data.js';
import { createGithubGitDataWriter } from '../src/infrastructure/github-git-data.js';
import { run as cliRun } from '../scripts/migrate-data-staging.mjs';

function createValidPayloadAndHash() {
  const payloadObj = { bom: {}, materialDb: { materials: {}, bomEntries: [] }, notifications: [] };
  for (let i = 0; i < 22; i++) {
    payloadObj.bom[`product-${i}`] = { revision: 1, properties: {}, elements: [] };
  }
  const sourcePayloadBase64 = Buffer.from(`window.BOM_VIEWER_DATA = ${JSON.stringify(payloadObj)};`).toString('base64');
  const normalized = normalizePayload(payloadObj);
  const logicalFiles = buildLogicalShardFiles(normalized);
  const hash = computeShardAggregateHash(logicalFiles);
  return { sourcePayloadBase64, expectedHash: hash, logicalFiles };
}

function createMockFetch(steps) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const step = steps[calls.length];
    calls.push({ url, method: options.method || 'GET', headers: options.headers, body: options.body });
    if (!step) throw new Error(`Unexpected fetch call ${calls.length - 1}: ${url}`);
    if (step.networkError) throw step.networkError;
    return {
      ok: step.ok !== false,
      status: step.status ?? 200,
      json: step.malformedJson ? async () => { throw new Error('parse error') } : async () => step.json,
    };
  };
  return { fetchImpl, calls };
}

const input = {
  token: 'fake-token-value-fake-token-value',
  expectedSourceSha: '39c396e59ff6324afb52d5335866f16411f33ae3',
  expectedAggregateSha256: 'd5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e',
  stagingBranch: 'codex/phase-b4-shards-20260715T090000Z-39c396e',
};
const apiBase = `https://api.github.com/repos/${STAGING_PROJECT.owner}/${STAGING_PROJECT.repo}`;

test('parseStagingArgs rejects invalid inputs without network calls', () => {
  const validArgv = [
    '--execute', '--confirm', 'STAGE_24_SHARDS',
    '--expected-source-sha', '39c396e59ff6324afb52d5335866f16411f33ae3',
    '--expected-aggregate-sha256', 'd5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e',
    '--staging-branch', 'codex/phase-b4-shards-20260715T090000Z-39c396e',
  ];
  const validEnv = { GH_TOKEN: 'fake-token' };

  const invalidCases = [
    { argv: validArgv.filter(x => x !== '--execute'), env: validEnv, pattern: /execute/i },
    { argv: validArgv, env: {}, pattern: /token/i },
    { argv: validArgv.map(x => x === '39c396e59ff6324afb52d5335866f16411f33ae3' ? '123' : x), env: validEnv, pattern: /sha/i },
    { argv: validArgv.map(x => x === 'd5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e' ? '123' : x), env: validEnv, pattern: /sha256/i },
    { argv: validArgv.map(x => x === 'codex/phase-b4-shards-20260715T090000Z-39c396e' ? 'main' : x), env: validEnv, pattern: /branch/i },
    { argv: validArgv.map(x => x === 'codex/phase-b4-shards-20260715T090000Z-39c396e' ? 'codex/phase-b4-shards-20260715T090000Z-1111111' : x), env: validEnv, pattern: /branch/i },
  ];

  for (const { argv, env, pattern } of invalidCases) {
    assert.throws(() => parseStagingArgs(argv, env), pattern);
  }
});

test('migration.run validates inputs immediately (zero I/O)', async () => {
  const migration = createGithubShardedStagingMigration({ fetchImpl: async () => { throw new Error('should not fetch') } });
  await assert.rejects(migration.run({ ...input, token: '' }), (err) => err.code === 'MISSING_TOKEN');
  await assert.rejects(migration.run({ ...input, expectedSourceSha: 'bad' }), (err) => err.code === 'INVALID_SHA');
  await assert.rejects(migration.run({ ...input, expectedAggregateSha256: 'bad' }), (err) => err.code === 'INVALID_HASH');
  await assert.rejects(migration.run({ ...input, stagingBranch: 'bad' }), (err) => err.code === 'INVALID_BRANCH');
  await assert.rejects(migration.run({ ...input, stagingBranch: 'codex/phase-b4-shards-20260715T090000Z-0000000' }), (err) => err.code === 'BRANCH_SHA_MISMATCH');
});

test('malformed JSON response throws MALFORMED_JSON', async () => {
  const { fetchImpl } = createMockFetch([{ malformedJson: true }]);
  const migration = createGithubShardedStagingMigration({ fetchImpl });
  await assert.rejects(migration.run(input), (err) => err.code === 'MALFORMED_JSON');
});

test('wrong exact ref throws INVALID_REF', async () => {
  const { fetchImpl } = createMockFetch([
    { json: { ref: 'refs/heads/wrong', object: { type: 'commit', sha: input.expectedSourceSha } } }
  ]);
  const migration = createGithubShardedStagingMigration({ fetchImpl });
  await assert.rejects(migration.run(input), (err) => err.code === 'INVALID_REF');
});

test('invalid object type throws INVALID_REF', async () => {
  const { fetchImpl } = createMockFetch([
    { json: { ref: 'refs/heads/main', object: { type: 'tree', sha: input.expectedSourceSha } } }
  ]);
  const migration = createGithubShardedStagingMigration({ fetchImpl });
  await assert.rejects(migration.run(input), (err) => err.code === 'INVALID_REF');
});

test('wrong exact commit SHA throws INVALID_COMMIT', async () => {
  const { fetchImpl } = createMockFetch([
    { json: { ref: 'refs/heads/main', object: { type: 'commit', sha: input.expectedSourceSha } } },
    { json: { sha: 'different' } }
  ]);
  const migration = createGithubShardedStagingMigration({ fetchImpl });
  await assert.rejects(migration.run(input), (err) => err.code === 'INVALID_COMMIT');
});

test('duplicate tree path throws DUPLICATE_TREE_PATH', async () => {
  const { fetchImpl } = createMockFetch([
    { json: { ref: 'refs/heads/main', object: { type: 'commit', sha: input.expectedSourceSha } } },
    { json: { sha: input.expectedSourceSha, tree: { sha: input.expectedSourceSha } } },
    { json: { sha: input.expectedSourceSha, truncated: false, tree: [
      { path: 'a.js', type: 'blob', sha: input.expectedSourceSha },
      { path: 'a.js', type: 'blob', sha: input.expectedSourceSha }
    ]} }
  ]);
  const migration = createGithubShardedStagingMigration({ fetchImpl });
  await assert.rejects(migration.run(input), (err) => err.code === 'DUPLICATE_TREE_PATH');
});

test('target returning 200 stops before POST (BRANCH_EXISTS)', async () => {
  const { sourcePayloadBase64, expectedHash } = createValidPayloadAndHash();
  const testInput = { ...input, expectedAggregateSha256: expectedHash };
  const { fetchImpl, calls } = createMockFetch([
    { json: { ref: 'refs/heads/main', object: { type: 'commit', sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, tree: { sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, truncated: false, tree: [{ path: 'bom-viewer-sync/data.js', type: 'blob', sha: testInput.expectedSourceSha }] } },
    { json: { sha: testInput.expectedSourceSha, encoding: 'base64', content: sourcePayloadBase64 } },
    { ok: true, status: 200, json: { ref: `refs/heads/${testInput.stagingBranch}` } }
  ]);
  const migration = createGithubShardedStagingMigration({ fetchImpl });
  await assert.rejects(migration.run(testInput), (err) => err.code === 'BRANCH_EXISTS');
});

test('target non-404 error stops before POST (GITHUB_API_ERROR)', async () => {
  const { sourcePayloadBase64, expectedHash } = createValidPayloadAndHash();
  const testInput = { ...input, expectedAggregateSha256: expectedHash };
  const { fetchImpl, calls } = createMockFetch([
    { json: { ref: 'refs/heads/main', object: { type: 'commit', sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, tree: { sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, truncated: false, tree: [{ path: 'bom-viewer-sync/data.js', type: 'blob', sha: testInput.expectedSourceSha }] } },
    { json: { sha: testInput.expectedSourceSha, encoding: 'base64', content: sourcePayloadBase64 } },
    { ok: false, status: 403, json: { message: 'Forbidden' } }
  ]);
  const migration = createGithubShardedStagingMigration({ fetchImpl });
  await assert.rejects(migration.run(testInput), (err) => err.code === 'GITHUB_API_ERROR');
});

test('create-ref returning non-2xx throws and leaves branchCreated=false, mutationStage=branch-create-uncertain', async () => {
  const { sourcePayloadBase64, expectedHash } = createValidPayloadAndHash();
  const testInput = { ...input, expectedAggregateSha256: expectedHash };
  const baseMocks = [
    { json: { ref: 'refs/heads/main', object: { type: 'commit', sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, tree: { sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, truncated: false, tree: [{ path: 'bom-viewer-sync/data.js', type: 'blob', sha: testInput.expectedSourceSha }] } },
    { json: { sha: testInput.expectedSourceSha, encoding: 'base64', content: sourcePayloadBase64 } },
    { ok: false, status: 404, json: { message: 'Not Found' } } // branch missing check
  ];

  // Test 403
  let migration = createGithubShardedStagingMigration({ fetchImpl: createMockFetch([...baseMocks, { ok: false, status: 403, json: { message: 'Forbidden' } }]).fetchImpl });
  try {
    await migration.run(testInput);
    assert.fail('should throw');
  } catch (error) {
    assert.equal(error.code, 'GITHUB_API_ERROR');
    assert.ok(!error.branchCreated); // Should be falsy
    assert.equal(error.mutationStage, 'branch-create-uncertain');
  }

  // Test 500
  migration = createGithubShardedStagingMigration({ fetchImpl: createMockFetch([...baseMocks, { ok: false, status: 500, json: { message: 'Internal Server Error' } }]).fetchImpl });
  try {
    await migration.run(testInput);
    assert.fail('should throw');
  } catch (error) {
    assert.equal(error.code, 'GITHUB_API_ERROR');
    assert.ok(!error.branchCreated);
    assert.equal(error.mutationStage, 'branch-create-uncertain');
  }

  // Test timeout (network error)
  migration = createGithubShardedStagingMigration({ fetchImpl: createMockFetch([...baseMocks, { networkError: new Error('fetch timeout') }]).fetchImpl });
  try {
    await migration.run(testInput);
    assert.fail('should throw');
  } catch (error) {
    assert.equal(error.message, 'fetch timeout');
    assert.ok(!error.branchCreated);
    assert.equal(error.mutationStage, 'branch-create-uncertain');
  }

  // Test malformed 201
  migration = createGithubShardedStagingMigration({ fetchImpl: createMockFetch([...baseMocks, { ok: true, status: 201, json: { ref: 'refs/heads/WRONG' } }]).fetchImpl });
  try {
    await migration.run(testInput);
    assert.fail('should throw');
  } catch (error) {
    assert.equal(error.code, 'BRANCH_CREATE_FAILED');
    assert.ok(!error.branchCreated);
    assert.equal(error.mutationStage, 'branch-create-uncertain');
  }
});

test('shard count mismatch before mutation', async () => {
  const { sourcePayloadBase64, expectedHash } = createValidPayloadAndHash();
  const testInput = { ...input, expectedAggregateSha256: expectedHash };
  // Mess up data to have different shards
  // By removing a product from the original string
  const badSource = sourcePayloadBase64.replace('"product-0":{"revision":1,"properties":{},"elements":[]},', '');
  const { fetchImpl } = createMockFetch([
    { json: { ref: 'refs/heads/main', object: { type: 'commit', sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, tree: { sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, truncated: false, tree: [{ path: 'bom-viewer-sync/data.js', type: 'blob', sha: testInput.expectedSourceSha }] } },
    { json: { sha: testInput.expectedSourceSha, encoding: 'base64', content: Buffer.from(Buffer.from(badSource, 'base64').toString().replace('"product-0":{"revision":1,"properties":{},"elements":[]},', '')).toString('base64') } },
  ]);
  const migration = createGithubShardedStagingMigration({ fetchImpl });
  await assert.rejects(migration.run(testInput), (err) => err.code === 'SHARD_COUNT_MISMATCH');
});

test('writer failure preserves branchCreated=true and does no retries', async () => {
  const { sourcePayloadBase64, expectedHash } = createValidPayloadAndHash();
  const testInput = { ...input, expectedAggregateSha256: expectedHash };
  const { fetchImpl, calls } = createMockFetch([
    { json: { ref: 'refs/heads/main', object: { type: 'commit', sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, tree: { sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, truncated: false, tree: [{ path: 'bom-viewer-sync/data.js', type: 'blob', sha: testInput.expectedSourceSha }] } },
    { json: { sha: testInput.expectedSourceSha, encoding: 'base64', content: sourcePayloadBase64 } },
    { ok: false, status: 404, json: { message: 'Not Found' } },
    { ok: true, status: 201, json: { ref: `refs/heads/${testInput.stagingBranch}`, object: { type: 'commit', sha: testInput.expectedSourceSha } } }
  ]);
  const writerFactory = () => ({
    writeFiles: async () => {
      const err = new Error('conflict');
      err.code = 'GithubDataConflictError';
      throw err;
    }
  });
  const migration = createGithubShardedStagingMigration({ fetchImpl, writerFactory });

  try {
    await migration.run(testInput);
    assert.fail('should throw');
  } catch (error) {
    assert.equal(error.code, 'GithubDataConflictError');
    assert.equal(error.branchCreated, true);
    assert.equal(error.mutationStage, 'writer');
  }
});

test('staging ref mismatch after writer throws STAGING_REF_MISMATCH', async () => {
  const { sourcePayloadBase64, expectedHash } = createValidPayloadAndHash();
  const testInput = { ...input, expectedAggregateSha256: expectedHash };
  const mockWriterSha = '3333333333333333333333333333333333333333';
  const { fetchImpl } = createMockFetch([
    { json: { ref: 'refs/heads/main', object: { type: 'commit', sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, tree: { sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, truncated: false, tree: [{ path: 'bom-viewer-sync/data.js', type: 'blob', sha: testInput.expectedSourceSha }] } },
    { json: { sha: testInput.expectedSourceSha, encoding: 'base64', content: sourcePayloadBase64 } },
    { ok: false, status: 404, json: { message: 'Not Found' } },
    { ok: true, status: 201, json: { ref: `refs/heads/${testInput.stagingBranch}`, object: { type: 'commit', sha: testInput.expectedSourceSha } } },
    // Staging ref fetch (returns wrong sha)
    { json: { ref: `refs/heads/${testInput.stagingBranch}`, object: { type: 'commit', sha: '1111111111111111111111111111111111111111' } } }
  ]);
  const writerFactory = () => ({ writeFiles: async () => ({ commitSha: mockWriterSha }) });
  const migration = createGithubShardedStagingMigration({ fetchImpl, writerFactory });
  await assert.rejects(migration.run(testInput), (err) => err.code === 'STAGING_REF_MISMATCH');
});

test('main moved final step throws MAIN_MOVED_DURING_RUN', async () => {
  const { sourcePayloadBase64, expectedHash, logicalFiles } = createValidPayloadAndHash();
  const testInput = { ...input, expectedAggregateSha256: expectedHash };
  const mockWriterSha = '3333333333333333333333333333333333333333';

  const steps = [
    { json: { ref: 'refs/heads/main', object: { type: 'commit', sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, tree: { sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, truncated: false, tree: [{ path: 'bom-viewer-sync/data.js', type: 'blob', sha: testInput.expectedSourceSha }] } },
    { json: { sha: testInput.expectedSourceSha, encoding: 'base64', content: sourcePayloadBase64 } },
    { ok: false, status: 404, json: { message: 'Not Found' } },
    { ok: true, status: 201, json: { ref: `refs/heads/${testInput.stagingBranch}`, object: { type: 'commit', sha: testInput.expectedSourceSha } } },
    { json: { ref: `refs/heads/${testInput.stagingBranch}`, object: { type: 'commit', sha: mockWriterSha } } },
    { json: { sha: mockWriterSha, tree: { sha: mockWriterSha } } },
    { json: { sha: mockWriterSha, truncated: false, tree: [
        { path: 'bom-viewer-sync/data.js', type: 'blob', sha: testInput.expectedSourceSha },
        { path: 'bom-viewer-sync/data/manifest.json', type: 'blob', sha: testInput.expectedSourceSha },
        { path: 'bom-viewer-sync/data/materials.json', type: 'blob', sha: testInput.expectedSourceSha },
        ...Array.from({length: 22}).map((_, i) => ({ path: `bom-viewer-sync/data/products/product-${i}.json`, type: 'blob', sha: testInput.expectedSourceSha }))
      ] } },
    { json: { sha: testInput.expectedSourceSha, encoding: 'base64', content: sourcePayloadBase64 } }
  ];
  for (const entry of [
    { path: 'manifest.json' }, { path: 'materials.json' },
    ...Array.from({length: 22}).map((_, i) => ({ path: `products/product-${i}.json` }))
  ]) {
    const content = logicalFiles.get(entry.path);
    steps.push({ json: { sha: testInput.expectedSourceSha, encoding: 'base64', content: Buffer.from(content).toString('base64') } });
  }
  // main moved!
  steps.push({ json: { ref: 'refs/heads/main', object: { type: 'commit', sha: '1111111111111111111111111111111111111111' } } });

  const { fetchImpl } = createMockFetch(steps);
  const writerFactory = () => ({ writeFiles: async () => ({ commitSha: mockWriterSha }) });
  const migration = createGithubShardedStagingMigration({ fetchImpl, writerFactory });

  try {
    await migration.run(testInput);
    assert.fail('should throw');
  } catch (error) {
    assert.equal(error.code, 'MAIN_MOVED_DURING_RUN');
    assert.equal(error.mainUnchanged, false);
  }
});

test('token is redacted from all error fields', async () => {
  const err = new Error(`secret ${input.token} exposed`);
  err.cause = new Error(`cause ${input.token}`);
  err.stack = `stack ${input.token}`;

  const sanitized = sanitizeMigrationError(err, input.token);
  assert.ok(!sanitized.message.includes(input.token));
  assert.ok(!sanitized.stack); // stack not present
  assert.ok(!sanitized.cause); // cause stripped
});

import { execSync } from 'node:child_process';
test('CLI wrapper integration passes without executing real fetch', () => {
  try {
    execSync('node scripts/migrate-data-staging.mjs --execute --confirm STAGE_24_SHARDS --expected-source-sha 39c396e59ff6324afb52d5335866f16411f33ae3 --expected-aggregate-sha256 d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e --staging-branch codex/phase-b4-shards-20260715T090000Z-39c396e', { env: { ...process.env, GH_TOKEN: 'fake' }, stdio: 'pipe' });
    assert.fail('should exit 1');
  } catch (error) {
    const errOutput = error.stderr.toString();
    // It should fail with GITHUB_API_ERROR because token is fake
    assert.ok(errOutput.includes('GITHUB_API_ERROR') || errOutput.includes('Bad credentials') || errOutput.includes('Not Found') || errOutput.includes('fake'), errOutput);
  }
});

test('happy path orchestration succeeds and returns verified status object', async () => {
  const { sourcePayloadBase64, expectedHash, logicalFiles } = createValidPayloadAndHash();
  const testInput = { ...input, expectedAggregateSha256: expectedHash };

  const mockWriterSha = '3333333333333333333333333333333333333333';

  const steps = [
    { json: { ref: 'refs/heads/main', object: { type: 'commit', sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, tree: { sha: testInput.expectedSourceSha } } },
    { json: { sha: testInput.expectedSourceSha, truncated: false, tree: [{ path: 'bom-viewer-sync/data.js', type: 'blob', sha: testInput.expectedSourceSha }] } },
    { json: { sha: testInput.expectedSourceSha, encoding: 'base64', content: sourcePayloadBase64 } },
    { ok: false, status: 404, json: { message: 'Not Found' } },
    { ok: true, status: 201, json: { ref: `refs/heads/${testInput.stagingBranch}`, object: { type: 'commit', sha: testInput.expectedSourceSha } } },
    { json: { ref: `refs/heads/${testInput.stagingBranch}`, object: { type: 'commit', sha: mockWriterSha } } },
    { json: { sha: mockWriterSha, tree: { sha: mockWriterSha } } },
    { json: { sha: mockWriterSha, truncated: false, tree: [
        { path: 'bom-viewer-sync/data.js', type: 'blob', sha: testInput.expectedSourceSha },
        { path: 'bom-viewer-sync/data/manifest.json', type: 'blob', sha: testInput.expectedSourceSha },
        { path: 'bom-viewer-sync/data/materials.json', type: 'blob', sha: testInput.expectedSourceSha },
        ...Array.from({length: 22}).map((_, i) => ({ path: `bom-viewer-sync/data/products/product-${i}.json`, type: 'blob', sha: testInput.expectedSourceSha }))
      ] } },
    { json: { sha: testInput.expectedSourceSha, encoding: 'base64', content: sourcePayloadBase64 } }
  ];

  for (const entry of [
    { path: 'manifest.json' }, { path: 'materials.json' },
    ...Array.from({length: 22}).map((_, i) => ({ path: `products/product-${i}.json` }))
  ]) {
    const content = logicalFiles.get(entry.path);
    steps.push({ json: { sha: testInput.expectedSourceSha, encoding: 'base64', content: Buffer.from(content).toString('base64') } });
  }

  steps.push({ json: { ref: 'refs/heads/main', object: { type: 'commit', sha: testInput.expectedSourceSha } } });

  const { fetchImpl } = createMockFetch(steps);

  const writerFactory = () => ({
    writeFiles: async () => ({ commitSha: mockWriterSha })
  });

  const migration = createGithubShardedStagingMigration({ fetchImpl, writerFactory });
  const result = await migration.run(testInput);

  assert.equal(result.status, 'verified');
  assert.equal(result.shardCount, 24);
  assert.equal(result.stagingCommitSha, mockWriterSha);
  assert.equal(result.aggregateSha256, testInput.expectedAggregateSha256);
  assert.equal(result.dataJsUnchanged, true);
  assert.equal(result.roundTripEqual, true);
  assert.equal(result.mainUnchanged, true);
  assert.equal(result.compareUrl, `https://github.com/${STAGING_PROJECT.owner}/${STAGING_PROJECT.repo}/compare/${testInput.expectedSourceSha}...${testInput.stagingBranch}`);
});

test('real writer factory integration succeeds with full orchestrator mock', async () => {
  const { sourcePayloadBase64, expectedHash } = createValidPayloadAndHash();
  const testInput = { ...input, expectedAggregateSha256: expectedHash };

  const mockWriterSha = '2222222222222222222222222222222222222222';
  const newTreeSha = '3333333333333333333333333333333333333333';

  let currentRefSha = testInput.expectedSourceSha;
  let branchCreated = false;

  // mock state to hold blobs and trees
  const mockBlobs = new Map(); // sha -> content
  let postedTreeItems = [];

  // simple pseudo-hash generator for mock blobs
  const generateSha = (content) => {
    let hash = 0;
    for (let i = 0; i < content.length; i++) hash = Math.imul(31, hash) + content.charCodeAt(i);
    return 'b' + Math.abs(hash).toString(16).padStart(39, '0');
  };

  const fetchImpl = async (url, options) => {
    const parseBody = () => options?.body ? JSON.parse(options.body) : {};

    if (options?.method === 'POST') {
      if (url.endsWith('/git/blobs')) {
        const body = parseBody();
        const content = body.content;
        const sha = generateSha(content);
        mockBlobs.set(sha, content);
        return { ok: true, status: 201, json: async () => ({ sha }) };
      }
      if (url.endsWith('/git/trees')) {
        postedTreeItems = parseBody().tree;
        return { ok: true, status: 201, json: async () => ({ sha: newTreeSha }) };
      }
      if (url.endsWith('/git/commits')) {
        return { ok: true, status: 201, json: async () => ({ sha: mockWriterSha }) };
      }
      if (url.endsWith('/git/refs')) {
        branchCreated = true;
        currentRefSha = testInput.expectedSourceSha;
        return { ok: true, status: 201, json: async () => ({ ref: `refs/heads/${testInput.stagingBranch}`, object: { type: 'commit', sha: testInput.expectedSourceSha } }) };
      }
    }

    if (options?.method === 'PATCH' && url.endsWith(`/git/refs/heads/${testInput.stagingBranch}`)) {
      currentRefSha = mockWriterSha;
      return { ok: true, status: 200, json: async () => ({ ref: `refs/heads/${testInput.stagingBranch}`, object: { type: 'commit', sha: mockWriterSha } }) };
    }

    if (options?.method === 'GET' || !options?.method) {
      if (url.endsWith('/git/ref/heads/main')) {
        return { ok: true, status: 200, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha: testInput.expectedSourceSha } }) };
      }
      if (url.endsWith(`/git/commits/${testInput.expectedSourceSha}`)) {
        return { ok: true, status: 200, json: async () => ({ sha: testInput.expectedSourceSha, tree: { sha: testInput.expectedSourceSha } }) };
      }
      if (url.endsWith(`/git/trees/${testInput.expectedSourceSha}?recursive=1`)) {
        return { ok: true, status: 200, json: async () => ({ sha: testInput.expectedSourceSha, truncated: false, tree: [{ path: 'bom-viewer-sync/data.js', type: 'blob', sha: testInput.expectedSourceSha }] }) };
      }
      if (url.endsWith(`/git/blobs/${testInput.expectedSourceSha}`)) {
        return { ok: true, status: 200, json: async () => ({ sha: testInput.expectedSourceSha, encoding: 'base64', content: sourcePayloadBase64 }) };
      }

      // Staging branch ref request
      if (url.endsWith(`/git/ref/heads/${testInput.stagingBranch}`)) {
        if (!branchCreated) return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) };
        return { ok: true, status: 200, json: async () => ({ ref: `refs/heads/${testInput.stagingBranch}`, object: { type: 'commit', sha: currentRefSha } }) };
      }

      // Verification stage requests for Writer's commit
      if (url.endsWith(`/git/commits/${mockWriterSha}`)) {
        return { ok: true, status: 200, json: async () => ({ sha: mockWriterSha, tree: { sha: newTreeSha } }) };
      }
      if (url.endsWith(`/git/trees/${newTreeSha}?recursive=1`)) {
        return { ok: true, status: 200, json: async () => ({ sha: newTreeSha, truncated: false, tree: [{ path: 'bom-viewer-sync/data.js', type: 'blob', sha: testInput.expectedSourceSha }, ...postedTreeItems] }) };
      }
      if (url.includes('/git/blobs/')) {
        const shaMatch = url.match(/\/git\/blobs\/(.+)$/);
        if (shaMatch && mockBlobs.has(shaMatch[1])) {
           return { ok: true, status: 200, json: async () => ({ sha: shaMatch[1], encoding: 'base64', content: mockBlobs.get(shaMatch[1]) }) };
        }
      }
    }

    throw new Error(`Unhandled mock fetch: ${options?.method || 'GET'} ${url}`);
  };

  const writerFactory = ({ config, fetchImpl }) => createGithubGitDataWriter({ config, fetchImpl });
  const migration = createGithubShardedStagingMigration({ fetchImpl, writerFactory });

  const result = await migration.run(testInput);

  assert.equal(result.status, 'verified');
  assert.equal(result.shardCount, 24);
  assert.equal(result.stagingCommitSha, mockWriterSha);
});
