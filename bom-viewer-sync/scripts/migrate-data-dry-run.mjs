import fs from 'node:fs';
import { parseDataJsPayload } from '../src/infrastructure/github-data.js';
import {
  buildLogicalShardFiles,
  computeShardAggregateHash,
  verifyLogicalShardRoundTrip,
} from './lib/sharded-files.mjs';
async function run() {
  const source = fs.readFileSync('data.js', 'utf8');
  const payload = parseDataJsPayload(source);

  const files = buildLogicalShardFiles(payload);
  await verifyLogicalShardRoundTrip(payload, files);
  const aggregateHash = computeShardAggregateHash(files);

  console.log('=== DRY-RUN MIGRATION SUCCESS ===');
  console.log(`Materials: ${Object.keys(payload.materialDb.materials).length}`);
  console.log(`BOM Entries: ${payload.materialDb.bomEntries.length}`);
  console.log(`Products: ${Object.keys(payload.bom).length}`);
  console.log(`Notifications: ${payload.notifications.length}`);
  console.log(`Virtual files created: ${files.size}`);
  console.log(`Aggregate SHA-256: ${aggregateHash}`);
}

run().catch(err => {
  console.error('MIGRATION FAILED:', err.message);
  process.exit(1);
});
