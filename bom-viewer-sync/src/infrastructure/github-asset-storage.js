export const MAX_ASSET_BYTES = 20_000_000;

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const BASE64_CHUNK_SIZE = 0x8000;
const MEDIA_PREFIX = {
  'application/pdf': 'assets/pdfs/',
  'model/gltf-binary': 'assets/models/',
  'model/gltf+json': 'assets/models/',
};
const ASSET_PATH_PATTERN = /^assets\/(?:pdfs|models)\/[A-Za-z0-9._-]+$/;

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

function normalizeConfig(config) {
  return {
    owner: sanitizeSegment(config?.owner, 'owner'),
    repo: sanitizeSegment(config?.repo, 'repo'),
    branch: sanitizeSegment(config?.branch || 'main', 'branch'),
  };
}

function validateUpload({ path, contentType, bytes }) {
  requireBytes(bytes);
  if (bytes.byteLength === 0) throw new TypeError('bytes must not be empty');
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    throw new TypeError(`bytes must not exceed ${MAX_ASSET_BYTES}`);
  }
  const prefix = MEDIA_PREFIX[contentType];
  if (!prefix) throw new TypeError(`Unsupported contentType: ${contentType}`);
  if (!String(path).startsWith(prefix) || !ASSET_PATH_PATTERN.test(String(path))) {
    throw new TypeError('Invalid asset path');
  }
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function validateCreatedAsset(data, {
  config,
  path,
  size,
  contentHash,
  endpoint,
}) {
  const commitSha = String(data?.commit?.sha || '');
  if (data?.content?.path !== path
    || data?.content?.size !== size
    || !COMMIT_PATTERN.test(commitSha)) {
    throw new GithubAssetStorageError(`Invalid GitHub asset response from ${endpoint}`, {
      code: 'GITHUB_ASSET_INVALID_RESPONSE',
      endpoint,
    });
  }
  return {
    path,
    size,
    contentHash,
    commitSha,
    url: buildCdnUrl({ config, commitSha, path }),
    reused: false,
  };
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

export function createGithubAssetStorageAdapter({ config, fetchImpl = globalThis.fetch }) {
  const cleanConfig = normalizeConfig(config);
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(cleanConfig.owner)}/${encodeURIComponent(cleanConfig.repo)}`;

  async function requestJson(url, options, endpoint) {
    let response;
    try {
      response = await fetchImpl(url, options);
    } catch {
      throw new GithubAssetStorageError(`GET ${endpoint} failed: network error`, { endpoint });
    }
    if (!response.ok) {
      throw new GithubAssetStorageError(
        `GET ${endpoint} failed: ${response.status} ${response.statusText}`,
        { status: response.status, endpoint },
      );
    }
    try {
      return await response.json();
    } catch {
      throw new GithubAssetStorageError(`Invalid JSON response from ${endpoint}`, {
        code: 'GITHUB_ASSET_INVALID_RESPONSE',
        endpoint,
      });
    }
  }

  async function resolveExistingAsset({ token, path, expectedSize, contentHash }) {
    if (!HASH_PATTERN.test(String(contentHash || '')) || !String(path).includes(`_${contentHash}_`)) {
      throw new GithubAssetStorageError(`Existing asset identity mismatch: ${path}`, {
        code: 'GITHUB_ASSET_CONFLICT',
      });
    }
    const contentsEndpoint = `/contents/${encodePath(path)}?ref=${encodeURIComponent(cleanConfig.branch)}`;
    const existing = await requestJson(
      `${apiBase}${contentsEndpoint}`,
      { headers: githubHeaders(token) },
      contentsEndpoint,
    );
    if (existing?.path !== path || existing?.size !== expectedSize) {
      throw new GithubAssetStorageError(`Existing asset does not match: ${path}`, {
        code: 'GITHUB_ASSET_CONFLICT',
        endpoint: contentsEndpoint,
      });
    }
    const commitsEndpoint = `/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(cleanConfig.branch)}&per_page=1`;
    const commits = await requestJson(
      `${apiBase}${commitsEndpoint}`,
      { headers: githubHeaders(token) },
      commitsEndpoint,
    );
    const commitSha = String(commits?.[0]?.sha || '');
    if (!COMMIT_PATTERN.test(commitSha)) {
      throw new GithubAssetStorageError(`Invalid commit history for ${path}`, {
        code: 'GITHUB_ASSET_INVALID_RESPONSE',
        endpoint: commitsEndpoint,
      });
    }
    return {
      path,
      size: expectedSize,
      contentHash,
      commitSha,
      url: buildCdnUrl({ config: cleanConfig, commitSha, path }),
      reused: true,
    };
  }

  return {
    resolveExistingAsset,
    async uploadAsset({ token, path, contentType, bytes }) {
      validateUpload({ path, contentType, bytes });
      const contentHash = await sha256Hex(bytes);
      if (!String(path).includes(`_${contentHash}_`)) {
        throw new TypeError('path must contain the full content hash');
      }
      const endpoint = `/contents/${encodePath(path)}`;
      let response;
      try {
        response = await fetchImpl(`${apiBase}${endpoint}`, {
          method: 'PUT',
          headers: githubHeaders(token),
          body: JSON.stringify({
            message: `Upload BOM asset ${path}`,
            content: encodeBase64Bytes(bytes),
            branch: cleanConfig.branch,
          }),
        });
      } catch {
        throw new GithubAssetStorageError(`PUT ${endpoint} failed: network error`, { endpoint });
      }
      if (response.status === 409 || response.status === 422) {
        return resolveExistingAsset({
          token,
          path,
          expectedSize: bytes.byteLength,
          contentHash,
        });
      }
      if (!response.ok) {
        throw new GithubAssetStorageError(
          `PUT ${endpoint} failed: ${response.status} ${response.statusText}`,
          { status: response.status, endpoint },
        );
      }
      let data;
      try {
        data = await response.json();
      } catch {
        throw new GithubAssetStorageError(`Invalid JSON response from ${endpoint}`, {
          code: 'GITHUB_ASSET_INVALID_RESPONSE',
          endpoint,
        });
      }
      return validateCreatedAsset(data, {
        config: cleanConfig,
        path,
        size: bytes.byteLength,
        contentHash,
        endpoint,
      });
    },
  };
}
