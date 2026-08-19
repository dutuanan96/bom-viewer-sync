import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeEcnImpact, findMaterialOccurrences } from '../src/features/ai-assistant/ecn-impact-engine.js';
import { routePdmIntent, PDM_INTENTS } from '../src/features/ai-assistant/intent-router.js';
import { PdmKnowledge } from '../src/features/ai-assistant/pdm-knowledge.js';

const mockSnapshot = {
  sourceMetadata: { commitSha: '0123456789012345678901234567890123456789' },
  payload: {
    bom: {
      LGS723: {
        productCode: 'LGS723',
        revision: 'V4.1',
        colors: ['复古色', '黑色'],
        color_info: {
          '复古色': {
            materials: [
              { mat_code: 'MAT_BOLT_M6', comp_code: '3', name_zh: 'M6螺丝', spec_zh: 'M6x22', _level: 2, qty: '12', unit: 'pcs' },
              { mat_code: 'MAT_FRAME_VERTICAL', comp_code: 'L1', name_zh: '中竖梁-前', spec_zh: '198mm', _level: 1, qty: '1', unit: 'pcs' },
              { mat_code: 'CARTON_723', name_zh: '外箱', spec_zh: '900x400x150mm', _level: 1, qty: '1', unit: '个' },
            ],
          },
          '黑色': {
            materials: [
              { mat_code: 'MAT_BOLT_M6', comp_code: '3', name_zh: 'M6螺丝', spec_zh: 'M6x22', _level: 2, qty: '12', unit: 'pcs' },
              { mat_code: 'MAT_FRAME_VERTICAL', comp_code: 'L1', name_zh: '中竖梁-前', spec_zh: '198mm', _level: 1, qty: '1', unit: 'pcs' },
            ],
          },
        },
      },
      LGS733: {
        productCode: 'LGS733',
        revision: 'V4.1',
        colors: ['复古色'],
        color_info: {
          '复古色': {
            materials: [
              { mat_code: 'MAT_BOLT_M6', comp_code: '3', name_zh: 'M6螺丝', spec_zh: 'M6x22', _level: 2, qty: '16', unit: 'pcs' },
              { mat_code: 'MAT_FRAME_VERTICAL', comp_code: 'L2', name_zh: '中竖梁-前', spec_zh: '198mm', _level: 1, qty: '2', unit: 'pcs' },
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
              { mat_code: 'CARTON_723', name_zh: '外箱', spec_zh: '900x400x150mm', _level: 1, qty: '1', unit: '个' },
            ],
          },
        },
      },
    },
    materialDb: {
      materials: {
        MAT_BOLT_M6: { id: 'MAT_BOLT_M6', code: 'MAT_BOLT_M6', name: { zh: 'M6螺丝' }, spec: { zh: 'M6x22' }, attr: { zh: '五金' }, unit: 'pcs' },
        MAT_FRAME_VERTICAL: { id: 'MAT_FRAME_VERTICAL', code: 'MAT_FRAME_VERTICAL', name: { zh: '中竖梁-前' }, spec: { zh: '198mm' }, attr: { zh: '零件' }, unit: 'pcs' },
        CARTON_723: { id: 'CARTON_723', code: 'CARTON_723', name: { zh: '外箱' }, spec: { zh: '900x400x150mm' }, attr: { zh: '包材' }, unit: '个' },
      },
    },
  },
};

// ==========================================
// TEST 1: HARDWARE ECN IMPACT (五金变更)
// ==========================================
test('ECN Test 1: Hardware change impact analysis (M6x22 -> M6x25)', () => {
  const result = analyzeEcnImpact({
    targetMaterialId: 'MAT_BOLT_M6',
    newSpec: 'M6x25',
    newQty: '14',
    reason: 'ECN-2026-0819: 增强结构抗拉强度，统一换用M6x25螺丝',
    snapshot: mockSnapshot,
  });

  assert.equal(result.success, true);
  assert.equal(result.totalAffectedProducts, 2, 'Affects both LGS723 and LGS733');
  assert.equal(result.totalAffectedOccurrences, 3, '3 color variants across 2 products');

  // Verify Hardware Stream is activated
  assert.equal(result.impactStreams.hardwareStream.affected, true);
  assert.ok(result.impactStreams.hardwareStream.items.some(i => i.includes('M6x25')));
  assert.ok(result.impactStreams.hardwareStream.actions.some(a => a.includes('五金包')));
  assert.ok(result.impactStreams.hardwareStream.actions.some(a => a.includes('采购')));

  // Verify Proposal Operations are generated
  assert.ok(result.proposalOperations.length > 0);
  assert.ok(result.proposalOperations.some(op => op.operationType === 'update_material_field'));
  assert.ok(result.proposalOperations.some(op => op.operationType === 'update_bom_quantity'));
});

// ==========================================
// TEST 2: STRUCTURAL FRAME ECN IMPACT (结构件变更)
// ==========================================
test('ECN Test 2: Structural frame change impact analysis (198mm -> 200mm)', () => {
  const result = analyzeEcnImpact({
    targetMaterialId: 'MAT_FRAME_VERTICAL',
    newSpec: '200mm',
    newLabel: 'L1-NEW',
    snapshot: mockSnapshot,
  });

  assert.equal(result.success, true);
  assert.equal(result.impactStreams.drawingStream.affected, true);
  assert.ok(result.impactStreams.drawingStream.actions.some(a => a.includes('2D工程图纸')));
  assert.ok(result.impactStreams.drawingStream.actions.some(a => a.includes('CNC')));
  assert.ok(result.impactStreams.drawingStream.actions.some(a => a.includes('QC')));

  // Verify Label Stream
  assert.equal(result.impactStreams.labelStream.affected, true);
  assert.ok(result.impactStreams.labelStream.actions.some(a => a.includes('说明书')));
});

// ==========================================
// TEST 3: PACKAGING CARTON ECN IMPACT (包材变更)
// ==========================================
test('ECN Test 3: Packaging carton change impact analysis', () => {
  const result = analyzeEcnImpact({
    targetMaterialId: 'CARTON_723',
    newSpec: '920x420x160mm',
    snapshot: mockSnapshot,
  });

  assert.equal(result.success, true);
  assert.equal(result.totalAffectedProducts, 2, 'Affects LGS723 and LGS031');
  assert.equal(result.impactStreams.packagingStream.affected, true);
  assert.ok(result.impactStreams.packagingStream.actions.some(a => a.includes('装柜')));
});

// ==========================================
// TEST 4: SCOPED ECN IMPACT (指定产品范围)
// ==========================================
test('ECN Test 4: Scoped ECN impact limits to targeted products', () => {
  const result = analyzeEcnImpact({
    targetMaterialId: 'MAT_BOLT_M6',
    targetProductIds: ['LGS723'],
    newQty: '15',
    snapshot: mockSnapshot,
  });

  assert.equal(result.success, true);
  assert.equal(result.totalAffectedProducts, 1, 'Only LGS723 is in scope');
  assert.equal(result.affectedProducts[0].productCode, 'LGS723');
});

// ==========================================
// TEST 5: PDM KNOWLEDGE INTEGRATION
// ==========================================
test('ECN Test 5: PdmKnowledge class exposes analyzeEcnImpact', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);
  const result = knowledge.analyzeEcnImpact({
    targetMaterialId: 'MAT_BOLT_M6',
    newSpec: 'M6x25',
  });

  assert.equal(result.success, true);
  assert.equal(result.targetMaterial.code, 'MAT_BOLT_M6');
});

// ==========================================
// TEST 6: INTENT ROUTING FOR ECN PROMPTS (VI & ZH)
// ==========================================
test('ECN Test 6: Intent Router captures ECN impact questions in VI and ZH', () => {
  const queries = [
    'Nếu đổi ốc MAT_BOLT_M6 sang M6x25 thì ảnh hưởng những sản phẩm nào?',
    'Thay đổi kỹ thuật MAT_BOLT_M6 ảnh hưởng gì',
    '如果更换 MAT_BOLT_M6 会影响哪些产品？',
    'MAT_BOLT_M6 工程变更影响分析',
    '如果M6×22改为M6×25有什么影响',
    'Nếu đổi M6x22 thành M6x25 có ảnh hưởng gì',
  ];

  for (const query of queries) {
    const route = routePdmIntent({
      query,
      availableTools: ['analyze_ecn_impact', 'where_used', 'search_pdm'],
    });
    assert.equal(route.preferredTool, 'analyze_ecn_impact', `Failed to route ECN query: "${query}"`);
    assert.equal(route.intent, PDM_INTENTS.ECN_IMPACT);
  }
});

// ==========================================
// TEST 7: SPEC-BASED ECN RESOLUTION ON NESTED LEVEL 2 BOM
// ==========================================
test('ECN Test 7: Spec-based change resolves material and finds affected products across levels', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);
  const result = knowledge.analyzeEcnImpact({
    targetMaterialId: 'M6x22',
    newSpec: 'M6x25',
  });

  assert.equal(result.success, true);
  assert.equal(result.targetMaterial.code, 'MAT_BOLT_M6');
  assert.equal(result.totalAffectedProducts, 2);
  assert.equal(result.impactStreams.hardwareStream.affected, true);
});

// ==========================================
// TEST 8: P0-1 NO FALSE ENTITY FABRICATION ON VAGUE PHRASING
// ==========================================
test('ECN Test 8: Router does not fabricate junk entity IDs like "i" or "lo"', () => {
  const vagueQuery = 'đổi sang loại ốc dài hơn 3 li thì thế nào?';
  const route = routePdmIntent({
    query: vagueQuery,
    availableTools: ['analyze_ecn_impact', 'search_pdm'],
  });
  // Must NOT extract "i" or "lo" as material ID
  assert.notEqual(route.entities?.targetMaterialId, 'i');
  assert.notEqual(route.entities?.newSpec, 'lo');
});

// ==========================================
// TEST 9: P0-2 CASING PRESERVATION FOR MATERIAL IDS
// ==========================================
test('ECN Test 9: Preserves uppercase MAT_ prefix and resolves correctly', () => {
  const query = 'Nếu đổi ốc MAT_BOLT_M6 sang M6x25 thì ảnh hưởng gì?';
  const route = routePdmIntent({
    query,
    availableTools: ['analyze_ecn_impact'],
  });
  assert.equal(route.entities.targetMaterialId, 'MAT_BOLT_M6');

  const knowledge = new PdmKnowledge(mockSnapshot);
  const result = knowledge.analyzeEcnImpact({
    targetMaterialId: route.entities.targetMaterialId,
    newSpec: 'M6x25',
  });
  assert.equal(result.success, true);
  assert.equal(result.targetMaterial.code, 'MAT_BOLT_M6');
  assert.equal(result.totalAffectedProducts, 2);
});

// ==========================================
// TEST 10: P0-3 FAIL CLOSED WHEN MATERIAL UNRESOLVED OR NOT USED
// ==========================================
test('ECN Test 10: analyzeEcnImpact fails closed on missing or unused material', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);
  
  // Case A: completely unknown material ID
  const resUnresolved = knowledge.analyzeEcnImpact({
    targetMaterialId: 'UNKNOWN_BOLT_999',
    newSpec: 'M6x30',
  });
  assert.equal(resUnresolved.success, false);
  assert.equal(resUnresolved.needsClarification, true);
  assert.equal(resUnresolved.clarificationCode, 'material_not_resolved');

  // Case B: existing database material that is nowhere in BOM
  const unusedMockSnapshot = {
    payload: {
      bom: mockSnapshot.payload.bom,
      materialDb: {
        materials: {
          ...mockSnapshot.payload.materialDb.materials,
          UNUSED_MAT_123: { id: 'UNUSED_MAT_123', code: 'UNUSED_MAT_123', name: { zh: '未使用物料' } },
        },
      },
    },
  };
  const unusedKnowledge = new PdmKnowledge(unusedMockSnapshot);
  const resUnused = unusedKnowledge.analyzeEcnImpact({
    targetMaterialId: 'UNUSED_MAT_123',
    newSpec: 'M6x30',
  });
  assert.equal(resUnused.success, false);
  assert.equal(resUnused.needsClarification, true);
  assert.equal(resUnused.clarificationCode, 'material_not_used');
});

// ==========================================
// TEST 11: RELATIVE ECN PROPOSAL GENERATION & FAIL CLOSED
// ==========================================
test('ECN Test 11: Relative change updates proposalOperations with resolvedNewSpec and fails closed on non-applicable spec', () => {
  const knowledge = new PdmKnowledge(mockSnapshot);

  // Case A: Valid relative change (+3mm on M6x22 -> M6x25)
  const resValid = knowledge.analyzeEcnImpact({
    targetMaterialId: 'MAT_BOLT_M6',
    change: {
      field: 'length',
      operator: 'delta',
      value: 3,
      unit: 'mm',
    },
  });

  assert.equal(resValid.success, true);
  assert.equal(resValid.changeSummary.newSpec, 'M6x25');
  assert.ok(
    resValid.proposalOperations.some(
      op => op.operationType === 'update_material_field' && op.value.zh === 'M6x25'
    ),
    'Must contain update_material_field with resolved newSpec M6x25',
  );
  assert.ok(
    resValid.impactStreams.hardwareStream.items.some(it => it.includes('M6x25')),
    'Hardware stream must mention M6x25',
  );

  // Case B: Non-applicable spec format (e.g. board/fabric material)
  const resNonApplicable = knowledge.analyzeEcnImpact({
    targetMaterialId: 'MAT_FRAME_VERTICAL',
    change: {
      field: 'length',
      operator: 'delta',
      value: 3,
      unit: 'mm',
    },
  });

  assert.equal(resNonApplicable.success, false);
  assert.equal(resNonApplicable.needsClarification, true);
  assert.equal(resNonApplicable.clarificationCode, 'relative_change_not_applicable');

  // Case C: Target material not specified
  const resNoTarget = knowledge.analyzeEcnImpact({
    targetMaterialId: '',
    change: {
      field: 'length',
      operator: 'delta',
      value: 3,
      unit: 'mm',
    },
  });

  assert.equal(resNoTarget.success, false);
  assert.equal(resNoTarget.needsClarification, true);
  assert.equal(resNoTarget.clarificationCode, 'target_not_specified');
});


