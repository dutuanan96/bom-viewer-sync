// src/features/ai-assistant/context-resolution.js
// Referential Resolution, Context State Machine, and Anti-Stale Safety Layer for JinTai PDM.

import { foldPdmText } from './pdm-terminology.js';

/**
 * Normalizes any raw conversation context (legacy V1 flat fields or V2 nested state)
 * into a canonical Version 2 Conversation State object.
 */
export function normalizeConversationState(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    raw = {};
  }

  const rawScope = (raw.scope && typeof raw.scope === 'object' && !Array.isArray(raw.scope)) ? raw.scope : {};
  const rawFocus = (raw.focus && typeof raw.focus === 'object' && !Array.isArray(raw.focus)) ? raw.focus : {};
  const rawReferents = (raw.referents && typeof raw.referents === 'object' && !Array.isArray(raw.referents)) ? raw.referents : {};

  // Scope canonicalization
  const scopeProductIds = Array.isArray(rawScope.productIds)
    ? rawScope.productIds
    : Array.isArray(raw.productIds)
      ? raw.productIds
      : [];
  const scopeColor = typeof rawScope.color === 'string' && rawScope.color.trim()
    ? rawScope.color.trim()
    : typeof raw.color === 'string' && raw.color.trim()
      ? raw.color.trim()
      : null;
  const scopeRevisions = Array.isArray(rawScope.revisions)
    ? rawScope.revisions
    : Array.isArray(raw.revisions)
      ? raw.revisions
      : [];

  // Focus canonicalization
  const focusComponentConcept = typeof rawFocus.componentConcept === 'string' && rawFocus.componentConcept.trim()
    ? rawFocus.componentConcept.trim()
    : typeof raw.componentConcept === 'string' && raw.componentConcept.trim()
      ? raw.componentConcept.trim()
      : null;
  const focusMaterialId = typeof rawFocus.materialId === 'string' && rawFocus.materialId.trim()
    ? rawFocus.materialId.trim()
    : typeof raw.materialId === 'string' && raw.materialId.trim()
      ? raw.materialId.trim()
      : null;
  const focusMetric = typeof rawFocus.metric === 'string' && rawFocus.metric.trim()
    ? rawFocus.metric.trim()
    : typeof raw.metric === 'string' && raw.metric.trim()
      ? raw.metric.trim()
      : null;
  const focusDocumentType = typeof rawFocus.documentType === 'string' && rawFocus.documentType.trim()
    ? rawFocus.documentType.trim()
    : null;

  return {
    version: 2,
    activeTask: typeof raw.activeTask === 'string' ? raw.activeTask : (typeof raw.activeIntent === 'string' ? raw.activeIntent : null),
    scope: {
      productIds: [...new Set(scopeProductIds.filter(id => typeof id === 'string' && id.trim()))],
      color: scopeColor,
      revisions: [...new Set(scopeRevisions.filter(r => typeof r === 'string' && r.trim()))],
    },
    focus: {
      componentConcept: focusComponentConcept,
      materialId: focusMaterialId,
      metric: focusMetric,
      documentType: focusDocumentType,
    },
    referents: normalizeReferents(rawReferents, {
      productIds: scopeProductIds,
      materialId: focusMaterialId,
      bomCandidates: raw.bomCandidates,
    }),
    pendingClarification: (raw.pendingClarification && typeof raw.pendingClarification === 'object') ? raw.pendingClarification : null,
    provenance: (raw.provenance && typeof raw.provenance === 'object') ? { ...raw.provenance } : {},
    turnCount: typeof raw.turnCount === 'number' ? raw.turnCount : 0,
  };
}

/**
 * Normalizes referent sets ensuring typed entities.
 */
function normalizeReferents(referents = {}, fallback = {}) {
  const products = Array.isArray(referents.products)
    ? referents.products.map(p => typeof p === 'string' ? { type: 'product', id: p } : p)
    : (fallback.productIds || []).map(id => ({ type: 'product', id }));

  const materials = Array.isArray(referents.materials)
    ? referents.materials.map(m => typeof m === 'string' ? { type: 'material', id: m } : m)
    : fallback.materialId
      ? [{ type: 'material', id: fallback.materialId }]
      : [];

  const bomCandidates = Array.isArray(referents.bomCandidates)
    ? referents.bomCandidates
    : (Array.isArray(fallback.bomCandidates) ? fallback.bomCandidates : []);
  const documents = Array.isArray(referents.documents) ? referents.documents : [];
  const lastResolvedEntity = referents.lastResolvedEntity || null;

  return {
    products,
    materials,
    bomCandidates,
    documents,
    lastResolvedEntity,
  };
}

// Multilingual Reference Expression Patterns (VI & ZH)
const DUAL_PATTERN = /(?:hai\s*cái(?:\s*này)?|hai\s*con(?:\s*này)?|cả\s*hai|các\s*mẫu\s*này|these\s*two|both|这(?:两|俩)(?:个|款|种)?)/iu;
const PRONOUN_PATTERN = /(?:^|[^\w\u4e00-\u9fa5])(nó|cái đó|nó ấy|em nó|cái này|nó đây|it|that one|this one)(?:[^\w\u4e00-\u9fa5]|$)|(?:把|对|给|将)?(它|这个|那个|其|它自身|这件|那件)/iu;
const ORDINAL_PATTERN = /(?:cái|thứ|loại|mẫu|bản|phần)\s*(thứ\s*)?([123456789]|nhất|hai|ba|bốn|năm|sáu|đầu|sau|nhì)|(?:第\s*([一二三四五六七八九十\d]+)\s*(?:个|种|款|项|条|份|类)?)|(?:(?:first|second|third|fourth)\b)/iu;
const SUPERLATIVE_PATTERN = /(?:(?:dài|ngắn|to|nhỏ|nhiều|ít|dày|mỏng)\s*nhất)|(?:最\s*(?:长|短|大|小|多|少|厚|薄|宽|高|深))|(?:longest|shortest|largest|thickest|biggest)\b/iu;
const COMPARATIVE_PATTERN = /(?:(?:dài|ngắn|to|nhỏ|nhiều|ít|dày|mỏng)\s*hơn)|(?:更\s*(?:长|短|大|小|多|少|厚|薄|宽|高|深))|(?:longer|shorter|larger|bigger)\b/iu;
const DEMONSTRATIVE_ALT_PATTERN = /(?:cái\s*kia|con\s*kia|mẫu\s*kia|loại\s*kia|con\s*còn\s*lại|còn\s*lại|thằng\s*còn\s*lại|cái\s*khác|loại\s*khác|另外一个|另一个|剩下的|其它的|其他的|the other|remaining|other one)/iu;

/**
 * Filters candidates based on semantic concept (fastener, metal_frame, carton, etc.)
 */
export function filterReferentsBySemanticFocus({ candidates = [], componentConcept = null, expectedType = null }) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  if (!componentConcept && !expectedType) return candidates;

  const conceptPatterns = {
    fastener: /(?:ốc|vít|bu\s*lông|螺丝|螺钉|螺母|垫片|bolt|screw|fastener|MAT_BOLT|MAT_SCREW|\bM\d+|\bST\d+)/i,
    metal_frame: /(?:khung|thanh\s*sắt|sắt|frame|metal|MAT_FRAME|铁框|金属框|支撑框|侧框)/i,
    packaging_carton: /(?:carton|thùng|纸箱|纸盒|MAT_CARTON)/i,
    drawer_fabric: /(?:vải|ngăn\s*kéo|túi|布抽|布袋|fabric|drawer)/i,
    crossbar: /(?:thanh\s*ngang|xà|crossbar|横梁|横杆)/i,
    upper_crossbar: /(?:thanh\s*ngang\s*trên|upper\s*crossbar|上横梁|上横杆)/i,
    bottom_crossbar: /(?:thanh\s*ngang\s*dưới|bottom\s*crossbar|下横梁|下横杆|底部横梁)/i,
    vertical_beam: /(?:thanh\s*đứng|cột|vertical|竖梁)/i,
    hardware_bag: /(?:ngũ\s*kim|phụ\s*kiện|五金包|配件包|hardware)/i,
  };

  const pattern = componentConcept ? conceptPatterns[componentConcept] : null;

  return candidates.filter(item => {
    if (expectedType === 'material' && item.type && item.type !== 'material') return false;
    if (expectedType === 'product' && item.type && item.type !== 'product') return false;
    if (expectedType === 'document' && item.type && item.type !== 'document') return false;

    if (!pattern) return true;

    const id = String(item.id || item.mat_code || item.code || '');
    const name = String(item.name_zh || item.name?.zh || item.name || '');
    const spec = String(item.spec_zh || item.spec?.zh || item.spec || '');
    const fullText = `${id} ${name} ${spec}`;

    return pattern.test(fullText);
  });
}

/**
 * Extracts structured reference expressions from utterance.
 */
export function extractReferenceExpressions(text = '') {
  const raw = String(text || '').trim();
  const folded = foldPdmText(raw);

  // Check Dual reference (both / these two)
  const dualMatch = raw.match(DUAL_PATTERN) || folded.match(DUAL_PATTERN);
  if (dualMatch) {
    return {
      type: 'reference_expression',
      kind: 'dual',
      surface: dualMatch[0].trim(),
    };
  }

  // Check Ordinal
  const ordMatch = raw.match(ORDINAL_PATTERN) || folded.match(ORDINAL_PATTERN);
  if (ordMatch) {
    let index = 1;
    const zhNum = ordMatch[3];
    const viNum = ordMatch[2] || ordMatch[0];
    if (zhNum) {
      const zhMap = { '一': 1, '1': 1, '二': 2, '两': 2, '2': 2, '三': 3, '3': 3, '四': 4, '4': 4 };
      index = zhMap[zhNum] || parseInt(zhNum, 10) || 1;
    } else if (viNum) {
      if (/1|nhất|đầu/i.test(viNum)) index = 1;
      else if (/2|hai|nhì|sau/i.test(viNum)) index = 2;
      else if (/3|ba/i.test(viNum)) index = 3;
      else if (/4|bốn|tư/i.test(viNum)) index = 4;
      else index = parseInt(viNum, 10) || 1;
    }
    return {
      type: 'reference_expression',
      kind: 'ordinal',
      surface: ordMatch[0].trim(),
      index,
    };
  }

  // Check Superlative / Comparative
  const supMatch = raw.match(SUPERLATIVE_PATTERN) || folded.match(SUPERLATIVE_PATTERN);
  if (supMatch) {
    let property = 'length';
    let direction = 'max';
    const s = supMatch[0];
    if (/ngắn|短|short/i.test(s)) { property = 'length'; direction = 'min'; }
    else if (/dài|长|long/i.test(s)) { property = 'length'; direction = 'max'; }
    else if (/to|lớn|大|large|big/i.test(s)) { property = 'size'; direction = 'max'; }
    else if (/nhỏ|小|small/i.test(s)) { property = 'size'; direction = 'min'; }
    else if (/nhiều|多|most/i.test(s)) { property = 'quantity'; direction = 'max'; }
    return {
      type: 'reference_expression',
      kind: 'superlative',
      surface: supMatch[0].trim(),
      property,
      direction,
    };
  }

  const compMatch = raw.match(COMPARATIVE_PATTERN) || folded.match(COMPARATIVE_PATTERN);
  if (compMatch) {
    let property = 'length';
    let direction = 'greater';
    const s = compMatch[0];
    if (/ngắn|短|shorter/i.test(s)) { property = 'length'; direction = 'lesser'; }
    else if (/dài|长|longer/i.test(s)) { property = 'length'; direction = 'greater'; }
    return {
      type: 'reference_expression',
      kind: 'comparative',
      surface: compMatch[0].trim(),
      property,
      direction,
    };
  }

  // Check Demonstrative / Alternative
  const altMatch = raw.match(DEMONSTRATIVE_ALT_PATTERN) || folded.match(DEMONSTRATIVE_ALT_PATTERN);
  if (altMatch) {
    return {
      type: 'reference_expression',
      kind: 'alternative',
      surface: altMatch[0].trim(),
    };
  }

  // Check Pronoun
  const proMatch = raw.match(PRONOUN_PATTERN) || folded.match(PRONOUN_PATTERN);
  if (proMatch) {
    return {
      type: 'reference_expression',
      kind: 'pronoun',
      surface: (proMatch[1] || proMatch[2] || proMatch[0]).trim(),
    };
  }

  return null;
}

/**
 * Resolves a reference expression against the canonical conversation state.
 * Strictly Fail-Closed: returns single resolved entity if unique, else needsClarification: true.
 */
export function resolveReferences({
  referenceExpr,
  state,
  expectedType = null,
  semanticFocus = null,
} = {}) {
  const normState = normalizeConversationState(state);
  if (!referenceExpr) {
    return { resolved: null, needsClarification: false };
  }

  const { kind, index, direction } = referenceExpr;
  const activeConcept = semanticFocus || normState.focus.componentConcept;

  // 1. Pending clarification lock resolution
  if (normState.pendingClarification) {
    const candidates = Array.isArray(normState.pendingClarification.candidates)
      ? normState.pendingClarification.candidates
      : [];
    if (kind === 'ordinal') {
      const target = candidates[index - 1];
      if (target) {
        return {
          resolved: target,
          resolvedType: target.type || 'material',
          resumeFrame: normState.pendingClarification.resume || null,
          needsClarification: false,
        };
      }
    } else if (kind === 'alternative') {
      const last = normState.referents.lastResolvedEntity;
      if (last && candidates.length === 2) {
        const other = candidates.find(c => (c.id || c) !== (last.id || last));
        if (other) {
          return {
            resolved: other,
            resolvedType: other.type || 'material',
            resumeFrame: normState.pendingClarification.resume || null,
            needsClarification: false,
          };
        }
      }
      return {
        resolved: null,
        needsClarification: true,
        clarificationCode: normState.pendingClarification?.type || 'reference_ambiguous',
        candidates: candidates.map(c => c.id || c),
      };
    }
  }

  // 2. Candidate collection & semantic focus filtering
  const rawMaterialCandidates = normState.referents.materials || [];
  const rawBomCandidates = normState.referents.bomCandidates || [];
  const productCandidates = (normState.referents.products && normState.referents.products.length > 0)
    ? normState.referents.products
    : (normState.scope.productIds || []).map(id => ({ id, type: 'product' }));

  // Dual reference resolution (e.g. "hai cái này", "these two", "这两个")
  if (kind === 'dual') {
    const products = normState.scope.productIds.length >= 2
      ? normState.scope.productIds
      : productCandidates.map(p => p.id || p);
    if (products.length >= 2) {
      return {
        resolved: products,
        resolvedType: 'products',
        needsClarification: false,
      };
    }
  }

  const materialCandidates = filterReferentsBySemanticFocus({
    candidates: rawMaterialCandidates,
    componentConcept: activeConcept,
    expectedType: 'material',
  });

  const bomCandidates = filterReferentsBySemanticFocus({
    candidates: rawBomCandidates,
    componentConcept: activeConcept,
  });

  // Superlative / Comparative resolution (e.g. "con dài nhất", "con dài hơn")
  if ((kind === 'superlative' || kind === 'comparative') && (expectedType === 'material' || !expectedType)) {
    const pool = materialCandidates.length > 0
      ? materialCandidates
      : (bomCandidates.length > 0 ? bomCandidates : []);

    if (pool.length > 0) {
      // Parse lengths ONLY from structured spec strings (never parse from arbitrary ID digits!)
      const parsed = pool.map(item => {
        const id = item.id || item.mat_code || item.code || '';
        const spec = String(item.spec_zh || item.spec?.zh || item.spec || '').trim();
        const lengthMatch = spec.match(/(?:(?:M|ST)\d+(?:\.\d+)?\s*[x×*]\s*|直径\s*\d+\s*[x×*]\s*)?(\d+(?:\.\d+)?)\s*(?:mm|cm|li|分米|毫米|厘米)?/i);
        const length = (lengthMatch && spec) ? parseFloat(lengthMatch[1]) : null;
        return { item, length, id, spec };
      }).filter(p => p.length !== null && p.length > 0);

      if (parsed.length > 0) {
        parsed.sort((a, b) => (direction === 'max' || direction === 'greater') ? b.length - a.length : a.length - b.length);
        if (parsed.length === 1 || parsed[0].length !== parsed[1]?.length) {
          return {
            resolved: parsed[0].item,
            resolvedType: 'material',
            needsClarification: false,
          };
        }
        // Tie in extremum
        return {
          resolved: null,
          needsClarification: true,
          clarificationCode: 'tie_in_extremum',
          candidates: parsed.filter(p => p.length === parsed[0].length).map(p => p.id),
        };
      }
    }

    return {
      resolved: null,
      needsClarification: true,
      clarificationCode: 'cannot_determine_extremum',
      candidates: pool.map(c => c.id || c),
    };
  }

  // Ordinal resolution (e.g. "cái thứ hai", "第二个")
  if (kind === 'ordinal') {
    const targetIdx = index - 1;
    if (expectedType === 'material' || (!expectedType && materialCandidates.length > 0)) {
      if (materialCandidates[targetIdx]) {
        return {
          resolved: materialCandidates[targetIdx],
          resolvedType: 'material',
          needsClarification: false,
        };
      }
    }
    if (expectedType === 'product' || (!expectedType && productCandidates.length > 0)) {
      if (productCandidates[targetIdx]) {
        return {
          resolved: productCandidates[targetIdx],
          resolvedType: 'product',
          needsClarification: false,
        };
      }
    }
    if (bomCandidates[targetIdx]) {
      return {
        resolved: bomCandidates[targetIdx],
        resolvedType: 'bom_candidate',
        needsClarification: false,
      };
    }
  }

  // Pronoun resolution (e.g. "đổi nó", "nó", "它", "bản vẽ của nó")
  if (kind === 'pronoun') {
    // If targeted at material
    if (expectedType === 'material' || (!expectedType && activeConcept)) {
      if (materialCandidates.length === 1) {
        return {
          resolved: materialCandidates[0],
          resolvedType: 'material',
          needsClarification: false,
        };
      }
      if (materialCandidates.length > 1) {
        return {
          resolved: null,
          needsClarification: true,
          clarificationCode: 'ambiguous_material_reference',
          candidates: materialCandidates.map(m => m.id || m),
        };
      }
      if (normState.focus.materialId) {
        return {
          resolved: { id: normState.focus.materialId, type: 'material' },
          resolvedType: 'material',
          needsClarification: false,
        };
      }
      if (expectedType === 'material') {
        return {
          resolved: null,
          needsClarification: true,
          clarificationCode: 'target_not_specified',
          candidates: [],
        };
      }
    }

    // If targeted at product
    if (expectedType === 'product') {
      if (productCandidates.length === 1) {
        return {
          resolved: productCandidates[0],
          resolvedType: 'product',
          needsClarification: false,
        };
      }
      if (productCandidates.length > 1) {
        return {
          resolved: null,
          needsClarification: true,
          clarificationCode: 'ambiguous_product_reference',
          candidates: productCandidates.map(p => p.id || p),
        };
      }
    }

    // If targeted at drawing/document
    if (expectedType === 'document' || expectedType === 'drawing') {
      if (productCandidates.length === 1 && materialCandidates.length === 0) {
        return {
          resolved: productCandidates[0],
          resolvedType: 'product',
          needsClarification: false,
        };
      }
      if (materialCandidates.length === 1 && productCandidates.length === 0) {
        return {
          resolved: materialCandidates[0],
          resolvedType: 'material',
          needsClarification: false,
        };
      }
      if (productCandidates.length === 1) {
        return {
          resolved: productCandidates[0],
          resolvedType: 'product',
          needsClarification: false,
        };
      }
      // Ambiguous between multiple products
      const allTargets = [...productCandidates, ...materialCandidates];
      return {
        resolved: null,
        needsClarification: true,
        clarificationCode: 'ambiguous_drawing_target',
        candidates: allTargets.map(t => t.id || t),
      };
    }
  }

  // Fallback: strictly fail-closed based on expectedType
  if (expectedType === 'material') {
    return {
      resolved: null,
      needsClarification: true,
      clarificationCode: materialCandidates.length === 0 ? 'target_not_specified' : 'ambiguous_material_reference',
      candidates: materialCandidates.map(c => c.id || c),
    };
  }

  if (expectedType === 'product') {
    return {
      resolved: null,
      needsClarification: true,
      clarificationCode: productCandidates.length === 0 ? 'target_not_specified' : 'ambiguous_product_reference',
      candidates: productCandidates.map(c => c.id || c),
    };
  }

  const allCandidates = [...materialCandidates, ...productCandidates];
  if (allCandidates.length === 1) {
    return {
      resolved: allCandidates[0],
      resolvedType: allCandidates[0].type || 'entity',
      needsClarification: false,
    };
  }

  return {
    resolved: null,
    needsClarification: true,
    clarificationCode: allCandidates.length === 0 ? 'reference_not_resolved' : 'ambiguous_reference',
    candidates: allCandidates.map(c => c.id || c),
  };
}

/**
 * Infers expected entity type based on linguistic cues in the query.
 */
export function inferExpectedReferenceType(text = '') {
  const q = String(text || '').toLowerCase();
  if (/bản\s*vẽ|sơ\s*đồ|hình\s*vẽ|图纸|图|drawing|blueprint/iu.test(q)) {
    return 'document';
  }
  if (/đổi|thay|dùng\s*ở\s*đâu|vật\s*liệu|ốc|vít|quy\s*cách|kích\s*thước|在哪里|改|换|物料|规格|零件|where\s*used|material/iu.test(q)) {
    return 'material';
  }
  if (/sản\s*phẩm|tủ|màu|giá|so\s*sánh|bán|diff|产品|对比|颜色|柜子/iu.test(q)) {
    return 'product';
  }
  return null;
}

/**
 * Context Transition Policy & State Update Gate.
 * Applies transition matrix: Scope Switch resets stale material focus & stale color!
 */
export function applyContextTransition({
  state,
  explicitEntities = {},
  resolvedReferences = {},
  query = '',
  intent = null,
} = {}) {
  const prev = normalizeConversationState(state);
  const next = {
    version: 2,
    activeTask: intent || prev.activeTask,
    scope: { ...prev.scope },
    focus: { ...prev.focus },
    referents: {
      products: [...prev.referents.products],
      materials: [...prev.referents.materials],
      bomCandidates: [...prev.referents.bomCandidates],
      documents: [...prev.referents.documents],
      lastResolvedEntity: prev.referents.lastResolvedEntity,
    },
    pendingClarification: (resolvedReferences && resolvedReferences.resolved)
      ? null
      : (prev.pendingClarification || null),
    provenance: { ...prev.provenance },
    turnCount: prev.turnCount + 1,
  };

  const currentTurn = next.turnCount;

  // 1. Explicit Scope Switch Check
  const explicitProducts = explicitEntities.productIds || [];
  const isExplicitNewProductScope = explicitProducts.length > 0 && (
    explicitProducts.length !== prev.scope.productIds.length ||
    explicitProducts.some((id, idx) => id !== prev.scope.productIds[idx])
  );

  if (isExplicitNewProductScope) {
    // Product scope replaced
    next.scope.productIds = [...explicitProducts];
    next.scope.revisions = [];
    next.referents.products = explicitProducts.map(id => ({ id, type: 'product', turn: currentTurn }));
    next.provenance['scope.productIds'] = { source: 'explicit', turn: currentTurn };

    // Stale material, document focus, and color MUST be cleared/reset on product scope switch!
    const explicitMaterial = explicitEntities.materialIds?.[0] || null;
    next.focus.materialId = explicitMaterial;
    next.referents.materials = explicitMaterial ? [{ id: explicitMaterial, type: 'material', turn: currentTurn }] : [];
    next.focus.documentType = null;
    next.scope.color = explicitEntities.colors?.[0] || null;

    next.provenance['focus.materialId'] = explicitMaterial
      ? { source: 'explicit', turn: currentTurn }
      : { source: 'cleared_on_scope_switch', turn: currentTurn };
  } else if (explicitEntities.materialIds?.length > 0) {
    // Explicit material specified in same scope
    const matId = explicitEntities.materialIds[0];
    next.focus.materialId = matId;
    next.referents.materials = explicitEntities.materialIds.map(id => ({ id, type: 'material', turn: currentTurn }));
    next.provenance['focus.materialId'] = { source: 'explicit', turn: currentTurn };
  }

  // 2. Color update
  if (explicitEntities.colors?.length > 0) {
    next.scope.color = explicitEntities.colors[0];
    next.provenance['scope.color'] = { source: 'explicit', turn: currentTurn };
  }

  // 3. Component concept update
  if (explicitEntities.componentConcept) {
    next.focus.componentConcept = explicitEntities.componentConcept;
    next.provenance['focus.componentConcept'] = { source: 'explicit', turn: currentTurn };
  }

  // 4. Metric update
  if (explicitEntities.metric) {
    next.focus.metric = explicitEntities.metric;
    next.provenance['focus.metric'] = { source: 'explicit', turn: currentTurn };
  }

  // 5. Resolved reference binding
  if (resolvedReferences?.resolved) {
    const ref = resolvedReferences.resolved;
    const refId = ref.id || ref.mat_code || ref;
    if (resolvedReferences.resolvedType === 'material' || (typeof refId === 'string' && refId.startsWith('MAT_'))) {
      next.focus.materialId = refId;
      next.referents.materials = [{ id: refId, type: 'material', turn: currentTurn }];
      next.provenance['focus.materialId'] = { source: 'reference', turn: currentTurn };
    } else if (resolvedReferences.resolvedType === 'product' || (typeof refId === 'string' && /^LGS\d+/.test(refId))) {
      next.scope.productIds = [refId];
      next.referents.products = [{ id: refId, type: 'product', turn: currentTurn }];
      next.provenance['scope.productIds'] = { source: 'reference', turn: currentTurn };
    }
    next.referents.lastResolvedEntity = ref;
  }

  return next;
}
