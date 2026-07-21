import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createGithubShardedDataAdapter } from './.worktrees/antigravity-phase-b6-acceptance/bom-viewer-sync/src/infrastructure/github-sharded-data.js';
import { createGithubGitDataWriter } from './.worktrees/antigravity-phase-b6-acceptance/bom-viewer-sync/src/infrastructure/github-git-data.js';
import { computeShardAggregateHash } from './.worktrees/antigravity-phase-b6-acceptance/bom-viewer-sync/scripts/lib/sharded-files.mjs';

const EXPECTED_MAIN_SHA = 'd477f884ccc572e3559f78220d0abe9cdcb6cb42';
const EXPECTED_AGGREGATE_SHA = 'd5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e';
const OWNER = 'dutuanan96';
const REPO = 'bom-viewer-sync';

async function fetchGitHub(path, token, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `GitHub API error ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function run() {
  let token;
  try {
    token = execSync('gh auth token').toString().trim();
  } catch (e) {
    throw new Error("Could not retrieve GH_TOKEN via gh cli");
  }

  console.log("1. Verifying main SHA...");
  const mainRef = await fetchGitHub(`/git/ref/heads/main`, token);
  assert.equal(mainRef.object.sha, EXPECTED_MAIN_SHA, "main SHA mismatch");

  const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('Z', 'Z');
  const branchName = `codex/phase-b6-uat-${timestamp}-d477f88`;
  console.log(`2. Verifying branch ${branchName} does not exist...`);
  
  let exists = false;
  try {
    await fetchGitHub(`/git/ref/heads/${branchName}`, token);
    exists = true;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  assert.equal(exists, false, "Staging branch already exists!");

  console.log("3. Creating staging branch...");
  await fetchGitHub(`/git/refs`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: EXPECTED_MAIN_SHA
    })
  });

  console.log("4. Instantiating adapters...");
  const config = {
    owner: OWNER,
    repo: REPO,
    branch: branchName,
    shardRoot: 'bom-viewer-sync/data'
  };

  const adapter = createGithubShardedDataAdapter({
    config,
    fetchImpl: fetch,
    writerFactory: createGithubGitDataWriter
  });

  console.log("6. Calling loadForWrite...");
  const loaded1 = await adapter.loadForWrite(token);
  
  console.log("7. Asserting expectedHeadSha...");
  assert.equal(loaded1.expectedHeadSha, EXPECTED_MAIN_SHA);

  console.log("8. Asserting payload counts...");
  const productsCount = Object.keys(loaded1.payload.bom || {}).length;
  const materialsCount = Object.keys(loaded1.payload.materialDb?.materials || {}).length;
  assert.equal(productsCount, 22, `Expected 22 products, got ${productsCount}`);
  assert.equal(materialsCount, 646, `Expected 646 materials, got ${materialsCount}`);

  console.log("9. Calling adapter.write()...");
  const writeRes = await adapter.write({
    token,
    expectedHeadSha: loaded1.expectedHeadSha,
    payload: loaded1.payload,
    message: "test: Phase B.6 live sharded adapter UAT"
  });

  console.log("11. Asserting previousHeadSha and commitSha...");
  assert.equal(writeRes.previousHeadSha, EXPECTED_MAIN_SHA);
  assert.match(writeRes.commitSha, /^[0-9a-f]{40}$/);

  console.log("13. Calling loadForWrite() again...");
  const loaded2 = await adapter.loadForWrite(token);
  
  console.log("14. Asserting new expectedHeadSha and deep equality...");
  assert.equal(loaded2.expectedHeadSha, writeRes.commitSha);
  assert.deepEqual(loaded2.payload, loaded1.payload);

  console.log("16. Calling loadPublic()...");
  const publicPayload = await adapter.loadPublic();
  assert.deepEqual(publicPayload, loaded1.payload);

  console.log("17. Verifying 24 shard blobs...");
  const commitData = await fetchGitHub(`/git/commits/${writeRes.commitSha}`, token);
  const treeData = await fetchGitHub(`/git/trees/${commitData.tree.sha}?recursive=1`, token);
  
  const shardBlobs = treeData.tree.filter(t => t.path.startsWith('bom-viewer-sync/data/') && t.type === 'blob' && t.path !== 'bom-viewer-sync/data.js');
  assert.equal(shardBlobs.length, 24, `Expected 24 shard blobs, got ${shardBlobs.length}`);

  console.log("18. Verifying aggregate SHA-256...");
  const logicalFiles = new Map();
  for (const b of shardBlobs) {
    const blob = await fetchGitHub(`/git/blobs/${b.sha}`, token);
    const content = Buffer.from(blob.content, 'base64').toString('utf8');
    const logicalPath = b.path.replace('bom-viewer-sync/data/', '');
    logicalFiles.set(logicalPath, content);
  }
  const aggregateSha = computeShardAggregateHash(logicalFiles);
  assert.equal(aggregateSha, EXPECTED_AGGREGATE_SHA, `Aggregate SHA mismatch: ${aggregateSha}`);

  console.log("19. Verifying data.js is unchanged...");
  const mainTree = await fetchGitHub(`/git/trees/${EXPECTED_MAIN_SHA}?recursive=1`, token);
  const oldDataJs = mainTree.tree.find(t => t.path === 'bom-viewer-sync/data.js');
  const newDataJs = treeData.tree.find(t => t.path === 'bom-viewer-sync/data.js');
  assert.equal(newDataJs.sha, oldDataJs.sha, "data.js blob SHA changed!");

  console.log("21. Verifying main still equals expected SHA...");
  const mainRefAfter = await fetchGitHub(`/git/ref/heads/main`, token);
  assert.equal(mainRefAfter.object.sha, EXPECTED_MAIN_SHA, "main SHA changed!");

  console.log("22. Verifying ref update was non-force and occurred once...");
  assert.equal(commitData.parents.length, 1);
  assert.equal(commitData.parents[0].sha, EXPECTED_MAIN_SHA);

  console.log("SUCCESS!");
  console.log(`Created branch: ${branchName}`);
  console.log(`Commit SHA: ${writeRes.commitSha}`);
}

run().catch(e => {
  console.error("UAT FAILED:", e);
  process.exit(1);
});
