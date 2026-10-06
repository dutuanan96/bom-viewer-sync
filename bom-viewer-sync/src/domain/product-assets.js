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

export function resolveProductImage(productAssets, colorKeys) {
  for (const key of colorKeys || []) {
    if (key == null || key === '') continue;
    const image = productAssets?.images?.[String(key)];
    if (image && (image.url || image.previewUrl)) return image;
  }
  return null;
}
