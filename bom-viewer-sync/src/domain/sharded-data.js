import { clone } from './materials.js';

const SHARD_SCHEMA_VERSION = 1;
const SAFE_PRODUCT_CODE = /^[A-Za-z0-9_-]+$/;

function own(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function productPath(productCode) {
  const code = String(productCode || '');
  if (!SAFE_PRODUCT_CODE.test(code)) throw new Error(`Invalid product code: ${code}`);
  return `data/products/${code}.json`;
}

function emptyWhereUsedRecord() {
  return { productEntries: [], parentEntries: [], childEntries: [] };
}

function whereUsedRecord(index, materialId) {
  const id = String(materialId || '');
  if (!id) return null;
  if (!index.materials[id]) index.materials[id] = emptyWhereUsedRecord();
  return index.materials[id];
}

function buildWhereUsedIndex(entries, datasetVersion) {
  const index = {
    schemaVersion: SHARD_SCHEMA_VERSION,
    datasetVersion,
    materials: {},
  };

  entries.forEach((entry) => {
    const productCode = String(entry?.productCode || '');
    const entryId = String(entry?.id || '');
    if (entry?.parentType === 'product') {
      whereUsedRecord(index, entry.materialId)?.productEntries.push({ productCode, entryId });
      return;
    }
    if (entry?.parentType !== 'material') return;
    whereUsedRecord(index, entry.childMaterialId || entry.materialId)?.parentEntries.push({
      productCode,
      entryId,
      parentId: String(entry.parentId || ''),
    });
    whereUsedRecord(index, entry.parentId)?.childEntries.push({
      productCode,
      entryId,
      materialId: String(entry.childMaterialId || entry.materialId || ''),
    });
  });

  return index;
}

function productDescriptor(payload, productCode, path) {
  const revision = payload.productRevisions?.[productCode] || {};
  return {
    code: productCode,
    path,
    currentRevision: String(revision.currentRevision || ''),
    effectiveRevision: String(revision.effectiveRevision || ''),
  };
}

function productShard(payload, productCode, datasetVersion, scopedEntries) {
  const shard = {
    schemaVersion: SHARD_SCHEMA_VERSION,
    datasetVersion,
    productCode,
    product: clone(payload.bom[productCode]),
    bomEntries: scopedEntries.map(({ entry }) => clone(entry)),
    bomEntryPositions: scopedEntries.map(({ position }) => position),
  };
  ['drawings', 'manuals', 'models3d', 'productImages', 'productRevisions'].forEach((field) => {
    if (own(payload[field], productCode)) shard[field] = clone(payload[field][productCode]);
  });
  return shard;
}

export function splitPayloadIntoShards(payload, options = {}) {
  const source = payload || {};
  const datasetVersion = String(options.datasetVersion || '');
  if (!datasetVersion) throw new Error('Dataset version is required');

  const productCodes = Object.keys(source.bom || {}).sort();
  productCodes.forEach(productPath);
  const entries = Array.isArray(source.materialDb?.bomEntries) ? source.materialDb.bomEntries : [];
  const entriesByProduct = Object.fromEntries(productCodes.map((productCode) => [productCode, []]));
  entries.forEach((entry, position) => {
    const productCode = String(entry?.productCode || '');
    if (!entriesByProduct[productCode]) {
      throw new Error(`BOM entry ${entry?.id || position} has no valid product scope`);
    }
    entriesByProduct[productCode].push({ entry, position });
  });

  const products = {};
  productCodes.forEach((productCode) => {
    products[productCode] = productShard(source, productCode, datasetVersion, entriesByProduct[productCode]);
  });

  const manifest = {
    schemaVersion: SHARD_SCHEMA_VERSION,
    datasetVersion,
    payloadVersion: source.version != null ? source.version : 2,
    updatedAt: String(source.updatedAt || ''),
    materialsPath: 'data/materials.json',
    whereUsedPath: 'data/indexes/where-used.json',
    notificationsPath: 'data/notifications.json',
    products: productCodes.map((productCode) =>
      productDescriptor(source, productCode, productPath(productCode))),
  };

  return {
    manifest,
    materials: {
      schemaVersion: SHARD_SCHEMA_VERSION,
      datasetVersion,
      ...(own(source.materialDb, 'version') ? { materialDbVersion: source.materialDb.version } : {}),
      materials: clone(source.materialDb?.materials || {}),
    },
    whereUsed: buildWhereUsedIndex(entries, datasetVersion),
    notifications: {
      schemaVersion: SHARD_SCHEMA_VERSION,
      datasetVersion,
      notifications: clone(source.notifications || []),
    },
    products,
  };
}

function assertShardVersion(shard, expectedVersion, label) {
  if (!shard || shard.schemaVersion !== SHARD_SCHEMA_VERSION) {
    throw new Error(`Invalid ${label} shard schema`);
  }
  if (shard.datasetVersion !== expectedVersion) {
    throw new Error(`Dataset version mismatch for ${label}`);
  }
}

export function composePayloadFromShards(shardSet) {
  const manifest = shardSet?.manifest;
  assertShardVersion(manifest, manifest?.datasetVersion, 'manifest');
  const datasetVersion = manifest.datasetVersion;
  assertShardVersion(shardSet.materials, datasetVersion, 'materials');
  assertShardVersion(shardSet.notifications, datasetVersion, 'notifications');

  const payload = {
    version: manifest.payloadVersion,
    updatedAt: String(manifest.updatedAt || ''),
    bom: {},
    drawings: {},
    manuals: {},
    models3d: {},
    productImages: {},
    productRevisions: {},
    notifications: clone(shardSet.notifications.notifications || []),
    materialDb: {
      ...(own(shardSet.materials, 'materialDbVersion')
        ? { version: shardSet.materials.materialDbVersion }
        : {}),
      materials: clone(shardSet.materials.materials || {}),
      bomEntries: [],
    },
  };
  const positionedEntries = [];

  manifest.products.forEach((descriptor) => {
    const productCode = String(descriptor.code || '');
    productPath(productCode);
    const shard = shardSet.products?.[productCode];
    assertShardVersion(shard, datasetVersion, `product ${productCode}`);
    if (shard.productCode !== productCode) throw new Error(`Product shard code mismatch for ${productCode}`);
    payload.bom[productCode] = clone(shard.product);
    ['drawings', 'manuals', 'models3d', 'productImages', 'productRevisions'].forEach((field) => {
      if (own(shard, field)) payload[field][productCode] = clone(shard[field]);
    });
    const entries = Array.isArray(shard.bomEntries) ? shard.bomEntries : [];
    const positions = Array.isArray(shard.bomEntryPositions) ? shard.bomEntryPositions : [];
    if (entries.length !== positions.length) throw new Error(`BOM entry positions mismatch for ${productCode}`);
    entries.forEach((entry, index) => positionedEntries.push({
      position: positions[index],
      entry: clone(entry),
    }));
  });

  positionedEntries.sort((left, right) => left.position - right.position);
  payload.materialDb.bomEntries = positionedEntries.map(({ entry }) => entry);
  return payload;
}

export function shardFiles(shardSet) {
  const files = {
    'data/manifest.json': shardSet.manifest,
    'data/materials.json': shardSet.materials,
    'data/indexes/where-used.json': shardSet.whereUsed,
    'data/notifications.json': shardSet.notifications,
  };
  shardSet.manifest.products.forEach(({ code, path }) => {
    if (path !== productPath(code)) throw new Error(`Invalid product path for ${code}`);
    files[path] = shardSet.products[code];
  });
  return files;
}
