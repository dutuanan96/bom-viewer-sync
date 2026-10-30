import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { isHardwarePackSummary } from '../src/domain/materials.js';
import { buildBomTreeRows } from '../src/domain/relationships.js';
import { payloadForProductRevision } from '../src/domain/revisions.js';
import { assertLogicalShardCount, parseLogicalShardFiles } from '../src/domain/sharded-files.js';
import { applyCorrection } from '../scripts/apply-lgs433-lgs434-v1s-correction.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const dataRoot = path.join(repoRoot, 'data');
const AUTHORITY_COMMIT = 'e8ecfe3b458b8217e1e7ef049a771e96f5c948fc';
const LABEL_BASE_COMMIT = 'ae4eaf645de1b955a15a8af9332f4e9ef2eade69';

// Owner-approved released corrections use the old manuals, not the V1S manuals.
const releasedNumbers = {
  LGS433: {
    TZJD: '1', BCLS: '2', NLPLS6022: '3', NLPLS6010: '4', ZGLS4010: '5',
    PTZGLS: '6', NLDP: '7', SLPZ: '8', ZGLS3560: '8', LNSLSD: '9',
  },
  LGS434: {
    TZJD: '1', BCLS: '2', NLPLS6022: '3', NLPLS6010: '4', ZGLS4010: '5',
    PTZGLS: '6', NLDP: '7', MS6030: '8', SLPZ: '9', ZGLS3560: '9', LNSLSD: '10',
  },
};

async function loadShards() {
  const logicalFiles = new Map();
  for (const logicalPath of ['manifest.json', 'materials.json']) {
    const absolutePath = path.join(dataRoot, logicalPath);
    logicalFiles.set(logicalPath, readFileSync(absolutePath, 'utf8'));
  }
  const productsRoot = path.join(dataRoot, 'products');
  for (const entry of readdirSync(productsRoot, { withFileTypes: true })) {
    if (entry.isFile()) {
      logicalFiles.set(`products/${entry.name}`, readFileSync(path.join(productsRoot, entry.name), 'utf8'));
    }
  }
  assertLogicalShardCount(logicalFiles);
  return await parseLogicalShardFiles(logicalFiles);
}

test('1. No duplicate SKU in any product', async () => {
  const payload = await loadShards();
  const allSkus = new Map();
  for (const [productCode, product] of Object.entries(payload.bom || {})) {
    for (const [color, info] of Object.entries(product.color_info || {})) {
      if (!info.sku) continue;
      assert.ok(!allSkus.has(info.sku), `Duplicate SKU found: ${info.sku} in ${productCode}/${color} and ${allSkus.get(info.sku)}`);
      allSkus.set(info.sku, `${productCode}/${color}`);
    }
  }
  // Specifically verify LGS433 and LGS434 SKUs
  const p433 = payload.bom['LGS433'];
  assert.equal(p433.color_info['复古色'].sku, 'LGS433KD02V1S');
  assert.equal(p433.color_info['白色'].sku, 'LGS433WH02V1S');
  assert.equal(p433.color_info['黑色'].sku, 'LGS433BH02V1S');
  assert.equal(p433.color_info['山纹黑'].sku, 'LGS433B201S');

  const p434 = payload.bom['LGS434'];
  assert.equal(p434.color_info['白色'].sku, 'LGS434WH02V1S');
  assert.equal(p434.color_info['黑色'].sku, 'LGS434BH02V1S');
  assert.equal(p434.color_info['山纹黑'].sku, 'LGS434B201S');
});

test('2. No duplicate material code', async () => {
  const payload = await loadShards();
  const materials = payload.materialDb.materials;
  const codeToIds = new Map();
  for (const [id, m] of Object.entries(materials)) {
    const code = m.code;
    if (!code) continue;
    if (!codeToIds.has(code)) codeToIds.set(code, []);
    codeToIds.get(code).push(id);
  }
  const duplicates = [...codeToIds.entries()].filter(([, ids]) => ids.length > 1);
  assert.deepEqual(duplicates, [], `Duplicate material codes found: ${JSON.stringify(duplicates)}`);
});

test('3. No missing material reference in bomEntries', async () => {
  const payload = await loadShards();
  const materials = payload.materialDb.materials;
  const bomEntries = payload.materialDb.bomEntries;
  for (const entry of bomEntries) {
    assert.ok(materials[entry.materialId], `Missing materialId ${entry.materialId} in entry ${entry.id}`);
    if (entry.parentType === 'material') {
      assert.ok(materials[entry.parentId], `Missing parent materialId ${entry.parentId} in entry ${entry.id}`);
    }
  }
});

test('4. Globally unique bomEntry IDs in raw shard bytes and payload', async () => {
  // Validate directly from raw JSON shard file
  const rawMaterials = JSON.parse(readFileSync(path.join(dataRoot, 'materials.json'), 'utf8'));
  const rawEntries = rawMaterials.materialDb.bomEntries;
  const idMap = new Map();
  for (const entry of rawEntries) {
    assert.ok(entry.id, 'Every entry must have an id');
    assert.ok(!idMap.has(entry.id), `Duplicate entry ID in raw materials.json: ${entry.id}`);
    idMap.set(entry.id, entry);
  }

  // Also validate parsed payload
  const payload = await loadShards();
  const payloadEntries = payload.materialDb.bomEntries;
  assert.equal(rawEntries.length, payloadEntries.length, 'Raw shard entries count must match parsed entries count');
});

test('5. No duplicate logical relation tuples in bomEntries', async () => {
  const payload = await loadShards();
  const bomEntries = payload.materialDb.bomEntries;
  const tupleMap = new Map();
  for (const entry of bomEntries) {
    const childMatId = entry.childMaterialId || entry.materialId || '';
    const key = [
      entry.parentType,
      entry.parentId,
      entry.productCode || '',
      entry.color || '',
      childMatId,
      entry.qty || ''
    ].join('|');
    assert.ok(!tupleMap.has(key), `Duplicate logical relation tuple found: ${key} (IDs: ${tupleMap.get(key)} and ${entry.id})`);
    tupleMap.set(key, entry.id);
  }
});

test('6. Exact expected child counts per V1S hardware pack scope', async () => {
  const payload = await loadShards();
  const entries = payload.materialDb.bomEntries;

  const getScopeCount = (parentId, productCode, color) => {
    return entries.filter(e => e.parentType === 'material' && e.parentId === parentId && e.productCode === productCode && e.color === color).length;
  };

  // LGS433WJBBHV1S: 10 children per scope for 复古色, 黑色, 山纹黑
  assert.equal(getScopeCount('mat_lgs433wjbbhv1s', 'LGS433', '复古色'), 10, 'LGS433WJBBHV1S 复古色 must have 10 children');
  assert.equal(getScopeCount('mat_lgs433wjbbhv1s', 'LGS433', '黑色'), 10, 'LGS433WJBBHV1S 黑色 must have 10 children');
  assert.equal(getScopeCount('mat_lgs433wjbbhv1s', 'LGS433', '山纹黑'), 10, 'LGS433WJBBHV1S 山纹黑 must have 10 children');
  assert.equal(entries.filter(e => e.parentId === 'mat_lgs433wjbbhv1s').length, 30);

  // LGS433WJBWHV1S: 10 children for 白色
  assert.equal(getScopeCount('mat_lgs433wjbwhv1s', 'LGS433', '白色'), 10, 'LGS433WJBWHV1S 白色 must have 10 children');
  assert.equal(entries.filter(e => e.parentId === 'mat_lgs433wjbwhv1s').length, 10);

  // The later V1S correction removed one S3 relation from each LGS434 color.
  assert.equal(getScopeCount('mat_lgs434wjbbhv1s', 'LGS434', '黑色'), 11, 'LGS434WJBBHV1S 黑色 must have 11 children');
  assert.equal(getScopeCount('mat_lgs434wjbbhv1s', 'LGS434', '山纹黑'), 11, 'LGS434WJBBHV1S 山纹黑 must have 11 children');
  assert.equal(entries.filter(e => e.parentId === 'mat_lgs434wjbbhv1s').length, 22);

  // LGS434WJBWHV1S: 11 children for 白色
  assert.equal(getScopeCount('mat_lgs434wjbwhv1s', 'LGS434', '白色'), 11, 'LGS434WJBWHV1S 白色 must have 11 children');
  assert.equal(entries.filter(e => e.parentId === 'mat_lgs434wjbwhv1s').length, 11);

  // Total unique V1S child rows
  const v1sTotal = entries.filter(e => ['mat_lgs433wjbbhv1s', 'mat_lgs433wjbwhv1s', 'mat_lgs434wjbbhv1s', 'mat_lgs434wjbwhv1s'].includes(e.parentId)).length;
  assert.equal(v1sTotal, 73, 'Total unique V1S hardware pack rows must be exactly 73');
});

test('7. Product.colors array is synchronized with color_info keys', async () => {
  const payload = await loadShards();

  // Check LGS433
  const p433 = payload.bom['LGS433'];
  assert.deepEqual(p433.colors, ['复古色', '白色', '黑色', '山纹黑']);
  assert.deepEqual(new Set(p433.colors), new Set(Object.keys(p433.color_info)));

  // Check LGS434
  const p434 = payload.bom['LGS434'];
  assert.deepEqual(p434.colors, ['白色', '黑色', '山纹黑']);
  assert.deepEqual(new Set(p434.colors), new Set(Object.keys(p434.color_info)));

  // Check all products across repository
  for (const [code, product] of Object.entries(payload.bom || {})) {
    if (product.colors && product.color_info) {
      assert.deepEqual(new Set(product.colors), new Set(Object.keys(product.color_info)), `Product ${code} colors array must match color_info keys`);
    }
  }
});

test('8. Old hardware metadata preserves authority except reviewed manual number corrections', async () => {
  const payload = await loadShards();
  const rawAuthManifest = execSync(`git show ${AUTHORITY_COMMIT}:./data/manifest.json`, { maxBuffer: 50 * 1024 * 1024 }).toString('utf8');
  const authManifest = JSON.parse(rawAuthManifest);

  const v41Auth = authManifest.productRevisions?.['LGS433'].revisions.find(r => r.revision === 'V4.1');
  const v52Auth = authManifest.productRevisions?.['LGS434'].revisions.find(r => r.revision === 'V5.2');

  const authOld433 = v41Auth.snapshot.materialDb.bomEntries.filter(e => ['mat_f21qte', 'mat_xhsgou'].includes(e.parentId));
  const authOld434 = v52Auth.snapshot.materialDb.bomEntries.filter(e => ['mat_1l7qniw', 'mat_wo2pto'].includes(e.parentId));

  const currentEntries = payload.materialDb.bomEntries;
  const currentOld433 = currentEntries.filter(e => ['mat_f21qte', 'mat_xhsgou'].includes(e.parentId));
  const currentOld434 = currentEntries.filter(e => ['mat_1l7qniw', 'mat_wo2pto'].includes(e.parentId));

  // Normalized full-relation comparison
  const normalizeRow = r => ({
    id: r.id,
    parentType: r.parentType,
    parentId: r.parentId,
    productCode: r.productCode,
    color: r.color,
    materialId: r.materialId,
    childMaterialId: r.childMaterialId || r.materialId,
    stt: String(r.stt || ''),
    comp_code: String(r.comp_code || ''),
    qty: String(r.qty || ''),
    color_ver: String(r.color_ver || ''),
    color_ver_vi: String(r.color_ver_vi || ''),
    order: r.order
  });

  assert.equal(currentOld433.length, authOld433.length, 'LGS433 old pack row count must match historical baseline');
  assert.equal(currentOld434.length, authOld434.length, 'LGS434 old pack row count must match historical baseline');

  const normalizeAuthorityRow = (row, productCode) => {
    const material = payload.materialDb.materials[row.childMaterialId || row.materialId];
    const match = Object.entries(releasedNumbers[productCode])
      .find(([prefix]) => material.code.startsWith(prefix));
    return { ...normalizeRow(row), comp_code: match ? match[1] : String(row.comp_code || '') };
  };

  const normAuth433 = authOld433.map(row => normalizeAuthorityRow(row, 'LGS433'))
    .sort((a, b) => a.id.localeCompare(b.id));
  const normCur433 = currentOld433.map(normalizeRow).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(normCur433, normAuth433, 'LGS433 old hardware pack rows must preserve metadata with reviewed manual numbers');

  const normAuth434 = authOld434.map(row => normalizeAuthorityRow(row, 'LGS434'))
    .sort((a, b) => a.id.localeCompare(b.id));
  const normCur434 = currentOld434.map(normalizeRow).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(normCur434, normAuth434, 'LGS434 old hardware pack rows must preserve metadata with reviewed manual numbers');
});

test('9. Script idempotency regression test', async () => {
  const payload1 = await loadShards();
  applyCorrection(payload1);

  const payload2 = await loadShards();
  applyCorrection(payload2);
  applyCorrection(payload2); // Run second time

  assert.equal(payload1.materialDb.bomEntries.length, payload2.materialDb.bomEntries.length, 'bomEntries count must remain identical after second run');
  assert.deepEqual(payload1.materialDb.bomEntries, payload2.materialDb.bomEntries, 'bomEntries must be strictly deep-equal after second run');
});

test('10. Manifest change-control, BOM history, and timestamp updated without release', async () => {
  const payload = await loadShards();
  assert.ok(payload.updatedAt, 'updatedAt must be present');

  // Check notification
  const notif = payload.notifications?.find(n => n.id === 'notif_ecn_433_434_v1s_draft');
  assert.ok(notif, 'Change-control notification must exist');
  assert.equal(notif.actor, 'admin');

  // Check BOM history
  const h433 = payload.bomHistory?.['LGS433']?.find(h => h.id === 'history_lgs433_v5_v1s_correction');
  assert.ok(h433, 'LGS433 BOM history entry must exist');
  assert.equal(h433.revision, 'V5');
  assert.equal(h433.action, 'save');

  const h434 = payload.bomHistory?.['LGS434']?.find(h => h.id === 'history_lgs434_v6_v1s_correction');
  assert.ok(h434, 'LGS434 BOM history entry must exist');
  assert.equal(h434.revision, 'V6');
  assert.equal(h434.action, 'save');

  // Check lifecycle states remain draft
  assert.equal(payload.productRevisions?.['LGS433'].currentRevision, 'V5');
  assert.equal(payload.productRevisions?.['LGS433'].currentRevisionInfo.workflowState, 'draft');
  assert.equal(payload.productRevisions?.['LGS433'].effectiveRevision, 'V4.1');

  assert.equal(payload.productRevisions?.['LGS434'].currentRevision, 'V6');
  assert.equal(payload.productRevisions?.['LGS434'].currentRevisionInfo.workflowState, 'draft');
  assert.equal(payload.productRevisions?.['LGS434'].effectiveRevision, 'V5.2');
});

test('11. Historical snapshots preserve fields outside approved labels and released hardware numbers', async () => {
  const payload = await loadShards();
  const rawBaseline = execSync(`git show ${LABEL_BASE_COMMIT}:./data/manifest.json`, { maxBuffer: 50 * 1024 * 1024 }).toString('utf8');
  const baseline = JSON.parse(rawBaseline);
  const newLabelIds = new Set(['mat_xhbbl1010sq', 'mat_xhbbr1010sq', 'mat_xhbbl010rd', 'mat_xhbbr010rd']);
  const oldLabelIds = ['mat_1w2hwc', 'mat_18wm8e4'];

  for (const productCode of ['LGS433', 'LGS434']) {
    const actual = structuredClone(payload.productRevisions[productCode].revisions);
    const expected = structuredClone(baseline.productRevisions[productCode].revisions);
    const effectiveRevision = payload.productRevisions[productCode].effectiveRevision;
    const released = expected.find(item => item.revision === effectiveRevision).snapshot;
    const expectedNumber = (materialCode, fallback) => Object.entries(releasedNumbers[productCode])
      .find(([prefix]) => materialCode.startsWith(prefix))?.[1] ?? fallback;
    for (const info of Object.values(released.product.color_info)) {
      for (const pack of info.materials.filter(row => row.mat_code.startsWith(`${productCode}WJB`))) {
        for (const row of pack.materials) row.comp_code = expectedNumber(row.mat_code, row.comp_code);
      }
    }
    const packIds = new Set(Object.entries(released.materialDb.materials)
      .filter(([, material]) => material.code.startsWith(`${productCode}WJB`))
      .map(([id]) => id));
    for (const entry of released.materialDb.bomEntries) {
      if (entry.parentType !== 'material' || !packIds.has(entry.parentId)) continue;
      const material = released.materialDb.materials[entry.childMaterialId || entry.materialId];
      entry.comp_code = expectedNumber(material.code, entry.comp_code);
    }
    for (const revision of actual) {
      const baselineRevision = expected.find((item) => item.revision === revision.revision);
      assert.ok(baselineRevision, `${productCode}/${revision.revision} must exist in the baseline`);
      const snapshot = revision.snapshot;
      const baselineSnapshot = baselineRevision.snapshot;
      for (const [color, info] of Object.entries(snapshot.product.color_info)) {
        info.materials.forEach((row, index) => {
          const baselineRow = baselineSnapshot.product.color_info[color].materials[index];
          if (row.name_zh !== '序号标BL' && row.name_zh !== '序号标BR') return;
          assert.equal(row.name_zh, baselineRow.name_zh);
          for (const field of ['mat_code', 'spec', 'spec_vi', 'color_zh', 'color_vi']) {
            row[field] = baselineRow[field];
          }
        });
      }
      const baselineEntries = new Map(baselineSnapshot.materialDb.bomEntries.map((entry) => [entry.id, entry]));
      for (const entry of snapshot.materialDb.bomEntries) {
        if (newLabelIds.has(entry.materialId)) entry.materialId = baselineEntries.get(entry.id)?.materialId;
      }
      for (const id of newLabelIds) delete snapshot.materialDb.materials[id];
      for (const id of oldLabelIds) {
        if (baselineSnapshot.materialDb.materials[id]) {
          snapshot.materialDb.materials[id] = structuredClone(baselineSnapshot.materialDb.materials[id]);
        }
      }
    }
    assert.deepEqual(actual, expected, `${productCode} historical snapshots changed outside approved label and released hardware number fields`);
  }
});

test('12. B201S uses black-family V1S hardware pack and SWH drawers', async () => {
  const payload = await loadShards();
  const p433 = payload.bom['LGS433'];
  const p434 = payload.bom['LGS434'];

  // HW pack
  const hw433Swh = p433.color_info['山纹黑'].materials.find(m => m.mat_code?.includes('WJB'));
  assert.equal(hw433Swh?.mat_code, 'LGS433WJBBHV1S');
  const hw434Swh = p434.color_info['山纹黑'].materials.find(m => m.mat_code?.includes('WJB'));
  assert.equal(hw434Swh?.mat_code, 'LGS434WJBBHV1S');

  // Drawers
  const d433 = p433.color_info['山纹黑'].materials.filter(m => m.mat_code?.startsWith('BC') && !m.mat_code?.includes('BCDB'));
  assert.deepEqual(d433.map(m => m.mat_code).sort(), ['BC257282168SWH', 'BC350282187SWH']);

  const d434 = p434.color_info['山纹黑'].materials.filter(m => m.mat_code?.startsWith('BC') && !m.mat_code?.includes('BCDB'));
  assert.deepEqual(d434.map(m => m.mat_code).sort(), ['BC340327168SWH', 'BC460327187SWH']);

  // PB and bottom boards unchanged
  for (const code of ['LGS433', 'LGS434']) {
    const p = payload.bom[code];
    const pbBh = p.color_info['黑色'].materials.filter(m => m.mat_code?.startsWith('PB')).map(m => ({ code: m.mat_code, qty: m.qty }));
    const pbSwh = p.color_info['山纹黑'].materials.filter(m => m.mat_code?.startsWith('PB')).map(m => ({ code: m.mat_code, qty: m.qty }));
    assert.deepEqual(pbSwh, pbBh, `PB for ${code} must match between 黑色 and 山纹黑`);

    const bcdbBh = p.color_info['黑色'].materials.filter(m => m.mat_code?.startsWith('BCDB')).map(m => ({ code: m.mat_code, qty: m.qty }));
    const bcdbSwh = p.color_info['山纹黑'].materials.filter(m => m.mat_code?.startsWith('BCDB')).map(m => ({ code: m.mat_code, qty: m.qty }));
    assert.deepEqual(bcdbSwh, bcdbBh, `Drawer bottoms for ${code} must match between 黑色 and 山纹黑`);
  }
});

test('13. Cartons verified: LGS433 V1S = 1185×340×105mm, LGS434 V1S = 860×410×145mm', async () => {
  const payload = await loadShards();
  const materials = payload.materialDb.materials;

  const carton433Codes = ['LGS433PKXKDV1S', 'LGS433PKXWHV1S', 'LGS433PKXBHV1S', 'LGS433PKXSWH'];
  for (const code of carton433Codes) {
    const m = Object.values(materials).find(x => x.code === code);
    assert.ok(m, `Carton ${code} must exist`);
    assert.equal(m.spec?.zh, '1185×340×105mm', `${code} spec must be 1185×340×105mm`);
    assert.equal(m.attr?.zh, '包材');
  }

  const carton434Codes = ['LGS434ZFXWHV1S', 'LGS434ZFXBHV1S', 'LGS434ZFXSWH'];
  for (const code of carton434Codes) {
    const m = Object.values(materials).find(x => x.code === code);
    assert.ok(m, `Carton ${code} must exist`);
    assert.equal(m.spec?.zh, '860×410×145mm', `${code} spec must be 860×410×145mm`);
    assert.equal(m.attr?.zh, '包材');
  }

  // Old carton materials remain untouched
  const oldCartons = ['LGS433PKXKD', 'LGS433PKXWH', 'LGS433PKXBH', 'LGS434ZFXWH', 'LGS434ZFXBH', 'LGS434ZFXKD'];
  for (const code of oldCartons) {
    const m = Object.values(materials).find(x => x.code === code);
    assert.ok(m, `Old carton ${code} must still exist untouched`);
  }
});


test('released and draft BOM trees resolve number 7 against their own manual hardware', async () => {
  const payload = await loadShards();
  const before = JSON.stringify(payload);
  for (const code of ['LGS433', 'LGS434']) {
    const record = payload.productRevisions[code];
    for (const [revision, prefix] of [
      [record.effectiveRevision, 'NLDP15508020'],
      [record.currentRevision, 'NLPLS4022'],
    ]) {
      const selected = payloadForProductRevision(payload, code, revision);
      for (const color of selected.bom[code].colors) {
        const rows = buildBomTreeRows(selected, code, color)
          .filter(row => row.comp_code === '7');
        assert.equal(rows.length, 1, `${code}/${revision}/${color} must resolve one number 7`);
        assert.ok(rows[0].mat_code.startsWith(prefix), `${code}/${revision} has the wrong number 7`);
      }
    }
  }
  assert.equal(JSON.stringify(payload), before, 'Selecting a revision must not mutate either hardware pack');
});
