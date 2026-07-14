import test from 'node:test';
import assert from 'node:assert';
import { parseDataJsPayload } from '../src/infrastructure/github-data.js';
import { splitPayloadToShards, assembleShardedPayload } from '../src/domain/sharded-data.js';
import fs from 'node:fs';
import crypto from 'node:crypto';

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
    await assert.rejects(
      assembleShardedPayload(manifest, materials, async (id) => products.get(id)),
      /Duplicate product ID in manifest/
    );
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
