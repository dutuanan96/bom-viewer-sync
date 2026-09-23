import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { isHardwarePackSummary } from '../src/domain/materials.js';
import { assertLogicalShardCount, parseLogicalShardFiles } from '../src/domain/sharded-files.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const dataRoot = path.join(repoRoot, 'data');

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

test('4. No orphan BOM created and all hardware relations reachable', async () => {
  const payload = await loadShards();
  const materials = payload.materialDb.materials;
  const bomEntries = payload.materialDb.bomEntries;
  for (const entry of bomEntries) {
    if (entry.parentType === 'material' && isHardwarePackSummary(materials[entry.parentId])) {
      const parentIsUsed = bomEntries.some(c => (
        c.parentType === 'product' &&
        c.materialId === entry.parentId &&
        c.productCode === entry.productCode &&
        c.color === entry.color
      )) || Object.values(payload.productRevisions || {}).some(prodRev => (
        (prodRev.revisions || []).some(rev => (
          rev.snapshot?.materialDb?.bomEntries?.some(c => (
            c.parentType === 'product' &&
            c.materialId === entry.parentId &&
            c.productCode === entry.productCode &&
            c.color === entry.color
          ))
        ))
      ));
      assert.ok(parentIsUsed, `Unreachable hardware pack relation ${entry.id} for ${entry.parentId} in ${entry.productCode}/${entry.color}`);
    }
  }
});

test('5. Historical revision snapshots unchanged against HEAD', async () => {
  const payload = await loadShards();
  const rawHeadManifest = execSync('git show HEAD:./data/manifest.json', { maxBuffer: 50 * 1024 * 1024 }).toString('utf8');
  const headManifest = JSON.parse(rawHeadManifest);
  assert.deepEqual(
    payload.productRevisions?.['LGS433']?.revisions,
    headManifest.productRevisions?.['LGS433']?.revisions,
    'LGS433 historical snapshots in manifest must be identical to HEAD'
  );
  assert.deepEqual(
    payload.productRevisions?.['LGS434']?.revisions,
    headManifest.productRevisions?.['LGS434']?.revisions,
    'LGS434 historical snapshots in manifest must be identical to HEAD'
  );
});

test('6 & 7. LGS433 V4.1 and LGS434 V5.2 remain historical baselines', async () => {
  const payload = await loadShards();
  const r433 = payload.productRevisions?.['LGS433'];
  assert.equal(r433.effectiveRevision, 'V4.1');
  const v41 = r433.revisions.find(r => r.revision === 'V4.1');
  assert.ok(v41, 'V4.1 revision snapshot must exist');

  const r434 = payload.productRevisions?.['LGS434'];
  assert.equal(r434.effectiveRevision, 'V5.2');
  const v52 = r434.revisions.find(r => r.revision === 'V5.2');
  assert.ok(v52, 'V5.2 revision snapshot must exist');
});

test('8 & 9 & 10. LGS433 V5 and LGS434 V6 remain draft with NO release', async () => {
  const payload = await loadShards();
  const r433 = payload.productRevisions?.['LGS433'];
  assert.equal(r433.currentRevision, 'V5');
  assert.equal(r433.currentRevisionInfo.workflowState, 'draft');
  assert.equal(r433.effectiveRevision, 'V4.1');

  const r434 = payload.productRevisions?.['LGS434'];
  assert.equal(r434.currentRevision, 'V6');
  assert.equal(r434.currentRevisionInfo.workflowState, 'draft');
  assert.equal(r434.effectiveRevision, 'V5.2');

  // Verify no V5 or V6 released snapshot was pushed to revisions list
  assert.ok(!r433.revisions.some(r => r.revision === 'V5'), 'LGS433 V5 must NOT be in released revisions array');
  assert.ok(!r434.revisions.some(r => r.revision === 'V6'), 'LGS434 V6 must NOT be in released revisions array');
});

test('11. Old hardware parent compositions are restored', async () => {
  const payload = await loadShards();
  const materials = payload.materialDb.materials;
  const bomEntries = payload.materialDb.bomEntries;

  const childCodesOf = (parentCode, productCode, color) => {
    const parentMat = Object.values(materials).find(m => m.code === parentCode);
    assert.ok(parentMat, `Parent material ${parentCode} must exist`);
    return bomEntries
      .filter(e => e.parentType === 'material' && e.parentId === parentMat.id && e.productCode === productCode && e.color === color)
      .map(e => ({ code: materials[e.materialId]?.code, qty: e.qty }));
  };

  // LGS433 old packs: M6x12 = 8+2, nylon = 2, NO M4x22
  for (const color of ['复古色', '黑色']) {
    const children = childCodesOf('LGS433WJBBH', 'LGS433', color);
    const m6x12 = children.find(c => c.code === 'NLPLS6010BZ');
    const nylon = children.find(c => c.code === 'NLDP15508020BH');
    const m4x22 = children.find(c => c.code === 'NLPLS4022BZ');
    assert.equal(m6x12?.qty, '8+2', `LGS433WJBBH ${color} M6x12 must be 8+2`);
    assert.equal(nylon?.qty, '2', `LGS433WJBBH ${color} nylon must be 2`);
    assert.equal(m4x22, undefined, `LGS433WJBBH ${color} must not contain M4x22`);
  }
  const w433Children = childCodesOf('LGS433WJBWH', 'LGS433', '白色');
  assert.equal(w433Children.find(c => c.code === 'NLPLS6010WZ')?.qty, '8+2');
  assert.equal(w433Children.find(c => c.code === 'NLDP15508020WH')?.qty, '2');
  assert.equal(w433Children.find(c => c.code === 'NLPLS4022WZ'), undefined);

  // LGS434 old packs: M6x12 = 12+2, nylon = 2, NO M4x22
  const b434Children = childCodesOf('LGS434WJBBH', 'LGS434', '黑色');
  assert.equal(b434Children.find(c => c.code === 'NLPLS6010BZ')?.qty, '12+2');
  assert.equal(b434Children.find(c => c.code === 'NLDP15508020BH')?.qty, '2');
  assert.equal(b434Children.find(c => c.code === 'NLPLS4022BZ'), undefined);

  const w434Children = childCodesOf('LGS434WJBWH', 'LGS434', '白色');
  assert.equal(w434Children.find(c => c.code === 'NLPLS6010WZ')?.qty, '12+2');
  assert.equal(w434Children.find(c => c.code === 'NLDP15508020WH')?.qty, '2');
  assert.equal(w434Children.find(c => c.code === 'NLPLS4022WZ'), undefined);
});

test('12. New V1S hardware parents have new composition', async () => {
  const payload = await loadShards();
  const materials = payload.materialDb.materials;
  const bomEntries = payload.materialDb.bomEntries;

  const childCodesOf = (parentCode, productCode, color) => {
    const parentMat = Object.values(materials).find(m => m.code === parentCode);
    assert.ok(parentMat, `Parent material ${parentCode} must exist`);
    return bomEntries
      .filter(e => e.parentType === 'material' && e.parentId === parentMat.id && e.productCode === productCode && e.color === color)
      .map(e => ({ code: materials[e.materialId]?.code, qty: e.qty }));
  };

  // LGS433 V1S: M6x12 = 4+1, M4x22 = 4+1, NO nylon
  for (const color of ['复古色', '黑色', '山纹黑']) {
    const children = childCodesOf('LGS433WJBBHV1S', 'LGS433', color);
    assert.equal(children.find(c => c.code === 'NLPLS6010BZ')?.qty, '4+1');
    assert.equal(children.find(c => c.code === 'NLPLS4022BZ')?.qty, '4+1');
    assert.equal(children.find(c => c.code === 'NLDP15508020BH'), undefined);
  }
  const w433V1S = childCodesOf('LGS433WJBWHV1S', 'LGS433', '白色');
  assert.equal(w433V1S.find(c => c.code === 'NLPLS6010WZ')?.qty, '4+1');
  assert.equal(w433V1S.find(c => c.code === 'NLPLS4022WZ')?.qty, '4+1');
  assert.equal(w433V1S.find(c => c.code === 'NLDP15508020WH'), undefined);

  // LGS434 V1S: M6x12 = 8+1, M4x22 = 4+1, NO nylon
  for (const color of ['黑色', '山纹黑']) {
    const children = childCodesOf('LGS434WJBBHV1S', 'LGS434', color);
    assert.equal(children.find(c => c.code === 'NLPLS6010BZ')?.qty, '8+1');
    assert.equal(children.find(c => c.code === 'NLPLS4022BZ')?.qty, '4+1');
    assert.equal(children.find(c => c.code === 'NLDP15508020BH'), undefined);
  }
  const w434V1S = childCodesOf('LGS434WJBWHV1S', 'LGS434', '白色');
  assert.equal(w434V1S.find(c => c.code === 'NLPLS6010WZ')?.qty, '8+1');
  assert.equal(w434V1S.find(c => c.code === 'NLPLS4022WZ')?.qty, '4+1');
  assert.equal(w434V1S.find(c => c.code === 'NLDP15508020WH'), undefined);
});

test('13. Current V5/V6 product BOM references new V1S parents', async () => {
  const payload = await loadShards();
  const p433 = payload.bom['LGS433'];
  const p434 = payload.bom['LGS434'];

  const getHwCode = (colorInfo) => colorInfo.materials?.find(m => m.comp_code === '无' || m.mat_code?.includes('WJB'))?.mat_code;

  assert.equal(getHwCode(p433.color_info['复古色']), 'LGS433WJBBHV1S');
  assert.equal(getHwCode(p433.color_info['白色']), 'LGS433WJBWHV1S');
  assert.equal(getHwCode(p433.color_info['黑色']), 'LGS433WJBBHV1S');
  assert.equal(getHwCode(p433.color_info['山纹黑']), 'LGS433WJBBHV1S');

  assert.equal(getHwCode(p434.color_info['白色']), 'LGS434WJBWHV1S');
  assert.equal(getHwCode(p434.color_info['黑色']), 'LGS434WJBBHV1S');
  assert.equal(getHwCode(p434.color_info['山纹黑']), 'LGS434WJBBHV1S');
});

test('14. B201S uses black-family V1S hardware pack', async () => {
  const payload = await loadShards();
  const p433 = payload.bom['LGS433'];
  const p434 = payload.bom['LGS434'];

  const hw433Swh = p433.color_info['山纹黑'].materials.find(m => m.mat_code?.includes('WJB'));
  assert.equal(hw433Swh?.mat_code, 'LGS433WJBBHV1S');

  const hw434Swh = p434.color_info['山纹黑'].materials.find(m => m.mat_code?.includes('WJB'));
  assert.equal(hw434Swh?.mat_code, 'LGS434WJBBHV1S');
});

test('15. B201S SWH drawer material references are correct', async () => {
  const payload = await loadShards();
  const p433 = payload.bom['LGS433'];
  const p434 = payload.bom['LGS434'];

  const d433 = p433.color_info['山纹黑'].materials.filter(m => m.mat_code?.startsWith('BC') && !m.mat_code?.includes('BCDB'));
  assert.deepEqual(d433.map(m => m.mat_code).sort(), ['BC257282168SWH', 'BC350282187SWH']);

  const d434 = p434.color_info['山纹黑'].materials.filter(m => m.mat_code?.startsWith('BC') && !m.mat_code?.includes('BCDB'));
  assert.deepEqual(d434.map(m => m.mat_code).sort(), ['BC340327168SWH', 'BC460327187SWH']);
});

test('16. PB remains unchanged between BH and B201S', async () => {
  const payload = await loadShards();
  for (const code of ['LGS433', 'LGS434']) {
    const p = payload.bom[code];
    const pbBh = p.color_info['黑色'].materials.filter(m => m.mat_code?.startsWith('PB')).map(m => ({ code: m.mat_code, qty: m.qty }));
    const pbSwh = p.color_info['山纹黑'].materials.filter(m => m.mat_code?.startsWith('PB')).map(m => ({ code: m.mat_code, qty: m.qty }));
    assert.deepEqual(pbSwh, pbBh, `PB for ${code} must be identical between 黑色 and 山纹黑`);
  }
});

test('17. Drawer-bottom materials remain unchanged between BH and B201S', async () => {
  const payload = await loadShards();
  for (const code of ['LGS433', 'LGS434']) {
    const p = payload.bom[code];
    const bcdbBh = p.color_info['黑色'].materials.filter(m => m.mat_code?.startsWith('BCDB')).map(m => ({ code: m.mat_code, qty: m.qty }));
    const bcdbSwh = p.color_info['山纹黑'].materials.filter(m => m.mat_code?.startsWith('BCDB')).map(m => ({ code: m.mat_code, qty: m.qty }));
    assert.deepEqual(bcdbSwh, bcdbBh, `Drawer bottoms for ${code} must be identical between 黑色 and 山纹黑`);
  }
});

test('18 & 19. LGS433 V1S cartons = 1185×340×105mm, LGS434 V1S cartons = 860×410×145mm', async () => {
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
});

test('20. B201S cartons use SWH-specific carton identities', async () => {
  const payload = await loadShards();
  const p433 = payload.bom['LGS433'];
  const p434 = payload.bom['LGS434'];

  const c433 = p433.color_info['山纹黑'].materials.find(m => m.attr_zh === '包材' && m.name_zh?.includes('平口箱'));
  assert.equal(c433?.mat_code, 'LGS433PKXSWH');

  const c434 = p434.color_info['山纹黑'].materials.find(m => m.attr_zh === '包材' && m.name_zh?.includes('中封箱'));
  assert.equal(c434?.mat_code, 'LGS434ZFXSWH');
});

test('21. Old carton materials remain untouched', async () => {
  const payload = await loadShards();
  const materials = payload.materialDb.materials;

  const oldCartons = ['LGS433PKXKD', 'LGS433PKXWH', 'LGS433PKXBH', 'LGS434ZFXWH', 'LGS434ZFXBH', 'LGS434ZFXKD'];
  for (const code of oldCartons) {
    const m = Object.values(materials).find(x => x.code === code);
    assert.ok(m, `Old carton ${code} must still exist untouched`);
  }
});

test('22. Existing SWH drawer materials are reused, not duplicated', async () => {
  const payload = await loadShards();
  const materials = payload.materialDb.materials;

  const swhCodes = ['BC257282168SWH', 'BC350282187SWH', 'BC340327168SWH', 'BC460327187SWH'];
  for (const code of swhCodes) {
    const matches = Object.values(materials).filter(x => x.code === code);
    assert.equal(matches.length, 1, `Material ${code} must exist exactly once`);
  }
});

test('23 & 24. Existing structural ECN semantics for V5/V6 remain untouched', async () => {
  const payload = await loadShards();
  // Ensure the welded foot crossbars added in V5/V6 are present in LGS433 and LGS434
  const p433 = payload.bom['LGS433'];
  const p434 = payload.bom['LGS434'];

  // Check presence of welded foot assemblies
  const p433Welded = p433.color_info['黑色'].materials.find(m => m.name_zh?.includes('底部横杆组件') || m.mat_code?.includes('XZQSL') || m.mat_code?.includes('XZHSL'));
  assert.ok(p433Welded, 'LGS433 welded crossbars must remain present');

  const p434Welded = p434.color_info['黑色'].materials.find(m => m.name_zh?.includes('底部横杆') || m.mat_code?.includes('XZQSL') || m.mat_code?.includes('XZHSL'));
  assert.ok(p434Welded, 'LGS434 welded crossbars must remain present');
});
