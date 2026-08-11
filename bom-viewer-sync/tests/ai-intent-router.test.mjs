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
  'compare_revisions',
  'search_pdm',
  'list_recent_changes',
  'inspect_pdm_schema',
  'get_pdm_help',
  'analyze_pdm',
];

test('routes explicit Admin edit requests to the governed proposal tool', () => {
  const route = routePdmIntent({
    query: 'Update material M1 unit to pcs',
    availableTools: [...READ_TOOLS, 'apply_mutation'],
  });

  assert.equal(route.intent, PDM_INTENTS.PROPOSAL);
  assert.equal(route.preferredTool, 'apply_mutation');
  assert.equal(route.confidence, 'deterministic');
});

test('prefetches exact PDM materials before a bulk dimension-change proposal', () => {
  const query = '\u6211\u60f3\u6539\u6240\u6709\u7eb8\u5361\u670960mm\u5bbd\u5ea6\u6539\u4e3a100mm\u5bbd\u5ea6';
  const route = routePdmIntent({
    query,
    availableTools: [...READ_TOOLS, 'apply_mutation'],
  });

  assert.equal(route.intent, PDM_INTENTS.PROPOSAL);
  assert.equal(route.preferredTool, 'search_pdm');
  assert.equal(route.entities.searchQuery, query);
  assert.equal(route.confidence, 'deterministic');
});

test('does not route an edit request when the model has no proposal capability', () => {
  const route = routePdmIntent({
    query: 'Update material M1 unit to pcs',
    availableTools: READ_TOOLS,
  });

  assert.notEqual(route.preferredTool, 'apply_mutation');
});

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

test('routes a two-product legacy crossbar question to deterministic component analysis', () => {
  const route = routePdmIntent({
    query: 'LGS723和LGS733的横梁有共用吗？',
    availableTools: READ_TOOLS,
  });
  assert.equal(route.intent, PDM_INTENTS.CATALOG_ANALYSIS);
  assert.equal(route.preferredTool, 'analyze_pdm');
  assert.deepEqual(route.entities.productIds, ['LGS723', 'LGS733']);
});

test('routes single-product legacy component questions to a focused BOM lookup', () => {
  for (const query of ['LGS723\u7528\u4ec0\u4e48\u5e03\u62bd\uff1f', 'LGS723\u7528\u4ec0\u4e48\u5305\u6750\uff1f']) {
    const route = routePdmIntent({ query, availableTools: READ_TOOLS });
    assert.equal(route.intent, PDM_INTENTS.BOM_LOOKUP, query);
    assert.equal(route.preferredTool, 'get_bom', query);
    assert.equal(route.entities.componentQuery, query);
  }
});

test('resolves an ordinal follow-up from temporary BOM candidates only', () => {
  const route = routePdmIntent({
    query: '\u7b2c2\u79cd',
    conversationContext: {
      productIds: ['LGS723'],
      bomCandidates: [
        { matCode: 'BC300', nameZh: 'LGS\u5e03\u62bd', spec: '300x282x168mm' },
        { matCode: 'BC460', nameZh: 'LGS\u5e03\u62bd', spec: '460x282x187mm' },
      ],
    },
    availableTools: READ_TOOLS,
  });
  assert.equal(route.preferredTool, 'get_bom');
  assert.deepEqual(route.entities, { productIds: ['LGS723'], componentQuery: 'BC460' });
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
  const noIntent = routePdmIntent({ query: 'I need some help', availableTools: READ_TOOLS });
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

test('routes simple social greetings to GREETING intent when no entities exist', () => {
  for (const query of ['你好', 'Xin chào', 'Hello', 'hi', 'chào']) {
    const route = routePdmIntent({ query, availableTools: READ_TOOLS });
    assert.equal(route.intent, PDM_INTENTS.GREETING);
    assert.equal(route.preferredTool, null);
  }

  // Regression: if an entity exists, it should not be a greeting
  const withEntity = routePdmIntent({ query: 'Hello LGS723', availableTools: READ_TOOLS });
  assert.notEqual(withEntity.intent, PDM_INTENTS.GREETING);
});

test('routes revision follow-ups, shorthand comparisons, recent changes, and specification searches', () => {
  const revision = routePdmIntent({
    query: '那帮我看一下是V3.1有什么改变的?',
    history: [
      { role: 'user', content: '为什么LGS032状态是草稿非现行' },
      { role: 'assistant', content: 'LGS032 current V3.1 draft; effective V3 released.' },
    ],
    availableTools: READ_TOOLS,
  });
  assert.equal(revision.preferredTool, 'compare_revisions');
  assert.deepEqual(revision.entities.productIds, ['LGS032']);
  assert.deepEqual(revision.entities.revisions, ['V3', 'V3.1']);

  const statusFollowUp = routePdmIntent({
    query: '为什么它不是现行版？',
    history: [{ role: 'user', content: '为什么LGS032是草稿？' }],
    availableTools: READ_TOOLS,
  });
  assert.equal(statusFollowUp.preferredTool, 'get_revision_history');
  assert.deepEqual(statusFollowUp.entities.productIds, ['LGS032']);

  assert.equal(routePdmIntent({ query: '帮我看一下LGS723和733', availableTools: READ_TOOLS }).preferredTool, 'compare_boms');
  assert.equal(routePdmIntent({ query: '帮我统计一下最近的变更', availableTools: READ_TOOLS }).preferredTool, 'list_recent_changes');
  assert.equal(routePdmIntent({ query: 'Tìm ngăn kéo 460×282×187 dùng cho sản phẩm nào?', availableTools: READ_TOOLS }).preferredTool, 'search_pdm');
  assert.equal(routePdmIntent({ query: 'Find LGS', availableTools: READ_TOOLS }).preferredTool, 'search_products');
});

test('routes explicit usage help and schema questions but keeps vague help ambiguous', () => {
  assert.equal(routePdmIntent({ query: 'Hướng dẫn sử dụng AI PDM', availableTools: READ_TOOLS }).preferredTool, 'get_pdm_help');
  assert.equal(routePdmIntent({ query: 'AI có thể xem cấu trúc dữ liệu HTML không?', availableTools: READ_TOOLS }).preferredTool, 'inspect_pdm_schema');
  assert.equal(routePdmIntent({ query: 'giúp tôi với', availableTools: READ_TOOLS }).confidence, 'ambiguous');
});

test('uses structured conversation context for natural multilingual revision follow-ups', () => {
  const conversationContext = { productIds: ['LGS032'], revisions: ['V3', 'V3.1'] };
  for (const query of [
    '两个版本有什么区别',
    '这两个版本有什么差别？',
    'Hai phiên bản khác nhau thế nào?',
    'What is different between those two versions?',
  ]) {
    const route = routePdmIntent({ query, conversationContext, availableTools: READ_TOOLS });
    assert.equal(route.preferredTool, 'compare_revisions', query);
    assert.deepEqual(route.entities.productIds, ['LGS032']);
    assert.deepEqual(route.entities.revisions, ['V3', 'V3.1']);
  }

  const newProduct = routePdmIntent({
    query: 'Compare two versions of LGS733',
    conversationContext,
    availableTools: READ_TOOLS,
  });
  assert.notEqual(newProduct.preferredTool, 'compare_revisions');
  assert.deepEqual(newProduct.entities.productIds, ['LGS733']);
  assert.equal(newProduct.entities.revisions, undefined);
});

test('re-runs the original PDM search for multilingual result-set follow-ups', () => {
  const conversationContext = {
    productIds: ['LGS723'],
    materialIds: ['mat_drawer'],
    searchQuery: '460x282x187',
  };
  for (const query of [
    'Is LGS723 the only one?',
    'Chỉ LGS723 dùng thôi à?',
    '\u53ea\u6709LGS723\u7528\u5417?',
    '\u8fd8\u6709\u5176\u4ed6\u4ea7\u54c1\u7528\u5417?',
  ]) {
    const route = routePdmIntent({ query, conversationContext, availableTools: READ_TOOLS });
    assert.equal(route.intent, PDM_INTENTS.PDM_SEARCH, query);
    assert.equal(route.preferredTool, 'search_pdm', query);
    assert.equal(route.entities.searchQuery, '460x282x187', query);
    assert.equal(route.entities.searchProductId, undefined, query);
  }

  const unrelatedRevision = routePdmIntent({
    query: 'What other revisions does LGS032 have?',
    conversationContext,
    availableTools: READ_TOOLS,
  });
  assert.equal(unrelatedRevision.preferredTool, 'get_revision_history');
});

test('scopes general component questions to the explicitly named product', () => {
  for (const query of [
    '\u597d\uff0c\u90a3LGS043\u7528\u4ec0\u4e48\u5e03\u62bd',
    '\u90a3LGS043\u7528\u4ec0\u4e48\u628a\u624b?',
    'Which handle does LGS043 use?',
    'LGS043 d\u00f9ng lo\u1ea1i \u1ed1c n\u00e0o?',
    'Show the specification for LGS043',
  ]) {
    const route = routePdmIntent({
      query,
      conversationContext: {
        productIds: ['LGS723'],
        searchQuery: '460x282x187',
      },
      availableTools: READ_TOOLS.filter(tool => tool !== 'get_bom'),
    });

    assert.equal(route.intent, PDM_INTENTS.PDM_SEARCH, query);
    assert.equal(route.preferredTool, 'search_pdm', query);
    assert.deepEqual(route.entities.productIds, ['LGS043'], query);
    assert.equal(route.entities.searchQuery, query, query);
    assert.equal(route.entities.searchProductId, 'LGS043', query);
  }
});

test('routes shorthand, variant gaps, and catalog hardware questions to deterministic analysis', () => {
  const shorthand = routePdmIntent({ query: '帮我看一下723用什么布抽', availableTools: READ_TOOLS });
  assert.equal(shorthand.preferredTool, 'analyze_pdm');
  assert.equal(shorthand.intent, PDM_INTENTS.CATALOG_ANALYSIS);

  const variant = routePdmIntent({ query: '为什么LGS031五金包的白色没有?', availableTools: READ_TOOLS });
  assert.equal(variant.preferredTool, 'analyze_pdm');
  assert.deepEqual(variant.entities.productIds, ['LGS031']);

  const shared = routePdmIntent({ query: '帮我看一下所有的五金包有哪一个产品共用吗?', availableTools: READ_TOOLS });
  assert.equal(shared.preferredTool, 'analyze_pdm');
});

test('routes generic frame dimension follow-ups without hardcoded values', () => {
  const route = routePdmIntent({
    query: '那有几个铁框有高度660mm',
    history: [{ role: 'user', content: '帮我统计一下所有LGS有几种铁框' }],
    availableTools: READ_TOOLS,
  });
  assert.equal(route.preferredTool, 'analyze_pdm');
});

test('routes general catalog component questions to local analysis', () => {
  const queries = [
    '所有产品有哪一个产品用竖梁',
    '有哪一个SKU用竖零件',
    '竖梁用哪一个产品',
    '哪一个产品用最大的纸箱',
    'thống kê giúp tôi tất cả các LGS dùng thùng giấy gì',
    'thống kê giúp tôi toàn bộ thùng giấy của các sản phẩm',
    'liệt kê tất cả thùng carton các sản phẩm đang dùng',
    'cho tôi xem thùng giấy của toàn bộ LGS',
    'thong ke toan bo thung giay cua cac san pham',
  ];

  for (const query of queries) {
    const route = routePdmIntent({ query, availableTools: READ_TOOLS });
    assert.equal(route.intent, PDM_INTENTS.CATALOG_ANALYSIS, query);
    assert.equal(route.preferredTool, 'analyze_pdm', query);
    assert.equal(route.confidence, 'deterministic', query);
  }
});

test('routes broad natural Vietnamese PDM phrasing with or without diacritics', () => {
  const cases = [
    ['LGS723 dùng túi vải loại nào', 'get_bom'],
    ['quy cách đáy túi của LGS333', 'get_bom'],
    ['LGS723 co bao nhieu tui ngu kim', 'get_bom'],
    ['Cái tủ 733 bảy ngăn ấy, con M6x22 có bao nhiêu con?', 'get_bom'],
    ['LGS723 dung vat lieu gi', 'get_bom'],
    ['LGS723 kích thước bao nhiêu', 'get_product'],
    ['LGS723 mau gi', 'get_product'],
    ['phiên bản hiện hành LGS132', 'get_revision_history'],
    ['phien ban hien hanh LGS133', 'get_revision_history'],
    ['so sánh LGS723 với LGS733', 'compare_boms'],
    ['doi chieu LGS723 va LGS733', 'compare_boms'],
    ['tìm vật liệu 1185x330x110mm', 'search_pdm'],
    ['tim vat lieu quy cach 1185x330x110mm', 'search_pdm'],
    ['cho xem đáy túi của toàn bộ sản phẩm', 'analyze_pdm'],
    ['liet ke bao bi cua cac san pham', 'analyze_pdm'],
  ];

  for (const [query, preferredTool] of cases) {
    const route = routePdmIntent({ query, availableTools: READ_TOOLS });
    assert.equal(route.preferredTool, preferredTool, query);
    assert.equal(route.confidence, 'deterministic', query);
  }
});

test('reuses a confirmed read-only strategy for a similar unknown query', () => {
  const route = routePdmIntent({
    query: '查一下哪些型号装这个特殊托架',
    availableTools: READ_TOOLS,
    learnedStrategies: [{
      status: 'confirmed',
      scope: {
        memoryType: 'procedure',
        intent: PDM_INTENTS.CATALOG_ANALYSIS,
        preferredTool: 'analyze_pdm',
        exampleQuery: '哪些型号使用这个特殊托架',
      },
    }],
  });

  assert.equal(route.intent, PDM_INTENTS.CATALOG_ANALYSIS);
  assert.equal(route.preferredTool, 'analyze_pdm');
  assert.equal(route.confidence, 'learned');
});

test('continues a confirmed shorthand question without calling the model for intent recovery', () => {
  const originalQuery = '那个834上横梁有和哪一个产品共用吗？还是只有它独用';
  const route = routePdmIntent({
    query: '是的',
    conversationContext: {
      productIds: ['LGS834'],
      searchQuery: originalQuery,
    },
    availableTools: READ_TOOLS,
  });

  assert.equal(route.intent, PDM_INTENTS.CATALOG_ANALYSIS);
  assert.equal(route.preferredTool, 'analyze_pdm');
  assert.deepEqual(route.entities.productIds, ['LGS834']);
  assert.ok(route.entities.searchQuery.includes('LGS834'));
  assert.ok(!route.entities.searchQuery.includes('那个834'));
});

test('expands a prior component comparison to other products using local analysis', () => {
  const originalQuery = 'LGS433和434那个竖梁有共用吗?';
  const followUp = '除外那个两产品还有什么产品也用吗?';
  const route = routePdmIntent({
    query: followUp,
    conversationContext: {
      productIds: ['LGS433', 'LGS434'],
      searchQuery: originalQuery,
    },
    availableTools: READ_TOOLS,
  });

  assert.equal(route.intent, PDM_INTENTS.CATALOG_ANALYSIS);
  assert.equal(route.preferredTool, 'analyze_pdm');
  assert.deepEqual(route.entities.productIds, ['LGS433', 'LGS434']);
  assert.ok(route.entities.searchQuery.includes(originalQuery));
  assert.ok(route.entities.searchQuery.includes(followUp));
});

test('routes a duplicate-material consolidation request through proposal context', () => {
  const route = routePdmIntent({
    query: 'gom chung cac 纸卡 giong het thanh ma ZK1100100 va thay the BOM',
    availableTools: [...READ_TOOLS, 'find_duplicate_materials', 'apply_mutation'],
  });

  assert.equal(route.intent, PDM_INTENTS.PROPOSAL);
  assert.equal(route.preferredTool, 'find_duplicate_materials');
  assert.equal(route.entities.materialName, '纸卡');
});
