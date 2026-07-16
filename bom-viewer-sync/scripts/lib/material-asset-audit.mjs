function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function assetLocator(asset) {
  return String(asset?.url || asset?.path || asset?.previewUrl || asset?.name || '').trim();
}

export function indexMaterialUsage(payload) {
  const usage = {};
  for (const entry of payload?.materialDb?.bomEntries || []) {
    if (!entry?.materialId || !entry?.productCode) continue;
    const products = usage[entry.materialId] || new Set();
    products.add(String(entry.productCode));
    usage[entry.materialId] = products;
  }
  return Object.fromEntries(
    Object.entries(usage).map(([materialId, products]) => [
      materialId,
      [...products].sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
    ]),
  );
}

export function classifyAssetGroup(assets, hashes) {
  const list = Array.isArray(assets) ? assets : [];
  const locators = list.map(assetLocator);
  const missingLocators = locators.filter((locator) => !locator || !hashes?.[locator]);
  const uniqueHashes = [...new Set(
    locators.map((locator) => hashes?.[locator]).filter(Boolean),
  )].sort();
  let status = 'clean';
  if (missingLocators.length) {
    status = 'missing';
  } else if (uniqueHashes.length > 1) {
    status = 'conflict';
  } else if (list.length > 1) {
    status = 'duplicate';
  }
  return {
    status,
    assetCount: list.length,
    uniqueHashCount: uniqueHashes.length,
    missingLocators,
    hashes: uniqueHashes,
  };
}

function countProductAssemblyModels(models3d) {
  let count = 0;
  for (const groups of Object.values(models3d || {})) {
    for (const [key, assets] of Object.entries(groups || {})) {
      if (!key.includes('|')) count += Array.isArray(assets) ? assets.length : 0;
    }
  }
  return count;
}

export function auditMaterialAssets(payload, hashes) {
  const usage = indexMaterialUsage(payload);
  const materials = {};
  const statusCounts = { clean: 0, duplicate: 0, conflict: 0, missing: 0 };
  for (const [materialId, material] of Object.entries(payload?.materialDb?.materials || {})) {
    const drawings = classifyAssetGroup(material?.drawings, hashes);
    const models3d = classifyAssetGroup(material?.models3d, hashes);
    statusCounts[drawings.status] += 1;
    statusCounts[models3d.status] += 1;
    materials[materialId] = {
      code: material?.code || '',
      name: material?.name || {},
      products: usage[materialId] || [],
      drawings,
      models3d,
    };
  }
  return {
    summary: {
      materialCount: Object.keys(materials).length,
      productAssemblyModels: countProductAssemblyModels(payload?.models3d),
      statusCounts,
    },
    materials,
  };
}

function selectCanonicalAsset(assets, locator, materialId, kind) {
  const list = Array.isArray(assets) ? assets : [];
  if (locator === null) return [];
  const selected = list.find((asset) => assetLocator(asset) === locator);
  if (!selected) {
    throw new Error(`UNKNOWN_CANONICAL_ASSET:${materialId}:${kind}:${locator}`);
  }
  return [clone(selected)];
}

export function applyCanonicalMaterialAssets(payload, mapping) {
  const next = clone(payload);
  const changes = [];
  for (const [materialId, selection] of Object.entries(mapping?.materials || {})) {
    const material = next?.materialDb?.materials?.[materialId];
    if (!material) throw new Error(`UNKNOWN_MATERIAL:${materialId}`);
    const change = { materialId };
    for (const kind of ['drawings', 'models3d']) {
      if (!Object.prototype.hasOwnProperty.call(selection || {}, kind)) continue;
      const before = Array.isArray(material[kind]) ? material[kind] : [];
      const after = selectCanonicalAsset(before, selection[kind], materialId, kind);
      material[kind] = after;
      change[kind] = {
        before: before.length,
        after: after.length,
        canonical: selection[kind],
      };
    }
    if (Object.keys(change).length > 1) changes.push(change);
  }
  return { payload: next, changes };
}
