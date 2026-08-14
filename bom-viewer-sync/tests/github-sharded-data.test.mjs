import test from 'node:test';
import assert from 'node:assert/strict';
import { createGithubShardedDataAdapter } from '../src/infrastructure/github-sharded-data.js';

const PRODUCT_IDS = Array.from({ length: 22 }, (_, index) => `P${index + 1}`);

function cutoverShardContents() {
  return new Map([
    ['manifest.json', JSON.stringify({ version: 1, products: PRODUCT_IDS })],
    ['materials.json', JSON.stringify({ materialDb: { materials: {}, bomEntries: [] }, drawings: {}, manuals: {}, models3d: {} })],
    ...PRODUCT_IDS.map((id) => [`products/${id}.json`, JSON.stringify({ id, colors: [], materials: [] })]),
  ]);
}

function treeEntries(contents, extra = []) {
  return [...contents.keys(), ...extra].map((path, index) => ({
    path: `data/${path}`,
    type: 'blob',
    sha: (index + 1).toString(16).padStart(40, '0'),
  }));
}

test('github-sharded-data adapter tests', async (t) => {
  const config = { owner: 'test', repo: 'test', branch: 'main', shardRoot: 'data' };

  await t.test('loadPublic pins every raw shard to one resolved commit', async () => {
    const fetchArgs = [];
    const fetchImpl = async (url) => {
      fetchArgs.push(url);
      if (url.includes('/commits/main')) {
        return { ok: true, json: async () => ({ sha: 'a'.repeat(40) }) };
      }
      if (url.includes('manifest.json')) {
        return { ok: true, text: async () => JSON.stringify({ version: 1, products: PRODUCT_IDS }) };
      }
      if (url.includes('materials.json')) {
        return { ok: true, text: async () => JSON.stringify({ materialDb: { materials: {}, bomEntries: [] }, drawings: {}, manuals: {}, models3d: {} }) };
      }
      const productMatch = url.match(/products\/(P\d+)\.json/);
      if (productMatch) {
        return { ok: true, text: async () => JSON.stringify({ id: productMatch[1], colors: [], materials: [] }) };
      }
      return { ok: false, status: 404 };
    };

    const adapter = createGithubShardedDataAdapter({ config, fetchImpl, now: () => 1000 });
    const payload = await adapter.loadPublic();

    assert.equal(payload.version, 1);
    assert.ok(payload.bom.P1);

    assert.ok(fetchArgs[0].includes('https://api.github.com/repos/test/test/commits/main'));
    assert.ok(fetchArgs.some(url => url.startsWith(`https://raw.githubusercontent.com/test/test/${'a'.repeat(40)}/data/manifest.json`)));

    const metadata = adapter.getSourceMetadata();
    assert.equal(metadata.commitSha, 'a'.repeat(40));
    assert.match(metadata.contentSnapshotSha, /^[0-9a-f]{40}$/);
    assert.equal(metadata.provenanceKind, 'commit-pinned');
    assert.equal(metadata.shardRoot, 'data');
    assert.equal(metadata.manifestVersion, 1);
    // Commit mock has no date, manifest has no updatedAt, so updatedAt should be null (no new Date() fallback)
    assert.equal(metadata.updatedAt, null);
  });

  await t.test('loadPublic fails rather than mixing shards when the commit lookup is rate limited', async () => {
    const fetchArgs = [];
    const fetchImpl = async (url) => {
      fetchArgs.push(url);
      if (url.includes('api.github.com')) {
        return { ok: false, status: 429, json: async () => ({ message: 'rate limited' }) };
      }
      if (url.includes('manifest.json')) {
        return { ok: true, text: async () => JSON.stringify({ version: 1, products: PRODUCT_IDS }) };
      }
      if (url.includes('materials.json')) {
        return { ok: true, text: async () => JSON.stringify({ materialDb: { materials: {}, bomEntries: [] }, drawings: {}, manuals: {}, models3d: {} }) };
      }
      const productMatch = url.match(/products\/(P\d+)\.json/);
      if (productMatch) {
        return { ok: true, text: async () => JSON.stringify({ id: productMatch[1], colors: [], materials: [] }) };
      }
      return { ok: false, status: 404 };
    };

    const adapter = createGithubShardedDataAdapter({ config, fetchImpl, now: () => 1000 });
    await assert.rejects(adapter.loadPublic(), /rate limited/);
    assert.equal(fetchArgs.some(url => url.includes('raw.githubusercontent.com')), false);
  });

  await t.test('loadPublic reuses the resolved commit within the public refresh window', async () => {
    let now = 0;
    let commitRequests = 0;
    const fetchImpl = async (url) => {
      if (url.includes('/commits/main')) {
        commitRequests += 1;
        return { ok: true, json: async () => ({ sha: 'e'.repeat(40) }) };
      }
      if (url.includes('manifest.json')) {
        return { ok: true, text: async () => JSON.stringify({ version: 1, products: PRODUCT_IDS }) };
      }
      if (url.includes('materials.json')) {
        return { ok: true, text: async () => JSON.stringify({ materialDb: { materials: {}, bomEntries: [] }, drawings: {}, manuals: {}, models3d: {} }) };
      }
      const productMatch = url.match(/products\/(P\d+)\.json/);
      if (productMatch) return { ok: true, text: async () => JSON.stringify({ id: productMatch[1], colors: [], materials: [] }) };
      return { ok: false, status: 404 };
    };
    const adapter = createGithubShardedDataAdapter({ config, fetchImpl, now: () => now });

    await adapter.loadPublic();
    now = 60 * 1000;
    await adapter.loadPublic();

    assert.equal(commitRequests, 1);
  });

  await t.test('loadPublic forceRefresh resolves a new commit inside the public refresh window', async () => {
    let now = 0;
    let commitRequests = 0;
    const fetchImpl = async (url) => {
      if (url.includes('/commits/main')) {
        commitRequests += 1;
        const sha = commitRequests === 1 ? 'e'.repeat(40) : 'f'.repeat(40);
        return { ok: true, json: async () => ({ sha }) };
      }
      if (url.includes('manifest.json')) {
        return { ok: true, text: async () => JSON.stringify({ version: 1, products: PRODUCT_IDS }) };
      }
      if (url.includes('materials.json')) {
        return { ok: true, text: async () => JSON.stringify({ materialDb: { materials: {}, bomEntries: [] }, drawings: {}, manuals: {}, models3d: {} }) };
      }
      const productMatch = url.match(/products\/(P\d+)\.json/);
      if (productMatch) return { ok: true, text: async () => JSON.stringify({ id: productMatch[1], colors: [], materials: [] }) };
      return { ok: false, status: 404 };
    };
    const adapter = createGithubShardedDataAdapter({ config, fetchImpl, now: () => now });

    await adapter.loadPublic();
    now = 60 * 1000;
    await adapter.loadPublic({ forceRefresh: true });

    assert.equal(commitRequests, 2);
    assert.equal(adapter.getSourceMetadata().commitSha, 'f'.repeat(40));
  });

  await t.test('loadForWrite fetches tree and blobs', async () => {
    const fetchArgs = [];
    const contents = cutoverShardContents();
    const entries = treeEntries(contents);
    const fetchImpl = async (url) => {
      fetchArgs.push(url);
      const commitSha = 'c'.repeat(40);
      const treeSha = 'e'.repeat(40);

      if (url.includes('/git/ref/heads/main')) {
        return { ok: true, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha: commitSha } }) };
      }
      if (url.includes(`/git/commits/${commitSha}`)) {
        return { ok: true, json: async () => ({ sha: commitSha, tree: { sha: treeSha } }) };
      }
      if (url.includes(`/git/trees/${treeSha}`)) {
        return { ok: true, json: async () => ({
          sha: treeSha,
          tree: entries,
        }) };
      }
      const entry = entries.find(({ sha }) => url.includes(`/git/blobs/${sha}`));
      if (entry) {
        const logicalPath = entry.path.slice('data/'.length);
        return { ok: true, json: async () => ({ sha: entry.sha, encoding: 'base64', content: Buffer.from(contents.get(logicalPath)).toString('base64') }) };
      }
      throw new Error(`Unexpected fetch call ${fetchArgs.length}: ${url}`);
    };

    const adapter = createGithubShardedDataAdapter({ config, fetchImpl });
    const result = await adapter.loadForWrite('token123');

    assert.equal(result.expectedHeadSha, 'c'.repeat(40));
    assert.equal(result.payload.version, 1);
    assert.ok(result.payload.bom.P1);

    const metadata = adapter.getSourceMetadata();
    assert.equal(metadata.commitSha, 'c'.repeat(40));
    assert.equal(metadata.shardRoot, 'data');
    assert.equal(metadata.manifestVersion, 1);
    // loadForWrite mock commit also has no date; updatedAt should be null
    assert.equal(metadata.updatedAt, null);
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
      bom: Object.fromEntries(PRODUCT_IDS.map((id) => [id, { id, colors: [], materials: [] }])),
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
    await assert.rejects(adapter.loadPublic(), /Invalid product ID format/);
  });

  await t.test('constructor rejects unsafe shard roots before any request', () => {
    let fetchCalled = false;
    assert.throws(
      () => createGithubShardedDataAdapter({
        config: { ...config, shardRoot: '../data' },
        fetchImpl: async () => {
          fetchCalled = true;
        },
      }),
      /Valid repository shard root is required/,
    );
    assert.equal(fetchCalled, false);
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
          sha: 'b'.repeat(40),
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

  await t.test('loadPublic rejects unsafe product IDs before requesting product shards', async () => {
    const fetchArgs = [];
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async (url) => {
        fetchArgs.push(url);
        if (url.includes('commits/main')) return { ok: true, json: async () => ({ sha: 'a'.repeat(40) }) };
        if (url.includes('manifest.json')) return { ok: true, text: async () => JSON.stringify({ version: 2, products: ['A/B'] }) };
        if (url.includes('materials.json')) return { ok: true, text: async () => JSON.stringify({ materialDb: { materials: {}, bomEntries: [] } }) };
        return { ok: true, text: async () => '{}' };
      },
    });

    await assert.rejects(adapter.loadPublic(), /Invalid product ID format: A\/B/);
    assert.equal(fetchArgs.some((url) => url.includes('products/A/B.json')), false);
  });

  await t.test('loadPublic rejects a reduced but internally consistent shard set', async () => {
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async (url) => {
        if (url.includes('commits/main')) return { ok: true, json: async () => ({ sha: 'a'.repeat(40) }) };
        if (url.includes('manifest.json')) return { ok: true, text: async () => JSON.stringify({ version: 2, products: ['P1'] }) };
        if (url.includes('materials.json')) return { ok: true, text: async () => JSON.stringify({ materialDb: { materials: {}, bomEntries: [] } }) };
        if (url.includes('products/P1.json')) return { ok: true, text: async () => JSON.stringify({ id: 'P1' }) };
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    await assert.rejects(adapter.loadPublic(), /Expected 24 logical shards, got 3/);
  });

  await t.test('loadForWrite rejects a reduced but internally consistent shard tree', async () => {
    const commitSha = 'a'.repeat(40);
    const treeSha = 'b'.repeat(40);
    const contents = new Map([
      ['manifest.json', JSON.stringify({ version: 2, products: ['P1'] })],
      ['materials.json', JSON.stringify({ materialDb: { materials: {}, bomEntries: [] } })],
      ['products/P1.json', JSON.stringify({ id: 'P1' })],
    ]);
    const entries = treeEntries(contents);
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async (url) => {
        if (url.includes('git/ref')) return { ok: true, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha: commitSha } }) };
        if (url.includes('git/commits/')) return { ok: true, json: async () => ({ sha: commitSha, tree: { sha: treeSha } }) };
        if (url.includes('git/trees/')) return { ok: true, json: async () => ({ sha: treeSha, tree: entries }) };
        const entry = entries.find(({ sha }) => url.includes(`/git/blobs/${sha}`));
        if (entry) return { ok: true, json: async () => ({ sha: entry.sha, encoding: 'base64', content: Buffer.from(contents.get(entry.path.slice('data/'.length))).toString('base64') }) };
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    await assert.rejects(adapter.loadForWrite('token'), /Expected 24 logical shards, got 3/);
  });

  await t.test('loadForWrite binds the recursive tree response to the requested SHA', async () => {
    const commitSha = 'a'.repeat(40);
    const treeSha = 'b'.repeat(40);
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async (url) => {
        if (url.includes('git/ref')) return { ok: true, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha: commitSha } }) };
        if (url.includes('git/commits/')) return { ok: true, json: async () => ({ sha: commitSha, tree: { sha: treeSha } }) };
        if (url.includes('git/trees/')) return { ok: true, json: async () => ({ sha: 'c'.repeat(40), tree: [] }) };
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    await assert.rejects(adapter.loadForWrite('token'), /Tree response SHA mismatch/);
  });

  await t.test('loadForWrite rejects product shards not declared by the manifest', async () => {
    const commitSha = 'a'.repeat(40);
    const treeSha = 'b'.repeat(40);
    const contents = cutoverShardContents();
    contents.set('products/EXTRA.json', JSON.stringify({ id: 'EXTRA' }));
    const entries = treeEntries(contents);
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async (url) => {
        if (url.includes('git/ref')) return { ok: true, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha: commitSha } }) };
        if (url.includes('git/commits/')) return { ok: true, json: async () => ({ sha: commitSha, tree: { sha: treeSha } }) };
        if (url.includes('git/trees/')) return { ok: true, json: async () => ({ sha: treeSha, tree: entries }) };
        const entry = entries.find(({ sha }) => url.includes(`/git/blobs/${sha}`));
        if (entry) return { ok: true, json: async () => ({ sha: entry.sha, encoding: 'base64', content: Buffer.from(contents.get(entry.path.slice('data/'.length))).toString('base64') }) };
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    await assert.rejects(adapter.loadForWrite('token'), /Unexpected logical shard: products\/EXTRA\.json/);
  });

  await t.test('loadForWrite validates unsafe logical paths before requesting any blob', async () => {
    const commitSha = 'a'.repeat(40);
    const treeSha = 'b'.repeat(40);
    let blobRequests = 0;
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async (url) => {
        if (url.includes('git/ref')) return { ok: true, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha: commitSha } }) };
        if (url.includes('git/commits/')) return { ok: true, json: async () => ({ sha: commitSha, tree: { sha: treeSha } }) };
        if (url.includes('git/trees/')) return { ok: true, json: async () => ({
          sha: treeSha,
          tree: [{ path: 'data/products/A/B.json', type: 'blob', sha: '1'.repeat(40) }],
        }) };
        if (url.includes('git/blobs/')) {
          blobRequests += 1;
          return { ok: true, json: async () => ({ sha: '1'.repeat(40), encoding: 'base64', content: 'e30=' }) };
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    await assert.rejects(adapter.loadForWrite('token'), /Invalid logical shard path: products\/A\/B\.json/);
    assert.equal(blobRequests, 0);
  });

  await t.test('loadForWrite redacts token occurrences from every exposed error field', async () => {
    const token = 'secret-token-value';
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async () => {
        const error = new Error(`message ${token}`);
        error.name = `name ${token}`;
        error.code = `code ${token}`;
        error.status = `status ${token}`;
        error.cause = { token };
        throw error;
      },
    });

    const error = await adapter.loadForWrite(token).catch((caught) => caught);
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(`${error.name}|${error.message}|${error.code}|${error.status}|${error.stack}`, new RegExp(token));
  });

  await t.test('loadForWrite safely redacts coercible message metadata', async () => {
    const token = 'coercible-secret-token';
    const adapter = createGithubShardedDataAdapter({
      config,
      fetchImpl: async () => {
        throw {
          message: { toString: () => `message ${token}` },
          name: { toString: () => `name ${token}` },
          code: { toString: () => `code ${token}` },
          status: { toString: () => `status ${token}` },
          stack: `stack ${token}`,
        };
      },
    });

    const error = await adapter.loadForWrite(token).catch((caught) => caught);
    assert.doesNotMatch(`${error.name}|${error.message}|${error.code}|${error.status}|${error.stack}`, new RegExp(token));
  });

  await t.test('write rejects a reduced shard set before constructing a writer', async () => {
    let writerFactoryCalled = false;
    const adapter = createGithubShardedDataAdapter({
      config,
      writerFactory: () => {
        writerFactoryCalled = true;
        return { writeFiles: async () => ({ commitSha: 'unused' }) };
      },
    });
    const payload = {
      version: 2,
      bom: { P1: { id: 'P1' } },
      materialDb: { materials: {}, bomEntries: [] },
    };

    await assert.rejects(
      adapter.write({ token: 'token', expectedHeadSha: 'a'.repeat(40), payload }),
      /Expected 24 logical shards, got 3/,
    );
    assert.equal(writerFactoryCalled, false);
  });
});

// ── R1.2: getSourceMetadata contract ────────────────────────────────────────

test('R1.2: getSourceMetadata returns null before any load', () => {
  const adapter = createGithubShardedDataAdapter({
    config: { owner: 'test', repo: 'test', branch: 'main', shardRoot: 'data' },
    fetchImpl: async () => { throw new Error('should not fetch'); }
  });
  assert.equal(adapter.getSourceMetadata(), null);
});

test('R1.2: getSourceMetadata updatedAt comes from manifest.updatedAt field, not new Date()', async () => {
  // Manifest has updatedAt. Source metadata must use it.
  const EXPECTED_UPDATED_AT = '2026-06-01T00:00:00Z';
  const PRODUCT_IDS_22 = Array.from({ length: 22 }, (_, i) => `P${i + 1}`);

  const fetchImpl = async (url) => {
    if (url.includes('/commits/main')) {
      return { ok: true, json: async () => ({ sha: 'b'.repeat(40) }) };
    }
    if (url.includes('manifest.json')) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          version: 2,
          updatedAt: EXPECTED_UPDATED_AT,
          products: PRODUCT_IDS_22
        })
      };
    }
    if (url.includes('materials.json')) {
      return { ok: true, text: async () => JSON.stringify({ materialDb: { materials: {}, bomEntries: [] }, drawings: {}, manuals: {}, models3d: {} }) };
    }
    const productMatch = url.match(/products\/(P\d+)\.json/);
    if (productMatch) {
      return { ok: true, text: async () => JSON.stringify({ code: productMatch[1], colors: [], color_info: {} }) };
    }
    return { ok: false, status: 404, text: async () => 'not found' };
  };

  const adapter = createGithubShardedDataAdapter({
    config: { owner: 'test', repo: 'test', branch: 'main', shardRoot: 'data' },
    fetchImpl,
    now: () => 999
  });

  await adapter.loadPublic();
  const meta = adapter.getSourceMetadata();

  assert.match(meta.commitSha, /^[0-9a-f]{40}$/);
  assert.equal(meta.shardRoot, 'data');
  assert.equal(meta.manifestVersion, 2);
  // Must be the manifest updatedAt, NOT a fresh new Date()
  assert.equal(meta.updatedAt, EXPECTED_UPDATED_AT);
});

test('R1.2: getSourceMetadata updatedAt is absent (null) when neither commit nor manifest has a date', async () => {
  const PRODUCT_IDS_22 = Array.from({ length: 22 }, (_, i) => `P${i + 1}`);

  const fetchImpl = async (url) => {
    if (url.includes('/commits/main')) {
      return { ok: true, json: async () => ({ sha: 'c'.repeat(40) }) };
    }
    if (url.includes('manifest.json')) {
      return {
        ok: true,
        text: async () => JSON.stringify({ version: 1, products: PRODUCT_IDS_22 }) // no updatedAt
      };
    }
    if (url.includes('materials.json')) {
      return { ok: true, text: async () => JSON.stringify({ materialDb: { materials: {}, bomEntries: [] }, drawings: {}, manuals: {}, models3d: {} }) };
    }
    const productMatch = url.match(/products\/(P\d+)\.json/);
    if (productMatch) {
      return { ok: true, text: async () => JSON.stringify({ code: productMatch[1], colors: [], color_info: {} }) };
    }
    return { ok: false, status: 404, text: async () => 'not found' };
  };

  const adapter = createGithubShardedDataAdapter({
    config: { owner: 'test', repo: 'test', branch: 'main', shardRoot: 'data' },
    fetchImpl,
    now: () => 999
  });

  await adapter.loadPublic();
  const meta = adapter.getSourceMetadata();
  // No fallback new Date() — must be absent/null
  assert.equal(meta.updatedAt, null);
});

test('R1.2: getSourceMetadata returns a copy (immutable — mutation does not affect internal state)', async () => {
  const PRODUCT_IDS_22 = Array.from({ length: 22 }, (_, i) => `P${i + 1}`);

  const fetchImpl = async (url) => {
    if (url.includes('/commits/main')) {
      return { ok: true, json: async () => ({ sha: 'd'.repeat(40) }) };
    }
    if (url.includes('manifest.json')) {
      return { ok: true, text: async () => JSON.stringify({ version: 1, products: PRODUCT_IDS_22 }) };
    }
    if (url.includes('materials.json')) {
      return { ok: true, text: async () => JSON.stringify({ materialDb: { materials: {}, bomEntries: [] }, drawings: {}, manuals: {}, models3d: {} }) };
    }
    const productMatch = url.match(/products\/(P\d+)\.json/);
    if (productMatch) {
      return { ok: true, text: async () => JSON.stringify({ code: productMatch[1], colors: [], color_info: {} }) };
    }
    return { ok: false, status: 404, text: async () => 'not found' };
  };

  const adapter = createGithubShardedDataAdapter({
    config: { owner: 'test', repo: 'test', branch: 'main', shardRoot: 'data' },
    fetchImpl,
    now: () => 999
  });

  await adapter.loadPublic();
  const meta1 = adapter.getSourceMetadata();
  meta1.commitSha = 'TAMPERED';
  meta1.extra = 'injected';

  const meta2 = adapter.getSourceMetadata();
  assert.match(meta2.commitSha, /^[0-9a-f]{40}$/);
  assert.equal(meta2.extra, undefined);
});
