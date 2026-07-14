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
  const resources = [...(document.buffers || []), ...(document.images || [])];
  return resources.every((resource) => !Object.prototype.hasOwnProperty.call(resource || {}, 'uri')
    || hasPortableUri(resource.uri));
}

export async function validateMaterialAssetFile({ file, typeKey }) {
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
  if (typeKey === 'drawings') {
    if (extension !== '.pdf'
      || file.type !== 'application/pdf'
      || !hasSignature(bytes, PDF_SIGNATURE)) {
      throw new MaterialAssetUploadError('INVALID_PDF_FILE');
    }
    return { bytes, kind: 'pdf', contentType: 'application/pdf', originalName };
  }

  if (typeKey !== 'models3d') throw new MaterialAssetUploadError('INVALID_ASSET_FILE');
  if (extension === '.glb') {
    if (!hasSignature(bytes, GLB_SIGNATURE)) {
      throw new MaterialAssetUploadError('INVALID_GLB_FILE');
    }
    return { bytes, kind: 'glb', contentType: 'model/gltf-binary', originalName };
  }
  if (extension === '.gltf') {
    if (!isPortableGltf(new TextDecoder().decode(bytes))) {
      throw new MaterialAssetUploadError('INVALID_GLTF_FILE');
    }
    return { bytes, kind: 'gltf', contentType: 'model/gltf+json', originalName };
  }
  throw new MaterialAssetUploadError('INVALID_ASSET_FILE');
}

export async function resolvePendingMaterialAssets({ payload, pendingAssets, upload }) {
  const nextPayload = clone(payload);
  const completedPendingIds = new Set();
  for (const material of Object.values(nextPayload.materialDb?.materials || {})) {
    for (const typeKey of ['drawings', 'models3d']) {
      for (const asset of material[typeKey] || []) {
        const pendingId = asset.pendingAssetId;
        if (!pendingId) continue;
        const pending = pendingAssets?.[pendingId];
        if (!pending) throw new MaterialAssetUploadError('PENDING_ASSET_MISSING');
        const resolved = pending.resolved || await upload(pending);
        pending.resolved = resolved;
        asset.url = resolved.url;
        if (typeKey === 'models3d') asset.previewUrl = resolved.url;
        delete asset.pendingAssetId;
        completedPendingIds.add(pendingId);
      }
    }
  }
  return {
    payload: nextPayload,
    completedPendingIds: Array.from(completedPendingIds),
  };
}
