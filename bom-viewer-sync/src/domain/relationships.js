import { isRenderableProductEntry, resolveBomRows } from './bom.js';
import { clone, legacyRowFromRecord } from './materials.js';

function childMaterialId(entry) {
  return entry?.childMaterialId || entry?.materialId || '';
}

function relationMatchesScope(entry, productCode, colorName) {
  const entryProduct = String(entry?.productCode || '');
  const entryColor = String(entry?.color || '');
  return (!entryProduct || entryProduct === productCode) && (!entryColor || entryColor === colorName);
}

function materialChildEntries(payload, parentId, productCode, colorName) {
  return (payload?.materialDb?.bomEntries || [])
    .filter((entry) => entry.parentType === 'material' &&
      entry.parentId === parentId &&
      childMaterialId(entry) &&
      relationMatchesScope(entry, productCode, colorName))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

function syncLegacyBomFromMaterialDb(payload) {
  if (!payload?.materialDb?.materials || !payload?.materialDb?.bomEntries) return payload;

  function buildNode(entry, productCode, colorName) {
    const record = payload.materialDb.materials[entry.materialId];
    if (!record) return null;
    const row = legacyRowFromRecord(record, entry);
    const copy = clone(row);
    delete copy._materialId;
    delete copy._entryId;
    delete copy._materialRecord;

    const childrenEntries = materialChildEntries(payload, entry.materialId, productCode, colorName);
    if (childrenEntries.length > 0) {
      copy.materials = childrenEntries.map(child => buildNode(child, productCode, colorName)).filter(Boolean);
    }
    return copy;
  }

  Object.entries(payload.bom || {}).forEach(([productCode, product]) => {
    Object.entries(product.color_info || {}).forEach(([colorName, colorData]) => {
      const topEntries = payload.materialDb.bomEntries
        .filter((entry) => isRenderableProductEntry(payload, entry, productCode, colorName))
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));

      colorData.materials = topEntries.map(entry => buildNode(entry, productCode, colorName)).filter(Boolean);
    });
  });
  return payload;
}

function productEntryCoveredByParent(payload, productEntry, productEntries, productCode, colorName) {
  const materialId = productEntry?.materialId;
  if (!materialId) return false;
  return productEntries.some((parentEntry) => parentEntry.id !== productEntry.id &&
    materialChildEntries(payload, parentEntry.materialId, productCode, colorName)
      .some((childEntry) => childMaterialId(childEntry) === materialId));
}

function buildBomTreeRows(payload, productCode, colorName) {
  const source = payload || {};
  const flatRows = resolveBomRows(payload, productCode, colorName);
  if (!source.materialDb?.materials || !source.materialDb?.bomEntries) return flatRows.map((r) => ({ ...r, _level: 1 }));
  const productEntries = source.materialDb.bomEntries
    .filter((entry) => isRenderableProductEntry(source, entry, productCode, colorName))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  const coveredEntryIds = new Set(productEntries
    .filter((entry) => productEntryCoveredByParent(source, entry, productEntries, productCode, colorName))
    .map((entry) => entry.id));
  const treeRows = [];

  function appendChildren(parentRow, parentMaterialId, level, materialPath) {
    const childrenEntries = materialChildEntries(source, parentMaterialId, productCode, colorName);
    if (!childrenEntries.length) return;
    parentRow._hasChildren = true;
    childrenEntries.forEach((entry) => {
      const childId = childMaterialId(entry);
      if (!childId || materialPath.has(childId)) return;
      const childRecord = source.materialDb.materials[childId];
      if (!childRecord) return;
      const childRow = legacyRowFromRecord(childRecord, entry);
      childRow._level = level + 1;
      childRow._parentEntryId = parentRow._entryId;
      childRow._rootEntryId = parentRow._rootEntryId || parentRow._entryId;
      treeRows.push(childRow);
      const nextPath = new Set(materialPath);
      nextPath.add(childId);
      appendChildren(childRow, childId, childRow._level, nextPath);
    });
  }

  flatRows
    .filter((row) => !coveredEntryIds.has(row._entryId))
    .forEach((row) => {
      row._level = 1;
      treeRows.push(row);
      appendChildren(row, row._materialId, 1, new Set([row._materialId]));
    });
  return treeRows;
}

function scopeLabel(entry, sharedLabel) {
  const product = String(entry?.productCode || '').trim();
  const color = String(entry?.color || '').trim();
  if (product && color) return `${product} / ${color}`;
  return product || color || sharedLabel;
}

function groupMaterialChildRows(payload, parentId, sharedLabel) {
  const source = payload || {};
  const groups = new Map();
  (source.materialDb?.bomEntries || [])
    .filter((entry) => entry.parentType === 'material' && entry.parentId === parentId)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .forEach((entry) => {
      const childId = childMaterialId(entry);
      const child = source.materialDb?.materials?.[childId];
      if (!child) return;
      const key = `${childId}|${entry.qty || ''}`;
      if (!groups.has(key)) {
        groups.set(key, { entry, entries: [], child, qty: entry.qty || '', scopes: [], scopeSet: new Set() });
      }
      const group = groups.get(key);
      const scope = scopeLabel(entry, sharedLabel);
      group.entries.push(entry);
      if (!group.scopeSet.has(scope)) {
        group.scopeSet.add(scope);
        group.scopes.push(scope);
      }
    });
  return Array.from(groups.values()).map((group) => {
    const { scopeSet, ...row } = group;
    row.scopes.sort();
    return row;
  });
}

function hasChildMaterialRelation(entries, parentId, materialId) {
  return (entries || []).some((entry) => entry.parentType === 'material' &&
    entry.parentId === parentId &&
    childMaterialId(entry) === materialId);
}

export {
  buildBomTreeRows,
  childMaterialId,
  groupMaterialChildRows,
  hasChildMaterialRelation,
  scopeLabel,
  materialChildEntries,
  syncLegacyBomFromMaterialDb,
};
