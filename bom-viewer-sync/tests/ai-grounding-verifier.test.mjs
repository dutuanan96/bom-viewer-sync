import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyGrounding } from '../src/features/ai-assistant/grounding-verifier.js';

const route = Object.freeze({
  intent: 'bom_compare',
  confidence: 'deterministic',
  preferredTool: 'compare_boms',
  entities: { productIds: ['LGS723', 'LGS733'] },
});

function validResult(overrides = {}) {
  return {
    product1: { productCode: 'LGS723', color: '复古色', totalRows: 44, materialCount: 44 },
    product2: { productCode: 'LGS733', color: '复古色', totalRows: 46, materialCount: 46 },
    summary: {
      commonCount: 20,
      onlyProduct1Count: 24,
      onlyProduct2Count: 26,
      quantityOrUnitDifferenceCount: 6,
      similarityScore: 20 / 70,
      commonByAttribute: { 五金包: 11, 包材: 5, 零件: 4 },
      commonByMaterialFamily: {
        metal: { total: 1, explicit: 1, inferred: 0 },
        unknown: { total: 19, explicit: 0, inferred: 0 },
      },
    },
    common: [],
    onlyProduct1: [],
    onlyProduct2: [],
    quantityOrUnitDifferences: [],
    truncated: false,
    evidence: [
      { id: 'PDM-LGS723-1', recordId: 'LGS723', sourcePath: 'data/products/LGS723.json' },
      { id: 'PDM-LGS733-1', recordId: 'LGS733', sourcePath: 'data/products/LGS733.json' },
    ],
    ...overrides,
  };
}

test('returns bounded answer requirements for a valid BOM comparison', () => {
  const verified = verifyGrounding({
    route,
    query: 'LGS723和LGS733有什么铁件共用？',
    toolCall: { name: 'compare_boms', arguments: { productId1: 'LGS723', productId2: 'LGS733' } },
    toolResult: validResult(),
  });

  assert.equal(verified.valid, true);
  assert.match(verified.requirements, /LGS723/);
  assert.match(verified.requirements, /LGS733/);
  assert.match(verified.requirements, /materialId/);
  assert.match(verified.requirements, /unknown/i);
  assert.equal(Object.isFrozen(verified), true);
});

test('rejects wrong-product comparison evidence', () => {
  assert.throws(
    () => verifyGrounding({
      route,
      query: 'compare',
      toolCall: { name: 'compare_boms', arguments: { productId1: 'LGS723', productId2: 'LGS733' } },
      toolResult: validResult({ product2: { productCode: 'LGS433' } }),
    }),
    error => error.code === 'AI_GROUNDING_INVALID' && /product/i.test(error.message),
  );
});

test('rejects missing evidence and ontology coverage', () => {
  assert.throws(
    () => verifyGrounding({
      route,
      query: 'compare',
      toolCall: { name: 'compare_boms', arguments: { productId1: 'LGS723', productId2: 'LGS733' } },
      toolResult: validResult({ evidence: [] }),
    }),
    error => error.code === 'AI_GROUNDING_INVALID' && /evidence/i.test(error.message),
  );

  const result = validResult();
  delete result.summary.commonByMaterialFamily;
  assert.throws(
    () => verifyGrounding({ route, query: 'compare', toolCall: { name: 'compare_boms' }, toolResult: result }),
    error => error.code === 'AI_GROUNDING_INVALID' && /material family/i.test(error.message),
  );
});

test('rejects unbounded arrays and mismatched preferred tools', () => {
  assert.throws(
    () => verifyGrounding({
      route,
      query: 'compare',
      toolCall: { name: 'get_bom', arguments: {} },
      toolResult: validResult(),
    }),
    error => error.code === 'AI_GROUNDING_INVALID' && /tool/i.test(error.message),
  );
  assert.throws(
    () => verifyGrounding({
      route,
      query: 'compare',
      toolCall: { name: 'compare_boms', arguments: {} },
      toolResult: validResult({ common: Array.from({ length: 101 }, () => ({})) }),
    }),
    error => error.code === 'AI_GROUNDING_INVALID' && /bounded/i.test(error.message),
  );
});

test('accepts a bounded deterministic product-search array', () => {
  const route = {
    confidence: 'deterministic',
    preferredTool: 'search_products',
    entities: { productIds: [] },
  };
  const verified = verifyGrounding({
    route,
    toolCall: { name: 'search_products', arguments: { query: 'LGS' } },
    toolResult: [{ productCode: 'LGS433' }],
  });
  assert.match(verified.requirements, /bounded/i);
});
