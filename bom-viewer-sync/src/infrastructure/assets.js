import { normalizeText } from '../shared/primitives.js';

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

export function assetDisplayUrl(asset, locationLike = globalThis.location) {
  const pathUrl = asset?.path || '';
  const remoteUrl = asset?.directUrl || asset?.url || '';
  const driveId = asset?.driveId || driveFileId(remoteUrl) || driveFileId(asset?.url || '');
  if (driveId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1600`;
  const isLocalDocument = ['file:', 'http:'].includes(locationLike?.protocol)
    && ['', 'localhost', '127.0.0.1'].includes(locationLike?.hostname || '');
  return isLocalDocument && pathUrl ? pathUrl : remoteUrl || pathUrl;
}

export function pdfFrameUrl(url) {
  const value = String(url || '').trim();
  const match = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  return match ? `https://drive.google.com/file/d/${encodeURIComponent(match[1])}/preview` : value || 'about:blank';
}
