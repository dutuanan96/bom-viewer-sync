import fs from 'node:fs';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { parseDataJsPayload, normalizePayload } from '../src/infrastructure/github-data.js';
import { splitPayloadToShards, assembleShardedPayload } from '../src/domain/sharded-data.js';

async function run() {
  const source = fs.readFileSync('data.js', 'utf8');
  const payload = parseDataJsPayload(source);

  const { manifest, materials, products } = splitPayloadToShards(payload);

  const virtualFiles = new Map();

  const stringify = (obj) => JSON.stringify(obj, null, 2) + '\n';

  virtualFiles.set('manifest.json', stringify(manifest));
  virtualFiles.set('materials.json', stringify(materials));

  for (const [id, prod] of products.entries()) {
    virtualFiles.set(`products/${id}.json`, stringify(prod));
  }

  // Deserialization & Assembly (in memory)
  const parsedManifest = JSON.parse(virtualFiles.get('manifest.json'));
  const parsedMaterials = JSON.parse(virtualFiles.get('materials.json'));

  const assembled = await assembleShardedPayload(parsedManifest, parsedMaterials, async (id) => {
    const text = virtualFiles.get(`products/${id}.json`);
    if (!text) throw new Error(`Product shard not found: ${id}`);
    return JSON.parse(text);
  });

  const finalPayload = normalizePayload(assembled);

  // Validation
  assert.deepStrictEqual(finalPayload, payload, 'Payload did not match after round-trip migration');

  // Hash calculation (for stable aggregate hash)
  let hashStr = '';
  // Sort paths to have a stable hash
  const sortedPaths = Array.from(virtualFiles.keys()).sort();
  for (const path of sortedPaths) {
    const content = virtualFiles.get(path);
    const pathBytes = Buffer.byteLength(path);
    const contentBytes = Buffer.byteLength(content);
    hashStr += `${pathBytes}:${path}:${contentBytes}:${content}`;
  }
  const aggregateHash = crypto.createHash('sha256').update(hashStr).digest('hex');

  console.log('=== DRY-RUN MIGRATION SUCCESS ===');
  console.log(`Materials: ${Object.keys(payload.materialDb.materials).length}`);
  console.log(`BOM Entries: ${payload.materialDb.bomEntries.length}`);
  console.log(`Products: ${Object.keys(payload.bom).length}`);
  console.log(`Notifications: ${payload.notifications.length}`);
  console.log(`Virtual files created: ${virtualFiles.size}`);
  console.log(`Aggregate SHA-256: ${aggregateHash}`);
}

run().catch(err => {
  console.error('MIGRATION FAILED:', err.message);
  process.exit(1);
});
