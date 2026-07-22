// tests/ai-pdm-assistant-capabilities.test.mjs
// Verification suite for mandatory PDM assistant capabilities:
// 1. Multilingual & non-canonical terminology
// 2. Deterministic catalog-wide aggregation (analyze_pdm)
// 3. BOM comparison with exact identity + evidence-backed equivalence (probableCommon, warnings)
// 4. Data inconsistency detection
// 5. Local fallback formatting on AI_NO_COMPATIBLE_ENDPOINT
// 6. Precise user clarification

import test from 'node:test';
import assert from 'node:assert/strict';
import { PdmKnowledge } from '../src/features/ai-assistant/pdm-knowledge.js';
import { detectProductShorthand, resolveConcept, parseDimensions, checkDimensionProximity } from '../src/features/ai-assistant/pdm-terminology.js';
import { evaluateEquivalence, detectDataQualityWarnings } from '../src/features/ai-assistant/pdm-equivalence.js';
import { validateToolCall, ALLOWED_TOOLS } from '../src/features/ai-assistant/contracts.js';
import { verifyGrounding } from '../src/features/ai-assistant/grounding-verifier.js';
import { routePdmIntent, PDM_INTENTS } from '../src/features/ai-assistant/intent-router.js';
import { createAgentController } from '../src/features/ai-assistant/agent-controller.js';
import { createTrustPolicy } from '../src/features/ai-assistant/trust-policy.js';
import { formatLocalToolFallback } from '../src/features/ai-assistant/index.js';

// Synthetic fixture snapshot for exact testing
const mockSnapshot = {
  sourceMetadata: {
    commitSha: 'a'.repeat(40),
    updatedAt: '2026-07-22T00:00:00Z',
  },
  payload: {
    bom: {
      LGS031: {
        name_zh: '三抽储物柜',
        colors: ['白色', '黑色'],
      },
      LGS033: {
        name_zh: '四抽小柜',
        colors: ['木色'],
      },
      LGS723: {
        name_zh: '双抽支撑柜723',
        colors: ['白色', '黑色'],
      },
      LGS733: {
        name_zh: '双抽支撑柜733',
        colors: ['白色', '黑色'],
      },
    },
    materialDb: {
      materials: {
        mat_723_frame: {
          id: 'mat_723_frame',
          code: 'MAT-FRAME-723',
          mat_code: 'MAT-FRAME-723',
          name: { zh: 'LGS333_723_733支撑框' },
          name_zh: 'LGS333_723_733支撑框',
          spec: { zh: '460x282x187mm' },
          spec_zh: '460x282x187mm',
        },
        mat_733_frame: {
          id: 'mat_733_frame',
          code: 'MAT-FRAME-733',
          mat_code: 'MAT-FRAME-733',
          name: { zh: 'LGS723_733支撑框' },
          name_zh: 'LGS723_733支撑框',
          spec: { zh: '460x282x187mm' },
          spec_zh: '460x282x187mm',
        },
        mat_bot_cross: {
          id: 'mat_bot_cross',
          code: 'MAT-BOT-033',
          mat_code: 'MAT-BOT-033',
          name: { zh: '底部横杆' },
          name_zh: '底部横杆',
          spec: { zh: 'L=290mm' },
          spec_zh: 'L=290mm',
        },
        mat_hw_031: {
          id: 'mat_hw_031',
          code: 'MAT-HW-BAG-01',
          mat_code: 'MAT-HW-BAG-01',
          name: { zh: '通用五金包' },
          name_zh: '通用五金包',
          spec: { zh: 'Standard' },
          spec_zh: 'Standard',
        },
        mat_drw_A: {
          id: 'mat_drw_A',
          code: 'MAT-DRW-FAB-A',
          mat_code: 'MAT-DRW-FAB-A',
          name: { zh: '大号布抽' },
          name_zh: '大号布抽',
          spec: { zh: '300x200mm' },
          spec_zh: '300x200mm',
        },
        mat_front_1: {
          id: 'mat_front_1',
          code: 'MAT-FRONT-1',
          mat_code: 'MAT-FRONT-1',
          name: { zh: '前横杆' },
          name_zh: '前横杆',
          spec: { zh: '290mm' },
          spec_zh: '290mm',
          drawings: [{ path: 'models/shared-front.glb' }],
        },
        mat_front_2: {
          id: 'mat_front_2',
          code: 'MAT-FRONT-2',
          mat_code: 'MAT-FRONT-2',
          name: { zh: '前横杆' },
          name_zh: '前横杆',
          spec: { zh: '300mm' },
          spec_zh: '300mm',
          drawings: [{ path: 'models/shared-front.glb' }],
        },
        mat_rear_1: {
          id: 'mat_rear_1',
          code: 'MAT-REAR-1',
          mat_code: 'MAT-REAR-1',
          name: { zh: '后横杆' },
          name_zh: '后横杆',
          spec: { zh: '300mm' },
          spec_zh: '300mm',
        },
      },
      bomEntries: [
        { parentType: 'product', productCode: 'LGS033', color: '木色', materialId: 'mat_bot_cross', qty: 2 },
        { parentType: 'product', productCode: 'LGS031', color: '白色', materialId: 'mat_hw_031', qty: 1 },
        { parentType: 'product', productCode: 'LGS033', color: '木色', materialId: 'mat_hw_031', qty: 1 },
        { parentType: 'product', productCode: 'LGS723', color: '白色', materialId: 'mat_723_frame', qty: 1 },
        { parentType: 'product', productCode: 'LGS733', color: '白色', materialId: 'mat_733_frame', qty: 1 },
        // Front and rear members for data quality warning test
        { parentType: 'product', productCode: 'LGS723', color: '白色', materialId: 'mat_front_1', name_zh: '前横杆', spec: '290mm', qty: 2 },
        { parentType: 'product', productCode: 'LGS733', color: '白色', materialId: 'mat_front_2', name_zh: '前横杆', spec: '300mm', qty: 2 },
        { parentType: 'product', productCode: 'LGS723', color: '白色', materialId: 'mat_rear_1', name_zh: '后横杆', spec: '300mm', qty: 2 },
      ],
    },
    productRevisions: {},
  },
};

test('1. Shorthand product confirmation (723)', () => {
  const detected = detectProductShorthand('帮我看一下723用什么布抽');
  assert.equal(detected.isShorthand, true);
  assert.equal(detected.candidateProductId, 'LGS723');
  assert.ok(detected.confirmationPrompt.includes('LGS723'));
});

test('2. Synonyms mapping for 下横梁 -> 底部横杆', () => {
  const concept = resolveConcept('LGS033下横梁用什么编号');
  assert.equal(concept.conceptId, 'bottom_crossbar');
  assert.equal(concept.canonicalZh, '底部横杆');
});

test('3. Color & variant coverage analysis', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);
  const result = knowledge.getBom({ productId: 'LGS031', color: '白色' });
  assert.equal(result.productCode, 'LGS031');
  assert.equal(result.color, '白色');
  assert.ok(Array.isArray(result.rows));
});

test('4. Shared usage groups for五金包', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);
  const res = knowledge.analyzePdm({ query: '帮我看一下所有的五金包有哪一个产品共用吗?' });
  assert.equal(res.countMode, 'shared_hardware_bags');
  assert.ok(res.totalCount >= 1);
  assert.ok(res.results[0].usedInProducts.includes('LGS031'));
  assert.ok(res.results[0].usedInProducts.includes('LGS033'));
});

test('5. Product ranking by unique drawer variants', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);
  const res = knowledge.analyzePdm({ query: '哪一个产品用多种布抽' });
  assert.equal(res.countMode, 'rank_by_drawer_variants');
  assert.ok(Array.isArray(res.results));
});

test('6. Clarification between unique material types vs total BOM quantity', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);
  const res = knowledge.analyzePdm({ query: '哪一个产品有多零件?' });
  assert.equal(res.countMode, 'rank_by_parts');
  assert.ok(res.assumptions.includes('unique material types'));
});

test('7. Canonical product count (柜子)', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);
  const res = knowledge.analyzePdm({ query: '帮我统计一下所有LGS有几个柜子' });
  assert.equal(res.countMode, 'unique_products');
  assert.equal(res.totalCount, 4); // LGS031, LGS033, LGS723, LGS733
});

test('8. Unique metal-frame type count', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);
  const res = knowledge.analyzePdm({ query: '帮我统计一下所有LGS有几种铁框' });
  assert.equal(res.countMode, 'unique_component_types');
  assert.ok(res.totalCount >= 1);
});

test('9. Dimension follow-up filter & axis disclosure (290mm)', () => {
  const dims = parseDimensions('那有几个铁框有宽度290mm');
  assert.equal(dims.length, 1);
  assert.equal(dims[0].numbers[0], 290);
  assert.equal(dims[0].axis, 'width');

  const knowledge = new PdmKnowledge(mockSnapshot);
  const res = knowledge.analyzePdm({ query: '那有几个铁框有宽度290mm', componentFamily: '铁框' });
  assert.equal(res.countMode, 'unique_component_types');
});

test('10. Exact-versus-approximate clarification (657mm vs 659mm)', () => {
  const prox = checkDimensionProximity(657, [659, 658]);
  assert.equal(prox.promptClarification, true);
  assert.ok(prox.clarificationPrompt.includes('659'));
});

test('11. BOM comparison with exact, probable common, and data quality warnings', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);
  const res = knowledge.compareBoms({ productId1: 'LGS723', productId2: 'LGS733' });
  assert.ok(Array.isArray(res.common));
  assert.ok(Array.isArray(res.probableCommon));
  assert.ok(Array.isArray(res.dataQualityWarnings));
  assert.ok(res.summary.probableCommonCount >= 1);
  assert.ok(res.summary.dataQualityWarningCount >= 1);
  assert.equal(res.probableCommon[0].confidence, 'medium');
  assert.ok(res.probableCommon[0].reasons.length > 0);
  assert.ok(res.dataQualityWarnings.some(w => w.type === 'cross_product_equivalence_conflict'));
});

test('12. Amazon query clarification / insufficient evidence policy', () => {
  const route = routePdmIntent({ query: '哪一个产品在亚马逊有最多客诉', availableTools: ['get_marketplace_insights', 'search_pdm', 'analyze_pdm'] });
  assert.ok(route.intent === 'marketplace' || route.intent === 'catalog_analysis');
});

test('13. Local fallback when provider endpoint is unavailable after prefetch', async () => {
  const mockGateway = {
    listModels: () => [{ id: 'test-model', grade: 'A' }],
    chat: async () => {
      const err = new Error('No compatible model endpoint is currently available.');
      err.code = 'AI_NO_COMPATIBLE_ENDPOINT';
      throw err;
    },
  };

  const trustPolicy = createTrustPolicy();
  const knowledge = new PdmKnowledge(mockSnapshot);

  const controller = createAgentController({
    gateway: mockGateway,
    trustPolicy,
    runTool: async (call) => {
      if (call.name === 'compare_boms') {
        return knowledge.compareBoms(call.arguments);
      }
      if (call.name === 'analyze_pdm') {
        return knowledge.analyzePdm(call.arguments);
      }
      return {};
    },
    formatToolFallback: ({ toolCall, toolResult }) => {
      if (toolCall.name === 'compare_boms') {
        return `Scope: ${toolResult.product1.productCode} vs ${toolResult.product2.productCode}\nProbable Common: ${toolResult.summary.probableCommonCount}\nWarnings: ${toolResult.summary.dataQualityWarningCount}`;
      }
      return '';
    },
  });

  const route = {
    intent: 'bom_compare',
    confidence: 'deterministic',
    preferredTool: 'compare_boms',
    entities: { productIds: ['LGS723', 'LGS733'] },
  };

  const result = await controller.runTurn({
    query: '帮我核对一下LGS723和733有什么物料共用',
    route,
    snapshot: mockSnapshot,
    model: 'test-model',
    availableTools: ['compare_boms'],
  });

  assert.equal(result.fallback, true);
  assert.ok(result.text.includes('LGS723 vs LGS733'));
  assert.ok(result.text.includes('Probable Common'));
  assert.ok(result.text.includes('Warnings'));
  assert.ok(!result.text.includes('No compatible model endpoint'));
});

test('Contract validation for analyze_pdm', () => {
  assert.ok(ALLOWED_TOOLS.has('analyze_pdm'));
  const validCall = validateToolCall({
    name: 'analyze_pdm',
    arguments: { query: '所有LGS有几个柜子', countMode: 'count_products' },
  });
  assert.equal(validCall.name, 'analyze_pdm');
});

test('Grounding verifier for analyze_pdm and compare_boms', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);
  const analyzeRes = knowledge.analyzePdm({ query: '所有LGS有几个柜子' });
  const groundingAnalyze = verifyGrounding({
    route: { confidence: 'deterministic', preferredTool: 'analyze_pdm' },
    toolCall: { name: 'analyze_pdm', arguments: { query: '所有LGS有几个柜子' } },
    toolResult: analyzeRes,
  });
  assert.equal(groundingAnalyze.valid, true);

  const compareRes = knowledge.compareBoms({ productId1: 'LGS723', productId2: 'LGS733' });
  const groundingCompare = verifyGrounding({
    route: { confidence: 'deterministic', preferredTool: 'compare_boms', entities: { productIds: ['LGS723', 'LGS733'] } },
    toolCall: { name: 'compare_boms', arguments: { productId1: 'LGS723', productId2: 'LGS733' } },
    toolResult: compareRes,
  });
  assert.equal(groundingCompare.valid, true);
  assert.ok(groundingCompare.requirements.includes('probable equivalence'));
});
