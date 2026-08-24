const CHANGE_REASON = 'ECN-2026-0824-COLOR: 新增 4 个已确认颜色 SKU；按已发布颜色 BOM 替换指定颜色物料。';

const COLOR_VARIANTS = Object.freeze([
  {
    spu: 'LGS033', sourceSku: 'LGS033KD02S', sku: 'LGS033B101S', color: { zh: '黑色', vi: 'màu đen' },
    name: { zh: '3列3层9抽-45inch烟墨黑', vi: 'LGS033-3 cột 3 tầng 9 ngăn kéo -45inch màu đen' },
    replacements: [
      ['LGS033DB101KD', 'LGS033DB101BH'], ['BC350282187KD', 'BC350282187BH'], ['LGS033PKXKD', 'LGS033PKXBH'],
    ],
  },
  {
    spu: 'LGS133', sourceSku: 'LGS133KD02S', sku: 'LGS133B101S', color: { zh: '黑色', vi: 'màu đen' },
    name: { zh: '3列3层9抽-57inch烟墨黑', vi: 'LGS133-3 cột 3 tầng 9 ngăn kéo -57inch màu đen' },
    replacements: [
      ['BC460327173KD', 'BC460327173BH'], ['BC460327187KD', 'BC460327187BH'], ['LGS133ZFXKD', 'LGS133ZFXBH'],
    ],
  },
  {
    spu: 'LGS132', sourceSku: 'LGS132B101S', sku: 'LGS132K101S', color: { zh: '复古色', vi: 'màu gỗ cổ' },
    name: { zh: '复古色3列3层6抽开放式带灯带电布抽电视柜-57inch', vi: 'màu gỗ cổ 3 cột 3 tầng 6 Tủ đựng TV kiểu ngăn kéo mở có đèn và điện-57inch' },
    replacements: [
      ['LGS132DB101BH', 'LGS132DB101KD'], ['LGS132DB102BH', 'LGS132DB102KD'],
      ['LGS132CBXBH', 'LGS132CBXKD'], ['LGS132CBSBH', 'LGS132CBSKD'],
      ['BC460327187BH', 'BC460327187KD'], ['LGS132ZFXBH', 'LGS132ZFXKD'],
    ],
    repairReplacements: [['LGS132YZKKD', 'LGS132YZKBH'], ['LGS132ZZKKD', 'LGS132ZZKBH']],
    obsoleteMaterialCodes: ['LGS132YZKKD', 'LGS132ZZKKD'],
  },
  {
    spu: 'LGS032', sourceSku: 'LGS032B101S', sku: 'LGS032W101S', color: { zh: '白色', vi: 'màu trắng' },
    name: { zh: '白色3列3层6抽开放式带灯带电布抽电视柜-45inch', vi: 'màu trắng 3 cột 3 tầng 6 Tủ đựng TV kiểu ngăn kéo mở có đèn và điện-45inch' },
    replacements: [
      ['LGS032WJBBH', 'LGS032WJBWH'], ['PC221BH', 'PC221WH'], ['LGS032DB101BH', 'LGS032DB101WH'],
      ['LGS032CBSBH', 'LGS032CBSWH'], ['LGS032CBXBH', 'LGS032CBXWH'], ['SLHGZZ001BH', 'SLHGZZ001WH'],
      ['SLHGZY001BH', 'SLHGZY001WH'], ['LGS032ZZKBH', 'LGS032ZZKWH'], ['LGS032YZKBH', 'LGS032YZKWH'],
      ['LGS032XHLBH', 'LGS032XHLWH'], ['LGS032XQHLBH', 'LGS032XQHLWH'], ['LGS032SHLBH', 'LGS032SHLWH'],
      ['ZJG150641BH', 'ZJG150641WH'], ['LG05254BH', 'LG05254WH'], ['BC350282187BH', 'BC350282187WH'],
      ['BCDB350282003BH', 'BCDB350282003WH'], ['LGS032PKXBH', 'LGS032PKXWH'],
      ['LGS032ZKBH647', 'LGS032ZKWH647'], ['LGS032YKBH647', 'LGS032YKWH647'], ['DD0310', 'DD0310WH'],
    ],
    materialColorOverrides: {
      DD0310WH: { zh: '白泊板', vi: 'trắng bóng' },
      LGS032ZZKWH: { zh: '白砂纹', vi: 'trắng nhám' },
      LGS032YZKWH: { zh: '白砂纹', vi: 'trắng nhám' },
      LGS032XHLWH: { zh: '白砂纹', vi: 'trắng nhám' },
      LGS032XQHLWH: { zh: '白砂纹', vi: 'trắng nhám' },
      LGS032SHLWH: { zh: '白砂纹', vi: 'trắng nhám' },
      LGS032ZKWH647: { zh: '白砂纹', vi: 'trắng nhám' },
      LGS032YKWH647: { zh: '白砂纹', vi: 'trắng nhám' },
    },
    childReplacements: [
      ['M6GS1515BH', 'M6GS1515WH'],
      ['NLPLS6018BZ', 'NLPLS6018WZ'],
    ],
    skipMaterialChildCopy: ['LGS032WJBBH'],
    hardwareChildren: [
      ['TZJD629825WH', '6'], ['BCLS129228WH', '6'], ['NLPLS6022WZ', '20+2'], ['GSSNZGLS5040WZ', '4+1'],
      ['NLPLS6010WZ', '8+2'], ['ZGLS4010WZ', '12+2'], ['PTZGLS6308WZ', '2'], ['SLPZLS6030WH', '2'],
      ['ZGLS3560WH', '2'], ['LNSLSD65254BZ', '1'], ['LNBS57253BZ', '1'], ['NLDP15508020WH', '2'],
    ],
  },
]);

function findColorBySku(product, sku) {
  return Object.entries(product?.color_info || {}).find(([, info]) => info?.sku === sku)?.[0] || '';
}

function findMaterialByCode(materials, code) {
  return Object.values(materials).find((material) => material?.code === code) || null;
}

function nextDraftRevision(currentRevision) {
  const match = String(currentRevision || '').match(/^(.*?)(?:\.(\d+))?$/);
  if (!match) throw new Error(`Invalid revision: ${currentRevision}`);
  return `${match[1]}.${Number(match[2] || 0) + 1}`;
}

function cleanAsset(asset) {
  if (!asset?.url) return null;
  return Object.fromEntries(['name', 'url', 'previewUrl', 'path']
    .filter((key) => typeof asset[key] === 'string')
    .map((key) => [key, asset[key]]));
}

function materialCreateOperation(source, code, color) {
  return {
    operationType: 'create_material',
    targetId: `mat_${code.toLowerCase()}`,
    payload: {
      material: {
        code,
        name: source.name,
        spec: source.spec,
        material: source.material,
        color,
        attr: source.attr,
        unit: typeof source.unit === 'string' ? source.unit : String(source.unit?.zh || ''),
        drawings: (source.drawings || []).map(cleanAsset).filter(Boolean),
        models3d: (source.models3d || []).map(cleanAsset).filter(Boolean),
      },
    },
  };
}

function pendingConfigs(payload) {
  return COLOR_VARIANTS.filter((config) => !findColorBySku(payload?.bom?.[config.spu], config.sku));
}

function buildMasterDataOperations(payload, configs) {
  const materials = payload?.materialDb?.materials || {};
  const operations = [];
  const targetCodes = new Set();
  for (const config of configs) {
    for (const [sourceCode, targetCode] of config.replacements) {
      if (targetCodes.has(targetCode) || findMaterialByCode(materials, targetCode)) continue;
      const source = findMaterialByCode(materials, sourceCode);
      if (!source) throw new Error(`Source material ${sourceCode} not found.`);
      targetCodes.add(targetCode);
      operations.push(materialCreateOperation(
        source,
        targetCode,
        config.materialColorOverrides?.[targetCode] || config.color,
      ));
    }
  }
  return operations;
}

function buildVariantOperations(payload, configs) {
  const operations = [];
  for (const config of configs) {
    const product = payload?.bom?.[config.spu];
    if (!product) throw new Error(`Product ${config.spu} not found.`);
    const sourceColor = findColorBySku(product, config.sourceSku);
    if (!sourceColor) throw new Error(`Source SKU ${config.sourceSku} not found.`);
    const revisionRecord = payload?.productRevisions?.[config.spu];
    if (revisionRecord?.currentRevisionInfo?.workflowState !== 'draft') {
      operations.push({
        operationType: 'create_product_revision',
        targetId: config.spu,
        payload: {
          revision: nextDraftRevision(revisionRecord?.currentRevision || product.revision),
          changeReason: CHANGE_REASON,
        },
      });
    }
    operations.push({
      operationType: 'create_product_variant',
      targetId: config.spu,
      payload: { sourceColor, color: config.color, name: config.name, sku: config.sku },
    });
  }
  return operations;
}

function buildReplacementOperations(payload, configs) {
  const materials = payload?.materialDb?.materials || {};
  const entries = payload?.materialDb?.bomEntries || [];
  const operations = [];
  for (const config of configs) {
    const product = payload?.bom?.[config.spu];
    const targetColor = findColorBySku(product, config.sku);
    if (!targetColor) continue;
    for (const [sourceCode, targetCode] of [...config.replacements, ...(config.repairReplacements || [])]) {
      const source = findMaterialByCode(materials, sourceCode);
      const target = findMaterialByCode(materials, targetCode);
      if (!source || !target) continue;
      for (const entry of entries.filter((candidate) => candidate.parentType === 'product'
        && (candidate.productCode === config.spu || candidate.parentId === config.spu)
        && candidate.color === targetColor
        && candidate.materialId === source.id)) {
        operations.push({ operationType: 'replace_bom_item', targetId: entry.id, payload: { materialId: target.id } });
      }
    }
  }
  return operations;
}

function buildMaterialColorOperations(payload, configs) {
  const materials = payload?.materialDb?.materials || {};
  const operations = [];
  for (const config of configs) {
    for (const [code, color] of Object.entries(config.materialColorOverrides || {})) {
      const material = findMaterialByCode(materials, code);
      if (!material || JSON.stringify(material.color) === JSON.stringify(color)) continue;
      operations.push({
        operationType: 'update_material',
        targetId: material.id,
        payload: { patch: { color } },
      });
    }
  }
  return operations;
}

function buildObsoleteMaterialOperations(payload, configs) {
  const materials = payload?.materialDb?.materials || {};
  const entries = payload?.materialDb?.bomEntries || [];
  const operations = [];
  for (const config of configs) {
    const product = payload?.bom?.[config.spu];
    const targetColor = findColorBySku(product, config.sku);
    const repairSources = new Set((config.repairReplacements || []).map(([sourceCode]) => sourceCode));
    for (const code of config.obsoleteMaterialCodes || []) {
      const material = findMaterialByCode(materials, code);
      if (!material || !repairSources.has(code)) continue;
      const childRelations = entries.filter((entry) => entry.parentType === 'material' && entry.parentId === material.id);
      const externalUsage = entries.filter((entry) => (entry.materialId === material.id || entry.childMaterialId === material.id)
        && entry.parentId !== material.id);
      const onlyRepairedProductUsage = externalUsage.every((entry) => entry.parentType === 'product'
        && entry.productCode === config.spu
        && entry.color === targetColor);
      if (onlyRepairedProductUsage) {
        for (const relation of childRelations) {
          operations.push({ operationType: 'remove_material_child', targetId: relation.id, payload: {} });
        }
        operations.push({ operationType: 'delete_material', targetId: material.id, payload: {} });
      }
    }
  }
  return operations;
}

function buildHardwareChildOperations(payload, configs) {
  const materials = payload?.materialDb?.materials || {};
  const entries = payload?.materialDb?.bomEntries || [];
  const operations = [];
  for (const config of configs) {
    if (!config.hardwareChildren?.length) continue;
    const product = payload?.bom?.[config.spu];
    const targetColor = findColorBySku(product, config.sku);
    const hardwareCode = config.replacements[0]?.[1];
    const hardwarePack = findMaterialByCode(materials, hardwareCode);
    if (!targetColor || !hardwarePack) continue;
    for (const [childCode, quantity] of config.hardwareChildren) {
      const child = findMaterialByCode(materials, childCode);
      if (!child) throw new Error(`Hardware child material ${childCode} not found.`);
      const exists = entries.some((entry) => entry.parentType === 'material'
        && entry.parentId === hardwarePack.id
        && (entry.childMaterialId || entry.materialId) === child.id
        && entry.productCode === config.spu
        && entry.color === targetColor);
      if (!exists) {
        operations.push({
          operationType: 'add_material_child',
          targetId: hardwarePack.id,
          payload: { materialId: child.id, quantity },
        });
      }
    }
  }
  return operations;
}

function buildMisScopedHardwareChildRemovalOperations(payload, configs) {
  const materials = payload?.materialDb?.materials || {};
  const entries = payload?.materialDb?.bomEntries || [];
  const operations = [];
  for (const config of configs) {
    if (!config.hardwareChildren?.length) continue;
    const product = payload?.bom?.[config.spu];
    const targetColor = findColorBySku(product, config.sku);
    const sourceHardware = findMaterialByCode(materials, config.replacements[0]?.[0]);
    if (!targetColor || !sourceHardware) continue;
    for (const entry of entries.filter((candidate) => candidate.parentType === 'material'
      && candidate.parentId === sourceHardware.id
      && candidate.productCode === config.spu
      && candidate.color === targetColor)) {
      operations.push({ operationType: 'remove_material_child', targetId: entry.id, payload: {} });
    }
  }
  return operations;
}

function targetMaterialId(materials, code) {
  return findMaterialByCode(materials, code)?.id || `mat_${code.toLowerCase()}`;
}

function normalizeQuantity(quantity) {
  const value = String(quantity || '').trim();
  return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
}

function buildMaterialChildOperations(payload, configs) {
  const materials = payload?.materialDb?.materials || {};
  const entries = payload?.materialDb?.bomEntries || [];
  const operations = [];
  for (const config of configs) {
    const childReplacements = new Map(config.childReplacements || []);
    const skipSources = new Set(config.skipMaterialChildCopy || []);
    for (const [sourceCode, targetCode] of config.replacements) {
      if (skipSources.has(sourceCode)) continue;
      const source = findMaterialByCode(materials, sourceCode);
      if (!source) throw new Error(`Source material ${sourceCode} not found.`);
      const parentId = targetMaterialId(materials, targetCode);
      const sourceChildren = entries.filter((entry) => entry.parentType === 'material' && entry.parentId === source.id);
      const handledChildren = new Set();
      for (const sourceChild of sourceChildren) {
        const sourceChildMaterial = materials[sourceChild.childMaterialId || sourceChild.materialId];
        if (!sourceChildMaterial) throw new Error(`Child material for ${sourceCode} not found.`);
        const childCode = childReplacements.get(sourceChildMaterial.code) || sourceChildMaterial.code;
        const child = findMaterialByCode(materials, childCode);
        if (!child) throw new Error(`Target child material ${childCode} not found.`);
        const childKey = `${child.id}|${String(sourceChild.qty)}`;
        if (handledChildren.has(childKey)) continue;
        handledChildren.add(childKey);
        const existing = entries.filter((entry) => entry.parentType === 'material'
          && entry.parentId === parentId
          && (entry.childMaterialId || entry.materialId) === child.id);
        if (!existing.length) {
          operations.push({
            operationType: 'add_material_child',
            targetId: parentId,
            payload: { materialId: child.id, quantity: normalizeQuantity(sourceChild.qty) },
          });
        } else if (!existing.some((entry) => String(entry.qty) === String(sourceChild.qty))) {
          operations.push({
            operationType: 'update_material_child_quantity',
            targetId: parentId,
            payload: {
              childId: child.id,
              originalQuantity: normalizeQuantity(existing[0].qty),
              quantity: normalizeQuantity(sourceChild.qty),
            },
          });
        }
      }
    }
  }
  return operations;
}

export function buildAllFourColorVariantOperations(payload) {
  const configs = pendingConfigs(payload);
  return [
    ...buildMasterDataOperations(payload, COLOR_VARIANTS),
    ...buildVariantOperations(payload, configs),
    ...buildReplacementOperations(payload, COLOR_VARIANTS),
    ...buildMaterialColorOperations(payload, COLOR_VARIANTS),
    ...buildMaterialChildOperations(payload, COLOR_VARIANTS),
    ...buildHardwareChildOperations(payload, COLOR_VARIANTS),
    ...buildMisScopedHardwareChildRemovalOperations(payload, COLOR_VARIANTS),
    ...buildObsoleteMaterialOperations(payload, COLOR_VARIANTS),
  ];
}

export function buildFourColorVariantProposalBatches(payload, maxBatchSize = 40) {
  const operations = buildAllFourColorVariantOperations(payload);
  const batches = [];
  for (let index = 0; index < operations.length; index += maxBatchSize) {
    const chunk = operations.slice(index, index + maxBatchSize);
    batches.push({
      summary: `ECN-2026-0824-COLOR: 新增颜色 SKU 批次 ${batches.length + 1}（${chunk.length} 项操作）`,
      operations: chunk,
    });
  }
  return batches;
}

export { CHANGE_REASON, COLOR_VARIANTS };
