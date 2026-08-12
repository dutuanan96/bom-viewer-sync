import { clone } from './materials.js';

const DEFAULT_PRODUCT_REVISION = 'A.1';
const DEFAULT_REVISION_WORKFLOW_STATE = 'released';
const NEW_REVISION_WORKFLOW_STATE = 'draft';

function revisionCode(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function revisionWorkflowState(value, fallback = DEFAULT_REVISION_WORKFLOW_STATE) {
  return String(value || '').trim().toLowerCase() || fallback;
}

function revisionMetadata(value, fallbackWorkflowState = DEFAULT_REVISION_WORKFLOW_STATE) {
  const source = value || {};
  return {
    sourceRevision: revisionCode(source.sourceRevision),
    createdAt: String(source.createdAt || ''),
    changeReason: String(source.changeReason || ''),
    workflowState: revisionWorkflowState(source.workflowState, fallbackWorkflowState),
  };
}

function normalizeEffectivityEvents(value) {
  if (!Array.isArray(value)) return [];
  return value.map((event) => ({
    id: String(event?.id || ''),
    action: String(event?.action || ''),
    revision: revisionCode(event?.revision),
    previousRevision: revisionCode(event?.previousRevision),
    occurredAt: String(event?.occurredAt || ''),
    reason: String(event?.reason || ''),
  }));
}

function currentRevisionMetadata(record, revisions) {
  if (record?.currentRevisionInfo) {
    return revisionMetadata(
      record.currentRevisionInfo,
      revisions.length ? NEW_REVISION_WORKFLOW_STATE : DEFAULT_REVISION_WORKFLOW_STATE,
    );
  }
  const previousRevision = revisions[0];
  if (!previousRevision) return revisionMetadata(null);
  return {
    sourceRevision: previousRevision.revision,
    createdAt: previousRevision.createdAt,
    changeReason: previousRevision.changeReason,
    workflowState: NEW_REVISION_WORKFLOW_STATE,
  };
}

function legacyProductRevision(payload, productCode) {
  const productRevision = revisionCode(payload?.bom?.[productCode]?.revision);
  if (productRevision) return productRevision;
  const manualName = String(payload?.manuals?.[productCode]?.[0]?.name || '');
  const match = manualName.match(/-(v\d+)/i);
  return match ? match[1].toUpperCase() : DEFAULT_PRODUCT_REVISION;
}

function normalizeRevisionSnapshot(snapshot) {
  const source = snapshot || {};
  const materialDb = source.materialDb || {};
  return {
    product: clone(source.product),
    materialDb: {
      version: materialDb.version != null ? materialDb.version : 1,
      materials: clone(materialDb.materials),
      bomEntries: Array.isArray(materialDb.bomEntries) ? clone(materialDb.bomEntries) : [],
    },
  };
}

function hasProductSnapshot(revision) {
  return Object.keys(revision?.snapshot?.product || {}).length > 0;
}

function inferredEffectiveRevision(record, currentRevision, currentRevisionInfo, revisions) {
  const hasExplicitEffectiveRevision = Object.prototype.hasOwnProperty.call(
    record || {},
    'effectiveRevision',
  );
  const explicitRevision = revisionCode(record?.effectiveRevision);
  if (hasExplicitEffectiveRevision && !explicitRevision) return '';
  if (explicitRevision === currentRevision) return currentRevision;
  if (revisions.some((item) => item.revision === explicitRevision && hasProductSnapshot(item))) {
    return explicitRevision;
  }
  if (currentRevisionInfo.workflowState === DEFAULT_REVISION_WORKFLOW_STATE) return currentRevision;
  const releasedRevision = revisions.find((item) =>
    item.workflowState === DEFAULT_REVISION_WORKFLOW_STATE && hasProductSnapshot(item));
  if (releasedRevision) return releasedRevision.revision;
  if (revisions.some((item) =>
    item.revision === currentRevisionInfo.sourceRevision && hasProductSnapshot(item))) {
    return currentRevisionInfo.sourceRevision;
  }
  return currentRevision;
}

function normalizeProductRevisionRegistry(payload) {
  const registry = payload?.productRevisions || {};
  return Object.fromEntries(Object.entries(registry).map(([productCode, value]) => {
    const record = value || {};
    const revisions = Array.isArray(record.revisions)
      ? record.revisions
        .filter((item) => revisionCode(item?.revision))
        .map((item) => ({
          ...clone(item),
          revision: revisionCode(item.revision),
          ...revisionMetadata(item),
          snapshot: normalizeRevisionSnapshot(item.snapshot),
        }))
      : [];
    const currentRevision = revisionCode(record.currentRevision, legacyProductRevision(payload, productCode));
    const currentRevisionInfo = currentRevisionMetadata(record, revisions);
    return [productCode, {
      currentRevision,
      effectiveRevision: inferredEffectiveRevision(record, currentRevision, currentRevisionInfo, revisions),
      currentRevisionInfo,
      revisions,
      effectivityEvents: normalizeEffectivityEvents(record.effectivityEvents),
    }];
  }));
}

function productRevisionRecord(payload, productCode) {
  const record = payload?.productRevisions?.[productCode] || {};
  const revisions = Array.isArray(record.revisions)
    ? record.revisions
      .filter((item) => revisionCode(item?.revision))
      .map((item) => ({
        ...item,
        revision: revisionCode(item.revision),
        ...revisionMetadata(item),
      }))
    : [];
  const currentRevision = revisionCode(record.currentRevision, legacyProductRevision(payload, productCode));
  const currentRevisionInfo = currentRevisionMetadata(record, revisions);
  return {
    currentRevision,
    effectiveRevision: inferredEffectiveRevision(record, currentRevision, currentRevisionInfo, revisions),
    currentRevisionInfo,
    revisions,
    effectivityEvents: normalizeEffectivityEvents(record.effectivityEvents),
  };
}

function currentProductRevision(payload, productCode) {
  return productRevisionRecord(payload, productCode).currentRevision;
}

function effectiveProductRevision(payload, productCode) {
  return productRevisionRecord(payload, productCode).effectiveRevision;
}

function productRevisionOptions(payload, productCode) {
  const record = productRevisionRecord(payload, productCode);
  return [
    {
      revision: record.currentRevision,
      current: true,
      effective: record.currentRevision === record.effectiveRevision,
      ...record.currentRevisionInfo,
    },
    ...record.revisions.map((item) => ({
      revision: item.revision,
      current: false,
      effective: item.revision === record.effectiveRevision,
      ...revisionMetadata(item),
    })),
  ];
}

function isHistoricalProductRevision(payload, productCode, selectedRevision) {
  const selected = revisionCode(selectedRevision);
  if (!selected || selected === currentProductRevision(payload, productCode)) return false;
  return productRevisionRecord(payload, productCode).revisions.some((item) => item.revision === selected);
}

function createProductRevisionSnapshot(payload, productCode) {
  const product = payload?.bom?.[productCode];
  if (!product) throw new Error('PRODUCT_NOT_FOUND');

  const materialDb = payload?.materialDb || {};
  const entries = Array.isArray(materialDb.bomEntries) ? materialDb.bomEntries : [];
  const snapshotEntries = entries.filter((entry) =>
    entry?.parentType === 'product' && entry.productCode === productCode);
  const materialIds = new Set();
  const pendingMaterialIds = [];

  const includeMaterial = (materialId) => {
    const id = revisionCode(materialId);
    if (!id || materialIds.has(id)) return;
    materialIds.add(id);
    pendingMaterialIds.push(id);
  };

  snapshotEntries.forEach((entry) => includeMaterial(entry.materialId));
  while (pendingMaterialIds.length) {
    const parentId = pendingMaterialIds.shift();
    entries
      .filter((entry) => entry?.parentType === 'material' &&
        entry.parentId === parentId &&
        (!entry.productCode || entry.productCode === productCode))
      .forEach((entry) => {
        snapshotEntries.push(entry);
        includeMaterial(entry.childMaterialId || entry.materialId);
      });
  }

  const materials = {};
  materialIds.forEach((materialId) => {
    if (materialDb.materials?.[materialId]) materials[materialId] = clone(materialDb.materials[materialId]);
  });

  return {
    product: clone(product),
    materialDb: {
      version: materialDb.version != null ? materialDb.version : 1,
      materials,
      bomEntries: clone(snapshotEntries),
    },
  };
}

function createProductRevision(payload, productCode, nextRevision, options) {
  if (!payload?.bom?.[productCode]) throw new Error('PRODUCT_NOT_FOUND');
  const nextCode = revisionCode(nextRevision);
  if (!nextCode) throw new Error('REVISION_REQUIRED');

  const record = productRevisionRecord(payload, productCode);
  const hasRevisionRecord = Boolean(payload.productRevisions?.[productCode]);
  const currentRevision = hasRevisionRecord
    ? record.currentRevision
    : revisionCode(options?.currentRevision, record.currentRevision);
  if (nextCode === currentRevision || record.revisions.some((item) => item.revision === nextCode)) {
    throw new Error('REVISION_EXISTS');
  }

  const snapshot = createProductRevisionSnapshot(payload, productCode);
  snapshot.product.revision = currentRevision;
  const historicalRevision = {
    revision: currentRevision,
    ...record.currentRevisionInfo,
    snapshot,
  };
  payload.productRevisions = normalizeProductRevisionRegistry(payload);
  payload.productRevisions[productCode] = {
    currentRevision: nextCode,
    effectiveRevision: hasRevisionRecord ? record.effectiveRevision : currentRevision,
    currentRevisionInfo: {
      sourceRevision: currentRevision,
      createdAt: String(options?.createdAt || new Date().toISOString()),
      changeReason: String(options?.changeReason || '').trim(),
      workflowState: NEW_REVISION_WORKFLOW_STATE,
    },
    revisions: [
      historicalRevision,
      ...record.revisions.filter((item) => item.revision !== currentRevision),
    ],
    effectivityEvents: record.effectivityEvents,
  };
  payload.bom[productCode].revision = nextCode;
  return payload.productRevisions[productCode];
}

function releaseProductRevision(payload, productCode, selectedRevision, options) {
  if (!payload?.bom?.[productCode]) throw new Error('PRODUCT_NOT_FOUND');
  const record = productRevisionRecord(payload, productCode);
  const selected = revisionCode(selectedRevision, record.currentRevision);
  const reason = String(options?.reason || '').trim();
  if (!reason) throw new Error('RELEASE_REASON_REQUIRED');
  if (selected !== record.currentRevision) throw new Error('REVISION_NOT_CURRENT');
  if (record.currentRevisionInfo.workflowState !== NEW_REVISION_WORKFLOW_STATE) {
    throw new Error('REVISION_NOT_DRAFT');
  }

  const occurredAt = String(options?.occurredAt || new Date().toISOString());
  const eventId = String(options?.eventId || `effectivity_${Date.now().toString(36)}`);
  payload.productRevisions = normalizeProductRevisionRegistry(payload);
  const nextRecord = payload.productRevisions[productCode];
  const previousRevision = nextRecord.effectiveRevision;
  nextRecord.currentRevisionInfo = {
    ...nextRecord.currentRevisionInfo,
    workflowState: DEFAULT_REVISION_WORKFLOW_STATE,
  };
  nextRecord.effectiveRevision = nextRecord.currentRevision;
  nextRecord.effectivityEvents = [
    ...nextRecord.effectivityEvents,
    {
      id: eventId,
      action: 'release',
      revision: nextRecord.currentRevision,
      previousRevision,
      occurredAt,
      reason,
    },
  ];
  return nextRecord;
}

function withdrawProductRevision(payload, productCode, selectedRevision, options) {
  if (!payload?.bom?.[productCode]) throw new Error('PRODUCT_NOT_FOUND');
  const record = productRevisionRecord(payload, productCode);
  const selected = revisionCode(selectedRevision, record.currentRevision);
  const reason = String(options?.reason || '').trim();
  if (!reason) throw new Error('WITHDRAW_REASON_REQUIRED');
  if (selected !== record.currentRevision) throw new Error('REVISION_NOT_CURRENT');
  if (record.currentRevisionInfo.workflowState !== DEFAULT_REVISION_WORKFLOW_STATE) {
    throw new Error('REVISION_NOT_RELEASED');
  }

  const occurredAt = String(options?.occurredAt || new Date().toISOString());
  const eventId = String(options?.eventId || `effectivity_${Date.now().toString(36)}`);
  payload.productRevisions = normalizeProductRevisionRegistry(payload);
  if (!payload.productRevisions[productCode]) {
    payload.productRevisions[productCode] = productRevisionRecord(payload, productCode);
  }
  const nextRecord = payload.productRevisions[productCode];
  const previousEffectiveRevision = nextRecord.effectiveRevision;
  const lastReleaseEvent = [...nextRecord.effectivityEvents]
    .reverse()
    .find((event) => event.action === 'release' && event.revision === nextRecord.currentRevision);
  const restoredEffectiveRevision = lastReleaseEvent?.previousRevision ||
    nextRecord.currentRevisionInfo.sourceRevision ||
    nextRecord.revisions.find((item) => item.workflowState === DEFAULT_REVISION_WORKFLOW_STATE)?.revision ||
    '';

  nextRecord.currentRevisionInfo = {
    ...nextRecord.currentRevisionInfo,
    workflowState: NEW_REVISION_WORKFLOW_STATE,
  };
  nextRecord.effectiveRevision = restoredEffectiveRevision;
  nextRecord.effectivityEvents = [
    ...nextRecord.effectivityEvents,
    {
      id: eventId,
      action: 'withdraw',
      revision: nextRecord.currentRevision,
      previousRevision: previousEffectiveRevision,
      occurredAt,
      reason,
    },
  ];
  return nextRecord;
}

function payloadForProductRevision(payload, productCode, selectedRevision) {
  const record = productRevisionRecord(payload, productCode);
  const selected = revisionCode(selectedRevision, record.currentRevision);
  if (selected === record.currentRevision) return payload;
  const historical = record.revisions.find((item) => item.revision === selected);
  if (!historical || !hasProductSnapshot(historical)) return payload;
  const snapshot = normalizeRevisionSnapshot(historical.snapshot);
  
  if (payload.materialDb && Array.isArray(payload.materialDb.bomEntries)) {
    const globalMaterialEntries = payload.materialDb.bomEntries.filter((e) => e.parentType === 'material');
    const snapshotProductEntries = (snapshot.materialDb.bomEntries || []).filter((e) => e.parentType === 'product');
    
    snapshot.materialDb.bomEntries = [...snapshotProductEntries, ...globalMaterialEntries];
    snapshot.materialDb.materials = {
      ...payload.materialDb.materials,
      ...(snapshot.materialDb.materials || {})
    };
  }

  return {
    ...payload,
    bom: { [productCode]: snapshot.product },
    materialDb: snapshot.materialDb,
  };
}

export {
  DEFAULT_PRODUCT_REVISION,
  DEFAULT_REVISION_WORKFLOW_STATE,
  NEW_REVISION_WORKFLOW_STATE,
  createProductRevision,
  createProductRevisionSnapshot,
  currentProductRevision,
  effectiveProductRevision,
  isHistoricalProductRevision,
  normalizeProductRevisionRegistry,
  payloadForProductRevision,
  productRevisionOptions,
  releaseProductRevision,
  withdrawProductRevision,
};
