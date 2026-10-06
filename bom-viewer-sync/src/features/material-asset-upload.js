import { clone } from '../domain/materials.js';

const MAX_ASSET_BYTES = 20_000_000;
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];
const GLB_SIGNATURE = [0x67, 0x6c, 0x54, 0x46];

export class MaterialAssetUploadError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MaterialAssetUploadError';
    this.code = code;
  }
}

function hasSignature(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

function fileExtension(name) {
  const match = String(name || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : '';
}

function hasPortableUri(value) {
  if (typeof value !== 'string' || !value) return false;
  if (value.startsWith('data:')) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isPortableGltf(source) {
  let document;
  try {
    document = JSON.parse(source);
  } catch {
    return false;
  }
  if (!document || typeof document !== 'object' || !document.asset?.version) return false;
  if (document.buffers !== undefined && !Array.isArray(document.buffers)) return false;
  if (document.images !== undefined && !Array.isArray(document.images)) return false;
  const resources = [...(document.buffers || []), ...(document.images || [])];
  return resources.every((resource) => !Object.prototype.hasOwnProperty.call(resource || {}, 'uri')
    || hasPortableUri(resource.uri));
}

export async function validateMaterialAssetFile({ file, typeKey }) {
  return validateAssetFile({ file, ownerType: 'material', typeKey });
}

function imageFormat(extension, mimeType, bytes) {
  if (extension === '.jpg' || extension === '.jpeg') {
    return mimeType === 'image/jpeg'
      && bytes.length >= 3
      && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === '.png') {
    return mimeType === 'image/png'
      && hasSignature(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (extension === '.webp') {
    return mimeType === 'image/webp'
      && bytes.length >= 12
      && hasSignature(bytes, [0x52, 0x49, 0x46, 0x46])
      && hasSignature(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]);
  }
  return false;
}

export async function validateAssetFile({ file, ownerType = 'material', typeKey }) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new MaterialAssetUploadError('INVALID_ASSET_FILE');
  }
  if (Number(file.size) > MAX_ASSET_BYTES) {
    throw new MaterialAssetUploadError('ASSET_FILE_TOO_LARGE');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.byteLength) throw new MaterialAssetUploadError('INVALID_ASSET_FILE');
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    throw new MaterialAssetUploadError('ASSET_FILE_TOO_LARGE');
  }

  const originalName = String(file.name || '').trim();
  const extension = fileExtension(originalName);
  const isPdf = ownerType === 'material' && typeKey === 'drawings'
    || ownerType === 'product' && typeKey === 'manual';
  const isModel = ownerType === 'material' && typeKey === 'models3d'
    || ownerType === 'product' && typeKey === 'assembly';
  if (isPdf) {
    if (extension !== '.pdf'
      || file.type !== 'application/pdf'
      || !hasSignature(bytes, PDF_SIGNATURE)) {
      throw new MaterialAssetUploadError('INVALID_PDF_FILE');
    }
    return { bytes, kind: 'pdf', contentType: 'application/pdf', originalName };
  }

  if (isModel && extension === '.glb') {
    if (!hasSignature(bytes, GLB_SIGNATURE)) {
      throw new MaterialAssetUploadError('INVALID_GLB_FILE');
    }
    return { bytes, kind: 'glb', contentType: 'model/gltf-binary', originalName };
  }
  if (isModel && extension === '.gltf') {
    if (!isPortableGltf(new TextDecoder().decode(bytes))) {
      throw new MaterialAssetUploadError('INVALID_GLTF_FILE');
    }
    return { bytes, kind: 'gltf', contentType: 'model/gltf+json', originalName };
  }

  if (ownerType === 'product' && typeKey === 'image') {
    if (!imageFormat(extension, file.type, bytes)) {
      throw new MaterialAssetUploadError('INVALID_IMAGE_FILE');
    }
    return {
      bytes,
      kind: extension.slice(1),
      contentType: file.type,
      originalName,
    };
  }

  if (!isModel && !isPdf) throw new MaterialAssetUploadError('INVALID_ASSET_FILE');
  throw new MaterialAssetUploadError('INVALID_ASSET_FILE');
}

async function resolveAsset(asset, pendingAssets, upload, completedPendingIds, isModel = false) {
  const pendingId = asset?.pendingAssetId;
  if (!pendingId) return;
  const pending = pendingAssets?.[pendingId];
  if (!pending) throw new MaterialAssetUploadError('PENDING_ASSET_MISSING');
  const resolved = pending.resolved || await upload(pending);
  pending.resolved = resolved;
  asset.url = resolved.url;
  if (pending.ownerType === 'product') {
    asset.path = resolved.path || pending.path || pendingId;
    if (resolved.contentHash) asset.contentHash = resolved.contentHash;
  }
  if (isModel) asset.previewUrl = resolved.url;
  delete asset.pendingAssetId;
  completedPendingIds.add(pendingId);
}

export async function resolvePendingAssetReferences({ payload, pendingAssets, upload }) {
  const nextPayload = clone(payload);
  const completedPendingIds = new Set();
  for (const material of Object.values(nextPayload.materialDb?.materials || {})) {
    for (const typeKey of ['drawings', 'models3d']) {
      for (const asset of material[typeKey] || []) {
        await resolveAsset(asset, pendingAssets, upload, completedPendingIds, typeKey === 'models3d');
      }
    }
  }
  for (const revisions of Object.values(nextPayload.productAssets || {})) {
    for (const assets of Object.values(revisions || {})) {
      for (const asset of assets.manuals || []) {
        await resolveAsset(asset, pendingAssets, upload, completedPendingIds);
      }
      for (const asset of assets.assemblyModels || []) {
        await resolveAsset(asset, pendingAssets, upload, completedPendingIds, true);
      }
      for (const asset of Object.values(assets.images || {})) {
        await resolveAsset(asset, pendingAssets, upload, completedPendingIds);
      }
    }
  }
  return {
    payload: nextPayload,
    completedPendingIds: Array.from(completedPendingIds),
  };
}

export async function resolvePendingMaterialAssets(options) {
  return resolvePendingAssetReferences(options);
}

export { MaterialAssetUploadError as AssetUploadError };
