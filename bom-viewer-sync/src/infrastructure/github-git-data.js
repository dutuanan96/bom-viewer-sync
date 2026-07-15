const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const REPOSITORY_PART_PATTERN = /^[A-Za-z0-9_.-]+$/;
const PRODUCT_SHARD_PATTERN = /^data\/products\/([A-Za-z0-9_-]+)\.json$/;
const RESERVED_PRODUCT_IDS = new Set(['__proto__', 'constructor', 'prototype']);

export class GithubDataConflictError extends Error {
  constructor(message, status, endpoint) {
    super(message);
    this.name = 'GithubDataConflictError';
    if (status !== undefined) this.status = status;
    if (endpoint !== undefined) this.endpoint = endpoint;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateRepositoryPart(value, label) {
  if (!isNonEmptyString(value) || value !== value.trim() || !REPOSITORY_PART_PATTERN.test(value)) {
    throw new Error(`Invalid GitHub ${label} config`);
  }
  if (value === '.' || value === '..') throw new Error(`Invalid GitHub ${label} config`);
  return value;
}

function validateBranch(branch) {
  if (!isNonEmptyString(branch) || branch !== branch.trim()) {
    throw new Error('Invalid GitHub branch config');
  }
  if (
    branch.startsWith('/')
    || branch.endsWith('/')
    || branch.endsWith('.')
    || branch.includes('//')
    || branch.includes('..')
    || branch.includes('@{')
    || branch === '@'
    || /[\x00-\x20\x7f~^:?*[\\]/.test(branch)
  ) {
    throw new Error('Invalid GitHub branch config');
  }
  const segments = branch.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.endsWith('.lock'))) {
    throw new Error('Invalid GitHub branch config');
  }
  return branch;
}

function encodeRefPath(branch) {
  return branch.split('/').map(encodeURIComponent).join('/');
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateShardPath(path) {
  if (path === 'data/manifest.json' || path === 'data/materials.json') return;
  const productMatch = PRODUCT_SHARD_PATTERN.exec(path);
  if (!productMatch || RESERVED_PRODUCT_IDS.has(productMatch[1].toLowerCase())) {
    throw new Error(`Invalid or unsafe shard path: ${path}`);
  }
}

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value || '')) throw new Error(`Invalid ${label} response: missing SHA`);
  return value;
}

function validateRefResponse(data, expectedRef, expectedSha, label) {
  if (!data || data.ref !== expectedRef || data.object?.type !== 'commit') {
    throw new Error(`Invalid ${label} response`);
  }
  const sha = requireSha(data.object.sha, label);
  if (expectedSha && sha !== expectedSha) throw new Error(`Invalid ${label} response: unexpected SHA`);
  return sha;
}

function validateCommitResponse(data, expectedSha) {
  if (!data || requireSha(data.sha, 'commit') !== expectedSha) {
    throw new Error('Invalid commit response');
  }
  return requireSha(data.tree?.sha, 'commit tree');
}

function sanitizeError(error, token) {
  const source = error instanceof Error ? error : new Error(String(error));
  const exposedText = `${source.message}\n${source.stack || ''}\n${String(source.cause || '')}`;
  if (!exposedText.includes(token)) return source;

  const safeMessage = String(source.message).split(token).join('***');
  const safeError = source instanceof GithubDataConflictError
    ? new GithubDataConflictError(safeMessage, source.status, source.endpoint)
    : new Error(safeMessage);
  if (!(safeError instanceof GithubDataConflictError)) {
    safeError.name = source.name;
    if (source.status !== undefined) safeError.status = source.status;
    if (source.endpoint !== undefined) safeError.endpoint = source.endpoint;
  }
  return safeError;
}

function encodeBase64Utf8(content) {
  if (typeof Buffer !== 'undefined') return Buffer.from(content, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

export function createGithubGitDataWriter({ config, fetchImpl }) {
  if (!config || typeof config !== 'object') {
    throw new Error('Config object with owner, repo, and branch is required');
  }
  const owner = validateRepositoryPart(config.owner, 'owner');
  const repo = validateRepositoryPart(config.repo, 'repo');
  const branch = validateBranch(config.branch);
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl function is required');

  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const encodedBranch = encodeRefPath(branch);
  const fullRef = `refs/heads/${branch}`;

  async function githubFetch(url, options = {}) {
    const response = await fetchImpl(url, options);
    let json;
    try {
      json = await response.json();
    } catch {
      json = {};
    }

    if (!response.ok) {
      const error = new Error(json?.message || `GitHub API error: ${response.status}`);
      error.status = response.status;
      error.endpoint = url;
      throw error;
    }
    return json;
  }

  return {
    async writeFiles(input) {
      if (!isPlainRecord(input)) throw new Error('writeFiles input object is required');
      const { token, files, message, expectedHeadSha } = input;
      if (!isNonEmptyString(token)) throw new Error('token is required');
      if (!isNonEmptyString(message)) throw new Error('message is required');
      if (!SHA_PATTERN.test(expectedHeadSha || '')) {
        throw new Error('expectedHeadSha must be a full Git commit SHA');
      }
      if (!isPlainRecord(files) || Object.keys(files).length === 0) {
        throw new Error('files object is required');
      }

      const paths = Object.keys(files).sort();
      for (const path of paths) {
        validateShardPath(path);
        const content = files[path];
        if (typeof content !== 'string' && content !== null) {
          throw new Error(`Invalid content for path ${path}, must be string or null`);
        }
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      };

      try {
        const refUrl = `${apiBase}/git/ref/heads/${encodedBranch}`;
        const refData = await githubFetch(refUrl, { headers });
        const currentHeadSha = validateRefResponse(refData, fullRef, undefined, 'branch ref');

        if (currentHeadSha !== expectedHeadSha) {
          throw new GithubDataConflictError(
            `Expected HEAD ${expectedHeadSha} but found ${currentHeadSha}`,
            409,
            refUrl,
          );
        }

        const commitData = await githubFetch(`${apiBase}/git/commits/${currentHeadSha}`, { headers });
        const baseTreeSha = validateCommitResponse(commitData, currentHeadSha);

        const treeItems = [];
        for (const path of paths) {
          const content = files[path];
          if (content === null) {
            treeItems.push({ path, mode: '100644', type: 'blob', sha: null });
            continue;
          }

          const blobData = await githubFetch(`${apiBase}/git/blobs`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              content: encodeBase64Utf8(content),
              encoding: 'base64',
            }),
          });
          treeItems.push({
            path,
            mode: '100644',
            type: 'blob',
            sha: requireSha(blobData?.sha, 'blob'),
          });
        }

        const newTreeData = await githubFetch(`${apiBase}/git/trees`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
        });
        const newTreeSha = requireSha(newTreeData?.sha, 'tree');

        const newCommitData = await githubFetch(`${apiBase}/git/commits`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message,
            tree: newTreeSha,
            parents: [currentHeadSha],
          }),
        });
        const newCommitSha = requireSha(newCommitData?.sha, 'new commit');

        const updateRefUrl = `${apiBase}/git/refs/heads/${encodedBranch}`;
        let updateRefData;
        try {
          updateRefData = await githubFetch(updateRefUrl, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ sha: newCommitSha, force: false }),
          });
        } catch (error) {
          if (error.status === 409 || error.status === 422) {
            throw new GithubDataConflictError(
              `Reference update failed: ${error.message}`,
              error.status,
              error.endpoint,
            );
          }
          throw error;
        }

        const committedSha = validateRefResponse(updateRefData, fullRef, newCommitSha, 'updated ref');
        return { previousHeadSha: currentHeadSha, commitSha: committedSha };
      } catch (error) {
        throw sanitizeError(error, token);
      }
    },
  };
}
