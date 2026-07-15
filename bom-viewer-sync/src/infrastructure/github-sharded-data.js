import { parseLogicalShardFiles, buildLogicalShardFiles, toRepositoryShardFiles } from '../domain/sharded-files.js';
import { normalizePayload, decodeBase64Utf8 } from './github-data.js';

export function createGithubShardedDataAdapter({ config, fetchImpl = globalThis.fetch, writerFactory, now = Date.now }) {
  const owner = String(config?.owner || '');
  const repo = String(config?.repo || '');
  const branch = String(config?.branch || 'main');
  const pathValue = String(config?.path || 'data.js');

  const basePath = pathValue.includes('/') ? pathValue.substring(0, pathValue.lastIndexOf('/')) : '';
  const shardRoot = basePath ? `${basePath}/data` : 'data';

  if (!owner || !repo || !branch) throw new Error('Invalid config');
  
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  function sanitizeError(error, token) {
    if (!token || typeof token !== 'string') return error;
    const redact = (str) => typeof str === 'string' ? str.replaceAll(token, '***') : str;
    
    const newError = new Error(redact(error.message || ''));
    newError.name = error.name;
    if (error.status !== undefined) newError.status = error.status;
    if (error.code !== undefined) newError.code = error.code;
    if (error.stack) newError.stack = redact(error.stack);
    
    // Do not attach the original cause to avoid leaking token in nested structures
    return newError;
  }

  async function githubJson(url, options, token) {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options?.headers,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let response;
    try {
      response = await fetchImpl(url, { ...options, headers });
    } catch (err) {
      throw err;
    }

    let json;
    try {
      json = await response.json();
    } catch {
      throw new Error(`Malformed JSON response from ${url}`);
    }

    if (!response.ok) {
      const error = new Error(json.message || 'GitHub API error');
      error.status = response.status;
      throw error;
    }
    return json;
  }

  return {
    async loadPublic() {
      try {
        const cacheBust = now();
        const commitData = await githubJson(`${apiBase}/commits/${encodeURIComponent(branch)}`, { cache: 'no-store' });
        const commitSha = commitData.sha;
        if (!/^[0-9a-f]{40}$/i.test(commitSha)) throw new Error('Invalid commit SHA resolved');

        const fetchRaw = async (logicalPath) => {
          const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${commitSha}/${shardRoot}/${logicalPath}?t=${cacheBust}`;
          const response = await fetchImpl(url, { cache: 'no-store' });
          if (!response.ok) {
            const error = new Error(`Failed to load ${logicalPath}`);
            error.status = response.status;
            throw error;
          }
          return response.text();
        };

        const manifestContent = await fetchRaw('manifest.json');
        const materialsContent = await fetchRaw('materials.json');
        
        let manifest;
        try {
          manifest = JSON.parse(manifestContent);
        } catch {
          throw new Error('Malformed manifest JSON');
        }

        const files = new Map();
        files.set('manifest.json', manifestContent);
        files.set('materials.json', materialsContent);

        if (!manifest || !Array.isArray(manifest.products)) throw new Error('Invalid manifest structure');

        await Promise.all(manifest.products.map(async (id) => {
          const content = await fetchRaw(`products/${id}.json`);
          files.set(`products/${id}.json`, content);
        }));

        const payload = await parseLogicalShardFiles(files);
        return normalizePayload(payload);
      } catch (err) {
        throw err; // Public load does not have token to sanitize
      }
    },

    async loadForWrite(token) {
      try {
        const refData = await githubJson(`${apiBase}/git/ref/heads/${encodeURIComponent(branch)}`, { cache: 'no-store' }, token);
        if (!refData || refData.ref !== `refs/heads/${branch}` || !refData.object?.sha) {
          throw new Error('Invalid ref response');
        }
        const commitSha = refData.object.sha;

        const commitData = await githubJson(`${apiBase}/git/commits/${commitSha}`, { cache: 'no-store' }, token);
        if (!commitData || commitData.sha !== commitSha || !commitData.tree?.sha) {
          throw new Error('Invalid commit response');
        }
        const treeSha = commitData.tree.sha;

        const treeData = await githubJson(`${apiBase}/git/trees/${treeSha}?recursive=1`, { cache: 'no-store' }, token);
        if (treeData.truncated === true) throw new Error('Tree is truncated');
        if (!Array.isArray(treeData.tree)) throw new Error('Invalid tree format');

        const prefix = `${shardRoot}/`;
        const files = new Map();

        await Promise.all(treeData.tree.map(async (entry) => {
          if (entry.path.startsWith(prefix) && entry.type === 'blob') {
            const logicalPath = entry.path.slice(prefix.length);
            const blobData = await githubJson(`${apiBase}/git/blobs/${entry.sha}`, { cache: 'no-store' }, token);
            if (!blobData || blobData.sha !== entry.sha || blobData.encoding !== 'base64') {
               throw new Error('Invalid blob response or SHA mismatch');
            }
            const content = decodeBase64Utf8(blobData.content);
            files.set(logicalPath, content);
          }
        }));

        const payload = await parseLogicalShardFiles(files);
        return { expectedHeadSha: commitSha, payload: normalizePayload(payload) };
      } catch (err) {
        throw sanitizeError(err, token);
      }
    },

    async write({ token, expectedHeadSha, payload, message }) {
      try {
        const logicalFiles = buildLogicalShardFiles(payload);
        const repoFiles = toRepositoryShardFiles(logicalFiles, shardRoot);
        
        if (!writerFactory) throw new Error('writerFactory is required for write');

        const writer = writerFactory({
          config: { owner, repo, branch, shardRoot },
          fetchImpl
        });

        const result = await writer.writeFiles({
          token,
          files: repoFiles,
          message: message || 'chore: update sharded BOM data',
          expectedHeadSha
        });

        return { previousHeadSha: expectedHeadSha, commitSha: result.commitSha };
      } catch (err) {
        throw sanitizeError(err, token);
      }
    }
  };
}
