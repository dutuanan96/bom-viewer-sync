import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSeptember2026SkuMigration, readCanonicalPayload, SEPTEMBER_2026_SKU_MIGRATIONS } from '../scripts/migrate-september-2026-sku-codes.mjs';

test('September 2026 SKU migration creates released revisions without changing BOM or material data', async () => {
  const source = await readCanonicalPayload();
  for (const migration of SEPTEMBER_2026_SKU_MIGRATIONS) {
    const historical = source.productRevisions[migration.productCode].revisions
      .find((entry) => entry.revision === migration.expectedRevision);
    assert.ok(historical?.snapshot?.product, `Missing source snapshot for ${migration.productCode}`);
    source.bom[migration.productCode] = structuredClone(historical.snapshot.product);
    source.productRevisions[migration.productCode] = {
      currentRevision: migration.expectedRevision,
      effectiveRevision: migration.expectedRevision,
      currentRevisionInfo: { sourceRevision: '', createdAt: '', changeReason: '', workflowState: 'released' },
      revisions: [],
      effectivityEvents: source.productRevisions[migration.productCode].effectivityEvents
        .filter((event) => event.revision !== migration.nextRevision),
    };
  }
  const sourceBomEntries = JSON.stringify(source.materialDb.bomEntries);
  const sourceMaterials = JSON.stringify(source.materialDb.materials);
  const occurredAt = '2026-08-20T00:00:00.000Z';
  const { payload, changes } = buildSeptember2026SkuMigration(source, occurredAt);

  assert.equal(JSON.stringify(payload.materialDb.bomEntries), sourceBomEntries);
  assert.equal(JSON.stringify(payload.materialDb.materials), sourceMaterials);
  assert.equal(changes.length, 15);

  for (const migration of SEPTEMBER_2026_SKU_MIGRATIONS) {
    const revision = payload.productRevisions[migration.productCode];
    assert.equal(payload.bom[migration.productCode].revision, migration.nextRevision);
    assert.equal(revision.currentRevision, migration.nextRevision);
    assert.equal(revision.effectiveRevision, migration.nextRevision);
    assert.equal(revision.currentRevisionInfo.workflowState, 'released');

    for (const skuChange of migration.skuChanges) {
      assert.equal(payload.bom[migration.productCode].color_info[skuChange.color].sku, skuChange.to);
    }

    const historical = revision.revisions.find((entry) => entry.revision === migration.expectedRevision);
    assert.ok(historical?.snapshot?.product, `Missing immutable snapshot for ${migration.productCode}`);
    for (const skuChange of migration.skuChanges) {
      assert.equal(historical.snapshot.product.color_info[skuChange.color].sku, skuChange.from);
    }
  }

  assert.equal(payload.updatedAt, occurredAt);
  assert.equal(payload.notifications[0].type, 'sku-code-migration');
});
