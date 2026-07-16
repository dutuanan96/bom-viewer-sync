import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCanonicalMaterialAssets,
  assetLocator,
  auditMaterialAssets,
  classifyAssetGroup,
  indexMaterialUsage,
} from '../scripts/lib/material-asset-audit.mjs';

function fixturePayload() {
  return {
    drawings: { P1: { legacy: [{ name: 'legacy.pdf', url: 'https://legacy.example/1' }] } },
    models3d: { P1: { assembly: [{ name: 'P1.glb', path: 'models3d/P1.glb' }] } },
    materialDb: {
      materials: {
        shared: {
          id: 'shared',
          code: 'MAT-SHARED',
          name: { zh: '共享物料', vi: 'Vật liệu dùng chung' },
          drawings: [
            { name: 'drawing.pdf', url: 'https://drive.example/a', path: 'Drive > P1 > drawing.pdf' },
            { name: 'drawing.pdf', url: 'https://drive.example/b', path: 'Drive > P2 > drawing.pdf' },
          ],
          models3d: [
            { name: 'model-a.glb', path: 'models3d/model-a.glb' },
            { name: 'model-b.glb', path: 'models3d/model-b.glb' },
          ],
        },
      },
      bomEntries: Array.from({ length: 20 }, (_, index) => ({
        id: `bom-${index + 1}`,
        parentType: 'product',
        productCode: `P${index + 1}`,
        materialId: 'shared',
      })),
    },
  };
}

test('indexes every product that uses one shared material', () => {
  const usage = indexMaterialUsage(fixturePayload());

  assert.equal(usage.shared.length, 20);
  assert.deepEqual(usage.shared.slice(0, 3), ['P1', 'P2', 'P3']);
  assert.equal(usage.shared.at(-1), 'P20');
});

test('classifies byte-identical assets as duplicates', () => {
  const assets = [
    { url: 'https://drive.example/a' },
    { url: 'https://drive.example/b' },
  ];
  const hashes = {
    'https://drive.example/a': 'same-hash',
    'https://drive.example/b': 'same-hash',
  };

  assert.deepEqual(classifyAssetGroup(assets, hashes), {
    status: 'duplicate',
    assetCount: 2,
    uniqueHashCount: 1,
    missingLocators: [],
    hashes: ['same-hash'],
  });
});

test('classifies different content as a conflict and absent hashes as missing', () => {
  const assets = [
    { path: 'models3d/a.glb' },
    { path: 'models3d/b.glb' },
  ];

  assert.equal(classifyAssetGroup(assets, {
    'models3d/a.glb': 'hash-a',
    'models3d/b.glb': 'hash-b',
  }).status, 'conflict');
  assert.deepEqual(classifyAssetGroup(assets, {
    'models3d/a.glb': 'hash-a',
  }).missingLocators, ['models3d/b.glb']);
  assert.equal(classifyAssetGroup(assets, {
    'models3d/a.glb': 'hash-a',
  }).status, 'missing');
});

test('audits material assets without treating product assembly models as material models', () => {
  const payload = fixturePayload();
  const hashes = {
    'https://drive.example/a': 'pdf-hash',
    'https://drive.example/b': 'pdf-hash',
    'models3d/model-a.glb': 'model-a-hash',
    'models3d/model-b.glb': 'model-b-hash',
  };

  const audit = auditMaterialAssets(payload, hashes);

  assert.equal(audit.materials.shared.products.length, 20);
  assert.equal(audit.materials.shared.drawings.status, 'duplicate');
  assert.equal(audit.materials.shared.models3d.status, 'conflict');
  assert.equal(audit.summary.productAssemblyModels, 1);
});

test('applies explicit canonical assets to a clone and leaves unrelated payload data unchanged', () => {
  const original = fixturePayload();
  const before = structuredClone(original);
  const result = applyCanonicalMaterialAssets(original, {
    materials: {
      shared: {
        drawings: 'https://drive.example/b',
        models3d: 'models3d/model-a.glb',
      },
    },
  });

  assert.deepEqual(original, before);
  assert.equal(result.payload.materialDb.materials.shared.drawings.length, 1);
  assert.equal(assetLocator(result.payload.materialDb.materials.shared.drawings[0]), 'https://drive.example/b');
  assert.equal(result.payload.materialDb.materials.shared.models3d.length, 1);
  assert.equal(assetLocator(result.payload.materialDb.materials.shared.models3d[0]), 'models3d/model-a.glb');
  assert.deepEqual(result.payload.drawings, before.drawings);
  assert.deepEqual(result.payload.models3d, before.models3d);
  assert.deepEqual(result.payload.materialDb.bomEntries, before.materialDb.bomEntries);
  assert.deepEqual(result.changes, [{
    materialId: 'shared',
    drawings: { before: 2, after: 1, canonical: 'https://drive.example/b' },
    models3d: { before: 2, after: 1, canonical: 'models3d/model-a.glb' },
  }]);
});

test('rejects a canonical locator that is not already owned by the material', () => {
  assert.throws(
    () => applyCanonicalMaterialAssets(fixturePayload(), {
      materials: { shared: { drawings: 'https://drive.example/missing' } },
    }),
    /UNKNOWN_CANONICAL_ASSET/,
  );
});
