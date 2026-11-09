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
    const row = product.color_info?.[change.color]?.materials
      ?.find((item) => item.mat_code === change.code);
    const entry = change.type === 'add'
      ? payload.materialDb?.bomEntries?.find((item) => item.id === change.entry?.id)
      : payload.materialDb?.bomEntries?.find((item) => item.parentType === 'product'
        && item.productCode === productCode && item.color === change.color
        && payload.materialDb.materials[item.materialId]?.code === change.code);
    const quantity = String(change.qty || change.row?.qty || '');
    return row && entry && String(row.qty) === quantity && String(entry.qty) === quantity;
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
