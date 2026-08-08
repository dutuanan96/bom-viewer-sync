import test from 'node:test';
import assert from 'node:assert/strict';
import { createGithubGitDataWriter, GithubDataConflictError } from '../src/infrastructure/github-git-data.js';

const SHA = {
  head: '1111111111111111111111111111111111111111',
  otherHead: '2222222222222222222222222222222222222222',
  baseTree: '3333333333333333333333333333333333333333',
  manifestBlob: '4444444444444444444444444444444444444444',
  materialsBlob: '5555555555555555555555555555555555555555',
  tree: '6666666666666666666666666666666666666666',
  commit: '7777777777777777777777777777777777777777',
};
const VALID_CONFIG = { owner: 'test-owner', repo: 'test-repo', branch: 'feature/phase-b3' };
const VALID_TOKEN = 'test-token-value';
const API_BASE = 'https://api.github.com/repos/test-owner/test-repo';
const REF_NAME = 'refs/heads/feature/phase-b3';
const VALID_FILES = { 'data/manifest.json': '{"version":3}' };
const VALID_ARGS = {
  token: VALID_TOKEN,
  files: VALID_FILES,
  message: 'test: update shards',
  expectedHeadSha: SHA.head,
};

function createMockFetch(steps) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const step = steps[calls.length];
    const call = {
      url,
      method: options.method || 'GET',
      cache: options.cache,
      headers: options.headers,
      body: options.body,
    };
    calls.push(call);

    if (!step) throw new Error(`Unexpected fetch call ${calls.length - 1}: ${url}`);
    if (step.method) assert.equal(call.method, step.method);
    if (step.url) assert.equal(call.url, step.url);
    step.assertRequest?.(call);
    if (step.networkError) throw step.networkError;

    return {
      ok: step.ok !== false,
      status: step.status ?? 200,
      json: async () => {
        if (step.jsonError) throw step.jsonError;
        return step.json;
      },
    };
  };
  return { fetchImpl, calls };
}

function successSteps({ files = VALID_FILES } = {}) {
  const contentPaths = Object.keys(files).filter((path) => files[path] !== null).sort();
  const blobShas = [SHA.manifestBlob, SHA.materialsBlob];
  const steps = [
    {
      url: `${API_BASE}/git/ref/heads/feature/phase-b3`,
      json: { ref: REF_NAME, object: { type: 'commit', sha: SHA.head } },
    },
    {
      url: `${API_BASE}/git/commits/${SHA.head}`,
      json: { sha: SHA.head, tree: { sha: SHA.baseTree } },
    },
  ];

  for (let index = 0; index < contentPaths.length; index += 1) {
    steps.push({
      method: 'POST',
      url: `${API_BASE}/git/blobs`,
      status: 201,
      json: { sha: blobShas[index] },
    });
  }

  steps.push(
    {
      method: 'POST',
      url: `${API_BASE}/git/trees`,
      status: 201,
      json: { sha: SHA.tree },
    },
    {
      method: 'POST',
      url: `${API_BASE}/git/commits`,
      status: 201,
      json: { sha: SHA.commit },
    },
    {
      method: 'PATCH',
      url: `${API_BASE}/git/refs/heads/feature/phase-b3`,
      json: { ref: REF_NAME, object: { type: 'commit', sha: SHA.commit } },
    },
  );
  return steps;
}

test('writes sorted UTF-8 shards in one non-force ref update', async () => {
  const files = {
    'data/products/widget-1.json': null,
    'data/materials.json': '{"name":"电机 – động cơ"}',
    'data/manifest.json': '{"version":3}',
  };
  const steps = successSteps({ files });
  const { fetchImpl, calls } = createMockFetch(steps);
  const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });

  const result = await writer.writeFiles({ ...VALID_ARGS, files });

  assert.deepEqual(result, { previousHeadSha: SHA.head, commitSha: SHA.commit });
  assert.equal(calls.length, 7);
  assert.equal(calls[0].headers.Authorization, `Bearer ${VALID_TOKEN}`);
  assert.equal(calls[0].cache, 'no-store');
  assert.equal(calls[1].cache, 'no-store');

  const manifestBlob = JSON.parse(calls[2].body);
  const materialsBlob = JSON.parse(calls[3].body);
  assert.equal(manifestBlob.content, Buffer.from(files['data/manifest.json'], 'utf8').toString('base64'));
  assert.equal(materialsBlob.content, Buffer.from(files['data/materials.json'], 'utf8').toString('base64'));
  assert.equal(materialsBlob.encoding, 'base64');

  const treeBody = JSON.parse(calls[4].body);
  assert.equal(treeBody.base_tree, SHA.baseTree);
  assert.deepEqual(treeBody.tree, [
    { path: 'data/manifest.json', mode: '100644', type: 'blob', sha: SHA.manifestBlob },
    { path: 'data/materials.json', mode: '100644', type: 'blob', sha: SHA.materialsBlob },
    { path: 'data/products/widget-1.json', mode: '100644', type: 'blob', sha: null },
  ]);

  const commitBody = JSON.parse(calls[5].body);
  assert.deepEqual(commitBody, {
    message: VALID_ARGS.message,
    tree: SHA.tree,
    parents: [SHA.head],
  });
  assert.deepEqual(JSON.parse(calls[6].body), { sha: SHA.commit, force: false });
});

test('uses the browser UTF-8 base64 fallback without Buffer', async () => {
  const steps = successSteps();
  const { fetchImpl, calls } = createMockFetch(steps);
  const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });
  const originalBuffer = globalThis.Buffer;

  try {
    globalThis.Buffer = undefined;
    await writer.writeFiles(VALID_ARGS);
  } finally {
    globalThis.Buffer = originalBuffer;
  }

  assert.equal(JSON.parse(calls[2].body).content, 'eyJ2ZXJzaW9uIjozfQ==');
});

test('rejects invalid constructor config', () => {
  const { fetchImpl } = createMockFetch([]);
  const invalidConfigs = [
    {},
    { ...VALID_CONFIG, owner: '   ' },
    { ...VALID_CONFIG, repo: 'repo/name' },
    { ...VALID_CONFIG, branch: 'main/../../tags/v1' },
    { ...VALID_CONFIG, branch: 'main?ref=refs/tags/v1' },
    { ...VALID_CONFIG, branch: 'main.lock' },
  ];

  for (const config of invalidConfigs) {
    assert.throws(() => createGithubGitDataWriter({ config, fetchImpl }), /config|owner|repo|branch/i);
  }
  assert.throws(() => createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl: null }), /fetchImpl/i);
});

test('rejects invalid write inputs before any network request', async () => {
  const { fetchImpl, calls } = createMockFetch([]);
  const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });
  const invalidInputs = [
    [{ ...VALID_ARGS, token: '' }, /token/i],
    [{ ...VALID_ARGS, token: '   ' }, /token/i],
    [{ ...VALID_ARGS, message: undefined }, /message/i],
    [{ ...VALID_ARGS, message: '   ' }, /message/i],
    [{ ...VALID_ARGS, expectedHeadSha: undefined }, /expectedHeadSha/i],
    [{ ...VALID_ARGS, expectedHeadSha: 'not-a-full-sha' }, /expectedHeadSha/i],
    [{ ...VALID_ARGS, files: {} }, /files/i],
    [{ ...VALID_ARGS, files: [] }, /files/i],
    [{ ...VALID_ARGS, files: { 'data/manifest.json': 1 } }, /content/i],
  ];

  for (const [args, pattern] of invalidInputs) {
    await assert.rejects(writer.writeFiles(args), pattern);
  }
  assert.equal(calls.length, 0);
});

test('allows only the sharded data file grammar', async () => {
  const { fetchImpl, calls } = createMockFetch([]);
  const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });
  const unsafePaths = [
    'manifest.json',
    'data/product.json',
    'data/products/nested/item.json',
    'data/products/.json',
    'data/products/../application.js',
    'data/products/%2e%2e.json',
    'data/products/__proto__.json',
    'data/products/constructor.json',
    'data/products/prototype.json',
    'data/../src/application.js',
    'C:/escape.json',
    '/data/manifest.json',
    'data\\manifest.json',
    'data/manifest.json\n',
    'src/application.js',
  ];

  for (const path of unsafePaths) {
    await assert.rejects(
      writer.writeFiles({ ...VALID_ARGS, files: { [path]: '{}' } }),
      /path/i,
      path,
    );
  }
  assert.equal(calls.length, 0);
});

test('respects custom shardRoot in validateShardPath', async () => {
  const { fetchImpl } = createMockFetch([]);
  const writer = createGithubGitDataWriter({
    config: { ...VALID_CONFIG, shardRoot: 'bom-viewer-sync/data' },
    fetchImpl
  });
  const validFiles = {
    'bom-viewer-sync/data/manifest.json': '{}',
    'bom-viewer-sync/data/materials.json': '{}',
    'bom-viewer-sync/data/products/test-product.json': '{}'
  };
  // It should not throw for valid paths matching shardRoot
  // Note: Since we provided empty mockFetch, it will throw Unexpected fetch call 0, but NOT unsafe shard path
  await assert.rejects(writer.writeFiles({ ...VALID_ARGS, files: validFiles }), /Unexpected fetch call 0/i);

  // Now verify it rejects paths outside the custom shardRoot
  const unsafePaths = [
    'data/manifest.json', // Old path without prefix
    'bom-viewer-sync/data/products/__proto__.json'
  ];
  for (const p of unsafePaths) {
    await assert.rejects(writer.writeFiles({ ...VALID_ARGS, files: { [p]: '{}' } }), /unsafe shard path/i);
  }
});

test('stops on an expected HEAD mismatch before creating objects', async () => {
  const { fetchImpl, calls } = createMockFetch([
    { json: { ref: REF_NAME, object: { type: 'commit', sha: SHA.otherHead } } },
  ]);
  const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });

  await assert.rejects(writer.writeFiles(VALID_ARGS), GithubDataConflictError);
  assert.equal(calls.length, 1);
});

for (const status of [409, 422]) {
  test(`maps only ref update ${status} to GithubDataConflictError`, async () => {
    const steps = successSteps();
    steps[5] = {
      ...steps[5],
      ok: false,
      status,
      json: { message: 'Reference update rejected' },
    };
    const { fetchImpl } = createMockFetch(steps);
    const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });

    await assert.rejects(
      writer.writeFiles(VALID_ARGS),
      (error) => error instanceof GithubDataConflictError && error.status === status,
    );
  });
}

test('does not classify a non-ref 409 as a concurrency conflict', async () => {
  const { fetchImpl } = createMockFetch([
    { ok: false, status: 409, json: { message: 'Repository conflict' } },
  ]);
  const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });

  await assert.rejects(
    writer.writeFiles(VALID_ARGS),
    (error) => error.status === 409 && !(error instanceof GithubDataConflictError),
  );
});

test('redacts every token occurrence without retaining a raw cause', async () => {
  const leakedMessage = `${VALID_TOKEN} repeated ${VALID_TOKEN}`;
  const network = createMockFetch([{ networkError: new Error(leakedMessage) }]);
  const networkWriter = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl: network.fetchImpl });

  await assert.rejects(
    networkWriter.writeFiles(VALID_ARGS),
    (error) => !String(error.message).includes(VALID_TOKEN)
      && !String(error.stack).includes(VALID_TOKEN)
      && error.cause === undefined
      && error.message.includes('***'),
  );

  const conflictSteps = successSteps();
  conflictSteps[5] = {
    ...conflictSteps[5],
    ok: false,
    status: 409,
    json: { message: leakedMessage },
  };
  const conflict = createMockFetch(conflictSteps);
  const conflictWriter = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl: conflict.fetchImpl });

  await assert.rejects(
    conflictWriter.writeFiles(VALID_ARGS),
    (error) => error instanceof GithubDataConflictError
      && !String(error.message).includes(VALID_TOKEN)
      && !String(error.stack).includes(VALID_TOKEN)
      && error.cause === undefined
      && error.message.includes('***'),
  );
});

test('preserves safe API status and endpoint metadata', async () => {
  const { fetchImpl } = createMockFetch([
    { ok: false, status: 500, json: { message: 'Internal error' } },
  ]);
  const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });

  await assert.rejects(
    writer.writeFiles(VALID_ARGS),
    (error) => error.status === 500
      && error.endpoint === `${API_BASE}/git/ref/heads/feature/phase-b3`,
  );
});

const malformedResponses = [
  ['branch ref', 0, { ref: REF_NAME, object: {} }, /branch ref/i],
  ['commit', 1, { tree: {} }, /commit/i],
  ['blob', 2, {}, /blob/i],
  ['tree', 3, {}, /tree/i],
  ['new commit', 4, {}, /new commit/i],
  ['updated ref', 5, { ref: REF_NAME, object: {} }, /updated ref/i],
  ['wrong ref', 5, { ref: 'refs/heads/other', object: { type: 'commit', sha: SHA.commit } }, /updated ref/i],
];

for (const [name, stepIndex, json, pattern] of malformedResponses) {
  test(`rejects a malformed successful ${name} response`, async () => {
    const steps = successSteps();
    steps[stepIndex] = { ...steps[stepIndex], json };
    const { fetchImpl, calls } = createMockFetch(steps);
    const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });

    await assert.rejects(writer.writeFiles(VALID_ARGS), pattern);
    assert.equal(calls.length, stepIndex + 1);
  });
}
