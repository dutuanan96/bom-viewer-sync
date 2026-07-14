const API_VERSION = '2026-03-10';

export class GithubReleaseError extends Error {
  constructor(message, { code, status, endpoint } = {}) {
    super(message);
    this.name = 'GithubReleaseError';
    this.code = code || 'GITHUB_RELEASE_REQUEST_FAILED';
    if (status !== undefined) this.status = status;
    if (endpoint !== undefined) this.endpoint = endpoint;
  }
}

function validateRelease(data, endpoint) {
  if (!Number.isInteger(data?.id) || data.id <= 0) {
    throw new GithubReleaseError(`Invalid GitHub release response from ${endpoint}`, {
      code: 'GITHUB_RELEASE_INVALID_RESPONSE',
      endpoint,
    });
  }
  return data;
}

function validateAsset(data, endpoint) {
  let downloadUrl;
  try {
    downloadUrl = new URL(String(data?.browser_download_url || ''));
  } catch {
    downloadUrl = null;
  }
  if (!Number.isInteger(data?.id)
    || data.id <= 0
    || !String(data?.name || '').trim()
    || downloadUrl?.protocol !== 'https:') {
    throw new GithubReleaseError(`Invalid GitHub release asset response from ${endpoint}`, {
      code: 'GITHUB_RELEASE_INVALID_RESPONSE',
      endpoint,
    });
  }
  return data;
}

function validateReleaseId(releaseId) {
  if (!Number.isInteger(releaseId) || releaseId <= 0) {
    throw new TypeError('releaseId must be a positive integer');
  }
}

export function createGithubReleaseAdapter({ config, fetchImpl = globalThis.fetch }) {
  const owner = String(config?.owner || '');
  const repo = String(config?.repo || '');
  const releaseTag = String(config?.releaseTag || 'assets-v1');
  const targetCommitish = String(config?.targetCommitish || 'main');
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const releaseEndpoint = `/releases/tags/${encodeURIComponent(releaseTag)}`;

  function headers(token, hasJsonBody = false) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
      'X-GitHub-Api-Version': API_VERSION,
    };
  }

  async function requestJson(endpoint, {
    token,
    method = 'GET',
    body,
    allowedStatuses = [],
  }) {
    const options = {
      method,
      headers: headers(token, body !== undefined),
    };
    if (body !== undefined) options.body = JSON.stringify(body);

    let response;
    try {
      response = await fetchImpl(`${apiBase}${endpoint}`, options);
    } catch {
      throw new GithubReleaseError(`${method} ${endpoint} failed: network error`, { endpoint });
    }
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      throw new GithubReleaseError(
        `${method} ${endpoint} failed: ${response.status} ${response.statusText}`,
        { status: response.status, endpoint },
      );
    }
    if (!response.ok) return { response, data: null };

    try {
      return { response, data: await response.json() };
    } catch {
      throw new GithubReleaseError(`Invalid JSON response from ${endpoint}`, {
        code: 'GITHUB_RELEASE_INVALID_RESPONSE',
        endpoint,
      });
    }
  }

  async function lookupRelease(token, allowMissing) {
    const { response, data } = await requestJson(releaseEndpoint, {
      token,
      allowedStatuses: allowMissing ? [404] : [],
    });
    return response.status === 404 ? null : validateRelease(data, releaseEndpoint);
  }

  async function listAssets({ token, releaseId }) {
    validateReleaseId(releaseId);
    const assets = [];
    for (let page = 1; ; page += 1) {
      const endpoint = `/releases/${releaseId}/assets?per_page=100&page=${page}`;
      const { data } = await requestJson(endpoint, { token });
      if (!Array.isArray(data)) {
        throw new GithubReleaseError(`Invalid GitHub release asset list from ${endpoint}`, {
          code: 'GITHUB_RELEASE_INVALID_RESPONSE',
          endpoint,
        });
      }
      assets.push(...data);
      if (data.length < 100) return assets;
    }
  }

  async function uploadAsset({ token, releaseId, name, contentType, body }) {
    validateReleaseId(releaseId);
    const cleanName = String(name || '').trim();
    const cleanContentType = String(contentType || '').trim();
    if (!cleanName) throw new TypeError('name is required');
    if (!cleanContentType) throw new TypeError('contentType is required');
    if (body === null || body === undefined) throw new TypeError('body is required');

    const endpoint = `/releases/${releaseId}/assets?name=${encodeURIComponent(cleanName)}`;
    const url = `https://uploads.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${endpoint}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          ...headers(token),
          'Content-Type': cleanContentType,
        },
        body,
      });
    } catch {
      throw new GithubReleaseError(`POST ${endpoint} failed: network error`, { endpoint });
    }

    if (response.status === 422) {
      const existing = (await listAssets({ token, releaseId }))
        .find((asset) => asset?.name === cleanName);
      if (existing?.state === 'starter') {
        throw new GithubReleaseError(`Release asset ${cleanName} is stuck in starter state`, {
          code: 'GITHUB_RELEASE_STARTER_ASSET',
          status: 422,
          endpoint,
        });
      }
      if (existing?.state === 'uploaded') {
        return { ...validateAsset(existing, endpoint), reused: true };
      }
      throw new GithubReleaseError(`Release asset name already exists: ${cleanName}`, {
        code: 'GITHUB_RELEASE_CONFLICT',
        status: 422,
        endpoint,
      });
    }
    if (response.status === 502) {
      throw new GithubReleaseError(`Release asset upload may have left a starter asset: ${cleanName}`, {
        code: 'GITHUB_RELEASE_STARTER_ASSET',
        status: 502,
        endpoint,
      });
    }
    if (!response.ok) {
      throw new GithubReleaseError(
        `POST ${endpoint} failed: ${response.status} ${response.statusText}`,
        { status: response.status, endpoint },
      );
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new GithubReleaseError(`Invalid JSON response from ${endpoint}`, {
        code: 'GITHUB_RELEASE_INVALID_RESPONSE',
        endpoint,
      });
    }
    return { ...validateAsset(data, endpoint), reused: false };
  }

  return {
    async getOrCreateRelease(token) {
      const existing = await lookupRelease(token, true);
      if (existing) return existing;

      const createEndpoint = '/releases';
      const { response, data } = await requestJson(createEndpoint, {
        token,
        method: 'POST',
        allowedStatuses: [422],
        body: {
          tag_name: releaseTag,
          target_commitish: targetCommitish,
          name: releaseTag,
          body: 'Binary assets for BOM Viewer.',
          draft: false,
          prerelease: false,
          make_latest: 'false',
        },
      });
      if (response.status === 422) return lookupRelease(token, false);
      return validateRelease(data, createEndpoint);
    },
    listAssets,
    uploadAsset,
  };
}
