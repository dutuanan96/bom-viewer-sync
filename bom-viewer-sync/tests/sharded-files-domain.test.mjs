import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLogicalFiles, buildLogicalShardFiles, toRepositoryShardFiles, parseLogicalShardFiles } from '../src/domain/sharded-files.js';

test('domain/sharded-files.js runs cleanly without node-specific libraries', async () => {
  const payload = {
    version: 1,
    updatedAt: '2026-07-15T00:00:00Z',
    productImages: {},
    productRevisions: {},
    notifications: [],
    bom: {
      P1: {
        id: 'P1',
        colors: ['Red'],
        color_info: { Red: { BOM: [] } },
        materials: []
      }
    },
    drawings: {},
    manuals: {},
    models3d: {},
    materialDb: { materials: {}, bomEntries: [] }
  };

  const files = buildLogicalShardFiles(payload);
  
  assert.equal(files.size, 3);
  assert.ok(files.has('manifest.json'));
  assert.ok(files.has('materials.json'));
  assert.ok(files.has('products/P1.json'));

  const parsed = await parseLogicalShardFiles(files);
  assert.equal(parsed.version, 1);
  assert.ok(parsed.bom.P1);

  const repoFiles = toRepositoryShardFiles(files, 'data');
  assert.ok(repoFiles['data/manifest.json']);
});
