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
  assert.deepEqual(review.operations.map(item => item.sourceIndex), [0, 1]);
  assert.deepEqual(review.operations.map(item => item.category), ['material', 'bom']);
  assert.deepEqual(review.operations.map(item => item.risk), ['low', 'high']);
  assert.equal(review.verification.valid, true);
  assert.equal(snapshot.payload.materialDb.materials.M1.name.zh, 'Old');

  const transaction = applyMutationProposalTransaction(snapshot, proposal);
  assert.equal(transaction.payload.materialDb.materials.M1.name.zh, 'Updated');
  assert.equal(transaction.payload.materialDb.bomEntries[0].materialId, 'M2');
});

test('mutation-engine: consolidates exact duplicate materials atomically without deleting source records', () => {
  const snapshot = proposalSnapshot();
  snapshot.payload.productRevisions = {
    LGS001: {
      currentRevision: 'V1.1',
      currentRevisionInfo: { sourceRevision: 'V1', workflowState: 'draft' },
      revisions: [],
    },
  };
  const duplicate = {
    name: { zh: '\u7eb8\u5361', vi: 'gi\u1ea5y l\u00f3t' },
    spec: { zh: '\u5355\u74e61100x100mm', vi: 's\u00f3ng \u0111\u01a1n 1100x100mm' },
    material: { zh: '\u74e6\u695e\u7eb8\u5355\u74e6', vi: 'gi\u1ea5y carton s\u00f3ng \u0111\u01a1n' },
    color: { zh: '\u7eb8\u8272', vi: 'm\u00e0u gi\u1ea5y' },
    attr: { zh: '\u5305\u6750', vi: 'v\u1eadt li\u1ec7u \u0111\u00f3ng g\u00f3i' },
    drawings: [],
    models3d: [],
  };
  snapshot.payload.materialDb.materials.S1 = { id: 'S1', code: 'LGS031ZK', ...structuredClone(duplicate) };
  snapshot.payload.materialDb.materials.S2 = { id: 'S2', code: 'LGS032ZK', ...structuredClone(duplicate) };
  snapshot.payload.materialDb.bomEntries[0].materialId = 'S1';
  snapshot.payload.materialDb.bomEntries.push({
    id: 'entry-2', parentType: 'material', parentId: 'M2', productCode: '', color: '',
    materialId: 'S2', childMaterialId: 'S2', comp_code: '', qty: '3', order: 0,
  });

  const proposal = {
    operations: [{
      operationType: 'consolidate_materials',
      targetId: 'mat_zk1100100',
      payload: {
        material: { code: 'ZK1100100', ...structuredClone(duplicate) },
        sourceMaterialIds: ['S1', 'S2'],
      },
    }],
  };
  const transaction = applyMutationProposalTransaction(snapshot, proposal);

  assert.equal(transaction.payload.materialDb.materials.mat_zk1100100.code, 'ZK1100100');
  assert.equal(transaction.payload.materialDb.materials.S1.code, 'LGS031ZK');
  assert.equal(transaction.payload.materialDb.materials.S2.code, 'LGS032ZK');
  assert.equal(transaction.payload.materialDb.bomEntries[0].materialId, 'mat_zk1100100');
  assert.equal(transaction.payload.materialDb.bomEntries[1].materialId, 'mat_zk1100100');
  assert.equal(transaction.payload.materialDb.bomEntries[1].childMaterialId, 'mat_zk1100100');
  assert.equal(transaction.payload.materialDb.bomEntries[1].qty, '3');
  assert.equal(transaction.review.operations[0].risk, 'high');
});

test('mutation-engine: does not offer a conflicting duplicate swap while a planned consolidation owns the source material', () => {
  const snapshot = proposalSnapshot();
  snapshot.payload.materialDb.materials.M1.spec = { zh: 'Old spec', vi: 'Old spec' };
  snapshot.payload.materialDb.materials.M2.name = { zh: 'Old', vi: 'Old' };
  snapshot.payload.materialDb.materials.M2.spec = { zh: 'Standard spec', vi: 'Standard spec' };
  snapshot.payload.productRevisions = {
    LGS001: { currentRevision: 'V1', currentRevisionInfo: { workflowState: 'draft' }, revisions: [] },
  };

  const review = buildMutationProposalReview(snapshot, {
    operations: [
      {
        operationType: 'update_material',
        targetId: 'M1',
        payload: { patch: { spec: { zh: 'Standard spec', vi: 'Standard spec' } } },
      },
      {
        operationType: 'consolidate_materials',
        targetId: 'mat_standard_spec',
        payload: {
          material: {
            code: 'STANDARD-SPEC',
            name: { zh: 'Old', vi: 'Old' },
            spec: { zh: 'Standard spec', vi: 'Standard spec' },
            material: { zh: '', vi: '' },
            color: { zh: '', vi: '' },
            attr: { zh: '零件', vi: 'linh kiện' },
          },
          sourceMaterialIds: ['M1', 'M2'],
        },
      },
    ],
  });

  const normalization = review.operations.find(operation => operation.mutation.targetId === 'M1');
  assert.ok(normalization);
  assert.equal(normalization.warnings.some(warning => warning?.action?.type === 'swap'), false);
});

test('mutation-engine: consolidation validates affected drafts independently of the selected product', () => {
  const snapshot = proposalSnapshot();
  snapshot.canEditRevision = false;
  snapshot.payload.bom.LGS002 = {
    code: 'LGS002',
    revision: 'V2',
    colors: ['black'],
    color_info: { black: { sku: 'LGS002-B', materials: [] } },
  };
  snapshot.payload.productRevisions = {
    LGS001: { currentRevision: 'V1', currentRevisionInfo: { workflowState: 'released' }, revisions: [] },
    LGS002: { currentRevision: 'V2', currentRevisionInfo: { workflowState: 'released' }, revisions: [] },
  };
  const duplicate = {
    name: { zh: '\u7eb8\u5361', vi: 'gi\u1ea5y l\u00f3t' },
    spec: { zh: '\u5355\u74e61100x100mm', vi: 's\u00f3ng \u0111\u01a1n 1100x100mm' },
    material: { zh: '\u74e6\u695e\u7eb8\u5355\u74e6', vi: 'carton' },
    color: { zh: '\u7eb8\u8272', vi: 'm\u00e0u gi\u1ea5y' },
    attr: { zh: '\u5305\u6750', vi: 'bao b\u00ec' },
    drawings: [],
    models3d: [],
  };
  snapshot.payload.materialDb.materials.S1 = { id: 'S1', code: 'LGS031ZK', ...structuredClone(duplicate) };
  snapshot.payload.materialDb.materials.S2 = { id: 'S2', code: 'LGS032ZK', ...structuredClone(duplicate) };
  snapshot.payload.materialDb.bomEntries.push({
    id: 'entry-lgs002',
    parentType: 'product',
    parentId: 'LGS002',
    productCode: 'LGS002',
    color: 'black',
    materialId: 'S1',
    comp_code: 'ZK',
    qty: '1',
    order: 0,
  });

  const review = buildMutationProposalReview(snapshot, {
    operations: [
      {
        operationType: 'create_product_revision',
        targetId: 'LGS002',
        payload: { revision: 'V2.1', changeReason: 'Consolidate duplicate material' },
      },
      {
        operationType: 'consolidate_materials',
        targetId: 'mat_zk1100100',
        payload: {
          material: { code: 'ZK1100100', ...structuredClone(duplicate) },
          sourceMaterialIds: ['S1', 'S2'],
        },
      },
    ],
  });

  assert.deepEqual(review.operations.map(item => item.mutation.operationType), [
    'create_product_revision',
    'consolidate_materials',
  ]);
});

test('mutation-engine: cross-product BOM replacement reads canonical draft workflow state', () => {
  const snapshot = proposalSnapshot();
  snapshot.payload.bom.LGS002 = {
    code: 'LGS002',
    colors: ['black'],
    color_info: { black: { sku: 'LGS002-B', materials: [] } },
  };
  snapshot.payload.materialDb.bomEntries.push({
    id: 'entry-2',
    parentType: 'product',
    parentId: 'LGS002',
    productCode: 'LGS002',
    color: 'black',
    materialId: 'M1',
    comp_code: 'A',
    qty: '1',
    order: 0,
  });
  snapshot.payload.productRevisions = {
    LGS002: {
      currentRevision: 'V2.1',
      currentRevisionInfo: { sourceRevision: 'V2', workflowState: 'draft' },
      revisions: [],
    },
  };

  const proposal = {
    operations: [{ operationType: 'replace_bom_item', targetId: 'entry-2', payload: { materialId: 'M2' } }],
  };
  const review = buildMutationProposalReview(snapshot, proposal);
  assert.equal(review.operations.length, 1);

  snapshot.payload.productRevisions.LGS002.currentRevisionInfo.workflowState = 'released';
  assert.throws(
    () => buildMutationProposalReview(snapshot, proposal),
    /require a draft revision/i,
  );
});

test('mutation-engine: create material enriches unique bilingual values without overriding model input', () => {
  const snapshot = proposalSnapshot();
  snapshot.payload.materialDb.materials.M3 = {
    id: 'M3',
    code: 'PAPER-BASE',
    name: { zh: '纸卡', vi: 'Giấy lót' },
    spec: { zh: '', vi: '' },
    material: { zh: '瓦楞纸', vi: 'Giấy carton' },
    color: { zh: '纸色', vi: 'Màu giấy' },
    attr: { zh: '包材', vi: 'Vật liệu đóng gói' },
    drawings: [],
    models3d: [],
  };
  const proposal = {
    operations: [{
      operationType: 'create_material',
      targetId: 'M4',
      payload: {
        material: {
          code: 'PAPER-NEW',
          name: { zh: '纸卡' },
          material: { zh: '瓦楞纸' },
          color: { zh: '纸色', vi: 'Admin color' },
          attr: { vi: 'Vật liệu đóng gói' },
        },
      },
    }],
  };

  const review = buildMutationProposalReview(snapshot, proposal);
  const enriched = review.operations[0].mutation.payload.material;
  assert.equal(enriched.name.vi, 'Giấy lót');
  assert.equal(enriched.material.vi, 'Giấy carton');
  assert.equal(enriched.attr.zh, '包材');
  assert.equal(enriched.color.vi, 'Admin color');
  assert.match(review.operations[0].warnings.join(' '), /name\.vi auto-filled/);
  assert.match(review.operations[0].warnings.join(' '), /color conflicts/);
  assert.equal(proposal.operations[0].payload.material.name.vi, undefined);

  const transaction = applyMutationProposalTransaction(snapshot, proposal);
  assert.equal(transaction.payload.materialDb.materials.M4.name.vi, 'Giấy lót');
  assert.equal(transaction.payload.materialDb.materials.M4.code, 'PAPER-NEW');
});

test('mutation-engine: ambiguous or unknown bilingual values are not invented', () => {
  const snapshot = proposalSnapshot();
  snapshot.payload.materialDb.materials.M3 = {
    id: 'M3',
    code: 'PAPER-A',
    name: { zh: '纸卡', vi: 'Giấy lót' },
    spec: { zh: '', vi: '' },
    material: { zh: '', vi: '' },
    color: { zh: '', vi: '' },
    attr: { zh: '零件', vi: 'linh kiện' },
    drawings: [],
    models3d: [],
  };
  snapshot.payload.materialDb.materials.M4 = {
    ...structuredClone(snapshot.payload.materialDb.materials.M3),
    id: 'M4',
    code: 'PAPER-B',
    name: { zh: '纸卡', vi: 'Thẻ giấy' },
  };
  const review = buildMutationProposalReview(snapshot, {
    operations: [{
      operationType: 'create_material',
      targetId: 'M5',
      payload: {
        material: {
          code: 'PAPER-C',
          name: { zh: '纸卡' },
          material: { zh: '未知材质' },
        },
      },
    }],
  });

  const material = review.operations[0].mutation.payload.material;
  assert.equal(material.name.vi, undefined);
  assert.equal(material.material.vi, undefined);
  assert.match(review.operations[0].warnings.join(' '), /multiple bilingual mappings/);
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

test('mutation-engine: creates a draft before replacing BOM material in another released product', () => {
  const snapshot = proposalSnapshot();
  snapshot.payload.bom.LGS002 = {
    code: 'LGS002',
    colors: ['black'],
    color_info: { black: { sku: 'P2-B', materials: [] } },
    revision: 'V2',
  };
  snapshot.payload.materialDb.bomEntries.push({
    id: 'entry-p2',
    parentType: 'product',
    parentId: 'LGS002',
    productCode: 'LGS002',
    color: 'black',
    materialId: 'M1',
    comp_code: 'A',
    qty: '1',
    order: 0,
  });
  snapshot.payload.productRevisions = {
    LGS002: { currentRevision: 'V2', currentRevisionInfo: { workflowState: 'released' }, revisions: [] },
  };

  const transaction = applyMutationProposalTransaction(snapshot, {
    operations: [
      {
        operationType: 'create_product_revision',
        targetId: 'LGS002',
        payload: { revision: 'V2.1', changeReason: 'Replace duplicate material' },
      },
      { operationType: 'replace_bom_item', targetId: 'entry-p2', payload: { materialId: 'M2' } },
    ],
  });

  assert.equal(transaction.payload.productRevisions.LGS002.currentRevision, 'V2.1');
  assert.equal(transaction.payload.productRevisions.LGS002.currentRevisionInfo.workflowState, 'draft');
  assert.equal(transaction.payload.materialDb.bomEntries.find(entry => entry.id === 'entry-p2').materialId, 'M2');
});

test('mutation-engine: withdraws a released revision before replacing BOM material in another product', () => {
  const snapshot = proposalSnapshot();
  snapshot.payload.bom.LGS002 = {
    code: 'LGS002',
    colors: ['black'],
    color_info: { black: { sku: 'LGS002-B', materials: [] } },
    revision: 'V2',
  };
  snapshot.payload.materialDb.bomEntries.push({
    id: 'entry-p2-withdraw',
    parentType: 'product',
    parentId: 'LGS002',
    productCode: 'LGS002',
    color: 'black',
    materialId: 'M1',
    comp_code: 'A',
    qty: '1',
    order: 0,
  });
  snapshot.payload.productRevisions = {
    LGS002: { currentRevision: 'V2', currentRevisionInfo: { workflowState: 'released' }, revisions: [] },
  };

  const transaction = applyMutationProposalTransaction(snapshot, {
    operations: [
      {
        operationType: 'withdraw_product_revision',
        targetId: 'LGS002',
        payload: { reason: 'Correct published BOM' },
      },
      { operationType: 'replace_bom_item', targetId: 'entry-p2-withdraw', payload: { materialId: 'M2' } },
    ],
  });

  assert.equal(transaction.payload.productRevisions.LGS002.currentRevisionInfo.workflowState, 'draft');
  assert.equal(transaction.payload.materialDb.bomEntries.find(entry => entry.id === 'entry-p2-withdraw').materialId, 'M2');
  assert.equal(transaction.review.operations[0].risk, 'high');
});

test('mutation-engine: parent-child structure actions are deterministic and cycle-safe', () => {
  const snapshot = proposalSnapshot();
  const added = applyMutationProposalTransaction(snapshot, {
    operations: [{
      operationType: 'add_material_child',
      targetId: 'M1',
      payload: { materialId: 'M2', quantity: 0.25 },
    }],
  });
  const relation = added.payload.materialDb.bomEntries.find(entry => entry.parentType === 'material');
  assert.equal(relation.parentId, 'M1');
  assert.equal(relation.childMaterialId, 'M2');
  assert.equal(relation.qty, '0.25');
  assert.equal(added.review.operations[0].category, 'structure');

  const updatedSnapshot = { ...snapshot, payload: added.payload };
  const updated = applyMutationProposalTransaction(updatedSnapshot, {
    operations: [{
      operationType: 'update_material_child_quantity',
      targetId: 'M1',
      payload: { childId: 'M2', originalQuantity: 0.25, quantity: 0.5 },
    }],
  });
  assert.equal(updated.payload.materialDb.bomEntries.find(entry => entry.id === relation.id).qty, '0.5');

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

test('mutation-engine: hardware items use scoped hardware-pack relations only', () => {
  const snapshot = proposalSnapshot();
  snapshot.payload.bom.LGS001.colors.push('white');
  snapshot.payload.bom.LGS001.color_info.white = { sku: 'LGS001-W', materials: [] };
  snapshot.payload.materialDb.materials.PACK = {
    id: 'PACK',
    code: 'LGS001WJBBH',
    name: { zh: 'LGS001五金包' },
    attr: { zh: '零件' },
  };
  snapshot.payload.materialDb.materials.HW = {
    id: 'HW',
    code: 'SCREW',
    name: { zh: '螺丝' },
    attr: { zh: '五金包' },
  };
  snapshot.payload.materialDb.bomEntries.push(
    { id: 'pack-black', parentType: 'product', parentId: 'LGS001', productCode: 'LGS001', color: 'black', materialId: 'PACK', qty: '1' },
    { id: 'pack-white', parentType: 'product', parentId: 'LGS001', productCode: 'LGS001', color: 'white', materialId: 'PACK', qty: '1' },
  );

  assert.throws(() => applyMutationProposalTransaction(snapshot, {
    operations: [{
      operationType: 'add_bom_item',
      targetId: 'LGS001',
      payload: { color: 'black', materialId: 'HW', comp_code: '1', quantity: 2 },
    }],
  }), /hardware-pack parent/i);

  const transaction = applyMutationProposalTransaction(snapshot, {
    operations: [{
      operationType: 'add_material_child',
      targetId: 'PACK',
      payload: { materialId: 'HW', quantity: 2 },
    }],
  });
  const relations = transaction.payload.materialDb.bomEntries.filter((entry) => (
    entry.parentType === 'material' && entry.parentId === 'PACK' && entry.childMaterialId === 'HW'
  ));
  assert.deepEqual(relations.map((entry) => `${entry.productCode}/${entry.color}`).sort(), ['LGS001/black', 'LGS001/white']);
});
