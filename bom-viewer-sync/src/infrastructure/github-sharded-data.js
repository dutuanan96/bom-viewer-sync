import {
  assertLogicalShardCount,
  buildLogicalShardFiles,
  parseLogicalShardFiles,
  toRepositoryShardFiles,
  validateLogicalShardPath,
  validateRepositoryShardRoot,
} from '../domain/sharded-files.js';
import { validateProductId } from '../domain/sharded-data.js';
import { normalizePayload, decodeBase64Utf8 } from './github-data.js';

const PUBLIC_COMMIT_REFRESH_MS = 5 * 60 * 1000;

async function contentSnapshotSha(files) {
  const framed = [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, content]) => `${path.length}:${path}${content.length}:${content}`)
    .join('');
  const bytes = new TextEncoder().encode(framed);
  const digest = await globalThis.crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createGithubShardedDataAdapter({ config, fetchImpl = globalThis.fetch, writerFactory, now = Date.now }) {
  const owner = String(config?.owner || '');
  const repo = String(config?.repo || '');
  const branch = String(config?.branch || 'main');
  const shardRoot = String(config?.shardRoot || 'data');

  if (!owner || !repo || !branch) throw new Error('Invalid config');
  validateRepositoryShardRoot(shardRoot);

  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  function sanitizeError(error, token) {
    if (!token || typeof token !== 'string') return error;
    const redactText = (value, fallback = '') => {
      if (value === undefined || value === null) return fallback;
      try {
        return String(value).replaceAll(token, '***');
      } catch {
        return fallback;
      }
    };
    const safeMetadata = (value) => {
      if (typeof value === 'string') return redactText(value);
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'boolean') return value;
      return undefined;
    };

    const newError = new Error(redactText(error?.message));
    newError.name = safeMetadata(error?.name) || 'Error';
    const status = safeMetadata(error?.status);
    const code = safeMetadata(error?.code);
    if (status !== undefined) newError.status = status;
    if (code !== undefined) newError.code = code;
    if (error?.stack !== undefined) newError.stack = redactText(error.stack, newError.stack);

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

  let lastSourceMetadata = null;
  let publicCommit = null;

  return {
    getSourceMetadata() {
      if (!lastSourceMetadata) return null;
      // Return a shallow copy — caller must not mutate internal state
      return { ...lastSourceMetadata };
    },

    async loadPublic(options = {}) {
      try {
        const cacheBust = now();
        const forceRefresh = options?.forceRefresh === true;
        if (forceRefresh || !publicCommit || cacheBust - publicCommit.checkedAt >= PUBLIC_COMMIT_REFRESH_MS) {
          const commitData = await githubJson(
            `${apiBase}/commits/${encodeURIComponent(branch)}`,
            { cache: 'no-store' },
          );
          publicCommit = { data: commitData, checkedAt: cacheBust };
        }
        const commitData = publicCommit.data;
        const fetchRef = String(commitData?.sha || '');
        if (!/^[0-9a-f]{40}$/i.test(fetchRef)) {
          throw new Error('Invalid commit SHA format from public branch lookup');
        }
        const rawBase = 'https://raw.githubusercontent.com';

        const fetchRaw = async (logicalPath) => {
          const repositoryPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${fetchRef}`;
          const url = `${rawBase}/${repositoryPath}/${shardRoot}/${logicalPath}?t=${cacheBust}`;
          const response = await fetchImpl(url, { cache: 'no-store' });
          if (!response.ok) {
            const error = new Error(`Failed to load ${logicalPath}`);
            error.status = response.status;
            throw error;
          }
          return response.text();
        };

        const manifestContent = await fetchRaw('manifest.json');

        let manifest;
        try {
          manifest = JSON.parse(manifestContent);
        } catch {
          throw new Error('Malformed manifest JSON');
        }

        if (!manifest || !Array.isArray(manifest.products)) throw new Error('Invalid manifest structure');

        const seenProductIds = new Set();
        for (const id of manifest.products) {
          validateProductId(id);
          if (seenProductIds.has(id)) throw new Error(`Duplicate product ID in manifest: ${id}`);
          seenProductIds.add(id);
        }
        assertLogicalShardCount(manifest.products.length + 2);

        const materialsContent = await fetchRaw('materials.json');
        const files = new Map([
          ['manifest.json', manifestContent],
          ['materials.json', materialsContent],
        ]);

        await Promise.all(manifest.products.map(async (id) => {
          const content = await fetchRaw(`products/${id}.json`);
          files.set(`products/${id}.json`, content);
        }));

        assertLogicalShardCount(files);
        const payload = await parseLogicalShardFiles(files);
        const snapshotSha = await contentSnapshotSha(files);

        // Do NOT fall back to new Date() — an absent date must be represented as null.
        const updatedAt = manifest.updatedAt ||
          commitData.commit?.committer?.date ||
          commitData.commit?.author?.date ||
          null;

        lastSourceMetadata = Object.freeze({
          commitSha: fetchRef,
          contentSnapshotSha: snapshotSha,
          provenanceKind: 'commit-pinned',
          sourceRef: branch,
          shardRoot,
          manifestVersion: manifest.schemaVersion || manifest.version || 1,
          updatedAt,
        });

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
        if (refData.object.type !== 'commit') {
          throw new Error('Ref object type must be commit');
        }
        const commitSha = refData.object.sha;
        if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
          throw new Error('Invalid commit SHA format from ref');
        }

        const commitData = await githubJson(`${apiBase}/git/commits/${commitSha}`, { cache: 'no-store' }, token);
        if (!commitData || commitData.sha !== commitSha || !commitData.tree?.sha) {
          throw new Error('Invalid commit response');
        }
        const treeSha = commitData.tree.sha;
        if (!/^[0-9a-f]{40}$/i.test(commitSha) || !/^[0-9a-f]{40}$/i.test(treeSha)) {
          throw new Error('Invalid SHA format in commit object');
        }

        const treeData = await githubJson(`${apiBase}/git/trees/${treeSha}?recursive=1`, { cache: 'no-store' }, token);
        if (!treeData || treeData.sha !== treeSha) throw new Error('Tree response SHA mismatch');
        if (treeData.truncated === true) throw new Error('Tree is truncated');
        if (!Array.isArray(treeData.tree)) throw new Error('Invalid tree format');

        const prefix = `${shardRoot}/`;
        const entriesByPath = new Map();
        for (const entry of treeData.tree) {
          if (entry.path.startsWith(prefix)) {
            if (entry.type === 'tree') continue;
            if (entry.type !== 'blob') throw new Error(`Expected blob in shard tree: ${entry.path}`);
            const logicalPath = entry.path.slice(prefix.length);
            validateLogicalShardPath(logicalPath);
            if (entriesByPath.has(logicalPath)) {
              throw new Error(`Duplicate path in tree: ${logicalPath}`);
            }
            if (!/^[0-9a-f]{40}$/i.test(entry.sha)) {
              throw new Error(`Invalid SHA format in tree entry: ${entry.sha}`);
            }
            entriesByPath.set(logicalPath, entry);
          }
        }

        const fetchBlob = async (entry) => {
          const blobData = await githubJson(`${apiBase}/git/blobs/${entry.sha}`, { cache: 'no-store' }, token);
          if (!blobData || blobData.sha !== entry.sha || blobData.encoding !== 'base64' || typeof blobData.content !== 'string') {
            throw new Error('Invalid blob response or SHA mismatch');
          }
          return decodeBase64Utf8(blobData.content);
        };

        const manifestEntry = entriesByPath.get('manifest.json');
        if (!manifestEntry) throw new Error('Missing logical shard: manifest.json');
        const manifestContent = await fetchBlob(manifestEntry);
        let manifest;
        try {
          manifest = JSON.parse(manifestContent);
        } catch {
          throw new Error('Malformed manifest JSON');
        }
        if (!manifest || !Array.isArray(manifest.products)) throw new Error('Invalid manifest structure');

        const expectedPaths = new Set(['manifest.json', 'materials.json']);
        for (const id of manifest.products) {
          validateProductId(id);
          const productPath = `products/${id}.json`;
          if (expectedPaths.has(productPath)) throw new Error(`Duplicate product ID in manifest: ${id}`);
          expectedPaths.add(productPath);
        }
        assertLogicalShardCount(expectedPaths.size);

        for (const logicalPath of entriesByPath.keys()) {
          if (!expectedPaths.has(logicalPath)) throw new Error(`Unexpected logical shard: ${logicalPath}`);
        }
        for (const logicalPath of expectedPaths) {
          if (!entriesByPath.has(logicalPath)) throw new Error(`Missing logical shard: ${logicalPath}`);
        }

        const files = new Map([['manifest.json', manifestContent]]);
        await Promise.all([...expectedPaths].filter((logicalPath) => logicalPath !== 'manifest.json').map(async (logicalPath) => {
          files.set(logicalPath, await fetchBlob(entriesByPath.get(logicalPath)));
        }));

        assertLogicalShardCount(files);
        const payload = await parseLogicalShardFiles(files);

        // Same priority as loadPublic — no new Date() fallback.
        const updatedAt = manifest.updatedAt ||
          commitData.commit?.committer?.date ||
          commitData.commit?.author?.date ||
          null;

        lastSourceMetadata = Object.freeze({
          commitSha,
          shardRoot,
          manifestVersion: manifest.schemaVersion || manifest.version || 1,
          updatedAt,
        });

        return { expectedHeadSha: commitSha, payload: normalizePayload(payload) };
      } catch (err) {
        throw sanitizeError(err, token);
      }
    },

    async write({ token, expectedHeadSha, payload, message }) {
      try {
        const logicalFiles = buildLogicalShardFiles(payload);
        assertLogicalShardCount(logicalFiles);
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
