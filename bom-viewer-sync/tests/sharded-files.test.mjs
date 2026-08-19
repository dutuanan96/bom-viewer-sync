import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildLogicalShardFiles,
  computeShardAggregateHash,
  toRepositoryShardFiles,
  verifyLogicalShardRoundTrip,
} from '../scripts/lib/sharded-files.mjs';
import { parseDataJsPayload } from '../src/infrastructure/github-data.js';

test('logical shard helpers preserve exact aggregate hash and round-trip', async () => {
  const dataJsSource = readFileSync('data.js', 'utf8');
  const payload = parseDataJsPayload(dataJsSource);

  const files = buildLogicalShardFiles(payload);

  assert.equal(files.size, 24);
  assert.deepEqual([...files.keys()].sort(), [
    'manifest.json',
    'materials.json',
    ...Object.keys(payload.bom).sort().map((id) => `products/${id}.json`),
  ]);

  assert.equal(
    computeShardAggregateHash(files),
    '13ef96c937232cdc0095ef704868f1ea52dddbf98d672c3ad1ca4b2454ccba4d',
  );

  const repoFiles = toRepositoryShardFiles(files, 'bom-viewer-sync/data');
  assert.ok(Object.keys(repoFiles).every(path => path.startsWith('bom-viewer-sync/data/')));

  await verifyLogicalShardRoundTrip(payload, files);
});
