import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFootReplacementOperations,
  buildFootReplacementProposalBatches,
} from '../src/features/ecn-proposal/foot-replacement-proposal-builder.js';

const products = ['LGS133', 'LGS233', 'LGS334', 'LGS434'];
const oldCodes = ['ZJG150654BH', 'ZJG150654WH', 'ZJG15065423BH', 'ZJG15065423WH'];

function createPayload() {
  const materials = {};
  for (const code of [...oldCodes, 'ZJG150641BH', 'ZJG150641WH', 'ZJG15064123BH', 'ZJG15064123WH']) {
    materials[code] = { id: `id-${code}`, code };
  }

  const bomEntries = [
    ['LGS133', 'ZJG15065423BH'], ['LGS133', 'ZJG15065423BH'],
    ['LGS233', 'ZJG15065423BH'], ['LGS233', 'ZJG15065423WH'],
    ['LGS233', 'ZJG15065423BH'], ['LGS233', 'ZJG15065423BH'],
    ['LGS334', 'ZJG150654BH'], ['LGS334', 'ZJG150654BH'],
    ['LGS434', 'ZJG150654WH'], ['LGS434', 'ZJG150654BH'],
  ].map(([productCode, code], index) => ({
    id: `entry-${index}`,
    parentType: 'product',
    productCode,
    materialId: `id-${code}`,
  }));

  return {
    productRevisions: Object.fromEntries(products.map((code) => [code, {
      currentRevision: code === 'LGS434' ? 'V5.1' : 'V4.2',
      currentRevisionInfo: { workflowState: 'released' },
    }])),
    materialDb: { materials, bomEntries },
  };
}

test('foot replacement proposal creates four drafts and ten exact BOM replacements', () => {
  const operations = buildFootReplacementOperations(createPayload());
  assert.equal(operations.length, 14);
  assert.equal(operations.filter((operation) => operation.operationType === 'create_product_revision').length, 4);
  assert.equal(operations.filter((operation) => operation.operationType === 'replace_bom_item').length, 10);
  const replacementIds = new Set(operations
    .filter((operation) => operation.operationType === 'replace_bom_item')
    .map((operation) => operation.payload.materialId));
  assert.deepEqual(replacementIds, new Set([
    'id-ZJG150641BH', 'id-ZJG150641WH', 'id-ZJG15064123BH', 'id-ZJG15064123WH',
  ]));
});

test('foot replacement proposal is emitted as one Admin batch', () => {
  const [batch] = buildFootReplacementProposalBatches(createPayload());
  assert.equal(batch.operations.length, 14);
  assert.match(batch.summary, /54底脚/);
});
