import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { resolveProductAssets } from '../src/domain/product-assets.js';
import { validateAssetFile } from '../src/features/material-asset-upload.js';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = read('data/manifest.json');
const database = read('data/materials.json').materialDb;
const product = read('data/products/LGS133.json');
const registry = manifest.productRevisions.LGS133;

test('V5 uses its STEP-derived assembly without inheriting manuals or images from V4.3', async () => {
  const shared = read('data/materials.json');
  const payload = { ...manifest, ...shared };
  const draftAssets = resolveProductAssets(payload, 'LGS133', 'V5');
  assert.deepEqual(draftAssets.manuals, []);
  assert.deepEqual(draftAssets.images, {});
  assert.equal(draftAssets.assemblyModels.length, 1);
  const model = draftAssets.assemblyModels[0];
  assert.equal(model.path, 'models3d/catalog/model-lgs133-v5-assembly-55f33315a598.glb');
  assert.ok(model.url.endsWith(`/bom-viewer-sync/${model.path}`));
  const bytes = fs.readFileSync(model.path);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '55f33315a59813b6c4c514ad84b53cb56628ac9a7cabc75a0ed12c564bbb0722');
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  assert.equal(gltf.asset.version, '2.0');
  assert.equal(gltf.meshes.length, 144);
  assert.equal(gltf.nodes.find(node => node.extras?.source_sha256)?.extras.source_sha256,
    'b593025ca9d4e2973f6075046b8eb460e8cad175bb1b14417ae83b7b40ab3710');
  assert.ok(gltf.buffers.every(buffer => !buffer.uri));
  assert.equal((await validateAssetFile({
    file: {
      name: model.name, type: 'model/gltf-binary', size: bytes.length,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    },
    ownerType: 'product', typeKey: 'assembly',
  })).kind, 'glb');
  const effectiveAssets = resolveProductAssets(payload, 'LGS133', 'V4.3');
  assert.ok(effectiveAssets.manuals.length > 0);
  assert.ok(effectiveAssets.assemblyModels.length > 0);
  assert.ok(Object.keys(effectiveAssets.images).length > 0);
});
const historyHashes = {
  'V4.3': 'deaa962bfd6b7c96ba42a6999e523f3f76319ef9f5dcf25aea208a2f0d27dcb8',
  'V4.2': 'eddb2645a14b9a07fbfde6b1f73bfa4f936e6c16f65221734d6843a7d093fa33',
  'V4.1': '95d2404785f2ac189f60f9a2b7ad0039a9a748314922d165b3bd79fabfe68e64',
  V4: '7a4ee6e4e52ef2a6cbdbf24e6adec3dcc1fb673f021d1631cdc6bc34b608462d',
};

function component(rows, symbol) {
  const matches = rows.filter(row => row.comp_code === symbol);
  assert.equal(matches.length, 1, `One component ${symbol}`);
  return matches[0];
}

function child(row, code) {
  const matches = (row.materials || []).filter(item => item.mat_code === code);
  assert.equal(matches.length, 1, `One ${code} dependency under ${row.mat_code}`);
  return matches[0];
}

test('LGS133 V5 remains a draft while V4.3 stays effective and all historical records stay unchanged', () => {
  assert.equal(product.revision, 'V5');
  assert.equal(registry.currentRevision, 'V5');
  assert.equal(registry.effectiveRevision, 'V4.3');
  assert.equal(registry.currentRevisionInfo.workflowState, 'draft');
  for (const [revision, expectedHash] of Object.entries(historyHashes)) {
    const record = registry.revisions.find(item => item.revision === revision);
    assert.ok(record, `Historical ${revision} exists`);
    assert.equal(createHash('sha256').update(JSON.stringify(record)).digest('hex'), expectedHash);
  }
  assert.equal(registry.effectivityEvents.some(event => event.revision === 'V5'), false);
});

test('both variants contain the revised welded structures and one grouped raw-pipe row per J/K', () => {
  for (const variant of Object.values(product.color_info)) {
    const rows = variant.materials;
    for (const symbol of ['M', 'S', 'X01', 'Y07']) {
      assert.equal(rows.some(row => row.comp_code === symbol), false);
    }
    const connector = component(rows, '6');
    assert.equal(connector.mat_code, 'LGS133TOPCONNECTORV5');
    assert.equal(connector.qty, '2');
    for (const symbol of ['J', 'K']) {
      const row = component(rows, symbol);
      assert.equal(row.spec, '760x62x15mm');
      assert.equal(child(row, 'FG1515066150').qty, '0.132246');
      assert.match(child(row, 'FG1515066150').remark, /760mm.*0\.125.*44mm.*0\.007246/);
      assert.equal(child(row, 'M6GS1515BH').qty, '1');
      assert.equal(child(row, 'M6YLM139').qty, '1');
      assert.equal(row.materials.some(item => item.mat_code === 'FG132132105190'), false);
      assert.equal(row.materials.some(item => item.mat_code === 'M6LMLM'), symbol === 'J');
    }
    for (const symbol of ['F', 'G']) {
      const row = component(rows, symbol);
      assert.equal(child(row, 'FG1515066091').qty, '0.111111');
      assert.equal(child(row, 'FG132132105190').qty, '0.015625');
      assert.equal(row.materials.some(item => item.mat_code === 'M6LMLM'), symbol === 'F');
    }
    for (const symbol of ['D', 'E']) {
      const row = component(rows, symbol);
      assert.equal(child(row, 'FG1515066182').qty, '0.05');
      assert.equal(child(row, 'M6GS1515BH').qty, '2');
      assert.equal(row.materials.some(item => item.mat_code === 'M6LMLM'), false);
    }
    assert.equal(child(component(rows, 'C'), 'M6LMLM').qty, '1');
    const pack = rows.find(row => row.mat_code === 'LGS133WJBBHV5');
    assert.equal(child(pack, 'NLPLS6010BZ').qty, '10+2');
    assert.equal(child(pack, 'TZJD629825BH').qty, '6');
  }
});

test('V5 packaging uses revised dimensions with V4.3 per-product quantities rather than sample quantities', () => {
  for (const variant of Object.values(product.color_info)) {
    const find = code => variant.materials.find(row => row.mat_code === code);
    const carton = variant.materials.find(row => /^LGS133ZFX(?:KD|BH)V5$/.test(row.mat_code));
    assert.equal(carton.spec, '820x485x125mm');
    assert.equal(carton.qty, '1');
    assert.equal(find('PM47212510V5').spec, '20kg, 472x115x12mm');
    assert.equal(find('PM47212510V5').qty, '2');
    assert.equal(find('PM7405034').qty, '2');
    assert.equal(find('ZHJ8080125V5').spec, '80x80x115mm');
    assert.equal(find('ZHJ8080125V5').qty, '4');
    for (const [code, quantity] of [['PE720X400', '4'], ['PE830X60', '2'], ['PE600X60', '1']]) {
      assert.equal(find(code).qty, quantity);
    }
  }
  for (const code of ['FG1515066091', 'FG1515066150', 'FG132132105190']) {
    assert.equal(Object.values(database.materials).filter(material => material.code === code).length, 1);
  }
});
