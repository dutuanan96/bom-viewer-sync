import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditRuntimeDependencies } from '../scripts/audit-runtime-dependencies.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const runtimePackages = ['@google/model-viewer', 'xlsx'];

async function copyFile(root, relativePath) {
  const destination = path.join(root, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(repoRoot, relativePath), destination);
}

async function createFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-dependency-audit-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await Promise.all([
    copyFile(root, 'package.json'),
    copyFile(root, 'package-lock.json'),
    copyFile(root, path.join('vendor', 'runtime', 'manifest.json')),
    copyFile(root, path.join('vendor', 'runtime', 'xlsx-0.20.3.tgz')),
    ...runtimePackages.map((name) => copyFile(root, path.join('node_modules', name, 'package.json'))),
  ]);
  return root;
}

async function mutateJson(filePath, mutate) {
  const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
  mutate(value);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('runtime dependency audit accepts exact inputs and fails closed on tampering', async (t) => {
  const validRoot = await createFixture(t);
  const result = await auditRuntimeDependencies(validRoot);
  assert.deepEqual(result.dependencies, ['@google/model-viewer@4.3.1', 'xlsx@0.20.3']);

  const tarballRoot = await createFixture(t);
  await fs.appendFile(path.join(tarballRoot, 'vendor', 'runtime', 'xlsx-0.20.3.tgz'), 'tampered');
  await assert.rejects(auditRuntimeDependencies(tarballRoot), /SHA-256 mismatch.*xlsx-0\.20\.3\.tgz/i);

  const versionRoot = await createFixture(t);
  await mutateJson(path.join(versionRoot, 'package.json'), (packageJson) => {
    packageJson.dependencies['@google/model-viewer'] = '4.3.2';
  });
  await assert.rejects(auditRuntimeDependencies(versionRoot), /@google\/model-viewer.*4\.3\.1/i);

  const missingPackageRoot = await createFixture(t);
  await fs.rm(path.join(missingPackageRoot, 'node_modules', '@google', 'model-viewer'), {
    recursive: true,
  });
  await assert.rejects(auditRuntimeDependencies(missingPackageRoot), /missing installed runtime package.*@google\/model-viewer/i);

  const lockRoot = await createFixture(t);
  await mutateJson(path.join(lockRoot, 'package-lock.json'), (lock) => {
    lock.packages['node_modules/xlsx'].integrity = 'sha512-tampered';
  });
  await assert.rejects(auditRuntimeDependencies(lockRoot), /lock\/manifest mismatch.*xlsx.*integrity/i);

  const manifestRoot = await createFixture(t);
  await mutateJson(path.join(manifestRoot, 'vendor', 'runtime', 'manifest.json'), (manifest) => {
    manifest.dependencies[1].sha256 = '0'.repeat(64);
  });
  await assert.rejects(auditRuntimeDependencies(manifestRoot), /manifest mismatch.*xlsx.*sha256/i);
});
