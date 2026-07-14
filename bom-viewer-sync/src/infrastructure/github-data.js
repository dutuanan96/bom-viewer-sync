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

export function contentsUrl(config) {
  const clean = normalizeConfig(config);
  return `https://api.github.com/repos/${encodeURIComponent(clean.owner)}/${encodeURIComponent(clean.repo)}/contents/${apiPath(clean.path)}`;
}

export function rawContentsUrl(config) {
  const clean = normalizeConfig(config);
  if (!clean.owner || !clean.repo || !clean.branch || !clean.path) return '';
  return `${contentsUrl(clean)}?ref=${encodeURIComponent(clean.branch)}`;
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

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export function buildGithubUpdateRequest({ config, token, sha, source, message }) {
  const clean = normalizeConfig(config);
  const body = {
    message: message || 'chore: update bom data',
    content: encodeBase64Utf8(source),
    branch: clean.branch,
  };
  if (sha) body.sha = sha;
  return {
    url: contentsUrl(clean),
    options: {
      method: 'PUT',
      headers: {
        ...githubHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  };
}

export function createGithubDataAdapter({ config, fetchImpl = globalThis.fetch, now = Date.now }) {
  const cleanConfig = normalizeConfig(config);
  const basePath = cleanConfig.path.includes('/') ? cleanConfig.path.substring(0, cleanConfig.path.lastIndexOf('/')) : '';
  const dataDir = basePath ? `${basePath}/data` : 'data';

  const fetchJsonPublic = async (filename, cacheBust) => {
    const fileConfig = { ...cleanConfig, rawUrl: '', path: `${dataDir}/${filename}` };
    const requests = [
      rawContentsUrl(fileConfig) && {
        url: `${rawContentsUrl(fileConfig)}&t=${cacheBust}`,
        options: { cache: 'no-store', headers: { Accept: 'application/vnd.github.raw' } },
      },
      rawUrl(fileConfig) && {
        url: `${rawUrl(fileConfig)}${rawUrl(fileConfig).includes('?') ? '&' : '?'}t=${cacheBust}`,
        options: { cache: 'no-store' },
      },
    ].filter(Boolean);
    const errors = [];
    for (const request of requests) {
      try {
        const response = await fetchImpl(request.url, request.options);
        if (!response.ok) {
          const error = new Error(`${response.status} ${response.statusText}`);
          error.status = response.status;
          throw error;
        }
        return await response.json();
      } catch (error) {
        errors.push(error);
      }
    }
    const non404 = errors.find((e) => e.status !== 404);
    if (non404) throw non404;
    throw errors[errors.length - 1] || new Error(`Failed to load ${filename}`);
  };



  return {
    async loadPublic() {
      const cacheBust = now();

      let manifest;
      let manifest404 = false;
      try {
        manifest = await fetchJsonPublic('manifest.json', cacheBust);
      } catch (err) {
        if (err.status !== 404) throw err;
        manifest404 = true;
      }

      if (!manifest404) {
        const materials = await fetchJsonPublic('materials.json', cacheBust);
        return normalizePayload(await assembleShardedPayload(manifest, materials, (id) => {
          if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`Invalid product ID: ${id}`);
          return fetchJsonPublic(`products/${encodeURIComponent(id)}.json`, cacheBust);
        }));
      }

      const requests = [
        rawContentsUrl(cleanConfig) && {
          url: `${rawContentsUrl(cleanConfig)}&t=${cacheBust}`,
          options: { cache: 'no-store', headers: { Accept: 'application/vnd.github.raw' } },
        },
        rawUrl(cleanConfig) && {
          url: `${rawUrl(cleanConfig)}${rawUrl(cleanConfig).includes('?') ? '&' : '?'}t=${cacheBust}`,
          options: { cache: 'no-store' },
        },
      ].filter(Boolean);
      let lastError;
      for (const request of requests) {
        try {
          const response = await fetchImpl(request.url, request.options);
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          return parseDataJsPayload(await response.text());
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('No cloud data source');
    },

    async loadForWrite(token) {
      const response = await fetchImpl(`${contentsUrl(cleanConfig)}?ref=${encodeURIComponent(cleanConfig.branch)}`, {
        headers: githubHeaders(token),
      });
      if (response.status === 404) return { sha: '', payload: null };
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      return {
        sha: data.sha || '',
        payload: data.content ? parseDataJsPayload(decodeBase64Utf8(data.content)) : null,
      };
    },

    async write({ token, sha, source, message }) {
      const request = buildGithubUpdateRequest({ config: cleanConfig, token, sha, source, message });
      const response = await fetchImpl(request.url, request.options);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    },
  };
}
