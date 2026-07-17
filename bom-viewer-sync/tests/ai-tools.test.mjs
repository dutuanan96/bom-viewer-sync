import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTool } from '../src/features/ai-assistant/tools.js';

test('executeTool search_products returns deterministic results', async () => {
  const snapshot = {
    payload: {
      bom: {
        LGS433: { id: 'LGS433', name: 'Product A', colors: ['S', 'B'] },
        LGS101: { id: 'LGS101', name: 'Product B', colors: ['G'] }
      }
    }
  };

  const result = await executeTool('search_products', { query: 'Product' }, snapshot);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'LGS101'); // sorted by id
});

test('executeTool get_product returns product by id', async () => {
  const snapshot = { payload: { bom: { P1: { id: 'P1' } } } };
  const result = await executeTool('get_product', { productId: 'P1' }, snapshot);
  assert.equal(result.id, 'P1');
  await assert.rejects(executeTool('get_product', { productId: 'P2' }, snapshot), /Not found/);
});

test('executeTool resolve_sku handles exact alias', async () => {
  const snapshot = {
    payload: {
      bom: {
        LGS433: {
          id: 'LGS433',
          materials: [{ comp_code: 'BH02S' }]
        }
      }
    }
  };
  const result = await executeTool('resolve_sku', { alias: 'ULGS433BH02S' }, snapshot);
  assert.equal(result.internalSku, 'LGS433BH02S');
});

test('executeTool get_bom returns sorted tree', async () => {
  const snapshot = {
    payload: {
      bom: {
        P1: { id: 'P1', colors: ['C1'], materials: [{ comp_code: 'M1', name: 'Z' }, { comp_code: 'M2', name: 'A' }] }
      },
      materialDb: { materials: {}, bomEntries: [] }
    }
  };
  const result = await executeTool('get_bom', { productId: 'P1', color: 'C1' }, snapshot);
  assert.ok(Array.isArray(result.rows));
});
test('executeTool get_material returns material by id', async () => {
  const snapshot = {
    payload: { materialDb: { materials: { M1: { mat_code: 'M1' } } } }
  };
  const result = await executeTool('get_material', { materialId: 'M1' }, snapshot);
  assert.equal(result.mat_code, 'M1');
});

test('executeTool where_used returns usage', async () => {
  const snapshot = {
    payload: {
      bom: {
        P1: { id: 'P1', colors: ['C1'], materials: [{ comp_code: 'M1' }] }
      },
      materialDb: { materials: {}, bomEntries: [] }
    }
  };
  const result = await executeTool('where_used', { materialId: 'M1' }, snapshot);
  assert.ok(Array.isArray(result));
});

test('executeTool get_revision_history returns revisions', async () => {
  const snapshot = {
    payload: {
      productRevisions: {
        P1: [{ revision: 'V1', workflowState: 'released' }]
      }
    }
  };
  const result = await executeTool('get_revision_history', { productId: 'P1' }, snapshot);
  assert.equal(result.length, 1);
  assert.equal(result[0].revision, 'V1');
});

test('executeTool audit_product_data returns audit', async () => {
  const snapshot = {
    payload: {
      bom: {
        P1: { id: 'P1', materials: [] }
      }
    }
  };
  const result = await executeTool('audit_product_data', { productId: 'P1' }, snapshot);
  assert.ok(result);
});
