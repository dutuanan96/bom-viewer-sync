const CHANGE_REASON = 'ECN-2026-0922-FOOT: 将54底脚替换为41底脚，按颜色 SKU 保持黑白物料编码一致。';

const TARGET_PRODUCTS = Object.freeze(['LGS133', 'LGS233', 'LGS334', 'LGS434']);

const REPLACEMENTS = Object.freeze({
  ZJG150654BH: 'ZJG150641BH',
  ZJG150654WH: 'ZJG150641WH',
  ZJG15065423BH: 'ZJG15064123BH',
  ZJG15065423WH: 'ZJG15064123WH',
});

function findMaterialByCode(materials, code) {
  return Object.values(materials || {}).find((material) => material?.code === code) || null;
}

function nextDraftRevision(currentRevision) {
  const match = String(currentRevision || '').match(/^(.*?)(?:\.(\d+))?$/);
  if (!match) throw new Error(`Invalid revision: ${currentRevision}`);
  return `${match[1]}.${Number(match[2] || 0) + 1}`;
}

function buildRevisionOperations(payload) {
  return TARGET_PRODUCTS.map((productCode) => {
    const revision = payload?.productRevisions?.[productCode];
    if (!revision || revision.currentRevisionInfo?.workflowState !== 'released') {
      throw new Error(`Product ${productCode} must have a released current revision.`);
    }
    return {
      operationType: 'create_product_revision',
      targetId: productCode,
      payload: {
        revision: nextDraftRevision(revision.currentRevision),
        changeReason: CHANGE_REASON,
      },
    };
  });
}

function buildReplacementOperations(payload) {
  const materials = payload?.materialDb?.materials || {};
  const entries = payload?.materialDb?.bomEntries || [];
  const operations = [];

  for (const productCode of TARGET_PRODUCTS) {
    for (const [sourceCode, targetCode] of Object.entries(REPLACEMENTS)) {
      const source = findMaterialByCode(materials, sourceCode);
      const target = findMaterialByCode(materials, targetCode);
      if (!source || !target) {
        throw new Error(`Missing foot material mapping ${sourceCode} -> ${targetCode}.`);
      }

      for (const entry of entries) {
        if (entry.parentType !== 'product'
          || entry.productCode !== productCode
          || entry.materialId !== source.id) continue;
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

export function buildFootReplacementOperations(payload) {
  const replacementOperations = buildReplacementOperations(payload);
  if (replacementOperations.length === 0) return [];
  return [
    ...buildRevisionOperations(payload),
    ...replacementOperations,
  ];
}

export function buildFootReplacementProposalBatches(payload, maxBatchSize = 40) {
  const operations = buildFootReplacementOperations(payload);
  if (operations.length !== TARGET_PRODUCTS.length + 10) {
    throw new Error(`Expected 14 foot replacement operations, received ${operations.length}.`);
  }
  return [{
    summary: `ECN-2026-0922-FOOT: 54底脚替换为41底脚（${operations.length}项操作）`,
    operations: operations.slice(0, maxBatchSize),
  }];
}

export { CHANGE_REASON, REPLACEMENTS, TARGET_PRODUCTS };
