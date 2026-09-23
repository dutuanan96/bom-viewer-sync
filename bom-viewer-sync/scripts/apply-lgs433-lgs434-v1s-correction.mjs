/**
 * Deterministic, idempotent ECN correction script for LGS433 V5 and LGS434 V6 drafts.
 * 
 * Strictly enforces:
 * 1. Precondition guards on revision lifecycle and material identities.
 * 2. Idempotent application (running once or multiple times produces identical canonical data).
 * 3. Exact unique hardware pack child counts (no duplicate tuples, no duplicate IDs).
 * 4. Full preservation of historical old hardware pack metadata.
 * 5. Full predecessor metadata propagation for new V1S hardware pack rows.
 * 6. Product.colors array synchronized with color_info keys for LGS433 and LGS434.
 * 7. Change-control and BOM history recording in manifest.json.
 * 8. Historical snapshots V4.1 and V5.2 remain completely immutable.
 * 9. Draft state preserved: V5 and V6 remain DRAFT without release.
 */
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { clone } from '../src/domain/materials.js';
import { syncLegacyBomFromMaterialDb } from '../src/domain/relationships.js';
import { assertLogicalShardCount, buildLogicalShardFiles, parseLogicalShardFiles, toRepositoryShardFiles } from '../src/domain/sharded-files.js';
import { stableId } from '../src/shared/primitives.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const dataRoot = path.join(repoRoot, 'data');
const CORRECTION_TIMESTAMP = '2026-09-23T10:45:00.000Z';

export async function loadCurrentPayload() {
  const logicalFiles = new Map();
  for (const logicalPath of ['manifest.json', 'materials.json']) {
    const absolutePath = path.join(dataRoot, logicalPath);
    if (!lstatSync(absolutePath).isFile()) throw new Error(`Canonical shard is not a file: ${logicalPath}`);
    logicalFiles.set(logicalPath, readFileSync(absolutePath, 'utf8'));
  }

  const productsRoot = path.join(dataRoot, 'products');
  for (const entry of readdirSync(productsRoot, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error(`Canonical product shard is not a file: ${entry.name}`);
    const logicalPath = `products/${entry.name}`;
    logicalFiles.set(logicalPath, readFileSync(path.join(productsRoot, entry.name), 'utf8'));
  }

  assertLogicalShardCount(logicalFiles);
  return await parseLogicalShardFiles(logicalFiles);
}

export function assertPreconditions(payload) {
  // 1. Check LGS433 revision state
  const r433 = payload.productRevisions?.['LGS433'];
  if (!r433) throw new Error('Precondition failed: Missing LGS433 in productRevisions');
  if (r433.currentRevision !== 'V5') {
    throw new Error(`Precondition failed: LGS433 currentRevision expected V5, got ${r433.currentRevision}`);
  }
  if (r433.currentRevisionInfo?.workflowState !== 'draft') {
    throw new Error(`Precondition failed: LGS433 workflowState expected draft, got ${r433.currentRevisionInfo?.workflowState}`);
  }
  if (r433.effectiveRevision !== 'V4.1') {
    throw new Error(`Precondition failed: LGS433 effectiveRevision expected V4.1, got ${r433.effectiveRevision}`);
  }

  // 2. Check LGS434 revision state
  const r434 = payload.productRevisions?.['LGS434'];
  if (!r434) throw new Error('Precondition failed: Missing LGS434 in productRevisions');
  if (r434.currentRevision !== 'V6') {
    throw new Error(`Precondition failed: LGS434 currentRevision expected V6, got ${r434.currentRevision}`);
  }
  if (r434.currentRevisionInfo?.workflowState !== 'draft') {
    throw new Error(`Precondition failed: LGS434 workflowState expected draft, got ${r434.currentRevisionInfo?.workflowState}`);
  }
  if (r434.effectiveRevision !== 'V5.2') {
    throw new Error(`Precondition failed: LGS434 effectiveRevision expected V5.2, got ${r434.effectiveRevision}`);
  }

  // 3. Verify old hardware pack materials exist with expected IDs
  const materials = payload.materialDb.materials;
  const expectedOld = [
    ['LGS433WJBBH', 'mat_f21qte'],
    ['LGS433WJBWH', 'mat_xhsgou'],
    ['LGS434WJBBH', 'mat_1l7qniw'],
    ['LGS434WJBWH', 'mat_wo2pto']
  ];
  for (const [code, expectedId] of expectedOld) {
    const mat = materials[expectedId];
    if (!mat || mat.code !== code) {
      throw new Error(`Precondition failed: Expected material ${code} with ID ${expectedId}`);
    }
  }

  // 4. Verify existing SWH drawer materials
  const expectedSwh = [
    ['BC257282168SWH', 'mat_bc257282168swh'],
    ['BC350282187SWH', 'mat_bc350282187swh'],
    ['BC340327168SWH', 'mat_bc340327168swh'],
    ['BC460327187SWH', 'mat_bc460327187swh']
  ];
  for (const [code, expectedId] of expectedSwh) {
    const mat = materials[expectedId];
    if (!mat || mat.code !== code) {
      throw new Error(`Precondition failed: Expected existing SWH drawer material ${code} with ID ${expectedId}`);
    }
  }
}

export function applyCorrection(payload) {
  assertPreconditions(payload);

  const materials = payload.materialDb.materials;
  let bomEntries = payload.materialDb.bomEntries;

  // 1. Define new materials (11 materials)
  const newMaterials = [
    // LGS433 Hardware Packs V1S
    {
      id: 'mat_lgs433wjbbhv1s',
      code: 'LGS433WJBBHV1S',
      name: { zh: 'LGS433五金包', vi: 'LGS433Túi ngũ kim' },
      spec: { zh: '详见明细', vi: 'Xem chi tiết' },
      material: { zh: '无', vi: 'không' },
      color: { zh: '黑色', vi: 'màu đen' },
      attr: { zh: '零件', vi: 'linh kiện' },
      unit: { zh: '套', vi: 'bộ' },
      drawings: [],
      models3d: []
    },
    {
      id: 'mat_lgs433wjbwhv1s',
      code: 'LGS433WJBWHV1S',
      name: { zh: 'LGS433五金包', vi: 'LGS433Túi ngũ kim' },
      spec: { zh: '详见明细', vi: 'Xem chi tiết' },
      material: { zh: '无', vi: 'không' },
      color: { zh: '白色', vi: 'màu trắng' },
      attr: { zh: '零件', vi: 'linh kiện' },
      unit: { zh: '套', vi: 'bộ' },
      drawings: [],
      models3d: []
    },
    // LGS434 Hardware Packs V1S
    {
      id: 'mat_lgs434wjbbhv1s',
      code: 'LGS434WJBBHV1S',
      name: { zh: 'LGS434五金包', vi: 'LGS434Túi ngũ kim' },
      spec: { zh: '详见明细', vi: 'Xem chi tiết' },
      material: { zh: '无', vi: 'không' },
      color: { zh: '黑色', vi: 'màu đen' },
      attr: { zh: '零件', vi: 'linh kiện' },
      unit: { zh: '套', vi: 'bộ' },
      drawings: [],
      models3d: []
    },
    {
      id: 'mat_lgs434wjbwhv1s',
      code: 'LGS434WJBWHV1S',
      name: { zh: 'LGS434五金包', vi: 'LGS434Túi ngũ kim' },
      spec: { zh: '详见明细', vi: 'Xem chi tiết' },
      material: { zh: '无', vi: 'không' },
      color: { zh: '白色', vi: 'màu trắng' },
      attr: { zh: '零件', vi: 'linh kiện' },
      unit: { zh: '套', vi: 'bộ' },
      drawings: [],
      models3d: []
    },
    // LGS433 Cartons (1185×340×105mm)
    {
      id: 'mat_lgs433pkxkdv1s',
      code: 'LGS433PKXKDV1S',
      name: { zh: '平口箱（LGS433KD02V1S）', vi: 'thùng carton (LGS433KD02V1S)' },
      spec: { zh: '1185×340×105mm', vi: '1185×340×105mm' },
      material: { zh: '瓦楞纸', vi: 'giấy carton' },
      color: { zh: '纸色', vi: 'màu giấy' },
      attr: { zh: '包材', vi: 'vật liệu đóng gói' },
      unit: { zh: '个', vi: 'cái' },
      drawings: [],
      models3d: []
    },
    {
      id: 'mat_lgs433pkxwhv1s',
      code: 'LGS433PKXWHV1S',
      name: { zh: '平口箱（LGS433WH02V1S）', vi: 'thùng carton (LGS433WH02V1S)' },
      spec: { zh: '1185×340×105mm', vi: '1185×340×105mm' },
      material: { zh: '瓦楞纸', vi: 'giấy carton' },
      color: { zh: '纸色', vi: 'màu giấy' },
      attr: { zh: '包材', vi: 'vật liệu đóng gói' },
      unit: { zh: '个', vi: 'cái' },
      drawings: [],
      models3d: []
    },
    {
      id: 'mat_lgs433pkxbhv1s',
      code: 'LGS433PKXBHV1S',
      name: { zh: '平口箱（LGS433BH02V1S）', vi: 'thùng carton (LGS433BH02V1S)' },
      spec: { zh: '1185×340×105mm', vi: '1185×340×105mm' },
      material: { zh: '瓦楞纸', vi: 'giấy carton' },
      color: { zh: '纸色', vi: 'màu giấy' },
      attr: { zh: '包材', vi: 'vật liệu đóng gói' },
      unit: { zh: '个', vi: 'cái' },
      drawings: [],
      models3d: []
    },
    {
      id: 'mat_lgs433pkxswh',
      code: 'LGS433PKXSWH',
      name: { zh: '平口箱（LGS433B201S）', vi: 'thùng carton (LGS433B201S)' },
      spec: { zh: '1185×340×105mm', vi: '1185×340×105mm' },
      material: { zh: '瓦楞纸', vi: 'giấy carton' },
      color: { zh: '纸色', vi: 'màu giấy' },
      attr: { zh: '包材', vi: 'vật liệu đóng gói' },
      unit: { zh: '个', vi: 'cái' },
      drawings: [],
      models3d: []
    },
    // LGS434 Cartons (860×410×145mm)
    {
      id: 'mat_lgs434zfxwhv1s',
      code: 'LGS434ZFXWHV1S',
      name: { zh: '中封箱（LGS434WH02V1S）', vi: 'thùng đóng giữa (LGS434WH02V1S)' },
      spec: { zh: '860×410×145mm', vi: '860×410×145mm' },
      material: { zh: '瓦楞纸', vi: 'giấy carton' },
      color: { zh: '纸色', vi: 'màu giấy' },
      attr: { zh: '包材', vi: 'vật liệu đóng gói' },
      unit: { zh: '个', vi: 'cái' },
      drawings: [],
      models3d: []
    },
    {
      id: 'mat_lgs434zfxbhv1s',
      code: 'LGS434ZFXBHV1S',
      name: { zh: '中封箱（LGS434BH02V1S）', vi: 'thùng đóng giữa (LGS434BH02V1S)' },
      spec: { zh: '860×410×145mm', vi: '860×410×145mm' },
      material: { zh: '瓦楞纸', vi: 'giấy carton' },
      color: { zh: '纸色', vi: 'màu giấy' },
      attr: { zh: '包材', vi: 'vật liệu đóng gói' },
      unit: { zh: '个', vi: 'cái' },
      drawings: [],
      models3d: []
    },
    {
      id: 'mat_lgs434zfxswh',
      code: 'LGS434ZFXSWH',
      name: { zh: '中封箱（LGS434B201S）', vi: 'thùng đóng giữa (LGS434B201S)' },
      spec: { zh: '860×410×145mm', vi: '860×410×145mm' },
      material: { zh: '瓦楞纸', vi: 'giấy carton' },
      color: { zh: '纸色', vi: 'màu giấy' },
      attr: { zh: '包材', vi: 'vật liệu đóng gói' },
      unit: { zh: '个', vi: 'cái' },
      drawings: [],
      models3d: []
    }
  ];

  for (const m of newMaterials) {
    const existingWithSameCode = Object.values(materials).find(x => x.code === m.code);
    if (existingWithSameCode && existingWithSameCode.id !== m.id) {
      throw new Error(`Collision guard: Material ${m.code} already exists with different ID ${existingWithSameCode.id}`);
    }
    materials[m.id] = m;
  }

  // 2. Load historical snapshot authority rows for old hardware packs
  const v41 = payload.productRevisions?.['LGS433']?.revisions.find(r => r.revision === 'V4.1');
  const v52 = payload.productRevisions?.['LGS434']?.revisions.find(r => r.revision === 'V5.2');
  if (!v41 || !v52) throw new Error('Historical snapshots V4.1 or V5.2 missing from productRevisions');

  const v41Entries = v41.snapshot.materialDb.bomEntries.filter(e => e.parentType === 'material');
  const v52Entries = v52.snapshot.materialDb.bomEntries.filter(e => e.parentType === 'material');

  const old433BHRows = v41Entries.filter(e => e.parentId === 'mat_f21qte').map(r => clone(r));
  const old433WHRows = v41Entries.filter(e => e.parentId === 'mat_xhsgou').map(r => clone(r));
  const old434BHRows = v52Entries.filter(e => e.parentId === 'mat_1l7qniw').map(r => clone(r));
  const old434WHRows = v52Entries.filter(e => e.parentId === 'mat_wo2pto').map(r => clone(r));

  if (old433BHRows.length !== 20 || old433WHRows.length !== 10 || old434BHRows.length !== 12 || old434WHRows.length !== 12) {
    throw new Error(`Unexpected historical hardware pack row counts in snapshots: ${old433BHRows.length}, ${old433WHRows.length}, ${old434BHRows.length}, ${old434WHRows.length}`);
  }

  // 3. Construct new V1S hardware pack rows from predecessor rows with full metadata preserved
  function buildV1SRows({ predecessorRows, parentId, productCode, scopeColor, isWhite, is434 }) {
    const rows = [];
    const colorVerZh = scopeColor;
    const colorVerVi = scopeColor === '山纹黑'
      ? 'màu đen vân gỗ'
      : (scopeColor === '复古色' ? 'màu gỗ cổ' : (scopeColor === '白色' ? 'màu trắng' : 'màu đen'));

    for (const pred of predecessorRows) {
      const childMatId = pred.materialId || pred.childMaterialId;
      const isM6x12 = childMatId === (isWhite ? 'mat_cau6z8' : 'mat_6zvz0v');
      const isNylon = childMatId === (isWhite ? 'mat_1kajjg0' : 'mat_f3e6hw');

      if (isNylon) {
        // Replace nylon washer with M4x22, preserving predecessor relation metadata
        const m4x22Id = isWhite ? 'mat_nlpls4022wz' : 'mat_nlpls4022bz';
        rows.push({
          id: stableId('bomc', `v1s|${parentId}|${m4x22Id}|${productCode}|${scopeColor}`),
          parentType: 'material',
          parentId,
          productCode,
          color: scopeColor,
          materialId: m4x22Id,
          childMaterialId: m4x22Id,
          stt: pred.stt || '',
          comp_code: pred.comp_code || '',
          qty: '4+1',
          color_ver: colorVerZh,
          color_ver_vi: colorVerVi,
          order: pred.order ?? 0
        });
      } else if (isM6x12) {
        // M6x12: 4+1 for 433, 8+1 for 434
        const m6Qty = is434 ? '8+1' : '4+1';
        rows.push({
          ...clone(pred),
          id: stableId('bomc', `v1s|${parentId}|${childMatId}|${productCode}|${scopeColor}`),
          parentId,
          color: scopeColor,
          color_ver: colorVerZh,
          color_ver_vi: colorVerVi,
          qty: m6Qty
        });
      } else {
        // Unchanged child: clone predecessor row completely
        rows.push({
          ...clone(pred),
          id: stableId('bomc', `v1s|${parentId}|${childMatId}|${productCode}|${scopeColor}`),
          parentId,
          color: scopeColor,
          color_ver: colorVerZh,
          color_ver_vi: colorVerVi
        });
      }
    }
    return rows;
  }

  const v433BHPred = old433BHRows.filter(r => r.color === '黑色');
  const v433KDPred = old433BHRows.filter(r => r.color === '复古色');

  const newV1SRows = [
    // LGS433WJBBHV1S (30 rows = 10 * 3 colors)
    ...buildV1SRows({ predecessorRows: v433KDPred, parentId: 'mat_lgs433wjbbhv1s', productCode: 'LGS433', scopeColor: '复古色', isWhite: false, is434: false }),
    ...buildV1SRows({ predecessorRows: v433BHPred, parentId: 'mat_lgs433wjbbhv1s', productCode: 'LGS433', scopeColor: '黑色', isWhite: false, is434: false }),
    ...buildV1SRows({ predecessorRows: v433BHPred, parentId: 'mat_lgs433wjbbhv1s', productCode: 'LGS433', scopeColor: '山纹黑', isWhite: false, is434: false }),

    // LGS433WJBWHV1S (10 rows = 10 * 1 color)
    ...buildV1SRows({ predecessorRows: old433WHRows, parentId: 'mat_lgs433wjbwhv1s', productCode: 'LGS433', scopeColor: '白色', isWhite: true, is434: false }),

    // LGS434WJBBHV1S (24 rows = 12 * 2 colors)
    ...buildV1SRows({ predecessorRows: old434BHRows, parentId: 'mat_lgs434wjbbhv1s', productCode: 'LGS434', scopeColor: '黑色', isWhite: false, is434: true }),
    ...buildV1SRows({ predecessorRows: old434BHRows, parentId: 'mat_lgs434wjbbhv1s', productCode: 'LGS434', scopeColor: '山纹黑', isWhite: false, is434: true }),

    // LGS434WJBWHV1S (12 rows = 12 * 1 color)
    ...buildV1SRows({ predecessorRows: old434WHRows, parentId: 'mat_lgs434wjbwhv1s', productCode: 'LGS434', scopeColor: '白色', isWhite: true, is434: true }),
  ];

  if (newV1SRows.length !== 76) {
    throw new Error(`Expected exactly 76 V1S hardware pack rows, got ${newV1SRows.length}`);
  }

  // 4. Idempotently replace hardware pack child relations
  // Remove ALL existing relations for ALL 8 hardware packs first
  const allTargetHwPackIds = new Set([
    'mat_f21qte', 'mat_xhsgou', 'mat_1l7qniw', 'mat_wo2pto',
    'mat_lgs433wjbbhv1s', 'mat_lgs433wjbwhv1s', 'mat_lgs434wjbbhv1s', 'mat_lgs434wjbwhv1s'
  ]);
  bomEntries = bomEntries.filter(e => !(e.parentType === 'material' && allTargetHwPackIds.has(e.parentId)));

  // Add the 54 restored historical rows + 76 V1S rows
  bomEntries.push(
    ...old433BHRows,
    ...old433WHRows,
    ...old434BHRows,
    ...old434WHRows,
    ...newV1SRows
  );

  // 5. Update product-level entries for LGS433 and LGS434
  const cartonCodeToNewId = {
    LGS433PKXKD: 'mat_lgs433pkxkdv1s',
    LGS433PKXWH: 'mat_lgs433pkxwhv1s',
    LGS433PKXBH: 'mat_lgs433pkxbhv1s',
    LGS434ZFXWH: 'mat_lgs434zfxwhv1s',
    LGS434ZFXBH: 'mat_lgs434zfxbhv1s',
  };

  const hwPackCodeToNewId = {
    LGS433: {
      复古色: 'mat_lgs433wjbbhv1s',
      白色: 'mat_lgs433wjbwhv1s',
      黑色: 'mat_lgs433wjbbhv1s'
    },
    LGS434: {
      白色: 'mat_lgs434wjbwhv1s',
      黑色: 'mat_lgs434wjbbhv1s'
    }
  };

  for (const entry of bomEntries) {
    if (entry.parentType !== 'product') continue;
    const pCode = entry.productCode;
    const color = entry.color;
    const matCode = materials[entry.materialId]?.code;

    if (matCode && hwPackCodeToNewId[pCode]?.[color] && matCode.startsWith(pCode + 'WJB')) {
      entry.materialId = hwPackCodeToNewId[pCode][color];
    }
    if (matCode && cartonCodeToNewId[matCode]) {
      entry.materialId = cartonCodeToNewId[matCode];
    }
  }

  // 6. Idempotently create product-level BOM entries for 山纹黑 (B201S)
  // Remove any pre-existing 山纹黑 entries for LGS433 and LGS434 before recreating
  bomEntries = bomEntries.filter(e => !(e.parentType === 'product' && ['LGS433', 'LGS434'].includes(e.productCode) && e.color === '山纹黑'));

  const lgs433BlackEntries = bomEntries.filter(e => e.parentType === 'product' && e.productCode === 'LGS433' && e.color === '黑色');
  const lgs433SwhEntries = lgs433BlackEntries.map((e, idx) => {
    let matId = e.materialId;
    const matCode = materials[matId]?.code;
    if (matCode === 'LGS433PKXBHV1S' || matCode === 'LGS433PKXBH') matId = 'mat_lgs433pkxswh';
    else if (matCode === 'BC257282168BH') matId = 'mat_bc257282168swh';
    else if (matCode === 'BC350282187BH') matId = 'mat_bc350282187swh';

    return {
      ...clone(e),
      id: stableId('bom', `LGS433|山纹黑|${matId}|${idx}`),
      color: '山纹黑',
      color_ver: '山纹黑',
      color_ver_vi: 'màu đen vân gỗ',
      materialId: matId
    };
  });

  const lgs434BlackEntries = bomEntries.filter(e => e.parentType === 'product' && e.productCode === 'LGS434' && e.color === '黑色');
  const lgs434SwhEntries = lgs434BlackEntries.map((e, idx) => {
    let matId = e.materialId;
    const matCode = materials[matId]?.code;
    if (matCode === 'LGS434ZFXBHV1S' || matCode === 'LGS434ZFXBH') matId = 'mat_lgs434zfxswh';
    else if (matCode === 'BC340327168BH') matId = 'mat_bc340327168swh';
    else if (matCode === 'BC460327187BH') matId = 'mat_bc460327187swh';

    return {
      ...clone(e),
      id: stableId('bom', `LGS434|山纹黑|${matId}|${idx}`),
      color: '山纹黑',
      color_ver: '山纹黑',
      color_ver_vi: 'màu đen vân gỗ',
      materialId: matId
    };
  });

  bomEntries.push(...lgs433SwhEntries, ...lgs434SwhEntries);
  payload.materialDb.bomEntries = bomEntries;

  // 7. Update Product records (color_info, skus, names, and product.colors array)
  const p433 = payload.bom['LGS433'];
  p433.color_info['复古色'].sku = 'LGS433KD02V1S';
  p433.color_info['白色'].sku = 'LGS433WH02V1S';
  p433.color_info['黑色'].sku = 'LGS433BH02V1S';
  p433.color_info['山纹黑'] = {
    sku: 'LGS433B201S',
    name: '美规山纹黑-3列3层灯电款开放空间8抽斗柜-45inch',
    name_zh: '美规山纹黑-3列3层灯电款开放空间8抽斗柜-45inch',
    name_vi: 'LGS433-3 cột 3 Phiên bản tầng mở có đèn và điện 8 tủ ngăn kéo-45inch - màu đen vân gỗ',
    size: p433.color_info['黑色'].size,
    color_ver: '山纹黑',
    color_ver_vi: 'màu đen vân gỗ',
    materials: []
  };
  if (!p433.colors.includes('山纹黑')) {
    p433.colors = [...p433.colors, '山纹黑'];
  }

  const p434 = payload.bom['LGS434'];
  p434.color_info['白色'].sku = 'LGS434WH02V1S';
  p434.color_info['黑色'].sku = 'LGS434BH02V1S';
  p434.color_info['山纹黑'] = {
    sku: 'LGS434B201S',
    name: '美规山纹黑-3列3层灯电款开放空间8抽斗柜-57inch',
    name_zh: '美规山纹黑-3列3层灯电款开放空间8抽斗柜-57inch',
    name_vi: 'LGS434-3 cột 3 Phiên bản tầng mở có đèn và điện 8 tủ ngăn kéo-57inch - màu đen vân gỗ',
    size: p434.color_info['黑色'].size,
    color_ver: '山纹黑',
    color_ver_vi: 'màu đen vân gỗ',
    materials: []
  };
  if (!p434.colors.includes('山纹黑')) {
    p434.colors = [...p434.colors, '山纹黑'];
  }

  // 8. Change control & Manifest history (without releasing any revision)
  payload.updatedAt = CORRECTION_TIMESTAMP;

  // Add change-control notification if not already present
  if (!payload.notifications) payload.notifications = [];
  const notifId = 'notif_ecn_433_434_v1s_draft';
  if (!payload.notifications.some(n => n.id === notifId)) {
    payload.notifications.unshift({
      id: notifId,
      type: 'ecn-draft-correction',
      actor: 'admin',
      createdAt: CORRECTION_TIMESTAMP,
      version: 2,
      summary: 'ECN修正: LGS433 V5 / LGS434 V6 新结构五金包V1S、独立纸箱与B201S变体',
      details: '修正新结构SKU为V1S，创建独立V1S五金包母件并恢复旧五金包完整历史构成，创建独立瓦楞纸箱并引入B201S山纹黑变体（保持Draft状态未发布）。'
    });
  }

  // Add BOM history entries for LGS433 and LGS434 if not already present
  if (!payload.bomHistory) payload.bomHistory = {};
  if (!payload.bomHistory['LGS433']) payload.bomHistory['LGS433'] = [];
  const h433Id = 'history_lgs433_v5_v1s_correction';
  if (!payload.bomHistory['LGS433'].some(h => h.id === h433Id)) {
    payload.bomHistory['LGS433'].unshift({
      id: h433Id,
      productCode: 'LGS433',
      revision: 'V5',
      action: 'save',
      actor: 'admin',
      reason: 'ECN修正: 新结构SKU更名V1S，引入独立五金包LGS433WJBBHV1S/WHV1S，1185×340×105mm独立纸箱及B201S变体（保持Draft）',
      createdAt: CORRECTION_TIMESTAMP
    });
  }

  if (!payload.bomHistory['LGS434']) payload.bomHistory['LGS434'] = [];
  const h434Id = 'history_lgs434_v6_v1s_correction';
  if (!payload.bomHistory['LGS434'].some(h => h.id === h434Id)) {
    payload.bomHistory['LGS434'].unshift({
      id: h434Id,
      productCode: 'LGS434',
      revision: 'V6',
      action: 'save',
      actor: 'admin',
      reason: 'ECN修正: 新结构SKU更名V1S，引入独立五金包LGS434WJBBHV1S/WHV1S，860×410×145mm独立纸箱及B201S变体（保持Draft）',
      createdAt: CORRECTION_TIMESTAMP
    });
  }

  // 9. Sync legacy product BOM from materialDb
  syncLegacyBomFromMaterialDb(payload);

  return payload;
}

export function savePayloadToShards(payload) {
  const logicalFiles = buildLogicalShardFiles(payload);
  const repoFiles = toRepositoryShardFiles(logicalFiles, 'data');
  for (const [relPath, content] of Object.entries(repoFiles)) {
    const absPath = path.join(repoRoot, relPath);
    writeFileSync(absPath, content, 'utf8');
  }
}

// When run directly as a script
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  console.log('Loading canonical shards...');
  const payload = await loadCurrentPayload();
  console.log('Applying correction...');
  applyCorrection(payload);
  console.log('Writing canonical shards...');
  savePayloadToShards(payload);
  console.log('Done!');
}
