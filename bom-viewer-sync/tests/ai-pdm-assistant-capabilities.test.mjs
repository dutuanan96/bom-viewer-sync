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
