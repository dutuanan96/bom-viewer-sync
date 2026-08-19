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
      LGS834: {
        name_zh: '四抽小柜834',
        colors: ['黑色'],
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
        mat_vertical: {
          id: 'mat_vertical',
          code: 'MAT-VERTICAL-01',
          mat_code: 'MAT-VERTICAL-01',
          name: { zh: '中竖梁' },
          name_zh: '中竖梁',
          spec: { zh: '500x20x20mm' },
          spec_zh: '500x20x20mm',
        },
        mat_carton_small: {
          id: 'mat_carton_small',
          code: 'MAT-CARTON-S',
          mat_code: 'MAT-CARTON-S',
          name: { zh: '纸箱' },
          name_zh: '纸箱',
          spec: { zh: '400x300x200mm' },
          spec_zh: '400x300x200mm',
        },
        mat_carton_large: {
          id: 'mat_carton_large',
          code: 'MAT-CARTON-L',
          mat_code: 'MAT-CARTON-L',
          name: { zh: '纸箱' },
          name_zh: '纸箱',
          spec: { zh: '600x400x300mm' },
          spec_zh: '600x400x300mm',
        },
        mat_vertical_equivalent: {
          id: 'mat_vertical_equivalent',
          code: 'MAT-VERTICAL-02',
          mat_code: 'MAT-VERTICAL-02',
          name: { zh: '中竖梁' },
          name_zh: '中竖梁',
          spec: { zh: '500x20x20mm' },
          spec_zh: '500x20x20mm',
        },
        mat_upper: {
          id: 'mat_upper',
          code: 'MAT-UPPER-01',
          mat_code: 'MAT-UPPER-01',
          name: { zh: '上横梁' },
          name_zh: '上横梁',
          spec: { zh: '400x20x20mm' },
          spec_zh: '400x20x20mm',
        },
      },
      bomEntries: [
        { parentType: 'product', productCode: 'LGS033', color: '木色', materialId: 'mat_bot_cross', qty: 2 },
        { parentType: 'product', productCode: 'LGS031', color: '白色', materialId: 'mat_hw_031', qty: 1 },
        { parentType: 'product', productCode: 'LGS031', color: '\u767d\u8272', materialId: 'mat_drw_A', qty: 2 },
        { parentType: 'product', productCode: 'LGS031', color: '\u9ed1\u8272', materialId: 'mat_drw_A', qty: 2 },
        { parentType: 'product', productCode: 'LGS033', color: '木色', materialId: 'mat_hw_031', qty: 1 },
        { parentType: 'product', productCode: 'LGS723', color: '白色', materialId: 'mat_723_frame', qty: 1 },
        { parentType: 'product', productCode: 'LGS733', color: '白色', materialId: 'mat_733_frame', qty: 1 },
        // Front and rear members for data quality warning test
        { parentType: 'product', productCode: 'LGS723', color: '白色', materialId: 'mat_front_1', name_zh: '前横杆', spec: '290mm', qty: 2 },
        { parentType: 'product', productCode: 'LGS733', color: '白色', materialId: 'mat_front_2', name_zh: '前横杆', spec: '300mm', qty: 2 },
        { parentType: 'product', productCode: 'LGS723', color: '白色', materialId: 'mat_rear_1', name_zh: '后横杆', spec: '300mm', qty: 2 },
        { parentType: 'product', productCode: 'LGS723', color: '白色', materialId: 'mat_vertical', qty: 1 },
        { parentType: 'product', productCode: 'LGS733', color: '白色', materialId: 'mat_vertical', qty: 1 },
        { parentType: 'product', productCode: 'LGS031', color: '白色', materialId: 'mat_carton_small', qty: 1 },
        { parentType: 'product', productCode: 'LGS033', color: '木色', materialId: 'mat_carton_large', qty: 1 },
        { parentType: 'product', productCode: 'LGS033', color: '木色', materialId: 'mat_vertical_equivalent', qty: 1 },
        { parentType: 'product', productCode: 'LGS033', color: '木色', materialId: 'mat_upper', qty: 1 },
        { parentType: 'product', productCode: 'LGS834', color: '黑色', materialId: 'mat_upper', qty: 1 },
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

test('2a. Legacy BOM crossbar aliases resolve to their PDM terminology concept', () => {
  for (const query of ['LGS131\u4e0a\u6a2a\u6881\u524d(\u6709\u5b54)', 'LGS420\u4e0a\u6a2a\u6881\u540e(2\u5b54)']) {
    assert.equal(resolveConcept(query)?.conceptId, 'upper_crossbar', query);
  }
  assert.equal(resolveConcept('LGS131\u4e0b\u6a2a\u6881(\u65e0\u5b54)')?.conceptId, 'bottom_crossbar');
  assert.equal(resolveConcept('LGS723 dùng túi vải nào')?.conceptId, 'drawer_fabric');
  assert.equal(resolveConcept('quy cach day tui LGS333')?.conceptId, 'drawer_bottom');
  assert.equal(resolveConcept('thong ke thung giay')?.conceptId, 'packaging_carton');
});

test('2b. Catalog component usage recognizes vertical-beam terminology', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);

  for (const query of ['所有产品有哪一个产品用竖梁 白色', '有哪一个SKU用竖零件 白色', '竖梁用哪一个产品 白色']) {
    const result = knowledge.analyzePdm({ query });
    assert.equal(result.countMode, 'component_usage', query);
    assert.deepEqual(result.results[0].usedInProducts, ['LGS723', 'LGS733'], query);
  }
});

test('2b1. Catalog fabric-drawer statistics return material usage and specifications', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);

  for (const [query, countMode] of [
    ['帮我统计所有布抽', 'component_usage'],
    ['帮我统计所有布抽规格', 'specification_summary'],
    ['列出所有布抽', 'component_usage'],
  ]) {
    const result = knowledge.analyzePdm({ query });
    assert.equal(result.countMode, countMode, query);
    assert.ok(result.totalCount >= 1, query);
    assert.ok(result.results.some(row => row.spec === '300x200mm'), query);
  }
});

test('2c. Catalog component size ranking finds the product using the largest carton', () => {
  const result = new PdmKnowledge(mockSnapshot).analyzePdm({ query: '哪一个产品用最大的纸箱' });

  assert.equal(result.countMode, 'rank_component_size');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].materialCode, 'MAT-CARTON-L');
  assert.deepEqual(result.results[0].usedInProducts, ['LGS033']);
});

test('2c1. Catalog component usage selects a representative color unless one is requested', () => {
  const snapshot = {
    sourceMetadata: mockSnapshot.sourceMetadata,
    payload: {
      bom: {
        LGS900: { revision: 'V2', colors: ['\u767d\u8272', '\u590d\u53e4\u8272', '\u9ed1\u8272'] },
        LGS901: { effectiveRevision: 'V3', colors: ['\u767d\u8272', '\u590d\u53e4\u8272'] },
      },
      materialDb: {
        materials: {
          cartonBlack: { id: 'cartonBlack', code: 'CARTON-BH', name_zh: '\u7eb8\u7bb1', spec_zh: '900x300x100mm' },
          cartonVintage: { id: 'cartonVintage', code: 'CARTON-KD', name_zh: '\u7eb8\u7bb1', spec_zh: '901x300x100mm' },
          cartonWhite: { id: 'cartonWhite', code: 'CARTON-WH', name_zh: '\u7eb8\u7bb1', spec_zh: '902x300x100mm' },
        },
        bomEntries: [
          { parentType: 'product', productCode: 'LGS900', color: '\u9ed1\u8272', materialId: 'cartonBlack', qty: 1 },
          { parentType: 'product', productCode: 'LGS900', color: '\u590d\u53e4\u8272', materialId: 'cartonVintage', qty: 1 },
          { parentType: 'product', productCode: 'LGS901', color: '\u767d\u8272', materialId: 'cartonWhite', qty: 1 },
          { parentType: 'product', productCode: 'LGS901', color: '\u590d\u53e4\u8272', materialId: 'cartonVintage', qty: 1 },
        ],
      },
      productRevisions: {},
    },
  };
  const knowledge = new PdmKnowledge(snapshot);
  const representative = knowledge.analyzePdm({ query: '\u6240\u6709LGS\u7528\u4ec0\u4e48\u7eb8\u7bb1' });
  const representativeVi = knowledge.analyzePdm({ query: 'th\u1ed1ng k\u00ea gi\u00fap t\u00f4i to\u00e0n b\u1ed9 th\u00f9ng gi\u1ea5y c\u1ee7a c\u00e1c s\u1ea3n ph\u1ea9m' });
  const blackOnly = knowledge.analyzePdm({ query: '\u6240\u6709LGS\u9ed1\u8272\u7528\u4ec0\u4e48\u7eb8\u7bb1' });

  assert.equal(representative.representativeColorPolicy, true);
  assert.deepEqual(representative.results.map(result => result.materialCode), ['CARTON-BH', 'CARTON-KD']);
  assert.deepEqual(representative.results.map(result => result.representativeColors), [['\u9ed1\u8272'], ['\u590d\u53e4\u8272']]);
  assert.deepEqual(representative.results.map(result => result.effectiveRevisions), [['V2'], ['V3']]);
  assert.deepEqual(representativeVi.results, representative.results);
  assert.equal(blackOnly.representativeColorPolicy, false);
  assert.deepEqual(blackOnly.results.map(result => result.materialCode), ['CARTON-BH']);
  assert.deepEqual(blackOnly.colorAvailabilityWarnings, []);
});

test('2d. Confirmed upper-crossbar and comparison follow-ups include other using products', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);
  const upper = knowledge.analyzePdm({
    query: '那个LGS834上横梁有和哪一个产品共用吗？还是只有它独用',
  });
  const vertical = knowledge.analyzePdm({
    query: 'LGS723和LGS733那个竖梁有共用吗？除外那个两产品还有什么产品也用吗？',
  });

  assert.equal(upper.countMode, 'component_usage');
  assert.deepEqual(upper.results[0].usedInProducts, ['LGS033', 'LGS834']);
  assert.equal(vertical.countMode, 'component_usage');
  assert.deepEqual(vertical.results, []);
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
  assert.equal(res.totalCount, 5); // LGS031, LGS033, LGS723, LGS733, LGS834
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

test('13b. Exact catalog question returns local BOM evidence and a learnable strategy', async () => {
  const gateway = {
    listModels: () => [{ id: 'test-model', grade: 'A' }],
    chat: async () => {
      const error = new Error('No compatible model endpoint is currently available.');
      error.code = 'AI_NO_COMPATIBLE_ENDPOINT';
      throw error;
    },
  };
  const knowledge = new PdmKnowledge(mockSnapshot);
  const query = '哪一个产品用最大的纸箱';
  const availableTools = ['analyze_pdm', 'search_pdm'];
  const route = routePdmIntent({ query, availableTools });
  const controller = createAgentController({
    gateway,
    trustPolicy: createTrustPolicy(),
    runTool: async call => knowledge.analyzePdm(call.arguments),
    formatToolFallback: context => formatLocalToolFallback(null, context),
  });

  const result = await controller.runTurn({
    query,
    route,
    snapshot: mockSnapshot,
    model: 'test-model',
    availableTools,
  });

  assert.equal(result.fallback, true);
  assert.ok(result.text.includes('MAT-CARTON-L'));
  assert.ok(result.text.includes('LGS033'));
  assert.deepEqual(result.learning.successfulTools, ['analyze_pdm']);
  assert.ok(!result.text.includes('No compatible model endpoint'));
});

test('13c. Focused BOM fallback preserves material, quantity, and nesting level', () => {
  const text = formatLocalToolFallback(null, {
    toolCall: { name: 'get_bom', arguments: { productId: 'LGS733' } },
    toolResult: {
      productCode: 'LGS733',
      color: '复古色',
      matchedRows: 1,
      rows: [{
        matCode: 'TZJD629825BH',
        nameZh: '10-底脚',
        nameVi: '10-chân đế',
        spec: 'M6x10mm',
        qty: '6',
        level: 2,
      }],
    },
  });

  assert.match(text, /LGS733/);
  assert.match(text, /TZJD629825BH/);
  assert.match(text, /M6x10mm/);
  assert.match(text, /x6/);
  assert.doesNotMatch(text, /BOM level/);
});

test('13c1. Multi-row focused BOM fallback uses a readable table', () => {
  const text = formatLocalToolFallback(null, {
    toolCall: { name: 'get_bom', arguments: { productId: 'LGS333' } },
    toolResult: {
      productCode: 'LGS333',
      matchedRows: 2,
      rows: [
        { matCode: 'BC257', nameZh: 'LGS布抽25.7', spec: '257x282x168mm', qty: '4' },
        { matCode: 'BC350', nameZh: 'LGS布抽35', spec: '350x282x187mm', qty: '6' },
      ],
    },
  });
  assert.match(text, /\| 序号 \| 物料编码 \| 名称 \| 规格 \| 数量 \|/);
  assert.match(text, /\| 2 \| BC350 \|/);
});

test('13c2. Catalog material table discloses representative color and effective revision', () => {
  const translations = {
    'ai.localFallback.notice': '本地结果',
    'ai.localFallback.scope': '范围',
    'ai.localFallback.totalMatches': '总计',
    'ai.localFallback.tableIndex': '序号',
    'ai.localFallback.tableMaterialCode': '物料编码',
    'ai.localFallback.tableName': '名称',
    'ai.localFallback.tableSpec': '规格',
    'ai.localFallback.usedProducts': '使用产品',
    'ai.localFallback.representativeColor': '代表颜色',
    'ai.localFallback.effectiveRevision': '生效版本',
    'ai.localFallback.representativeColorPolicy': '未指定颜色；按代表颜色统计。',
  };
  const text = formatLocalToolFallback(key => translations[key] || key, {
    toolCall: { name: 'analyze_pdm', arguments: { query: '所有LGS用什么纸箱' } },
    toolResult: {
      scope: 'all',
      totalCount: 2,
      representativeColorPolicy: true,
      results: [
        { materialCode: 'CARTON-BH', nameZh: '纸箱', spec: '900x300x100mm', usedInProducts: ['LGS900'], representativeColors: ['黑色'], effectiveRevisions: ['V2'] },
        { materialCode: 'CARTON-KD', nameZh: '纸箱', spec: '901x300x100mm', usedInProducts: ['LGS901'], representativeColors: ['复古色'], effectiveRevisions: ['V3'] },
      ],
    },
  });

  assert.match(text, /\| 序号 \| 物料编码 \| 名称 \| 规格 \| 使用产品 \| 代表颜色 \| 生效版本 \|/);
  assert.match(text, /黑色/);
  assert.match(text, /V3/);
  assert.match(text, /未指定颜色/);
});

test('13c3. Catalog material table states the full count before Excel export', () => {
  const text = formatLocalToolFallback(key => ({
    'ai.localFallback.notice': '本地结果',
    'ai.localFallback.scope': '范围',
    'ai.localFallback.totalMatches': '总计',
    'ai.localFallback.tableIndex': '序号',
    'ai.localFallback.tableMaterialCode': '物料编码',
    'ai.localFallback.tableName': '名称',
    'ai.localFallback.tableSpec': '规格',
    'ai.localFallback.usedProducts': '使用产品',
    'ai.localFallback.resultsTruncated': '共匹配 {total} 条；当前仅显示前 50 条。请下载 Excel 查看全部结果。',
  }[key] || key), {
    toolCall: { name: 'analyze_pdm', arguments: { query: '帮我统计所有泡沫' } },
    toolResult: {
      scope: 'all',
      totalCount: 99,
      truncated: true,
      results: [
        { materialCode: 'PM001', nameZh: '泡沫', spec: '100x100x10mm', usedInProducts: ['LGS031'] },
        { materialCode: 'PM002', nameZh: '泡沫', spec: '200x100x10mm', usedInProducts: ['LGS032'] },
      ],
    },
  });

  assert.match(text, /\| \.\.\. \| \.\.\. \|/);
  assert.match(text, /共匹配 99 条；当前仅显示前 50 条。请下载 Excel 查看全部结果。/);
});

test('13c4. Catalog material table includes comp_code prefix in usedInProductRevisions and uses updated headers', () => {
  const translations = {
    'ai.localFallback.notice': '本地结果',
    'ai.localFallback.scope': '范围',
    'ai.localFallback.totalMatches': '总计',
    'ai.localFallback.tableIndex': '序号',
    'ai.localFallback.tableMaterialCode': '物料编码',
    'ai.localFallback.tableName': '名称',
    'ai.localFallback.tableSpec': '规格',
    'ai.localFallback.usedProductsWithRevision': '[编号] 使用产品（生效版本）',
    'ai.localFallback.representativeColor': '代表产品颜色',
  };
  const text = formatLocalToolFallback(key => translations[key] || key, {
    toolCall: { name: 'analyze_pdm', arguments: { query: '帮我统计所有的布抽' } },
    toolResult: {
      scope: 'all',
      totalCount: 2,
      representativeColorPolicy: true,
      results: [
        {
          materialCode: 'BC257282168BH',
          nameZh: 'LGS布抽25.7x28.2x16.8',
          spec: '257x282x168mm',
          usedInProductRevisions: ['[Y10] LGS333 (V4.1), LGS433 (V4.1), LGS733 (V4.1)'],
          representativeColors: ['黑色'],
        },
        {
          materialCode: 'BCLS129228BH',
          nameZh: '把手',
          spec: '129x22x8mm',
          usedInProductRevisions: ['[2] LGS031 (V3), LGS032 (V3.1)', '[4] LGS033 (V4.1), LGS333 (V4.1)'],
          representativeColors: ['黑色'],
        },
      ],
    },
  });

  assert.match(text, /\| 序号 \| 物料编码 \| 名称 \| 规格 \| \[编号\] 使用产品（生效版本） \| 代表产品颜色 \|/);
  assert.match(text, /\[Y10\] LGS333 \(V4\.1\), LGS433 \(V4\.1\), LGS733 \(V4\.1\)/);
  assert.match(text, /\[2\] LGS031 \(V3\), LGS032 \(V3\.1\)<br>\[4\] LGS033 \(V4\.1\), LGS333 \(V4\.1\)/);
});

test('13d. General fabric-drawer lookup excludes its strips and bottom boards', () => {
  const snapshot = {
    sourceMetadata: mockSnapshot.sourceMetadata,
    payload: {
      bom: {
        LGS999: {
          colors: ['黑色'],
          color_info: {
            黑色: {
              materials: [
                { mat_code: 'DRAWER', name_zh: 'LGS布抽', spec: '300x282x168mm', qty: '1' },
                { mat_code: 'STRIP', name_zh: '280mm布抽条左', spec: '280x25x20mm', qty: '1' },
                { mat_code: 'BOTTOM', name_zh: 'LGS布抽底板', spec: '295x277x3mm', qty: '1' },
              ],
            },
          },
        },
      },
      materialDb: { materials: {} },
    },
  };
  const knowledge = new PdmKnowledge(snapshot);
  const result = knowledge.getBom({ productId: 'LGS999', color: '黑色', query: 'LGS999用什么布抽？' });
  const missingColor = knowledge.getBom({ productId: 'LGS999', color: '白色', query: 'LGS999用什么布抽？' });
  assert.deepEqual(result.rows.map(row => row.matCode), ['DRAWER']);
  assert.equal(missingColor.colorAvailable, false);
  assert.deepEqual(missingColor.availableColors, ['黑色']);
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

test('14. BOM comparison generates structured table with similarity, sticker label diffs, and excludes manuals', () => {
  const compareRes = {
    product1: { productCode: 'LGS733', revision: 'V4.1', color: '复古色' },
    product2: { productCode: 'LGS723', revision: 'V4.1', color: '复古色' },
    summary: {
      commonCount: 2,
      identicalCount: 0,
      onlyProduct1Count: 1,
      onlyProduct2Count: 1,
      probableCommonCount: 0,
      quantityOrUnitDifferenceCount: 1,
      labelDifferenceCount: 1,
      similarityScore: 0.5,
    },
    labelDifferences: [
      {
        matCode: 'LGS723XZQSLBH',
        nameZh: 'LGS723_733-中竖梁-前',
        comp1: 'L2',
        comp2: 'L1',
      },
    ],
    common: [
      {
        matCode: 'LGS723XZQSLBH',
        nameZh: 'LGS723_733-中竖梁-前',
        spec: '198x15x15mm',
        attributeZh: '零件',
        componentCode1: 'L2',
        componentCode2: 'L1',
        componentCodeDifferent: true,
        product1: { quantities: ['2'] },
        product2: { quantities: ['2'] },
      },
      {
        matCode: 'NLPLS6022BZ',
        nameZh: 'M6x22内六角螺丝',
        spec: 'M6x22mm',
        attributeZh: '零件',
        componentCode1: '3',
        componentCode2: '3',
        componentCodeDifferent: false,
        product1: { quantities: ['16'] },
        product2: { quantities: ['12'] },
        quantityOrUnitDifferent: true,
      },
    ],
  };

  const translations = {
    'ai.localFallback.notice': '本地结果',
    'ai.localFallback.scope': '范围',
    'ai.localFallback.similarityScore': 'BOM 相似度',
    'ai.localFallback.commonMaterials': '共同物料',
    'ai.localFallback.identicalMatch': '完全一致',
    'ai.localFallback.packingDifferenceReminder': '包装差异提醒（注意序号标不同）',
    'ai.localFallback.labelDifferenceWarning': '序号标差异',
    'ai.localFallback.tableIndex': '序号',
    'ai.localFallback.tableMaterialCode': '物料编码',
    'ai.localFallback.tableName': '名称',
    'ai.localFallback.tableSpec': '规格',
    'ai.localFallback.totalQuantity': '总用量',
    'ai.localFallback.status': '状态',
    'ai.localFallback.quantityDifference': '用量差异',
  };

  const text = formatLocalToolFallback(key => translations[key] || key, {
    toolCall: { name: 'compare_boms', arguments: { productId1: 'LGS733', productId2: 'LGS723' } },
    toolResult: compareRes,
  });

  assert.match(text, /范围: LGS733 \(V4\.1 复古色\) vs LGS723 \(V4\.1 复古色\)/);
  assert.match(text, /BOM 相似度: 50%/);
  assert.match(text, /共同物料: 2 \(完全一致: 0 \| 用量差异: 1 \| ⚠️ 序号标差异: 1\)/);
  assert.match(text, /📋 \*\*包装差异提醒（注意序号标不同）:\*\*/);
  assert.match(text, /- \*\*LGS723_733-中竖梁-前\*\*: LGS733 \[L2\] ↔ LGS723 \[L1\]/);
  assert.match(text, /\*\*零件\*\* \(2\):/);
  assert.match(text, /\| 序号 \| 物料编码 \| 名称 \| 规格 \| LGS733 总用量 \| LGS723 总用量 \| 状态 \|/);
  assert.match(text, /LGS723XZQSLBH/);
  assert.match(text, /序号标差异 \[L2 vs L1\]/);
  assert.match(text, /用量差异/);
});

test('15. BOM comparison renders dual difference (label + quantity) and callout quantities', () => {
  const compareRes = {
    product1: { productCode: 'LGS723', revision: 'V4.1', color: '复古色' },
    product2: { productCode: 'LGS733', revision: 'V4.1', color: '复古色' },
    summary: {
      commonCount: 1,
      identicalCount: 0,
      quantityOrUnitDifferenceCount: 1,
      labelDifferenceCount: 1,
      similarityScore: 1.0,
    },
    labelDifferences: [
      {
        matCode: 'LGS723XZQSLBH',
        nameZh: 'LGS723_733-中竖梁-前',
        comp1: 'L1',
        comp2: 'L2',
        qty1: '1',
        qty2: '2',
      },
    ],
    common: [
      {
        matCode: 'LGS723XZQSLBH',
        nameZh: 'LGS723_733-中竖梁-前',
        spec: '198x15x15mm',
        attributeZh: '零件',
        componentCode1: 'L1',
        componentCode2: 'L2',
        componentCodeDifferent: true,
        quantityOrUnitDifferent: true,
        product1: { qty: '1' },
        product2: { qty: '2' },
      },
    ],
  };

  const translations = {
    'ai.localFallback.notice': '本地结果',
    'ai.localFallback.scope': '范围',
    'ai.localFallback.similarityScore': 'BOM 相似度',
    'ai.localFallback.commonMaterials': '共同物料',
    'ai.localFallback.identicalMatch': '完全一致',
    'ai.localFallback.packingDifferenceReminder': '包装差异提醒（注意序号标不同）',
    'ai.localFallback.labelDifferenceWarning': '序号标差异',
    'ai.localFallback.tableIndex': '序号',
    'ai.localFallback.tableMaterialCode': '物料编码',
    'ai.localFallback.tableName': '名称',
    'ai.localFallback.tableSpec': '规格',
    'ai.localFallback.totalQuantity': '总用量',
    'ai.localFallback.status': '状态',
    'ai.localFallback.quantityDifference': '用量差异',
  };

  const text = formatLocalToolFallback(key => translations[key] || key, {
    toolCall: { name: 'compare_boms', arguments: { productId1: 'LGS723', productId2: 'LGS733' } },
    toolResult: compareRes,
  });

  assert.match(text, /⚠️ 序号标差异 \[L1 vs L2\] · 用量差异/);
  assert.match(text, /- \*\*LGS723_733-中竖梁-前\*\*: LGS723 \[L1\] ↔ LGS733 \[L2\] \(LGS723 x1 ↔ LGS733 x2\)/);
});

test('16. JinTai rule: Same material at Level 1 vs Level 2 is NOT common', () => {
  const p1 = {
    productCode: 'PROD_A',
    revision: 'V1.0',
    colors: ['默认'],
    color_info: {
      '默认': {
        materials: [
          { mat_code: 'BOLT_M6', name_zh: 'M6螺丝', spec_zh: 'M6x22', _level: 1, qty: '4', unit: 'pcs' },
        ],
      },
    },
  };
  const p2 = {
    productCode: 'PROD_B',
    revision: 'V1.0',
    colors: ['默认'],
    color_info: {
      '默认': {
        materials: [
          {
            mat_code: 'WJB_BAG',
            name_zh: '五金包',
            spec_zh: '一套',
            qty: '1',
            materials: [
              { mat_code: 'BOLT_M6', name_zh: 'M6螺丝', spec_zh: 'M6x22', qty: '4', unit: 'pcs' },
            ],
          },
        ],
      },
    },
  };
  const knowledge = new PdmKnowledge({
    sourceMetadata: { commitSha: '0123456789012345678901234567890123456789' },
    payload: {
      bom: { PROD_A: p1, PROD_B: p2 },
      materialDb: {
        BOLT_M6: { code: 'BOLT_M6', name: { zh: 'M6螺丝' }, spec: { zh: 'M6x22' }, attr: { zh: '五金' } },
        WJB_BAG: { code: 'WJB_BAG', name: { zh: '五金包' }, spec: { zh: '一套' }, attr: { zh: '五金' } },
      },
    },
  });

  const res = knowledge.compareBoms({ productId1: 'PROD_A', productId2: 'PROD_B' });
  assert.equal(res.summary.commonCount, 0, 'Level 1 and Level 2 instances of the same material are not grouped as common');
  assert.equal(res.onlyProduct1.length, 1);
  assert.equal(res.onlyProduct2.length, 1);
});

test('17. Product-specific packaging semantic filter excludes manuals and includes shared packaging', () => {
  const p1 = {
    productCode: 'PROD_A',
    revision: 'V1.0',
    colors: ['默认'],
    color_info: {
      '默认': {
        materials: [
          { mat_code: 'PROD_A_SMS', name_zh: '说明书', spec_zh: 'A4', _level: 1, qty: '1', unit: '本' },
          { mat_code: 'ZHJ001', name_zh: '纸护角', spec_zh: '43x16mm', _level: 1, qty: '4', unit: '个' },
        ],
      },
    },
  };
  const p2 = {
    productCode: 'PROD_B',
    revision: 'V1.0',
    colors: ['默认'],
    color_info: {
      '默认': {
        materials: [
          { mat_code: 'PROD_B_SMS', name_zh: '说明书', spec_zh: 'A4', _level: 1, qty: '1', unit: '本' },
          { mat_code: 'ZHJ002', name_zh: '纸护角', spec_zh: '43x16mm', _level: 1, qty: '4', unit: '个' },
        ],
      },
    },
  };
  const knowledge = new PdmKnowledge({
    sourceMetadata: { commitSha: '0123456789012345678901234567890123456789' },
    payload: {
      bom: { PROD_A: p1, PROD_B: p2 },
      materialDb: {
        PROD_A_SMS: { code: 'PROD_A_SMS', name: { zh: '说明书' }, spec: { zh: 'A4' }, attr: { zh: '包材' } },
        PROD_B_SMS: { code: 'PROD_B_SMS', name: { zh: '说明书' }, spec: { zh: 'A4' }, attr: { zh: '包材' } },
        ZHJ001: { code: 'ZHJ001', name: { zh: '纸护角' }, spec: { zh: '43x16mm' }, attr: { zh: '包材' } },
        ZHJ002: { code: 'ZHJ002', name: { zh: '纸护角' }, spec: { zh: '43x16mm' }, attr: { zh: '包材' } },
      },
    },
  });

  const res = knowledge.compareBoms({ productId1: 'PROD_A', productId2: 'PROD_B' });
  const probableCodes = (res.probableCommon || []).map(item => `${item.product1.matCode}<->${item.product2.matCode}`);
  assert.ok(probableCodes.includes('ZHJ001<->ZHJ002'), 'Generic packaging is matched as probable common');
  assert.ok(!probableCodes.some(c => c.includes('SMS')), 'Product-specific manual is strictly excluded from probable common');
});

test('18. Numeric quantity comparator distinguishes 4+1 from 5 and matches 1+2 to 3', () => {
  const p1 = {
    productCode: 'PROD_A',
    revision: 'V1.0',
    colors: ['默认'],
    color_info: {
      '默认': {
        materials: [
          { mat_code: 'MAT_SPLIT', name_zh: '螺丝A', spec_zh: 'M6', _level: 1, qty: '1', unit: 'pcs' },
          { mat_code: 'MAT_SPLIT', name_zh: '螺丝A', spec_zh: 'M6', _level: 1, qty: '2', unit: 'pcs' },
          { mat_code: 'MAT_SPARE', name_zh: '螺丝B', spec_zh: 'M6', _level: 1, qty: '4+1', unit: 'pcs' },
        ],
      },
    },
  };
  const p2 = {
    productCode: 'PROD_B',
    revision: 'V1.0',
    colors: ['默认'],
    color_info: {
      '默认': {
        materials: [
          { mat_code: 'MAT_SPLIT', name_zh: '螺丝A', spec_zh: 'M6', _level: 1, qty: '3', unit: 'pcs' },
          { mat_code: 'MAT_SPARE', name_zh: '螺丝B', spec_zh: 'M6', _level: 1, qty: '5', unit: 'pcs' },
        ],
      },
    },
  };
  const knowledge = new PdmKnowledge({
    sourceMetadata: { commitSha: '0123456789012345678901234567890123456789' },
    payload: {
      bom: { PROD_A: p1, PROD_B: p2 },
      materialDb: {
        MAT_SPLIT: { code: 'MAT_SPLIT', name: { zh: '螺丝A' }, spec: { zh: 'M6' }, attr: { zh: '五金' } },
        MAT_SPARE: { code: 'MAT_SPARE', name: { zh: '螺丝B' }, spec: { zh: 'M6' }, attr: { zh: '五金' } },
      },
    },
  });

  const res = knowledge.compareBoms({ productId1: 'PROD_A', productId2: 'PROD_B' });
  const splitItem = res.common.find(item => item.matCode === 'MAT_SPLIT');
  const spareItem = res.common.find(item => item.matCode === 'MAT_SPARE');

  assert.equal(splitItem.quantityOrUnitDifferent, false, '1+2 aggregated to 3 matches 3 without quantity difference');
  assert.equal(spareItem.quantityOrUnitDifferent, true, '4+1 (4 normal + 1 spare) differs from 5 (5 normal)');
});

test('19. Label coverage difference: [L1] vs none is detected as 序号标差异', () => {
  const p1 = {
    productCode: 'PROD_A',
    revision: 'V1.0',
    colors: ['默认'],
    color_info: {
      '默认': {
        materials: [
          { mat_code: 'MAT_LABEL', comp_code: 'L1', name_zh: '竖梁', spec_zh: '198mm', _level: 1, qty: '1', unit: 'pcs' },
        ],
      },
    },
  };
  const p2 = {
    productCode: 'PROD_B',
    revision: 'V1.0',
    colors: ['默认'],
    color_info: {
      '默认': {
        materials: [
          { mat_code: 'MAT_LABEL', comp_code: '', name_zh: '竖梁', spec_zh: '198mm', _level: 1, qty: '1', unit: 'pcs' },
        ],
      },
    },
  };
  const knowledge = new PdmKnowledge({
    sourceMetadata: { commitSha: '0123456789012345678901234567890123456789' },
    payload: {
      bom: { PROD_A: p1, PROD_B: p2 },
      materialDb: {
        MAT_LABEL: { code: 'MAT_LABEL', name: { zh: '竖梁' }, spec: { zh: '198mm' }, attr: { zh: '零件' } },
      },
    },
  });

  const res = knowledge.compareBoms({ productId1: 'PROD_A', productId2: 'PROD_B' });
  const item = res.common[0];
  assert.equal(item.componentCodeDifferent, true, 'One side with [L1] and other with no label is flagged as componentCodeDifferent');
  assert.equal(item.componentCode1, 'L1');
  assert.equal(item.componentCode2, '无');
  assert.equal(res.summary.labelDifferenceCount, 1);
});

test('20. Large BOM > 200 rows computes complete Jaccard similarity without pre-truncation', () => {
  const TOTAL_ROWS = 250;
  const materials1 = [];
  const materials2 = [];
  const materialDb = {};

  for (let i = 1; i <= TOTAL_ROWS; i++) {
    const code = `MAT_ROW_${String(i).padStart(3, '0')}`;
    materials1.push({ mat_code: code, name_zh: `物料${i}`, spec_zh: 'STD', _level: 1, qty: '1', unit: 'pcs' });
    materials2.push({ mat_code: code, name_zh: `物料${i}`, spec_zh: 'STD', _level: 1, qty: '1', unit: 'pcs' });
    materialDb[code] = { code, name: { zh: `物料${i}` }, spec: { zh: 'STD' }, attr: { zh: '零件' } };
  }

  const knowledge = new PdmKnowledge({
    sourceMetadata: { commitSha: '0123456789012345678901234567890123456789' },
    payload: {
      bom: {
        PROD_LARGE_A: { productCode: 'PROD_LARGE_A', revision: 'V1.0', colors: ['默认'], color_info: { '默认': { materials: materials1 } } },
        PROD_LARGE_B: { productCode: 'PROD_LARGE_B', revision: 'V1.0', colors: ['默认'], color_info: { '默认': { materials: materials2 } } },
      },
      materialDb,
    },
  });

  const res = knowledge.compareBoms({ productId1: 'PROD_LARGE_A', productId2: 'PROD_LARGE_B' });
  assert.equal(res.product1.totalRows, 250);
  assert.equal(res.product2.totalRows, 250);
  assert.equal(res.summary.commonCount, 250, 'All 250 rows are computed in common count');
  assert.equal(res.summary.similarityScore, 1.0, 'Jaccard similarity is exactly 100% across all 250 rows');
  assert.equal(res.truncated, true, 'Result is marked truncated for UI display bounding');
  assert.equal(res.common.length, 100, 'Display list is safely bounded to MAX_COMPARISON_RESULTS');
});
