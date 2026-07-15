import { clone, normalizeMaterialDatabase } from '../domain/materials.js';
import { normalizeProductRevisionRegistry } from '../domain/revisions.js';
import { normalizeNotifications } from '../features/notifications.js';
import { assembleShardedPayload } from '../domain/sharded-data.js';

export function normalizeConfig(config) {
  const source = config || {};
  return {
    owner: String(source.owner || ''),
    repo: String(source.repo || ''),
    branch: String(source.branch || 'main'),
    path: String(source.path || 'data.js'),
    rawUrl: String(source.rawUrl || ''),
  };
}

function apiPath(pathValue) {
  return String(pathValue || 'data.js').split('/').map(encodeURIComponent).join('/');
}

export function rawUrl(config) {
  const clean = normalizeConfig(config);
  if (clean.rawUrl) return clean.rawUrl;
  if (!clean.owner || !clean.repo || !clean.branch || !clean.path) return '';
  return `https://raw.githubusercontent.com/${clean.owner}/${clean.repo}/${clean.branch}/${clean.path}`;
}


export function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += alphabet[first >> 2];
    output += alphabet[((first & 3) << 4) | ((second || 0) >> 4)];
    output += index + 1 < bytes.length ? alphabet[((second & 15) << 2) | ((third || 0) >> 6)] : '=';
    output += index + 2 < bytes.length ? alphabet[third & 63] : '=';
  }
  return output;
}

export function decodeBase64Utf8(value) {
  const clean = String(value || '').replace(/\s/g, '');
  if (!clean) return '';
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  }
  if (typeof Buffer !== 'undefined') return Buffer.from(clean, 'base64').toString('utf8');
  throw new Error('Base64 decoder unavailable');
}

export function normalizePayload(payload, fallbackProductImages = globalThis.BOM_VIEWER_DATA?.productImages || globalThis.PRODUCT_IMAGE_INDEX || {}) {
  const source = payload || {};
  const normalized = {
    version: source.version != null ? source.version : 2,
    updatedAt: String(source.updatedAt || ''),
    bom: clone(source.bom),
    drawings: clone(source.drawings),
    manuals: clone(source.manuals),
    models3d: clone(source.models3d),
    productImages: clone({ ...fallbackProductImages, ...(source.productImages || {}) }),
    productRevisions: normalizeProductRevisionRegistry(source),
    notifications: normalizeNotifications(source.notifications),
  };
  normalized.materialDb = normalizeMaterialDatabase({ ...source, ...normalized });
  return normalized;
}

export function serializeDataJs(payload) {
  return [
    '/* BOM cloud data. Update only through admin.html. */',
    `window.BOM_VIEWER_DATA = ${JSON.stringify(normalizePayload(payload), null, 2)};`,
    '',
  ].join('\n');
}

export function parseDataJsPayload(source) {
  const sandbox = {};
  const runner = new Function('window', `${source}\nreturn window.BOM_VIEWER_DATA;`);
  const payload = runner(sandbox);
  if (!payload || !payload.bom) throw new Error('Invalid data.js payload');
  return normalizePayload(payload);
}

