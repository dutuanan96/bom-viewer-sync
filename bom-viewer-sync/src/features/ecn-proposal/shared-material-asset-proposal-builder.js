function technicalSignature(material) {
  return [material?.name?.zh, material?.spec?.zh, material?.material?.zh, material?.attr?.zh]
    .map((value) => String(value || '').trim())
    .join('\u0001');
}

function cleanAsset(asset) {
  if (!asset?.url) return null;
  return Object.fromEntries(['name', 'url', 'previewUrl', 'path']
    .filter((key) => typeof asset[key] === 'string')
    .map((key) => [key, asset[key]]));
}

function canonicalAsset(materials, field) {
  return materials
    .flatMap((material) => material[field] || [])
    .map(cleanAsset)
    .filter(Boolean)
    .sort((left, right) => left.url.localeCompare(right.url))[0] || null;
}

function buildAssetOperations(payload, field) {
  const groups = new Map();
  for (const material of Object.values(payload?.materialDb?.materials || {})) {
    const signature = technicalSignature(material);
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(material);
  }

  const operations = [];
  for (const materials of groups.values()) {
    if (materials.length < 2) continue;
    const canonical = canonicalAsset(materials, field);
    if (!canonical) continue;
    for (const material of materials) {
      const current = material[field] || [];
      if (current.length === 1 && current[0]?.url === canonical.url) continue;
      operations.push({
        operationType: 'update_material',
        targetId: material.id,
        payload: { patch: { [field]: [canonical] } },
      });
    }
  }
  return operations;
}

export function buildSharedMaterialAssetOperations(payload) {
  return [
    ...buildAssetOperations(payload, 'drawings'),
    ...buildAssetOperations(payload, 'models3d'),
  ];
}

export function buildSharedMaterialAssetProposalBatches(payload, maxBatchSize = 40) {
  const operations = buildSharedMaterialAssetOperations(payload);
  const batches = [];
  for (let index = 0; index < operations.length; index += maxBatchSize) {
    const chunk = operations.slice(index, index + maxBatchSize);
    batches.push({
      summary: `ECN-2026-0824-ASSET: 统一共享物料 2D/3D 资产批次 ${batches.length + 1}（${chunk.length} 项操作）`,
      operations: chunk,
    });
  }
  return batches;
}
