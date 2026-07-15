import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { normalizePayload } from '../../src/infrastructure/github-data.js';
import { assertLogicalFiles, buildLogicalShardFiles, toRepositoryShardFiles, parseLogicalShardFiles } from '../../src/domain/sharded-files.js';

export { buildLogicalShardFiles, toRepositoryShardFiles, parseLogicalShardFiles };

export function computeShardAggregateHash(files) {
  assertLogicalFiles(files);
  let framed = '';
  for (const path of [...files.keys()].sort()) {
    const content = files.get(path);
    framed += `${Buffer.byteLength(path)}:${path}:${Buffer.byteLength(content)}:${content}`;
  }
  return crypto.createHash('sha256').update(framed).digest('hex');
}

export async function verifyLogicalShardRoundTrip(payload, files) {
  const assembled = await parseLogicalShardFiles(files);
  assert.deepEqual(normalizePayload(assembled), normalizePayload(payload));
}
