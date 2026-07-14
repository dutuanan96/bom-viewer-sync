import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePayload } from '../src/infrastructure/github-data.js';
import {
  composePayloadFromShards,
  shardFiles,
  splitPayloadIntoShards,
} from '../src/domain/sharded-data.js';

function samplePayload() {
  return normalizePayload({
    version: 2,
    updatedAt: '2026-07-14T00:00:00.000Z',
    bom: {
      LGS031: { code: 'LGS031', color_info: { black: { sku: 'LGS031-B', materials: [] } } },
      LGS032: { code: 'LGS032', color_info: { white: { sku: 'LGS032-W', materials: [] } } },
    },
    drawings: {
      LGS031: { 'M1|Part one': [{ name: 'drawing.pdf', url: 'https://assets.example/drawing.pdf', path: 'legacy/drawing.pdf' }] },
    },
    manuals: { LGS031: [{ name: 'manual.pdf', url: 'https://assets.example/manual.pdf' }] },
    models3d: {
      LGS032: { 'M2|Part two': [{ name: 'model.glb', url: 'https://assets.example/model.glb', previewUrl: 'https://assets.example/model.glb' }] },
    },
    productImages: { LGS031: { url: 'https://assets.example/LGS031.webp', sourceUrl: 'https://source.example/LGS031.webp' } },
    productRevisions: {
      LGS031: {
        currentRevision: 'V3.1',
        effectiveRevision: 'V3',
        currentRevisionInfo: { workflowState: 'draft', sourceRevision: 'V3' },
        revisions: [{
          revision: 'V3',
          workflowState: 'released',
          snapshot: {
            product: { code: 'LGS031', revision: 'V3' },
            materialDb: {
              version: 1,
              materials: { m1: { id: 'm1', code: 'M1' } },
              bomEntries: [{ id: 'old-e1', parentType: 'product', parentId: 'LGS031', productCode: 'LGS031', materialId: 'm1' }],
            },
          },
        }],
        effectivityEvents: [],
      },
    },
    notifications: [{ id: 'n1', type: 'github-save', actor: 'admin', createdAt: '2026-07-14T00:00:00.000Z', changes: [] }],
    materialDb: {
      version: 1,
      materials: {
        m1: { id: 'm1', code: 'M1', name: { zh: 'Part one', vi: 'Part one' }, drawings: [{ name: 'drawing.pdf', path: 'legacy/drawing.pdf' }] },
        m2: { id: 'm2', code: 'M2', name: { zh: 'Part two', vi: 'Part two' }, models3d: [{ name: 'model.glb', previewUrl: 'https://assets.example/model.glb' }] },
      },
      bomEntries: [
        { id: 'e1', parentType: 'product', parentId: 'LGS031', productCode: 'LGS031', color: 'black', materialId: 'm1', qty: '1' },
        { id: 'e2', parentType: 'material', parentId: 'm1', productCode: 'LGS031', color: 'black', materialId: 'm2', childMaterialId: 'm2', qty: '2' },
        { id: 'e3', parentType: 'product', parentId: 'LGS032', productCode: 'LGS032', color: 'white', materialId: 'm2', qty: '3' },
      ],
    },
  });
}

test('sharded payload round trip preserves BOM, revisions, notifications, and asset metadata', () => {
  const payload = samplePayload();
  const shards = splitPayloadIntoShards(payload, { datasetVersion: 'dataset-123' });

  assert.deepEqual(composePayloadFromShards(shards), payload);
  assert.equal(shards.manifest.schemaVersion, 1);
  assert.equal(shards.manifest.datasetVersion, 'dataset-123');
  assert.deepEqual(shards.manifest.products.map((product) => product.code), ['LGS031', 'LGS032']);
  assert.equal(shards.products.LGS031.productRevisions.currentRevision, 'V3.1');
  assert.equal(shards.products.LGS031.productRevisions.effectiveRevision, 'V3');
  assert.equal(shards.products.LGS031.drawings['M1|Part one'][0].path, 'legacy/drawing.pdf');
  assert.equal(shards.products.LGS032.models3d['M2|Part two'][0].previewUrl, 'https://assets.example/model.glb');
});

test('each scoped BOM entry is stored in exactly one product shard and indexed by reference', () => {
  const shards = splitPayloadIntoShards(samplePayload(), { datasetVersion: 'dataset-123' });
  const entries = Object.values(shards.products).flatMap((product) => product.bomEntries);

  assert.deepEqual(entries.map((entry) => entry.id).sort(), ['e1', 'e2', 'e3']);
  assert.deepEqual(shards.whereUsed.materials.m2.productEntries, [{ productCode: 'LGS032', entryId: 'e3' }]);
  assert.deepEqual(shards.whereUsed.materials.m2.parentEntries, [{ productCode: 'LGS031', entryId: 'e2', parentId: 'm1' }]);
  assert.deepEqual(shards.whereUsed.materials.m1.childEntries, [{ productCode: 'LGS031', entryId: 'e2', materialId: 'm2' }]);
});

test('shard files use fixed paths and reject unsafe product codes', () => {
  const shards = splitPayloadIntoShards(samplePayload(), { datasetVersion: 'dataset-123' });
  const files = shardFiles(shards);

  assert.deepEqual(Object.keys(files), [
    'data/manifest.json',
    'data/materials.json',
    'data/indexes/where-used.json',
    'data/notifications.json',
    'data/products/LGS031.json',
    'data/products/LGS032.json',
  ]);

  const unsafe = samplePayload();
  unsafe.bom['../escape'] = { code: '../escape', color_info: {} };
  assert.throws(
    () => splitPayloadIntoShards(unsafe, { datasetVersion: 'dataset-123' }),
    /Invalid product code/,
  );
});

test('round trip does not invent an optional material database version', () => {
  const payload = samplePayload();
  delete payload.materialDb.version;
  const shards = splitPayloadIntoShards(payload, { datasetVersion: 'dataset-123' });
  const recomposed = composePayloadFromShards(shards);

  assert.equal(Object.prototype.hasOwnProperty.call(shards.materials, 'materialDbVersion'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(recomposed.materialDb, 'version'), false);
  assert.deepEqual(recomposed, payload);
});
