import assert from 'node:assert/strict';
import test from 'node:test';
import { splitPayloadIntoShards, shardFiles } from '../src/domain/sharded-data.js';
import { normalizePayload } from '../src/infrastructure/github-data.js';
import { createShardedDataRepository } from '../src/infrastructure/sharded-data.js';

function repositoryFixture() {
  const payload = normalizePayload({
    version: 2,
    updatedAt: '2026-07-14T00:00:00.000Z',
    bom: {
      LGS031: { code: 'LGS031', color_info: {} },
      LGS032: { code: 'LGS032', color_info: {} },
    },
    drawings: { LGS031: { M1: [{ name: 'drawing.pdf', url: 'https://assets.example/drawing.pdf' }] } },
    notifications: [{ id: 'n1', type: 'github-save', createdAt: '2026-07-14T00:00:00.000Z', changes: [] }],
    materialDb: {
      version: 1,
      materials: { m1: { id: 'm1', code: 'M1' } },
      bomEntries: [
        { id: 'e1', parentType: 'product', parentId: 'LGS031', productCode: 'LGS031', materialId: 'm1' },
        { id: 'e2', parentType: 'product', parentId: 'LGS032', productCode: 'LGS032', materialId: 'm1' },
      ],
    },
  });
  const shards = splitPayloadIntoShards(payload, { datasetVersion: 'dataset-123' });
  return { payload, shards, files: shardFiles(shards) };
}

function jsonLoader(files, calls) {
  return async (path) => {
    calls.push(path);
    if (!Object.prototype.hasOwnProperty.call(files, path)) {
      const error = new Error(`Missing ${path}`);
      error.code = 'NOT_FOUND';
      throw error;
    }
    return structuredClone(files[path]);
  };
}

test('repository lazy-loads and caches each manifest and product shard', async () => {
  const { files } = repositoryFixture();
  const calls = [];
  const repository = createShardedDataRepository({
    loadJson: jsonLoader(files, calls),
    loadLegacyPayload: async () => assert.fail('legacy loader should not run'),
  });

  await Promise.all([repository.loadManifest(), repository.loadManifest()]);
  await Promise.all([repository.loadProduct('LGS031'), repository.loadProduct('LGS031')]);

  assert.deepEqual(calls, ['data/manifest.json', 'data/products/LGS031.json']);
});

test('repository reconstructs a complete payload with matching dataset versions', async () => {
  const { files, payload } = repositoryFixture();
  const calls = [];
  const repository = createShardedDataRepository({
    loadJson: jsonLoader(files, calls),
    loadLegacyPayload: async () => assert.fail('legacy loader should not run'),
  });

  assert.deepEqual(await repository.loadCompletePayload(), payload);
  assert.equal(calls.filter((path) => path === 'data/indexes/where-used.json').length, 1);
});

test('repository falls back only when the manifest is absent', async () => {
  const legacyPayload = repositoryFixture().payload;
  let legacyCalls = 0;
  const missing = new Error('missing manifest');
  missing.code = 'NOT_FOUND';
  const repository = createShardedDataRepository({
    loadJson: async () => { throw missing; },
    loadLegacyPayload: async () => {
      legacyCalls += 1;
      return legacyPayload;
    },
  });

  assert.equal(await repository.loadManifest(), null);
  assert.deepEqual(await repository.loadCompletePayload(), legacyPayload);
  assert.equal(legacyCalls, 1);
});

test('repository rejects unsafe product codes and existing corrupt shards without legacy fallback', async () => {
  const { files } = repositoryFixture();
  files['data/products/LGS031.json'].datasetVersion = 'stale-dataset';
  let legacyCalls = 0;
  const repository = createShardedDataRepository({
    loadJson: jsonLoader(files, []),
    loadLegacyPayload: async () => {
      legacyCalls += 1;
      return {};
    },
  });

  await assert.rejects(repository.loadProduct('../escape'), /Invalid product code/);
  await assert.rejects(repository.loadCompletePayload(), /Dataset version mismatch/);
  assert.equal(legacyCalls, 0);
});
