import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assertCutoverShardCount, parseLogicalShardFiles } from '../src/domain/sharded-files.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
async function readCanonicalPayload() {
  const files = new Map();
  for (const relativePath of ['manifest.json', 'materials.json']) {
    files.set(relativePath, readFileSync(path.join(repoRoot, 'data', relativePath), 'utf8'));
  }
  for (const entry of readdirSync(path.join(repoRoot, 'data', 'products'), { withFileTypes: true })) {
    assert.equal(entry.isFile(), true, `Product shard must be a file: ${entry.name}`);
    assert.match(entry.name, /^[A-Za-z0-9_-]+\.json$/, `Unexpected product shard: ${entry.name}`);
    files.set(`products/${entry.name}`, readFileSync(path.join(repoRoot, 'data', 'products', entry.name), 'utf8'));
  }
  assertCutoverShardCount(files);
  return parseLogicalShardFiles(files);
}

test('audit:data defaults to the canonical local shard set', async () => {
  const payload = await readCanonicalPayload();
  const output = execFileSync(process.execPath, ['scripts/audit-data.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.match(output, new RegExp(`Materials: ${Object.keys(payload.materialDb.materials).length}`));
  assert.match(output, new RegExp(`BOM Entries: ${payload.materialDb.bomEntries.length}`));
  assert.match(output, new RegExp(`Products: ${Object.keys(payload.bom).length}`));
  assert.match(output, new RegExp(`Notifications: ${payload.notifications.length}`));
});

test('general check audits shards without requiring rollback equality', () => {
  const checkScript = readFileSync(path.join(repoRoot, 'scripts', 'check-all.mjs'), 'utf8');
  assert.doesNotMatch(checkScript, /materialize-shards\.mjs', '--verify/);
  assert.doesNotMatch(checkScript, /verify-rollback\.mjs/);
});

test('quality workflow is pinned, least-privilege, and executes the repository gate', () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const workflow = readFileSync(path.join(repoRoot, '..', '.github', 'workflows', 'quality.yml'), 'utf8');

  assert.equal(packageJson.scripts['audit:rollback'], 'node scripts/audit-data.mjs --data data.js');
  assert.match(workflow, /^on:\s*[\s\S]*pull_request:/m);
  assert.match(workflow, /push:\s*[\s\S]*branches:\s*\n\s*- main/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /timeout-minutes:\s*15/);
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /cache-dependency-path:\s*bom-viewer-sync\/package-lock\.json/);
  assert.match(workflow, /working-directory:\s*bom-viewer-sync/);
  assert.match(workflow, /actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\s+# v4\.2\.2/);
  assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020\s+# v4\.4\.0/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm audit --audit-level=high/);
});
