const API_VERSION = '2022-11-28';

export class GithubDataConflictError extends Error {
  constructor(message, { status, endpoint } = {}) {
    super(message);
    this.name = 'GithubDataConflictError';
    this.code = 'GITHUB_DATA_CONFLICT';
    if (status !== undefined) this.status = status;
    if (endpoint !== undefined) this.endpoint = endpoint;
  }
}

class GithubRequestError extends Error {
  constructor(method, endpoint, response) {
    super(`${method} ${endpoint} failed: ${response.status} ${response.statusText}`);
    this.name = 'GithubRequestError';
    this.status = response.status;
    this.endpoint = endpoint;
  }
}

function encodePath(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': API_VERSION,
  };
}

function validateFiles(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new TypeError('Files must be a non-empty object');
  }
  const entries = Object.entries(files);
  if (!entries.length) throw new TypeError('Files must be a non-empty object');

  for (const [path, content] of entries) {
    const segments = path.split('/');
    const unsafePath = !path
      || path.startsWith('/')
      || path.includes('\\')
      || segments.some((segment) => !segment || segment === '.' || segment === '..');
    if (unsafePath) throw new TypeError(`Unsafe repository path: ${path}`);
    if (content !== null && typeof content !== 'string') {
      throw new TypeError(`File content must be a string or null: ${path}`);
    }
  }

  return entries;
}

export function createGithubGitDataWriter({ config, fetchImpl = globalThis.fetch }) {
  const owner = String(config?.owner || '');
  const repo = String(config?.repo || '');
  const branch = String(config?.branch || 'main');
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  return {
    async writeFiles({ token, files, message, expectedHeadSha }) {
      const fileEntries = validateFiles(files);
      const headers = githubHeaders(token);
      const request = async (path, method = 'GET', body) => {
        const options = { method, headers };
        if (body !== undefined) options.body = JSON.stringify(body);
        const response = await fetchImpl(`${apiBase}${path}`, options);
        if (!response.ok) throw new GithubRequestError(method, path, response);
        return response.json();
      };

      const refPath = `/git/ref/heads/${encodePath(branch)}`;
      const ref = await request(refPath);
      const previousHeadSha = ref.object.sha;
      if (expectedHeadSha !== undefined && expectedHeadSha !== previousHeadSha) {
        throw new GithubDataConflictError('GitHub branch HEAD changed before the write started');
      }

      const currentCommit = await request(`/git/commits/${encodeURIComponent(previousHeadSha)}`);
      const tree = [];
      for (const [path, content] of fileEntries) {
        if (content === null) {
          tree.push({ path, mode: '100644', type: 'blob', sha: null });
          continue;
        }
        const blob = await request('/git/blobs', 'POST', { content, encoding: 'utf-8' });
        tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
      }

      const newTree = await request('/git/trees', 'POST', {
        base_tree: currentCommit.tree.sha,
        tree,
      });
      const commit = await request('/git/commits', 'POST', {
        message,
        tree: newTree.sha,
        parents: [previousHeadSha],
      });
      const updateRefPath = `/git/refs/heads/${encodePath(branch)}`;
      try {
        await request(updateRefPath, 'PATCH', { sha: commit.sha, force: false });
      } catch (error) {
        if (error.status === 409 || error.status === 422) {
          throw new GithubDataConflictError(
            'GitHub branch HEAD changed before the commit could be published',
            { status: error.status, endpoint: updateRefPath },
          );
        }
        throw error;
      }

      return { previousHeadSha, commitSha: commit.sha };
    },
  };
}
