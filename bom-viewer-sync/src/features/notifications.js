import { clone, localizedValue } from '../domain/materials.js';
import { stableId } from '../shared/primitives.js';

const NOTIFICATION_LIMIT = 30;
const NOTIFICATION_CHANGE_LIMIT = 8;
const LOCALIZED_MATERIAL_FIELDS = ['name', 'spec', 'material', 'color', 'attr'];
const MATERIAL_CHANGE_FIELDS = ['code', ...LOCALIZED_MATERIAL_FIELDS, 'unit'];

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
      if (changes.length >= NOTIFICATION_CHANGE_LIMIT) return changes;
    }
  }

  const nextRecords = Object.values(nextMaterials)
    .sort((left, right) => String(left.code || left.id || '').localeCompare(String(right.code || right.id || '')));

  for (const nextRecord of nextRecords) {
    const code = String(nextRecord.code || nextRecord.id || '');
    const previousRecord = previousMaterials[nextRecord.id] || previousByCode[nextRecord.code];

    if (!previousRecord) {
      changes.push({ kind: 'material_added', code, field: '', before: '', after: '' });
      if (changes.length >= NOTIFICATION_CHANGE_LIMIT) return changes;
      continue;
    }

    for (const field of MATERIAL_CHANGE_FIELDS) {
      const before = materialChangeValue(previousRecord, field);
      const after = materialChangeValue(nextRecord, field);
      if (before !== after) {
        changes.push({ kind: 'material', code, field, before, after });
        if (changes.length >= NOTIFICATION_CHANGE_LIMIT) return changes;
      }
    }
  }

  for (const previousRecord of Object.values(previousMaterials)) {
    const code = String(previousRecord.code || previousRecord.id || '');
    if (!nextMaterials[previousRecord.id] && !nextByCode[previousRecord.code]) {
      changes.push({ kind: 'material_deleted', code, field: '', before: '', after: '' });
      if (changes.length >= NOTIFICATION_CHANGE_LIMIT) return changes;
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
    const parentLabel = String(parentCode || '');
    const childLabel = String(childCode || '');

    if (!prevEntry) {
      changes.push({ kind: 'bom_added', code: parentLabel, field: childLabel, before: '', after: '' });
      if (changes.length >= NOTIFICATION_CHANGE_LIMIT) return changes;
    } else {
      if (String(prevEntry.qty) !== String(nextEntry.qty)) {
        changes.push({ kind: 'bom_qty_changed', code: parentLabel, field: childLabel, before: String(prevEntry.qty ?? ''), after: String(nextEntry.qty ?? '') });
        if (changes.length >= NOTIFICATION_CHANGE_LIMIT) return changes;
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
      changes.push({ kind: 'bom_deleted', code: String(parentCode || ''), field: String(childCode || ''), before: '', after: '' });
      if (changes.length >= NOTIFICATION_CHANGE_LIMIT) return changes;
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
