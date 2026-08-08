import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDraftRevisionOperations,
  buildRegeneratedSwapOperations,
  buildWithdrawRevisionOperations,
  findProductsNeedingDraft,
} from '../src/features/ai-assistant/workspace-view.js';

function snapshotWithUsages() {
  return {
    payload: {
      materialDb: {
        materials: {
          M1: { id: 'M1', code: 'PAPER-60' },
          M2: { id: 'M2', code: 'PAPER-100' },
          M3: { id: 'M3', code: 'PACK' },
        },
        bomEntries: [
          { id: 'product-entry', parentType: 'product', parentId: 'P1', productCode: 'P1', color: 'White', materialId: 'M1' },
          { id: 'parent-entry', parentType: 'material', parentId: 'M3', materialId: 'M1' },
        ],
      },
    },
  };
}

test('workspace swap: replaces the selected source operation without mutating the original proposal', () => {
  const sourceOperation = {
    operationType: 'create_material',
    targetId: 'M1',
    payload: { material: { code: 'PAPER-60', spec: { zh: '100mm', vi: '100mm' } } },
  };
  const untouchedOperation = {
    operationType: 'update_material_field',
    targetId: 'M3',
    payload: { field: 'name_zh', value: '包装' },
  };
  const proposal = { summary: 'Update paper cards', operations: [sourceOperation, untouchedOperation] };
  const originalProposal = structuredClone(proposal);

  const result = buildRegeneratedSwapOperations({
    proposal,
    snapshot: snapshotWithUsages(),
    swaps: [{
      duplicateId: 'M2',
      operation: {
        sourceIndex: 0,
        mutation: { operationType: 'update_material', targetId: 'M1', payload: { patch: { spec: { zh: '100mm', vi: '100mm' } } } },
        originalMutation: structuredClone(sourceOperation),
      },
    }],
  });

  assert.deepEqual(proposal, originalProposal);
  assert.deepEqual(result.affectedProducts, ['P1']);
  assert.deepEqual(result.operations, [
    untouchedOperation,
    { operationType: 'replace_bom_item', targetId: 'product-entry', payload: { materialId: 'M2' } },
    { operationType: 'replace_bom_item', targetId: 'parent-entry', payload: { materialId: 'M2' } },
  ]);
});

test('workspace swap: fails explicitly when the selected material has no usages', () => {
  const snapshot = snapshotWithUsages();
  snapshot.payload.materialDb.bomEntries = [];

  assert.throws(() => buildRegeneratedSwapOperations({
    proposal: {
      operations: [{ operationType: 'update_material', targetId: 'M1', payload: { patch: { spec: { zh: '100mm' } } } }],
    },
    snapshot,
    swaps: [{
      duplicateId: 'M2',
      operation: {
        sourceIndex: 0,
        mutation: { operationType: 'update_material', targetId: 'M1', payload: { patch: { spec: { zh: '100mm' } } } },
      },
    }],
  }), (error) => error?.code === 'AI_SWAP_NO_USAGES');
});

test('workspace swap: requires a stable source index', () => {
  assert.throws(() => buildRegeneratedSwapOperations({
    proposal: { operations: [{ operationType: 'update_material', targetId: 'M1', payload: { patch: {} } }] },
    snapshot: snapshotWithUsages(),
    swaps: [{
      duplicateId: 'M2',
      operation: { mutation: { operationType: 'update_material', targetId: 'M1', payload: { patch: {} } } },
    }],
  }), (error) => error?.code === 'AI_SWAP_SOURCE_MISSING');
});

test('workspace swap: reads the canonical revision registry when identifying released products', () => {
  const payload = {
    productRevisions: {
      P1: { currentRevision: 'V1.1', currentRevisionInfo: { workflowState: 'draft' } },
      P2: { currentRevision: 'V2', currentRevisionInfo: { workflowState: 'released' } },
    },
  };

  assert.deepEqual(findProductsNeedingDraft(payload, ['P1', 'P2', 'P2', 'P3']), ['P2']);
});

test('workspace swap: creates explicit draft operations from reviewer-supplied version data', () => {
  assert.deepEqual(buildDraftRevisionOperations(['P2', 'P2'], {
    revision_P2: 'V2.1',
    reason_P2: 'Replace duplicate paper card',
  }), [{
    operationType: 'create_product_revision',
    targetId: 'P2',
    payload: {
      revision: 'V2.1',
      changeReason: 'Replace duplicate paper card',
    },
  }]);
});

test('workspace swap: creates a reasoned withdrawal operation only from reviewer input', () => {
  assert.deepEqual(buildWithdrawRevisionOperations(['P2'], {
    withdrawReason_P2: 'Published BOM needs correction',
  }), [{
    operationType: 'withdraw_product_revision',
    targetId: 'P2',
    payload: { reason: 'Published BOM needs correction' },
  }]);
});
