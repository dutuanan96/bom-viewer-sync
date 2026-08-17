/**
 * Orphan BOM Entry Remediation Proposal Builder
 * Scans payload for BOM entries referencing non-existent product colors
 * and produces deterministic remove_orphan_bom_entry mutation batches.
 */

export function findOrphanBomEntries(payload) {
  if (!payload?.materialDb?.bomEntries || !payload?.bom) return [];
  const entries = payload.materialDb.bomEntries;
  const orphanEntries = [];

  for (const entry of entries) {
    if (entry.parentType === 'material') continue;
    const productId = entry.productCode || entry.parentId;
    if (!productId) continue;
    const product = payload.bom[productId];
    if (!product) {
      orphanEntries.push(entry);
      continue;
    }
    if (entry.color && !product.color_info?.[entry.color]) {
      orphanEntries.push(entry);
    }
  }

  return orphanEntries;
}

export function buildOrphanBomCleanupBatches(payload, batchSize = 40) {
  const orphanEntries = findOrphanBomEntries(payload);
  if (!orphanEntries.length) return [];

  const operations = orphanEntries.map((entry) => ({
    operationType: 'remove_orphan_bom_entry',
    targetId: entry.id,
    payload: {},
  }));

  const batches = [];
  const totalBatches = Math.ceil(operations.length / batchSize);

  for (let i = 0; i < operations.length; i += batchSize) {
    const chunk = operations.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const chunkOrphans = orphanEntries.slice(i, i + batchSize);
    const affectedProducts = [...new Set(chunkOrphans.map((entry) => entry.productCode || entry.parentId))];
    const summary = `清理无主 BOM 行（批次 ${batchIndex}/${totalBatches}，共 ${chunk.length} 项）：移除 ${affectedProducts.slice(0, 4).join(', ')}${affectedProducts.length > 4 ? ' 等' : ''} 已废弃颜色的 BOM 关联`;

    batches.push({
      batchIndex,
      totalBatches,
      summary,
      operations: chunk,
    });
  }

  return batches;
}
