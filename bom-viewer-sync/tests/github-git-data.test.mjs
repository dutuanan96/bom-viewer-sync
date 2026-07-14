import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGithubGitDataWriter,
  GithubDataConflictError,
} from '../src/infrastructure/github-git-data.js';

const config = {
  owner: 'acme',
  repo: 'bom-data',
  branch: 'main',
};

function jsonResponse(body, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  };
}

test('writes multiple shard files through one fast-forward commit', async () => {
  const requests = [];
  const responses = [
    jsonResponse({ object: { sha: 'head-sha' } }),
    jsonResponse({ tree: { sha: 'base-tree-sha' } }),
    jsonResponse({ sha: 'materials-blob-sha' }, 201, 'Created'),
    jsonResponse({ sha: 'product-blob-sha' }, 201, 'Created'),
    jsonResponse({ sha: 'new-tree-sha' }, 201, 'Created'),
    jsonResponse({ sha: 'new-commit-sha' }, 201, 'Created'),
    jsonResponse({ object: { sha: 'new-commit-sha' } }),
  ];
  const writer = createGithubGitDataWriter({
    config,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return responses.shift();
    },
  });

  const result = await writer.writeFiles({
    token: 'secret-token',
    expectedHeadSha: 'head-sha',
    message: 'chore: update bom shards',
    files: {
      'data/materials.json': '{"materials":{}}',
      'data/products/LGS031.json': '{"id":"LGS031"}',
    },
  });

  assert.deepEqual(result, {
    previousHeadSha: 'head-sha',
    commitSha: 'new-commit-sha',
  });
  assert.deepEqual(requests.map(({ url }) => url), [
    'https://api.github.com/repos/acme/bom-data/git/ref/heads/main',
    'https://api.github.com/repos/acme/bom-data/git/commits/head-sha',
    'https://api.github.com/repos/acme/bom-data/git/blobs',
    'https://api.github.com/repos/acme/bom-data/git/blobs',
    'https://api.github.com/repos/acme/bom-data/git/trees',
    'https://api.github.com/repos/acme/bom-data/git/commits',
    'https://api.github.com/repos/acme/bom-data/git/refs/heads/main',
  ]);

  for (const { options } of requests) {
    assert.equal(options.headers.Accept, 'application/vnd.github+json');
    assert.equal(options.headers.Authorization, 'Bearer secret-token');
    assert.equal(options.headers['X-GitHub-Api-Version'], '2022-11-28');
  }

  assert.deepEqual(JSON.parse(requests[2].options.body), {
    content: '{"materials":{}}',
    encoding: 'utf-8',
  });
  assert.deepEqual(JSON.parse(requests[3].options.body), {
    content: '{"id":"LGS031"}',
    encoding: 'utf-8',
  });
  assert.deepEqual(JSON.parse(requests[4].options.body), {
    base_tree: 'base-tree-sha',
    tree: [
      {
        path: 'data/materials.json',
        mode: '100644',
        type: 'blob',
        sha: 'materials-blob-sha',
      },
      {
        path: 'data/products/LGS031.json',
        mode: '100644',
        type: 'blob',
        sha: 'product-blob-sha',
      },
    ],
  });
  assert.deepEqual(JSON.parse(requests[5].options.body), {
    message: 'chore: update bom shards',
    tree: 'new-tree-sha',
    parents: ['head-sha'],
  });
  assert.deepEqual(JSON.parse(requests[6].options.body), {
    sha: 'new-commit-sha',
    force: false,
  });
});

test('rejects invalid file sets before making a GitHub request', async () => {
  const invalidFileSets = [
    {},
    { '/data/materials.json': '{}' },
    { 'data\\materials.json': '{}' },
    { 'data//materials.json': '{}' },
    { 'data/./materials.json': '{}' },
    { 'data/../materials.json': '{}' },
    { 'data/materials.json': 42 },
  ];

  for (const files of invalidFileSets) {
    let requestCount = 0;
    const writer = createGithubGitDataWriter({
      config,
      fetchImpl: async () => {
        requestCount += 1;
        return jsonResponse({});
      },
    });

    await assert.rejects(writer.writeFiles({ token: 'token', files, message: 'message' }));
    assert.equal(requestCount, 0);
  }
});

test('rejects a stale expected HEAD before creating Git objects', async () => {
  const requests = [];
  const writer = createGithubGitDataWriter({
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({ object: { sha: 'current-head-sha' } });
    },
  });

  await assert.rejects(
    writer.writeFiles({
      token: 'token',
      expectedHeadSha: 'stale-head-sha',
      files: { 'data/materials.json': '{}' },
      message: 'message',
    }),
    (error) => error instanceof GithubDataConflictError
      && error.code === 'GITHUB_DATA_CONFLICT',
  );
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/git\/ref\/heads\/main$/);
});

test('treats an explicitly empty expected HEAD as a stale precondition', async () => {
  let requestCount = 0;
  const writer = createGithubGitDataWriter({
    config,
    fetchImpl: async () => {
      requestCount += 1;
      return jsonResponse({ object: { sha: 'current-head-sha' } });
    },
  });

  await assert.rejects(
    writer.writeFiles({
      token: 'token',
      expectedHeadSha: '',
      files: { 'data/materials.json': '{}' },
      message: 'message',
    }),
    (error) => error instanceof GithubDataConflictError,
  );
  assert.equal(requestCount, 1);
});

test('deletes a shard through the new tree without creating a blob', async () => {
  const requests = [];
  const responses = [
    jsonResponse({ object: { sha: 'head-sha' } }),
    jsonResponse({ tree: { sha: 'base-tree-sha' } }),
    jsonResponse({ sha: 'new-tree-sha' }, 201, 'Created'),
    jsonResponse({ sha: 'new-commit-sha' }, 201, 'Created'),
    jsonResponse({ object: { sha: 'new-commit-sha' } }),
  ];
  const writer = createGithubGitDataWriter({
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return responses.shift();
    },
  });

  await writer.writeFiles({
    token: 'token',
    files: { 'data/products/REMOVED.json': null },
    message: 'chore: remove shard',
  });

  assert.equal(requests.some(({ url }) => url.endsWith('/git/blobs')), false);
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    base_tree: 'base-tree-sha',
    tree: [{
      path: 'data/products/REMOVED.json',
      mode: '100644',
      type: 'blob',
      sha: null,
    }],
  });
});

for (const [status, statusText] of [[409, 'Conflict'], [422, 'Unprocessable Entity']]) {
  test(`maps a ${status} ref update to a stable conflict error`, async () => {
    const responses = [
      jsonResponse({ object: { sha: 'head-sha' } }),
      jsonResponse({ tree: { sha: 'base-tree-sha' } }),
      jsonResponse({ sha: 'blob-sha' }, 201, 'Created'),
      jsonResponse({ sha: 'new-tree-sha' }, 201, 'Created'),
      jsonResponse({ sha: 'new-commit-sha' }, 201, 'Created'),
      jsonResponse({}, status, statusText),
    ];
    const writer = createGithubGitDataWriter({
      config,
      fetchImpl: async () => responses.shift(),
    });

    await assert.rejects(
      writer.writeFiles({
        token: 'token',
        files: { 'data/materials.json': '{}' },
        message: 'message',
      }),
      (error) => error instanceof GithubDataConflictError
        && error.code === 'GITHUB_DATA_CONFLICT'
        && error.status === status,
    );
  });
}

test('preserves status and endpoint context for non-conflict GitHub failures', async () => {
  const responses = [
    jsonResponse({ object: { sha: 'head-sha' } }),
    jsonResponse({ tree: { sha: 'base-tree-sha' } }),
    jsonResponse({}, 500, 'Server Error'),
  ];
  const writer = createGithubGitDataWriter({
    config,
    fetchImpl: async () => responses.shift(),
  });

  await assert.rejects(
    writer.writeFiles({
      token: 'token',
      files: { 'data/materials.json': '{}' },
      message: 'message',
    }),
    (error) => error.status === 500
      && /POST \/git\/blobs failed: 500 Server Error/.test(error.message),
  );
});
