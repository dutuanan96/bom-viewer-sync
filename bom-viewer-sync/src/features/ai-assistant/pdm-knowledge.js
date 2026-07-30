// pdm-knowledge.js — R1.3: Deterministic PDM indexes and read-only tools.
//
// All queries are read-only against a frozen snapshot. No mutations.
// Results are bounded, normalized, and carry evidence/source metadata.
// Only the keys needed for the AI response are included — no full payload leakage.

import { buildBomTreeRows } from '../../domain/relationships.js';
import { normalizeProductRevisionRegistry } from '../../domain/revisions.js';
import { classifyMaterialFamily, summarizeMaterialFamilies } from './pdm-ontology.js';
import { evaluateEquivalence, detectDataQualityWarnings } from './pdm-equivalence.js';
import { detectProductShorthand, resolveConcept, parseDimensions, checkDimensionProximity } from './pdm-terminology.js';

// Maximum results returned by search operations
const MAX_SEARCH_RESULTS = 50;
// Maximum BOM rows returned
const MAX_BOM_ROWS = 200;
const MAX_FOCUSED_BOM_ROWS = 12;
const MAX_COMPARISON_RESULTS = 100;

/**
 * Build a safe evidence object from source metadata + record context.
 * Requires a 40-char commitSha to be present.
 */
function buildEvidence(sourceMetadata, recordId, sourcePath) {
  return {
    id: `PDM-${recordId}-${Date.now()}`,
    sourceType: 'pdm',
    sourcePath: sourcePath || `data/${recordId}`,
    recordId,
    sourceCommit: sourceMetadata?.commitSha || '',
    capturedAt: sourceMetadata?.updatedAt || new Date().toISOString(),
  };
}

/**
 * Extract a bounded, safe product summary (no raw color_info, no full material list).
 */
function toProductSummary(productCode, product) {
  const variants = Object.entries(product.color_info || {}).map(([color, info]) => ({
    color,
    colorVi: info?.color_ver_vi || '',
    sku: info?.sku || '',
    size: info?.size || '',
    nameZh: info?.name_zh || info?.name || '',
    nameVi: info?.name_vi || '',
  }));
  return {
    productCode,
    nameZh: product.name_zh || product.name || productCode,
    nameVi: product.name_vi || null,
    colors: Array.isArray(product.colors) ? product.colors : [],
    variants,
  };
}

/**
 * Normalize a BOM row to only expose safe fields (no internal state).
 */
function toBomRowSummary(row) {
  const nameZh = typeof row.name_zh === 'string' ? row.name_zh : (row.name?.zh || (typeof row.name === 'string' ? row.name : ''));
  const nameVi = typeof row.name_vi === 'string' ? row.name_vi : (row.name?.vi || '');
  const spec = typeof row.spec === 'string' ? row.spec : (row.spec?.zh || '');
  return {
    matCode: row.mat_code || row._materialRecord?.code || row._materialId || '',
    materialId: row._materialId || '',
    componentCode: row.comp_code || '',
    nameZh,
    nameVi,
    spec,
    attributeZh: typeof row.attr_zh === 'string' ? row.attr_zh : (row.attr?.zh || ''),
    materialZh: typeof row.material_zh === 'string' ? row.material_zh : (row.material?.zh || ''),
    qty: row.qty || row.quantity || '',
    unit: row.unit || '',
    level: row._level || 1,
    hasChildren: Boolean(row._hasChildren),
  };
}

function normalizeBomSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[×*]/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

function focusedBomRows(rows, query) {
  const normalizedQuery = normalizeBomSearchText(query);
  if (!normalizedQuery) return rows;

  const stopWords = new Set([
    'bao', 'bao nhieu', 'ben', 'bom', 'cai', 'can', 'co', 'cua', 'gi', 'la', 'nay',
    'nhieu', 'o', 'phan', 'phu', 'san pham', 'so', 'trong', 'tui', 'voi',
    'how', 'in', 'many', 'of', 'product', 'the', 'what', 'with',
  ]);
  const latinTokens = normalizedQuery
    .match(/[a-z0-9]+(?:[.\-]?[a-z0-9]+)*/g) || [];
  const tokens = latinTokens.filter(token => (
    token.length >= 2
    && !stopWords.has(token)
    && !/^lgs\d{3,4}$/.test(token)
    && !/^\d{3,4}$/.test(token)
  ));
  const hanText = [...normalizedQuery].filter(character => /[\p{Script=Han}]/u.test(character)).join('');
  for (let index = 0; index < hanText.length - 1; index += 1) {
    tokens.push(hanText.slice(index, index + 2));
  }

  const requestedFastener = normalizedQuery.match(/\b(?:m|st)\d+(?:\.\d+)?x\d+(?:\.\d+)?/i)?.[0] || '';
  const requestedFamily = requestedFastener.match(/^(?:m|st)\d+(?:\.\d+)?/i)?.[0] || '';
  const scored = rows.map((row, index) => {
    const searchable = normalizeBomSearchText([
      row.matCode,
      row.materialId,
      row.componentCode,
      row.nameZh,
      row.nameVi,
      row.spec,
      row.attributeZh,
      row.materialZh,
    ].join(' '));
    let score = tokens.reduce((total, token) => total + (searchable.includes(token) ? 1 : 0), 0);
    if (requestedFastener && searchable.includes(requestedFastener)) score += 6;
    else if (requestedFamily && searchable.includes(requestedFamily)) score += 2;
    return { index, row, score };
  });
  const maxScore = Math.max(0, ...scored.map(item => item.score));
  if (maxScore === 0) return rows;

  const selectedIndexes = new Set(
    scored
      .filter(item => item.score >= Math.max(1, maxScore - 1))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, MAX_FOCUSED_BOM_ROWS)
      .map(item => item.index),
  );

  for (const index of [...selectedIndexes]) {
    if (rows[index]?.level <= 1) continue;
    for (let parentIndex = index - 1; parentIndex >= 0; parentIndex -= 1) {
      if (rows[parentIndex]?.level === 1) {
        selectedIndexes.add(parentIndex);
        break;
      }
    }
  }

  return [...selectedIndexes]
    .sort((left, right) => left - right)
    .slice(0, MAX_FOCUSED_BOM_ROWS)
    .map(index => rows[index]);
}

function normalizedQuantity(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = text.replace(',', '.');
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  if (/^\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)+$/.test(normalized)) {
    return normalized.split('+').reduce((sum, part) => sum + Number(part.trim()), 0);
  }
  return null;
}

function quantityParts(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*$/.test(text)) return null;
  const parts = text.split('+').map(part => Number(part.trim()));
  return {
    normal: parts[0],
    spare: parts.slice(1).reduce((sum, part) => sum + part, 0),
    total: parts.reduce((sum, part) => sum + part, 0),
  };
}

function aggregateBomRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const matCode = String(row.matCode || '').trim();
    if (!matCode) continue;
    const materialId = String(row.materialId || '').trim();
    const level = Number(row.level || 1);
    const matchKey = `${materialId || matCode}|${level}`;
    if (!grouped.has(matchKey)) {
      grouped.set(matchKey, {
        matCode,
        materialId: materialId || null,
        componentCode: row.componentCode || '',
        level,
        nameZh: row.nameZh || '',
        nameVi: row.nameVi || '',
        spec: row.spec || '',
        attributeZh: row.attributeZh || '',
        materialZh: row.materialZh || '',
        hasChildren: Boolean(row.hasChildren),
        quantities: [],
        units: new Set(),
        rowCount: 0
      });
    }
    const group = grouped.get(matchKey);
    group.rowCount += 1;
    const quantityText = String(row.qty ?? '').trim();
    if (quantityText) group.quantities.push(quantityText);
    const unit = String(row.unit || '').trim();
    if (unit) group.units.add(unit);
  }

  return new Map([...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([matchKey, group]) => {
      const numericQuantities = group.quantities.map(normalizedQuantity);
      const structuredQuantities = group.quantities.map(quantityParts);
      const allNumeric = numericQuantities.length > 0 && numericQuantities.every(value => value !== null);
      const allStructured = structuredQuantities.length > 0 && structuredQuantities.every(Boolean);
      const quantity = allNumeric
        ? Number(numericQuantities.reduce((sum, value) => sum + value, 0).toFixed(6))
        : null;
      const normalQuantity = allStructured
        ? Number(structuredQuantities.reduce((sum, value) => sum + value.normal, 0).toFixed(6))
        : null;
      const spareQuantity = allStructured
        ? Number(structuredQuantities.reduce((sum, value) => sum + value.spare, 0).toFixed(6))
        : null;
      const units = [...group.units].sort();
      return [matchKey, {
        matCode: group.matCode,
        materialId: group.materialId,
        componentCode: group.componentCode,
        level: group.level,
        nameZh: group.nameZh,
        nameVi: group.nameVi,
        spec: group.spec,
        attributeZh: group.attributeZh,
        materialZh: group.materialZh,
        hasChildren: group.hasChildren,
        quantity,
        normalQuantity,
        spareQuantity,
        quantityText: group.quantities.length === 1
          ? group.quantities[0]
          : group.quantities.join(' + '),
        units,
        rowCount: group.rowCount
      }];
    }));
}

function comparableBomValue(item) {
  return `${item.quantityText}|${item.units.join('|')}`;
}

function toRevisionSummary(revision) {
  return {
    revision: revision?.revision || '',
    sourceRevision: revision?.sourceRevision || '',
    workflowState: revision?.workflowState || '',
    createdAt: revision?.createdAt || null,
    changeReason: revision?.changeReason || ''
  };
}

function toEffectivityEventSummary(event) {
  return {
    revision: event?.revision || event?.effectiveRevision || '',
    previousRevision: event?.previousRevision || '',
    effectiveAt: event?.effectiveAt || event?.createdAt || null,
    reason: event?.reason || event?.changeReason || ''
  };
}

export class PdmKnowledge {
  /**
   * @param {{ sourceMetadata: object, payload: object }} snapshot
   * @param {{ aliasMap?: object }} options
   */
  constructor(snapshot = {}, options = {}) {
    this._snapshot = snapshot;
    this._sourceMetadata = snapshot.sourceMetadata || snapshot.payload?.sourceMetadata || {};
    this._payload = snapshot.payload || snapshot;
    this._aliasMap = options.aliasMap || {};
    this._revisionRegistry = normalizeProductRevisionRegistry(this._payload);
  }

  /**
   * Search products by query term.
   */
  searchProducts({ query, withEvidence = false } = {}) {
    const q = (query || '').trim().toLowerCase();
    const bom = this._payload.bom || {};
    const results = [];

    for (const [productCode, product] of Object.entries(bom)) {
      const name = (product.name_zh || product.name || '').toLowerCase();
      if (!q || productCode.toLowerCase().includes(q) || name.includes(q)) {
        results.push(toProductSummary(productCode, product));
        if (results.length >= MAX_SEARCH_RESULTS) break;
      }
    }

    results.sort((a, b) => a.productCode.localeCompare(b.productCode, undefined, { numeric: true }));
    const bounded = results.slice(0, MAX_SEARCH_RESULTS);

    if (withEvidence) {
      return {
        results: bounded,
        evidence: buildEvidence(this._sourceMetadata, q || 'all', 'data/products'),
      };
    }
    return bounded;
  }

  /**
   * Get product summary by productId (SPU code, e.g. "LGS723").
   */
  getProduct({ productId } = {}) {
    const bom = this._payload.bom || {};
    const product = bom[productId];
    if (!product) throw new Error(`Not found: product ${productId}`);
    return {
      ...toProductSummary(productId, product),
      evidence: buildEvidence(this._sourceMetadata, productId, `data/products/${productId}.json`),
    };
  }

  /**
   * Resolve a marketplace or SKU alias to internal SKU.
   */
  resolveSku({ alias } = {}) {
    const norm = (alias || '').trim().toUpperCase();
    if (!norm) throw new Error('Alias is required');

    const bom = this._payload.bom || {};
    const mapped = this._aliasMap[norm];

    if (mapped) {
      const productCode = mapped.productCode || mapped.productId;
      if (!bom[productCode]) throw new Error(`Not found: product ${productCode} for alias ${norm}`);
      return {
        alias: norm,
        internalSku: mapped.internalSku || mapped.sku || norm,
        productCode,
        resolution: mapped.resolution || 'knowledge-pack-alias',
        found: true,
        evidence: buildEvidence(this._sourceMetadata, norm, 'knowledge/marketplace-aliases.json'),
      };
    }

    const match = norm.match(/^U(LGS\d{3,4})(.*)$/i);
    if (!match) {
      throw new Error(`Not found: SKU alias ${norm}`);
    }

    const productCode = match[1].toUpperCase();
    if (!bom[productCode]) {
      throw new Error(`Not found: product ${productCode} for SKU alias ${norm}`);
    }

    const internalSku = productCode + match[2];
    return {
      alias: norm,
      internalSku,
      productCode,
      resolution: 'exact-u-prefix-alias',
      found: true,
      evidence: buildEvidence(this._sourceMetadata, norm, `data/products/${productCode}.json`),
    };
  }

  /**
   * Get BOM rows for a product + color.
   */
  getBom({ productId, color, query } = {}) {
    const bom = this._payload.bom || {};
    const product = bom[productId];
    if (!product) throw new Error(`Not found: product ${productId}`);

    const colorName = color || product.colors?.[0] || '';
    const rows = buildBomTreeRows(this._payload, productId, colorName);
    const summaries = rows.map(toBomRowSummary);
    const focused = typeof query === 'string' && query.trim().length > 0;
    const selectedRows = focused ? focusedBomRows(summaries, query) : summaries;
    const bounded = selectedRows.slice(0, MAX_BOM_ROWS);

    return {
      productCode: productId,
      color: colorName,
      rows: bounded,
      totalRows: rows.length,
      matchedRows: selectedRows.length,
      focused,
      truncated: selectedRows.length > MAX_BOM_ROWS,
      evidence: buildEvidence(this._sourceMetadata, productId, `data/products/${productId}.json`),
    };
  }

  /**
   * Get revision history for a product.
   */
  getRevisionHistory({ productId } = {}) {
    const record = this._revisionRegistry[productId] || null;
    if (!record) {
      const bom = this._payload.bom || {};
      if (!bom[productId]) throw new Error(`Not found: product ${productId}`);
      return {
        productCode: productId,
        currentRevision: 'A.1',
        effectiveRevision: 'A.1',
        currentRevisionInfo: { workflowState: 'released' },
        revisions: [],
        effectivityEvents: [],
        evidence: buildEvidence(this._sourceMetadata, productId, 'data/manifest.json'),
      };
    }

    return {
      productCode: productId,
      currentRevision: record.currentRevision,
      effectiveRevision: record.effectiveRevision,
      currentRevisionInfo: toRevisionSummary({ revision: record.currentRevision, ...record.currentRevisionInfo }),
      revisions: (record.revisions || []).slice(0, 50).map(toRevisionSummary),
      effectivityEvents: (record.effectivityEvents || []).slice(0, 50).map(toEffectivityEventSummary),
      evidence: buildEvidence(this._sourceMetadata, productId, 'data/manifest.json'),
    };
  }

  /**
   * Get a material by materialId.
   */
  getMaterial({ materialId } = {}) {
    const mat = this._payload?.materialDb?.materials?.[materialId];
    if (!mat) throw new Error(`Not found: material ${materialId}`);
    return {
      matCode: mat.mat_code || materialId,
      nameZh: mat.name_zh || mat.name || '',
      nameVi: mat.name_vi || null,
      unit: mat.unit || '',
      evidence: buildEvidence(this._sourceMetadata, materialId, 'data/materials.json'),
    };
  }

  /**
   * Find all products that use a given materialId.
   whereUsed({ materialId } = {}) {
     // Auto-resolve: if materialId not found in materialDb, try resolving from materialCode
     let resolvedId = materialId;
     if (materialId && !this._payload?.materialDb?.materials?.[materialId]) {
       const materialDb = this._payload?.materialDb?.materials || {};
       for (const [id, mat] of Object.entries(materialDb)) {
         if (mat?.code === materialId || mat?.mat_code === materialId || mat?.materialCode === materialId) {
           resolvedId = id;
           break;
         }
       }
     }
     // Get colors from BOM entries for this material, not from product.colors (which may be undefined)
     const materialEntries = (this._payload?.materialDb?.bomEntries || []).filter(e => e.materialId === resolvedId);
     const colorMap = new Map(); // productCode -> Set of colors
     for (const entry of materialEntries) {
       if (!entry.productCode) continue;
       if (!colorMap.has(entry.productCode)) colorMap.set(entry.productCode, new Set());
       if (entry.color) colorMap.get(entry.productCode).add(entry.color);
     }

     const bom = this._payload.bom || {};
     const usage = [];

     for (const [productCode, product] of Object.entries(bom)) {
       if (!product) continue;
       const colors = colorMap.get(productCode);
       const colorsToCheck = colors && colors.size > 0 ? [...colors] : (product.colors || ['']);
       for (const color of colorsToCheck) {
         const rows = buildBomTreeRows(this._payload, productCode, color);
         const found = rows.some(r => r._materialId === resolvedId || (r.comp_code && r.comp_code === resolvedId));
         if (found) {
           usage.push({ productCode, color });
         }
       }
       if (usage.length >= MAX_SEARCH_RESULTS) break;
     }

    return {
      materialId: resolvedId,
      usage,
      evidence: buildEvidence(this._sourceMetadata, resolvedId, 'data/materials.json'),
    };
  }

  /**
   * Compare BOM rows between two product+color combinations.
   */
  compareBoms({ productId1, color1, productId2, color2 } = {}) {
    const bom = this._payload.bom || {};
    if (!bom[productId1]) throw new Error(`Not found: product ${productId1}`);
    if (!bom[productId2]) throw new Error(`Not found: product ${productId2}`);

    const colors1 = bom[productId1]?.colors || [];
    const colors2 = bom[productId2]?.colors || [];
    if (color1 && !colors1.includes(color1)) throw new Error(`Not found: color ${color1} for product ${productId1}`);
    if (color2 && !colors2.includes(color2)) throw new Error(`Not found: color ${color2} for product ${productId2}`);
    const sharedColors = colors1.filter(color => colors2.includes(color));
    const inferredSharedColor = sharedColors[0] || '';
    const resolvedColor1 = color1 || inferredSharedColor || colors1[0] || '';
    const resolvedColor2 = color2 || inferredSharedColor || colors2[0] || '';
    const needsColorClarification = !color1 && !color2 && !inferredSharedColor &&
      (colors1.length > 1 || colors2.length > 1);
    const fullRows1 = buildBomTreeRows(this._payload, productId1, resolvedColor1);
    const fullRows2 = buildBomTreeRows(this._payload, productId2, resolvedColor2);
    const rows1 = fullRows1.slice(0, MAX_BOM_ROWS).map(toBomRowSummary);
    const rows2 = fullRows2.slice(0, MAX_BOM_ROWS).map(toBomRowSummary);
    const aggregated1 = aggregateBomRows(rows1);
    const aggregated2 = aggregateBomRows(rows2);
    const common = [];
    const onlyProduct1 = [];
    const onlyProduct2 = [];

    for (const [matchKey, product1] of aggregated1) {
      const product2 = aggregated2.get(matchKey);
      if (!product2) {
        onlyProduct1.push({ ...product1, materialFamily: classifyMaterialFamily(product1) });
        continue;
      }
      const commonItem = {
        matCode: product1.matCode,
        materialId: product1.materialId || product2.materialId,
        level: product1.level,
        nameZh: product1.nameZh || product2.nameZh,
        spec: product1.spec || product2.spec,
        attributeZh: product1.attributeZh || product2.attributeZh,
        materialZh: product1.materialZh || product2.materialZh,
        product1,
        product2,
        quantityOrUnitDifferent: comparableBomValue(product1) !== comparableBomValue(product2)
      };
      common.push({ ...commonItem, materialFamily: classifyMaterialFamily(commonItem) });
    }
    for (const [matchKey, product2] of aggregated2) {
      if (!aggregated1.has(matchKey)) onlyProduct2.push({ ...product2, materialFamily: classifyMaterialFamily(product2) });
    }

    // Evaluate probableCommon between remaining onlyProduct1 and onlyProduct2 items
    const probableCommon = [];
    const matchedOnly1Indices = new Set();
    const matchedOnly2Indices = new Set();
    const candidates = [];
    for (let leftIndex = 0; leftIndex < onlyProduct1.length; leftIndex++) {
      for (let rightIndex = 0; rightIndex < onlyProduct2.length; rightIndex++) {
        const evaluation = evaluateEquivalence(
          onlyProduct1[leftIndex],
          onlyProduct2[rightIndex],
          this._snapshot,
          { productId1, productId2 },
        );
        if (evaluation.isProbable) candidates.push({ leftIndex, rightIndex, evaluation });
      }
    }
    candidates
      .sort((left, right) => right.evaluation.score - left.evaluation.score ||
        left.leftIndex - right.leftIndex || left.rightIndex - right.rightIndex)
      .forEach(({ leftIndex, rightIndex, evaluation }) => {
        if (matchedOnly1Indices.has(leftIndex) || matchedOnly2Indices.has(rightIndex)) return;
        matchedOnly1Indices.add(leftIndex);
        matchedOnly2Indices.add(rightIndex);
        probableCommon.push({
          product1: onlyProduct1[leftIndex],
          product2: onlyProduct2[rightIndex],
          confidence: evaluation.confidence,
          score: evaluation.score,
          reasons: evaluation.reasons,
          conflicts: evaluation.conflicts,
        });
      });

    const remainingOnly1 = onlyProduct1.filter((_, index) => !matchedOnly1Indices.has(index));
    const remainingOnly2 = onlyProduct2.filter((_, idx) => !matchedOnly2Indices.has(idx));

    // Detect data quality warnings (e.g. front vs rear member conflicts)
    const dataQualityWarnings = detectDataQualityWarnings(
      onlyProduct1,
      onlyProduct2,
      this._snapshot,
      { productId1, productId2 },
    );

    const quantityOrUnitDifferences = common.filter(item => item.quantityOrUnitDifferent);
    const commonByAttribute = {};
    for (const item of common) {
      const attribute = item.attributeZh || 'unclassified';
      commonByAttribute[attribute] = (commonByAttribute[attribute] || 0) + 1;
    }
    const commonByMaterialFamily = summarizeMaterialFamilies(common);
    const unionCount = aggregated1.size + aggregated2.size - common.length;
    const similarityScore = unionCount === 0 ? 1 : common.length / unionCount;
    const equivalenceUnionCount = aggregated1.size + aggregated2.size - common.length - probableCommon.length;
    const equivalenceSimilarityScore = equivalenceUnionCount === 0
      ? 1
      : (common.length + probableCommon.length) / equivalenceUnionCount;
    const truncated = fullRows1.length > MAX_BOM_ROWS ||
      fullRows2.length > MAX_BOM_ROWS ||
      common.length > MAX_COMPARISON_RESULTS ||
      probableCommon.length > MAX_COMPARISON_RESULTS ||
      remainingOnly1.length > MAX_COMPARISON_RESULTS ||
      remainingOnly2.length > MAX_COMPARISON_RESULTS ||
      quantityOrUnitDifferences.length > MAX_COMPARISON_RESULTS ||
      dataQualityWarnings.length > MAX_COMPARISON_RESULTS;

    return {
      product1: {
        productCode: productId1,
        color: resolvedColor1,
        totalRows: fullRows1.length,
        materialCount: aggregated1.size,
        truncated: fullRows1.length > MAX_BOM_ROWS
      },
      product2: {
        productCode: productId2,
        color: resolvedColor2,
        totalRows: fullRows2.length,
        materialCount: aggregated2.size,
        truncated: fullRows2.length > MAX_BOM_ROWS
      },
      summary: {
        commonCount: common.length,
        onlyProduct1Count: remainingOnly1.length,
        onlyProduct2Count: remainingOnly2.length,
        probableCommonCount: probableCommon.length,
        dataQualityWarningCount: dataQualityWarnings.length,
        quantityOrUnitDifferenceCount: quantityOrUnitDifferences.length,
        similarityScore,
        equivalenceSimilarityScore,
        commonByAttribute,
        commonByMaterialFamily
      },
      common: common.slice(0, MAX_COMPARISON_RESULTS),
      probableCommon: probableCommon.slice(0, MAX_COMPARISON_RESULTS),
      onlyProduct1: remainingOnly1.slice(0, MAX_COMPARISON_RESULTS),
      onlyProduct2: remainingOnly2.slice(0, MAX_COMPARISON_RESULTS),
      quantityOrUnitDifferences: quantityOrUnitDifferences.slice(0, MAX_COMPARISON_RESULTS),
      dataQualityWarnings: dataQualityWarnings.slice(0, MAX_COMPARISON_RESULTS),
      matchingPolicy: 'Tiered equivalence: exact materialId identity, evidence-backed probable equivalence, unresolved data quality conflicts.',
      colorScopeInferred: !color1 && !color2 && Boolean(inferredSharedColor),
      needsClarification: needsColorClarification,
      clarificationCode: needsColorClarification ? 'comparison_color_scope' : null,
      availableColors: { product1: colors1, product2: colors2 },
      truncated,
      evidence: [
        buildEvidence(this._sourceMetadata, productId1, `data/products/${productId1}.json`),
        buildEvidence(this._sourceMetadata, productId2, `data/products/${productId2}.json`)
      ]
    };
  }

  /**
   * Deterministic Catalog-wide Analysis Tool (analyze_pdm).
   */
  analyzePdm({ query = '', scope = 'all', countMode = '', componentFamily = '', dimensionFilter = '' } = {}) {
    const bom = this._payload.bom || {};
    let text = String(query).trim();
    if (!text) throw new Error('Query is required');

    // Check product shorthand e.g. "723"
    const shorthand = detectProductShorthand(text);
    if (shorthand && bom[shorthand.candidateProductId]) {
      text = text.replace(
        new RegExp(`(^|[^\\w])${shorthand.userNumber}(?=[^\\w]|$)`),
        `$1${shorthand.candidateProductId}`,
      );
    }

    const parsedDims = parseDimensions(text || dimensionFilter);
    const concept = resolveConcept(text || componentFamily);

    let mode = countMode;
    if (!mode) {
      if (/\bLGS\d{3,4}\b/i.test(text) && /五金包|hardware/i.test(text) && /白色|黑色|复古色|颜色|color|variant|没有|缺少|缺失/i.test(text)) {
        mode = 'variant_coverage';
      } else if (
        /(?:一|二|两|三|四|五|\d+)\s*列|(?:一|二|三|四|五|六|七|八|九|十|\d+)\s*(?:个)?抽(?:屉)?|带灯|带电|有灯|有电|\d+(?:\.\d+)?\s*(?:mm\s*)?(?:宽|高|深|长)|\b(?:columns?|drawers?|with light|with power)\b/iu.test(text)
      ) {
        mode = 'filter_products';
      } else if (
        concept?.conceptId === 'packaging_carton'
        && /最大|largest|biggest|maximum/i.test(text)
      ) {
        mode = 'rank_component_size';
      } else if (['upper_crossbar', 'vertical_beam', 'packaging_carton'].includes(concept?.conceptId)) {
        mode = 'component_usage';
      } else if (/柜子|product count|s\u1eed d\u1ee5ng/i.test(text) || concept?.conceptId === 'cabinet') {
        mode = 'count_products';
      } else if (/铁框|支撑框|metal frame/i.test(text) || concept?.conceptId === 'metal_frame') {
        mode = 'count_component_types';
      } else if (/布抽|drawer/i.test(text) || concept?.conceptId === 'drawer_fabric') {
        mode = 'rank_by_drawer_variants';
      } else if (/五金包|hardware/i.test(text) || concept?.conceptId === 'hardware_bag') {
        mode = 'shared_hardware_bags';
      } else if (/多零件|most parts/i.test(text)) {
        mode = 'rank_by_parts';
      } else {
        mode = 'catalog_summary';
      }
    }

    if (mode === 'filter_products') {
      const numberWords = new Map([
        ['一', 1], ['二', 2], ['两', 2], ['三', 3], ['四', 4], ['五', 5],
        ['六', 6], ['七', 7], ['八', 8], ['九', 9], ['十', 10],
      ]);
      const parseCount = value => numberWords.get(value) || Number(value);
      const columnMatch = text.match(/([一二两三四五]|\d+)\s*列/);
      const drawerMatch = text.match(/([一二三四五六七八九十]|\d+)\s*(?:个)?抽(?:屉)?/);
      const requestedColumns = columnMatch ? parseCount(columnMatch[1]) : null;
      const requestedDrawers = drawerMatch ? parseCount(drawerMatch[1]) : null;
      const requestedComponentSpec = text.match(/\b(?:M|ST)\d+(?:\.\d+)?\s*(?:x|×|\*)\s*\d+(?:\.\d+)?\b/i)?.[0]
        ?.replace(/\s+/g, '')
        .replace(/[×*]/g, 'x')
        .toLowerCase() || '';
      const requestedDimension = requestedComponentSpec ? null : parseDimensions(text)[0];
      const requestedComponentName = /把手|底脚|脚垫|螺丝|螺钉|扳手|工具/.exec(text)?.[0] || '';
      const explicitProducts = [...new Set(
        (text.match(/\bLGS\d{3,4}\b/gi) || []).map(value => value.toUpperCase()),
      )];
      const wantsLight = /带灯|有灯|\bwith light\b/iu.test(text);
      const wantsPower = /带电|有电|\bwith power\b/iu.test(text);

      const parseVariantSize = value => {
        const axes = {};
        for (const match of String(value || '').matchAll(/(\d+(?:\.\d+)?)\s*([DWH])/gi)) {
          const axis = match[2].toUpperCase();
          axes[axis === 'W' ? 'width' : axis === 'H' ? 'height' : 'depth'] = Number(match[1]);
        }
        return axes;
      };

      const results = [];
      for (const [productCode, product] of Object.entries(bom)) {
        if (explicitProducts.length > 0 && !explicitProducts.includes(productCode)) continue;
        const searchableName = `${product.name_zh || ''} ${product.name_vi || ''}`;
        if (requestedColumns !== null && !new RegExp(`${requestedColumns}\\s*列`).test(searchableName)) continue;
        if (requestedDrawers !== null && !new RegExp(`${requestedDrawers}\\s*抽`).test(searchableName)) continue;
        if (wantsLight && !/带灯/.test(searchableName)) continue;
        if (wantsPower && !/带电/.test(searchableName)) continue;

        const variants = toProductSummary(productCode, product).variants;
        const matchingVariants = requestedDimension
          ? variants.filter(variant => {
              const axes = parseVariantSize(variant.size);
              const target = requestedDimension.numbers[0];
              if (requestedDimension.axis === 'width') return axes.width === target;
              if (requestedDimension.axis === 'height') return axes.height === target;
              if (requestedDimension.axis === 'depth') return axes.depth === target;
              return Object.values(axes).includes(target);
            })
          : variants;
        if (requestedDimension && matchingVariants.length === 0) continue;
        const defaultColor = product.colors?.[0] || '';
        const matchingMaterials = requestedComponentSpec || requestedComponentName
          ? buildBomTreeRows(this._payload, productCode, defaultColor)
              .map(toBomRowSummary)
              .filter(row => {
                const searchable = `${row.nameZh} ${row.nameVi} ${row.spec} ${row.matCode}`.toLowerCase();
                if (requestedComponentSpec && !searchable.replace(/\s+/g, '').includes(requestedComponentSpec)) return false;
                if (requestedComponentName && !searchable.includes(requestedComponentName)) return false;
                return true;
              })
              .slice(0, MAX_SEARCH_RESULTS)
          : [];
        results.push({
          ...toProductSummary(productCode, product),
          variants: matchingVariants,
          matchingMaterials,
        });
      }

      return {
        interpretation: 'Products matching catalog attributes',
        scope: 'catalog',
        countMode: 'filter_products',
        assumptions: 'Product structure is matched from canonical product names; dimensions are matched from variant size fields',
        totalCount: results.length,
        results: results.slice(0, MAX_SEARCH_RESULTS),
        truncated: results.length > MAX_SEARCH_RESULTS,
        evidence: buildEvidence(this._sourceMetadata, 'product-filter', 'data/products'),
      };
    }

    if (mode === 'component_usage' || mode === 'rank_component_size') {
      const conceptMatchers = {
        upper_crossbar: /上横梁|顶部横梁|顶部横杆|上横杆|upper crossbar|thanh ngang trên/i,
        vertical_beam: /竖梁|竖零件|XZ[QH]SL|vertical beam|thanh đứng/i,
        packaging_carton: /纸箱|纸盒|carton|cardboard box|thùng carton/i,
      };
      const matcher = conceptMatchers[concept?.conceptId];
      if (!matcher) throw new Error('A supported component family is required');
      const targetProductIds = [...new Set((text.match(/\bLGS\d{3,4}\b/gi) || []).map(value => value.toUpperCase()))];
      const groupEquivalentComponents = (
        targetProductIds.length > 0
        && /共用|共享|独用|其他|除外|shared|common|other products?/iu.test(text)
      );

      const components = new Map();
      for (const [productCode, product] of Object.entries(bom)) {
        for (const color of (product.colors || [''])) {
          for (const row of buildBomTreeRows(this._payload, productCode, color)) {
            const summary = toBomRowSummary(row);
            const searchable = [
              summary.nameZh,
              summary.nameVi,
              summary.matCode,
              summary.componentCode,
              summary.spec,
              summary.materialZh,
              summary.attributeZh,
            ].filter(Boolean).join(' ');
            if (!matcher.test(searchable)) continue;

            const equivalenceSignature = [
              summary.nameZh,
              summary.nameVi,
              summary.spec,
              summary.materialZh,
            ].map(value => String(value || '').normalize('NFKC').trim().toLowerCase()).join('|');
            const key = groupEquivalentComponents
              ? equivalenceSignature
              : summary.materialId || `${summary.matCode}|${summary.spec}|${summary.nameZh}`;
            if (!components.has(key)) {
              const dimensions = parseDimensions(summary.spec)[0]?.numbers || [];
              components.set(key, {
                materialId: summary.materialId,
                materialCode: summary.matCode,
                materialCodes: new Set(),
                nameZh: summary.nameZh,
                nameVi: summary.nameVi,
                spec: summary.spec,
                dimensions,
                sizeMetric: dimensions.length > 0
                  ? dimensions.reduce((value, dimension) => value * dimension, 1)
                  : 0,
                usedInProducts: new Set(),
                usedInSkus: new Set(),
              });
            }
            const component = components.get(key);
            component.materialCodes.add(summary.matCode);
            component.usedInProducts.add(productCode);
            component.usedInSkus.add(
              product.color_info?.[color]?.sku || (color ? `${productCode}/${color}` : productCode),
            );
          }
        }
      }

      const matched = [...components.values()]
        .map(component => ({
          ...component,
          materialCodes: [...component.materialCodes].filter(Boolean).sort(),
          usedInProducts: [...component.usedInProducts].sort(),
          usedInSkus: [...component.usedInSkus].sort(),
        }))
        .filter(component => (
          targetProductIds.length === 0
          || targetProductIds.every(productId => component.usedInProducts.includes(productId))
        ))
        .sort((left, right) => (
          mode === 'rank_component_size'
            ? right.sizeMetric - left.sizeMetric
            : left.materialCode.localeCompare(right.materialCode)
        ));
      const sizedComponents = matched.filter(component => component.sizeMetric > 0);
      const maximumSize = mode === 'rank_component_size' ? sizedComponents[0]?.sizeMetric || 0 : null;
      const results = mode === 'rank_component_size'
        ? sizedComponents.filter(component => component.sizeMetric === maximumSize)
        : matched;

      return {
        interpretation: mode === 'rank_component_size'
          ? `Largest ${concept.canonicalEn} by parsed specification dimensions`
          : `${concept.canonicalEn} usage across the catalog`,
        scope: scope || 'catalog',
        countMode: mode,
        assumptions: mode === 'rank_component_size'
          ? 'Size is ranked by multiplying all dimensions parsed from each material specification'
          : 'Usage is grouped by canonical material identity across product color variants',
        componentConcept: concept.conceptId,
        totalCount: matched.length,
        results: results.slice(0, MAX_SEARCH_RESULTS),
        truncated: results.length > MAX_SEARCH_RESULTS,
        evidence: buildEvidence(this._sourceMetadata, concept.conceptId, 'data/materials.json'),
      };
    }

    if (mode === 'count_products') {
      const productCodes = Object.keys(bom);
      return {
        interpretation: 'Canonical product (SPU) count in catalog snapshot',
        scope: 'catalog',
        countMode: 'unique_products',
        assumptions: 'SPU products, excluding color/SKU variant duplication',
        totalCount: productCodes.length,
        results: productCodes.slice(0, MAX_SEARCH_RESULTS).map(code => ({ productCode: code, nameZh: bom[code]?.name_zh || code })),
        truncated: productCodes.length > MAX_SEARCH_RESULTS,
        evidence: buildEvidence(this._sourceMetadata, 'catalog', 'data/manifest.json'),
      };
    }

    if (mode === 'count_component_types') {
      // Unique metal frame types across catalog
      const frameMap = new Map();
      for (const [productCode, product] of Object.entries(bom)) {
        for (const color of (product.colors || [''])) {
          const rows = buildBomTreeRows(this._payload, productCode, color);
          for (const row of rows) {
            const name = row.name_zh || row.name || '';
            const spec = row.spec || '';
            if (/铁框|支撑框|侧框|金属框/i.test(name) || /铁框|支撑框/i.test(spec)) {
              const key = `${row.mat_code || row._materialId}|${spec}`;
              if (!frameMap.has(key)) {
                frameMap.set(key, {
                  materialCode: row.mat_code || row._materialId,
                  nameZh: name,
                  spec,
                  usedIn: new Set([productCode]),
                  dimensions: parseDimensions(spec)[0]?.numbers || [],
                });
              } else {
                frameMap.get(key).usedIn.add(productCode);
              }
            }
          }
        }
      }

      let filteredFrames = Array.from(frameMap.values());
      let clarificationNeeded = false;
      let clarificationPrompt = null;
      let nearValues = [];

      // Handle dimension filter if requested (e.g. 宽度290mm or 高度657mm)
      if (parsedDims.length > 0) {
        const targetDim = parsedDims[0];
        const targetVal = targetDim.numbers[0];
        const requestedAxis = targetDim.axis || 'unspecified';
        const dimensionAtAxis = (numbers) => {
          if (!numbers.length) return null;
          if (requestedAxis === 'height') return numbers[0];
          if (requestedAxis === 'width') return numbers.length >= 2 ? numbers[1] : numbers[0];
          if (requestedAxis === 'depth') return numbers[numbers.length - 1];
          return numbers.includes(targetVal) ? targetVal : null;
        };
        const datasetValues = filteredFrames
          .map(item => dimensionAtAxis(item.dimensions))
          .filter(value => Number.isFinite(value));
        const proximity = checkDimensionProximity(targetVal, datasetValues);
        nearValues = [...new Set(proximity.nearMatches)];
        if (proximity.promptClarification) {
          clarificationNeeded = true;
          clarificationPrompt = proximity.clarificationPrompt;
        }
        const acceptedValues = proximity.exactMatches.length > 0
          ? new Set([targetVal])
          : new Set(proximity.nearMatches);
        filteredFrames = filteredFrames.filter(item => {
          const value = dimensionAtAxis(item.dimensions);
          return Number.isFinite(value) && acceptedValues.has(value);
        });
      }

      const boundedFrames = filteredFrames.slice(0, MAX_SEARCH_RESULTS);

      return {
        interpretation: 'Unique metal frame component types count',
        scope: scope || 'all',
        countMode: 'unique_component_types',
        assumptions: 'Grouped by unique material code and specification',
        totalCount: filteredFrames.length,
        results: boundedFrames.map(f => ({
          materialCode: f.materialCode,
          nameZh: f.nameZh,
          spec: f.spec,
          usedInProducts: Array.from(f.usedIn),
        })),
        truncated: filteredFrames.length > MAX_SEARCH_RESULTS,
        needsClarification: clarificationNeeded,
        clarificationCode: clarificationNeeded ? 'dimension_near_match' : null,
        clarificationData: clarificationNeeded ? {
          requested: parsedDims[0]?.numbers?.[0],
          nearValues,
        } : null,
        clarificationText: clarificationPrompt,
        evidence: buildEvidence(this._sourceMetadata, 'metal_frames', 'data/materials.json'),
      };
    }

    if (mode === 'variant_coverage') {
      const productId = text.match(/\bLGS\d{3,4}\b/i)?.[0]?.toUpperCase() || '';
      const product = bom[productId];
      if (!product) throw new Error(`Not found: product ${productId}`);
      const requestedColor = ['白色', '黑色', '复古色'].find(color => text.includes(color)) || '';
      const variants = (product.colors || []).map(color => {
        const hardwareBags = buildBomTreeRows(this._payload, productId, color)
          .filter(row => row._level === 1 && /五金包|螺丝包/i.test(row.name_zh || row.name || ''))
          .map(toBomRowSummary);
        return {
          productCode: productId,
          color,
          hardwareBags: hardwareBags.slice(0, 10),
          hardwareBagCount: hardwareBags.length,
        };
      });
      const requestedVariantExists = !requestedColor || variants.some(variant => variant.color === requestedColor);
      return {
        interpretation: 'Product color and hardware-bag variant coverage',
        scope: productId,
        countMode: 'variant_coverage',
        assumptions: 'Only canonical product colors and top-level hardware-bag assemblies are counted',
        requestedColor: requestedColor || null,
        requestedVariantExists,
        totalCount: variants.length,
        results: variants,
        dataQualityWarnings: requestedVariantExists ? [] : [{
          type: 'requested_color_not_defined',
          productCode: productId,
          requestedColor,
          availableColors: product.colors || [],
        }],
        truncated: false,
        needsClarification: false,
        evidence: buildEvidence(this._sourceMetadata, productId, `data/products/${productId}.json`),
      };
    }

    if (mode === 'rank_by_drawer_variants') {
      const drawerMap = new Map();
      for (const [productCode, product] of Object.entries(bom)) {
        const uniqueDrawers = new Map();
        for (const color of (product.colors || [''])) {
          const rows = buildBomTreeRows(this._payload, productCode, color);
          for (const row of rows) {
            if (/布抽|布袋|布兜/i.test(row.name_zh || row.name || '')) {
              // Physical drawer concept (ignoring color)
              const physKey = `${row.spec || row.name_zh}`;
              uniqueDrawers.set(physKey, row);
            }
          }
        }
        drawerMap.set(productCode, {
          productCode,
          drawerVariantCount: uniqueDrawers.size,
          drawers: Array.from(uniqueDrawers.values()).map(r => r.name_zh || r.spec),
        });
      }

      const ranked = Array.from(drawerMap.values()).sort((a, b) => b.drawerVariantCount - a.drawerVariantCount);
      return {
        interpretation: 'Products ranked by unique physical drawer variants (color variants excluded)',
        scope: 'catalog',
        countMode: 'rank_by_drawer_variants',
        assumptions: 'Color variants of the same physical drawer type are counted as one concept',
        totalCount: ranked.length,
        results: ranked.slice(0, MAX_SEARCH_RESULTS),
        truncated: ranked.length > MAX_SEARCH_RESULTS,
        evidence: buildEvidence(this._sourceMetadata, 'drawers', 'data/products'),
      };
    }

    if (mode === 'shared_hardware_bags') {
      const hardwareRecords = [];
      for (const [productCode, product] of Object.entries(bom)) {
        for (const color of (product.colors || [''])) {
          const rows = buildBomTreeRows(this._payload, productCode, color).map(toBomRowSummary);
          for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            if (row.level !== 1 || !/五金包|螺丝包/i.test(row.nameZh)) continue;
            const children = [];
            for (let childIndex = index + 1; childIndex < rows.length && rows[childIndex].level > row.level; childIndex++) {
              if (rows[childIndex].level === row.level + 1) children.push(rows[childIndex]);
            }
            const compositionSignature = children
              .map(child => `${child.materialId || child.matCode}|${normalizedQuantity(child.qty) ?? child.qty}`)
              .sort()
              .join(';');
            hardwareRecords.push({
              productCode,
              color,
              hardwareCode: row.matCode,
              materialId: row.materialId,
              nameZh: row.nameZh,
              compositionSignature,
              childCount: children.length,
            });
          }
        }
      }
      const sharedGroups = new Map();
      const addGroup = (key, record, matchingBasis) => {
        if (!key) return;
        if (!sharedGroups.has(`${matchingBasis}:${key}`)) {
          sharedGroups.set(`${matchingBasis}:${key}`, { matchingBasis, records: [], products: new Set(), codes: new Set() });
        }
        const group = sharedGroups.get(`${matchingBasis}:${key}`);
        group.records.push(record);
        group.products.add(record.productCode);
        group.codes.add(record.hardwareCode);
      };
      hardwareRecords.forEach(record => {
        addGroup(record.materialId || record.hardwareCode, record, 'exact_material_identity');
        if (record.compositionSignature) addGroup(record.compositionSignature, record, 'identical_composition');
      });
      const shared = [...sharedGroups.values()]
        .filter(group => group.products.size > 1 &&
          (group.matchingBasis !== 'identical_composition' || group.codes.size > 1))
        .map(group => ({
          hardwareCode: [...group.codes].join(' / '),
          nameZh: group.records[0]?.nameZh || '',
          matchingBasis: group.matchingBasis,
          childCount: group.records[0]?.childCount || 0,
          usedInProducts: [...group.products].sort(),
        }));

      return {
        interpretation: 'Shared hardware bag usage across products',
        scope: 'catalog',
        countMode: 'shared_hardware_bags',
        assumptions: 'Grouped by exact material identity or identical child-material composition and quantities',
        totalCount: shared.length,
        results: shared.slice(0, MAX_SEARCH_RESULTS),
        truncated: shared.length > MAX_SEARCH_RESULTS,
        evidence: buildEvidence(this._sourceMetadata, 'hardware_bags', 'data/materials.json'),
      };
    }

    if (mode === 'rank_by_parts') {
      const partStats = [];
      for (const [productCode, product] of Object.entries(bom)) {
        const variants = (product.colors || ['']).map(color => {
          const rows = buildBomTreeRows(this._payload, productCode, color);
          const uniqueMaterials = new Set(rows.map(row => row._materialId || row.mat_code).filter(Boolean));
          const totalQty = rows.reduce((sum, row) => sum + (normalizedQuantity(row.qty) ?? 0), 0);
          return { color, uniqueMaterialTypesCount: uniqueMaterials.size, totalBomQuantity: totalQty, totalBomRows: rows.length };
        });
        const byTypes = [...variants].sort((left, right) => right.uniqueMaterialTypesCount - left.uniqueMaterialTypesCount)[0];
        const byQuantity = [...variants].sort((left, right) => right.totalBomQuantity - left.totalBomQuantity)[0];
        partStats.push({ productCode, variants, ...byTypes, maxQuantityColor: byQuantity?.color, totalBomQuantity: byQuantity?.totalBomQuantity || 0 });
      }

      const sortedByTypes = [...partStats].sort((a, b) => b.uniqueMaterialTypesCount - a.uniqueMaterialTypesCount);
      const sortedByQty = [...partStats].sort((a, b) => b.totalBomQuantity - a.totalBomQuantity);

      const topTypes = sortedByTypes[0];
      const topQty = sortedByQty[0];

      const differs = topTypes.productCode !== topQty.productCode;

      return {
        interpretation: 'Product parts count ranking (unique material types vs total BOM quantity)',
        scope: 'catalog',
        countMode: 'rank_by_parts',
        assumptions: 'Ranked both by unique material types and total BOM quantity',
        totalCount: partStats.length,
        results: sortedByTypes.slice(0, 10),
        truncated: sortedByTypes.length > 10,
        needsClarification: differs,
        clarificationCode: differs ? 'parts_metric' : null,
        clarificationData: differs ? { byTypes: topTypes, byQuantity: topQty } : null,
        clarificationText: differs
          ? `By unique material types, ${topTypes.productCode} has the most (${topTypes.uniqueMaterialTypesCount} types). By total BOM quantity, ${topQty.productCode} has the most (${topQty.totalBomQuantity} items). Which metric do you prefer?`
          : null,
        evidence: buildEvidence(this._sourceMetadata, 'part_stats', 'data/products'),
      };
    }

    // Default catalog summary
    return {
      interpretation: 'Catalog overview analysis',
      scope: scope || 'catalog',
      countMode: 'catalog_summary',
      assumptions: 'All products and materials recorded in current PDM snapshot',
      totalCount: Object.keys(bom).length,
      results: Object.keys(bom).slice(0, MAX_SEARCH_RESULTS).map(code => ({ productCode: code, nameZh: bom[code]?.name_zh || code })),
      truncated: Object.keys(bom).length > MAX_SEARCH_RESULTS,
      evidence: buildEvidence(this._sourceMetadata, 'catalog', 'data/manifest.json'),
    };
  }

  /**
   * Audit product data quality — returns bounded stats, not raw payload.
   */
  auditProductData({ productId } = {}) {
    const bom = this._payload.bom || {};
    const product = bom[productId];
    if (!product) throw new Error(`Not found: product ${productId}`);

    const colors = product.colors || [];
    let totalBomRows = 0;
    for (const color of colors) {
      totalBomRows += buildBomTreeRows(this._payload, productId, color).length;
    }

    return {
      productCode: productId,
      materialCount: totalBomRows,
      colors,
      evidence: buildEvidence(this._sourceMetadata, productId, `data/products/${productId}.json`),
    };
  }
}
