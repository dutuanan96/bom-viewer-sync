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
      const commitSha = 'c'.repeat(40);
      const treeSha = 'e'.repeat(40);
      const blob1 = '1'.repeat(40);
      const blob2 = '2'.repeat(40);
      const blob3 = '3'.repeat(40);

      if (url.includes('/git/ref/heads/main')) {
        return { ok: true, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha: commitSha } }) };
      }
      if (url.includes(`/git/commits/${commitSha}`)) {
        return { ok: true, json: async () => ({ sha: commitSha, tree: { sha: treeSha } }) };
      }
      if (url.includes(`/git/trees/${treeSha}`)) {
        return { ok: true, json: async () => ({
          tree: [
            { path: 'data/manifest.json', type: 'blob', sha: blob1 },
            { path: 'data/materials.json', type: 'blob', sha: blob2 },
            { path: 'data/products/P1.json', type: 'blob', sha: blob3 },
          ]
        }) };
      }
      if (url.includes(`/git/blobs/${blob1}`)) {
        return { ok: true, json: async () => ({ sha: blob1, encoding: 'base64', content: Buffer.from(JSON.stringify({ version: 1, products: ['P1'] })).toString('base64') }) };
      }
      if (url.includes(`/git/blobs/${blob2}`)) {
        return { ok: true, json: async () => ({ sha: blob2, encoding: 'base64', content: Buffer.from(JSON.stringify({ materialDb: { materials: {}, bomEntries: [] } })).toString('base64') }) };
      }
      if (url.includes(`/git/blobs/${blob3}`)) {
        return { ok: true, json: async () => ({ sha: blob3, encoding: 'base64', content: Buffer.from(JSON.stringify({ id: 'P1' })).toString('base64') }) };
      }
      throw new Error(`Unexpected fetch call ${fetchArgs.length}: ${url}`);
    };

    const adapter = createGithubShardedDataAdapter({ config, fetchImpl });
    const result = await adapter.loadForWrite('token123');

    assert.equal(result.expectedHeadSha, 'c'.repeat(40));
    assert.equal(result.payload.version, 1);
    assert.ok(result.payload.bom.P1);
  });

  await t.test('write delegates to writerFactory', async () => {
    let writeCalled = false;
    const writerFactory = () => ({
      writeFiles: async (input) => {
        writeCalled = true;
        assert.equal(input.expectedHeadSha, 'c'.repeat(40));
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
    const result = await adapter.write({ token: 'token123', expectedHeadSha: 'c'.repeat(40), payload, message: 'test' });

    assert.ok(writeCalled);
    assert.equal(result.previousHeadSha, 'c'.repeat(40));
    assert.equal(result.commitSha, 'new-commit-sha');
  });
});

test('Adversarial Matrix: GitHub Sharded Adapter', async (t) => {
  const config = { owner: 'a', repo: 'b', branch: 'main' };

  await t.test('loadPublic rejects traversal IDs', async () => {
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async (url) => {
        if (url.includes('commits/main')) return { ok: true, json: async () => ({ sha: 'a'.repeat(40) }) };
        if (url.includes('manifest.json')) return { ok: true, text: async () => JSON.stringify({ version: 2, products: ['../invalid'] }) };
        if (url.includes('materials.json')) return { ok: true, text: async () => JSON.stringify({ materialDb: { materials: {}, bomEntries: [] } }) };
        return { ok: true, text: async () => JSON.stringify({}) };
      }
    });
    await assert.rejects(adapter.loadPublic(), /Invalid product ID format.*traversal/);
  });

  await t.test('loadForWrite enforces 40-hex commit SHA from ref', async () => {
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async (url) => {
        if (url.includes('git/ref')) return { ok: true, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha: 'bad' } }) };
        return { ok: true, json: async () => ({}) };
      }
    });
    await assert.rejects(adapter.loadForWrite('token'), /Invalid commit SHA format from ref/);
  });

  await t.test('loadForWrite enforces ref type === commit', async () => {
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async (url) => {
        if (url.includes('git/ref')) return { ok: true, json: async () => ({ ref: 'refs/heads/main', object: { type: 'tree', sha: 'a'.repeat(40) } }) };
        return { ok: true, json: async () => ({}) };
      }
    });
    await assert.rejects(adapter.loadForWrite('token'), /Ref object type must be commit/);
  });

  await t.test('loadForWrite enforces 40-hex tree SHA in commit', async () => {
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async (url) => {
        if (url.includes('git/ref')) return { ok: true, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha: 'a'.repeat(40) } }) };
        if (url.includes('commits/')) return { ok: true, json: async () => ({ sha: 'a'.repeat(40), tree: { sha: 'invalid-tree-sha' } }) };
        return { ok: true, json: async () => ({}) };
      }
    });
    await assert.rejects(adapter.loadForWrite('token'), /Invalid SHA format in commit object/);
  });

  await t.test('loadForWrite rejects duplicate paths in tree', async () => {
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async (url) => {
        if (url.includes('git/ref')) return { ok: true, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha: 'a'.repeat(40) } }) };
        if (url.includes('commits/')) return { ok: true, json: async () => ({ sha: 'a'.repeat(40), tree: { sha: 'b'.repeat(40) } }) };
        if (url.includes('trees/')) return { ok: true, json: async () => ({
          tree: [
            { path: 'data/manifest.json', type: 'blob', sha: 'c'.repeat(40) },
            { path: 'data/manifest.json', type: 'blob', sha: 'd'.repeat(40) }
          ]
        }) };
        return { ok: true, json: async () => ({}) };
      }
    });
    await assert.rejects(adapter.loadForWrite('token'), /Duplicate path in tree/);
  });
});
