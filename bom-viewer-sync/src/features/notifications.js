import { clone, localizedValue } from '../domain/materials.js';
import { stableId } from '../shared/primitives.js';

const NOTIFICATION_LIMIT = 30;
const NOTIFICATION_CHANGE_LIMIT = 8;
const LOCALIZED_MATERIAL_FIELDS = ['name', 'spec', 'material', 'color', 'attr'];
const MATERIAL_CHANGE_FIELDS = ['code', ...LOCALIZED_MATERIAL_FIELDS, 'unit', 'drawings', 'models3d'];
const PRODUCT_CHANGE_FIELDS = ['sku', 'name_zh', 'name_vi', 'size'];

export function normalizeNotificationChanges(changes) {
  if (!Array.isArray(changes)) return [];
  return changes
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      kind: String(item.kind || 'material'),
      code: String(item.code || ''),
      field: String(item.field || ''),
      before: String(item.before ?? ''),
      after: String(item.after ?? '')
    }))
    .filter((item) => item.code)
    .slice(0, NOTIFICATION_CHANGE_LIMIT);
}

function localizedPairSummary(pair) {
  const zh = localizedValue(pair, 'zh');
  const vi = localizedValue(pair, 'vi');
  if (zh && vi && zh !== vi) return `${zh} / ${vi}`;
  return zh || vi || '';
}

function materialChangeValue(record, field) {
  if (!record) return '';
  if (LOCALIZED_MATERIAL_FIELDS.includes(field)) return localizedPairSummary(record[field]);
  if (field === 'drawings' || field === 'models3d') {
    return (record[field] || []).map(asset => `${asset?.name || ''}|${asset?.url || asset?.path || ''}`).join(';');
  }
  return String(record[field] ?? '');
}

export function describePayloadChanges(previousPayload, nextPayload) {
  const previous = previousPayload || {};
  const next = nextPayload || {};
  const previousMaterials = previous.materialDb?.materials || {};
  const nextMaterials = next.materialDb?.materials || {};
  const previousByCode = Object.values(previousMaterials).reduce((lookup, material) => {
    if (material?.code) lookup[material.code] = material;
    return lookup;
  }, {});
  const nextByCode = Object.values(nextMaterials).reduce((lookup, material) => {
    if (material?.code) lookup[material.code] = material;
    return lookup;
  }, {});

  const changes = [];

  const previousBomKeys = Object.keys(previous.bom || {});
  const nextBomKeys = Object.keys(next.bom || {});
  for (const code of nextBomKeys) {
    if (!previousBomKeys.includes(code)) {
      changes.push({ kind: 'product_added', code: String(code), field: '', before: '', after: '' });
    }
  }
  for (const code of nextBomKeys.filter(productCode => previousBomKeys.includes(productCode))) {
    const previousProduct = previous.bom[code] || {};
    const nextProduct = next.bom[code] || {};
    if (String(previousProduct.revision || '') !== String(nextProduct.revision || '')) {
      changes.push({
        kind: 'product',
        code: String(code),
        field: 'revision',
        before: String(previousProduct.revision || ''),
        after: String(nextProduct.revision || ''),
      });
    }
    const colorNames = new Set([
      ...Object.keys(previousProduct.color_info || {}),
      ...Object.keys(nextProduct.color_info || {}),
    ]);
    for (const color of colorNames) {
      const previousColor = previousProduct.color_info?.[color] || {};
      const nextColor = nextProduct.color_info?.[color] || {};
      for (const field of PRODUCT_CHANGE_FIELDS) {
        const before = String(previousColor[field] || '');
        const after = String(nextColor[field] || '');
        if (before !== after) {
          changes.push({ kind: 'product', code: String(code), field: `${color}.${field}`, before, after });
        }
      }
    }
  }

  const nextRecords = Object.values(nextMaterials)
    .sort((left, right) => String(left.code || left.id || '').localeCompare(String(right.code || right.id || '')));

  for (const nextRecord of nextRecords) {
    const code = String(nextRecord.code || nextRecord.id || '');
    const previousRecord = previousMaterials[nextRecord.id] || previousByCode[nextRecord.code];

    if (!previousRecord) {
      changes.push({ kind: 'material_added', code, field: '', before: '', after: '' });
      continue;
    }

    for (const field of MATERIAL_CHANGE_FIELDS) {
      const before = materialChangeValue(previousRecord, field);
      const after = materialChangeValue(nextRecord, field);
      if (before !== after) {
        changes.push({ kind: 'material', code, field, before, after });
      }
    }
  }

  for (const previousRecord of Object.values(previousMaterials)) {
    const code = String(previousRecord.code || previousRecord.id || '');
    if (!nextMaterials[previousRecord.id] && !nextByCode[previousRecord.code]) {
      changes.push({ kind: 'material_deleted', code, field: '', before: '', after: '' });
    }
  }

  const revisionProducts = new Set([
    ...Object.keys(previous.productRevisions || {}),
    ...Object.keys(next.productRevisions || {}),
  ]);
  for (const code of revisionProducts) {
    const previousRecord = previous.productRevisions?.[code] || {};
    const nextRecord = next.productRevisions?.[code] || {};
    const revisionFields = {
      currentRevision: [previousRecord.currentRevision, nextRecord.currentRevision],
      effectiveRevision: [previousRecord.effectiveRevision, nextRecord.effectiveRevision],
      workflowState: [
        previousRecord.currentRevisionInfo?.workflowState,
        nextRecord.currentRevisionInfo?.workflowState,
      ],
    };
    for (const [field, [beforeValue, afterValue]] of Object.entries(revisionFields)) {
      const before = String(beforeValue || '');
      const after = String(afterValue || '');
      if (before !== after) {
        changes.push({ kind: 'revision', code: String(code), field, before, after });
      }
    }
  }

  const prevEntries = previous.materialDb?.bomEntries || [];
  const nextEntries = next.materialDb?.bomEntries || [];
  const prevEntriesById = prevEntries.reduce((acc, e) => { acc[e.id] = e; return acc; }, {});

  for (const nextEntry of nextEntries) {
    const prevEntry = prevEntriesById[nextEntry.id];
    const parentId = nextEntry.parentId || '';
    const childId = nextEntry.childMaterialId || nextEntry.materialId || '';
    const parentCode = nextEntry.parentType === 'product' ? parentId : (nextMaterials[parentId]?.code || parentId);
    const childCode = nextMaterials[childId]?.code || childId;
    let parentLabel = String(parentCode || '');
    if (nextEntry.parentType === 'product' && nextEntry.color && next.bom?.[parentCode]?.color_info?.[nextEntry.color]?.sku) {
      parentLabel = String(next.bom[parentCode].color_info[nextEntry.color].sku);
    }
    const childLabel = String(childCode || '');

    if (!prevEntry) {
      changes.push({ kind: 'bom_added', code: parentLabel, field: childLabel, before: '', after: '' });
    } else {
      const previousChildId = prevEntry.childMaterialId || prevEntry.materialId || '';
      if (String(previousChildId) !== String(childId)) {
        const previousChildCode = previousMaterials[previousChildId]?.code || previousChildId;
        changes.push({
          kind: 'bom_material_changed',
          code: parentLabel,
          field: '',
          before: String(previousChildCode || ''),
          after: childLabel
        });
      }
      if (String(prevEntry.comp_code ?? '') !== String(nextEntry.comp_code ?? '')) {
        changes.push({
          kind: 'bom_comp_code_changed',
          code: parentLabel,
          field: childLabel,
          before: String(prevEntry.comp_code ?? ''),
          after: String(nextEntry.comp_code ?? '')
        });
      }
      if (String(prevEntry.qty) !== String(nextEntry.qty)) {
        changes.push({ kind: 'bom_qty_changed', code: parentLabel, field: childLabel, before: String(prevEntry.qty ?? ''), after: String(nextEntry.qty ?? '') });
      }
    }
  }

  const nextEntriesById = nextEntries.reduce((acc, e) => { acc[e.id] = e; return acc; }, {});
  for (const prevEntry of prevEntries) {
    if (!nextEntriesById[prevEntry.id]) {
      const parentId = prevEntry.parentId || '';
      const childId = prevEntry.childMaterialId || prevEntry.materialId || '';
      const parentCode = prevEntry.parentType === 'product' ? parentId : (previousMaterials[parentId]?.code || parentId);
      const childCode = previousMaterials[childId]?.code || childId;
      let parentLabel = String(parentCode || '');
      if (prevEntry.parentType === 'product' && prevEntry.color && previous.bom?.[parentCode]?.color_info?.[prevEntry.color]?.sku) {
        parentLabel = String(previous.bom[parentCode].color_info[prevEntry.color].sku);
      }
      changes.push({ kind: 'bom_deleted', code: parentLabel, field: String(childCode || ''), before: '', after: '' });
    }
  }

  return changes;
}

export function normalizeNotifications(notifications) {
  if (!Array.isArray(notifications)) return [];
  return notifications
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const createdAt = String(item.createdAt || item.updatedAt || '');
      const type = String(item.type || 'data-update');
      return {
        id: String(item.id || stableId('notif', `${type}|${createdAt}|${index}`)),
        type,
        actor: String(item.actor || 'admin'),
        createdAt,
        version: item.version != null ? item.version : null,
        changes: normalizeNotificationChanges(item.changes)
      };
    })
    .filter((item) => item.createdAt)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, NOTIFICATION_LIMIT);
}

export function appendNotificationEvent(payload, event) {
  const source = clone(payload || {});
  const createdAt = String(event?.createdAt || new Date().toISOString());
  const type = String(event?.type || 'data-update');
  const notification = {
    id: String(event?.id || stableId('notif', `${type}|${createdAt}|${source.updatedAt || ''}`)),
    type,
    actor: String(event?.actor || 'admin'),
    createdAt,
    version: source.version != null ? source.version : null,
    changes: normalizeNotificationChanges(event?.changes)
  };
  source.notifications = normalizeNotifications([notification].concat(source.notifications || []));
  return source;
}
