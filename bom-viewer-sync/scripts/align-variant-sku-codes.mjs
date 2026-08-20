import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { applySkuCorrectionRevision, readCanonicalPayload } from './migrate-september-2026-sku-codes.mjs';
import { buildLogicalShardFiles, parseLogicalShardFiles } from '../src/domain/sharded-files.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REASON = 'Align all active variants in the SPU to the approved V1 SKU convention.';
const CORRECTIONS = [
  { productCode: 'LGS131', expectedRevision: 'V3.1', nextRevision: 'V3.2', skuChanges: [{ color: '复古色', from: 'LGS131K101S', to: 'LGS131K101V1S' }] },
  { productCode: 'LGS420', expectedRevision: 'V4.1', nextRevision: 'V4.2', skuChanges: [{ color: '复古色', from: 'LGS420K101S', to: 'LGS420K101V1S' }] },
];

const args = new Set(process.argv.slice(2));
if ([...args].some((arg) => arg !== '--apply')) throw new Error('Usage: node scripts/align-variant-sku-codes.mjs [--apply]');
const occurredAt = new Date().toISOString();
let payload = await readCanonicalPayload(ROOT);
for (const correction of CORRECTIONS) payload = applySkuCorrectionRevision(payload, correction, occurredAt, REASON).payload;
const files = buildLogicalShardFiles(payload);
await parseLogicalShardFiles(files);
const changedPaths = [];
for (const [logicalPath, content] of files) {
  const existing = await readFile(path.join(ROOT, 'data', logicalPath), 'utf8');
  if (!isDeepStrictEqual(JSON.parse(existing), JSON.parse(content))) changedPaths.push(logicalPath);
}
const expectedPaths = ['manifest.json', 'products/LGS131.json', 'products/LGS420.json'];
if (JSON.stringify(changedPaths.sort()) !== JSON.stringify(expectedPaths)) throw new Error(`Unexpected changed shard set: ${changedPaths.join(', ')}`);
if (args.has('--apply')) {
  for (const logicalPath of changedPaths) await writeFile(path.join(ROOT, 'data', logicalPath), files.get(logicalPath), 'utf8');
}
console.log(`${args.has('--apply') ? 'Applied' : 'Validated'} full-SPU SKU alignment: ${changedPaths.join(', ')}`);
