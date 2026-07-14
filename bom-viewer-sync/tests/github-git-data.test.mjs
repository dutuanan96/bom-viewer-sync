import test from 'node:test';
import assert from 'node:assert';
import { createGithubGitDataWriter, GithubDataConflictError } from '../src/infrastructure/github-git-data.js';

const VALID_CONFIG = { owner: 'testowner', repo: 'testrepo', branch: 'main' };
const VALID_TOKEN = 'ghp_faketoken123';
const API_BASE = 'https://api.github.com/repos/testowner/testrepo';

function createMockFetch(responses) {
  let callIndex = 0;
  const calls = [];
  const fetchImpl = async (url, options) => {
    const call = { url, method: options?.method || 'GET', headers: options?.headers, body: options?.body };
    calls.push(call);
    
    if (callIndex >= responses.length) {
      throw new Error(`Unexpected fetch call ${callIndex}: ${url}`);
    }
    
    const responseConfig = responses[callIndex++];
    
    if (responseConfig.networkError) {
      throw new Error('Network error');
    }
    
    return {
      ok: responseConfig.ok !== false,
      status: responseConfig.status || 200,
      json: async () => responseConfig.json
    };
  };
  return { fetchImpl, calls, getCallCount: () => callIndex };
}

test('GithubGitDataWriter', async (t) => {
  await t.test('Happy path: writes multiple shards atomically', async () => {
    const responses = [
      // 1. Get branch ref
      { json: { object: { sha: 'commit_sha_123' } } },
      // 2. Get commit
      { json: { tree: { sha: 'tree_sha_123' } } },
      // 3. Create blob 1
      { status: 201, json: { sha: 'blob_sha_1' } },
      // 4. Create blob 2
      { status: 201, json: { sha: 'blob_sha_2' } },
      // 5. Create tree
      { status: 201, json: { sha: 'new_tree_sha' } },
      // 6. Create commit
      { status: 201, json: { sha: 'new_commit_sha' } },
      // 7. Update ref
      { json: { object: { sha: 'new_commit_sha' } } }
    ];
    
    const { fetchImpl, calls } = createMockFetch(responses);
    const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });
    
    const files = {
      'data/manifest.json': '{"version":3}',
      'data/product1.json': 'null' // null means deletion in UI layer? No, the rule says "null cho deletion" meaning JS null, not string "null".
    };
    
    // Wait, the prompt says "files chỉ nhận UTF-8 string hoặc null cho deletion"
    files['data/product2.json'] = null; // deletion
    
    const result = await writer.writeFiles({ 
      token: VALID_TOKEN, 
      files, 
      message: 'Test commit', 
      expectedHeadSha: 'commit_sha_123' 
    });
    
    assert.strictEqual(result.previousHeadSha, 'commit_sha_123');
    assert.strictEqual(result.commitSha, 'new_commit_sha');
    
    assert.strictEqual(calls.length, 7);
    
    // Check Get Ref
    assert.strictEqual(calls[0].method, 'GET');
    assert.strictEqual(calls[0].url, `${API_BASE}/git/ref/heads/main`);
    assert.strictEqual(calls[0].headers['Authorization'], `Bearer ${VALID_TOKEN}`);
    
    // Check Get Commit
    assert.strictEqual(calls[1].method, 'GET');
    assert.strictEqual(calls[1].url, `${API_BASE}/git/commits/commit_sha_123`);
    
    // Check Create Blob 1 (manifest)
    assert.strictEqual(calls[2].method, 'POST');
    assert.strictEqual(calls[2].url, `${API_BASE}/git/blobs`);
    const blob1Body = JSON.parse(calls[2].body);
    assert.strictEqual(blob1Body.content, Buffer.from('{"version":3}').toString('base64'));
    assert.strictEqual(blob1Body.encoding, 'base64');
    
    // Check Create Blob 2 (product1)
    assert.strictEqual(calls[3].method, 'POST');
    assert.strictEqual(calls[3].url, `${API_BASE}/git/blobs`);
    const blob2Body = JSON.parse(calls[3].body);
    assert.strictEqual(blob2Body.content, Buffer.from('null').toString('base64'));
    
    // product2 is null, so NO blob is created for it!
    
    // Check Create Tree
    assert.strictEqual(calls[4].method, 'POST');
    assert.strictEqual(calls[4].url, `${API_BASE}/git/trees`);
    const treeBody = JSON.parse(calls[4].body);
    assert.strictEqual(treeBody.base_tree, 'tree_sha_123');
    assert.strictEqual(treeBody.tree.length, 3);
    
    assert.strictEqual(treeBody.tree[0].path, 'data/manifest.json');
    assert.strictEqual(treeBody.tree[0].mode, '100644');
    assert.strictEqual(treeBody.tree[0].type, 'blob');
    assert.strictEqual(treeBody.tree[0].sha, 'blob_sha_1');
    
    assert.strictEqual(treeBody.tree[1].path, 'data/product1.json');
    assert.strictEqual(treeBody.tree[1].sha, 'blob_sha_2');
    
    assert.strictEqual(treeBody.tree[2].path, 'data/product2.json');
    assert.strictEqual(treeBody.tree[2].mode, '100644');
    assert.strictEqual(treeBody.tree[2].type, 'blob');
    assert.strictEqual(treeBody.tree[2].sha, null);
    
    // Check Create Commit
    assert.strictEqual(calls[5].method, 'POST');
    assert.strictEqual(calls[5].url, `${API_BASE}/git/commits`);
    const commitBody = JSON.parse(calls[5].body);
    assert.strictEqual(commitBody.message, 'Test commit');
    assert.strictEqual(commitBody.tree, 'new_tree_sha');
    assert.deepStrictEqual(commitBody.parents, ['commit_sha_123']);
    
    // Check Update Ref
    assert.strictEqual(calls[6].method, 'PATCH');
    assert.strictEqual(calls[6].url, `${API_BASE}/git/refs/heads/main`);
    const refBody = JSON.parse(calls[6].body);
    assert.strictEqual(refBody.sha, 'new_commit_sha');
    assert.strictEqual(refBody.force, false);
  });

  await t.test('Security & Concurrency validations', async (st) => {
    const { fetchImpl } = createMockFetch([]);
    const validArgs = { token: VALID_TOKEN, files: { 'a.txt': 'A' }, message: 'msg', expectedHeadSha: 'sha' };
    
    await st.test('Rejects empty token', async () => {
      const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });
      await assert.rejects(writer.writeFiles({ ...validArgs, token: '' }), /token/i);
    });

    await st.test('Rejects invalid config', () => {
      assert.throws(() => createGithubGitDataWriter({ config: {}, fetchImpl }), /owner/i);
    });

    await st.test('Rejects empty files', async () => {
      const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });
      await assert.rejects(writer.writeFiles({ ...validArgs, files: {} }), /files/i);
    });

    await st.test('Rejects unsafe paths', async () => {
      const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });
      const badPaths = ['/a.txt', 'a\\b', 'a//b', 'a/./b', 'a/../b', 'a/%2E%2E/b'];
      for (const p of badPaths) {
        await assert.rejects(writer.writeFiles({ ...validArgs, files: { [p]: 'A' } }), /path/i);
      }
    });

    await st.test('Rejects non-string/null content', async () => {
      const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });
      await assert.rejects(writer.writeFiles({ ...validArgs, files: { 'a.txt': 123 } }), /content/i);
    });

    await st.test('Expected HEAD mismatch stops before blobs', async () => {
      const { fetchImpl, calls } = createMockFetch([{ json: { object: { sha: 'different_sha' } } }]);
      const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });
      await assert.rejects(writer.writeFiles({ ...validArgs, expectedHeadSha: 'sha' }), GithubDataConflictError);
      assert.strictEqual(calls.length, 1, 'Should stop after get branch ref');
    });

    await st.test('Ref update 409/422 maps to ConflictError', async () => {
      const responses = [
        { json: { object: { sha: 'sha' } } },
        { json: { tree: { sha: 'tree' } } },
        { status: 201, json: { sha: 'blob' } },
        { status: 201, json: { sha: 'new_tree' } },
        { status: 201, json: { sha: 'new_commit' } },
        { ok: false, status: 409, json: { message: 'Reference update failed' } }
      ];
      const { fetchImpl } = createMockFetch(responses);
      const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });
      await assert.rejects(writer.writeFiles(validArgs), GithubDataConflictError);
    });

    await st.test('API errors preserve status and do not leak token', async () => {
      const responses = [{ ok: false, status: 500, json: { message: 'Internal error' } }];
      const { fetchImpl } = createMockFetch(responses);
      const writer = createGithubGitDataWriter({ config: VALID_CONFIG, fetchImpl });
      
      try {
        await writer.writeFiles(validArgs);
        assert.fail('Should throw');
      } catch (err) {
        assert.strictEqual(err.status, 500);
        assert.ok(!err.message.includes(VALID_TOKEN), 'Token leaked in error message');
      }
    });
  });
});
