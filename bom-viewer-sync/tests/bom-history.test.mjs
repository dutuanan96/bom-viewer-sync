import test from 'node:test';
import assert from 'node:assert/strict';
import { appendBomHistory, normalizeBomHistory } from '../src/features/bom-history.js';

test('BOM history appends immutable per-product save details', () => {
  const previous = {
    bom: { LGS333: { code: 'LGS333', revision: 'V4', color_info: { Black: { sku: 'LGS333ZK' } } } },
    materialDb: { materials: {}, bomEntries: [] },
  };
  const payload = structuredClone(previous);
  payload.productRevisions = { LGS333: { currentRevision: 'V4', currentRevisionInfo: { workflowState: 'draft' } } };
  appendBomHistory(payload, previous, [{
    kind: 'bom_qty_changed', code: 'LGS333ZK', field: 'MAT-1', before: '1', after: '2',
  }], { createdAt: '2026-08-08T00:00:00.000Z', actor: 'admin' });

  assert.equal(payload.bomHistory.LGS333.length, 1);
  assert.equal(payload.bomHistory.LGS333[0].revision, 'V4');
  assert.deepEqual(payload.bomHistory.LGS333[0].changes[0], {
    kind: 'bom_qty_changed', code: 'LGS333ZK', field: 'MAT-1', before: '1', after: '2',
  });
  assert.deepEqual(normalizeBomHistory(payload.bomHistory), payload.bomHistory);
});

test('BOM history attributes nested material changes to every containing product', () => {
  const previous = {
    bom: { P1: { revision: 'V2' }, P2: { revision: 'V3' } },
    productRevisions: {
      P1: { currentRevision: 'V2' },
      P2: { currentRevision: 'V3' },
    },
    materialDb: {
      materials: {
        assembly: { id: 'assembly', code: 'ASM-1' },
        child: { id: 'child', code: 'MAT-1' },
      },
      bomEntries: [
        { id: 'p1-assembly', parentType: 'product', parentId: 'P1', childMaterialId: 'assembly' },
        { id: 'p2-assembly', parentType: 'product', parentId: 'P2', childMaterialId: 'assembly' },
        { id: 'assembly-child', parentType: 'material', parentId: 'assembly', childMaterialId: 'child' },
      ],
    },
  };
  const payload = structuredClone(previous);

  appendBomHistory(payload, previous, [{
    kind: 'material', code: 'MAT-1', field: 'spec', before: '60mm', after: '100mm',
  }], { createdAt: '2026-08-08T01:00:00.000Z' });

  assert.equal(payload.bomHistory.P1[0].changes[0].code, 'MAT-1');
  assert.equal(payload.bomHistory.P2[0].changes[0].code, 'MAT-1');
});
