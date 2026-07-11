import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBomTreeRows } from '../src/domain/relationships.js';
import { materialWhereUsed, updateMaterialRecord } from '../src/domain/materials.js';
import { resolveBomRows } from '../src/domain/bom.js';
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
