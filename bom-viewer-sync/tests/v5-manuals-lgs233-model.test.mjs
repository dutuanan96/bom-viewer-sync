import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { resolveProductAssets } from '../src/domain/product-assets.js';
import { validateAssetFile } from '../src/features/material-asset-upload.js';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = read('data/manifest.json');
const shared = read('data/materials.json');
const payload = { ...manifest, ...shared };

test('both V5 manuals have separate identities without fabricated PDF assets', () => {
  for (const code of ['LGS133', 'LGS233']) {
    const product = read(`data/products/${code}.json`);
    const materials = Object.values(shared.materialDb.materials);
    const oldManual = materials.find(material => material.code === `${code}SMS`);
    const draftManual = materials.find(material => material.code === `${code}SMSV5`);
    assert.ok(oldManual);
    assert.ok(draftManual);
    assert.notEqual(draftManual.id, oldManual.id);
    assert.deepEqual(draftManual.drawings, []);
    assert.deepEqual(resolveProductAssets(payload, code, 'V5').manuals, []);
    for (const [color, variant] of Object.entries(product.color_info)) {
      const rows = variant.materials.filter(row => row.mat_code === draftManual.code);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].qty, '1');
      assert.equal(variant.materials.some(row => row.mat_code === oldManual.code), false);
      const entry = shared.materialDb.bomEntries.find(item => item.parentType === 'product' &&
        item.productCode === code && item.color === color && item.materialId === draftManual.id);
      assert.equal(entry.qty, '1');
    }
    assert.equal(manifest.productRevisions[code].effectiveRevision, 'V4.3');
  }
});

test('LGS233 V5 assembly is a self-contained GLB tied to the supplied STEP', async () => {
  const assets = resolveProductAssets(payload, 'LGS233', 'V5');
  assert.equal(assets.assemblyModels.length, 1);
  const model = assets.assemblyModels[0];
  const bytes = fs.readFileSync(model.path);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '1549ab7314a9fed2d52468ed6c6abf70890afe2f86f90dda147be9af97f26cd0');
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  assert.equal(gltf.meshes.length, 150);
  assert.ok(gltf.buffers.every(buffer => !buffer.uri));
  assert.equal(gltf.nodes.find(node => node.extras?.source_sha256)?.extras.source_sha256,
    '73144e366bd698aebbf80173c6e3c2b40e72a46b525c2f0814f499acda897456');
  assert.equal((await validateAssetFile({
    file: { name: model.name, type: 'model/gltf-binary', size: bytes.length,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) },
    ownerType: 'product', typeKey: 'assembly',
  })).kind, 'glb');
  assert.notDeepEqual(assets.assemblyModels,
    resolveProductAssets(payload, 'LGS233', 'V4.3').assemblyModels);
});
