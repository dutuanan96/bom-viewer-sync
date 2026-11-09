import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = read('data/manifest.json');
const database = read('data/materials.json').materialDb;
const product = read('data/products/LGS233.json');
const byCode = new Map(Object.values(database.materials).map(material => [material.code, material]));
const component = (rows, symbol) => rows.find(row => row.comp_code === symbol);

test('LGS233 V5 covers all four colors while effective V4.3 and historical snapshots stay unchanged', () => {
  const registry = manifest.productRevisions.LGS233;
  assert.equal(registry.currentRevision, 'V5');
  assert.equal(registry.effectiveRevision, 'V4.3');
  assert.equal(registry.currentRevisionInfo.workflowState, 'draft');
  assert.equal(createHash('sha256').update(JSON.stringify(registry.revisions)).digest('hex'),
    '22489729641f17f992d4a70058248722f2c4ca8816951f07c8d72a2aa5239675');
  assert.equal(Object.keys(product.color_info).length, 4);
  assert.deepEqual(manifest.productAssets.LGS233.V5, { manuals: [], assemblyModels: [], images: {} });
});

test('shared frames, hardware quantities, and welded assemblies resolve for every color', () => {
  for (const [color, variant] of Object.entries(product.color_info)) {
    const rows = variant.materials;
    const white = variant.sku === 'LGS233WH02S';
    for (const symbol of ['M', 'S', 'X01', 'Y09']) assert.equal(component(rows, symbol), undefined);
    const pack = rows.find(row => /WJB/.test(row.mat_code));
    assert.equal(pack.mat_code, white ? 'LGS233WJBWHV5' : 'LGS133WJBBHV5');
    const hardware = pack.materials;
    assert.equal(hardware.find(row => row.mat_code === (white ? 'NLPLS6022WZ' : 'NLPLS6022BZ')).qty, '16+2');
    assert.equal(hardware.find(row => row.mat_code === (white ? 'NLPLS6010WZ' : 'NLPLS6010BZ')).qty, '10+2');
    assert.equal(hardware.find(row => row.mat_code === (white ? 'TZJD629825WH' : 'TZJD629825BH')).qty, '6');
    for (const symbol of ['C', 'D', 'E']) {
      const frame = component(rows, symbol);
      assert.ok(frame.mat_code.startsWith('LGS133'));
      assert.ok(frame.mat_code.includes(white ? 'WH' : 'BH'));
    }
    for (const symbol of ['J', 'K']) {
      const row = component(rows, symbol);
      assert.equal(row.spec, '895x62x15mm');
      assert.equal(row.materials.find(item => item.mat_code === 'FG1515065464').qty, '0.174863');
      assert.equal(row.materials.find(item => item.mat_code === (white ? 'M6GS1515WH' : 'M6GS1515BH')).qty, '1');
    }
    for (const symbol of ['F', 'G']) {
      const row = component(rows, symbol);
      assert.equal(row.spec, '843x15x15mm');
      assert.equal(row.materials.find(item => item.mat_code === 'FG1515065718').qty, '0.142857');
      assert.equal(row.materials.find(item => item.mat_code === 'FG132132105190').qty, '0.015873');
    }
    assert.equal(component(rows, '6').qty, '2');
    assert.equal(component(rows, 'Y08').qty, '9');
    for (const row of rows) {
      const record = byCode.get(row.mat_code);
      assert.ok(record, row.mat_code);
      assert.equal(row.spec, record.spec.zh);
      const entry = database.bomEntries.find(item => item.parentType === 'product' &&
        item.productCode === 'LGS233' && item.color === color && item.materialId === record.id);
      assert.ok(entry);
      assert.equal(entry.qty, row.qty);
      assert.equal(entry.remark || '', row.remark || '');
    }
    for (const [code, quantity] of [['PE720X400', '4'], ['PE950X60', '1'], ['PE1160X120', '1']]) {
      assert.equal(rows.find(row => row.mat_code === code).qty, quantity);
    }
    assert.equal(rows.some(row => row.mat_code === 'PE620X60'), false);
  }
});

test('single-part laser programs leave at least 80 mm for clamping', () => {
  for (const [stock, cut, count] of [[5718, 803, 7], [5464, 895, 6], [5464, 44, 122], [5190, 80, 63]]) {
    assert.equal(Math.floor((stock - 80) / cut), count);
    assert.ok(stock - cut * count >= 80);
  }
});
