import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const materialDb = read('data/materials.json').materialDb;
const revisions = read('data/manifest.json').productRevisions;
const products = fs.readdirSync('data/products')
  .filter((file) => file.startsWith('LGS') && file.endsWith('.json'))
  .map((file) => read(path.join('data/products', file)));
const byCode = new Map(Object.values(materialDb.materials).map((material) => [material.code, material]));
const expected = {
  '280:BL': { code: 'XHBBL1010SQ', spec: '10x10mm', color: '蓝底黑字' },
  '280:BR': { code: 'XHBBR1010SQ', spec: '10x10mm', color: '绿底黑字' },
  '325:BL': { code: 'XHBBL010RD', spec: '∅10mm', color: '蓝底黑字' },
  '325:BR': { code: 'XHBBR010RD', spec: '∅10mm', color: '绿底黑字' },
};

function verifyLabels(product, entries, materials, context) {
  const colors = Object.entries(product.color_info || {});
  const labels = colors.flatMap(([color, info]) => (info.materials || [])
    .filter((row) => row.name_zh === '序号标BL' || row.name_zh === '序号标BR')
    .map((row) => ({ color, row })));
  if (!labels.length) return 0;
  const lengths = new Set(colors.flatMap(([, info]) => (info.materials || [])
    .filter((row) => row.name_zh?.includes('布抽条'))
    .map((row) => row.name_zh.match(/^(280|325)mm/)?.[1])));
  assert.equal(lengths.size, 1, `${context} must use one strip length`);
  const length = [...lengths][0];
  assert.ok(length === '280' || length === '325', `${context} must identify a supported strip length`);
  for (const { color, row } of labels) {
    const side = row.name_zh.slice(-2);
    const rule = expected[`${length}:${side}`];
    assert.equal(row.mat_code, rule.code, `${context}/${color}/${side} code`);
    assert.equal(row.spec, rule.spec, `${context}/${color}/${side} specification`);
    assert.equal(row.color_zh, rule.color, `${context}/${color}/${side} color`);
    const master = byCode.get(rule.code);
    assert.ok(master, `${rule.code} must exist in Material Master`);
    assert.equal(master.spec.zh, rule.spec);
    assert.equal(master.color.zh, rule.color);
    if (materials) assert.deepEqual(materials[master.id], master, `${context}/${color}/${side} snapshot master`);
    const matchingEntries = entries.filter((entry) => entry.parentType === 'product'
      && entry.productCode === product.code && entry.color === color && entry.materialId === master.id);
    assert.equal(matchingEntries.length, 1, `${context}/${color}/${side} BOM relation`);
  }
  return labels.length;
}

test('BL/BR label codes, shape, color, and BOM references match strip length in current and historical LGS revisions', () => {
  let currentProducts = 0;
  let currentRows = 0;
  let historicalRevisions = 0;
  let historicalRows = 0;
  for (const product of products) {
    for (const [color, info] of Object.entries(product.color_info || {})) {
      if (!(info.materials || []).some((row) => row.name_zh?.includes('布抽条'))) continue;
      const sides = (info.materials || [])
        .filter((row) => row.name_zh === '序号标BL' || row.name_zh === '序号标BR')
        .map((row) => row.name_zh.slice(-2)).sort();
      assert.deepEqual(sides, ['BL', 'BR'], `${product.code}/${color} must have both strip labels`);
    }
    const count = verifyLabels(product, materialDb.bomEntries, null, product.code);
    if (count) currentProducts++;
    currentRows += count;
    for (const revision of revisions[product.code]?.revisions || []) {
      const snapshot = revision.snapshot;
      if (!snapshot) continue;
      const historicalCount = verifyLabels(snapshot.product, snapshot.materialDb.bomEntries,
        snapshot.materialDb.materials, `${product.code}/${revision.revision}`);
      if (historicalCount) historicalRevisions++;
      historicalRows += historicalCount;
    }
  }
  assert.deepEqual({ currentProducts, currentRows, historicalRevisions, historicalRows },
    { currentProducts: 22, currentRows: 136, historicalRevisions: 53, historicalRows: 274 });
});

test('three corrected LGS revisions are released and production-effective', () => {
  for (const productCode of ['LGS031', 'LGS131', 'LGS231']) {
    const record = revisions[productCode];
    assert.equal(record.currentRevision, 'V3.1');
    assert.equal(record.effectiveRevision, 'V3.1');
    assert.equal(record.currentRevisionInfo.workflowState, 'released');
    assert.ok(record.revisions.some((revision) => revision.revision === 'V3'
      && revision.workflowState === 'released' && revision.snapshot?.product));
    assert.ok(record.effectivityEvents.some((event) => event.action === 'release'
      && event.revision === 'V3.1' && event.previousRevision === 'V3'));
  }
});
