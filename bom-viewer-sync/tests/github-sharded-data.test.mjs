import test from 'node:test';
import assert from 'node:assert/strict';
import { createGithubShardedDataAdapter } from '../src/infrastructure/github-sharded-data.js';

test('github-sharded-data adapter tests', async (t) => {
  const config = { owner: 'test', repo: 'test', branch: 'main', path: 'data.js' };
  
  await t.test('loadPublic resolves commit and fetches pinned raw URLs', async () => {
    const fetchArgs = [];
    const fetchImpl = async (url) => {
      fetchArgs.push(url);
      if (url.includes('/commits/main')) {
        return { ok: true, json: async () => ({ sha: '1234567890abcdef1234567890abcdef12345678' }) };
      }
      if (url.includes('manifest.json')) {
        return { ok: true, text: async () => JSON.stringify({ version: 1, products: ['P1'] }) };
      }
      if (url.includes('materials.json')) {
        return { ok: true, text: async () => JSON.stringify({ materialDb: { materials: {}, bomEntries: [] }, drawings: {}, manuals: {}, models3d: {} }) };
      }
      if (url.includes('P1.json')) {
        return { ok: true, text: async () => JSON.stringify({ id: 'P1', colors: [], materials: [] }) };
      }
      return { ok: false, status: 404 };
    };

    const adapter = createGithubShardedDataAdapter({ config, fetchImpl, now: () => 1000 });
    const payload = await adapter.loadPublic();
    
    assert.equal(payload.version, 1);
    assert.ok(payload.bom.P1);

    assert.equal(fetchArgs[0], 'https://api.github.com/repos/test/test/commits/main');
    assert.ok(fetchArgs[1].startsWith('https://raw.githubusercontent.com/test/test/1234567890abcdef1234567890abcdef12345678/data/manifest.json'));
  });

  await t.test('loadForWrite fetches tree and blobs', async () => {
    const fetchArgs = [];
    const fetchImpl = async (url) => {
      fetchArgs.push(url);
      if (url.includes('/git/ref/heads/main')) {
        return { ok: true, json: async () => ({ ref: 'refs/heads/main', object: { sha: 'commit-sha' } }) };
      }
      if (url.includes('/git/commits/commit-sha')) {
        return { ok: true, json: async () => ({ sha: 'commit-sha', tree: { sha: 'tree-sha' } }) };
      }
      if (url.includes('/git/trees/tree-sha')) {
        return { ok: true, json: async () => ({
          tree: [
            { path: 'data/manifest.json', type: 'blob', sha: 'blob1' },
            { path: 'data/materials.json', type: 'blob', sha: 'blob2' },
            { path: 'data/products/P1.json', type: 'blob', sha: 'blob3' },
          ]
        }) };
      }
      if (url.includes('/git/blobs/blob1')) {
        return { ok: true, json: async () => ({ sha: 'blob1', encoding: 'base64', content: Buffer.from(JSON.stringify({ version: 1, products: ['P1'] })).toString('base64') }) };
      }
      if (url.includes('/git/blobs/blob2')) {
        return { ok: true, json: async () => ({ sha: 'blob2', encoding: 'base64', content: Buffer.from(JSON.stringify({ materialDb: { materials: {}, bomEntries: [] } })).toString('base64') }) };
      }
      if (url.includes('/git/blobs/blob3')) {
        return { ok: true, json: async () => ({ sha: 'blob3', encoding: 'base64', content: Buffer.from(JSON.stringify({ id: 'P1', colors: [], materials: [] })).toString('base64') }) };
      }
      return { ok: false, status: 404 };
    };

    const adapter = createGithubShardedDataAdapter({ config, fetchImpl });
    const result = await adapter.loadForWrite('token123');
    
    assert.equal(result.expectedHeadSha, 'commit-sha');
    assert.equal(result.payload.version, 1);
    assert.ok(result.payload.bom.P1);
  });

  await t.test('write delegates to writerFactory', async () => {
    let writeCalled = false;
    const writerFactory = () => ({
      writeFiles: async ({ expectedHeadSha }) => {
        writeCalled = true;
        assert.equal(expectedHeadSha, 'commit-sha');
        return { commitSha: 'new-commit-sha' };
      }
    });

    const payload = {
      version: 1,
      updatedAt: '',
      productImages: {},
      productRevisions: {},
      notifications: [],
      bom: { P1: { id: 'P1', colors: [], materials: [] } },
      drawings: {},
      manuals: {},
      models3d: {},
      materialDb: { materials: {}, bomEntries: [] }
    };

    const adapter = createGithubShardedDataAdapter({ config, writerFactory });
    const result = await adapter.write({ token: 'token123', expectedHeadSha: 'commit-sha', payload, message: 'test' });
    
    assert.ok(writeCalled);
    assert.equal(result.previousHeadSha, 'commit-sha');
    assert.equal(result.commitSha, 'new-commit-sha');
  });
});
