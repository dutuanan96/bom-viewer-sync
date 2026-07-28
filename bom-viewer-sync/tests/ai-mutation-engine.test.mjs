import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMutationProposalTransaction,
  applyMutationTransaction,
  buildMutationProposalReview,
  computeMutationDiff,
} from '../src/features/ai-assistant/mutation-engine.js';
import { ERROR_CODES } from '../src/features/ai-assistant/contracts.js';

test('mutation-engine: applyMutationTransaction validates admin mode and editability', () => {
  const snapshot = { isAdmin: false, canEditRevision: true, dirty: false };
  const mutation = { operationType: 'update_material_field', targetId: 'M1', payload: { field: 'name_zh', value: 'New Name' } };
  
  assert.throws(() => applyMutationTransaction(snapshot, mutation), (err) => err.code === ERROR_CODES.AI_POLICY_BLOCKED);
  
  const snapshotNotEditable = { isAdmin: true, canEditRevision: false, dirty: false };
  const bomMutation = { operationType: 'update_bom_quantity', targetId: 'P1', payload: { color: 'red', childId: 'M1', quantity: 1 } };
  assert.throws(() => applyMutationTransaction(snapshotNotEditable, bomMutation), (err) => err.code === ERROR_CODES.AI_POLICY_BLOCKED);
});

test('mutation-engine: applyMutationTransaction rejects mutations on dirty state', () => {
  const snapshot = { isAdmin: true, canEditRevision: true, dirty: true };
  const mutation = { operationType: 'update_material_field', targetId: 'M1', payload: { field: 'name_zh', value: 'New Name' } };
  
  assert.throws(() => applyMutationTransaction(snapshot, mutation), (err) => err.code === ERROR_CODES.AI_POLICY_BLOCKED);
});

test('mutation-engine: applyMutationTransaction updates material field', () => {
  const snapshot = {
    isAdmin: true,
    canEditRevision: true,
    dirty: false,
    payload: {
      materialDb: {
        materials: {
          'M1': { code: 'M1', name: { zh: 'Old Name' } }
        }
      }
    }
  };
  const mutation = { operationType: 'update_material_field', targetId: 'M1', payload: { field: 'name_zh', value: 'New Name' } };
  
  const { payload, changes } = applyMutationTransaction(snapshot, mutation);
  assert.equal(payload.materialDb.materials['M1'].name.zh, 'New Name');
  assert.ok(changes.length > 0);
});

test('mutation-engine: computeMutationDiff computes diff without mutating snapshot', () => {
  const snapshot = {
    isAdmin: true,
    canEditRevision: true,
    dirty: false,
    payload: {
      materialDb: {
        materials: {
          'M1': { code: 'M1', name: { zh: 'Old Name' } }
        }
      }
    }
  };
  const mutation = { operationType: 'update_material_field', targetId: 'M1', payload: { field: 'name_zh', value: 'New Name' } };
  
  const changes = computeMutationDiff(snapshot, mutation);
  assert.equal(snapshot.payload.materialDb.materials['M1'].name.zh, 'Old Name'); // Unchanged
  assert.ok(changes.length > 0);
  assert.equal(changes[0].before, 'Old Name');
  assert.equal(changes[0].after, 'New Name');
});

function proposalSnapshot() {
  return {
    isAdmin: true,
    canEditRevision: true,
    dirty: false,
    selection: { productCode: 'LGS001', color: 'black' },
    payload: {
      bom: {
        LGS001: {
          code: 'LGS001',
          colors: ['black'],
          color_info: { black: { sku: 'LGS001-B', materials: [] } },
        },
      },
      materialDb: {
        materials: {
          M1: {
            id: 'M1',
            code: 'M1',
            name: { zh: 'Old', vi: 'Old' },
            spec: { zh: '', vi: '' },
            material: { zh: '', vi: '' },
            color: { zh: '', vi: '' },
            attr: { zh: '零件', vi: 'linh kiện' },
            drawings: [],
            models3d: [],
          },
          M2: {
            id: 'M2',
            code: 'M2',
            name: { zh: 'Replacement', vi: 'Replacement' },
            spec: { zh: '', vi: '' },
            material: { zh: '', vi: '' },
            color: { zh: '', vi: '' },
            attr: { zh: '零件', vi: 'linh kiện' },
            drawings: [],
            models3d: [],
          },
        },
        bomEntries: [{
          id: 'entry-1',
          parentType: 'product',
          parentId: 'LGS001',
          productCode: 'LGS001',
          color: 'black',
          materialId: 'M1',
          comp_code: 'A',
          qty: '1',
          order: 0,
        }],
      },
    },
  };
}

test('mutation-engine: batch review follows allowlisted Admin material and BOM actions', () => {
  const snapshot = proposalSnapshot();
  const proposal = {
    summary: 'Update material and replace one BOM row',
    operations: [
      { operationType: 'update_material_field', targetId: 'M1', payload: { field: 'name_zh', value: 'Updated' } },
      { operationType: 'replace_bom_item', targetId: 'entry-1', payload: { materialId: 'M2' } },
    ],
  };

  const review = buildMutationProposalReview(snapshot, proposal);
  assert.equal(review.operations.length, 2);
  assert.deepEqual(review.operations.map(item => item.category), ['material', 'bom']);
  assert.deepEqual(review.operations.map(item => item.risk), ['low', 'high']);
  assert.equal(review.verification.valid, true);
  assert.equal(snapshot.payload.materialDb.materials.M1.name.zh, 'Old');

  const transaction = applyMutationProposalTransaction(snapshot, proposal);
  assert.equal(transaction.payload.materialDb.materials.M1.name.zh, 'Updated');
  assert.equal(transaction.payload.materialDb.bomEntries[0].materialId, 'M2');
});

test('mutation-engine: material asset references are validated and included in review diff', () => {
  const snapshot = proposalSnapshot();
  const transaction = applyMutationProposalTransaction(snapshot, {
    operations: [{
      operationType: 'update_material',
      targetId: 'M1',
      payload: {
        patch: {
          drawings: [{
            name: 'Drawing',
            url: 'https://example.com/m1.pdf',
          }],
          models3d: [{
            name: 'Model',
            url: 'https://example.com/m1.glb',
          }],
        },
      },
    }],
  });

  assert.equal(transaction.payload.materialDb.materials.M1.drawings[0].url, 'https://example.com/m1.pdf');
  assert.equal(transaction.payload.materialDb.materials.M1.models3d[0].url, 'https://example.com/m1.glb');
  assert.deepEqual(transaction.changes.map(change => change.field), ['drawings', 'models3d']);
});

test('mutation-engine: selected subset applies only selected proposal operations', () => {
  const snapshot = proposalSnapshot();
  const transaction = applyMutationProposalTransaction(snapshot, {
    operations: [
      { operationType: 'update_material_field', targetId: 'M1', payload: { field: 'name_zh', value: 'Updated' } },
    ],
  });

  assert.equal(transaction.payload.materialDb.materials.M1.name.zh, 'Updated');
  assert.equal(transaction.payload.materialDb.bomEntries[0].materialId, 'M1');
});

test('mutation-engine: arbitrary code actions and deletion of used materials fail closed', () => {
  const snapshot = proposalSnapshot();
  assert.throws(() => buildMutationProposalReview(snapshot, {
    operations: [{ operationType: 'execute_code', targetId: 'M1', payload: { code: 'delete everything' } }],
  }), /disallowed operationType/);
  assert.throws(() => buildMutationProposalReview(snapshot, {
    operations: [{ operationType: 'delete_material', targetId: 'M1', payload: {} }],
  }), /still used/i);
  assert.equal(snapshot.payload.materialDb.materials.M1.name.zh, 'Old');
  assert.equal(snapshot.payload.materialDb.bomEntries.length, 1);
});

test('mutation-engine: product creation and draft product editing follow Admin field patterns', () => {
  const snapshot = proposalSnapshot();
  const created = applyMutationProposalTransaction(snapshot, {
    operations: [{
      operationType: 'create_product',
      targetId: 'LGS002',
      payload: {
        name: { zh: '产品二', vi: 'Sản phẩm hai' },
        color: { zh: '黑色', vi: 'Đen' },
        size: '100x50x20mm',
        sku: 'lgs002-b',
      },
    }],
  });
  assert.equal(created.payload.bom.LGS002.color_info['黑色'].sku, 'LGS002-B');
  assert.equal(created.review.operations[0].category, 'product');

  const updated = applyMutationProposalTransaction(snapshot, {
    operations: [{
      operationType: 'update_product',
      targetId: 'LGS001',
      payload: {
        color: 'black',
        patch: { name: { zh: '新产品名称' }, size: '200mm', sku: 'lgs001-new' },
      },
    }],
  });
  assert.equal(updated.payload.bom.LGS001.color_info.black.name_zh, '新产品名称');
  assert.equal(updated.payload.bom.LGS001.color_info.black.sku, 'LGS001-NEW');
});

test('mutation-engine: revision lifecycle operations call the governed domain workflow', () => {
  const draftSnapshot = proposalSnapshot();
  draftSnapshot.payload.bom.LGS001.revision = 'V2';
  draftSnapshot.payload.productRevisions = {
    LGS001: {
      currentRevision: 'V2',
      effectiveRevision: 'V1',
      currentRevisionInfo: {
        sourceRevision: 'V1',
        workflowState: 'draft',
        createdAt: '2026-07-01T00:00:00.000Z',
        changeReason: 'test',
      },
      revisions: [],
      effectivityEvents: [],
    },
  };
  const released = applyMutationProposalTransaction(draftSnapshot, {
    operations: [{
      operationType: 'release_product_revision',
      targetId: 'LGS001',
      payload: { reason: 'Approved for production' },
    }],
  });
  assert.equal(released.payload.productRevisions.LGS001.currentRevisionInfo.workflowState, 'released');
  assert.equal(released.payload.productRevisions.LGS001.effectiveRevision, 'V2');
  assert.equal(released.review.operations[0].risk, 'high');

  const releasedSnapshot = {
    ...draftSnapshot,
    canEditRevision: false,
    payload: released.payload,
  };
  const withdrawn = applyMutationProposalTransaction(releasedSnapshot, {
    operations: [{
      operationType: 'withdraw_product_revision',
      targetId: 'LGS001',
      payload: { reason: 'Production issue' },
    }],
  });
  assert.equal(withdrawn.payload.productRevisions.LGS001.currentRevisionInfo.workflowState, 'draft');

  const nextRevision = applyMutationProposalTransaction(releasedSnapshot, {
    operations: [{
      operationType: 'create_product_revision',
      targetId: 'LGS001',
      payload: { revision: 'V3', changeReason: 'Next change' },
    }],
  });
  assert.equal(nextRevision.payload.productRevisions.LGS001.currentRevision, 'V3');
});

test('mutation-engine: parent-child structure actions are deterministic and cycle-safe', () => {
  const snapshot = proposalSnapshot();
  const added = applyMutationProposalTransaction(snapshot, {
    operations: [{
      operationType: 'add_material_child',
      targetId: 'M1',
      payload: { materialId: 'M2', quantity: 2 },
    }],
  });
  const relation = added.payload.materialDb.bomEntries.find(entry => entry.parentType === 'material');
  assert.equal(relation.parentId, 'M1');
  assert.equal(relation.childMaterialId, 'M2');
  assert.equal(added.review.operations[0].category, 'structure');

  const updatedSnapshot = { ...snapshot, payload: added.payload };
  const updated = applyMutationProposalTransaction(updatedSnapshot, {
    operations: [{
      operationType: 'update_material_child_quantity',
      targetId: 'M1',
      payload: { childId: 'M2', originalQuantity: 2, quantity: 4 },
    }],
  });
  assert.equal(updated.payload.materialDb.bomEntries.find(entry => entry.id === relation.id).qty, '4');

  assert.throws(() => buildMutationProposalReview(updatedSnapshot, {
    operations: [{
      operationType: 'add_material_child',
      targetId: 'M2',
      payload: { materialId: 'M1', quantity: 1 },
    }],
  }), /cycle/i);

  const removed = applyMutationProposalTransaction(updatedSnapshot, {
    operations: [{ operationType: 'remove_material_child', targetId: relation.id, payload: {} }],
  });
  assert.equal(removed.payload.materialDb.bomEntries.some(entry => entry.id === relation.id), false);
});
