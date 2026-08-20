import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { applyMutationProposalTransaction } from '../src/features/ai-assistant/mutation-engine.js';
import { appendBomHistory } from '../src/features/bom-history.js';
import { appendNotificationEvent, describePayloadChanges } from '../src/features/notifications.js';
import { buildLogicalShardFiles, parseLogicalShardFiles } from '../src/domain/sharded-files.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = path.join(ROOT, 'data');
const CHANGE_REASON = 'SKU code synchronized to the customer September 2026 shipment plan.';

export const SEPTEMBER_2026_SKU_MIGRATIONS = [
  {
    productCode: 'LGS131',
    expectedRevision: 'V3',
    nextRevision: 'V3.1',
    skuChanges: [
      { color: '白色', from: 'LGS131W101S', to: 'LGS131W101V1S' },
      { color: '黑色', from: 'LGS131B101S', to: 'LGS131B101V1S' },
    ],
  },
  {
    productCode: 'LGS231',
    expectedRevision: 'V3',
    nextRevision: 'V3.1',
    skuChanges: [
      { color: '复古色', from: 'LGS231K101S', to: 'LGS231K101V1S' },
      { color: '黑色', from: 'LGS231B101S', to: 'LGS231B101V1S' },
    ],
  },
  {
    productCode: 'LGS420',
    expectedRevision: 'V4',
    nextRevision: 'V4.1',
    skuChanges: [
      { color: '白色', from: 'LGS420W101S', to: 'LGS420W101V1S' },
      { color: '黑色', from: 'LGS420B101S', to: 'LGS420B101V1S' },
    ],
  },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function migrationSnapshot(payload, productCode, color, canEditRevision) {
  return {
    isAdmin: true,
    dirty: false,
    canEditRevision,
    payload,
    selection: { productCode, color, revision: null, currentView: 'BomDetail', materialId: null },
  };
}

function currentSkuOwners(payload) {
  const owners = new Map();
  for (const [productCode, product] of Object.entries(payload.bom || {})) {
    for (const [color, colorData] of Object.entries(product.color_info || {})) {
      const sku = String(colorData?.sku || '').trim().toUpperCase();
      if (!sku) continue;
      if (owners.has(sku)) throw new Error(`Duplicate current SKU in PDM: ${sku}`);
      owners.set(sku, { productCode, color });
    }
  }
  return owners;
}

function validateMigrationSource(payload, migration) {
  const product = payload.bom?.[migration.productCode];
  if (!product) throw new Error(`Product not found: ${migration.productCode}`);
  const revision = payload.productRevisions?.[migration.productCode];
  if (!revision || revision.currentRevision !== migration.expectedRevision || revision.effectiveRevision !== migration.expectedRevision) {
    throw new Error(`Unexpected effective revision for ${migration.productCode}`);
  }
  if (revision.currentRevisionInfo?.workflowState !== 'released') {
    throw new Error(`Current revision must be released for ${migration.productCode}`);
  }

  const owners = currentSkuOwners(payload);
  for (const skuChange of migration.skuChanges) {
    const currentSku = String(product.color_info?.[skuChange.color]?.sku || '').trim().toUpperCase();
    if (currentSku !== skuChange.from) {
      throw new Error(`Unexpected source SKU for ${migration.productCode}/${skuChange.color}: ${currentSku}`);
    }
    if (owners.has(skuChange.to)) {
      throw new Error(`Target SKU already exists in PDM: ${skuChange.to}`);
    }
  }
}

function isMigrationAlreadyApplied(payload, migration) {
  const product = payload.bom?.[migration.productCode];
  const revision = payload.productRevisions?.[migration.productCode];
  if (!product || !revision) return false;
  if (revision.currentRevision !== migration.nextRevision || revision.effectiveRevision !== migration.nextRevision) return false;
  if (revision.currentRevisionInfo?.workflowState !== 'released') return false;
  const historical = (revision.revisions || []).find((entry) => entry.revision === migration.expectedRevision);
  return migration.skuChanges.every((skuChange) => (
    String(product.color_info?.[skuChange.color]?.sku || '').trim().toUpperCase() === skuChange.to &&
    String(historical?.snapshot?.product?.color_info?.[skuChange.color]?.sku || '').trim().toUpperCase() === skuChange.from
  ));
}

function applyProposal(payload, productCode, color, canEditRevision, operations) {
  return applyMutationProposalTransaction(
    migrationSnapshot(payload, productCode, color, canEditRevision),
    { operations },
  ).payload;
}

export function applySkuCorrectionRevision(payload, migration, occurredAt, reason = CHANGE_REASON) {
  validateMigrationSource(payload, migration);
  const [firstSkuChange, ...remainingSkuChanges] = migration.skuChanges;
  let nextPayload = applyProposal(payload, migration.productCode, firstSkuChange.color, false, [
    {
      operationType: 'create_product_revision',
      targetId: migration.productCode,
      payload: { revision: migration.nextRevision, changeReason: reason },
    },
    {
      operationType: 'update_product',
      targetId: migration.productCode,
      payload: { color: firstSkuChange.color, patch: { sku: firstSkuChange.to } },
    },
  ]);

  for (const skuChange of remainingSkuChanges) {
    nextPayload = applyProposal(nextPayload, migration.productCode, skuChange.color, true, [
      {
        operationType: 'update_product',
        targetId: migration.productCode,
        payload: { color: skuChange.color, patch: { sku: skuChange.to } },
      },
    ]);
  }

  nextPayload = applyProposal(nextPayload, migration.productCode, firstSkuChange.color, true, [
    {
      operationType: 'release_product_revision',
      targetId: migration.productCode,
      payload: { reason },
    },
  ]);

  const changes = describePayloadChanges(payload, nextPayload);
  if (changes.some((change) => change.kind.startsWith('bom_') || change.kind.startsWith('material'))) {
    throw new Error('SKU correction must not modify BOM or material master data');
  }
  nextPayload.updatedAt = occurredAt;
  nextPayload = appendBomHistory(nextPayload, payload, changes, {
    actor: 'pdm-sku-migration',
    action: 'release',
    reason,
    createdAt: occurredAt,
  });
  return {
    payload: appendNotificationEvent(nextPayload, {
      type: 'sku-code-migration',
      actor: 'pdm-sku-migration',
      changes,
      createdAt: occurredAt,
    }),
    changes,
  };
}

export async function readCanonicalPayload(root = ROOT) {
  const manifest = JSON.parse(await readFile(path.join(root, 'data', 'manifest.json'), 'utf8'));
  const files = new Map([
    ['manifest.json', JSON.stringify(manifest)],
    ['materials.json', await readFile(path.join(root, 'data', 'materials.json'), 'utf8')],
  ]);
  for (const productCode of manifest.products) {
    files.set(`products/${productCode}.json`, await readFile(path.join(root, 'data', 'products', `${productCode}.json`), 'utf8'));
  }
  return parseLogicalShardFiles(files);
}

export function buildSeptember2026SkuMigration(payload, occurredAt) {
  const previousPayload = clone(payload);
  const appliedMigrations = SEPTEMBER_2026_SKU_MIGRATIONS.filter((migration) => isMigrationAlreadyApplied(previousPayload, migration));
  if (appliedMigrations.length === SEPTEMBER_2026_SKU_MIGRATIONS.length) {
    return { payload: previousPayload, changes: [], alreadyApplied: true };
  }
  if (appliedMigrations.length > 0) throw new Error('SKU migration is only partially applied');

  let nextPayload = clone(payload);
  for (const migration of SEPTEMBER_2026_SKU_MIGRATIONS) {
    nextPayload = applySkuCorrectionRevision(nextPayload, migration, occurredAt).payload;
  }

  const changes = describePayloadChanges(previousPayload, nextPayload);
  if (changes.some((change) => change.kind.startsWith('bom_') || change.kind.startsWith('material'))) {
    throw new Error('SKU migration must not modify BOM or material master data');
  }
  if (changes.length !== 15) throw new Error(`Unexpected SKU migration change count: ${changes.length}`);

  return { payload: nextPayload, changes, alreadyApplied: false };
}

async function applyMigration(root, occurredAt, shouldApply) {
  const previousPayload = await readCanonicalPayload(root);
  const { payload, changes, alreadyApplied } = buildSeptember2026SkuMigration(previousPayload, occurredAt);
  const files = buildLogicalShardFiles(payload);
  const roundTripped = await parseLogicalShardFiles(files);
  if (JSON.stringify(roundTripped) !== JSON.stringify(payload)) throw new Error('Migrated shards do not round-trip');

  const changedPaths = [];
  for (const [logicalPath, content] of files) {
    const existing = await readFile(path.join(root, 'data', logicalPath), 'utf8');
    if (!isDeepStrictEqual(JSON.parse(existing), JSON.parse(content))) changedPaths.push(logicalPath);
  }
  const expectedPaths = alreadyApplied
    ? []
    : ['manifest.json', 'products/LGS131.json', 'products/LGS231.json', 'products/LGS420.json'];
  if (JSON.stringify(changedPaths.sort()) !== JSON.stringify(expectedPaths)) {
    throw new Error(`Unexpected changed shard set: ${changedPaths.join(', ')}`);
  }

  if (shouldApply) {
    for (const logicalPath of changedPaths) {
      await writeFile(path.join(root, 'data', logicalPath), files.get(logicalPath), 'utf8');
    }
  }
  return { changes, changedPaths, alreadyApplied };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--apply')) throw new Error('Usage: node scripts/migrate-september-2026-sku-codes.mjs [--apply]');
  const occurredAt = new Date().toISOString();
  const result = await applyMigration(ROOT, occurredAt, args.has('--apply'));
  console.log(`${result.alreadyApplied ? 'Already applied' : args.has('--apply') ? 'Applied' : 'Validated'} September 2026 SKU migration.`);
  console.log(`Changed shards: ${result.changedPaths.join(', ')}`);
  console.log(`Tracked changes: ${result.changes.length}`);
}
