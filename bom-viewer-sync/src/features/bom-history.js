import { stableId } from '../shared/primitives.js';

function normalizeChange(change) {
  return {
    kind: String(change?.kind || ''),
    code: String(change?.code || ''),
    field: String(change?.field || ''),
    before: String(change?.before ?? ''),
    after: String(change?.after ?? ''),
  };
}

export function normalizeBomHistory(history) {
  if (!history || typeof history !== 'object' || Array.isArray(history)) return {};
  return Object.fromEntries(Object.entries(history).map(([productCode, events]) => [
    productCode,
    (Array.isArray(events) ? events : [])
      .filter((event) => event && typeof event === 'object')
      .map((event, index) => ({
        id: String(event.id || stableId('history', `${productCode}|${event.createdAt || ''}|${index}`)),
        productCode,
        revision: String(event.revision || ''),
        action: String(event.action || 'save'),
        actor: String(event.actor || 'admin'),
        reason: String(event.reason || ''),
        createdAt: String(event.createdAt || ''),
        changes: (Array.isArray(event.changes) ? event.changes : []).map(normalizeChange),
      }))
      .filter((event) => event.createdAt)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  ]));
}

function productCodeForLabel(payload, label) {
  const text = String(label || '');
  return Object.entries(payload?.bom || {}).find(([productCode, product]) => (
    text === productCode || Object.values(product?.color_info || {}).some((color) => color?.sku === text)
  ))?.[0] || '';
}

function materialProductCodes(payload, materialCode) {
  const materialId = Object.values(payload?.materialDb?.materials || {})
    .find((material) => material?.code === materialCode)?.id;
  if (!materialId) return [];
  const productCodes = new Set();
  const visitedMaterialIds = new Set();
  const pendingMaterialIds = [materialId];
  const entries = payload?.materialDb?.bomEntries || [];
  while (pendingMaterialIds.length) {
    const childMaterialId = pendingMaterialIds.shift();
    if (!childMaterialId || visitedMaterialIds.has(childMaterialId)) continue;
    visitedMaterialIds.add(childMaterialId);
    entries
      .filter((entry) => (entry.childMaterialId || entry.materialId) === childMaterialId)
      .forEach((entry) => {
        if (entry.parentType === 'product') {
          const productCode = entry.productCode || entry.parentId;
          if (productCode) productCodes.add(productCode);
        } else if (entry.parentType === 'material' && entry.parentId) {
          pendingMaterialIds.push(entry.parentId);
        }
      });
  }
  return [...productCodes];
}

function materialProductCodesForLabel(payload, label) {
  const material = Object.values(payload?.materialDb?.materials || {})
    .find((item) => item?.code === label || item?.id === label);
  return material ? materialProductCodes(payload, material.code) : [];
}

export function appendBomHistory(payload, previousPayload, changes, options = {}) {
  const next = payload || {};
  const history = normalizeBomHistory(next.bomHistory);
  const grouped = new Map();
  for (const rawChange of changes || []) {
    const change = normalizeChange(rawChange);
    let productCodes = [];
    if (change.kind === 'revision' || change.kind === 'product' || change.kind === 'product_added') {
      productCodes = [change.code];
    } else if (change.kind.startsWith('bom_')) {
      productCodes = [
        productCodeForLabel(next, change.code),
        productCodeForLabel(previousPayload, change.code),
        ...materialProductCodesForLabel(next, change.code),
        ...materialProductCodesForLabel(previousPayload, change.code),
      ];
    } else if (change.kind.startsWith('material')) {
      productCodes = [
        ...materialProductCodes(next, change.code),
        ...materialProductCodes(previousPayload, change.code),
      ];
    }
    for (const productCode of new Set(productCodes.filter(Boolean))) {
      if (!grouped.has(productCode)) grouped.set(productCode, []);
      grouped.get(productCode).push(change);
    }
  }

  const createdAt = String(options.createdAt || new Date().toISOString());
  for (const [productCode, productChanges] of grouped) {
    const revisionRecord = next.productRevisions?.[productCode];
    const event = {
      id: stableId('history', `${productCode}|${createdAt}|${productChanges.length}`),
      productCode,
      revision: String(revisionRecord?.currentRevision || next.bom?.[productCode]?.revision || ''),
      action: String(options.action || 'save'),
      actor: String(options.actor || 'admin'),
      reason: String(options.reason || revisionRecord?.currentRevisionInfo?.changeReason || ''),
      createdAt,
      changes: productChanges,
    };
    history[productCode] = [event, ...(history[productCode] || [])];
  }
  next.bomHistory = history;
  return next;
}
