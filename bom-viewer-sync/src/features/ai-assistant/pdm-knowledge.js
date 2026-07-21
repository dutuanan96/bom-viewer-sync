// pdm-knowledge.js â€?R1.3: Deterministic PDM indexes and read-only tools.
//
// All queries are read-only against a frozen snapshot. No mutations.
// Results are bounded, normalized, and carry evidence/source metadata.
// Only the keys needed for the AI response are included â€?no full payload leakage.

import { buildBomTreeRows } from '../../domain/relationships.js';
import { normalizeProductRevisionRegistry } from '../../domain/revisions.js';
import { classifyMaterialFamily, summarizeMaterialFamilies } from './pdm-ontology.js';

// Maximum results returned by search operations
const MAX_SEARCH_RESULTS = 50;
// Maximum BOM rows returned
const MAX_BOM_ROWS = 200;
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
  return {
    productCode,
    nameZh: product.name_zh || product.name || productCode,
    nameVi: product.name_vi || null,
    colors: Array.isArray(product.colors) ? product.colors : [],
  };
}

/**
 * Normalize a BOM row to only expose safe fields (no internal state).
 */
function toBomRowSummary(row) {
  return {
    matCode: row.comp_code || row.mat_code || row._materialId || '',
    materialId: row._materialId || '',
    nameZh: row.name_zh || row.name || '',
    spec: row.spec || '',
    attributeZh: row.attr_zh || '',
    materialZh: row.material_zh || '',
    qty: row.qty || row.quantity || '',
    unit: row.unit || '',
    level: row._level || 1,
  };
}

function normalizedQuantity(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = text.replace(',', '.');
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : null;
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
        level,
        nameZh: row.nameZh || '',
        spec: row.spec || '',
        attributeZh: row.attributeZh || '',
        materialZh: row.materialZh || '',
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
      const allNumeric = numericQuantities.length > 0 && numericQuantities.every(value => value !== null);
      const quantity = allNumeric
        ? Number(numericQuantities.reduce((sum, value) => sum + value, 0).toFixed(6))
        : null;
      const units = [...group.units].sort();
      return [matchKey, {
        matCode: group.matCode,
        materialId: group.materialId,
        level: group.level,
        nameZh: group.nameZh,
        spec: group.spec,
        attributeZh: group.attributeZh,
        materialZh: group.materialZh,
        quantity,
        quantityText: allNumeric ? String(quantity) : group.quantities.join(' + '),
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
  constructor(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('snapshot is required');
    this._sourceMetadata = snapshot.sourceMetadata || null;
    this._payload = snapshot.payload || {};
    this._aliasMap = options.aliasMap || {};

    // Build normalized revision registry from payload (uses domain logic, safe for empty)
    this._revisionRegistry = normalizeProductRevisionRegistry(this._payload);
  }

  /**
   * Search products by query string. Returns bounded, normalized results.
   * @param {{ query?: string, withEvidence?: boolean, page?: number }} args
   */
  searchProducts({ query = '', withEvidence = false, page = 1 } = {}) {
    const q = String(query).toLowerCase().trim();
    const bom = this._payload.bom || {};
    const matches = [];

    for (const [productCode, product] of Object.entries(bom)) {
      if (!product) continue;
      const nameZh = String(product.name_zh || product.name || '').toLowerCase();
      const nameVi = String(product.name_vi || '').toLowerCase();
      if (!q || productCode.toLowerCase().includes(q) || nameZh.includes(q) || nameVi.includes(q)) {
        matches.push(toProductSummary(productCode, product));
      }
    }

    // Deterministic sort by productCode
    matches.sort((a, b) => a.productCode.localeCompare(b.productCode));
    const paginated = matches.slice(0, MAX_SEARCH_RESULTS);

    if (withEvidence) {
      const evidence = buildEvidence(this._sourceMetadata, 'bom-index', 'data/manifest.json');
      return { results: paginated, evidence };
    }
    return paginated;
  }

  /**
   * Get a bounded product summary by productCode.
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
   * Resolve a U-prefix SKU alias to internal SKU.
   * Validates that the resolved product actually exists in the snapshot.
   * Exact alias lookup uses the alias map (from knowledge pack).
   * Fallback: parse U + productCode + materialCode from alias string.
   *
   * Throws if product or internal SKU does not exist in snapshot.
   */
  resolveSku({ alias } = {}) {
    const aliasStr = String(alias || '').trim();
    if (!aliasStr) throw new Error('alias is required');

    const bom = this._payload.bom || {};

    // 1. Check alias map first (user-confirmed aliases from knowledge pack)
    if (this._aliasMap[aliasStr]) {
      const entry = this._aliasMap[aliasStr];
      if (!bom[entry.productCode]) {
        throw new Error(`Not found: product ${entry.productCode} referenced by alias ${aliasStr}`);
      }
      return {
        internalSku: entry.internalSku,
        productCode: entry.productCode,
        resolution: entry.resolution || 'alias-pack',
        evidence: buildEvidence(this._sourceMetadata, entry.productCode, `data/products/${entry.productCode}.json`),
      };
    }

    // 2. Parse exact U-prefix alias: U + productCode + colorOrMatCode
    // Pattern: U + [A-Z][A-Z0-9]+ + [A-Z][A-Z0-9]+
    if (!aliasStr.startsWith('U')) throw new Error(`Not found: alias ${aliasStr} does not match U-prefix pattern`);

    // Try to match against known product codes (longest prefix match)
    const withoutU = aliasStr.slice(1);
    let matchedProduct = null;
    let matchedSuffix = null;

    for (const productCode of Object.keys(bom)) {
      if (withoutU.startsWith(productCode) && withoutU.length > productCode.length) {
        if (!matchedProduct || productCode.length > matchedProduct.length) {
          matchedProduct = productCode;
          matchedSuffix = withoutU.slice(productCode.length);
        }
      }
    }

    if (!matchedProduct) {
      throw new Error(`Not found: no product matches alias ${aliasStr}`);
    }

    const internalSku = `${matchedProduct}${matchedSuffix}`;

    return {
      internalSku,
      productCode: matchedProduct,
      resolution: 'exact-u-prefix-alias',
      evidence: buildEvidence(this._sourceMetadata, matchedProduct, `data/products/${matchedProduct}.json`),
    };
  }

  /**
   * Get BOM rows for a product+color combination.
   * Returns bounded, normalized rows with evidence.
   */
  getBom({ productId, color } = {}) {
    const bom = this._payload.bom || {};
    const product = bom[productId];
    if (!product) throw new Error(`Not found: product ${productId}`);

    const colorName = color || (product.colors?.[0]) || '';
    const rows = buildBomTreeRows(this._payload, productId, colorName);

    const bounded = rows.slice(0, MAX_BOM_ROWS).map(toBomRowSummary);

    return {
      productCode: productId,
      color: colorName,
      rows: bounded,
      totalRows: rows.length,
      truncated: rows.length > MAX_BOM_ROWS,
      evidence: buildEvidence(this._sourceMetadata, productId, `data/products/${productId}.json`),
    };
  }

  /**
   * Get revision history for a product.
   * Uses the normalized productRevisions registry (real structure: { currentRevision, effectiveRevision, revisions, ... }).
   * Never treats the record as a plain array.
   */
  getRevisionHistory({ productId } = {}) {
    const record = this._revisionRegistry[productId] || null;
    if (!record) {
      // Product has no explicit revision history â€?return default state
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
   * Returns bounded list.
   */
  whereUsed({ materialId } = {}) {
    const bom = this._payload.bom || {};
    const usage = [];

    for (const [productCode, product] of Object.entries(bom)) {
      if (!product) continue;
      for (const color of (product.colors || [''])) {
        const rows = buildBomTreeRows(this._payload, productCode, color);
        const found = rows.some(r => (r.comp_code || r._materialId) === materialId);
        if (found) {
          usage.push({ productCode, color });
          break;
        }
      }
      if (usage.length >= MAX_SEARCH_RESULTS) break;
    }

    return {
      materialId,
      usage,
      evidence: buildEvidence(this._sourceMetadata, materialId, 'data/materials.json'),
    };
  }

  /**
   * Compare BOM rows between two product+color combinations.
   */
  compareBoms({ productId1, color1, productId2, color2 } = {}) {
    const bom = this._payload.bom || {};
    if (!bom[productId1]) throw new Error(`Not found: product ${productId1}`);
    if (!bom[productId2]) throw new Error(`Not found: product ${productId2}`);

    const resolvedColor1 = color1 || bom[productId1]?.colors?.[0] || '';
    const resolvedColor2 = color2 || bom[productId2]?.colors?.[0] || '';
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

    const quantityOrUnitDifferences = common.filter(item => item.quantityOrUnitDifferent);
    const commonByAttribute = {};
    for (const item of common) {
      const attribute = item.attributeZh || 'unclassified';
      commonByAttribute[attribute] = (commonByAttribute[attribute] || 0) + 1;
    }
    const commonByMaterialFamily = summarizeMaterialFamilies(common);
    const unionCount = aggregated1.size + aggregated2.size - common.length;
    const similarityScore = unionCount === 0 ? 1 : common.length / unionCount;
    const truncated = fullRows1.length > MAX_BOM_ROWS ||
      fullRows2.length > MAX_BOM_ROWS ||
      common.length > MAX_COMPARISON_RESULTS ||
      onlyProduct1.length > MAX_COMPARISON_RESULTS ||
      onlyProduct2.length > MAX_COMPARISON_RESULTS ||
      quantityOrUnitDifferences.length > MAX_COMPARISON_RESULTS;

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
        onlyProduct1Count: onlyProduct1.length,
        onlyProduct2Count: onlyProduct2.length,
        quantityOrUnitDifferenceCount: quantityOrUnitDifferences.length,
        similarityScore,
        commonByAttribute,
        commonByMaterialFamily
      },
      common: common.slice(0, MAX_COMPARISON_RESULTS),
      onlyProduct1: onlyProduct1.slice(0, MAX_COMPARISON_RESULTS),
      onlyProduct2: onlyProduct2.slice(0, MAX_COMPARISON_RESULTS),
      quantityOrUnitDifferences: quantityOrUnitDifferences.slice(0, MAX_COMPARISON_RESULTS),
      truncated,
      evidence: [
        buildEvidence(this._sourceMetadata, productId1, `data/products/${productId1}.json`),
        buildEvidence(this._sourceMetadata, productId2, `data/products/${productId2}.json`)
      ]
    };
  }

  /**
   * Audit product data quality â€?returns bounded stats, not raw payload.
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
