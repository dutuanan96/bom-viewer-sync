// ECN & Engineering Change Impact Analysis Engine
// Analyzes technical change impacts across four factory streams:
// 1. Label & Manual Stream (序号标 / 说明书 / 包装SOP)
// 2. Hardware & Procurement Stream (五金包 / 采购 / 配料 / 库存)
// 3. Drawing & Mechanical Stream (2D/3D图纸 / CNC / 焊接 / QC)
// 4. Packaging & Logistics Stream (纸箱 / 包装方式 / 装柜体积)

function normalizeText(val) {
  return String(val || '').trim();
}

function walkBomRows(materials, level = 1, callback) {
  if (!Array.isArray(materials)) return;
  for (const row of materials) {
    callback(row, level);
    if (Array.isArray(row.materials) && row.materials.length > 0) {
      walkBomRows(row.materials, level + 1, callback);
    }
  }
}

function resolveMaterialRecord(materialId, payload) {
  if (!materialId || !payload) return null;
  const targetNorm = String(materialId).trim().toLowerCase();
  const materials = payload.materialDb?.materials || payload.materials || {};
  
  // 1. Exact ID or Code match (case-insensitive)
  for (const [id, mat] of Object.entries(materials)) {
    if (String(id).toLowerCase() === targetNorm || String(mat.code || '').toLowerCase() === targetNorm) {
      return { id, ...mat };
    }
  }

  const normKey = targetNorm.replace(/×|\*/g, 'x').replace(/\s+/g, '');
  if (normKey.length >= 3) {
    for (const [id, mat] of Object.entries(materials)) {
      const specZh = String(mat.spec?.zh || mat.spec || '').toLowerCase().replace(/×|\*/g, 'x').replace(/\s+/g, '');
      const code = String(mat.code || id).toLowerCase().replace(/\s+/g, '');
      if (specZh === normKey || code === normKey) {
        return { id, ...mat };
      }
    }
  }

  // 2. Fallback: search recursively in BOM entries
  const boms = payload.bom || {};
  let matched = null;
  for (const [prodCode, prod] of Object.entries(boms)) {
    for (const [color, colorInfo] of Object.entries(prod.color_info || {})) {
      walkBomRows(colorInfo.materials, 1, (row, level) => {
        if (matched) return;
        const rowCode = String(row.mat_code || row.materialId || '').toLowerCase();
        const specZh = String(row.spec_zh || row.spec || '').toLowerCase().replace(/×|\*/g, 'x').replace(/\s+/g, '');
        if (rowCode === targetNorm || (normKey.length >= 3 && specZh === normKey)) {
          matched = {
            id: row.materialId || row.mat_code,
            code: row.mat_code || row.materialId,
            name: { zh: row.name_zh || row.name },
            spec: { zh: row.spec_zh || row.spec },
            attr: { zh: row.attr_zh || row.attr || (level === 2 ? '五金包' : '零件') },
            unit: typeof row.unit === 'object' ? (row.unit.zh || row.unit.vi || 'pcs') : (row.unit || 'pcs'),
          };
        }
      });
      if (matched) return matched;
    }
  }

  return null;
}

export function findMaterialOccurrences(materialId, payload) {
  if (!materialId || !payload) return [];
  const occurrences = [];
  const boms = payload.bom || {};
  const matRec = resolveMaterialRecord(materialId, payload);
  const targetCodes = new Set([materialId, matRec?.code, matRec?.id].filter(Boolean).map(c => String(c).toLowerCase()));
  const normKey = String(materialId || '').toLowerCase().replace(/×|\*/g, 'x').replace(/\s+/g, '');

  for (const [prodCode, prod] of Object.entries(boms)) {
    const revision = prod.revision || 'V1.0';
    for (const [color, colorInfo] of Object.entries(prod.color_info || {})) {
      walkBomRows(colorInfo.materials, 1, (row, level) => {
        const rowCode = String(row.mat_code || row.materialId || '').toLowerCase();
        const specZh = String(row.spec_zh || row.spec || '').toLowerCase().replace(/×|\*/g, 'x').replace(/\s+/g, '');
        if (targetCodes.has(rowCode) || (normKey.length >= 3 && specZh === normKey)) {
          occurrences.push({
            productCode: prodCode,
            revision,
            color,
            compCode: row.comp_code || '',
            qty: row.qty || row.quantity || '1',
            unit: typeof row.unit === 'object' ? (row.unit.zh || row.unit.vi || 'pcs') : (row.unit || 'pcs'),
            level: row._level ?? level,
            nameZh: row.name_zh || matRec?.name?.zh || '',
            specZh: row.spec_zh || matRec?.spec?.zh || '',
            attrZh: row.attr_zh || matRec?.attr?.zh || (level === 2 ? '五金包' : '零件'),
          });
        }
      });
    }
  }

  return occurrences;
}

export function analyzeEcnImpact({
  targetMaterialId,
  newSpec = '',
  newQty = '',
  newLabel = '',
  newCode = '',
  targetProductIds = [],
  reason = '',
  change = null,
  componentConcept = '',
  snapshot,
}) {
  const payload = snapshot?.payload || snapshot || {};
  let material = resolveMaterialRecord(targetMaterialId, payload);
  let effectiveNewSpec = newSpec;

  // Handle relative change (e.g. delta +3mm)
  if (change && change.operator === 'delta' && typeof change.value === 'number') {
    if (!material && targetMaterialId) {
      material = resolveMaterialRecord(targetMaterialId, payload);
    }
    if (material) {
      const currentSpec = String(material.spec?.zh || material.spec || '');
      const mMatch = currentSpec.match(/(?:M|ST)(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)/i);
      if (mMatch) {
        const prefix = currentSpec.toUpperCase().startsWith('ST') ? 'ST' : 'M';
        const diameter = mMatch[1];
        const oldLen = parseFloat(mMatch[2]);
        const computedLen = oldLen + change.value;
        if (!effectiveNewSpec) {
          effectiveNewSpec = `${prefix}${diameter}x${computedLen}`;
        }
      } else {
        // Fail-closed if change is requested on non-applicable or unsupported spec format
        return {
          success: false,
          needsClarification: true,
          clarificationCode: 'relative_change_not_applicable',
          message: `无法对物料规格 "${currentSpec}" 执行相对变更计算 (Relative change not applicable for spec "${currentSpec}").`,
          targetMaterial: {
            id: material.id,
            code: material.code,
            nameZh: material.name?.zh || material.name,
            specZh: material.spec?.zh || material.spec,
            attrZh: material.attr?.zh || material.attr || '零件',
          },
          totalAffectedProducts: 0,
          totalAffectedOccurrences: 0,
          affectedProducts: [],
          impactStreams: null,
          proposalOperations: [],
        };
      }
    } else {
      return {
        success: false,
        needsClarification: true,
        clarificationCode: 'target_not_specified',
        message: '请指定需要变更的具体物料或当前物料 (Please specify which target material to apply relative change to).',
        targetMaterial: null,
        totalAffectedProducts: 0,
        totalAffectedOccurrences: 0,
        affectedProducts: [],
        impactStreams: null,
        proposalOperations: [],
      };
    }
  }

  const resolvedNewSpec = effectiveNewSpec || newSpec;

  if (!material) {
    return {
      success: false,
      needsClarification: true,
      clarificationCode: 'material_not_resolved',
      message: `无法解析目标物料 (Unresolved target material): "${targetMaterialId}"`,
      targetMaterial: null,
      totalAffectedProducts: 0,
      totalAffectedOccurrences: 0,
      affectedProducts: [],
      impactStreams: null,
      proposalOperations: [],
    };
  }

  const occurrences = findMaterialOccurrences(targetMaterialId, payload);
  if (occurrences.length === 0) {
    return {
      success: false,
      needsClarification: true,
      clarificationCode: 'material_not_used',
      message: `物料 ${material.code || material.id} 未在任何产品BOM中使用 (Target material not used in any BOM).`,
      targetMaterial: {
        id: material.id,
        code: material.code,
        nameZh: material.name?.zh || material.name,
        specZh: material.spec?.zh || material.spec,
        attrZh: material.attr?.zh || material.attr || '零件',
      },
      totalAffectedProducts: 0,
      totalAffectedOccurrences: 0,
      affectedProducts: [],
      impactStreams: null,
      proposalOperations: [],
    };
  }
  
  const targetScope = Array.isArray(targetProductIds) && targetProductIds.length > 0
    ? new Set(targetProductIds)
    : null;

  const affectedOccurrences = targetScope
    ? occurrences.filter(occ => targetScope.has(occ.productCode))
    : occurrences;

  // Group affected by product
  const productMap = new Map();
  for (const occ of affectedOccurrences) {
    if (!productMap.has(occ.productCode)) {
      productMap.set(occ.productCode, {
        productCode: occ.productCode,
        revision: occ.revision,
        colors: new Set(),
        compCodes: new Set(),
        quantities: new Set(),
        levels: new Set(),
      });
    }
    const item = productMap.get(occ.productCode);
    item.colors.add(occ.color);
    if (occ.compCode) item.compCodes.add(occ.compCode);
    if (occ.qty) item.quantities.add(occ.qty);
    item.levels.add(occ.level);
  }

  const affectedProducts = [...productMap.values()].map(p => ({
    productCode: p.productCode,
    revision: p.revision,
    colors: [...p.colors],
    compCodes: [...p.compCodes],
    quantities: [...p.quantities],
    levels: [...p.levels],
  }));

  const attrCategory = normalizeText(material?.attr?.zh || material?.attr || '零件');
  const isHardware = /五金|螺丝|螺钉|螺母|把手|foot|bolt|screw/iu.test(attrCategory) || /五金|螺丝|bolt|screw/iu.test(material?.name?.zh || '');
  const isPackaging = /包材|包装|纸箱|泡沫|pe袋|carton|foam/iu.test(attrCategory) || /纸箱|外箱|护角/iu.test(material?.name?.zh || '');
  const isStructure = !isHardware && !isPackaging;

  // 1. Label & Manual Stream (序号标 / 说明书 / 包装SOP)
  const labelStream = {
    affected: Boolean(newLabel || affectedProducts.some(p => p.compCodes.length > 0)),
    items: [],
    actions: [],
  };
  if (newLabel) {
    labelStream.items.push(`序号标变更: 原标 [${[...new Set(affectedOccurrences.map(o => o.compCode).filter(Boolean))].join('/') || '无'}] → 新标 [${newLabel}]`);
    labelStream.actions.push('更新产品组装说明书 (说明书装配步骤与序号图)');
    labelStream.actions.push('更新包装工位贴标SOP与零部件条码/序号标打印文件');
  } else if (labelStream.affected) {
    labelStream.items.push(`现行序号标: [${[...new Set(affectedOccurrences.map(o => o.compCode).filter(Boolean))].join('/') || '无'}]`);
    labelStream.actions.push('核对说明书步骤物料编号一致性');
  }

  // 2. Hardware & Procurement Stream (五金包 / 采购 / 配料 / 库存)
  const hardwareStream = {
    affected: isHardware || Boolean(newQty),
    items: [],
    actions: [],
  };
  if (isHardware) {
    hardwareStream.items.push(`五金物料: ${material?.name?.zh || targetMaterialId} (${material?.spec?.zh || ''})`);
    if (resolvedNewSpec) hardwareStream.items.push(`规格变更: ${material?.spec?.zh || '原规格'} → ${resolvedNewSpec}`);
    if (newQty) hardwareStream.items.push(`用量变更: 原用量 [${[...new Set(affectedOccurrences.map(o => o.qty))].join('/')}] → 新用量 [${newQty}]`);
    hardwareStream.actions.push('更新五金包 (五金配件袋) 内部BOM及封口配料卡');
    hardwareStream.actions.push('采购部发起供应商询价/变更PO，并核查旧物料呆滞库存');
    hardwareStream.actions.push('仓库对旧版本五金进行批次隔离 (FIFO 先进先出消耗或报废)');
  }

  // 3. Drawing & Mechanical Stream (2D/3D图纸 / CNC / 焊接 / QC)
  const drawingStream = {
    affected: isStructure || Boolean(resolvedNewSpec),
    items: [],
    actions: [],
  };
  if (isStructure || resolvedNewSpec) {
    drawingStream.items.push(`结构零件: ${material?.name?.zh || targetMaterialId} (${material?.spec?.zh || ''})`);
    if (resolvedNewSpec) drawingStream.items.push(`尺寸/规格更新: ${material?.spec?.zh || '原规格'} → ${resolvedNewSpec}`);
    drawingStream.actions.push('工程部修订并发布新版 2D工程图纸 (drawing-<hash>.pdf) 及 3D模型');
    drawingStream.actions.push('下发车间调整 CNC/激光切管下料尺寸、冲孔模具及焊接定位工装');
    drawingStream.actions.push('品保部 (QC) 更新首件检验标准卡 (FAI) 与过程巡检样板');
  }

  // 4. Packaging & Logistics Stream (纸箱 / 包装方式 / 装柜体积)
  const packagingStream = {
    affected: isPackaging || (isStructure && /长|宽|高|深度|尺寸/iu.test(resolvedNewSpec)),
    items: [],
    actions: [],
  };
  if (isPackaging) {
    packagingStream.items.push(`包材物料: ${material?.name?.zh || targetMaterialId}`);
    if (resolvedNewSpec) packagingStream.items.push(`纸箱/包材尺寸变更: ${material?.spec?.zh || '原规格'} → ${resolvedNewSpec}`);
    packagingStream.actions.push('更新包装作业指导书 (封箱胶带、纸护角与泡沫填充物摆放)');
    packagingStream.actions.push('重新计算单箱外箱体积 (CBM) 与 40HQ 集装箱装柜装载率');
  }

  // Build structured Proposal Operations
  const proposalOperations = [];
  const changeReasonText = reason || `ECN变更: ${material?.name?.zh || targetMaterialId} ${resolvedNewSpec || newQty ? `(${resolvedNewSpec || ''} ${newQty || ''})` : ''}`;

  if (resolvedNewSpec && material) {
    proposalOperations.push({
      operationType: 'update_material_field',
      materialId: material.id || targetMaterialId,
      field: 'spec',
      value: { zh: resolvedNewSpec, vi: resolvedNewSpec },
      reason: changeReasonText,
    });
  }

  if (newQty) {
    for (const occ of affectedOccurrences) {
      proposalOperations.push({
        operationType: 'update_bom_quantity',
        productId: occ.productCode,
        color: occ.color,
        materialId: material?.id || targetMaterialId,
        quantity: newQty,
        reason: changeReasonText,
      });
    }
  }

  return {
    success: true,
    targetMaterial: {
      id: material?.id || targetMaterialId,
      code: material?.code || targetMaterialId,
      nameZh: material?.name?.zh || '',
      specZh: material?.spec?.zh || '',
      attrZh: attrCategory,
    },
    changeSummary: {
      newSpec: resolvedNewSpec,
      newQty,
      newLabel,
      newCode,
      reason: changeReasonText,
    },
    totalAffectedProducts: affectedProducts.length,
    totalAffectedOccurrences: affectedOccurrences.length,
    affectedProducts,
    impactStreams: {
      labelStream,
      hardwareStream,
      drawingStream,
      packagingStream,
    },
    proposalOperations,
  };
}
