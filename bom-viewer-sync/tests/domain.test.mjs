import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildBomTreeRows } from '../src/domain/relationships.js';
import { materialWhereUsed, updateMaterialRecord } from '../src/domain/materials.js';
import { createPdmNavigation, createSidebarIndex, resolveBomRows } from '../src/domain/bom.js';
import { coreUtils } from '../src/application.js';
import { loadDataPayload } from './helpers/load-data.mjs';

const { normalizePayload } = coreUtils;

test('shared MaterialID edits update every resolved BOM row', () => {
  const payload = normalizePayload(loadDataPayload());
  const original = resolveBomRows(payload, 'LGS101', '\u590d\u53e4\u8272')
    .find((row) => row.mat_code === 'LGS101DB101KD');
  updateMaterialRecord(payload, original._materialId, {
    name: { zh: 'Test top panel', vi: 'Test top panel' },
  });
  const rows = resolveBomRows(payload, 'LGS111', '\u590d\u53e4\u8272');
  assert.equal(rows.find((row) => row._materialId === original._materialId).name_zh, 'Test top panel');
});

test('BOM tree expands recursive material parents', () => {
  const payload = {
    materialDb: {
      materials: {
        parent: { id: 'parent', code: 'PARENT', name: { zh: 'Parent' } },
        child: { id: 'child', code: 'CHILD', name: { zh: 'Child' } },
        leaf: { id: 'leaf', code: 'LEAF', name: { zh: 'Leaf' } },
      },
      bomEntries: [
        { id: 'p', parentType: 'product', productCode: 'P1', color: 'black', materialId: 'parent', order: 1 },
        { id: 'c', parentType: 'material', parentId: 'parent', productCode: 'P1', color: 'black', materialId: 'child', childMaterialId: 'child', order: 1 },
        { id: 'l', parentType: 'material', parentId: 'child', productCode: 'P1', color: 'black', materialId: 'leaf', childMaterialId: 'leaf', order: 1 },
      ],
    },
  };
  assert.deepEqual(buildBomTreeRows(payload, 'P1', 'black').map((row) => row._level), [1, 2, 3]);
});

test('where-used remains a pure domain query', () => {
  const payload = normalizePayload(loadDataPayload());
  const material = Object.values(payload.materialDb.materials).find((item) => item.code === 'LGS101WJBBH');
  const result = materialWhereUsed(payload, material.id);
  assert.ok(result.productEntries.some((entry) => entry.productCode === 'LGS101'));
  assert.ok(result.childEntries.length > 0);
});

test('BOM navigation normalizes legacy payloads at the domain seam', () => {
  const legacyPayload = {
    bom: {
      P1: {
        colors: ['black'],
        color_info: {
          black: {
            name_zh: 'Product one',
            name_vi: 'Product one',
            materials: [{
              stt: '1',
              mat_code: 'MAT001',
              comp_code: 'COMP001',
              name_zh: 'Panel',
              name_vi: 'Panel',
              attr_zh: 'component',
              attr_vi: 'component',
              qty: '1',
            }],
          },
        },
      },
    },
  };
  const normalizedPayload = normalizePayload(legacyPayload);
  const options = { lang: 'zh', query: '' };

  const legacyIndex = createSidebarIndex(legacyPayload, options);
  assert.deepEqual(legacyIndex, createSidebarIndex(normalizedPayload, options));
  assert.equal(legacyIndex.products.length, 1);
  assert.equal(legacyIndex.products[0].id, 'P1');
  assert.equal(legacyIndex.parentMaterials.length, 1);
  assert.equal(legacyIndex.childMaterials.length, 0);

  const legacyNavigation = createPdmNavigation(legacyPayload, 'zh');
  assert.deepEqual(legacyNavigation, createPdmNavigation(normalizedPayload, 'zh'));
  assert.deepEqual(
    Object.fromEntries(legacyNavigation.map(({ id, count }) => [id, count])),
    { bom: 1, materials: 1, structure: 0 },
  );
});

test('materials domain does not import BOM or relationship modules', () => {
  const source = readFileSync(new URL('../src/domain/materials.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"]\.\/(?:bom|relationships)\.js['"]/);
});
