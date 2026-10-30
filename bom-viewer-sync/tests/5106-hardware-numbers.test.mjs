import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readData = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const manifest = readData('manifest.json');
const product = readData('products/5106.json');
const materialDb = readData('materials.json').materialDb;
const released = manifest.productRevisions['5106'].revisions.find(row => row.revision === 'V1').snapshot;

// Manual PDF pages 2-5: number 2 includes both the handle and its fixing screws.
const expected = {
  ST5X50NLXZGLS: '1',
  BCLS129228BH: '2',
  ZGLS4010CZ: '2',
  NLPLS6010BH: '3',
  NLPLS6022BZ: '4',
  SLPZLS6030WH: '5',
  LNSLSD65254BZ: '6',
  ZGLS3560BH: '7',
  TZJD619619BH: '8',
};

const legacyExpected = {
  VTNLPLS6010WH: '3', VTBCLS129228WH: '2', VTZGLS5050: '1', VTNLPLS6022WH: '4',
  VTSLPZLS6030: '5', VTZGLS3560: '7', VTLNSLSD80254: '6', VTZGLS4010: '2',
  VTTZJD619619BH: '8',
};

test('5106 product and released hardware rows use the manual component numbers', () => {
  for (const source of [product, released.product]) {
    for (const info of Object.values(source.color_info)) {
      const pack = info.materials.find(row => ['5106WJBBH', 'VT5106WJB'].includes(row.mat_code));
      assert.ok(pack);
      assert.deepEqual(Object.fromEntries(pack.materials.map(row => [row.mat_code, row.comp_code])),
        pack.mat_code === '5106WJBBH' ? expected : legacyExpected);
    }
  }
});

test('5106 canonical pack relations use the manual component numbers', () => {
  for (const database of [materialDb]) {
    const pack = Object.values(database.materials).find(row => row.code === '5106WJBBH');
    assert.ok(pack);
    const rows = database.bomEntries.filter(row => row.parentType === 'material' && row.parentId === pack.id);
    assert.deepEqual(Object.fromEntries(rows.map(row => [
      database.materials[row.childMaterialId || row.materialId].code,
      row.comp_code,
    ])), expected);
  }
});
