import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { resolveProductAssets } from '../src/domain/product-assets.js';

const read = (path) => JSON.parse(fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = read('data/manifest.json');
const materials = read('data/materials.json');
const payload = { ...manifest, ...materials };
const recoveredProducts = [
  'LGS032', 'LGS733', 'LGS333', 'LGS334', 'LGS033',
  'LGS101', 'LGS043', 'LGS111', 'LGS421', 'LGS834',
  'LGS232', 'LGS723', 'LGS132', 'LGS420', 'LGS833',
];

test('released and label Draft assets resolve for every recovered product', () => {
  for (const productCode of recoveredProducts) {
    const { effectiveRevision, currentRevision } = manifest.productRevisions[productCode];
    const released = resolveProductAssets(payload, productCode, effectiveRevision);
    const draft = resolveProductAssets(payload, productCode, currentRevision);
    assert.ok(released.manuals.length > 0, `${productCode} released manual`);
    assert.ok(Object.keys(released.images).length > 0, `${productCode} released images`);
    assert.deepEqual(draft, released, `${productCode} Draft assets`);
    assert.deepEqual(materials.manuals[productCode], draft.manuals);
    assert.deepEqual(manifest.productImages[productCode], draft.images);
    assert.deepEqual(
      Object.entries(materials.models3d[productCode] || {})
        .filter(([key]) => !key.includes('|'))
        .flatMap(([, models]) => models),
      draft.assemblyModels,
      `${productCode} legacy model mirror`,
    );
  }
  assert.ok(resolveProductAssets(payload, 'LGS833', 'V4.3').images['黑色']);
});

test('LGS133 V5 keeps its own model while awaiting an approved image', () => {
  const released = resolveProductAssets(payload, 'LGS133', 'V4.3');
  const draft = resolveProductAssets(payload, 'LGS133', 'V5');
  assert.ok(released.manuals.length > 0);
  assert.ok(Object.keys(released.images).length > 0);
  assert.equal(draft.assemblyModels.length, 1);
  assert.deepEqual(draft.images, {});
});
