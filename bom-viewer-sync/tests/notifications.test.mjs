import test from 'node:test';
import assert from 'node:assert/strict';
import { describePayloadChanges } from '../src/features/notifications.js';

test('describePayloadChanges detects product added', () => {
  const previous = { bom: {} };
  const next = { bom: { 'P1': {} } };
  const changes = describePayloadChanges(previous, next);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'product_added');
  assert.equal(changes[0].code, 'P1');
});

test('describePayloadChanges detects material added', () => {
  const previous = { materialDb: { materials: {} } };
  const next = { materialDb: { materials: { 'M1': { id: 'M1', code: 'C1' } } } };
  const changes = describePayloadChanges(previous, next);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'material_added');
  assert.equal(changes[0].code, 'C1');
});

test('describePayloadChanges detects material deleted', () => {
  const previous = { materialDb: { materials: { 'M1': { id: 'M1', code: 'C1' } } } };
  const next = { materialDb: { materials: {} } };
  const changes = describePayloadChanges(previous, next);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'material_deleted');
  assert.equal(changes[0].code, 'C1');
});

test('describePayloadChanges detects material modified', () => {
  const previous = { materialDb: { materials: { 'M1': { id: 'M1', code: 'C1', name: { zh: 'A' } } } } };
  const next = { materialDb: { materials: { 'M1': { id: 'M1', code: 'C2', name: { zh: 'B' } } } } };
  const changes = describePayloadChanges(previous, next);
  // Expect two changes: code and name
  assert.equal(changes.length, 2);
  const codeChange = changes.find(c => c.field === 'code');
  assert.equal(codeChange.before, 'C1');
  assert.equal(codeChange.after, 'C2');
  const nameChange = changes.find(c => c.field === 'name');
  assert.equal(nameChange.before, 'A');
  assert.equal(nameChange.after, 'B');
});

test('describePayloadChanges detects material unit modified', () => {
  const previous = { materialDb: { materials: { M1: { id: 'M1', code: 'M1', unit: 'pcs' } } } };
  const next = { materialDb: { materials: { M1: { id: 'M1', code: 'M1', unit: 'set' } } } };

  assert.deepEqual(describePayloadChanges(previous, next), [{
    kind: 'material', code: 'M1', field: 'unit', before: 'pcs', after: 'set'
  }]);
});

test('describePayloadChanges detects bom entry added', () => {
  const previous = { materialDb: { materials: { 'M1': { id: 'M1', code: 'C1' } }, bomEntries: [] } };
  const next = {
    materialDb: {
      materials: { 'M1': { id: 'M1', code: 'C1' } },
      bomEntries: [
        { id: 'E1', parentType: 'product', parentId: 'P1', materialId: 'M1', qty: '1' }
      ]
    }
  };
  const changes = describePayloadChanges(previous, next);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'bom_added');
  assert.equal(changes[0].code, 'P1');
  assert.equal(changes[0].field, 'C1');
});

test('describePayloadChanges detects bom entry qty changed', () => {
  const previous = {
    materialDb: {
      materials: { 'M1': { id: 'M1', code: 'C1' } },
      bomEntries: [
        { id: 'E1', parentType: 'product', parentId: 'P1', materialId: 'M1', qty: 0 }
      ]
    }
  };
  const next = {
    materialDb: {
      materials: { 'M1': { id: 'M1', code: 'C1' } },
      bomEntries: [
        { id: 'E1', parentType: 'product', parentId: 'P1', materialId: 'M1', qty: '2' }
      ]
    }
  };
  const changes = describePayloadChanges(previous, next);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'bom_qty_changed');
  assert.equal(changes[0].before, '0');
  assert.equal(changes[0].after, '2');
});

test('describePayloadChanges detects bom entry deleted through childMaterialId', () => {
  const materials = {
    'PARENT': { id: 'PARENT', code: 'P-CODE' },
    'CHILD': { id: 'CHILD', code: 'C-CODE' }
  };
  const previous = {
    materialDb: {
      materials,
      bomEntries: [
        { id: 'E1', parentType: 'material', parentId: 'PARENT', childMaterialId: 'CHILD', qty: '1' }
      ]
    }
  };
  const next = { materialDb: { materials, bomEntries: [] } };

  const changes = describePayloadChanges(previous, next);

  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'bom_deleted');
  assert.equal(changes[0].code, 'P-CODE');
  assert.equal(changes[0].field, 'C-CODE');
});
