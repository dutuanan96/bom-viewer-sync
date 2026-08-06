import { buildBomTreeRows } from '../../domain/relationships.js';
import { payloadForProductRevision, productRevisionOptions } from '../../domain/revisions.js';

const MAX_RESULTS = 50;
const MAX_COMPARISON_ROWS = 100;

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/[\u00d7*]/g, 'x')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const SEARCH_STOP_WORDS = new Set([
  'and', 'can', 'find', 'for', 'help', 'please', 'product', 'search', 'show', 'the', 'used', 'what', 'where',
  'cho', 'cua', 'dung', 'giup', 'loai', 'nao', 'pham', 'san', 'tim', 'toi', 'trong',
]);

const SCOPED_SEARCH_STOP_WORDS = new Set([
  ...SEARCH_STOP_WORDS,
  'does', 'have', 'has', 'which', 'with', 'use', 'uses',
  'co', 'gi', 'la', 'xem',
]);

const HAN_SEARCH_STOP_SIGNALS = new Set([
  '\u4ec0\u4e48', '\u54ea\u4e2a', '\u54ea\u4e9b', '\u5e2e\u6211', '\u770b\u770b', '\u4e00\u4e0b', '\u7528\u4ec0', '\u6709\u4ec0',
]);

function searchTerms(query) {
  const normalized = normalizeSearchText(query);
  const highSignal = [
    ...(normalized.match(/\blgs\d{3,4}\b/g) || []),
    ...(normalized.match(/\bmat_[a-z0-9]+\b/g) || []),
    ...(normalized.match(/\b\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?(?:mm)?\b/g) || []),
  ];
  if (highSignal.length > 0) return [...new Set(highSignal)];
  return [...new Set(normalized
    .split(/[^\p{L}\p{N}_.-]+/u)
    .filter(term => (
      term.length >= 3 || (/^[\p{Script=Han}]+$/u.test(term) && [...term].length >= 2)
    ) && !SEARCH_STOP_WORDS.has(term)))];
}

function scopedSearchSignals(query, productId) {
  const normalizedProductId = normalizeSearchText(productId);
  const normalized = normalizeSearchText(query).replace(new RegExp(`\\b${normalizedProductId}\\b`, 'g'), ' ');
  const weightedSignals = new Map();
  const addSignal = (term, weight) => {
    const value = normalizeSearchText(term);
    if (!value || SCOPED_SEARCH_STOP_WORDS.has(value)) return;
    weightedSignals.set(value, Math.max(weightedSignals.get(value) || 0, weight));
  };

  for (const value of normalized.match(/\bmat_[a-z0-9]+\b/g) || []) addSignal(value, 1000);
  for (const value of normalized.match(/\b\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?(?:mm)?\b/g) || []) addSignal(value, 1000);
  for (const value of normalized.match(/[\p{Script=Latin}\p{N}_.-]+/gu) || []) {
    if (value.length >= 2 && !/^lgs\d{3,4}$/.test(value)) addSignal(value, value.length);
  }

  for (const run of normalized.match(/\p{Script=Han}+/gu) || []) {
    const characters = [...run];
    const maxLength = Math.min(6, characters.length);
    for (let length = maxLength; length >= 2; length -= 1) {
      for (let start = 0; start + length <= characters.length; start += 1) {
        const value = characters.slice(start, start + length).join('');
        if (!HAN_SEARCH_STOP_SIGNALS.has(value)) addSignal(value, length * length);
      }
    }
  }

  return [...weightedSignals].map(([term, weight]) => ({ term, weight }));
}

function relevanceScore(value, signals) {
  const haystack = normalizeSearchText(searchableText(value));
  return signals.reduce((score, signal) => (
    haystack.includes(signal.term) ? score + signal.weight : score
  ), 0);
}

function matchesSearch(value, terms) {
  const haystack = normalizeSearchText(searchableText(value));
  return terms.length > 0 && terms.every(term => haystack.includes(term));
}

function searchableText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(searchableText).join(' ');
  if (typeof value === 'object') return Object.values(value).map(searchableText).join(' ');
  return String(value);
}

function evidence(snapshot, { id, sourceType, sourcePath, recordId }) {
  const metadata = snapshot?.sourceMetadata || snapshot?.payload?.sourceMetadata || {};
  return {
    id,
    sourceType,
    sourcePath,
    recordId,
    sourceCommit: metadata.commitSha || '',
    capturedAt: metadata.updatedAt || new Date().toISOString(),
  };
}

function materialSummary(record, usedBy) {
  return {
    materialId: record.id || '',
    code: record.code || '',
    name: record.name || {},
    spec: record.spec || {},
    material: record.material || {},
    color: record.color || {},
    attribute: record.attr || {},
    usedBy,
  };
}

function clarificationHints(candidates) {
  const hints = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const attribute = candidate.summary.attribute || {};
    const hint = {
      zh: String(attribute.zh || '').trim(),
      vi: String(attribute.vi || '').trim(),
    };
    const key = `${hint.zh}|${hint.vi}`;
    if ((!hint.zh && !hint.vi) || seen.has(key)) continue;
    seen.add(key);
    hints.push(hint);
    if (hints.length >= 5) break;
  }
  return hints;
}

function buildMaterialUsageIndex(payload) {
  const usageByMaterial = new Map();
  const childEntriesByParent = new Map();
  const queue = [];

  const addUsage = (materialId, usage) => {
    if (!materialId || !usage.productCode) return;
    if (!usageByMaterial.has(materialId)) usageByMaterial.set(materialId, new Map());
    const key = `${usage.productCode}|${usage.color}`;
    if (usageByMaterial.get(materialId).has(key)) return;
    usageByMaterial.get(materialId).set(key, usage);
    queue.push({ materialId, usage });
  };

  for (const entry of (payload.materialDb?.bomEntries || [])) {
    if (entry?.parentType === 'product') {
      addUsage(entry.materialId, { productCode: entry.productCode || '', color: entry.color || '' });
      continue;
    }
    if (entry?.parentType !== 'material' || !entry.parentId) continue;
    if (!childEntriesByParent.has(entry.parentId)) childEntriesByParent.set(entry.parentId, []);
    childEntriesByParent.get(entry.parentId).push(entry);
    if (entry.productCode) {
      addUsage(entry.childMaterialId || entry.materialId, { productCode: entry.productCode, color: entry.color || '' });
    }
  }

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const { materialId, usage } = queue[queueIndex];
    for (const entry of (childEntriesByParent.get(materialId) || [])) {
      if (entry.productCode && entry.productCode !== usage.productCode) continue;
      if (entry.color && usage.color && entry.color !== usage.color) continue;
      addUsage(entry.childMaterialId || entry.materialId, {
        productCode: usage.productCode,
        color: entry.color || usage.color,
      });
    }
  }

  return usageByMaterial;
}

function productSummary(productCode, product) {
  return {
    productCode,
    revision: product?.revision || '',
    nameZh: product?.name_zh || product?.name || '',
    nameVi: product?.name_vi || '',
    colors: Array.isArray(product?.colors) ? product.colors.slice(0, 20) : Object.keys(product?.color_info || {}).slice(0, 20),
  };
}

function safeBomRow(row, color) {
  return {
    entryId: row?._entryId || '',
    identity: row?._materialId || row?.mat_code || row?.comp_code || '',
    materialId: row?._materialId || '',
    materialCode: row?.mat_code || '',
    componentCode: row?.comp_code || '',
    nameZh: row?.name_zh || '',
    nameVi: row?.name_vi || '',
    specZh: row?.spec || '',
    specVi: row?.spec_vi || '',
    quantity: row?.qty || '',
    level: Number(row?._level || 1),
    color,
  };
}

function rowKey(row) {
  return row.entryId || [row.color, row.level, row.identity, row.componentCode].join('|');
}

function comparableRow(row) {
  const { identity, ...value } = row;
  return JSON.stringify(value);
}

function revisionInfo(options, revision) {
  const match = options.find(item => item.revision.toUpperCase() === revision.toUpperCase());
  if (!match) throw new Error(`Revision not found: ${revision}`);
  return match;
}

export class PdmDiscovery {
  constructor(snapshot) {
    this.snapshot = snapshot || {};
    this.payload = this.snapshot.payload || this.snapshot;
  }

  searchPdm({ query, productId, materialId } = {}) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) throw new Error('Search query is required');
    const scopedProductId = String(productId || '').trim().toUpperCase();
    const mappedMaterialId = String(materialId || '').trim();
    const terms = searchTerms(normalizedQuery);
    const scopedSignals = scopedProductId ? scopedSearchSignals(query, scopedProductId) : [];

    const products = [];
    const materials = [];
    const revisions = [];
    const usageByMaterial = buildMaterialUsageIndex(this.payload);
    const scopedMaterialCandidates = [];

    for (const [productCode, product] of Object.entries(this.payload.bom || {})) {
      if (scopedProductId && productCode !== scopedProductId) continue;
      if (scopedProductId || matchesSearch({ productCode, product }, terms)) {
        products.push(productSummary(productCode, product));
      }
    }

    for (const record of Object.values(this.payload.materialDb?.materials || {})) {
      const usage = Array.from(usageByMaterial.get(record.id)?.values() || []);
      const usedBy = (scopedProductId
        ? usage.filter(item => item.productCode === scopedProductId)
        : usage
      ).slice(0, MAX_RESULTS);
      if (scopedProductId && usedBy.length === 0) continue;
      if (scopedProductId) {
        scopedMaterialCandidates.push({
          summary: materialSummary(record, usedBy),
          score: relevanceScore(record, scopedSignals),
        });
        continue;
      }
      if (!matchesSearch({ record, usedBy }, terms)) continue;
      materials.push(materialSummary(record, usedBy));
    }

    if (materials.length === 0 && !scopedProductId && terms.length > 1) {
      const specTerms = terms.filter(t => /\d+/.test(t));
      if (specTerms.length > 1) {
        const fallbackTerms = terms.filter(t => t !== specTerms[specTerms.length - 1]);
        for (const record of Object.values(this.payload.materialDb?.materials || {})) {
          const usage = Array.from(usageByMaterial.get(record.id)?.values() || []);
          if (!matchesSearch({ record, usedBy: usage }, fallbackTerms)) continue;
          materials.push(materialSummary(record, usage));
        }
      }
    }

    const matchedMaterialCandidates = scopedMaterialCandidates.filter(candidate => candidate.score > 0);
    const mappedMaterialCandidates = mappedMaterialId
      ? scopedMaterialCandidates.filter(candidate => candidate.summary.materialId === mappedMaterialId)
      : [];
    const selectedMaterialCandidates = mappedMaterialId
      ? mappedMaterialCandidates
      : matchedMaterialCandidates.length > 0 ? matchedMaterialCandidates : scopedMaterialCandidates;
    selectedMaterialCandidates
      .sort((left, right) => right.score - left.score || left.summary.code.localeCompare(right.summary.code))
      .forEach(candidate => materials.push(candidate.summary));

    for (const productCode of Object.keys(this.payload.productRevisions || {})) {
      if (scopedProductId && productCode !== scopedProductId) continue;
      for (const option of productRevisionOptions(this.payload, productCode)) {
        if (scopedProductId && relevanceScore(option, scopedSignals) === 0) continue;
        if (!matchesSearch({ productCode, ...option }, terms)) continue;
        revisions.push({
          productCode,
          revision: option.revision,
          current: option.current,
          effective: option.effective,
          workflowState: option.workflowState,
          changeReason: option.changeReason,
          createdAt: option.createdAt,
        });
      }
    }

    const totalMatches = products.length + materials.length + revisions.length;
    return {
      query: String(query),
      ...(scopedProductId ? { productId: scopedProductId } : {}),
      ...(scopedProductId ? {
        matchMode: mappedMaterialId
          ? mappedMaterialCandidates.length > 0 ? 'scoped-mapped' : 'mapping-miss'
          : scopedMaterialCandidates.length === 0
            ? 'scoped-empty'
            : matchedMaterialCandidates.length > 0 ? 'scoped-ranked' : 'scoped-candidates',
        matchedCount: mappedMaterialId ? mappedMaterialCandidates.length : matchedMaterialCandidates.length,
        candidateCount: scopedMaterialCandidates.length,
        clarificationHints: clarificationHints(scopedMaterialCandidates),
        ...(mappedMaterialId ? { requestedMaterialId: mappedMaterialId } : {}),
      } : {}),
      products: products.slice(0, MAX_RESULTS),
      materials: materials.slice(0, MAX_RESULTS),
      revisions: revisions.slice(0, MAX_RESULTS),
      totalMatches,
      truncated: products.length > MAX_RESULTS || materials.length > MAX_RESULTS || revisions.length > MAX_RESULTS,
      evidence: evidence(this.snapshot, {
        id: `pdm_search_${Date.now().toString(36)}`,
        sourceType: 'pdm-search',
        sourcePath: 'data/products + data/materials + data/manifest',
        recordId: [scopedProductId, mappedMaterialId, String(query)].filter(Boolean).join(':').slice(0, 100),
      }),
    };
  }

  listRecentChanges() {
    const changes = [];
    for (const [productCode, record] of Object.entries(this.payload.productRevisions || {})) {
      for (const option of productRevisionOptions(this.payload, productCode)) {
        if (!option.createdAt && !option.changeReason) continue;
        changes.push({
          type: 'revision',
          productCode,
          revision: option.revision,
          workflowState: option.workflowState,
          changeReason: option.changeReason,
          occurredAt: option.createdAt,
        });
      }
      for (const event of (record?.effectivityEvents || [])) {
        changes.push({
          type: 'effectivity',
          productCode,
          revision: event.revision || '',
          previousRevision: event.previousRevision || '',
          action: event.action || '',
          reason: event.reason || '',
          occurredAt: event.occurredAt || '',
        });
      }
    }
    for (const notification of (this.payload.notifications || [])) {
      changes.push({
        type: 'notification',
        id: notification.id || '',
        productCode: notification.productCode || '',
        title: notification.title || notification.message || '',
        changes: Array.isArray(notification.changes) ? notification.changes.slice(0, 20) : [],
        occurredAt: notification.createdAt || notification.updatedAt || notification.timestamp || '',
      });
    }
    changes.sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)));
    return {
      changes: changes.slice(0, MAX_RESULTS),
      totalMatches: changes.length,
      truncated: changes.length > MAX_RESULTS,
      evidence: evidence(this.snapshot, {
        id: `pdm_changes_${Date.now().toString(36)}`,
        sourceType: 'pdm-change-log',
        sourcePath: 'data/manifest + notifications',
        recordId: 'recent-changes',
      }),
    };
  }

  compareRevisions({ productId, revision1, revision2 } = {}) {
    const options = productRevisionOptions(this.payload, productId);
    const firstInfo = revisionInfo(options, revision1);
    const secondInfo = revisionInfo(options, revision2);
    const firstPayload = payloadForProductRevision(this.payload, productId, firstInfo.revision);
    const secondPayload = payloadForProductRevision(this.payload, productId, secondInfo.revision);
    const firstProduct = firstPayload?.bom?.[productId];
    const secondProduct = secondPayload?.bom?.[productId];
    if (!firstProduct || !secondProduct) throw new Error(`Product not found: ${productId}`);

    const colors = [...new Set([
      ...(firstProduct.colors || Object.keys(firstProduct.color_info || {})),
      ...(secondProduct.colors || Object.keys(secondProduct.color_info || {})),
    ])];
    const firstRows = colors.flatMap(color => buildBomTreeRows(firstPayload, productId, color).map(row => safeBomRow(row, color)));
    const secondRows = colors.flatMap(color => buildBomTreeRows(secondPayload, productId, color).map(row => safeBomRow(row, color)));
    const firstByKey = new Map(firstRows.map(row => [rowKey(row), row]));
    const secondByKey = new Map(secondRows.map(row => [rowKey(row), row]));
    const added = secondRows.filter(row => !firstByKey.has(rowKey(row)));
    const removed = firstRows.filter(row => !secondByKey.has(rowKey(row)));
    const modified = secondRows
      .filter(row => firstByKey.has(rowKey(row)) && comparableRow(firstByKey.get(rowKey(row))) !== comparableRow(row))
      .map(after => ({ before: firstByKey.get(rowKey(after)), after }));

    return {
      productId,
      revision1: firstInfo,
      revision2: secondInfo,
      summary: {
        addedCount: added.length,
        removedCount: removed.length,
        modifiedCount: modified.length,
      },
      added: added.slice(0, MAX_COMPARISON_ROWS),
      removed: removed.slice(0, MAX_COMPARISON_ROWS),
      modified: modified.slice(0, MAX_COMPARISON_ROWS),
      truncated: added.length > MAX_COMPARISON_ROWS || removed.length > MAX_COMPARISON_ROWS || modified.length > MAX_COMPARISON_ROWS,
      evidence: [firstInfo, secondInfo].map(info => evidence(this.snapshot, {
        id: `pdm_revision_${productId}_${info.revision}`,
        sourceType: 'pdm-revision',
        sourcePath: `data/products/${productId}.json`,
        recordId: `${productId}@${info.revision}`,
      })),
    };
  }

  inspectPdmSchema() {
    const payload = this.payload;
    return {
      scope: 'Read-only normalized PDM snapshot, not raw DOM or arbitrary source code',
      entities: {
        products: { count: Object.keys(payload.bom || {}).length, fields: ['productCode', 'revision', 'name_zh', 'name_vi', 'colors', 'color_info'] },
        materials: { count: Object.keys(payload.materialDb?.materials || {}).length, fields: ['id', 'code', 'name', 'spec', 'material', 'color', 'attr'] },
        bomEntries: { count: (payload.materialDb?.bomEntries || []).length, fields: ['id', 'parentType', 'parentId', 'productCode', 'color', 'materialId', 'childMaterialId', 'qty'] },
        revisionRegistries: { count: Object.keys(payload.productRevisions || {}).length, fields: ['currentRevision', 'effectiveRevision', 'currentRevisionInfo', 'revisions', 'effectivityEvents'] },
        notifications: { count: (payload.notifications || []).length, fields: ['id', 'productCode', 'changes', 'createdAt'] },
      },
      relations: [
        'product -> colors -> BOM entries',
        'BOM entry -> material',
        'material BOM entry -> child material',
        'product -> current, effective, and historical revisions',
      ],
      evidence: evidence(this.snapshot, {
        id: 'pdm_schema_current',
        sourceType: 'pdm-schema',
        sourcePath: 'normalized PDM snapshot',
        recordId: 'schema',
      }),
    };
  }

  getPdmHelp({ topic = '' } = {}) {
    return {
      topic: String(topic),
      scope: 'Read-only PDM assistance',
      capabilities: [
        'Search products, materials, specifications, and BOM usage',
        'Compare products and product revisions',
        'Explain current, effective, draft, and released revision states',
        'List recent revision and effectivity changes',
        'Inspect the normalized PDM data schema',
      ],
      examples: [
        'Find specification 460x282x187mm and show which products use it',
        'Compare LGS723 and LGS733',
        'Compare V3 and V3.1 of LGS032',
        'List recent changes',
      ],
      safety: 'The assistant reads a bounded snapshot and cannot execute arbitrary JavaScript or inspect secrets.',
      evidence: evidence(this.snapshot, {
        id: 'pdm_help_current',
        sourceType: 'pdm-capability-manifest',
        sourcePath: 'AI assistant tool registry',
        recordId: 'help',
      }),
    };
  }
}
