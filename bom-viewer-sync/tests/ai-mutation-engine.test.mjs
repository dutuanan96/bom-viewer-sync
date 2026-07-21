import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMutationTransaction, computeMutationDiff } from '../src/features/ai-assistant/mutation-engine.js';
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
