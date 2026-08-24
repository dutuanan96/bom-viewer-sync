const TARGET_COLOR = Object.freeze({ zh: '山纹黑', vi: 'màu đen vân gỗ' });
const TARGET_MATERIAL_SUFFIX = 'SWH';

export const CHANGE_REASON = 'ECN-2026-0824-B201: 新增山纹黑 B201 SKU；沿用黑色 BOM，仅替换布抽及印有 SKU 的纸箱。';

export const VARIANT_CONFIGS = Object.freeze([
  { spu: 'LGS032', sourceSku: 'LGS032B101S', sku: 'LGS032B201S', nameZh: '山纹黑3列3层6抽开放式带灯带电布抽电视柜-45inch', fabricCodes: ['BC350282187BH'], cartonCode: 'LGS032PKXBH' },
  { spu: 'LGS132', sourceSku: 'LGS132B101S', sku: 'LGS132B201S', nameZh: '山纹黑美规3列3层6抽开放式带灯带电布抽电视柜-57inch', fabricCodes: ['BC460327187BH'], cartonCode: 'LGS132ZFXBH' },
  { spu: 'LGS233', sourceSku: 'LGS233BH02S', sku: 'LGS233B201S', nameZh: '3列3层9抽-68inch山纹黑', fabricCodes: ['BC550327173BH', 'BC550327187BH'], cartonCode: 'LGS233ZFXBH' },
  { spu: 'LGS333', sourceSku: 'LGS333BH02S', sku: 'LGS333B201S', nameZh: '美规山纹黑-3列3层基础款10抽斗柜-45inch', fabricCodes: ['BC257282168BH', 'BC350282187BH'], cartonCode: 'LGS333PKXBH' },
  { spu: 'LGS334', sourceSku: 'LGS334BH02S', sku: 'LGS334B201S', nameZh: '美规山纹黑-3列3层基础款10抽斗柜-57inch', fabricCodes: ['BC340327168BH', 'BC460327187BH'], cartonCode: 'LGS334ZFXBH' },
  { spu: 'LGS723', sourceSku: 'LGS723BH02S', sku: 'LGS723B201S', nameZh: '美规山纹黑-2列3层开放层架5抽带灯带电斗柜', fabricCodes: ['BC300282168BH', 'BC460282187BH'], cartonCode: 'LGS723ZFXBH' },
  { spu: 'LGS733', sourceSku: 'LGS733BH02S', sku: 'LGS733B201S', nameZh: '美规山纹黑-3列3层开放层架7抽带灯带电斗柜', fabricCodes: ['BC257282168BH', 'BC350282187BH'], cartonCode: 'LGS733PKXBH' },
  { spu: 'LGS833', sourceSku: 'LGS833BH02S', sku: 'LGS833B201S', nameZh: '美规山纹黑-3列3层开放层架带灯带电6抽斗柜-45inch', fabricCodes: ['BC350282187BH'], cartonCode: 'LGS833PKXBH' },
  { spu: 'LGS834', sourceSku: 'LGS834BH02S', sku: 'LGS834B201S', nameZh: '3列3层开放层架带灯带电6抽斗柜-山纹黑', fabricCodes: ['BC460327187BH'], cartonCode: 'LGS834ZFXBH' },
  { spu: 'LGS101', sourceSku: 'LGS101B101S', sku: 'LGS101B201S', nameZh: '1抽基础款山纹黑布艺边桌-1pcs', fabricCodes: ['BC350282150BH'], cartonCode: 'LGS101ZFXBH' },
  { spu: 'LGS111', sourceSku: 'LGS111B101S', sku: 'LGS111B201S', nameZh: '1抽山纹黑基础款布艺边桌-2pcs', fabricCodes: ['BC350282150BH'], cartonCode: 'LGS111ZFXBH' },
]);

function cleanAsset(asset) {
  if (!asset?.url) return null;
  return Object.fromEntries(['name', 'url', 'previewUrl', 'path']
    .filter((key) => typeof asset[key] === 'string')
    .map((key) => [key, asset[key]]));
}

function nextDraftRevision(currentRevision) {
  const match = String(currentRevision || '').match(/^(.*?)(?:\.(\d+))?$/);
  if (!match) throw new Error(`Invalid revision: ${currentRevision}`);
  return `${match[1]}.${Number(match[2] || 0) + 1}`;
}

function findColorBySku(product, sku) {
  return Object.entries(product?.color_info || {}).find(([, info]) => info?.sku === sku)?.[0] || '';
}

function findMaterialByCode(materials, code) {
  return Object.values(materials).find((material) => material?.code === code) || null;
}

function shanWenHeiCode(sourceCode) {
  if (!sourceCode.endsWith('BH')) throw new Error(`Expected BH material code: ${sourceCode}`);
  return `${sourceCode.slice(0, -2)}${TARGET_MATERIAL_SUFFIX}`;
}

function shanWenHeiNameVi(sourceName) {
  const text = String(sourceName || '');
  const replaced = text
    .replace(/đen khói/giu, 'đen vân gỗ')
    .replace(/màu đen/giu, 'màu đen vân gỗ');
  return replaced === text ? `${text} - màu đen vân gỗ` : replaced;
}

function materialCreateOperation(source, targetId, code, overrides = {}) {
  return {
    operationType: 'create_material',
    targetId,
    payload: {
      material: {
        code,
        name: overrides.name || source.name,
        spec: source.spec,
        material: source.material,
        color: overrides.color || source.color,
        attr: source.attr,
        unit: typeof source.unit === 'string' ? source.unit : String(source.unit?.zh || ''),
        drawings: overrides.drawings ?? (source.drawings || []).map(cleanAsset).filter(Boolean),
        models3d: overrides.models3d ?? (source.models3d || []).map(cleanAsset).filter(Boolean),
      },
    },
  };
}

function buildMasterDataOperations(payload) {
  const materials = payload?.materialDb?.materials || {};
  const operations = [];
  const fabricCodes = [...new Set(VARIANT_CONFIGS.flatMap((config) => config.fabricCodes))];

  for (const sourceCode of fabricCodes) {
    const source = findMaterialByCode(materials, sourceCode);
    if (!source) throw new Error(`Source fabric material ${sourceCode} not found.`);
    const code = shanWenHeiCode(sourceCode);
    if (findMaterialByCode(materials, code)) continue;
    operations.push(materialCreateOperation(source, `mat_${code.toLowerCase()}`, code, { color: TARGET_COLOR }));
  }

  for (const config of VARIANT_CONFIGS) {
    const source = findMaterialByCode(materials, config.cartonCode);
    if (!source) throw new Error(`Source carton material ${config.cartonCode} not found.`);
    const code = shanWenHeiCode(config.cartonCode);
    if (findMaterialByCode(materials, code)) continue;
    operations.push(materialCreateOperation(source, `mat_${code.toLowerCase()}`, code, {
      name: {
        zh: `${source.name?.zh || '纸箱'}（${config.sku}）`,
        vi: `${source.name?.vi || 'thùng carton'} (${config.sku})`,
      },
      drawings: [],
      models3d: [],
    }));
  }
  return operations;
}

function buildVariantOperations(payload) {
  const operations = [];
  for (const config of VARIANT_CONFIGS) {
    const product = payload?.bom?.[config.spu];
    if (!product) throw new Error(`Product ${config.spu} not found.`);
    const sourceColor = findColorBySku(product, config.sourceSku);
    if (!sourceColor) throw new Error(`Source SKU ${config.sourceSku} not found.`);
    const targetColor = findColorBySku(product, config.sku);
    if (targetColor) continue;

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
    const sourceInfo = product.color_info[sourceColor];
    operations.push({
      operationType: 'create_product_variant',
      targetId: config.spu,
      payload: {
        sourceColor,
        color: TARGET_COLOR,
        name: {
          zh: config.nameZh,
          vi: shanWenHeiNameVi(sourceInfo.name_vi),
        },
        sku: config.sku,
      },
    });
  }
  return operations;
}

function buildReplacementOperations(payload) {
  const materials = payload?.materialDb?.materials || {};
  const entries = payload?.materialDb?.bomEntries || [];
  const operations = [];

  for (const config of VARIANT_CONFIGS) {
    const product = payload?.bom?.[config.spu];
    const targetColor = findColorBySku(product, config.sku);
    if (!targetColor) continue;
    const replacements = [...config.fabricCodes, config.cartonCode];
    for (const sourceCode of replacements) {
      const source = findMaterialByCode(materials, sourceCode);
      const target = findMaterialByCode(materials, shanWenHeiCode(sourceCode));
      if (!source || !target) continue;
      const matchingEntries = entries.filter((entry) =>
        entry.parentType === 'product'
        && (entry.productCode === config.spu || entry.parentId === config.spu)
        && entry.color === targetColor
        && entry.materialId === source.id);
      for (const entry of matchingEntries) {
        operations.push({
          operationType: 'replace_bom_item',
          targetId: entry.id,
          payload: { materialId: target.id },
        });
      }
    }
  }
  return operations;
}

export function buildAllB201Operations(payload) {
  return [
    ...buildMasterDataOperations(payload),
    ...buildVariantOperations(payload),
    ...buildReplacementOperations(payload),
  ];
}

export function buildB201ProposalBatches(payload, maxBatchSize = 40) {
  const operations = buildAllB201Operations(payload);
  const batches = [];
  for (let index = 0; index < operations.length; index += maxBatchSize) {
    const chunk = operations.slice(index, index + maxBatchSize);
    batches.push({
      summary: `ECN-2026-0824-B201: 山纹黑 SKU 批次 ${batches.length + 1}（${chunk.length} 项操作）`,
      operations: chunk,
    });
  }
  return batches;
}

export function buildB201WithdrawalProposalBatches(payload, maxBatchSize = 40) {
  const operations = VARIANT_CONFIGS
    .filter((config) => {
      const product = payload?.bom?.[config.spu];
      const targetColor = findColorBySku(product, config.sku);
      const revision = payload?.productRevisions?.[config.spu];
      return targetColor
        && revision?.currentRevisionInfo?.workflowState === 'released'
        && revision.currentRevisionInfo?.changeReason === CHANGE_REASON;
    })
    .map((config) => ({
      operationType: 'withdraw_product_revision',
      targetId: config.spu,
      payload: { reason: 'Withdraw prematurely released B201 Shanwenhei variant for Draft review.' },
    }));
  if (!operations.length) return [];
  return [{
    summary: `ECN-2026-0824-B201: withdraw ${operations.length} prematurely released Shanwenhei revisions`,
    operations: operations.slice(0, maxBatchSize),
  }];
}
