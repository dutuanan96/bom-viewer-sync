export const MAX_ASSET_BYTES = 20_000_000;

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const BASE64_CHUNK_SIZE = 0x8000;

export class GithubAssetStorageError extends Error {
  constructor(message, { code, status, endpoint } = {}) {
    super(message);
    this.name = 'GithubAssetStorageError';
    this.code = code || 'GITHUB_ASSET_REQUEST_FAILED';
    if (status !== undefined) this.status = status;
    if (endpoint !== undefined) this.endpoint = endpoint;
  }
}

function requireBytes(value) {
  if (!(value instanceof Uint8Array)) throw new TypeError('bytes must be a Uint8Array');
  return value;
}

function sanitizeSegment(value, label) {
  const sanitized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .replace(/_+/g, '_')
    .slice(0, 120);
  if (!sanitized) throw new TypeError(`${label} is required`);
  return sanitized;
}

function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

export function encodeBase64Bytes(value) {
  const bytes = requireBytes(value);
  if (typeof globalThis.btoa !== 'function') throw new Error('Base64 encoder unavailable');
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE)));
  }
  return globalThis.btoa(chunks.join(''));
}

export async function sha256Hex(value) {
  const bytes = requireBytes(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildAssetPath({ kind, materialCode, originalName, contentHash }) {
  if (!HASH_PATTERN.test(String(contentHash || ''))) {
    throw new TypeError('contentHash must be a lowercase SHA-256 digest');
  }
  const folders = { pdf: 'pdfs', glb: 'models', gltf: 'models' };
  const folder = folders[kind];
  if (!folder) throw new TypeError(`Unsupported asset kind: ${kind}`);
  const code = sanitizeSegment(materialCode, 'materialCode');
  const name = sanitizeSegment(originalName, 'originalName');
  return `assets/${folder}/${code}_${contentHash}_${name}`;
}

export function buildCdnUrl({ config, commitSha, path }) {
  if (!COMMIT_PATTERN.test(String(commitSha || ''))) {
    throw new TypeError('commitSha must be a full Git commit SHA');
  }
  const owner = sanitizeSegment(config?.owner, 'owner');
  const repo = sanitizeSegment(config?.repo, 'repo');
  return `https://cdn.jsdelivr.net/gh/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}@${commitSha}/${encodePath(path)}`;
}
