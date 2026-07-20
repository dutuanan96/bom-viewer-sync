import test from 'node:test';
import assert from 'node:assert/strict';
import { PDM_INTENTS, routePdmIntent } from '../src/features/ai-assistant/intent-router.js';

const READ_TOOLS = [
  'search_products',
  'get_product',
  'resolve_sku',
  'get_bom',
  'get_revision_history',
  'get_material',
  'where_used',
  'compare_boms',
  'get_marketplace_insights',
];

test('routes an explicit Chinese draft-status question to revision history', () => {
  assert.deepEqual(routePdmIntent({
    query: '为什么LGS032有状态是草稿呢？',
    selection: { productCode: 'LGS433' },
    availableTools: READ_TOOLS,
  }), {
    intent: PDM_INTENTS.REVISION_STATUS,
    entities: { productIds: ['LGS032'] },
    preferredTool: 'get_revision_history',
    confidence: 'deterministic',
  });
});

test('recognizes Vietnamese and English revision questions', () => {
  for (const query of ['Lịch sử phiên bản LGS032', 'Why is LGS032 revision a draft?']) {
    const route = routePdmIntent({ query, availableTools: READ_TOOLS });
    assert.equal(route.intent, PDM_INTENTS.REVISION_STATUS);
    assert.equal(route.preferredTool, 'get_revision_history');
    assert.deepEqual(route.entities.productIds, ['LGS032']);
  }
});

test('routes a two-product comparison with normalized unique product IDs', () => {
  const route = routePdmIntent({
    query: 'So sánh lgs031 với LGS032 và LGS031',
    availableTools: READ_TOOLS,
  });

  assert.equal(route.intent, PDM_INTENTS.BOM_COMPARE);
  assert.equal(route.preferredTool, 'compare_boms');
  assert.deepEqual(route.entities.productIds, ['LGS031', 'LGS032']);
});

test('routes a Chinese shared-parts question with two explicit products to BOM comparison', () => {
  const route = routePdmIntent({
    query: '\u5e2e\u6211\u770b\u4e00\u4e0bLGS723\u548cLGS733\u6709\u4ec0\u4e48\u94c1\u4ef6\u5171\u7528',
    availableTools: READ_TOOLS
  });
  assert.equal(route.intent, PDM_INTENTS.BOM_COMPARE);
  assert.equal(route.preferredTool, 'compare_boms');
  assert.deepEqual(route.entities.productIds, ['LGS723', 'LGS733']);
});

test('routes exact BOM, marketplace, and alias questions', () => {
  assert.equal(routePdmIntent({ query: 'BOM của LGS433 gồm những gì?', availableTools: READ_TOOLS }).preferredTool, 'get_bom');
  assert.equal(routePdmIntent({ query: 'Amazon reviews của LGS433 thế nào?', availableTools: READ_TOOLS }).preferredTool, 'get_marketplace_insights');
  const aliasRoute = routePdmIntent({ query: 'ULGS433BH02S là SKU nào?', availableTools: READ_TOOLS });
  assert.equal(aliasRoute.preferredTool, 'resolve_sku');
  assert.deepEqual(aliasRoute.entities.aliases, ['ULGS433BH02S']);
});

test('uses the selected product only for an explicit current-product reference', () => {
  const route = routePdmIntent({
    query: 'BOM của sản phẩm này có bao nhiêu vật liệu?',
    selection: { productCode: 'LGS433' },
    availableTools: READ_TOOLS,
  });

  assert.equal(route.preferredTool, 'get_bom');
  assert.deepEqual(route.entities.productIds, ['LGS433']);
});

test('returns ambiguous when intent, identifiers, or required tool are insufficient', () => {
  const noIntent = routePdmIntent({ query: 'Xin chào', availableTools: READ_TOOLS });
  assert.equal(noIntent.intent, PDM_INTENTS.AMBIGUOUS);
  assert.equal(noIntent.preferredTool, null);

  const missingSecondProduct = routePdmIntent({ query: 'Compare LGS031', availableTools: READ_TOOLS });
  assert.equal(missingSecondProduct.intent, PDM_INTENTS.AMBIGUOUS);

  const unavailable = routePdmIntent({
    query: 'Why is LGS032 a draft?',
    availableTools: ['search_products'],
  });
  assert.equal(unavailable.intent, PDM_INTENTS.AMBIGUOUS);
  assert.equal(unavailable.preferredTool, null);
});

test('never routes deterministic read questions to submit_proposal', () => {
  const route = routePdmIntent({
    query: '为什么LGS032有状态是草稿呢？',
    availableTools: [...READ_TOOLS, 'submit_proposal'],
  });
  assert.notEqual(route.preferredTool, 'submit_proposal');
});

test('routes canonical material detail and where-used questions', () => {
  const materialTools = ['get_material', 'where_used'];
  assert.deepEqual(
    routePdmIntent({ query: 'Show material mat_abc123', availableTools: materialTools }),
    {
      intent: PDM_INTENTS.MATERIAL_DETAIL,
      entities: { productIds: [], materialIds: ['mat_abc123'] },
      preferredTool: 'get_material',
      confidence: 'deterministic'
    }
  );
  assert.equal(
    routePdmIntent({ query: 'Where is mat_abc123 used?', availableTools: materialTools }).preferredTool,
    'where_used'
  );
});

test('routes a comparison follow-up using the two product IDs from bounded history', () => {
  const route = routePdmIntent({
    query: '\u5de6/\u53f3\u4fa7\u6846\u5171\u7528\u4e3a\u4ec0\u4e48\u4f60\u6709\u7edf\u8ba1\u5462\uff1f\uff0c\u8fd8\u6709\u591a\u7684\u5176\u4ed6',
    history: [
      { role: 'user', content: '\u5e2e\u6211\u770b\u4e00\u4e0bLGS723\u548cLGS733\u6709\u4ec0\u4e48\u94c1\u4ef6\u5171\u7528' },
      { role: 'assistant', content: 'LGS723 and LGS733 share several exact materials.' }
    ],
    availableTools: READ_TOOLS
  });

  assert.equal(route.intent, PDM_INTENTS.BOM_COMPARE);
  assert.equal(route.preferredTool, 'compare_boms');
  assert.deepEqual(route.entities.productIds, ['LGS723', 'LGS733']);
});

test('routes a confirmed informal product variant to its canonical BOM target', () => {
  const route = routePdmIntent({
    query: 'BOM con BellaH màu đen có gì?',
    resolvedEntities: [{ type: 'product-variant', productCode: 'LGS433', color: '黑色' }],
    availableTools: READ_TOOLS,
  });

  assert.equal(route.intent, PDM_INTENTS.BOM_LOOKUP);
  assert.deepEqual(route.entities.productIds, ['LGS433']);
  assert.deepEqual(route.entities.colors, ['黑色']);
});

test('explicit canonical IDs override inferred aliases and unresolved candidates do not route', () => {
  const explicit = routePdmIntent({
    query: 'BOM LGS434 của con BellaH',
    resolvedEntities: [{ type: 'product', productCode: 'LGS433' }],
    availableTools: READ_TOOLS,
  });
  assert.deepEqual(explicit.entities.productIds, ['LGS434']);

  const unresolved = routePdmIntent({
    query: 'BOM con BellaH',
    resolvedEntities: [],
    availableTools: READ_TOOLS,
  });
  assert.equal(unresolved.confidence, 'ambiguous');
});
