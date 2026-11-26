import { clone } from './materials.js';

export function applyEffectiveBomVersion(payload, productCode, selectedRevision) {
  const version = payload?.bomVersions?.[productCode];
  const effectiveRevision = payload?.productRevisions?.[productCode]?.effectiveRevision;
  if (!version || selectedRevision !== effectiveRevision || version.designRevision !== effectiveRevision) {
    return payload;
  }

  const product = payload?.bom?.[productCode];
  if (!product || (product.revision && product.revision !== effectiveRevision)) return payload;
  const changes = version.changes || [];
  if (changes.every((change) => {
    const code = change.type === 'replace' ? change.row?.mat_code : change.code;
    const row = product.color_info?.[change.color]?.materials
      ?.find((item) => item.mat_code === code);
    const entry = change.entry
      ? payload.materialDb?.bomEntries?.find((item) => item.id === change.entry?.id)
      : payload.materialDb?.bomEntries?.find((item) => item.parentType === 'product'
        && item.productCode === productCode && item.color === change.color
        && payload.materialDb.materials[item.materialId]?.code === change.code);
    const quantity = String(change.qty || change.row?.qty || '');
    return row && entry && String(row.qty) === quantity && String(entry.qty) === quantity
      && (change.type !== 'replace' || (entry.materialId === change.entry?.materialId
        && !product.color_info[change.color].materials.some((item) => item.mat_code === change.code)));
  })) return payload;
  const nextProduct = clone(product);
  const nextMaterialDb = clone(payload.materialDb);
  for (const change of changes) {
    const rows = nextProduct.color_info?.[change.color]?.materials;
    if (!rows) throw new Error('BOM_VERSION_COLOR_NOT_FOUND');
    const index = rows.findIndex((row) => row.mat_code === change.code);
    if (change.type === 'add') {
      if (index >= 0 || !change.row || !change.entry) throw new Error('BOM_VERSION_DUPLICATE_ITEM');
      rows.push(clone(change.row));
      if (!nextMaterialDb.bomEntries.some((entry) => entry.id === change.entry.id)) {
        nextMaterialDb.bomEntries.push(clone(change.entry));
      }
    } else if (change.type === 'replace') {
      const entryIndex = nextMaterialDb.bomEntries.findIndex((entry) =>
        entry.id === change.entry?.id && entry.parentType === 'product'
          && entry.productCode === productCode && entry.color === change.color);
      const entry = nextMaterialDb.bomEntries[entryIndex];
      const replacement = nextMaterialDb.materials[change.entry?.materialId];
      const targetIndex = rows.findIndex((row) => row.mat_code === replacement?.code);
      if (!entry || !change.row || !replacement || change.row.mat_code !== replacement.code
        || replacement.code === change.code || String(change.row.qty) !== String(entry.qty)
        || String(change.entry.qty) !== String(entry.qty)) {
        throw new Error('BOM_VERSION_INVALID_REPLACEMENT');
      }
      if (index < 0 && targetIndex >= 0 && entry.materialId === replacement.id) continue;
      if (index < 0 || targetIndex >= 0 || nextMaterialDb.materials[entry.materialId]?.code !== change.code) {
        throw new Error('BOM_VERSION_REPLACEMENT_MISMATCH');
      }
      rows[index] = clone(change.row);
      nextMaterialDb.bomEntries[entryIndex] = { ...entry, materialId: replacement.id, remark: change.row.remark };
    } else if (change.type === 'quantity') {
      if (index < 0 || !change.qty) throw new Error('BOM_VERSION_ITEM_NOT_FOUND');
      rows[index].qty = String(change.qty);
      const entry = nextMaterialDb.bomEntries.find((item) => item.parentType === 'product'
        && item.productCode === productCode && item.color === change.color
        && nextMaterialDb.materials[item.materialId]?.code === change.code);
      if (!entry) throw new Error('BOM_VERSION_ENTRY_NOT_FOUND');
      entry.qty = String(change.qty);
    } else {
      throw new Error('BOM_VERSION_INVALID_CHANGE');
    }
  }
  return { ...payload, bom: { ...payload.bom, [productCode]: nextProduct }, materialDb: nextMaterialDb };
}
