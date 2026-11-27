import { normalizeText } from '../shared/primitives.js';
import { sha256Hex } from './github-asset-storage.js';
import archivedPdfs from './archived-pdfs.json' with { type: 'json' };

const drawingReviewIds = new Set(archivedPdfs.dimensionsAndColorToVerify);

export function assetKey(value) {
  return normalizeText(value)
    .replace(/\.(pdf|glb|gltf)$/i, '')
    .replace(/[\s\-_()（）[\]【】{}+&.]/g, '')
    .replace(/组件/g, '');
}

export function colorNeutralCode(value) {
  const key = assetKey(value);
  return key.replace(/(bh|wh|kd|bz|cz|ys|gy|bk)$/i, '');
}

function assetParts(key) {
  const [code = '', name = ''] = String(key || '').split('|');
  return {
    code,
    name,
    neutralCode: colorNeutralCode(code)
  };
}

function materialAssetParts(material) {
  const code = assetKey(material?.mat_code || '');
  const name = assetKey(material?.name_zh || material?.name_vi || '');
  const comp = assetKey(material?.comp_code || '');
  return {
    directKey: code && name ? `${code}|${name}` : '',
    code,
    neutralCode: colorNeutralCode(code),
    name,
    comp
  };
}

export function findBomAssetEntry(assetMap, material) {
  const source = assetMap || {};
  const materialParts = materialAssetParts(material || {});
  if (materialParts.directKey && source[materialParts.directKey]) {
    return { key: materialParts.directKey, assets: source[materialParts.directKey] };
  }

  const entries = Object.entries(source);
  const matchers = [
    ([key]) => {
      const parts = assetParts(key);
      return materialParts.name && materialParts.code &&
        parts.name === materialParts.name && parts.code === materialParts.code;
    },
    ([key]) => {
      const parts = assetParts(key);
      return materialParts.name && materialParts.neutralCode &&
        parts.name === materialParts.name && parts.neutralCode === materialParts.neutralCode;
    },
    ([key]) => {
      const parts = assetParts(key);
      return materialParts.code && parts.code === materialParts.code;
    }
  ];

  for (const matcher of matchers) {
    const found = entries.find(matcher);
    if (found) return { key: found[0], assets: found[1] };
  }
  return null;
}

export function findBomAssets(assetMap, material) {
  return findBomAssetEntry(assetMap, material)?.assets || [];
}

export function driveFileId(url) {
  const value = String(url || '');
  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch) return fileMatch[1];
  const idMatch = value.match(/[?&]id=([^&#]+)/i);
  return idMatch ? decodeURIComponent(idMatch[1]) : '';
}

export function isDriveAssetUrl(value) {
  return /^(?:https?:\/\/|\/\/)?(?:drive\.google\.com|drive\.usercontent\.google\.com|lh3\.googleusercontent\.com)(?:[:/?#]|$)/i
    .test(String(value || '').trim());
}

export function assetDisplayUrl(asset, locationLike = globalThis.location, config) {
  const pathUrl = asset?.path || '';
  const remoteUrl = asset?.directUrl || asset?.url || '';
  const legacyDriveImage = asset?.driveId || isDriveAssetUrl(remoteUrl) || isDriveAssetUrl(asset?.url);
  if (legacyDriveImage && config?.owner && config?.repo && /^product-images\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(pathUrl)) {
    const projectPath = (config.shardRoot || 'data').split('/').slice(0, -1).map(encodeURIComponent);
    const repository = [config.owner, config.repo, config.branch || 'main'].map(encodeURIComponent);
    return `https://raw.githubusercontent.com/${[...repository, ...projectPath, pathUrl].join('/')}`;
  }
  if (legacyDriveImage && (!remoteUrl || isDriveAssetUrl(remoteUrl))) return '';
  const isLocalDocument = locationLike?.protocol === 'http:'
    && ['', 'localhost', '127.0.0.1'].includes(locationLike?.hostname || '');
  return isLocalDocument && pathUrl ? pathUrl : remoteUrl || pathUrl;
}

export function archivedPdfAddress(url, config, locationLike = globalThis.location, context) {
  const value = String(url || '').trim();
  if (!/^https:\/\/drive\.google\.com\/(?:file\/d\/|(?:open|uc)\?)/i.test(value)) return null;
  let id;
  try {
    id = driveFileId(value);
  } catch {
    return null;
  }
  const reference = Object.hasOwn(archivedPdfs.referenceDrawings, id) && archivedPdfs.referenceDrawings[id];
  const scopedReference = reference && context?.product === reference.product
    && context?.revision === reference.revision && reference.materialCodes.includes(context.materialCode)
    ? reference : null;
  const path = scopedReference?.path || (Object.hasOwn(archivedPdfs.files, id) ? archivedPdfs.files[id] : '');
  const hash = scopedReference?.hash
    || path.match(/^(?:drawings\/catalog\/drawing|assets\/pdfs\/manual)-([a-f0-9]{64})\.pdf$/)?.[1];
  if (!hash) return null;
  const needsDrawingReview = drawingReviewIds.has(id);
  const title = scopedReference?.title;
  if (locationLike?.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(locationLike.hostname)) {
    return { url: path, hash, needsDrawingReview, title };
  }
  if (!config?.owner || !config?.repo) return null;
  const repository = [config.owner, config.repo, config.branch || 'main'].map(encodeURIComponent);
  const projectPath = (config.shardRoot || 'data').split('/').slice(0, -1).map(encodeURIComponent);
  return { url: `https://raw.githubusercontent.com/${[...repository, ...projectPath, path].join('/')}`, hash, needsDrawingReview, title };
}

export async function readVerifiedPdf(response, expectedHash) {
  if (!response.ok) throw new Error(`Archived PDF HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const header = new TextDecoder().decode(bytes.subarray(0, 5));
  if (header !== '%PDF-' || await sha256Hex(bytes) !== expectedHash) {
    throw new Error('Archived PDF checksum mismatch');
  }
  return bytes;
}

export function pdfFrameUrl(url, locationLike = globalThis.location) {
  const value = String(url || '').trim();
  if (isDriveAssetUrl(value)) return 'about:blank';

  const isLocalDocument = ['file:', 'http:'].includes(locationLike?.protocol)
    && ['', 'localhost', '127.0.0.1'].includes(locationLike?.hostname || '');

  // If local document and url contains local catalog drawing path, use local relative path
  if (isLocalDocument && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    const localMatch = value.match(/(?:drawings\/catalog\/[^/?#]+\.pdf)$/i);
    if (localMatch) return localMatch[0];
  }

  // Convert raw.githubusercontent.com to jsdelivr CDN for iframe embedding
  const rawMatch = value.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)/i);
  if (rawMatch) {
    const [, user, repo, branch, filePath] = rawMatch;
    return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${filePath}`;
  }

  return value || 'about:blank';
}
