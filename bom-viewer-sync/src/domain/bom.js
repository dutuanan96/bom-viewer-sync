import {
  isHardwarePackSummary,
  legacyRowFromRecord,
  localizedValue,
  materialWhereUsed,
  normalizeMaterialDatabase,
  normalizeText,
  queryMatches,
  uniqueValues,
} from './materials.js';

function normalizePayload(payload) {
  const source = payload || {};
  return { ...source, materialDb: normalizeMaterialDatabase(source) };
}

function isRenderableProductEntry(source, entry, productCode, colorName) {
  if (!entry || entry.parentType !== 'product') return false;
  if (entry.productCode !== productCode || entry.color !== colorName) return false;
  if (!entry.virtual) return true;
  const record = source?.materialDb?.materials?.[entry.materialId];
  return isHardwarePackSummary(record);
}

function resolveBomRows(payload, productCode, colorName) {
  const source = payload || {};
  if (!source.materialDb?.materials || !source.materialDb?.bomEntries) {
    return (((source.bom || {})[productCode] || {}).color_info || {})[colorName]?.materials || [];
  }
  return source.materialDb.bomEntries
    .filter((entry) => isRenderableProductEntry(source, entry, productCode, colorName))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .map((entry) => {
      const record = source.materialDb.materials[entry.materialId];
      return record ? legacyRowFromRecord(record, entry) : null;
    })
    .filter(Boolean);
}

function productSidebarItem(payload, productCode, lang) {
  const product = payload?.bom?.[productCode] || {};
  const colorData = product.color_info?.[product.colors?.[0]] || Object.values(product.color_info || {})[0] || {};
  const name = lang === 'vi'
    ? (colorData.name_vi || colorData.name_zh || colorData.name || productCode)
    : (colorData.name_zh || colorData.name || colorData.name_vi || productCode);
  const materialCount = Object.entries(product.color_info || {})
    .reduce((total, [colorName]) => total + resolveBomRows(payload, productCode, colorName).length, 0);
  return {
    type: 'product',
    id: productCode,
    code: productCode,
    label: name,
    subtitle: `${materialCount} materials`,
    searchText: [productCode, name, product.code, colorData.sku].join(' ')
  };
}

function relationProducts(entries) {
  return uniqueValues(entries.map((entry) => entry.productCode)).sort();
}

function materialSidebarItem(payload, record, type, lang) {
  const whereUsed = materialWhereUsed(payload, record.id);
  const productEntries = type === 'childMaterial' ? whereUsed.parentEntries : whereUsed.productEntries;
  const products = relationProducts(productEntries);
  const parentCodes = uniqueValues(whereUsed.parentEntries
    .map((entry) => payload.materialDb.materials[entry.parentId]?.code || ''))
    .sort();
  const label = localizedValue(record.name, lang) || record.code || record.id;
  return {
    type,
    materialId: record.id,
    code: record.code || '',
    label,
    subtitle: products.join(', ') || parentCodes.join(', ') || '-',
    products,
    parentCodes,
    parentCount: whereUsed.parentEntries.length,
    childCount: whereUsed.childEntries.length,
    drawingCount: (record.drawings || []).length,
    model3dCount: (record.models3d || []).length,
    searchText: [
      record.code,
      record.name?.zh,
      record.name?.vi,
      record.spec?.zh,
      record.spec?.vi,
      record.material?.zh,
      record.material?.vi,
      record.color?.zh,
      record.color?.vi,
      record.attr?.zh,
      record.attr?.vi,
      products.join(' '),
      parentCodes.join(' ')
    ].join(' ')
  };
}

function createSidebarIndex(payload, options) {
  const source = payload?.materialDb?.materials ? payload : normalizePayload(payload || {});
  const query = normalizeText(options?.query || '');
  const lang = options?.lang === 'vi' ? 'vi' : 'zh';
  const productItems = Object.keys(source.bom || {})
    .sort()
    .map((productCode) => productSidebarItem(source, productCode, lang))
    .filter((item) => queryMatches([item.searchText], query));
  const parentIds = new Set();
  const childIds = new Set();
  (source.materialDb?.bomEntries || []).forEach((entry) => {
    if (entry.parentType === 'product' && entry.materialId) parentIds.add(entry.materialId);
    if (entry.parentType === 'material' && (entry.childMaterialId || entry.materialId)) {
      childIds.add(entry.childMaterialId || entry.materialId);
    }
  });
  const materialItem = (type) => (materialId) => {
    const record = source.materialDb.materials[materialId];
    return record ? materialSidebarItem(source, record, type, lang) : null;
  };
  const filterItem = (item) => item && queryMatches([item.searchText], query);
  return {
    products: productItems,
    parentMaterials: Array.from(parentIds).map(materialItem('parentMaterial')).filter(filterItem)
      .sort((left, right) => String(left.code).localeCompare(String(right.code))),
    childMaterials: Array.from(childIds).map(materialItem('childMaterial')).filter(filterItem)
      .sort((left, right) => String(left.code).localeCompare(String(right.code)))
  };
}

function createPdmNavigation(payload, lang) {
  const source = payload?.materialDb?.materials ? payload : normalizePayload(payload || {});
  const entries = source.materialDb?.bomEntries || [];
  const materials = Object.values(source.materialDb?.materials || {});
  const structureCount = new Set(entries.filter((entry) => entry.parentType === 'material').map((entry) => entry.parentId)).size;
  const labels = lang === 'vi'
    ? {
      bom: 'Sản phẩm BOM',
      materials: 'Database vật liệu',
      structure: 'Cấu trúc cha con'
    }
    : {
      bom: '产品 BOM',
      materials: '物料数据库',
      structure: '父子项结构'
    };
  return [
    { id: 'bom', label: labels.bom, count: Object.keys(source.bom || {}).length },
    { id: 'materials', label: labels.materials, count: materials.length },
    { id: 'structure', label: labels.structure, count: structureCount }
  ];
}

export {
  resolveBomRows,
  createSidebarIndex,
  createPdmNavigation,
  isRenderableProductEntry,
};
