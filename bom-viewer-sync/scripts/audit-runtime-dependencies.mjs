import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const expectedDependencies = [
  {
    packageId: '@google/model-viewer',
    version: '4.3.1',
    license: 'Apache-2.0',
    source: 'https://registry.npmjs.org/@google/model-viewer/-/model-viewer-4.3.1.tgz',
    delivery: 'npm-lock',
    packageSpecifier: '4.3.1',
    lockResolved: 'https://registry.npmjs.org/@google/model-viewer/-/model-viewer-4.3.1.tgz',
    integrity: 'sha512-GP+inXhAtY31E8rILVmByA6z8CZZjdlNajddppyI1/j1eIaSQiZcMRaUqTFe7+jv4mzRzwKIOiKBud0apiv+WQ==',
    sha256: '33bb64ac99b83e40dfbfc39f896ecbdc301264fad198a91f37e1847c7ec6c644',
  },
  {
    packageId: 'xlsx',
    version: '0.20.3',
    license: 'Apache-2.0',
    source: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
    delivery: 'vendored-tarball',
    packageSpecifier: 'file:vendor/runtime/xlsx-0.20.3.tgz',
    lockResolved: 'file:vendor/runtime/xlsx-0.20.3.tgz',
    integrity: 'sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==',
    sha256: '8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8',
    vendorPath: 'vendor/runtime/xlsx-0.20.3.tgz',
  },
];

async function readJson(filePath, description) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${description}: ${filePath}`, { cause: error });
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

async function auditInstalledPackage(rootDir, expected) {
  const packagePath = path.join(rootDir, 'node_modules', expected.packageId, 'package.json');
  let installed;
  try {
    installed = JSON.parse(await readFile(packagePath, 'utf8'));
  } catch (error) {
    throw new Error(`Missing installed runtime package ${expected.packageId}; run npm ci`, {
      cause: error,
    });
  }
  assertEqual(installed.name, expected.packageId, `Installed package ID mismatch for ${expected.packageId}`);
  assertEqual(installed.version, expected.version, `Installed version mismatch for ${expected.packageId}`);
  assertEqual(installed.license, expected.license, `Installed license mismatch for ${expected.packageId}`);
  for (const hook of ['preinstall', 'install', 'postinstall']) {
    if (installed.scripts?.[hook]) {
      throw new Error(`Runtime package ${expected.packageId} must not define an ${hook} hook`);
    }
  }
}

export async function auditRuntimeDependencies(rootDir = path.resolve(import.meta.dirname, '..')) {
  const [packageJson, lock, manifest] = await Promise.all([
    readJson(path.join(rootDir, 'package.json'), 'package.json'),
    readJson(path.join(rootDir, 'package-lock.json'), 'package-lock.json'),
    readJson(path.join(rootDir, 'vendor', 'runtime', 'manifest.json'), 'runtime dependency manifest'),
  ]);

  assertEqual(manifest.schemaVersion, 1, 'Runtime dependency manifest schema mismatch');
  assertEqual(manifest.dependencies?.length, expectedDependencies.length, 'Runtime dependency manifest entry count mismatch');
  assertEqual(lock.lockfileVersion, 3, 'package-lock.json version mismatch');

  for (const expected of expectedDependencies) {
    const recorded = manifest.dependencies.find((entry) => entry.packageId === expected.packageId);
    if (!recorded) throw new Error(`Runtime dependency manifest is missing ${expected.packageId}`);
    for (const [field, value] of Object.entries(expected)) {
      assertEqual(recorded[field], value, `Manifest mismatch for ${expected.packageId} ${field}`);
    }

    assertEqual(
      packageJson.dependencies?.[expected.packageId],
      expected.packageSpecifier,
      `${expected.packageId} must be pinned to ${expected.version} in package.json`,
    );
    assertEqual(
      lock.packages?.['']?.dependencies?.[expected.packageId],
      expected.packageSpecifier,
      `Root lock entry mismatch for ${expected.packageId}`,
    );

    const locked = lock.packages?.[`node_modules/${expected.packageId}`];
    if (!locked) throw new Error(`package-lock.json is missing runtime package ${expected.packageId}`);
    assertEqual(locked.version, expected.version, `Lock/manifest mismatch for ${expected.packageId} version`);
    assertEqual(locked.resolved, expected.lockResolved, `Lock/manifest mismatch for ${expected.packageId} resolved source`);
    assertEqual(locked.integrity, expected.integrity, `Lock/manifest mismatch for ${expected.packageId} integrity`);
    assertEqual(locked.license, expected.license, `Lock/manifest mismatch for ${expected.packageId} license`);
    await auditInstalledPackage(rootDir, expected);

    if (expected.vendorPath) {
      const bytes = await readFile(path.join(rootDir, ...expected.vendorPath.split('/')));
      const actualHash = createHash('sha256').update(bytes).digest('hex');
      assertEqual(actualHash, expected.sha256, `SHA-256 mismatch for ${expected.vendorPath}`);
    }
  }

  return {
    dependencies: expectedDependencies.map(({ packageId, version }) => `${packageId}@${version}`),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await auditRuntimeDependencies();
    process.stdout.write(`Runtime dependency audit passed: ${result.dependencies.join(', ')}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
