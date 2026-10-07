import { clone } from './materials.js';

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeImageAsset(value) {
  if (typeof value === 'string') return { url: value };
  return isRecord(value) ? clone(value) : {};
}

export function normalizeProductAssetRegistry(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([productCode, revisions]) => {
    if (!isRecord(revisions)) return [];
    const normalizedRevisions = Object.fromEntries(Object.entries(revisions).flatMap(([revision, assets]) => {
      if (!isRecord(assets)) return [];
      const images = isRecord(assets.images)
        ? Object.fromEntries(Object.entries(assets.images).map(([color, image]) => [color, normalizeImageAsset(image)]))
        : {};
      return [[revision, {
        ...clone(assets),
        manuals: Array.isArray(assets.manuals) ? clone(assets.manuals) : [],
        assemblyModels: Array.isArray(assets.assemblyModels) ? clone(assets.assemblyModels) : [],
        images,
      }]];
    }));
    return [[productCode, normalizedRevisions]];
  }));
}

function legacyAssemblyModels(value) {
  if (Array.isArray(value)) return clone(value);
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter(([key]) => !key.includes('|'))
    .flatMap(([, models]) => (Array.isArray(models) ? clone(models) : []));
}

export function resolveProductAssets(payload, productCode, revision) {
  const productCodeKey = String(productCode || '');
  const revisionKey = String(revision || '');
  const revisionRegistry = payload?.productAssets?.[productCodeKey];
  if (isRecord(revisionRegistry) && Object.prototype.hasOwnProperty.call(revisionRegistry, revisionKey)) {
    const normalizedRegistry = normalizeProductAssetRegistry({
      [productCodeKey]: { [revisionKey]: revisionRegistry[revisionKey] },
    });
    return normalizedRegistry[productCodeKey]?.[revisionKey] || { manuals: [], assemblyModels: [], images: {} };
  }

  const images = payload?.productImages?.[productCodeKey];
  return {
    manuals: Array.isArray(payload?.manuals?.[productCodeKey])
      ? clone(payload.manuals[productCodeKey])
      : [],
    assemblyModels: legacyAssemblyModels(payload?.models3d?.[productCodeKey]),
    images: isRecord(images)
      ? Object.fromEntries(Object.entries(images).map(([color, image]) => [color, normalizeImageAsset(image)]))
      : {},
  };
}

export function syncLegacyProductAssetMirrors(payload) {
  if (!isRecord(payload) || !isRecord(payload.productRevisions)) return payload;

  for (const [productCode, revisionInfo] of Object.entries(payload.productRevisions)) {
    const currentRevision = revisionInfo?.currentRevision;
    if (currentRevision == null || currentRevision === '') continue;

    const revisions = payload.productAssets?.[productCode];
    const revisionKey = String(currentRevision);
    if (!isRecord(revisions) || !Object.prototype.hasOwnProperty.call(revisions, revisionKey)) continue;

    const canonical = revisions[revisionKey];
    if (canonical === undefined) continue;

    if (!isRecord(payload.manuals)) payload.manuals = {};
    payload.manuals[productCode] = Array.isArray(canonical?.manuals)
      ? clone(canonical.manuals)
      : [];

    if (!isRecord(payload.productImages)) payload.productImages = {};
    payload.productImages[productCode] = isRecord(canonical?.images)
      ? clone(canonical.images)
      : {};

    const existingModels = isRecord(payload.models3d)
      ? payload.models3d[productCode]
      : undefined;
    const existingBuckets = isRecord(existingModels) ? Object.entries(existingModels) : [];
    const materialEntries = existingBuckets.filter(([key]) => key.includes('|'));
    const existingProductKey = existingBuckets.find(([key]) => !key.includes('|'))?.[0];
    const modelEntries = [...materialEntries];
    if (Array.isArray(canonical?.assemblyModels) && canonical.assemblyModels.length > 0) {
      modelEntries.push([
        existingProductKey || productCode,
        clone(canonical.assemblyModels),
      ]);
    }

    if (modelEntries.length > 0) {
      if (!isRecord(payload.models3d)) payload.models3d = {};
      payload.models3d[productCode] = Object.fromEntries(modelEntries);
    } else if (isRecord(payload.models3d)) {
      delete payload.models3d[productCode];
    }
  }

  return payload;
}

export function resolveProductImage(productAssets, colorKeys) {
  for (const key of colorKeys || []) {
    if (key == null || key === '') continue;
    const image = productAssets?.images?.[String(key)];
    if (image && (image.url || image.previewUrl)) return image;
  }
  return null;
}
