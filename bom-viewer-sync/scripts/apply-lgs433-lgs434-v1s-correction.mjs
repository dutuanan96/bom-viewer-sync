/**
 * Deterministic ECN correction script for LGS433 V5 and LGS434 V6 drafts.
 * 
 * Corrects:
 * 1. SKU naming with V1S
 * 2. New hardware pack parents (LGS433WJBBHV1S, LGS433WJBWHV1S, LGS434WJBBHV1S, LGS434WJBWHV1S)
 * 3. Restores old hardware pack parent compositions (LGS433WJBBH, LGS433WJBWH, LGS434WJBBH, LGS434WJBWH)
 * 4. Adds B201S / 山纹黑 variants
 * 5. Creates SKU-specific cartons with correct dimensions
 * 6. Reuses existing SWH fabric drawer materials
 * 7. Preserves historical released snapshots V4.1 and V5.2 unchanged
 * 8. Keeps V5/V6 as DRAFT without release
 */
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { syncLegacyBomFromMaterialDb } from '../src/domain/relationships.js';
import { assertLogicalShardCount, buildLogicalShardFiles, parseLogicalShardFiles, toRepositoryShardFiles } from '../src/domain/sharded-files.js';
import { stableId } from '../src/shared/primitives.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const dataRoot = path.join(repoRoot, 'data');

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

export function applyCorrection(payload) {
  const materials = payload.materialDb.materials;
  let bomEntries = payload.materialDb.bomEntries;

  // 1. Define new materials
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
    if (!materials[m.id]) {
      materials[m.id] = m;
    }
  }

  // 2. Remove existing child relations for the 4 old hardware packs from bomEntries
  const oldHwPackIds = new Set(['mat_f21qte', 'mat_xhsgou', 'mat_1l7qniw', 'mat_wo2pto']);
  bomEntries = bomEntries.filter(e => !(e.parentType === 'material' && oldHwPackIds.has(e.parentId)));

  // 3. Define historical child relations for OLD hardware packs (restoration)
  // Child material ID lookup:
  const LNSLSD65254BZ = 'mat_1atkf4g';
  const NLPLS6022BZ = 'mat_1112bk6';
  const NLPLS6010BZ = 'mat_6zvz0v';
  const BCLS129228BH = 'mat_vz636a';
  const ZGLS4010CZ = 'mat_1bb87nh';
  const SLPZLS6030WH = 'mat_3cqqc3';
  const ZGLS3560BH = 'mat_qqu0zl';
  const TZJD629825BH = 'mat_gm18ar';
  const NLDP15508020BH = 'mat_f3e6hw';
  const PTZGLS6308BZ = 'mat_1cjiqmc';

  const NLPLS6022WZ = 'mat_zmmild';
  const NLPLS6010WZ = 'mat_cau6z8';
  const BCLS129228WH = 'mat_1fhhxvk';
  const ZGLS4010WZ = 'mat_m5oo3m';
  const ZGLS3560WH = 'mat_zgls3560wh_mrdf0jhj';
  const TZJD629825WH = 'mat_1h27jfj';
  const NLDP15508020WH = 'mat_1kajjg0';
  const PTZGLS6308WZ = 'mat_vwmnnz';

  const MS6030YS = 'mat_144gpyx';
  const LNBS57253BZ = 'mat_1h3f36d';

  // New M4x22 screws:
  const NLPLS4022BZ = 'mat_nlpls4022bz';
  const NLPLS4022WZ = 'mat_nlpls4022wz';

  const restoredOldRelations = [
    // LGS433WJBBH (mat_f21qte) for 复古色 and 黑色 (M6x12: 8+2, nylon: 2, no M4x22)
    ...['复古色', '黑色'].flatMap(color => [
      { parentId: 'mat_f21qte', materialId: LNSLSD65254BZ, qty: '1', productCode: 'LGS433', color, order: 0 },
      { parentId: 'mat_f21qte', materialId: NLPLS6022BZ, qty: '26+2', productCode: 'LGS433', color, order: 1 },
      { parentId: 'mat_f21qte', materialId: NLPLS6010BZ, qty: '8+2', productCode: 'LGS433', color, order: 2 },
      { parentId: 'mat_f21qte', materialId: BCLS129228BH, qty: '8', productCode: 'LGS433', color, order: 3 },
      { parentId: 'mat_f21qte', materialId: ZGLS4010CZ, qty: '16+2', productCode: 'LGS433', color, order: 4 },
      { parentId: 'mat_f21qte', materialId: SLPZLS6030WH, qty: '2', productCode: 'LGS433', color, order: 5 },
      { parentId: 'mat_f21qte', materialId: ZGLS3560BH, qty: '2', productCode: 'LGS433', color, order: 6 },
      { parentId: 'mat_f21qte', materialId: TZJD629825BH, qty: '6', productCode: 'LGS433', color, order: 7 },
      { parentId: 'mat_f21qte', materialId: NLDP15508020BH, qty: '2', productCode: 'LGS433', color, order: 8 },
      { parentId: 'mat_f21qte', materialId: PTZGLS6308BZ, qty: '2', productCode: 'LGS433', color, order: 9 }
    ]),
    // LGS433WJBWH (mat_xhsgou) for 白色 (M6x12: 8+2, nylon: 2, no M4x22)
    ...[
      { parentId: 'mat_xhsgou', materialId: LNSLSD65254BZ, qty: '1', productCode: 'LGS433', color: '白色', order: 0 },
      { parentId: 'mat_xhsgou', materialId: NLPLS6022WZ, qty: '26+2', productCode: 'LGS433', color: '白色', order: 1 },
      { parentId: 'mat_xhsgou', materialId: NLPLS6010WZ, qty: '8+2', productCode: 'LGS433', color: '白色', order: 2 },
      { parentId: 'mat_xhsgou', materialId: BCLS129228WH, qty: '8', productCode: 'LGS433', color: '白色', order: 3 },
      { parentId: 'mat_xhsgou', materialId: ZGLS4010WZ, qty: '16+2', productCode: 'LGS433', color: '白色', order: 4 },
      { parentId: 'mat_xhsgou', materialId: SLPZLS6030WH, qty: '2', productCode: 'LGS433', color: '白色', order: 5 },
      { parentId: 'mat_xhsgou', materialId: ZGLS3560WH, qty: '2', productCode: 'LGS433', color: '白色', order: 6 },
      { parentId: 'mat_xhsgou', materialId: TZJD629825WH, qty: '6', productCode: 'LGS433', color: '白色', order: 7 },
      { parentId: 'mat_xhsgou', materialId: NLDP15508020WH, qty: '2', productCode: 'LGS433', color: '白色', order: 8 },
      { parentId: 'mat_xhsgou', materialId: PTZGLS6308WZ, qty: '2', productCode: 'LGS433', color: '白色', order: 9 }
    ],
    // LGS434WJBBH (mat_1l7qniw) for 黑色 (M6x12: 12+2, nylon: 2, no M4x22)
    ...[
      { parentId: 'mat_1l7qniw', materialId: LNSLSD65254BZ, qty: '2', productCode: 'LGS434', color: '黑色', order: 0 },
      { parentId: 'mat_1l7qniw', materialId: NLPLS6022BZ, qty: '34+2', productCode: 'LGS434', color: '黑色', order: 1 },
      { parentId: 'mat_1l7qniw', materialId: NLPLS6010BZ, qty: '12+2', productCode: 'LGS434', color: '黑色', order: 2 },
      { parentId: 'mat_1l7qniw', materialId: BCLS129228BH, qty: '8', productCode: 'LGS434', color: '黑色', order: 3 },
      { parentId: 'mat_1l7qniw', materialId: ZGLS4010CZ, qty: '16+2', productCode: 'LGS434', color: '黑色', order: 4 },
      { parentId: 'mat_1l7qniw', materialId: SLPZLS6030WH, qty: '2', productCode: 'LGS434', color: '黑色', order: 5 },
      { parentId: 'mat_1l7qniw', materialId: ZGLS3560BH, qty: '2', productCode: 'LGS434', color: '黑色', order: 6 },
      { parentId: 'mat_1l7qniw', materialId: TZJD629825BH, qty: '6', productCode: 'LGS434', color: '黑色', order: 7 },
      { parentId: 'mat_1l7qniw', materialId: NLDP15508020BH, qty: '2', productCode: 'LGS434', color: '黑色', order: 8 },
      { parentId: 'mat_1l7qniw', materialId: MS6030YS, qty: '3', productCode: 'LGS434', color: '黑色', order: 9 },
      { parentId: 'mat_1l7qniw', materialId: LNBS57253BZ, qty: '1', productCode: 'LGS434', color: '黑色', order: 10 },
      { parentId: 'mat_1l7qniw', materialId: PTZGLS6308BZ, qty: '2', productCode: 'LGS434', color: '黑色', order: 11 }
    ],
    // LGS434WJBWH (mat_wo2pto) for 白色 (M6x12: 12+2, nylon: 2, no M4x22)
    ...[
      { parentId: 'mat_wo2pto', materialId: LNSLSD65254BZ, qty: '2', productCode: 'LGS434', color: '白色', order: 0 },
      { parentId: 'mat_wo2pto', materialId: NLPLS6022WZ, qty: '34+2', productCode: 'LGS434', color: '白色', order: 1 },
      { parentId: 'mat_wo2pto', materialId: NLPLS6010WZ, qty: '12+2', productCode: 'LGS434', color: '白色', order: 2 },
      { parentId: 'mat_wo2pto', materialId: BCLS129228WH, qty: '8', productCode: 'LGS434', color: '白色', order: 3 },
      { parentId: 'mat_wo2pto', materialId: ZGLS4010WZ, qty: '16+2', productCode: 'LGS434', color: '白色', order: 4 },
      { parentId: 'mat_wo2pto', materialId: SLPZLS6030WH, qty: '2', productCode: 'LGS434', color: '白色', order: 5 },
      { parentId: 'mat_wo2pto', materialId: ZGLS3560WH, qty: '2', productCode: 'LGS434', color: '白色', order: 6 },
      { parentId: 'mat_wo2pto', materialId: TZJD629825WH, qty: '6', productCode: 'LGS434', color: '白色', order: 7 },
      { parentId: 'mat_wo2pto', materialId: NLDP15508020WH, qty: '2', productCode: 'LGS434', color: '白色', order: 8 },
      { parentId: 'mat_wo2pto', materialId: MS6030YS, qty: '3', productCode: 'LGS434', color: '白色', order: 9 },
      { parentId: 'mat_wo2pto', materialId: LNBS57253BZ, qty: '1', productCode: 'LGS434', color: '白色', order: 10 },
      { parentId: 'mat_wo2pto', materialId: PTZGLS6308WZ, qty: '2', productCode: 'LGS434', color: '白色', order: 11 }
    ]
  ].map(r => ({
    id: stableId('bomc', `restored|${r.parentId}|${r.materialId}|${r.productCode}|${r.color}|${r.order}`),
    parentType: 'material',
    parentId: r.parentId,
    productCode: r.productCode,
    color: r.color,
    materialId: r.materialId,
    qty: r.qty,
    order: r.order
  }));

  // 4. Define child relations for NEW V1S hardware packs
  const newV1SRelations = [
    // LGS433WJBBHV1S (mat_lgs433wjbbhv1s) for 复古色, 黑色, 山纹黑 (M6x12: 4+1, M4x22: 4+1, no nylon)
    ...['复古色', '黑色', '山纹黑'].flatMap(color => [
      { parentId: 'mat_lgs433wjbbhv1s', materialId: LNSLSD65254BZ, qty: '1', productCode: 'LGS433', color, order: 0 },
      { parentId: 'mat_lgs433wjbbhv1s', materialId: NLPLS6022BZ, qty: '26+2', productCode: 'LGS433', color, order: 1 },
      { parentId: 'mat_lgs433wjbbhv1s', materialId: NLPLS6010BZ, qty: '4+1', productCode: 'LGS433', color, order: 2 },
      { parentId: 'mat_lgs433wjbbhv1s', materialId: BCLS129228BH, qty: '8', productCode: 'LGS433', color, order: 3 },
      { parentId: 'mat_lgs433wjbbhv1s', materialId: ZGLS4010CZ, qty: '16+2', productCode: 'LGS433', color, order: 4 },
      { parentId: 'mat_lgs433wjbbhv1s', materialId: SLPZLS6030WH, qty: '2', productCode: 'LGS433', color, order: 5 },
      { parentId: 'mat_lgs433wjbbhv1s', materialId: ZGLS3560BH, qty: '2', productCode: 'LGS433', color, order: 6 },
      { parentId: 'mat_lgs433wjbbhv1s', materialId: TZJD629825BH, qty: '6', productCode: 'LGS433', color, order: 7 },
      { parentId: 'mat_lgs433wjbbhv1s', materialId: PTZGLS6308BZ, qty: '2', productCode: 'LGS433', color, order: 8 },
      { parentId: 'mat_lgs433wjbbhv1s', materialId: NLPLS4022BZ, qty: '4+1', productCode: 'LGS433', color, order: 9 }
    ]),
    // LGS433WJBWHV1S (mat_lgs433wjbwhv1s) for 白色 (M6x12: 4+1, M4x22: 4+1, no nylon)
    ...[
      { parentId: 'mat_lgs433wjbwhv1s', materialId: LNSLSD65254BZ, qty: '1', productCode: 'LGS433', color: '白色', order: 0 },
      { parentId: 'mat_lgs433wjbwhv1s', materialId: NLPLS6022WZ, qty: '26+2', productCode: 'LGS433', color: '白色', order: 1 },
      { parentId: 'mat_lgs433wjbwhv1s', materialId: NLPLS6010WZ, qty: '4+1', productCode: 'LGS433', color: '白色', order: 2 },
      { parentId: 'mat_lgs433wjbwhv1s', materialId: BCLS129228WH, qty: '8', productCode: 'LGS433', color: '白色', order: 3 },
      { parentId: 'mat_lgs433wjbwhv1s', materialId: ZGLS4010WZ, qty: '16+2', productCode: 'LGS433', color: '白色', order: 4 },
      { parentId: 'mat_lgs433wjbwhv1s', materialId: SLPZLS6030WH, qty: '2', productCode: 'LGS433', color: '白色', order: 5 },
      { parentId: 'mat_lgs433wjbwhv1s', materialId: ZGLS3560WH, qty: '2', productCode: 'LGS433', color: '白色', order: 6 },
      { parentId: 'mat_lgs433wjbwhv1s', materialId: TZJD629825WH, qty: '6', productCode: 'LGS433', color: '白色', order: 7 },
      { parentId: 'mat_lgs433wjbwhv1s', materialId: PTZGLS6308WZ, qty: '2', productCode: 'LGS433', color: '白色', order: 8 },
      { parentId: 'mat_lgs433wjbwhv1s', materialId: NLPLS4022WZ, qty: '4+1', productCode: 'LGS433', color: '白色', order: 9 }
    ],
    // LGS434WJBBHV1S (mat_lgs434wjbbhv1s) for 黑色, 山纹黑 (M6x12: 8+1, M4x22: 4+1, no nylon)
    ...['黑色', '山纹黑'].flatMap(color => [
      { parentId: 'mat_lgs434wjbbhv1s', materialId: LNSLSD65254BZ, qty: '2', productCode: 'LGS434', color, order: 0 },
      { parentId: 'mat_lgs434wjbbhv1s', materialId: NLPLS6022BZ, qty: '34+2', productCode: 'LGS434', color, order: 1 },
      { parentId: 'mat_lgs434wjbbhv1s', materialId: NLPLS6010BZ, qty: '8+1', productCode: 'LGS434', color, order: 2 },
      { parentId: 'mat_lgs434wjbbhv1s', materialId: BCLS129228BH, qty: '8', productCode: 'LGS434', color, order: 3 },
      { parentId: 'mat_lgs434wjbbhv1s', materialId: ZGLS4010CZ, qty: '16+2', productCode: 'LGS434', color, order: 4 },
      { parentId: 'mat_lgs434wjbbhv1s', materialId: SLPZLS6030WH, qty: '2', productCode: 'LGS434', color, order: 5 },
      { parentId: 'mat_lgs434wjbbhv1s', materialId: ZGLS3560BH, qty: '2', productCode: 'LGS434', color, order: 6 },
      { parentId: 'mat_lgs434wjbbhv1s', materialId: TZJD629825BH, qty: '6', productCode: 'LGS434', color, order: 7 },
      { parentId: 'mat_lgs434wjbbhv1s', materialId: MS6030YS, qty: '3', productCode: 'LGS434', color, order: 8 },
      { parentId: 'mat_lgs434wjbbhv1s', materialId: LNBS57253BZ, qty: '1', productCode: 'LGS434', color, order: 9 },
      { parentId: 'mat_lgs434wjbbhv1s', materialId: PTZGLS6308BZ, qty: '2', productCode: 'LGS434', color, order: 10 },
      { parentId: 'mat_lgs434wjbbhv1s', materialId: NLPLS4022BZ, qty: '4+1', productCode: 'LGS434', color, order: 11 }
    ]),
    // LGS434WJBWHV1S (mat_lgs434wjbwhv1s) for 白色 (M6x12: 8+1, M4x22: 4+1, no nylon)
    ...[
      { parentId: 'mat_lgs434wjbwhv1s', materialId: LNSLSD65254BZ, qty: '2', productCode: 'LGS434', color: '白色', order: 0 },
      { parentId: 'mat_lgs434wjbwhv1s', materialId: NLPLS6022WZ, qty: '34+2', productCode: 'LGS434', color: '白色', order: 1 },
      { parentId: 'mat_lgs434wjbwhv1s', materialId: NLPLS6010WZ, qty: '8+1', productCode: 'LGS434', color: '白色', order: 2 },
      { parentId: 'mat_lgs434wjbwhv1s', materialId: BCLS129228WH, qty: '8', productCode: 'LGS434', color: '白色', order: 3 },
      { parentId: 'mat_lgs434wjbwhv1s', materialId: ZGLS4010WZ, qty: '16+2', productCode: 'LGS434', color: '白色', order: 4 },
      { parentId: 'mat_lgs434wjbwhv1s', materialId: SLPZLS6030WH, qty: '2', productCode: 'LGS434', color: '白色', order: 5 },
      { parentId: 'mat_lgs434wjbwhv1s', materialId: ZGLS3560WH, qty: '2', productCode: 'LGS434', color: '白色', order: 6 },
      { parentId: 'mat_lgs434wjbwhv1s', materialId: TZJD629825WH, qty: '6', productCode: 'LGS434', color: '白色', order: 7 },
      { parentId: 'mat_lgs434wjbwhv1s', materialId: MS6030YS, qty: '3', productCode: 'LGS434', color: '白色', order: 8 },
      { parentId: 'mat_lgs434wjbwhv1s', materialId: LNBS57253BZ, qty: '1', productCode: 'LGS434', color: '白色', order: 9 },
      { parentId: 'mat_lgs434wjbwhv1s', materialId: PTZGLS6308WZ, qty: '2', productCode: 'LGS434', color: '白色', order: 10 },
      { parentId: 'mat_lgs434wjbwhv1s', materialId: NLPLS4022WZ, qty: '4+1', productCode: 'LGS434', color: '白色', order: 11 }
    ]
  ].map(r => ({
    id: stableId('bomc', `v1s|${r.parentId}|${r.materialId}|${r.productCode}|${r.color}|${r.order}`),
    parentType: 'material',
    parentId: r.parentId,
    productCode: r.productCode,
    color: r.color,
    materialId: r.materialId,
    qty: r.qty,
    order: r.order
  }));

  bomEntries.push(...restoredOldRelations, ...newV1SRelations);

  // 5. Update product-level entries for LGS433 and LGS434 using material code
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

  // 6. Create product-level BOM entries for 山纹黑 (B201S)
  // Remove any pre-existing 山纹黑 entries for LGS433 and LGS434 if present
  bomEntries = bomEntries.filter(e => !(e.parentType === 'product' && ['LGS433', 'LGS434'].includes(e.productCode) && e.color === '山纹黑'));

  const lgs433BlackEntries = bomEntries.filter(e => e.parentType === 'product' && e.productCode === 'LGS433' && e.color === '黑色');
  const lgs433SwhEntries = lgs433BlackEntries.map((e, idx) => {
    let matId = e.materialId;
    const matCode = materials[matId]?.code;
    if (matCode === 'LGS433PKXBHV1S' || matCode === 'LGS433PKXBH') matId = 'mat_lgs433pkxswh';
    else if (matCode === 'BC257282168BH') matId = 'mat_bc257282168swh';
    else if (matCode === 'BC350282187BH') matId = 'mat_bc350282187swh';

    return {
      ...e,
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
      ...e,
      id: stableId('bom', `LGS434|山纹黑|${matId}|${idx}`),
      color: '山纹黑',
      color_ver: '山纹黑',
      color_ver_vi: 'màu đen vân gỗ',
      materialId: matId
    };
  });

  bomEntries.push(...lgs433SwhEntries, ...lgs434SwhEntries);
  payload.materialDb.bomEntries = bomEntries;

  // 7. Update Product records (color_info, skus, names)
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

  // 8. Sync legacy product BOM from materialDb
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
