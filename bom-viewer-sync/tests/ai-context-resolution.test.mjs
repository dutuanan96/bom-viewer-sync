// tests/ai-context-resolution.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConversationState,
  extractReferenceExpressions,
  resolveReferences,
  applyContextTransition,
  filterReferentsBySemanticFocus,
  inferExpectedReferenceType,
} from '../src/features/ai-assistant/context-resolution.js';

test('normalizeConversationState canonicalizes flat legacy context and nested V2 context', () => {
  // Legacy V1 flat context
  const v1 = {
    productIds: ['LGS723', 'LGS733'],
    materialId: 'MAT_BOLT_M6',
    color: '复古色',
    componentConcept: 'fastener',
    bomCandidates: [{ matCode: 'BC300' }, { matCode: 'BC460' }],
  };
  const norm1 = normalizeConversationState(v1);
  assert.equal(norm1.version, 2);
  assert.deepEqual(norm1.scope.productIds, ['LGS723', 'LGS733']);
  assert.equal(norm1.scope.color, '复古色');
  assert.equal(norm1.focus.componentConcept, 'fastener');
  assert.equal(norm1.focus.materialId, 'MAT_BOLT_M6');
  assert.deepEqual(norm1.referents.materials, [{ type: 'material', id: 'MAT_BOLT_M6' }]);
  assert.deepEqual(norm1.referents.bomCandidates, [{ matCode: 'BC300' }, { matCode: 'BC460' }]);

  // V2 nested context
  const v2 = {
    scope: { productIds: ['LGS723'], color: '黑色' },
    focus: { componentConcept: 'hardware_bag' },
  };
  const norm2 = normalizeConversationState(v2);
  assert.deepEqual(norm2.scope.productIds, ['LGS723']);
  assert.equal(norm2.scope.color, '黑色');
  assert.equal(norm2.focus.componentConcept, 'hardware_bag');
});

test('extractReferenceExpressions identifies pronouns, ordinals, superlatives, and alternatives in VI and ZH', () => {
  // Pronouns
  assert.equal(extractReferenceExpressions('đổi nó dài thêm 3 li')?.kind, 'pronoun');
  assert.equal(extractReferenceExpressions('把它加长3mm')?.kind, 'pronoun');
  assert.equal(extractReferenceExpressions('cái đó thì sao?')?.kind, 'pronoun');

  // Ordinals
  const ordVi = extractReferenceExpressions('cái thứ hai thì giữ nguyên');
  assert.equal(ordVi?.kind, 'ordinal');
  assert.equal(ordVi?.index, 2);

  const ordZh = extractReferenceExpressions('第二个保持不变');
  assert.equal(ordZh?.kind, 'ordinal');
  assert.equal(ordZh?.index, 2);

  // Superlatives
  const supVi = extractReferenceExpressions('con dài nhất ấy');
  assert.equal(supVi?.kind, 'superlative');
  assert.equal(supVi?.property, 'length');
  assert.equal(supVi?.direction, 'max');

  const supZh = extractReferenceExpressions('最长的那根');
  assert.equal(supZh?.kind, 'superlative');
  assert.equal(supZh?.property, 'length');

  // Alternatives
  assert.equal(extractReferenceExpressions('cái kia thì sao')?.kind, 'alternative');
  assert.equal(extractReferenceExpressions('另外一个呢')?.kind, 'alternative');
});

test('filterReferentsBySemanticFocus filters candidates strictly by concept', () => {
  const candidates = [
    { id: 'MAT_FRAME', name_zh: '金属侧框', spec_zh: '198mm' },
    { id: 'MAT_BOLT_M6', name_zh: '外六角螺丝', spec_zh: 'M6x22' },
    { id: 'MAT_CARTON', name_zh: '外箱纸箱', spec_zh: '1000x500x300' },
  ];

  const fasteners = filterReferentsBySemanticFocus({
    candidates,
    componentConcept: 'fastener',
  });
  assert.equal(fasteners.length, 1);
  assert.equal(fasteners[0].id, 'MAT_BOLT_M6');

  const cartons = filterReferentsBySemanticFocus({
    candidates,
    componentConcept: 'packaging_carton',
  });
  assert.equal(cartons.length, 1);
  assert.equal(cartons[0].id, 'MAT_CARTON');
});

test('Superlative resolver filters by semantic concept and refuses to guess from raw ID digits', () => {
  // Case A: Mixed pool with fastener focus -> Must pick MAT_BOLT (M6x22), NOT MAT_FRAME (198mm)
  const stateWithFocus = {
    focus: { componentConcept: 'fastener' },
    referents: {
      materials: [
        { id: 'MAT_FRAME', name_zh: '侧框', spec_zh: '198mm' },
        { id: 'MAT_BOLT_M6', name_zh: '螺丝', spec_zh: 'M6x22' },
      ],
    },
  };

  const res = resolveReferences({
    referenceExpr: { kind: 'superlative', property: 'length', direction: 'max' },
    state: stateWithFocus,
    expectedType: 'material',
  });
  assert.equal(res.needsClarification, false);
  assert.equal(res.resolved.id, 'MAT_BOLT_M6', 'Must filter by fastener focus and ignore longer frame');

  // Case B: Materials without structured spec (e.g. MAT_PART_100, MAT_PART_200) -> Must fail closed!
  const stateNoSpec = {
    focus: { componentConcept: 'fastener' },
    referents: {
      materials: [
        { id: 'MAT_PART_100', name_zh: '螺钉A' },
        { id: 'MAT_PART_200', name_zh: '螺钉B' },
      ],
    },
  };

  const resNoSpec = resolveReferences({
    referenceExpr: { kind: 'superlative', property: 'length', direction: 'max' },
    state: stateNoSpec,
    expectedType: 'material',
  });
  assert.equal(resNoSpec.needsClarification, true, 'Must fail closed when candidates have no structured dimension');
  assert.equal(resNoSpec.clarificationCode, 'cannot_determine_extremum');
});

test('General Pronoun Resolution fails closed when multiple products or materials exist', () => {
  // Case A: Drawing query with 2 products in scope -> Ambiguous
  const state2Products = {
    scope: { productIds: ['LGS723', 'LGS733'] },
    referents: {
      products: [{ id: 'LGS723' }, { id: 'LGS733' }],
    },
  };
  const resDrawing = resolveReferences({
    referenceExpr: { kind: 'pronoun' },
    state: state2Products,
    expectedType: 'document',
  });
  assert.equal(resDrawing.needsClarification, true);
  assert.equal(resDrawing.clarificationCode, 'ambiguous_drawing_target');
  assert.deepEqual(resDrawing.candidates, ['LGS723', 'LGS733']);

  // Case B: Material where-used query with 1 material -> Resolves safely
  const state1Material = {
    scope: { productIds: ['LGS723'] },
    referents: {
      materials: [{ id: 'MAT_BOLT_M6', type: 'material' }],
    },
  };
  const resMat = resolveReferences({
    referenceExpr: { kind: 'pronoun' },
    state: state1Material,
    expectedType: 'material',
  });
  assert.equal(resMat.needsClarification, false);
  assert.equal(resMat.resolved.id, 'MAT_BOLT_M6');
});

test('pendingClarification preserves resume frame and resolves ordinal selection', () => {
  const pendingState = {
    scope: { productIds: ['LGS723'] },
    pendingClarification: {
      type: 'ambiguous_material_reference',
      candidates: [
        { id: 'MAT_BOLT_M6', spec_zh: 'M6x22' },
        { id: 'MAT_BOLT_M8', spec_zh: 'M8x25' },
      ],
      resume: {
        intent: 'ecn_impact',
        preferredTool: 'analyze_ecn_impact',
        frame: {
          change: { field: 'length', operator: 'delta', value: 3, unit: 'mm' },
          componentConcept: 'fastener',
        },
      },
    },
  };

  const res = resolveReferences({
    referenceExpr: { kind: 'ordinal', index: 2 },
    state: pendingState,
  });

  assert.equal(res.needsClarification, false);
  assert.equal(res.resolved.id, 'MAT_BOLT_M8');
  assert.ok(res.resumeFrame, 'Resume frame must be preserved');
  assert.equal(res.resumeFrame.intent, 'ecn_impact');
});

test('applyContextTransition clears stale material, stale document, and resets color on scope switch', () => {
  const prevState = {
    scope: { productIds: ['LGS723', 'LGS733'], color: '黑色' },
    focus: { materialId: 'MAT_BOLT_M6', componentConcept: 'fastener', documentType: 'engineering_drawing' },
    referents: {
      products: [{ id: 'LGS723' }, { id: 'LGS733' }],
      materials: [{ id: 'MAT_BOLT_M6' }],
    },
  };

  // User switches product scope to LGS031 without specifying material or color
  const nextState = applyContextTransition({
    state: prevState,
    explicitEntities: { productIds: ['LGS031'] },
  });

  assert.deepEqual(nextState.scope.productIds, ['LGS031']);
  assert.equal(nextState.scope.color, null, 'Color must be reset on scope switch');
  assert.equal(nextState.focus.materialId, null, 'Stale materialId must be cleared on scope switch');
  assert.deepEqual(nextState.referents.materials, [], 'Stale material referents must be cleared');
  assert.equal(nextState.focus.documentType, null, 'Stale documentType must be cleared');
});
