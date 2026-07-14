import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { serializeDataJs } from '../src/infrastructure/github-data.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const scriptPath = path.join(projectRoot, 'scripts', 'migrate-data.mjs');

function migrationPayload() {
  return {
    version: 2,
    updatedAt: '2026-07-14T00:00:00.000Z',
    bom: { LGS031: { code: 'LGS031', color_info: {} } },
    drawings: { LGS031: { M1: [{ name: 'drawing.pdf', path: 'assets/drawing.pdf' }] } },
    productRevisions: {
      LGS031: {
        currentRevision: 'V2.1',
        effectiveRevision: 'V2',
        currentRevisionInfo: { workflowState: 'draft', sourceRevision: 'V2' },
        revisions: [{
          revision: 'V2',
          workflowState: 'released',
          snapshot: {
            product: { code: 'LGS031', revision: 'V2' },
            materialDb: { version: 1, materials: {}, bomEntries: [] },
          },
        }],
      },
    },
    notifications: [{ id: 'n1', type: 'github-save', createdAt: '2026-07-14T00:00:00.000Z', changes: [] }],
    materialDb: {
      version: 1,
      materials: { m1: { id: 'm1', code: 'M1', drawings: [{ name: 'drawing.pdf', path: 'assets/drawing.pdf' }] } },
      bomEntries: [{ id: 'e1', parentType: 'product', parentId: 'LGS031', productCode: 'LGS031', materialId: 'm1' }],
    },
  };
}

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'bom-sharding-'));
  const sourcePath = path.join(directory, 'data.js');
  await writeFile(sourcePath, serializeDataJs(migrationPayload()), 'utf8');
  return { directory, sourcePath, outputPath: path.join(directory, 'preview') };
}

function runMigration(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

test('migration defaults to dry-run and leaves the source and output untouched', async () => {
  const files = await fixture();
  try {
    const before = await readFile(files.sourcePath, 'utf8');
    const result = runMigration(['--source', files.sourcePath, '--out', files.outputPath]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      mode: 'dry-run',
      datasetVersion: JSON.parse(result.stdout).datasetVersion,
      productCount: 1,
      materialCount: 1,
      bomEntryCount: 1,
      notificationCount: 1,
      fileCount: 5,
    });
    assert.match(JSON.parse(result.stdout).datasetVersion, /^[a-f0-9]{64}$/);
    assert.equal(await readFile(files.sourcePath, 'utf8'), before);
    await assert.rejects(stat(files.outputPath), { code: 'ENOENT' });
  } finally {
    await rm(files.directory, { recursive: true, force: true });
  }
});

test('migration requires an explicit output directory for write mode', () => {
  const result = runMigration(['--write']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--out is required with --write/);
});

test('migration writes only the deterministic shard tree after parity validation', async () => {
  const files = await fixture();
  try {
    const result = runMigration(['--source', files.sourcePath, '--write', '--out', files.outputPath]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).mode, 'write');
    const manifest = JSON.parse(await readFile(path.join(files.outputPath, 'data', 'manifest.json'), 'utf8'));
    const product = JSON.parse(await readFile(path.join(files.outputPath, 'data', 'products', 'LGS031.json'), 'utf8'));
    assert.equal(manifest.products[0].path, 'data/products/LGS031.json');
    assert.equal(product.productRevisions.currentRevision, 'V2.1');
    assert.equal(product.productRevisions.effectiveRevision, 'V2');
    assert.equal(product.drawings.M1[0].path, 'assets/drawing.pdf');
    await assert.rejects(stat(path.join(files.outputPath, 'data.js')), { code: 'ENOENT' });
  } finally {
    await rm(files.directory, { recursive: true, force: true });
  }
});
