import { normalizeAlias, validateEntityMapping } from './entity-mapping.js';

const MAX_QUERY_CHARS = 500;
const MAX_LABELS_PER_ENTITY = 8;
const MAX_CANDIDATES = 3;
const AUTO_RESOLVE_SCORE = 0.90;
const AUTO_RESOLVE_MARGIN = 0.15;
const COLOR_EQUIVALENTS = Object.freeze({
  antique: Object.freeze(['antique', 'vintage', 'rustic', '复古色', 'màu gỗ cổ', 'màu cổ điển']),
  black: Object.freeze(['black', '黑色', 'màu đen', 'đen']),
  white: Object.freeze(['white', '白色', 'màu trắng', 'trắng']),
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function targetKey(target) {
  if (target.type === 'material') return `material:${target.materialId}`;
  return `${target.type}:${target.productCode}:${target.color || ''}`;
}

function acceptedType(target, expectedTypes) {
  if (!Array.isArray(expectedTypes) || expectedTypes.length === 0) return true;
  return expectedTypes.includes(target.type);
}

function phraseOccurs(query, phrase) {
  if (!query || !phrase) return false;
  if (query === phrase) return true;
  if (/^[\p{L}\p{N} ]+$/u.test(phrase) && /[a-z0-9]/i.test(phrase)) {
    return ` ${query} `.includes(` ${phrase} `);
  }
  return query.includes(phrase);
}

function tokens(value) {
  return normalizeAlias(value).split(' ').filter(Boolean);
}

function tokenScore(query, label) {
  const queryTokens = new Set(tokens(query));
  const labelTokens = new Set(tokens(label));
  if (queryTokens.size === 0 || labelTokens.size === 0) return 0;
  
  let shared = 0;
  for (const token of queryTokens) if (labelTokens.has(token)) shared += 1;
  if (shared === 0) return 0;
  
  if (shared === labelTokens.size) {
    const totalLabelLength = [...labelTokens].join('').length;
    if (totalLabelLength >= 4) return 1.0;
  }
  
  const queryCoverage = shared / queryTokens.size;
  const labelCoverage = shared / labelTokens.size;
  return Number((queryCoverage * 0.7 + labelCoverage * 0.3).toFixed(4));
}

function result(input) {
  return deepFreeze({
    status: input.status,
    phrase: input.phrase,
    target: input.target || null,
    confidence: Number(input.confidence || 0),
    margin: Number(input.margin || 0),
    source: input.source || null,
    candidates: Array.isArray(input.candidates) ? input.candidates.slice(0, MAX_CANDIDATES) : [],
    requiresConfirmation: input.requiresConfirmation === true,
    disclosure: input.disclosure || '',
  });
}

// All known color aliases, grouped by canonical equivalent set.
// COLOR_EQUIVALENTS maps a canonical label to its multilingual aliases.
function colorEquivalentSets() {
  return Object.values(COLOR_EQUIVALENTS).map(set => set.map(normalizeAlias));
}

// Returns the canonical product color whose equivalent alias appears in the
// normalized query, or null if no known color alias is present / matches.
function detectCanonicalColor(normalizedQuery, productColors = []) {
  for (const canon of productColors) {
    const normCanon = normalizeAlias(canon);
    if (phraseOccurs(normalizedQuery, normCanon)) return canon;
    for (const eqSet of colorEquivalentSets()) {
      if (eqSet.includes(normCanon)) {
        if (eqSet.some(alias => phraseOccurs(normalizedQuery, alias))) return canon;
      }
    }
  }
  return null;
}

// Broad multilingual color-keyword set used only to detect that the user
// mentioned SOME color (so an unoffered color can ask instead of silently
// defaulting). It intentionally covers more colors than COLOR_EQUIVALENTS.
const COLOR_KEYWORDS = Object.freeze([
  'black', 'đen', '黑色', 'trắng', 'white', '白色',
  'red', 'đỏ', '红色', 'blue', 'xanh', '蓝色',
  'green', 'xanh lá', '绿色', 'yellow', 'vàng', '黄色',
  'gray', 'grey', 'xám', '灰色', 'brown', 'nâu', '棕色',
  'pink', 'hồng', '粉红色', 'purple', 'tím', '紫色',
]);

// True when the query contains any known color keyword (used to distinguish
// "unknown/unoffered color" from "no color mentioned").
function queryMentionsColor(normalizedQuery) {
  return queryMentionsAnyColor(normalizedQuery)
    || COLOR_KEYWORDS.some(alias => phraseOccurs(normalizedQuery, normalizeAlias(alias)));
}

// True when the query contains any known color alias (used to distinguish
// "unknown color" from "no color mentioned").
function queryMentionsAnyColor(normalizedQuery) {
  return colorEquivalentSets().some(eqSet => eqSet.some(alias => phraseOccurs(normalizedQuery, alias)));
}

function productColorsByCode(products, productCode) {
  const entry = products.find(e => e.target.productCode === productCode);
  return entry ? entry.colors : [];
}

function productEntries(snapshot) {
  const payload = snapshot?.payload || snapshot || {};
  const bom = payload.bom && typeof payload.bom === 'object' ? payload.bom : {};
  return Object.entries(bom).map(([key, product]) => {
    const productCode = String(product?.code || product?.productCode || key).toUpperCase();
    const labels = [productCode, product?.name_zh, product?.name_vi, product?.name_en]
      .filter(value => typeof value === 'string' && value.trim())
      .map(normalizeAlias)
      .filter(Boolean)
      .slice(0, MAX_LABELS_PER_ENTITY);
    return {
      target: { type: 'product', productCode },
      labels: [...new Set(labels)],
      colors: Array.isArray(product?.colors) ? product.colors.map(String) : [],
    };
  }).filter(entry => /^LGS\d{3,4}$/.test(entry.target.productCode));
}

function materialEntries(snapshot) {
  const payload = snapshot?.payload || snapshot || {};
  const materials = payload?.materialDb?.materials;
  const pairs = Array.isArray(materials)
    ? materials.map((material, index) => [material?.id || `material_${index}`, material])
    : Object.entries(materials && typeof materials === 'object' ? materials : {});
  return pairs.map(([key, material]) => {
    const materialId = String(material?.id || key);
    const labels = [
      materialId,
      material?.code,
      material?.mat_code,
      material?.materialCode,
      material?.name?.zh,
      material?.name?.vi,
      material?.name?.en,
      material?.name_zh,
      material?.name_vi,
      material?.name_en,
    ]
      .filter(value => typeof value === 'string' && value.trim())
      .map(normalizeAlias)
      .filter(Boolean)
      .slice(0, MAX_LABELS_PER_ENTITY);
    return { target: { type: 'material', materialId }, labels: [...new Set(labels)] };
  }).filter(entry => entry.target.materialId);
}

function validateTargetAgainstSnapshot(target, products, materials) {
  if (target.type === 'material') return materials.some(entry => entry.target.materialId === target.materialId);
  const product = products.find(entry => entry.target.productCode === target.productCode);
  if (!product) return false;
  if (target.type === 'product-variant') return product.colors.includes(target.color);
  return true;
}

function mappingEntries(mappings, expectedScope, products, materials) {
  const values = Array.isArray(mappings) ? mappings : mappings?.mappings;
  if (!Array.isArray(values)) return [];
  const entries = [];
  for (const candidate of values) {
    try {
      const mapping = validateEntityMapping(candidate);
      if (mapping.scope !== expectedScope || mapping.status !== 'confirmed') continue;
      entries.push({
        phrase: mapping.normalizedPhrase,
        target: mapping.target,
        source: `${expectedScope}-confirmed`,
        priority: expectedScope === 'personal' ? 90 : 80,
        stale: !validateTargetAgainstSnapshot(mapping.target, products, materials),
      });
    } catch {
      // Invalid mappings fail closed and are omitted from resolution.
    }
  }
  return entries;
}

function marketplaceEntries(pack, products) {
  const aliases = pack?.aliases && typeof pack.aliases === 'object' ? pack.aliases : pack;
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) return [];
  const entries = [];
  for (const [alias, value] of Object.entries(aliases)) {
    const productCode = String(value?.productCode || '').toUpperCase();
    if (!/^LGS\d{3,4}$/.test(productCode)) continue;
    const product = products.find(entry => entry.target.productCode === productCode);
    const confirmedColor = normalizeAlias(value?.confirmedColor);
    const equivalentColors = Object.values(COLOR_EQUIVALENTS).find(values => (
      values.map(normalizeAlias).includes(confirmedColor)
    )) || [confirmedColor];
    const canonicalColor = product?.colors.find(color => equivalentColors.map(normalizeAlias).includes(normalizeAlias(color)));
    const target = canonicalColor
      ? { type: 'product-variant', productCode, color: canonicalColor }
      : { type: 'product', productCode };
    entries.push({
      phrase: normalizeAlias(alias),
      target,
      source: 'marketplace-confirmed',
      priority: 70,
      stale: !product,
    });
  }
  return entries;
}

export function createEntityResolver({ snapshot, companyMappings = [], personalMappings = [], marketplaceAliases = {} } = {}) {
  const products = productEntries(snapshot);
  const materials = materialEntries(snapshot);
  const exactEntries = [];

  for (const entry of products) {
    exactEntries.push({ phrase: normalizeAlias(entry.target.productCode), target: entry.target, source: 'canonical-id', priority: 100, stale: false });
    entry.labels.slice(1).forEach(phrase => exactEntries.push({ phrase, target: entry.target, source: 'canonical-label', priority: 60, stale: false }));
  }
  for (const entry of materials) {
    entry.labels.forEach((phrase, index) => exactEntries.push({
      phrase,
      target: entry.target,
      source: index < 2 ? 'canonical-id' : 'canonical-label',
      priority: index < 2 ? 100 : 60,
      stale: false,
    }));
  }
  exactEntries.push(
    ...mappingEntries(personalMappings, 'personal', products, materials),
    ...mappingEntries(companyMappings, 'company', products, materials),
    ...marketplaceEntries(marketplaceAliases, products),
  );

  function resolve({ query, expectedTypes = [], purpose = 'read' } = {}) {
    const phrase = String(query || '').slice(0, MAX_QUERY_CHARS);
    const normalizedQuery = normalizeAlias(phrase);
    if (!normalizedQuery) return result({ status: 'unresolved', phrase });

    const matches = exactEntries.filter(entry => acceptedType(entry.target, expectedTypes) && phraseOccurs(normalizedQuery, entry.phrase));
    if (matches.length > 0) {
      const highestPriority = Math.max(...matches.map(entry => entry.priority));
      const preferred = matches.filter(entry => entry.priority === highestPriority);
      const uniqueTargets = new Map(preferred.map(entry => [targetKey(entry.target), entry]));
      if (uniqueTargets.size > 1) {
        return result({
          status: 'conflicted',
          phrase,
          candidates: [...uniqueTargets.values()].map(entry => ({ target: entry.target, confidence: 1, source: entry.source })),
          requiresConfirmation: true,
          disclosure: 'Multiple confirmed aliases resolve to different canonical entities.',
        });
      }
      const selected = preferred[0];
      if (selected.stale) {
        return result({ status: 'stale', phrase, target: selected.target, confidence: 1, source: selected.source, requiresConfirmation: true, disclosure: 'The confirmed alias target is no longer present in the current PDM snapshot.' });
      }
      // P1 correctness: lift a product to a product-variant when the query names
      // a color that the product actually offers. An unoffered color must ask,
      // never silently fall back to the first color.
      if (selected.target.type === 'product') {
        const canVariant = expectedTypes.length === 0 || expectedTypes.includes('product-variant');
        const colors = productColorsByCode(products, selected.target.productCode);
        const color = detectCanonicalColor(normalizedQuery, colors);
        if (color && canVariant) {
          return result({
            status: 'resolved',
            phrase,
            target: { type: 'product-variant', productCode: selected.target.productCode, color },
            confidence: 1,
            margin: 1,
            source: selected.source,
            requiresConfirmation: false,
            disclosure: `Resolved from ${selected.source} with color ${color}.`,
          });
        }
        if (color === null && queryMentionsColor(normalizedQuery) && canVariant) {
          return result({
            status: 'ambiguous',
            phrase,
            confidence: 1,
            margin: 1,
            candidates: [selected],
            requiresConfirmation: true,
            disclosure: 'The requested color is not available for this product.',
          });
        }
      }
      return result({
        status: 'resolved',
        phrase,
        target: selected.target,
        confidence: 1,
        margin: 1,
        source: selected.source,
        requiresConfirmation: false,
        disclosure: `Resolved from ${selected.source}.`,
      });
    }

    const ranked = [...products, ...materials]
      .filter(entry => acceptedType(entry.target, expectedTypes))
      .map(entry => ({
        target: entry.target,
        confidence: Math.max(0, ...entry.labels.map(label => tokenScore(normalizedQuery, label))),
        source: 'fuzzy-canonical',
      }))
      .filter(entry => entry.confidence > 0)
      .sort((left, right) => right.confidence - left.confidence || targetKey(left.target).localeCompare(targetKey(right.target)))
      .slice(0, MAX_CANDIDATES);

    if (ranked.length === 0) return result({ status: 'unresolved', phrase });
    const margin = Number((ranked[0].confidence - (ranked[1]?.confidence || 0)).toFixed(4));
    if (ranked[0].confidence >= AUTO_RESOLVE_SCORE && margin >= AUTO_RESOLVE_MARGIN) {
      // P1 correctness: same color-lift logic as the exact-match branch.
      let topTarget = ranked[0].target;
      if (topTarget.type === 'product') {
        const canVariant = expectedTypes.length === 0 || expectedTypes.includes('product-variant');
        const colors = productColorsByCode(products, topTarget.productCode);
        const color = detectCanonicalColor(normalizedQuery, colors);
        if (color && canVariant) {
          topTarget = { type: 'product-variant', productCode: topTarget.productCode, color };
        } else if (color === null && queryMentionsColor(normalizedQuery) && canVariant) {
          return result({
            status: 'ambiguous',
            phrase,
            confidence: ranked[0].confidence,
            margin,
            candidates: ranked,
            requiresConfirmation: true,
            disclosure: 'The requested color is not available for this product.',
          });
        }
      }
      return result({
        status: 'resolved',
        phrase,
        target: topTarget,
        confidence: ranked[0].confidence,
        margin,
        source: 'fuzzy-canonical',
        candidates: ranked,
        requiresConfirmation: purpose === 'proposal',
        disclosure: 'Resolved by bounded local fuzzy matching; confirm before any proposal.',
      });
    }
    return result({
      status: 'ambiguous',
      phrase,
      confidence: ranked[0].confidence,
      margin,
      candidates: ranked,
      requiresConfirmation: true,
      disclosure: 'Canonical candidates require user clarification.',
    });
  }

  return Object.freeze({ resolve });
}

export const ENTITY_RESOLUTION_LIMITS = Object.freeze({
  maxQueryChars: MAX_QUERY_CHARS,
  maxLabelsPerEntity: MAX_LABELS_PER_ENTITY,
  maxCandidates: MAX_CANDIDATES,
  autoResolveScore: AUTO_RESOLVE_SCORE,
  autoResolveMargin: AUTO_RESOLVE_MARGIN,
});
