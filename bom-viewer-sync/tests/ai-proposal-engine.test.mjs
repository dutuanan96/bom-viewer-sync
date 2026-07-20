import { test } from 'node:test';
import assert from 'node:assert';
import {
  validateProposalContext,
  applyProposalToPayload,
  computeProposalDiff,
  createProposalPreview,
  applyApprovedProposal,
} from '../src/features/ai-assistant/proposal-engine.js';
import { ERROR_CODES } from '../src/features/ai-assistant/contracts.js';

test('AI cannot propose a change against a released or historical revision', () => {
  const snapshot = {
    isAdmin: true,
    dirty: false,
    selection: { revision: 'A.1' }, // Released revision
    payload: { materialDb: { materials: { MAT1: { spec: 'old' } } } }
  };

  const proposal = {
    operationType: 'update_material_field',
    targetId: 'MAT1',
    payload: { field: 'spec', value: 'new' }
  };

  assert.throws(
    () => validateProposalContext(snapshot, proposal),
    (err) => err.code === ERROR_CODES.AI_POLICY_BLOCKED && err.message.includes('Draft revision')
  );
});

test('AI cannot propose a change if not in Admin mode', () => {
  const snapshot = {
    isAdmin: false,
    dirty: false,
    selection: { revision: 'draft' },
    payload: { materialDb: { materials: { MAT1: { spec: 'old' } } } }
  };

  const proposal = {
    operationType: 'update_material_field',
    targetId: 'MAT1',
    payload: { field: 'spec', value: 'new' }
  };

  assert.throws(
    () => validateProposalContext(snapshot, proposal),
    (err) => err.code === ERROR_CODES.AI_POLICY_BLOCKED && err.message.includes('Admin mode')
  );
});

test('AI cannot propose a change if there are unsaved human edits', () => {
  const snapshot = {
    isAdmin: true,
    dirty: true,
    selection: { revision: 'draft' },
    payload: { materialDb: { materials: { MAT1: { spec: 'old' } } } }
  };

  const proposal = {
    operationType: 'update_material_field',
    targetId: 'MAT1',
    payload: { field: 'spec', value: 'new' }
  };

  assert.throws(
    () => validateProposalContext(snapshot, proposal),
    (err) => err.code === ERROR_CODES.AI_POLICY_BLOCKED && err.message.includes('unsaved human edits')
  );
});

test('applyProposalToPayload correctly updates allowed material fields', () => {
  const payload = { materialDb: { materials: { MAT1: { spec: { zh: 'old' }, name: { zh: 'old_zh' } } } } };

  const proposal = {
    operationType: 'update_material_field',
    targetId: 'MAT1',
    payload: { field: 'spec', value: 'new' }
  };

  applyProposalToPayload(payload, proposal);
  assert.strictEqual(payload.materialDb.materials.MAT1.spec.zh, 'new');
});

test('applyProposalToPayload rejects unallowed material fields', () => {
  const payload = { materialDb: { materials: { MAT1: { internal_id: 'old' } } } };

  const proposal = {
    operationType: 'update_material_field',
    targetId: 'MAT1',
    payload: { field: 'internal_id', value: 'new' }
  };

  assert.throws(
    () => applyProposalToPayload(payload, proposal),
    /not allowed to be updated/
  );
});

test('applyProposalToPayload correctly updates BOM quantity', () => {
  const payload = {
    bom: {
      PROD1: {
        color_info: {
          'black': {
            materials: [
              { mat_code: 'MAT1', qty: '1', materials: [] }
            ]
          }
        }
      }
    }
  };

  const proposal = {
    operationType: 'update_bom_quantity',
    targetId: 'PROD1',
    payload: { color: 'black', childId: 'MAT1', quantity: 5 }
  };

  applyProposalToPayload(payload, proposal);
  assert.strictEqual(payload.bom.PROD1.color_info['black'].materials[0].qty, '5');
});

test('applyProposalToPayload correctly updates nested BOM quantity', () => {
  const payload = {
    bom: {
      PROD1: {
        color_info: {
          'black': {
            materials: [
              { mat_code: 'MAT_PARENT', qty: '1', materials: [
                  { mat_code: 'MAT_CHILD', qty: '2' }
              ] }
            ]
          }
        }
      }
    }
  };

  const proposal = {
    operationType: 'update_bom_quantity',
    targetId: 'PROD1',
    payload: { color: 'black', childId: 'MAT_CHILD', quantity: 10 }
  };

  applyProposalToPayload(payload, proposal);
  assert.strictEqual(payload.bom.PROD1.color_info['black'].materials[0].materials[0].qty, '10');
});

test('computeProposalDiff returns correct changes array', () => {
  const snapshot = {
    isAdmin: true,
    dirty: false,
    canEditRevision: true,
    selection: { revision: 'draft' },
    payload: { materialDb: { materials: { MAT1: { id: 'MAT1', code: 'MAT1', spec: { zh: 'old' } } } } }
  };

  const proposal = {
    operationType: 'update_material_field',
    targetId: 'MAT1',
    payload: { field: 'spec', value: 'new' }
  };

  const changes = computeProposalDiff(snapshot, proposal);
  assert.strictEqual(changes.length, 1);
  assert.strictEqual(changes[0].kind, 'material');
  assert.strictEqual(changes[0].code, 'MAT1');
  assert.strictEqual(changes[0].field, 'spec');
  assert.strictEqual(changes[0].before, 'old');
  assert.strictEqual(changes[0].after, 'new');
});

test('R4/R5: approval is bound to source, selection, and exact payload', () => {
  const snapshot = {
    isAdmin: true,
    dirty: false,
    canEditRevision: true,
    sourceMetadata: { commitSha: 'a'.repeat(40) },
    selection: { productCode: 'PROD1', color: 'black', revision: 'V4.1' },
    payload: { materialDb: { materials: { MAT1: { id: 'MAT1', code: 'MAT1', unit: 'pcs' } } } },
  };
  const proposal = {
    operationType: 'update_material_field',
    targetId: 'MAT1',
    payload: { field: 'unit', value: 'set' },
  };
  const preview = createProposalPreview(snapshot, proposal);
  assert.equal(applyApprovedProposal(snapshot, preview).payload.materialDb.materials.MAT1.unit, 'set');

  assert.throws(
    () => applyApprovedProposal({ ...snapshot, sourceMetadata: { commitSha: 'b'.repeat(40) } }, preview),
    /stale|source/i,
  );
  assert.throws(
    () => applyApprovedProposal({ ...snapshot, selection: { ...snapshot.selection, color: 'white' } }, preview),
    /stale|selection/i,
  );
  const changedPayload = structuredClone(snapshot.payload);
  changedPayload.materialDb.materials.MAT1.unit = 'box';
  assert.throws(
    () => applyApprovedProposal({ ...snapshot, payload: changedPayload }, preview),
    /stale|payload/i,
  );
});

test('R4/R5: apply re-runs Admin, clean-state, and Draft checks', () => {
  const snapshot = {
    isAdmin: true,
    dirty: false,
    canEditRevision: true,
    sourceMetadata: { commitSha: 'a'.repeat(40) },
    selection: { productCode: 'PROD1', revision: 'V4.1' },
    payload: { materialDb: { materials: { MAT1: { id: 'MAT1', code: 'MAT1', unit: 'pcs' } } } },
  };
  const preview = createProposalPreview(snapshot, {
    operationType: 'update_material_field', targetId: 'MAT1', payload: { field: 'unit', value: 'set' },
  });
  assert.throws(() => applyApprovedProposal({ ...snapshot, dirty: true }, preview), /unsaved/i);
  assert.throws(() => applyApprovedProposal({ ...snapshot, canEditRevision: false }, preview), /Draft/i);
});

test('R4: preview rejects a no-op proposal', () => {
  const snapshot = {
    isAdmin: true,
    dirty: false,
    canEditRevision: true,
    sourceMetadata: { commitSha: 'a'.repeat(40) },
    selection: { productCode: 'PROD1', revision: 'V4.1' },
    payload: { materialDb: { materials: { MAT1: { id: 'MAT1', code: 'MAT1', unit: 'pcs' } } } },
  };

  assert.throws(() => createProposalPreview(snapshot, {
    operationType: 'update_material_field', targetId: 'MAT1', payload: { field: 'unit', value: 'pcs' },
  }), /no changes/i);
});

test('R4/R5: BOM proposal target must match the selected product and color', () => {
  const snapshot = {
    isAdmin: true,
    dirty: false,
    canEditRevision: true,
    sourceMetadata: { commitSha: 'a'.repeat(40) },
    selection: { productCode: 'PROD1', color: 'black', revision: 'V4.1' },
    payload: {
      bom: { PROD2: { color_info: { white: { materials: [{ mat_code: 'MAT1', qty: '1' }] } } } },
    },
  };

  assert.throws(() => createProposalPreview(snapshot, {
    operationType: 'update_bom_quantity',
    targetId: 'PROD2',
    payload: { color: 'white', childId: 'MAT1', quantity: 2 },
  }), /selected product|selection/i);
});

test('R4/R5: BOM quantity proposal updates canonical entries and produces an exact diff', () => {
  const snapshot = {
    isAdmin: true,
    dirty: false,
    canEditRevision: true,
    sourceMetadata: { commitSha: 'a'.repeat(40) },
    selection: { productCode: 'PROD1', color: 'black', revision: 'V4.1' },
    payload: {
      bom: { PROD1: { code: 'PROD1', colors: ['black'], color_info: { black: { materials: [{ mat_code: 'MAT1', qty: '1' }] } } } },
      materialDb: {
        materials: { material_1: { id: 'material_1', code: 'MAT1' } },
        bomEntries: [{ id: 'entry_1', parentType: 'product', parentId: 'PROD1', productCode: 'PROD1', color: 'black', materialId: 'material_1', qty: '1' }],
      },
    },
  };
  const preview = createProposalPreview(snapshot, {
    operationType: 'update_bom_quantity',
    targetId: 'PROD1',
    payload: { color: 'black', childId: 'MAT1', quantity: 5 },
  });

  assert.deepEqual(preview.changes, [{ kind: 'bom_qty_changed', code: 'PROD1', field: 'MAT1', before: '1', after: '5' }]);
  const applied = applyApprovedProposal(snapshot, preview);
  assert.equal(applied.payload.materialDb.bomEntries[0].qty, '5');
  assert.equal(applied.payload.bom.PROD1.color_info.black.materials[0].qty, '5');
});
