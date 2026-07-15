import test from 'node:test';
import assert from 'node:assert';
import { parseDataJsPayload } from '../src/infrastructure/github-data.js';
import { splitPayloadToShards, assembleShardedPayload } from '../src/domain/sharded-data.js';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { materializeShards } from '../scripts/materialize-shards.mjs';
import { verifyRollback } from '../scripts/verify-rollback.mjs';

test('Sharded Migration Data Logic', async (t) => {
  const source = fs.readFileSync('data.js', 'utf8');
  const payload = parseDataJsPayload(source);

  await t.test('Happy path: split and assemble exact match', async () => {
    const { manifest, materials, products } = splitPayloadToShards(payload);

    assert.strictEqual(products.size, 22, 'Should have 22 product shards');
    assert.ok(manifest, 'Should have manifest');
    assert.ok(materials, 'Should have materials shard');

    const rawAssembled = await assembleShardedPayload(manifest, materials, async (id) => products.get(id));
    const { normalizePayload } = await import('../src/infrastructure/github-data.js');
    const assembled = normalizePayload(rawAssembled);

    assert.deepStrictEqual(assembled.bom, payload.bom);
    assert.deepStrictEqual(assembled.materialDb, payload.materialDb);
    assert.strictEqual(Object.keys(payload.materialDb.materials).length, 646);
    assert.strictEqual(payload.materialDb.bomEntries.length, 2725);
    assert.strictEqual(payload.notifications.length, 1);

    // Immutable snapshots and metadata preservation
    assert.deepStrictEqual(assembled.productRevisions, payload.productRevisions);
    assert.deepStrictEqual(assembled.models3d, payload.models3d);
    assert.deepStrictEqual(assembled.drawings, payload.drawings);
    assert.deepStrictEqual(assembled.manuals, payload.manuals);
  });

  await t.test('Regression: Missing product shard', async () => {
    const { manifest, materials, products } = splitPayloadToShards(payload);
    await assert.rejects(
      assembleShardedPayload(manifest, materials, async (id) => {
        if (id === manifest.products[0]) return null; // simulate missing
        return products.get(id);
      }),
      new RegExp(`Invalid product ${manifest.products[0]}`)
    );
  });

  await t.test('Regression: Extraneous product ID in manifest', async () => {
    const { manifest, materials, products } = splitPayloadToShards(payload);
    manifest.products.push('INVALID_EXTRA_ID');
    await assert.rejects(
      assembleShardedPayload(manifest, materials, async (id) => {
        if (id === 'INVALID_EXTRA_ID') return null;
        return products.get(id);
      }),
      /Invalid product INVALID_EXTRA_ID/
    );
  });

  await t.test('Regression: Invalid schema for manifest', async () => {
    const { materials, products } = splitPayloadToShards(payload);
    await assert.rejects(
      assembleShardedPayload({ products: 'not-an-array' }, materials, async (id) => products.get(id)),
      /Invalid manifest/
    );
  });

  await t.test('Regression: Invalid schema for materials', async () => {
    const { manifest, products } = splitPayloadToShards(payload);
    await assert.rejects(
      assembleShardedPayload(manifest, { materialDb: null }, async (id) => products.get(id)),
      /Invalid materials/
    );
  });

  await t.test('Regression: Invalid product ID format', async () => {
    const { manifest, materials, products } = splitPayloadToShards(payload);
    manifest.products.push('../invalid/path');
    await assert.rejects(
      assembleShardedPayload(manifest, materials, async (id) => products.get(id)),
      /Invalid product ID format/
    );
  });

  await t.test('Invariant: No pendingAssetId or blob URLs in shards', async () => {
    const { manifest, materials, products } = splitPayloadToShards(payload);
    const jsonStr = JSON.stringify({ manifest, materials, products: Array.from(products.entries()) });
    assert.ok(!jsonStr.includes('pendingAssetId'), 'Should not have pending assets');
    assert.ok(!jsonStr.includes('blob:'), 'Should not have blob URLs');
  });

  await t.test('Regression: Duplicate product ID in manifest', async () => {
    const { manifest, materials, products } = splitPayloadToShards(payload);
    manifest.products.push(manifest.products[0]);
    let callCount = 0;
    await assert.rejects(
      assembleShardedPayload(manifest, materials, async (id) => {
        callCount++;
        return products.get(id);
      }),
      /Duplicate product ID in manifest/
    );
    assert.strictEqual(callCount, 0, 'Loader should not be called if manifest has duplicates');
  });

  await t.test('Regression: Unsafe Product ID in payload.bom', async () => {
    const maliciousPayload = JSON.parse(JSON.stringify(payload));
    maliciousPayload.bom['../escape'] = {};
    assert.throws(
      () => splitPayloadToShards(maliciousPayload),
      /Invalid product ID format/
    );
  });

  await t.test('Regression: Aggregate hash depends on framing', async () => {
    const computeHash = (files) => {
      let hashStr = '';
      const sortedPaths = Array.from(files.keys()).sort();
      for (const path of sortedPaths) {
        const content = files.get(path);
        const pathBytes = Buffer.byteLength(path);
        const contentBytes = Buffer.byteLength(content);
        hashStr += `${pathBytes}:${path}:${contentBytes}:${content}`;
      }
      return crypto.createHash('sha256').update(hashStr).digest('hex');
    };

    const files1 = new Map();
    files1.set('a', 'bc');

    const files2 = new Map();
    files2.set('ab', 'c');

    assert.notStrictEqual(computeHash(files1), computeHash(files2), 'Hashes should differ when boundaries shift');
  });
});

test('Materialize and Verify scripts preserve the full payload without legacy tools', async () => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bom-sync-test-'));

  try {
    const dataJsPath = path.join(tmpDir, 'data.js');
    const dataDir = path.join(tmpDir, 'data');

    const payload = {
      version: 2,
      updatedAt: '2026-07-15T00:00:00.000Z',
      bom: {
        P1: { code: 'P1', name: 'Product 1' }
      },
      materialDb: {
        materials: { m1: { id: 'm1', code: 'M1' } },
        bomEntries: []
      },
      drawings: {},
      manuals: {},
      models3d: {},
      productImages: {}
    };

    const source = `window.BOM_VIEWER_DATA = ${JSON.stringify(payload, null, 2)};`;
    await fs.promises.writeFile(dataJsPath, source, 'utf8');

    const size = await materializeShards(dataJsPath, 'data', { rootDir: tmpDir });
    assert.strictEqual(size, 3);

    const recovered = await verifyRollback('data', 'data.js', { rootDir: tmpDir });
    assert.strictEqual(recovered.version, 2);
    assert.strictEqual(recovered.bom.P1.name, 'Product 1');
    assert.strictEqual(recovered.materialDb.materials.m1.code, 'M1');
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Materialize script rejects unexpected count and hash', async () => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bom-sync-test-2-'));
  try {
    const dataJsPath = path.join(tmpDir, 'data.js');
    const source = `window.BOM_VIEWER_DATA = ${JSON.stringify({
      version: 2, bom: {}, materialDb: { materials: {}, bomEntries: [] },
      drawings: {}, manuals: {}, models3d: {}, productImages: {}
    })};`;
    await fs.promises.writeFile(dataJsPath, source, 'utf8');

    await assert.rejects(
      materializeShards(dataJsPath, 'data', { rootDir: tmpDir, expectedCount: 24 }),
      /Expected 24 shards, but got/
    );

    await assert.rejects(
      materializeShards(dataJsPath, 'data', { rootDir: tmpDir, expectedHash: 'wrong-hash' }),
      /Hash mismatch/
    );
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Materialize script rejects transient data', async () => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bom-sync-test-3-'));
  try {
    const dataJsPath = path.join(tmpDir, 'data.js');
    await fs.promises.writeFile(dataJsPath, `window.BOM_VIEWER_DATA = {"pendingAssetId": "123"};`, 'utf8');
    await assert.rejects(materializeShards(dataJsPath, 'data', { rootDir: tmpDir }), /Unsafe payload: contains pendingAssetId/);

    await fs.promises.writeFile(dataJsPath, `window.BOM_VIEWER_DATA = {"url": "blob:foo"};`, 'utf8');
    await assert.rejects(materializeShards(dataJsPath, 'data', { rootDir: tmpDir }), /Unsafe payload: contains blob URLs/);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Materialize script rejects absolute output paths outside rootDir', async () => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bom-sync-output-root-'));
  const outsideDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bom-sync-output-outside-'));
  try {
    const dataJsPath = path.join(tmpDir, 'data.js');
    await fs.promises.writeFile(dataJsPath, `window.BOM_VIEWER_DATA = ${JSON.stringify({
      version: 2,
      bom: { P1: { id: 'P1' } },
      materialDb: { materials: {}, bomEntries: [] },
    })};`, 'utf8');

    await assert.rejects(
      materializeShards(dataJsPath, path.join(outsideDir, 'data'), { rootDir: tmpDir }),
      /Output directory must be a safe repository-relative shard root/,
    );
    await assert.rejects(fs.promises.stat(path.join(outsideDir, 'data', 'manifest.json')), { code: 'ENOENT' });
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    await fs.promises.rm(outsideDir, { recursive: true, force: true });
  }
});

test('Materialize verification rejects unexpected existing shard files', async () => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bom-sync-extra-shard-'));
  try {
    const dataJsPath = path.join(tmpDir, 'data.js');
    await fs.promises.writeFile(dataJsPath, `window.BOM_VIEWER_DATA = ${JSON.stringify({
      version: 2,
      bom: { P1: { id: 'P1' } },
      materialDb: { materials: {}, bomEntries: [] },
    })};`, 'utf8');

    await materializeShards(dataJsPath, 'data', { rootDir: tmpDir });
    await fs.promises.writeFile(path.join(tmpDir, 'data', 'products', 'EXTRA.json'), '{}\n', 'utf8');

    await assert.rejects(
      materializeShards(dataJsPath, 'data', { rootDir: tmpDir, verify: true }),
      /Unexpected existing file: data\/products\/EXTRA\.json/,
    );
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Materialize script rejects symlinks inside the shard output tree', async (t) => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bom-sync-symlink-root-'));
  const outsideDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bom-sync-symlink-outside-'));
  try {
    const dataJsPath = path.join(tmpDir, 'data.js');
    await fs.promises.writeFile(dataJsPath, `window.BOM_VIEWER_DATA = ${JSON.stringify({
      version: 2,
      bom: { P1: { id: 'P1' } },
      materialDb: { materials: {}, bomEntries: [] },
    })};`, 'utf8');
    await fs.promises.mkdir(path.join(tmpDir, 'data'));
    try {
      await fs.promises.symlink(
        outsideDir,
        path.join(tmpDir, 'data', 'products'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    } catch (error) {
      if (error.code === 'EPERM') {
        t.skip('Creating a test symlink is not permitted on this machine');
        return;
      }
      throw error;
    }

    await assert.rejects(
      materializeShards(dataJsPath, 'data', { rootDir: tmpDir }),
      /Symbolic links are not allowed in shard output: data\/products/,
    );
    await assert.rejects(fs.promises.stat(path.join(outsideDir, 'P1.json')), { code: 'ENOENT' });
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    await fs.promises.rm(outsideDir, { recursive: true, force: true });
  }
});
