import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  findOrphanBomEntries,
  buildOrphanBomCleanupBatches,
} from '../src/features/orphan-cleanup/orphan-bom-proposal-builder.js';
import {
  applyMutationProposalTransaction,
  buildMutationProposalReview,
  validateMutationContext,
} from '../src/features/ai-assistant/mutation-engine.js';
import { buildEcnProposalBatches } from '../src/features/ecn-proposal/ecn-2026-0710-proposal-builder.js';
import { parseLogicalShardFiles } from '../src/domain/sharded-files.js';

const repoRoot = path.resolve(import.meta.dirname, '..');

async function loadCanonicalPayload() {
  const logicalFiles = new Map();
  const dataRoot = path.join(repoRoot, 'data');
  for (const logicalPath of ['manifest.json', 'materials.json']) {
    logicalFiles.set(logicalPath, readFileSync(path.join(dataRoot, logicalPath), 'utf8'));
  }
  const productsRoot = path.join(dataRoot, 'products');
  for (const entry of readdirSync(productsRoot, { withFileTypes: true })) {
    if (entry.isFile()) {
      logicalFiles.set(`products/${entry.name}`, readFileSync(path.join(productsRoot, entry.name), 'utf8'));
    }
  }
  return await parseLogicalShardFiles(logicalFiles);
}

function injectTestOrphans(payload, count = 183) {
  const cloned = JSON.parse(JSON.stringify(payload));
  const sampleMatId = Object.keys(cloned.materialDb.materials)[0];
  const samplePid = Object.keys(cloned.bom)[0];
  for (let i = 0; i < count; i++) {
    cloned.materialDb.bomEntries.push({
      id: `mat_test_orphan_${i}`,
      parentId: samplePid,
      parentType: 'product',
      productCode: samplePid,
      color: `NON_EXISTENT_COLOR_${i}`,
      materialId: sampleMatId,
      qty: 1,
    });
  }
  return cloned;
}

test('Orphan BOM Cleanup - identifies all orphan entries', async () => {
  const basePayload = await loadCanonicalPayload();
  const payload = injectTestOrphans(basePayload, 183);
  const orphanEntries = findOrphanBomEntries(payload);

  assert.equal(orphanEntries.length, 183, 'Must find exactly 183 orphan entries');

  // Verify every orphan entry references a non-existent color
  for (const entry of orphanEntries) {
    const pid = entry.productCode || entry.parentId;
    assert.ok(payload.bom[pid], `Product ${pid} must exist`);
    assert.equal(Boolean(payload.bom[pid].color_info?.[entry.color]), false,
      `Orphan entry ${entry.id} must reference non-existent color ${pid}/${entry.color}`);
  }
});

test('Orphan BOM Cleanup - builds deterministic remove_orphan_bom_entry batches', async () => {
  const basePayload = await loadCanonicalPayload();
  const payload = injectTestOrphans(basePayload, 183);
  const batches = buildOrphanBomCleanupBatches(payload, 40);

  assert.equal(batches.length, 5, '183 entries at 40/batch must produce 5 batches');
  const totalOps = batches.reduce((sum, b) => sum + b.operations.length, 0);
  assert.equal(totalOps, 183, 'Total operations must equal 183');

  for (const batch of batches) {
    assert.ok(batch.operations.length <= 40, 'Batch size must not exceed 40');
    assert.ok(batch.summary.includes('清理无主 BOM 行'), 'Summary must have descriptive title');
    for (const op of batch.operations) {
      assert.equal(op.operationType, 'remove_orphan_bom_entry', 'Must use dedicated remove_orphan_bom_entry schema');
      assert.ok(op.targetId.startsWith('mat_'), 'Target ID must be a valid BOM entry ID');
      assert.deepEqual(op.payload, {}, 'remove_orphan_bom_entry payload must be empty');
    }
  }
});

test('Orphan BOM Cleanup - strict capability scoping and context guards', async () => {
  const basePayload = await loadCanonicalPayload();
  const payload = injectTestOrphans(basePayload, 10);
  const orphanEntries = findOrphanBomEntries(payload);
  const targetOrphan = orphanEntries[0];

  const nonOrphanEntry = payload.materialDb.bomEntries.find(e => (
    e.parentType === 'product' && Boolean(payload.bom[e.parentId]?.color_info?.[e.color])
  ));

  const snapshot = {
    isAdmin: true,
    dirty: false,
    canEditRevision: false, // Released revision (no draft)
    selection: { productCode: nonOrphanEntry.parentId, color: nonOrphanEntry.color },
    payload,
    sourceMetadata: { commitSha: 'a'.repeat(40) },
  };

  // 1. remove_bom_item CANNOT bypass draft revision even on an orphan entry
  assert.throws(
    () => validateMutationContext(snapshot, {
      operationType: 'remove_bom_item',
      targetId: targetOrphan.id,
      payload: {},
    }),
    /BOM mutations require a draft revision/,
    'remove_bom_item must require draft revision and cannot bypass validation on orphan entries'
  );

  // 2. remove_orphan_bom_entry CANNOT target a valid active non-orphan entry
  assert.throws(
    () => validateMutationContext(snapshot, {
      operationType: 'remove_orphan_bom_entry',
      targetId: nonOrphanEntry.id,
      payload: {},
    }),
    /is not an orphan entry/,
    'remove_orphan_bom_entry must reject non-orphan active entries'
  );

  // 3. remove_bom_item in a proposal does NOT benefit from orphan remediation warning (it triggers strict verification error)
  assert.throws(
    () => buildMutationProposalReview(
      { ...snapshot, canEditRevision: true, selection: { productCode: nonOrphanEntry.parentId, color: nonOrphanEntry.color } },
      { operations: [{ operationType: 'remove_bom_item', targetId: nonOrphanEntry.id, payload: {} }] }
    ),
    /Proposal verification failed: BOM entry .* references missing color/,
    'remove_bom_item must NOT receive remediation exception when orphan entries remain'
  );
});

test('Orphan BOM Cleanup - applying all batches cleans entries and passes strict validation', async () => {
  const basePayload = await loadCanonicalPayload();
  const initialValidCount = basePayload.materialDb.bomEntries.length;
  const payload = injectTestOrphans(basePayload, 183);
  const manifestBefore = JSON.parse(readFileSync(path.join(repoRoot, 'data/manifest.json'), 'utf8'));
  const revisionsBefore = JSON.stringify(manifestBefore.productRevisions);

  let currentPayload = payload;
  const batches = buildOrphanBomCleanupBatches(currentPayload, 40);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const snapshot = {
      isAdmin: true,
      dirty: false,
      payload: currentPayload,
      sourceMetadata: { commitSha: 'a'.repeat(40) },
    };

    const review = buildMutationProposalReview(snapshot, { operations: batch.operations });
    assert.equal(review.operations.length, batch.operations.length);

    const transaction = applyMutationProposalTransaction(snapshot, { operations: batch.operations });
    currentPayload = transaction.payload;
  }

  // Verify 0 orphan entries remain
  const remainingOrphans = findOrphanBomEntries(currentPayload);
  assert.equal(remainingOrphans.length, 0, 'Must have 0 orphan entries after cleanup');

  // Verify valid active BOM entries are preserved
  assert.equal(currentPayload.materialDb.bomEntries.length, initialValidCount, 'Must preserve all valid BOM entries');

  // Verify historical revision snapshots were NOT modified
  assert.equal(JSON.stringify(currentPayload.productRevisions), revisionsBefore,
    'Historical revision snapshots must remain untouched');
});
