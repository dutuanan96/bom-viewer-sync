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

test('describePayloadChanges returns all changes for paginated review', () => {
  const previous = { materialDb: { materials: {}, bomEntries: [] } };
  const next = { materialDb: { materials: {}, bomEntries: [] } };
  for (let index = 0; index < 12; index += 1) {
    previous.materialDb.materials[`M${index}`] = { id: `M${index}`, code: `M${index}`, spec: { zh: '60mm' } };
    next.materialDb.materials[`M${index}`] = { id: `M${index}`, code: `M${index}`, spec: { zh: '100mm' } };
  }
  assert.equal(describePayloadChanges(previous, next).length, 12);
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

test('describePayloadChanges detects material asset references modified', () => {
  const previous = {
    materialDb: {
      materials: {
        M1: {
          id: 'M1',
          code: 'M1',
          drawings: [{ name: 'Old', url: 'https://example.com/old.pdf' }],
          models3d: [],
        },
      },
    },
  };
  const next = structuredClone(previous);
  next.materialDb.materials.M1.drawings = [{
    name: 'Current',
    url: 'https://example.com/current.pdf',
  }];

  assert.deepEqual(describePayloadChanges(previous, next), [{
    kind: 'material',
    code: 'M1',
    field: 'drawings',
    before: 'Old|https://example.com/old.pdf',
    after: 'Current|https://example.com/current.pdf',
  }]);
});

test('describePayloadChanges detects product variant fields modified', () => {
  const previous = {
    bom: {
      LGS001: {
        color_info: {
          black: { sku: 'LGS001-OLD', name_zh: '旧名称', name_vi: 'Tên cũ', size: '100mm' },
        },
      },
    },
  };
  const next = structuredClone(previous);
  next.bom.LGS001.color_info.black.sku = 'LGS001-NEW';

  assert.deepEqual(describePayloadChanges(previous, next), [{
    kind: 'product',
    code: 'LGS001',
    field: 'black.sku',
    before: 'LGS001-OLD',
    after: 'LGS001-NEW',
  }]);
});

test('describePayloadChanges detects revision workflow modified', () => {
  const previous = {
    productRevisions: {
      LGS001: {
        currentRevision: 'V2',
        effectiveRevision: 'V1',
        currentRevisionInfo: { workflowState: 'draft' },
      },
    },
  };
  const next = structuredClone(previous);
  next.productRevisions.LGS001.effectiveRevision = 'V2';
  next.productRevisions.LGS001.currentRevisionInfo.workflowState = 'released';

  assert.deepEqual(describePayloadChanges(previous, next), [
    {
      kind: 'revision',
      code: 'LGS001',
      field: 'effectiveRevision',
      before: 'V1',
      after: 'V2',
    },
    {
      kind: 'revision',
      code: 'LGS001',
      field: 'workflowState',
      before: 'draft',
      after: 'released',
    },
  ]);
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

test('describePayloadChanges detects BOM component number changes', () => {
  const materials = { M1: { id: 'M1', code: 'C1' } };
  const previous = {
    materialDb: {
      materials,
      bomEntries: [
        { id: 'E1', parentType: 'product', parentId: 'P1', materialId: 'M1', comp_code: 'A', qty: '1' }
      ]
    }
  };
  const next = structuredClone(previous);
  next.materialDb.bomEntries[0].comp_code = 'B';

  assert.deepEqual(describePayloadChanges(previous, next), [{
    kind: 'bom_comp_code_changed',
    code: 'P1',
    field: 'C1',
    before: 'A',
    after: 'B'
  }]);
});

test('describePayloadChanges detects BOM material replacements', () => {
  const materials = {
    M1: { id: 'M1', code: 'OLD' },
    M2: { id: 'M2', code: 'NEW' }
  };
  const previous = {
    materialDb: {
      materials,
      bomEntries: [
        { id: 'E1', parentType: 'product', parentId: 'P1', materialId: 'M1', comp_code: 'A', qty: '1' }
      ]
    }
  };
  const next = structuredClone(previous);
  next.materialDb.bomEntries[0].materialId = 'M2';

  assert.deepEqual(describePayloadChanges(previous, next), [{
    kind: 'bom_material_changed',
    code: 'P1',
    field: '',
    before: 'OLD',
    after: 'NEW'
  }]);
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
