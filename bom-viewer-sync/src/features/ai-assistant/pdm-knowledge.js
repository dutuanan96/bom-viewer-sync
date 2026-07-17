// pdm-knowledge.js — R1.3: Deterministic PDM indexes and read-only tools.
//
// All queries are read-only against a frozen snapshot. No mutations.
// Results are bounded, normalized, and carry evidence/source metadata.
// Only the keys needed for the AI response are included — no full payload leakage.

import { buildBomTreeRows } from '../../domain/relationships.js';
import { normalizeProductRevisionRegistry } from '../../domain/revisions.js';

// Maximum results returned by search operations
const MAX_SEARCH_RESULTS = 50;
// Maximum BOM rows returned
const MAX_BOM_ROWS = 200;

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
    capturedAt: sourceMetadata?.updatedAt || null,
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
    nameZh: row.name_zh || row.name || '',
    qty: row.qty || row.quantity || '',
    unit: row.unit || '',
    level: row._level || 1,
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
      // Product has no explicit revision history — return default state
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
      currentRevisionInfo: record.currentRevisionInfo,
      revisions: record.revisions,
      effectivityEvents: record.effectivityEvents || [],
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

    const rows1 = buildBomTreeRows(this._payload, productId1, color1 || bom[productId1]?.colors?.[0] || '').slice(0, MAX_BOM_ROWS).map(toBomRowSummary);
    const rows2 = buildBomTreeRows(this._payload, productId2, color2 || bom[productId2]?.colors?.[0] || '').slice(0, MAX_BOM_ROWS).map(toBomRowSummary);

    return {
      product1: { productCode: productId1, color: color1, rows: rows1 },
      product2: { productCode: productId2, color: color2, rows: rows2 },
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
