import { composePayloadFromShards } from '../domain/sharded-data.js';

const SHARD_SCHEMA_VERSION = 1;
const SAFE_PRODUCT_CODE = /^[A-Za-z0-9_-]+$/;

function assertProductCode(productCode) {
  const code = String(productCode || '');
  if (!SAFE_PRODUCT_CODE.test(code)) throw new Error(`Invalid product code: ${code}`);
  return code;
}

function assertShard(shard, datasetVersion, label) {
  if (!shard || shard.schemaVersion !== SHARD_SCHEMA_VERSION) {
    throw new Error(`Invalid ${label} shard schema`);
  }
  if (shard.datasetVersion !== datasetVersion) {
    throw new Error(`Dataset version mismatch for ${label}`);
  }
  return shard;
}

export function createShardedDataRepository({
  loadJson,
  loadLegacyPayload,
  manifestPath = 'data/manifest.json',
}) {
  if (typeof loadJson !== 'function') throw new Error('loadJson is required');
  if (typeof loadLegacyPayload !== 'function') throw new Error('loadLegacyPayload is required');
  const cache = new Map();

  function cachedJson(path) {
    if (!cache.has(path)) {
      const request = Promise.resolve().then(() => loadJson(path));
      cache.set(path, request);
      request.catch(() => cache.delete(path));
    }
    return cache.get(path);
  }

  async function loadManifest() {
    try {
      const manifest = await cachedJson(manifestPath);
      return assertShard(manifest, manifest?.datasetVersion, 'manifest');
    } catch (error) {
      if (error?.code === 'NOT_FOUND') return null;
      throw error;
    }
  }

  async function requiredManifest() {
    const manifest = await loadManifest();
    if (!manifest) throw new Error('Sharded data manifest is unavailable');
    return manifest;
  }

  async function loadMaterials() {
    const manifest = await requiredManifest();
    return assertShard(await cachedJson(manifest.materialsPath), manifest.datasetVersion, 'materials');
  }

  async function loadWhereUsedIndex() {
    const manifest = await requiredManifest();
    return assertShard(await cachedJson(manifest.whereUsedPath), manifest.datasetVersion, 'where-used index');
  }

  async function loadNotifications() {
    const manifest = await requiredManifest();
    return assertShard(await cachedJson(manifest.notificationsPath), manifest.datasetVersion, 'notifications');
  }

  async function loadProduct(productCode) {
    const code = assertProductCode(productCode);
    const manifest = await requiredManifest();
    const descriptor = manifest.products?.find((product) => product.code === code);
    if (!descriptor) throw new Error(`Product not found in manifest: ${code}`);
    const expectedPath = `data/products/${code}.json`;
    if (descriptor.path !== expectedPath) throw new Error(`Invalid product path for ${code}`);
    const shard = assertShard(await cachedJson(descriptor.path), manifest.datasetVersion, `product ${code}`);
    if (shard.productCode !== code) throw new Error(`Product shard code mismatch for ${code}`);
    return shard;
  }

  async function loadCompletePayload() {
    const manifest = await loadManifest();
    if (!manifest) return loadLegacyPayload();
    const [materials, whereUsed, notifications, productShards] = await Promise.all([
      loadMaterials(),
      loadWhereUsedIndex(),
      loadNotifications(),
      Promise.all(manifest.products.map(({ code }) => loadProduct(code))),
    ]);
    const products = Object.fromEntries(productShards.map((product) => [product.productCode, product]));
    return composePayloadFromShards({ manifest, materials, whereUsed, notifications, products });
  }

  return {
    loadManifest,
    loadMaterials,
    loadWhereUsedIndex,
    loadNotifications,
    loadProduct,
    loadCompletePayload,
  };
}
