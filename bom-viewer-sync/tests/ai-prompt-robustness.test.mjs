import test from 'node:test';
import assert from 'node:assert/strict';

import { routePdmIntent, PDM_INTENTS } from '../src/features/ai-assistant/intent-router.js';
import { PdmKnowledge } from '../src/features/ai-assistant/pdm-knowledge.js';
import { applyContextTransition } from '../src/features/ai-assistant/context-resolution.js';

// Mock snapshot for knowledge engine
const mockSnapshot = {
  sourceMetadata: { commitSha: '0123456789012345678901234567890123456789' },
  payload: {
    bom: {
      LGS723: {
        productCode: 'LGS723',
        revision: 'V4.1',
        colors: ['复古色', '黑色', '白色'],
        color_info: {
          '复古色': {
            materials: [
              { mat_code: 'MAT_FRAME', comp_code: 'L1', name_zh: '中竖梁-前', spec_zh: '198mm', _level: 1, qty: '1', unit: 'pcs' },
              { mat_code: 'MAT_BOLT', comp_code: '3', name_zh: 'M6螺丝', spec_zh: 'M6x22', _level: 1, qty: '12', unit: 'pcs' },
            ],
          },
          '白色': {
            materials: [
              { mat_code: 'MAT_FRAME_WH', comp_code: 'L1', name_zh: '中竖梁-前(白)', spec_zh: '198mm', _level: 1, qty: '1', unit: 'pcs' },
            ],
          },
        },
      },
      LGS733: {
        productCode: 'LGS733',
        revision: 'V4.1',
        colors: ['复古色', '黑色', '白色'],
        color_info: {
          '复古色': {
            materials: [
              { mat_code: 'MAT_FRAME', comp_code: 'L2', name_zh: '中竖梁-前', spec_zh: '198mm', _level: 1, qty: '2', unit: 'pcs' },
              { mat_code: 'MAT_BOLT', comp_code: '3', name_zh: 'M6螺丝', spec_zh: 'M6x22', _level: 1, qty: '16', unit: 'pcs' },
            ],
          },
          '白色': {
            materials: [
              { mat_code: 'MAT_FRAME_WH', comp_code: 'L2', name_zh: '中竖梁-前(白)', spec_zh: '198mm', _level: 1, qty: '2', unit: 'pcs' },
            ],
          },
        },
      },
      LGS031: {
        productCode: 'LGS031',
        revision: 'V2.0',
        colors: ['复古色'],
        color_info: {
          '复古色': {
            materials: [
              { mat_code: 'CARTON_031', name_zh: '外箱', spec_zh: '800x400x200mm', _level: 1, qty: '1', unit: '个' },
            ],
          },
        },
      },
    },
    materialDb: {
      MAT_FRAME: { code: 'MAT_FRAME', name: { zh: '中竖梁-前' }, spec: { zh: '198mm' }, attr: { zh: '零件' } },
      MAT_FRAME_WH: { code: 'MAT_FRAME_WH', name: { zh: '中竖梁-前(白)' }, spec: { zh: '198mm' }, attr: { zh: '零件' } },
      MAT_BOLT: { code: 'MAT_BOLT', name: { zh: 'M6螺丝' }, spec: { zh: 'M6x22' }, attr: { zh: '五金' } },
      CARTON_031: { code: 'CARTON_031', name: { zh: '外箱' }, spec: { zh: '800x400x200mm' }, attr: { zh: '包材' } },
    },
  },
};

// ==========================================
// TIER 1: PARAPHRASES (Vietnamese, Chinese, English, Mixed)
// ==========================================
test('Tier 1: Paraphrases for compare_boms intent', () => {
  const queries = [
    'So sánh LGS723 với LGS733',
    '723 và 733 khác nhau gì',
    '723 với 733 có những vật liệu nào dùng chung?',
    'LGS723 và LGS733 BOM giống nhau bao nhiêu %',
    'hai con này có gì khác nhau (LGS723 vs LGS733)',
    '723 vs 733',
    'LGS723复古色跟LGS733复古色有什么共用？',
    '帮我核对723和733的BOM',
    '723和733有哪些物料不同？',
    '这两个产品的五金有什么区别？ (LGS723 và LGS733)',
    'compare BOM between LGS723 and LGS733',
    'what materials are shared between 723 and 733',
    '723 733 对比',
    '723 与 733 比较',
    'so sánh vật tư 723 và 733',
  ];

  for (const query of queries) {
    const route = routePdmIntent({
      query,
      availableTools: ['compare_boms', 'analyze_pdm', 'search_pdm'],
    });
    assert.equal(route.preferredTool, 'compare_boms', `Failed to route compare_boms for query: "${query}"`);
    assert.ok(
      route.entities.productIds.includes('LGS723') && route.entities.productIds.includes('LGS733'),
      `Failed to extract both productIds for query: "${query}"`,
    );
  }
});

// ==========================================
// TIER 2: ENTITY VARIATION & SHORTHAND
// ==========================================
test('Tier 2: Entity shorthand resolution', () => {
  const variants = [
    { query: 'LGS723 vs LGS733', expected: ['LGS723', 'LGS733'] },
    { query: 'lgs723 vs lgs733', expected: ['LGS723', 'LGS733'] },
    { query: '723 vs 733', expected: ['LGS723', 'LGS733'] },
    { query: 'LGS 723 và LGS 733', expected: ['LGS723', 'LGS733'] },
    { query: '723柜 和 733柜 对比', expected: ['LGS723', 'LGS733'] },
    { query: 'so sánh 723 với 733', expected: ['LGS723', 'LGS733'] },
  ];

  for (const { query, expected } of variants) {
    const route = routePdmIntent({
      query,
      availableTools: ['compare_boms'],
    });
    assert.deepEqual(
      [...route.entities.productIds].sort(),
      [...expected].sort(),
      `Entity mismatch for query: "${query}"`,
    );
  }
});

// ==========================================
// TIER 3: CONSTRAINT & COLOR EXTRACTION
// ==========================================
test('Tier 3: Color & constraint extraction', () => {
  const cases = [
    { query: 'so 723 với 733 màu gỗ', expectedColor: '复古色' },
    { query: '723 733 vintage', expectedColor: '复古色' },
    { query: 'LGS723 KD vs LGS733 KD', expectedColor: '复古色' },
    { query: '723和733复古色对比', expectedColor: '复古色' },
    { query: 'so sánh 723 và 733 màu đen', expectedColor: '黑色' },
    { query: '723 733 black', expectedColor: '黑色' },
    { query: '723 733 BH', expectedColor: '黑色' },
    { query: 'so sánh 723 và 733 màu trắng', expectedColor: '白色' },
    { query: '723 733 white', expectedColor: '白色' },
    { query: '723 733 WH', expectedColor: '白色' },
  ];

  for (const { query, expectedColor } of cases) {
    const route = routePdmIntent({
      query,
      availableTools: ['compare_boms'],
    });
    assert.equal(route.preferredTool, 'compare_boms');
    assert.ok(
      route.entities.color === expectedColor || (route.entities.colors && route.entities.colors.includes(expectedColor)),
      `Failed to extract expected color "${expectedColor}" for query: "${query}"`,
    );
  }
});

// ==========================================
// TIER 4: MULTI-TURN CONVERSATION & CONTEXT PATCHING
// ==========================================
test('Tier 4: Multi-turn comparison context patching and context switch', () => {
  // Turn 1: Initial comparison
  const turn1 = routePdmIntent({
    query: 'so sánh 723 với 733 màu gỗ',
    availableTools: ['compare_boms'],
  });
  assert.equal(turn1.preferredTool, 'compare_boms');
  assert.deepEqual([...turn1.entities.productIds].sort(), ['LGS723', 'LGS733']);

  // Context established after Turn 1
  const contextAfterTurn1 = {
    activeIntent: 'bom_compare',
    productIds: ['LGS723', 'LGS733'],
    color: '复古色',
    comparison: {
      productId1: 'LGS723',
      productId2: 'LGS733',
      color1: '复古色',
      color2: '复古色',
    },
  };

  // Turn 2: Follow-up color change ("còn màu trắng?")
  const turn2 = routePdmIntent({
    query: 'còn màu trắng thì sao?',
    conversationContext: contextAfterTurn1,
    availableTools: ['compare_boms'],
  });
  assert.equal(turn2.preferredTool, 'compare_boms');
  assert.deepEqual([...turn2.entities.productIds].sort(), ['LGS723', 'LGS733'], 'Preserves product context');
  assert.ok(
    turn2.entities.color === '白色' || (turn2.entities.colors && turn2.entities.colors.includes('白色')),
    'Patches color to 白色',
  );

  // Turn 3: Follow-up view scope filter ("chỉ xem ngũ kim")
  const turn3 = routePdmIntent({
    query: 'chỉ xem ngũ kim thôi',
    conversationContext: {
      ...contextAfterTurn1,
      color: '白色',
    },
    availableTools: ['compare_boms'],
  });
  assert.equal(turn3.preferredTool, 'compare_boms');
  assert.deepEqual([...turn3.entities.productIds].sort(), ['LGS723', 'LGS733'], 'Preserves product context in turn 3');

  // Turn 4: Follow-up difference focus ("tem nào khác?")
  const turn4 = routePdmIntent({
    query: 'hai cái này tem số nào khác nhau?',
    conversationContext: contextAfterTurn1,
    availableTools: ['compare_boms'],
  });
  assert.equal(turn4.preferredTool, 'compare_boms');
  assert.deepEqual([...turn4.entities.productIds].sort(), ['LGS723', 'LGS733'], 'Preserves product context in turn 4');

  // Turn 5: Context Switch / Reset ("LGS031 dùng thùng nào?")
  const turn5 = routePdmIntent({
    query: 'LGS031 dùng thùng nào?',
    conversationContext: contextAfterTurn1,
    availableTools: ['compare_boms', 'analyze_pdm', 'search_pdm'],
  });
  assert.notEqual(turn5.preferredTool, 'compare_boms', 'Context switch must not call compare_boms');
  assert.deepEqual(turn5.entities.productIds, ['LGS031'], 'Context switch isolates LGS031');
  assert.ok(!turn5.entities.productIds.includes('LGS723'), 'Does not leak LGS723 into new query');
  assert.ok(!turn5.entities.productIds.includes('LGS733'), 'Does not leak LGS733 into new query');
});

// ==========================================
// TIER 5: FACTORY VERNACULAR & NOISY LANGUAGE
// ==========================================
test('Tier 5: Factory vernacular and noisy phrasing', () => {
  const noisyQueries = [
    '723 733 coi hộ cái bom',
    '2 con này xài chung gì 723 733',
    '733 nhiều hơn 723 cái gì',
    'coi con 723 với con 733 khác tem số nào',
    '723 vs 733 五金一样不一样',
    '723 733 那个螺丝数量不同',
    '723 733 oc vit xai chung ko',
    'kiem tra vat tu dung chung cua 723 va 733',
  ];

  for (const query of noisyQueries) {
    const route = routePdmIntent({
      query,
      availableTools: ['compare_boms', 'analyze_pdm'],
    });
    assert.equal(route.preferredTool, 'compare_boms', `Failed to route factory vernacular: "${query}"`);
    assert.deepEqual([...route.entities.productIds].sort(), ['LGS723', 'LGS733']);
  }
});

// ==========================================
// TIER 6: NEGATIVE & AMBIGUITY GUARDRAILS (Unsafe Guess Rate = 0%)
// ==========================================
test('Tier 6: Negative tests & ambiguity clarification', () => {
  // Negative 1: Single product BOM query must NOT route to compare_boms
  const singleProduct = routePdmIntent({
    query: 'LGS723 có bao nhiêu ốc?',
    availableTools: ['compare_boms', 'analyze_pdm', 'search_pdm'],
  });
  assert.notEqual(singleProduct.preferredTool, 'compare_boms', 'Single product query must not trigger comparison');

  // Negative 2: Sales question must NOT route to compare_boms
  const salesQuery = routePdmIntent({
    query: 'LGS723 với LGS733 cái nào bán chạy hơn?',
    availableTools: ['compare_boms', 'analyze_pdm'],
  });
  assert.notEqual(salesQuery.preferredTool, 'compare_boms', 'Sales query must not trigger BOM comparison');

  // Ambiguity 1: Ambiguous shorthand "73" with no context must trigger clarification
  const ambiguousShorthand = routePdmIntent({
    query: 'so sánh 73 với 733',
    availableTools: ['compare_boms'],
  });
  assert.ok(
    ambiguousShorthand.needsClarification === true || !ambiguousShorthand.entities.productIds.includes('LGS723'),
    'Ambiguous "73" must NOT blindly guess LGS723',
  );

  // Ambiguity 2: "so 723 với cái kia" without prior context must request clarification
  const missingContext = routePdmIntent({
    query: 'so 723 với cái kia',
    conversationContext: {},
    availableTools: ['compare_boms'],
  });
  assert.ok(
    missingContext.needsClarification === true || missingContext.entities.productIds.length < 2,
    'Unresolved reference without context must require clarification',
  );
});

// ==========================================
// TIER 7: METAMORPHIC COMMUTATIVITY & INVARIANCE
// ==========================================
test('Tier 7: Metamorphic commutativity on BOM Knowledge Engine', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);

  const resForward = knowledge.compareBoms({ productId1: 'LGS723', productId2: 'LGS733' });
  const resReverse = knowledge.compareBoms({ productId1: 'LGS733', productId2: 'LGS723' });

  // Invariant 1: Similarity score is commutative
  assert.equal(resForward.summary.similarityScore, resReverse.summary.similarityScore);

  // Invariant 2: Common count is commutative
  assert.equal(resForward.summary.commonCount, resReverse.summary.commonCount);

  // Invariant 3: Identical count is commutative
  assert.equal(resForward.summary.identicalCount, resReverse.summary.identicalCount);

  // Invariant 4: Label difference count is commutative
  assert.equal(resForward.summary.labelDifferenceCount, resReverse.summary.labelDifferenceCount);

  // Invariant 5: OnlyProduct sets are symmetrical
  assert.equal(resForward.onlyProduct1.length, resReverse.onlyProduct2.length);
  assert.equal(resForward.onlyProduct2.length, resReverse.onlyProduct1.length);
});

// ==========================================
// TIER 8: NON-ADJACENT PRODUCT RESOLUTION & WORD-ORDER INVARIANCE
// ==========================================
test('Tier 8: Non-adjacent product resolution and word-order invariance', () => {
  const queries = [
    '723 dùng ốc nhiều hơn 733 không?',
    'thanh sắt đứng của 723 có lắp vừa cho 733 ko?',
    'ốc bên 723 và 733 bên nào nhiều?',
    '723 với thanh 198mm của 733 khác gì?',
    'so sánh 723 198mm 733',
    '723 với 290mm và 733',
    '723 dùng thanh dài 657mm khác 733 thế nào?',
    'LGS723 dùng ốc nhiều hơn 733 không?',
  ];

  for (const query of queries) {
    const route = routePdmIntent({
      query,
      availableTools: ['compare_boms', 'search_pdm', 'analyze_pdm'],
    });
    assert.ok(
      route.entities.productIds.includes('LGS723') && route.entities.productIds.includes('LGS733'),
      `Failed to extract both LGS723 and LGS733 for non-adjacent query: "${query}" (got ${JSON.stringify(route.entities.productIds)})`,
    );
    assert.equal(
      route.entities.productIds.includes('LGS198'),
      false,
      `Dimension 198mm must not be converted to product ID LGS198 in query: "${query}"`,
    );
    assert.equal(
      route.entities.productIds.includes('LGS290'),
      false,
      `Dimension 290mm must not be converted to product ID LGS290 in query: "${query}"`,
    );
    assert.equal(
      route.entities.productIds.includes('LGS657'),
      false,
      `Dimension 657mm must not be converted to product ID LGS657 in query: "${query}"`,
    );
    assert.equal(route.preferredTool, 'compare_boms');
  }
});

// ==========================================
// TIER 9: SEMANTIC EQUIVALENCE (FASTENER QUANTITY COMPARISON & METRIC ONTOLOGY)
// ==========================================
test('Tier 9: Semantic equivalence: fastener quantity comparison', () => {
  const queries = [
    'con 723 với 733 con nào tốn ốc hơn?',
    '723 dùng ốc nhiều hơn 733 không?',
    'ốc bên 723 với 733 bên nào nhiều hơn?',
    '723和733哪个螺丝用的多？',
    'which uses more screws, 723 or 733?',
    'LGS723 dùng ốc nhiều hơn 733 không?',
  ];

  for (const query of queries) {
    const route = routePdmIntent({
      query,
      availableTools: ['compare_boms', 'analyze_pdm'],
    });

    assert.deepEqual(
      [...route.entities.productIds].sort(),
      ['LGS723', 'LGS733'],
      `Failed product extraction for query: "${query}"`,
    );

    assert.equal(
      route.entities.componentConcept,
      'fastener',
      `Failed componentConcept extraction for query: "${query}"`,
    );
    assert.equal(
      route.entities.metric,
      'total_quantity',
      `Failed metric extraction for query: "${query}"`,
    );
  }

  // Metric Ontology Disambiguation Tests
  const similarityRoute = routePdmIntent({
    query: '723 và 733 BOM giống nhau bao nhiêu %?',
    availableTools: ['compare_boms'],
  });
  assert.equal(similarityRoute.entities.metric, 'similarity_ratio');

  const diffCountRoute = routePdmIntent({
    query: '723 và 733 BOM khác nhau bao nhiêu?',
    availableTools: ['compare_boms'],
  });
  assert.equal(diffCountRoute.entities.metric, 'difference_count');
});

// ==========================================
// TIER 10: MULTI-TURN CONTEXT FOCUS (SCOPE VS FOCUS)
// ==========================================
test('Tier 10: Multi-turn Context Focus preserves scope and sets component focus', () => {
  // Turn 1: Initial comparison
  const turn1 = routePdmIntent({
    query: 'so sánh 723 với 733 màu gỗ',
    availableTools: ['compare_boms'],
  });
  assert.equal(turn1.preferredTool, 'compare_boms');
  assert.deepEqual([...turn1.entities.scope.productIds].sort(), ['LGS723', 'LGS733']);
  assert.equal(turn1.entities.scope.color, '复古色');

  // Turn 2: Follow-up focusing on fasteners
  const turn2 = routePdmIntent({
    query: 'thế con ốc thì sao?',
    conversationContext: {
      scope: turn1.entities.scope,
      productIds: turn1.entities.productIds,
      color: turn1.entities.color,
      activeIntent: turn1.intent,
    },
    availableTools: ['compare_boms', 'get_bom'],
  });
  assert.equal(turn2.preferredTool, 'compare_boms');
  assert.deepEqual([...turn2.entities.scope.productIds].sort(), ['LGS723', 'LGS733']);
  assert.equal(turn2.entities.scope.color, '复古色');
  assert.equal(turn2.entities.focus.componentConcept, 'fastener');

  // Turn 3: Follow-up drawing lookup
  const turn3 = routePdmIntent({
    query: 'bản vẽ của nó đâu?',
    conversationContext: {
      scope: { productIds: ['LGS723'], color: '复古色' },
      productIds: ['LGS723'],
      focus: { componentConcept: 'fastener', materialId: 'MAT_BOLT_M6' },
      materialId: 'MAT_BOLT_M6',
    },
    availableTools: ['analyze_engineering_drawing', 'check_drawing_commonality'],
  });
  assert.equal(turn3.preferredTool, 'analyze_engineering_drawing');
  assert.equal(turn3.entities.focus.documentType, 'engineering_drawing');
});

// ==========================================
// TIER 11: RELATIVE ECN DELTA CHANGE RESOLUTION
// ==========================================
test('Tier 11: Relative ECN change parsed into structured delta and computed deterministically', () => {
  const query = 'đổi sang loại ốc dài hơn 3 li thì thế nào?';
  const route = routePdmIntent({
    query,
    conversationContext: {
      focus: { materialId: 'M6x22' },
      materialId: 'M6x22',
    },
    availableTools: ['analyze_ecn_impact', 'search_pdm'],
  });

  assert.equal(route.preferredTool, 'analyze_ecn_impact');
  assert.equal(route.entities.componentConcept, 'fastener');
  assert.deepEqual(route.entities.change, {
    field: 'length',
    operator: 'delta',
    value: 3,
    unit: 'mm',
  });

  // Test deterministic engine resolution with known material
  const knowledge = new PdmKnowledge(mockSnapshot);
  const result = knowledge.analyzeEcnImpact({
    targetMaterialId: 'M6x22',
    change: route.entities.change,
  });

  assert.equal(result.success, true);
  assert.equal(result.targetMaterial.code, 'MAT_BOLT');
  assert.equal(result.totalAffectedProducts, 2);
  assert.equal(result.changeSummary.newSpec, 'M6x25');
  assert.ok(
    result.proposalOperations.some(
      op => op.operationType === 'update_material_field' && op.value.zh === 'M6x25'
    ),
    'Must produce update_material_field proposal operation with M6x25',
  );

  // Test non-applicable spec relative change fails closed
  const failClosedResult = knowledge.analyzeEcnImpact({
    targetMaterialId: 'MAT_FRAME',
    change: route.entities.change,
  });
  assert.equal(failClosedResult.success, false);
  assert.equal(failClosedResult.needsClarification, true);
  assert.equal(failClosedResult.clarificationCode, 'relative_change_not_applicable');
});

// ==========================================
// TIER 12: UNIQUE PRONOUN RESOLUTION (P2)
// ==========================================
test('Tier 12: Unique material pronoun resolves safely without guessing', () => {
  const state = {
    scope: {
      productIds: ['LGS723'],
      color: '复古色',
    },
    focus: {
      componentConcept: 'fastener',
      materialId: 'MAT_BOLT',
    },
    referents: {
      materials: [
        { type: 'material', id: 'MAT_BOLT' },
      ],
    },
  };

  const route = routePdmIntent({
    query: 'đổi nó dài thêm 3 li',
    conversationContext: state,
    availableTools: ['analyze_ecn_impact'],
  });

  assert.equal(route.preferredTool, 'analyze_ecn_impact');
  assert.equal(route.entities.targetMaterialId, 'MAT_BOLT');
  assert.equal(route.confidence, 'deterministic');
});

// ==========================================
// TIER 13: AMBIGUOUS PRONOUN MUST FAIL CLOSED (P2)
// ==========================================
test('Tier 13: Ambiguous pronoun with multiple candidates fails closed', () => {
  const state = {
    scope: {
      productIds: ['LGS723'],
      color: '复古色',
    },
    focus: {
      componentConcept: 'fastener',
    },
    referents: {
      materials: [
        { type: 'material', id: 'MAT_BOLT_M6' },
        { type: 'material', id: 'MAT_BOLT_M8' },
      ],
    },
  };

  const route = routePdmIntent({
    query: 'đổi nó dài thêm 3 li',
    conversationContext: state,
    availableTools: ['analyze_ecn_impact'],
  });

  assert.equal(route.needsClarification, true);
  assert.equal(route.clarificationCode, 'ambiguous_material_reference');
  assert.equal(route.preferredTool, null);
  assert.deepEqual(route.entities.candidates, ['MAT_BOLT_M6', 'MAT_BOLT_M8']);
});

// ==========================================
// TIER 14: SCOPE SWITCH CLEARS STALE FOCUS (P2)
// ==========================================
test('Tier 14: Scope switch clears stale material focus and fails closed', () => {
  const state = {
    scope: {
      productIds: ['LGS723', 'LGS733'],
      color: '复古色',
    },
    focus: {
      componentConcept: 'fastener',
      materialId: 'MAT_BOLT',
    },
    referents: {
      materials: [{ type: 'material', id: 'MAT_BOLT' }],
      products: [{ type: 'product', id: 'LGS723' }, { type: 'product', id: 'LGS733' }],
    },
  };

  // User explicitly switches scope to LGS031 while attempting relative ECN
  const route = routePdmIntent({
    query: 'LGS031 đổi nó dài thêm 3 li',
    conversationContext: state,
    availableTools: ['analyze_ecn_impact'],
  });

  assert.equal(route.needsClarification, true);
  assert.equal(route.clarificationCode, 'scope_switched_material_lost');
  assert.equal(route.preferredTool, null);
  assert.deepEqual(route.entities.productIds, ['LGS031']);
});

// ==========================================
// TIER 15: PENDING CLARIFICATION LOCK (P2)
// ==========================================
test('Tier 15: Pending clarification locks dialog until resolved', () => {
  const pendingState = {
    scope: { productIds: ['LGS723'] },
    pendingClarification: {
      type: 'material_reference',
      candidates: [
        { id: 'MAT_BOLT_M6', type: 'material', spec_zh: 'M6x22' },
        { id: 'MAT_BOLT_M8', type: 'material', spec_zh: 'M8x25' },
      ],
    },
  };

  // User selects "cái thứ hai"
  const routeSecond = routePdmIntent({
    query: 'cái thứ hai',
    conversationContext: pendingState,
    availableTools: ['analyze_ecn_impact', 'get_material'],
  });
  assert.notEqual(routeSecond.intent, 'ambiguous');

  // User provides vague follow-up "cái kia thì sao"
  const routeVague = routePdmIntent({
    query: 'cái khác thì sao?',
    conversationContext: pendingState,
    availableTools: ['analyze_ecn_impact', 'get_material'],
  });
  assert.equal(routeVague.needsClarification, true);
});

// ==========================================
// TIER 16: FULL 8-TURN FACTORY ACCEPTANCE SEQUENCE (P2)
// ==========================================
test('Tier 16: Full 8-turn real factory conversation sequence passes with autonomous context evolution', () => {
  let state = {};

  // Turn 1: "so 723 với 733 màu gỗ"
  const t1 = routePdmIntent({
    query: 'so 723 với 733 màu gỗ',
    conversationContext: state,
    availableTools: ['compare_boms'],
  });
  assert.equal(t1.preferredTool, 'compare_boms');
  assert.deepEqual(t1.entities.productIds, ['LGS723', 'LGS733']);
  assert.equal(t1.entities.scope.color, '复古色');

  // Evolve state after Turn 1 response with BOM snapshot referents
  state = applyContextTransition({
    state,
    explicitEntities: {
      productIds: t1.entities.productIds,
      colors: ['复古色'],
    },
    intent: t1.intent,
  });
  state.referents.materials = [
    { id: 'MAT_FRAME', name_zh: '金属侧框', spec_zh: '198mm', type: 'material' },
    { id: 'MAT_BOLT', name_zh: '外六角螺丝', spec_zh: 'M6x22', type: 'material' },
  ];

  // Turn 2: "thế con ốc?"
  const t2 = routePdmIntent({
    query: 'thế con ốc?',
    conversationContext: state,
    availableTools: ['compare_boms'],
  });
  assert.equal(t2.preferredTool, 'compare_boms');
  assert.deepEqual(t2.entities.productIds, ['LGS723', 'LGS733']);
  assert.equal(t2.entities.focus.componentConcept, 'fastener');

  state = applyContextTransition({
    state,
    explicitEntities: {
      componentConcept: t2.entities.focus.componentConcept,
    },
    intent: t2.intent,
  });

  // Turn 3: "con dài nhất ấy" -> Superlative within fastener concept MUST pick MAT_BOLT (M6x22), NOT MAT_FRAME (198mm)
  const t3 = routePdmIntent({
    query: 'con dài nhất ấy',
    conversationContext: state,
    availableTools: ['get_material', 'analyze_ecn_impact'],
  });
  assert.equal(t3.intent, 'material_detail');
  assert.equal(t3.entities.targetMaterialId, 'MAT_BOLT');
  assert.equal(t3.needsClarification, undefined);

  state = applyContextTransition({
    state,
    resolvedReferences: {
      resolved: { id: t3.entities.targetMaterialId, type: 'material' },
      resolvedType: 'material',
    },
    intent: t3.intent,
  });
  assert.equal(state.focus.materialId, 'MAT_BOLT');

  // Turn 4: "đổi nó dài thêm 3 li" -> Relative ECN on MAT_BOLT
  const t4 = routePdmIntent({
    query: 'đổi nó dài thêm 3 li',
    conversationContext: state,
    availableTools: ['analyze_ecn_impact'],
  });
  assert.equal(t4.preferredTool, 'analyze_ecn_impact');
  assert.equal(t4.entities.targetMaterialId, 'MAT_BOLT');
  assert.deepEqual(t4.entities.change, { field: 'length', operator: 'delta', value: 3, unit: 'mm' });

  // Turn 5: "còn màu đen?" -> Scope color updated, product scope and material preserved
  const t5 = routePdmIntent({
    query: 'còn màu đen?',
    conversationContext: state,
    availableTools: ['compare_boms', 'get_product'],
  });
  assert.deepEqual(t5.entities.productIds, ['LGS723', 'LGS733']);
  assert.equal(t5.entities.scope.color, '黑色');

  state = applyContextTransition({
    state,
    explicitEntities: { colors: ['黑色'] },
    intent: t5.intent,
  });
  assert.equal(state.scope.color, '黑色');
  assert.equal(state.focus.materialId, 'MAT_BOLT');

  // Turn 6: "cái thứ hai thì giữ nguyên" -> Ordinal selection refers to 2nd product LGS733
  const t6 = routePdmIntent({
    query: 'cái thứ hai thì giữ nguyên',
    conversationContext: state,
    availableTools: ['get_product', 'compare_boms'],
  });
  assert.deepEqual(t6.entities.productIds, ['LGS733']);

  // Turn 7: "chuyển qua LGS031" -> Explicit scope switch CLEARS stale material and color!
  const t7 = routePdmIntent({
    query: 'chuyển qua LGS031',
    conversationContext: state,
    availableTools: ['get_product', 'analyze_pdm'],
  });
  assert.deepEqual(t7.entities.productIds, ['LGS031']);
  assert.equal(t7.entities.focus.materialId, null, 'Turn 7 entities.focus.materialId must be null');

  state = applyContextTransition({
    state,
    explicitEntities: { productIds: ['LGS031'] },
    intent: t7.intent,
  });
  assert.deepEqual(state.scope.productIds, ['LGS031']);
  assert.equal(state.focus.materialId, null, 'State focus.materialId must be cleared on scope switch');
  assert.equal(state.scope.color, null, 'State scope.color must be reset on scope switch');
  assert.deepEqual(state.referents.materials, [], 'State referents.materials must be cleared');

  // Turn 8: "còn nó thì sao?" -> Scope switched, material is empty -> MUST FAIL CLOSED!
  const t8 = routePdmIntent({
    query: 'còn nó thì sao?',
    conversationContext: state,
    availableTools: ['analyze_ecn_impact', 'get_material', 'check_drawing_commonality'],
  });
  assert.equal(t8.needsClarification, true, 'Turn 8 MUST fail-closed and not inherit MAT_BOLT from 723/733');
  assert.equal(t8.preferredTool, null);
});



