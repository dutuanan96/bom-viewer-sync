export const STAGING_PROJECT = Object.freeze({
  owner: 'dutuanan96',
  repo: 'bom-viewer-sync',
  sourceBranch: 'main',
  dataJsPath: 'bom-viewer-sync/data.js',
  shardRoot: 'bom-viewer-sync/data',
  stagingBranchPattern: /^codex\/phase-b4-shards-\d{8}T\d{6}Z-[0-9a-f]{7}$/,
  expectedShardCount: 24,
});

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
import { parseDataJsPayload, normalizePayload } from '../../src/infrastructure/github-data.js';
import { buildLogicalShardFiles, computeShardAggregateHash, toRepositoryShardFiles, verifyLogicalShardRoundTrip } from './sharded-files.mjs';
import assert from 'node:assert/strict';

const CONFIRMATION = 'STAGE_24_SHARDS';

function migrationError(code, message, metadata = {}) {
  const error = new Error(message);
  error.name = 'GithubShardedStagingError';
  error.code = code;
  Object.assign(error, metadata);
  return error;
}

export function sanitizeMigrationError(error, tokenToRedact = '') {
  const redactText = (value, fallback) => {
    if (value === undefined || value === null) return fallback;
    let text;
    try {
      text = String(value);
    } catch {
      return fallback;
    }
    if (!tokenToRedact || tokenToRedact.trim() === '') return text;
    return text.replaceAll(tokenToRedact, '***');
  };
  return Object.fromEntries(Object.entries({
    name: redactText(error?.name, 'Error'),
    code: redactText(error?.code, 'STAGING_MIGRATION_FAILED'),
    message: redactText(error?.message, 'Staging migration failed'),
    status: Number.isFinite(error?.status) ? error.status : undefined,
    endpoint: typeof error?.endpoint === 'string' ? redactText(error.endpoint) : undefined,
    mutationStage: typeof error?.mutationStage === 'string' ? redactText(error.mutationStage) : undefined,
    branchCreated: typeof error?.branchCreated === 'boolean' ? error.branchCreated : undefined,
    stagingBranch: typeof error?.stagingBranch === 'string' ? redactText(error.stagingBranch) : undefined,
    mainUnchanged: typeof error?.mainUnchanged === 'boolean' ? error.mainUnchanged : undefined,
  })
    .filter(([, value]) => value !== undefined));
}

export function parseStagingArgs(argv, env) {
  const flags = new Map();
  const allowedFlags = new Set([
    '--execute',
    '--confirm',
    '--expected-source-sha',
    '--expected-aggregate-sha256',
    '--staging-branch'
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      if (!allowedFlags.has(arg)) throw migrationError('UNKNOWN_FLAG', `Unknown flag: ${arg}`);
      if (flags.has(arg)) throw migrationError('DUPLICATE_FLAG', `Duplicate flag: ${arg}`);

      if (arg === '--execute') {
        flags.set(arg, true);
      } else {
        if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
          throw migrationError('MISSING_VALUE', `Missing value for flag: ${arg}`);
        }
        flags.set(arg, argv[i + 1]);
        i++;
      }
    } else {
      throw migrationError('UNKNOWN_ARGUMENT', 'Unknown positional argument');
    }
  }

  for (const flag of allowedFlags) {
    if (!flags.has(flag)) throw migrationError('MISSING_FLAG', `Missing required flag: ${flag}`);
  }

  if (flags.get('--confirm') !== CONFIRMATION) {
    throw migrationError('INVALID_CONFIRMATION', 'Invalid confirmation text');
  }

  const token = env.GH_TOKEN;
  if (!token || typeof token !== 'string' || token.trim() === '') {
    throw migrationError('MISSING_TOKEN', 'Missing GH_TOKEN environment variable');
  }

  const expectedSourceSha = flags.get('--expected-source-sha');
  if (!SHA_PATTERN.test(expectedSourceSha)) {
    throw migrationError('INVALID_SHA', 'Invalid --expected-source-sha format');
  }

  const expectedAggregateSha256 = flags.get('--expected-aggregate-sha256');
  if (!HASH_PATTERN.test(expectedAggregateSha256)) {
    throw migrationError('INVALID_HASH', 'Invalid --expected-aggregate-sha256 format');
  }

  const stagingBranch = flags.get('--staging-branch');
  if (!STAGING_PROJECT.stagingBranchPattern.test(stagingBranch)) {
    throw migrationError('INVALID_BRANCH', 'Invalid --staging-branch pattern');
  }

  if (!stagingBranch.endsWith(expectedSourceSha.slice(0, 7))) {
    throw migrationError('BRANCH_SHA_MISMATCH', 'Staging branch suffix does not match short source SHA');
  }

  return {
    token,
    expectedSourceSha,
    expectedAggregateSha256,
    stagingBranch,
  };
}

export function createGithubShardedStagingMigration({ fetchImpl, writerFactory } = {}) {
  const apiBase = `https://api.github.com/repos/${STAGING_PROJECT.owner}/${STAGING_PROJECT.repo}`;

  async function githubJson(url, options, token) {
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...options?.headers,
      }
    });
    let json;
    try {
      json = await response.json();
    } catch {
      throw migrationError('MALFORMED_JSON', 'Malformed JSON response', { status: response.status, endpoint: url });
    }
    if (!response.ok) {
      if (response.status === 404 && options?.method === 'GET' && url.includes('/git/ref/')) {
        return null; // For branch existence check
      }
      throw migrationError('GITHUB_API_ERROR', json.message || 'GitHub API error', {
        status: response.status,
        endpoint: url,
      });
    }
    return json;
  }

  async function readRef(branch, token) {
    const json = await githubJson(`${apiBase}/git/ref/heads/${branch}`, {}, token);
    if (!json || json.ref !== `refs/heads/${branch}` || json.object?.type !== 'commit' || !SHA_PATTERN.test(json.object.sha)) {
      throw migrationError('INVALID_REF', 'Invalid ref response');
    }
    return json.object;
  }

  async function readSnapshot(commitSha, token) {
    const commit = await githubJson(`${apiBase}/git/commits/${commitSha}`, {}, token);
    if (!commit || commit.sha !== commitSha || !commit.tree?.sha || !SHA_PATTERN.test(commit.tree.sha)) throw migrationError('INVALID_COMMIT', 'Invalid commit response');
    const treeSha = commit.tree.sha;

    const treeData = await githubJson(`${apiBase}/git/trees/${treeSha}?recursive=1`, {}, token);
    if (!treeData || treeData.sha !== treeSha) throw migrationError('INVALID_TREE', 'Invalid tree response SHA');
    if (treeData.truncated === true) throw migrationError('TREE_TRUNCATED', 'Recursive tree is truncated');
    if (!Array.isArray(treeData.tree)) throw migrationError('INVALID_TREE', 'Invalid tree format');

    const entriesByPath = new Map();
    let dataJsBlobSha = null;
    for (const entry of treeData.tree) {
      if (!SHA_PATTERN.test(entry.sha)) throw migrationError('INVALID_TREE_ENTRY', 'Invalid tree entry SHA');
      if (entriesByPath.has(entry.path)) throw migrationError('DUPLICATE_TREE_PATH', `Duplicate tree path: ${entry.path}`);
      if (entry.type !== 'blob' && entry.type !== 'tree') throw migrationError('INVALID_TREE_ENTRY', 'Invalid tree entry type');

      entriesByPath.set(entry.path, entry);
      if (entry.path === STAGING_PROJECT.dataJsPath && entry.type === 'blob') {
        if (dataJsBlobSha) throw migrationError('DUPLICATE_DATA_JS', 'Multiple data.js found');
        dataJsBlobSha = entry.sha;
      }
    }

    if (!dataJsBlobSha) throw migrationError('MISSING_DATA_JS', 'data.js not found in tree');

    const blobData = await githubJson(`${apiBase}/git/blobs/${dataJsBlobSha}`, {}, token);
    if (!blobData || blobData.sha !== dataJsBlobSha || blobData.encoding !== 'base64' || typeof blobData.content !== 'string') {
      throw migrationError('INVALID_BLOB', 'Invalid blob response');
    }
    const dataJsSource = Buffer.from(blobData.content, 'base64').toString('utf8');

    return {
      commitSha,
      treeSha,
      dataJsBlobSha,
      dataJsSource,
      entriesByPath,
    };
  }

  async function assertBranchMissing(branch, token) {
    const existing = await githubJson(`${apiBase}/git/ref/heads/${branch}`, { method: 'GET' }, token);
    if (existing) {
      throw migrationError('BRANCH_EXISTS', 'Staging branch already exists');
    }
  }

  async function createBranch(branch, sourceSha, token) {
    const response = await githubJson(`${apiBase}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: sourceSha,
      })
    }, token);
    if (!response || response.ref !== `refs/heads/${branch}` || response.object?.type !== 'commit' || response.object?.sha !== sourceSha) {
      throw migrationError('BRANCH_CREATE_FAILED', 'Malformed branch creation response');
    }
  }

  async function readLogicalShardFiles(snapshot, token) {
    const files = new Map();
    const prefix = `${STAGING_PROJECT.shardRoot}/`;

    for (const [path, entry] of snapshot.entriesByPath.entries()) {
      if (path.startsWith(prefix)) {
        if (entry.type !== 'blob') throw migrationError('INVALID_REMOTE_SHARD', `Expected blob at ${path}`);

        const blobData = await githubJson(`${apiBase}/git/blobs/${entry.sha}`, {}, token);
        if (!blobData || blobData.sha !== entry.sha || !SHA_PATTERN.test(blobData.sha) || blobData.encoding !== 'base64' || typeof blobData.content !== 'string') {
          throw migrationError('INVALID_BLOB', 'Invalid blob response or SHA mismatch');
        }

        const logicalPath = path.slice(prefix.length);
        files.set(logicalPath, Buffer.from(blobData.content, 'base64').toString('utf8'));
      }
    }

    return files;
  }

  return {
    async run(input) {
      let branchCreated = false;
      let mutationStage = 'pre-mutation';
      let stagingBranch = input?.stagingBranch;

      try {
        if (!input || typeof input !== 'object') throw migrationError('INVALID_INPUT', 'Input must be an object');

        const { token, expectedSourceSha, expectedAggregateSha256 } = input;
        stagingBranch = input.stagingBranch;

        if (!token || typeof token !== 'string' || token.trim() === '') throw migrationError('MISSING_TOKEN', 'Missing GH_TOKEN');
        if (!expectedSourceSha || !SHA_PATTERN.test(expectedSourceSha)) throw migrationError('INVALID_SHA', 'Invalid expected source SHA');
        if (!expectedAggregateSha256 || !HASH_PATTERN.test(expectedAggregateSha256)) throw migrationError('INVALID_HASH', 'Invalid expected aggregate hash');
        if (!stagingBranch || !STAGING_PROJECT.stagingBranchPattern.test(stagingBranch)) throw migrationError('INVALID_BRANCH', 'Invalid staging branch pattern');
        if (!stagingBranch.endsWith(expectedSourceSha.slice(0, 7))) throw migrationError('BRANCH_SHA_MISMATCH', 'Staging branch suffix does not match short source SHA');

        mutationStage = 'read-source';

        const sourceRef = await readRef(STAGING_PROJECT.sourceBranch, token);
        if (sourceRef.sha !== expectedSourceSha) throw migrationError('SOURCE_HEAD_MISMATCH', 'Source HEAD changed');

        const sourceSnapshot = await readSnapshot(expectedSourceSha, token);
        const sourcePayload = parseDataJsPayload(sourceSnapshot.dataJsSource);
        const logicalFiles = buildLogicalShardFiles(sourcePayload);
        await verifyLogicalShardRoundTrip(sourcePayload, logicalFiles);

        if (logicalFiles.size !== STAGING_PROJECT.expectedShardCount) {
          throw migrationError('SHARD_COUNT_MISMATCH', `Expected 24 shards but found ${logicalFiles.size}`);
        }
        const aggregateSha256 = computeShardAggregateHash(logicalFiles);
        if (aggregateSha256 !== expectedAggregateSha256) {
          throw migrationError('AGGREGATE_HASH_MISMATCH', 'Logical shard aggregate hash changed');
        }

        mutationStage = 'branch-check';
        await assertBranchMissing(stagingBranch, token);

        mutationStage = 'branch-create-uncertain';
        try {
          await createBranch(stagingBranch, expectedSourceSha, token);
        } catch (err) {
          // If branch creation fails for any reason (timeout, 5xx, 403, malformed JSON),
          // we do not set branchCreated = true. It remains uncertain.
          throw err;
        }

        branchCreated = true;
        mutationStage = 'writer';

        const writer = writerFactory({
          config: {
            owner: STAGING_PROJECT.owner,
            repo: STAGING_PROJECT.repo,
            branch: stagingBranch,
            shardRoot: STAGING_PROJECT.shardRoot,
          },
          fetchImpl,
        });

        const writeResult = await writer.writeFiles({
          token,
          files: toRepositoryShardFiles(logicalFiles, STAGING_PROJECT.shardRoot),
          message: 'chore: stage 24 sharded BOM files',
          expectedHeadSha: expectedSourceSha,
        });

        mutationStage = 'readback';

        const stagingRef = await readRef(stagingBranch, token);
        if (stagingRef.sha !== writeResult.commitSha) {
          throw migrationError('STAGING_REF_MISMATCH', 'Staging ref SHA does not match writer commit SHA');
        }

        const remoteSnapshot = await readSnapshot(writeResult.commitSha, token);
        if (remoteSnapshot.dataJsBlobSha !== sourceSnapshot.dataJsBlobSha) {
          throw migrationError('DATA_JS_CHANGED', 'data.js changed on the staging branch');
        }
        const remoteLogicalFiles = await readLogicalShardFiles(remoteSnapshot, token);
        if (computeShardAggregateHash(remoteLogicalFiles) !== aggregateSha256) {
          throw migrationError('REMOTE_HASH_MISMATCH', 'Remote shard aggregate hash differs');
        }
        await verifyLogicalShardRoundTrip(sourcePayload, remoteLogicalFiles);
        assert.deepEqual(remoteLogicalFiles, logicalFiles);

        const finalMainRef = await readRef(STAGING_PROJECT.sourceBranch, token);
        if (finalMainRef.sha !== expectedSourceSha) {
          throw migrationError('MAIN_MOVED_DURING_RUN', 'main changed during staging verification', { mainUnchanged: false });
        }

        return {
          status: 'verified',
          repository: `${STAGING_PROJECT.owner}/${STAGING_PROJECT.repo}`,
          sourceBranch: STAGING_PROJECT.sourceBranch,
          sourceCommitSha: expectedSourceSha,
          sourceDataBlobSha: sourceSnapshot.dataJsBlobSha,
          stagingBranch,
          stagingCommitSha: writeResult.commitSha,
          shardRoot: STAGING_PROJECT.shardRoot,
          shardCount: logicalFiles.size,
          aggregateSha256,
          dataJsUnchanged: true,
          roundTripEqual: true,
          mainUnchanged: true,
          compareUrl: `https://github.com/${STAGING_PROJECT.owner}/${STAGING_PROJECT.repo}/compare/${expectedSourceSha}...${stagingBranch}`
        };
      } catch (error) {
        error.branchCreated = branchCreated;
        error.mutationStage = mutationStage;
        error.stagingBranch = stagingBranch;

        const tokenStr = input?.token && typeof input.token === 'string' ? input.token : '';
        const sanitized = sanitizeMigrationError(error, tokenStr);
        throw migrationError(sanitized.code, sanitized.message, sanitized);
      }
    }
  };
}
