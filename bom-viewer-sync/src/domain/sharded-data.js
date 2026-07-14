import { clone } from './materials.js';

export function isPlainObject(val) {
  return val && typeof val === 'object' && !Array.isArray(val);
}

export function validateProductId(id) {
  if (typeof id !== 'string') throw new Error(`Invalid product ID type: ${typeof id}`);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`Invalid product ID format: ${id}`);
}

export async function assembleShardedPayload(manifest, materials, loadProduct) {
  if (!isPlainObject(manifest) || !Array.isArray(manifest.products)) {
    throw new Error('Invalid manifest');
  }
  if (!isPlainObject(materials) || !isPlainObject(materials.materialDb) || !isPlainObject(materials.materialDb.materials) || !Array.isArray(materials.materialDb.bomEntries)) {
    throw new Error('Invalid materials');
  }

  const bom = Object.create(null);
  const seenIds = new Set();
  for (const productId of manifest.products) {
    validateProductId(productId);
    if (seenIds.has(productId)) throw new Error(`Duplicate product ID in manifest: ${productId}`);
    seenIds.add(productId);
    const product = await loadProduct(productId);
    if (!isPlainObject(product)) throw new Error(`Invalid product ${productId}`);
    bom[productId] = product;
  }

  return {
    version: manifest.version,
    updatedAt: manifest.updatedAt,
    productImages: manifest.productImages,
    productRevisions: manifest.productRevisions,
    notifications: manifest.notifications,
    bom,
    drawings: materials.drawings,
    manuals: materials.manuals,
    models3d: materials.models3d,
    materialDb: materials.materialDb,
  };
}

export function splitPayloadToShards(payload) {
  if (!isPlainObject(payload)) throw new Error('Invalid payload');
  if (!isPlainObject(payload.bom)) throw new Error('Invalid payload BOM');

  const productIds = Object.keys(payload.bom).sort();
  for (const id of productIds) {
    validateProductId(id);
  }

  const manifest = {
    version: payload.version,
    updatedAt: payload.updatedAt || '',
    products: productIds,
    productImages: clone(payload.productImages || {}),
    productRevisions: clone(payload.productRevisions || {}),
    notifications: clone(payload.notifications || [])
  };

  const materials = {
    drawings: clone(payload.drawings || {}),
    manuals: clone(payload.manuals || {}),
    models3d: clone(payload.models3d || {}),
    materialDb: clone(payload.materialDb || { materials: {}, bomEntries: [] })
  };

  const products = new Map();
  for (const id of productIds) {
    products.set(id, clone(payload.bom[id]));
  }

  return { manifest, materials, products };
}
