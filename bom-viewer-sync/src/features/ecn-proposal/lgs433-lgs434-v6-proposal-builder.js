const CHANGE_REASON = 'ECN-LGS433-V5-LGS434-V6: 移除41底脚，改为44mm底脚直接焊接于新底部横杆组件，改用M4×22内六角螺丝。';

const RELEASE_PREREQUISITES = Object.freeze([
  '更新并验证LGS433/LGS434层板2D图纸：原M6×12安装孔改为Ø5.5。',
  '验证拆除连接片后使用M4×22内六角螺丝穿过Ø5.5孔直接锁付。',
  '对应2D图纸未更新并验证前，不得release LGS433 V5或LGS434 V6。',
  '八个新建或变更逻辑横杆组件（LGS433顶部横杆WH/BH、LGS433底部横杆前/后、LGS434底部横杆左-前/左-后、LGS434中部横杆左/右）的生产2D图纸和规格必须创建或更新并验证后，方可release；适用时须包含44mm焊接底脚几何。',
]);

const NEW_MATERIAL_IDS = Object.freeze({
  NLPLS4022BZ: 'mat_nlpls4022bz',
  NLPLS4022WZ: 'mat_nlpls4022wz',
  LGS433XQHLWH: 'mat_lgs433xqhlwh',
  LGS433XQHLBH: 'mat_lgs433xqhlbh',
  LGS433XHHLWH: 'mat_lgs433xhhlwh',
  LGS433XHHLBH: 'mat_lgs433xhhlbh',
  LGS434XQZHLWH: 'mat_lgs434xqzhlwh',
  LGS434XQZHLBH: 'mat_lgs434xqzhlbh',
  LGS434XHZHLWH: 'mat_lgs434xhzhlwh',
  LGS434XHZHLBH: 'mat_lgs434xhzhlbh',
  LGS434SZHLDEPWH: 'mat_lgs434szhldepwh',
  LGS434SZHLDEPBH: 'mat_lgs434szhldepbh',
  LGS434SYHLDEPWH: 'mat_lgs434syhldepwh',
  LGS434SYHLDEPBH: 'mat_lgs434syhldepbh',
  LGS433SQHLDEPV5WH: 'mat_lgs433sqhldepv5wh',
  LGS433SQHLDEPV5BH: 'mat_lgs433sqhldepv5bh',
});

const COLOR_VARIANTS = Object.freeze({ WH: { zh: '白砂纹', vi: 'trắng nhám' }, BH: { zh: '黑砂纹', vi: 'đen nhám' } });

function materialByCode(materials, code) {
  return Object.values(materials || {}).find((material) => material?.code === code) || null;
}

function entryByCode(entries, materials, productCode, color, materialCode) {
  const material = materialByCode(materials, materialCode);
  return entries.find((entry) => entry.parentType === 'product'
    && (entry.productCode || entry.parentId) === productCode
    && entry.color === color
    && entry.materialId === material?.id) || null;
}

function requireReleasedRevision(payload, productCode, expectedRevision, nextRevision) {
  const record = payload?.productRevisions?.[productCode];
  if (record?.currentRevision !== expectedRevision || record.currentRevisionInfo?.workflowState !== 'released') {
    throw new Error(`${productCode} must be released at ${expectedRevision}; refresh canonical main data before building this proposal.`);
  }
  return {
    operationType: 'create_product_revision',
    targetId: productCode,
    payload: { revision: nextRevision, changeReason: CHANGE_REASON },
  };
}

function createMaterialOperation(code, material) {
  const id = NEW_MATERIAL_IDS[code];
  if (!id) throw new Error(`Missing deterministic material id for ${code}.`);
  return { operationType: 'create_material', targetId: id, payload: { material } };
}

function buildScrewMaterial(code, color) {
  return {
    code,
    name: { zh: 'M4×22内六角螺丝', vi: 'M4×22 ốc lục giác' },
    spec: { zh: 'M4×22mm', vi: 'M4×22mm' },
    material: { zh: '#10', vi: '#10' },
    color,
    attr: { zh: '五金包', vi: 'túi ngũ kim' },
    unit: '颗',
    drawings: [],
    models3d: [],
  };
}

function buildAssemblyMaterial(code, predecessor, materials) {
  const source = materialByCode(materials, predecessor);
  if (!source) throw new Error(`Missing predecessor material ${predecessor} for ${code}.`);
  const colorKey = code.endsWith('WH') ? 'WH' : 'BH';
  const names = code.includes('XQHL')
    ? { zh: `LGS433底部横杆前_组件`, vi: 'Cụm thanh ngang đáy trước LGS433' }
    : code.includes('XHHL')
      ? { zh: 'LGS433底部横杆后_组件', vi: 'Cụm thanh ngang đáy sau LGS433' }
      : code.includes('XQZH')
        ? { zh: 'LGS434底部横杆左-前_组件', vi: 'Cụm thanh ngang đáy trái-trước LGS434' }
        : code.includes('XHZH')
          ? { zh: 'LGS434底部横杆左-后_组件', vi: 'Cụm thanh ngang đáy trái-sau LGS434' }
          : code.includes('SZHL')
            ? { zh: 'LGS434中部横杆左_组件', vi: 'Cụm thanh ngang giữa trái LGS434' }
            : { zh: 'LGS434中部横杆右_组件', vi: 'Cụm thanh ngang giữa phải LGS434' };
  return {
    code,
    name: names,
    spec: source.spec || { zh: '', vi: '' },
    material: source.material || { zh: '', vi: '' },
    color: COLOR_VARIANTS[colorKey],
    attr: source.attr || { zh: '零件', vi: 'linh kiện' },
    ...(source.unit ? { unit: source.unit } : {}),
    drawings: [],
    models3d: [],
  };
}

function addChild(operations, parentCode, childCode, quantity, materials, entries) {
  const parent = materialByCode(materials, parentCode) || { id: NEW_MATERIAL_IDS[parentCode] };
  const child = materialByCode(materials, childCode) || { id: NEW_MATERIAL_IDS[childCode] };
  if (!parent.id || !child.id) throw new Error(`Missing material dependency ${parentCode}/${childCode}.`);
  if (entries.some((entry) => entry.parentType === 'material' && entry.parentId === parent.id
    && (entry.childMaterialId || entry.materialId) === child.id)) return;
  operations.push({ operationType: 'add_material_child', targetId: parent.id, payload: { materialId: child.id, quantity } });
}

function createNewMaterials(operations, materials) {
  for (const [code, color] of [['NLPLS4022BZ', { zh: '黑色', vi: 'màu đen' }], ['NLPLS4022WZ', { zh: '镀锌', vi: 'mạ kẽm' }]]) {
    if (!materialByCode(materials, code)) operations.push(createMaterialOperation(code, buildScrewMaterial(code, color)));
  }
  for (const [code, predecessor] of [['LGS433SQHLDEPV5WH', 'LGS433SQHLDEPWH'], ['LGS433SQHLDEPV5BH', 'LGS433SQHLDEPBH']]) {
    if (materialByCode(materials, code)) throw new Error(`Approved new top-crossbar code collides with existing material: ${code}.`);
    operations.push(createMaterialOperation(code, buildTopCrossbarMaterial(code, predecessor, materials)));
  }

  const definitions = [
    ['LGS433XQHLWH', 'LGS333XQHLWH'], ['LGS433XQHLBH', 'LGS333XQHLBH'],
    ['LGS433XHHLWH', 'LGS333XHHLWH'], ['LGS433XHHLBH', 'LGS333XHHLBH'],
    ['LGS434XQZHLWH', 'LGS334XQZHLWH'], ['LGS434XQZHLBH', 'LGS334XQZHLBH'],
    ['LGS434XHZHLWH', 'LGS334XHZHLWH'], ['LGS434XHZHLBH', 'LGS334XHZHLBH'],
    ['LGS434SZHLDEPWH', 'LGS434SQZHLDEPWH'], ['LGS434SZHLDEPBH', 'LGS434SQZHLDEPBH'],
    ['LGS434SYHLDEPWH', 'LGS434SQYHLDEPWH'], ['LGS434SYHLDEPBH', 'LGS434SQYHLDEPBH'],
  ];
  for (const [code, predecessor] of definitions) {
    if (!materialByCode(materials, code)) operations.push(createMaterialOperation(code, buildAssemblyMaterial(code, predecessor, materials)));
  }
}

function buildTopCrossbarMaterial(code, predecessor, materials) {
  const source = materialByCode(materials, predecessor);
  if (!source) throw new Error(`Missing predecessor material ${predecessor} for ${code}.`);
  return {
    code,
    name: { zh: 'LGS433顶部横杆', vi: 'Thanh ngang trên LGS433' },
    spec: source.spec || { zh: '', vi: '' },
    material: source.material || { zh: '', vi: '' },
    color: source.color || { zh: '', vi: '' },
    attr: source.attr || { zh: '零件', vi: 'linh kiện' },
    ...(source.unit ? { unit: source.unit } : {}),
    drawings: [],
    models3d: [],
  };
}

function addNewAssemblyChildren(operations, materials, entries) {
  const pipe = 'FG1515066013';
  for (const suffix of ['WH', 'BH']) {
    const topCode = `LGS433SQHLDEPV5${suffix}`;
    addChild(operations, topCode, 'FG1515065566', 0.2, materials, entries);
    addChild(operations, topCode, 'M6YLM139', 2, materials, entries);
  }
  for (const suffix of ['WH', 'BH']) {
    for (const code of [`LGS433XQHL${suffix}`, `LGS433XHHL${suffix}`]) {
      addChild(operations, code, 'FG1515065566', 0.2, materials, entries);
      addChild(operations, code, 'M6YLM139', 2, materials, entries);
      addChild(operations, code, pipe, 0.007407, materials, entries);
      addChild(operations, code, `M6GS1515${suffix}`, 1, materials, entries);
      if (code.includes('XHHL')) addChild(operations, code, 'M6LMLM', 1, materials, entries);
    }
    for (const code of [`LGS434XQZHL${suffix}`, `LGS434XHZHL${suffix}`]) {
      addChild(operations, code, 'FG1515066150', 0.125, materials, entries);
      addChild(operations, code, 'M6YLM139', 1, materials, entries);
      addChild(operations, code, pipe, 0.007407, materials, entries);
      addChild(operations, code, `M6GS1515${suffix}`, 1, materials, entries);
      if (code.includes('XHZHL')) addChild(operations, code, 'M6LMLM', 1, materials, entries);
    }
    addChild(operations, `LGS434SZHLDEP${suffix}`, 'FG132132105190', 0.015625, materials, entries);
    addChild(operations, `LGS434SZHLDEP${suffix}`, 'FG1515065814', 0.125, materials, entries);
    addChild(operations, `LGS434SZHLDEP${suffix}`, 'M6YLM139', 1, materials, entries);
    addChild(operations, `LGS434SYHLDEP${suffix}`, 'FG1515065814', 0.125, materials, entries);
    addChild(operations, `LGS434SYHLDEP${suffix}`, 'M6YLM139', 1, materials, entries);
  }
}

function updateHardwarePack(operations, entries, materials, packCode, productCode, color, oldQty, newQty, screwCode, updatedParents) {
  const pack = materialByCode(materials, packCode);
  if (!pack) throw new Error(`Missing hardware pack ${packCode}.`);
  const scoped = entries.filter((entry) => entry.parentType === 'material'
    && entry.parentId === pack.id && entry.productCode === productCode && entry.color === color);
  const oldScrew = materialByCode(materials, 'NLPLS6010' + (color === '白色' ? 'WZ' : 'BZ'));
  const hasNewScrewEntry = scoped.some((entry) => (entry.childMaterialId || entry.materialId) === (materialByCode(materials, screwCode) || { id: NEW_MATERIAL_IDS[screwCode] }).id);
  const hasOldScrew = scoped.some((entry) => (entry.childMaterialId || entry.materialId) === oldScrew?.id && String(entry.qty) === oldQty);
  if (!hasOldScrew && hasNewScrewEntry) return;
  if (!hasOldScrew) {
    throw new Error(`Missing ${productCode}/${color} M6×12 hardware quantity ${oldQty}.`);
  }
  if (updatedParents.has(pack.id)) return;
  updatedParents.add(pack.id);
  operations.push({ operationType: 'update_material_child_quantity', targetId: pack.id,
    payload: { childId: oldScrew.id, originalQuantity: oldQty, quantity: newQty } });
  const screw = materialByCode(materials, screwCode) || { id: NEW_MATERIAL_IDS[screwCode] };
  const hasNewScrew = entries.some((entry) => entry.parentType === 'material' && entry.parentId === pack.id
    && (entry.childMaterialId || entry.materialId) === screw.id);
  if (!hasNewScrew) operations.push({ operationType: 'add_material_child', targetId: pack.id, payload: { materialId: screw.id, quantity: '4+1' } });
}

function replaceProductMaterial(operations, entries, materials, productCode, color, sourceCode, targetCode) {
  const source = entryByCode(entries, materials, productCode, color, sourceCode);
  const target = materialByCode(materials, targetCode) || { id: NEW_MATERIAL_IDS[targetCode] };
  if (!source && entryByCode(entries, materials, productCode, color, targetCode)) return;
  if (!source || !target.id) throw new Error(`Missing BOM replacement ${productCode}/${color}: ${sourceCode} -> ${targetCode}.`);
  operations.push({ operationType: 'replace_bom_item', targetId: source.id, payload: { materialId: target.id } });
}

function consolidateProductRows(operations, entries, materials, productCode, color, oldCodes, targetCode, quantity) {
  const oldEntries = oldCodes.map((code) => entryByCode(entries, materials, productCode, color, code));
  if (oldEntries.every((entry) => !entry) && entryByCode(entries, materials, productCode, color, targetCode)) return;
  if (oldEntries.some((entry) => !entry)) throw new Error(`Missing ${productCode}/${color} BOM rows for ${oldCodes.join(', ')}.`);
  const target = materialByCode(materials, targetCode) || { id: NEW_MATERIAL_IDS[targetCode] };
  operations.push({ operationType: 'replace_bom_item', targetId: oldEntries[0].id, payload: { materialId: target.id } });
  operations.push({ operationType: 'remove_bom_item', targetId: oldEntries[1].id, payload: {} });
  operations.push({ operationType: 'update_bom_quantity', targetId: productCode,
    payload: { color, childId: target.id, quantity } });
}

export function buildLgs433Lgs434V6Operations(payload) {
  const materials = payload?.materialDb?.materials || {};
  const entries = payload?.materialDb?.bomEntries || [];
  const revisionOperations = [
    requireReleasedRevision(payload, 'LGS433', 'V4.1', 'V5'),
    requireReleasedRevision(payload, 'LGS434', 'V5.2', 'V6'),
  ];
  const operations = [];

  operations.push(...revisionOperations);

  // Keep each create_product_revision associated with a product-level BOM mutation
  // in the first batch, so the Admin mutation policy can validate both revisions
  // before any later batch is approved.
  for (const [productCode, colors] of [['LGS433', ['复古色', '白色', '黑色']], ['LGS434', ['白色', '黑色']]]) {
    for (const color of colors) {
      const suffix = color === '白色' ? 'WH' : 'BH';
      const footEntry = entryByCode(entries, materials, productCode, color, `ZJG150641${suffix}`);
      if (footEntry) operations.push({ operationType: 'remove_bom_item', targetId: footEntry.id, payload: {} });
    }
  }
  createNewMaterials(operations, materials);
  addNewAssemblyChildren(operations, materials, entries);

  for (const [oldCode, newName] of [
    ['LGS333XQHLBH', 'LGS333_733_833底部横杆前'], ['LGS333XQHLWH', 'LGS333_733_833底部横杆前'],
    ['LGS333XHHLBH', 'LGS333_733_833底部横杆后'], ['LGS333XHHLWH', 'LGS333_733_833底部横杆后'],
    ['LGS334XQZHLBH', 'LGS334_834-底部横杆左-前'], ['LGS334XQZHLWH', 'LGS334_834-底部横杆左-前'],
    ['LGS334XHZHLBH', 'LGS334_834-底部横杆左-后'], ['LGS334XHZHLWH', 'LGS334_834-底部横杆左-后'],
  ]) {
    const material = materialByCode(materials, oldCode);
    if (!material) throw new Error(`Missing shared material ${oldCode}.`);
    operations.push({ operationType: 'update_material', targetId: material.id,
      payload: { patch: { name: { zh: newName, vi: material.name?.vi || newName } } } });
  }

  for (const [productCode, packPrefix, oldQty, newQty, colors] of [
    ['LGS433', 'LGS433WJB', '8+2', '4+1', ['复古色', '白色', '黑色']],
    ['LGS434', 'LGS434WJB', '12+2', '8+1', ['白色', '黑色']],
  ]) {
    const updatedParents = new Set();
    for (const color of colors) {
      const suffix = color === '白色' ? 'WH' : 'BH';
      updateHardwarePack(operations, entries, materials, `${packPrefix}${suffix}`, productCode, color,
        oldQty, newQty, `NLPLS4022${suffix === 'WH' ? 'WZ' : 'BZ'}`, updatedParents);
    }
  }

  for (const color of ['复古色', '白色', '黑色']) {
    const suffix = color === '白色' ? 'WH' : 'BH';
    replaceProductMaterial(operations, entries, materials, 'LGS433', color, `LGS333XQHL${suffix}`, `LGS433XQHL${suffix}`);
    replaceProductMaterial(operations, entries, materials, 'LGS433', color, `LGS333XHHL${suffix}`, `LGS433XHHL${suffix}`);
    replaceProductMaterial(operations, entries, materials, 'LGS433', color,
      `LGS433SQHLDEP${suffix}`, `LGS433SQHLDEPV5${suffix}`);
  }
  for (const color of ['白色', '黑色']) {
    const suffix = color === '白色' ? 'WH' : 'BH';
    replaceProductMaterial(operations, entries, materials, 'LGS434', color, `LGS334XQZHL${suffix}`, `LGS434XQZHL${suffix}`);
    replaceProductMaterial(operations, entries, materials, 'LGS434', color, `LGS334XHZHL${suffix}`, `LGS434XHZHL${suffix}`);
    consolidateProductRows(operations, entries, materials, 'LGS434', color,
      [`LGS434SQZHLDEP${suffix}`, `LGS434SHZHLDEP${suffix}`], `LGS434SZHLDEP${suffix}`, 2);
    consolidateProductRows(operations, entries, materials, 'LGS434', color,
      [`LGS434SQYHLDEP${suffix}`, `LGS434SHYHLDEP${suffix}`], `LGS434SYHLDEP${suffix}`, 2);
  }
  return operations;
}

export function buildLgs433Lgs434V6ProposalBatches(payload, maxBatchSize = 40) {
  const operations = buildLgs433Lgs434V6Operations(payload);
  const batches = [];
  for (let index = 0; index < operations.length; index += maxBatchSize) {
    batches.push({
      summary: `ECN-LGS433-V5-LGS434-V6: BOM proposal batch ${batches.length + 1} (${Math.min(maxBatchSize, operations.length - index)} operations)`,
      operations: operations.slice(index, index + maxBatchSize),
      releasePrerequisites: RELEASE_PREREQUISITES,
    });
  }
  return batches;
}

export { CHANGE_REASON, NEW_MATERIAL_IDS, RELEASE_PREREQUISITES };
