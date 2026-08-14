import { assetKey, colorNeutralCode, findBomAssetEntry, findBomAssets } from '../infrastructure/assets.js';
import { normalizeText, stableId } from '../shared/primitives.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function escapeRegExp(value) {
  const patternChars = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
  return String(value || '').replace(/./g, (char) => patternChars.has(char) ? '\\' + char : char);
}

function localizedPair(zh, vi) {
  return {
    zh: String(zh || vi || ''),
    vi: String(vi || zh || '')
  };
}

function canonicalSharedName(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('LGS') || !raw.includes('_')) return raw;
  const dash = raw.lastIndexOf('-');
  if (dash < 0) return raw;
  const prefix = raw.slice(0, dash);
  const suffix = raw.slice(dash + 1);
  const codes = Array.from(prefix.matchAll(/(?:LGS)?(\d{3})/g)).map((match) => match[1]);
  if (codes.length < 2) return raw;
  const uniqueCodes = Array.from(new Set(codes)).sort((left, right) => Number(left) - Number(right));
  const style = /-S\b/i.test(prefix) ? '-S' : '';
  return `LGS${uniqueCodes.join('_')}${style}-${suffix}`;
}

function canonicalLegacyMaterial(material, productCode) {
  const result = clone(material || {});
  if (productCode === 'LGS111' && /^LGS101/i.test(String(result.mat_code || ''))) {
    result.name_zh = String(result.name_zh || '').replace(/^LGS111-S-/, 'LGS101-S-');
    result.name_vi = String(result.name_vi || '').replace(/^LGS111-S-/, 'LGS101-S-');
  }
  result.name_zh = canonicalSharedName(result.name_zh);
  result.name_vi = canonicalSharedName(result.name_vi);
  return result;
}

function materialIdentity(material, productCode) {
  const canonical = canonicalLegacyMaterial(material, productCode);
  const name = canonical.name_zh || canonical.name_vi || '';
  const sharedName = canonicalSharedName(name);
  const codeKey = sharedName !== name
    ? `shared:${assetKey(sharedName)}`
    : `code:${colorNeutralCode(canonical.mat_code || '')}|name:${assetKey(name)}`;
  return [
    codeKey,
    assetKey(canonical.spec || canonical.spec_vi || ''),
    assetKey(canonical.material_zh || canonical.material_vi || ''),
    assetKey(canonical.color_zh || canonical.color_vi || ''),
    assetKey(canonical.attr_zh || canonical.attr_vi || '')
  ].join('|');
}

function materialIdFor(material, productCode) {
  return stableId('mat', materialIdentity(material, productCode));
}

function seedAsset(target, ...assetGroups) {
  if ((target || []).length) return;
  for (const assets of assetGroups) {
    const asset = (assets || []).find((item) => item?.url || item?.previewUrl || item?.path || item?.name);
    if (!asset) continue;
    target.push(clone(asset));
    return;
  }
}

function materialRecordFromLegacy(material, productCode) {
  const canonical = canonicalLegacyMaterial(material, productCode);
  const id = materialIdFor(canonical, productCode);
  return {
    id,
    code: String(canonical.mat_code || ''),
    name: localizedPair(canonical.name_zh, canonical.name_vi),
    spec: localizedPair(canonical.spec, canonical.spec_vi),
    material: localizedPair(canonical.material_zh, canonical.material_vi),
    color: localizedPair(canonical.color_zh, canonical.color_vi),
    attr: localizedPair(canonical.attr_zh, canonical.attr_vi),
    drawings: [],
    models3d: []
  };
}

function isHardwarePackSummary(material) {
  const code = material?.mat_code || material?.code || '';
  const name = material?.name_zh || material?.name?.zh || '';
  return /^LGS\d+WJB(BH|WH)$/i.test(String(code || '')) ||
    /^LGS\d+五金包$/i.test(String(name || ''));
}

function legacyRowFromRecord(record, entry) {
  return {
    stt: entry.stt || '',
    mat_code: record.code || '',
    comp_code: entry.comp_code || '',
    name_zh: record.name?.zh || '',
    name_vi: record.name?.vi || record.name?.zh || '',
    spec: record.spec?.zh || '',
    spec_vi: record.spec?.vi || record.spec?.zh || '',
    material_zh: record.material?.zh || '',
    material_vi: record.material?.vi || record.material?.zh || '',
    color_zh: record.color?.zh || '',
    color_vi: record.color?.vi || record.color?.zh || '',
    attr_zh: record.attr?.zh || '',
    attr_vi: record.attr?.vi || record.attr?.zh || '',
    color_ver: entry.color_ver || '',
    color_ver_vi: entry.color_ver_vi || entry.color_ver || '',
    qty: entry.qty || '',
    remark: entry.remark || '',
    _materialId: record.id,
    _entryId: entry.id,
    _materialRecord: record
  };
}

function scanBomVersionIntoDb(db, source, productCode, product, revisionLabel, isDraft, productEntriesByColor) {
  // Resolve the actual color_info to scan: snapshot.product has color_info at root level
  const productData = product.color_info ? product : (product.product || product);
  Object.entries(productData.color_info || {}).forEach(([colorName, colorData]) => {
    const productEntries = [];
    (colorData.materials || []).forEach((material, index) => {
      const canonical = canonicalLegacyMaterial(material, productCode);
      const materialId = materialIdFor(canonical, productCode);
      if (!db.materials[materialId]) db.materials[materialId] = materialRecordFromLegacy(canonical, productCode);
      const record = db.materials[materialId];
      seedAsset(
        record.drawings,
        findBomAssets((source.drawings || {})[productCode], material),
        findBomAssets((source.drawings || {})[productCode], canonical),
      );
      seedAsset(
        record.models3d,
        findBomAssets((source.models3d || {})[productCode], material),
        findBomAssets((source.models3d || {})[productCode], canonical),
      );
      const entry = {
        id: stableId('bom', `${productCode}|${colorName}|${index}|${materialId}|${material.comp_code || ''}|${revisionLabel || ''}`),
        parentType: 'product',
        parentId: productCode,
        productCode,
        color: colorName,
        materialId,
        stt: String(material.stt || ''),
        comp_code: String(material.comp_code || ''),
        qty: String(material.qty || ''),
        remark: String(material.remark || ''),
        color_ver: String(material.color_ver || colorData.color_ver || colorName),
        color_ver_vi: String(material.color_ver_vi || colorData.color_ver_vi || colorName),
        order: index,
        revision: revisionLabel,
        isDraft,
      };
      db.bomEntries.push(entry);
      productEntries.push({ entry, material: canonical });
      appendNestedMaterialEntries(
        db,
        source,
        productCode,
        colorName,
        canonical,
        material.materials || [],
        revisionLabel,
        isDraft,
      );
    });
    productEntriesByColor.set(`${productCode}|${colorName}|${revisionLabel || ''}`, productEntries);
  });
}

function appendNestedMaterialEntries(db, source, productCode, colorName, parentMaterial, children, revisionLabel, isDraft) {
  const parentId = materialIdFor(parentMaterial, productCode);
  (children || []).forEach((material, index) => {
    const canonical = canonicalLegacyMaterial(material, productCode);
    const materialId = materialIdFor(canonical, productCode);
    if (!db.materials[materialId]) db.materials[materialId] = materialRecordFromLegacy(canonical, productCode);
    const record = db.materials[materialId];
    seedAsset(
      record.drawings,
      findBomAssets((source.drawings || {})[productCode], material),
      findBomAssets((source.drawings || {})[productCode], canonical),
    );
    seedAsset(
      record.models3d,
      findBomAssets((source.models3d || {})[productCode], material),
      findBomAssets((source.models3d || {})[productCode], canonical),
    );
    db.bomEntries.push({
      id: stableId('bomc', `${productCode}|${colorName}|${parentId}|${materialId}|${index}|${revisionLabel || ''}`),
      parentType: 'material',
      parentId,
      productCode,
      color: colorName,
      materialId,
      childMaterialId: materialId,
      stt: String(material.stt || ''),
      comp_code: String(material.comp_code || ''),
      qty: String(material.qty || ''),
      color_ver: String(material.color_ver || colorName),
      color_ver_vi: String(material.color_ver_vi || colorName),
      order: index,
      revision: revisionLabel,
      isDraft,
    });
    appendNestedMaterialEntries(
      db,
      source,
      productCode,
      colorName,
      canonical,
      material.materials || [],
      revisionLabel,
      isDraft,
    );
  });
}

function appendHardwarePackEntries(db, entries, key) {
  let hardwarePack = entries.find((item) => isHardwarePackSummary(db.materials[item.entry.materialId]));
  const hardwareChildren = entries.filter((item) => db.materials[item.entry.materialId]?.attr?.zh === '五金包');
  if (!hardwarePack && hardwareChildren.length) {
    const [productCode, colorName, revision] = key.split('|');
    const isWhite = colorName.includes('白') || colorName.toLowerCase().includes('white');
    const virtualMaterial = {
      mat_code: `${productCode}WJB${isWhite ? 'WH' : 'BH'}`,
      name_zh: `${productCode}五金包`,
      name_vi: `${productCode} tui ngu kim`,
      spec: '',
      spec_vi: '',
      material_zh: '无',
      material_vi: 'khong',
      color_zh: '',
      color_vi: '',
      attr_zh: '零件',
      attr_vi: 'linh kien'
    };
    const materialId = materialIdFor(virtualMaterial, productCode);
    if (!db.materials[materialId]) db.materials[materialId] = materialRecordFromLegacy(virtualMaterial, productCode);
    const firstOrder = hardwareChildren[0]?.entry?.order ?? 0;
    const entry = {
      id: stableId('bomv', `${key}|${materialId}`),
      parentType: 'product',
      parentId: productCode,
      productCode,
      color: colorName,
      materialId,
      stt: '',
      comp_code: '无',
      qty: '1',
      color_ver: colorName,
      color_ver_vi: colorName,
      order: firstOrder - 0.1,
      virtual: true,
      revision: revision || undefined,
      isDraft: entries[0]?.entry?.isDraft,
    };
    db.bomEntries.push(entry);
    hardwarePack = { entry, material: virtualMaterial };
  }
  if (!hardwarePack) return;
  hardwareChildren.forEach((item, index) => {
    const exists = db.bomEntries.some((entry) => (
      entry.parentType === 'material' &&
      entry.parentId === hardwarePack.entry.materialId &&
      entry.productCode === hardwarePack.entry.productCode &&
      entry.color === hardwarePack.entry.color &&
      relationChildMaterialId(entry) === item.entry.materialId
    ));
    if (exists) return;
    const childEntry = {
      id: stableId('bomc', `${key}|${hardwarePack.entry.materialId}|${item.entry.materialId}|${index}`),
      parentType: 'material',
      parentId: hardwarePack.entry.materialId,
      productCode: hardwarePack.entry.productCode,
      color: hardwarePack.entry.color,
      materialId: item.entry.materialId,
      childMaterialId: item.entry.materialId,
      stt: item.entry.stt,
      comp_code: item.entry.comp_code,
      qty: item.entry.qty,
      color_ver: item.entry.color_ver,
      color_ver_vi: item.entry.color_ver_vi,
      order: index,
      revision: hardwarePack.entry.revision,
      isDraft: hardwarePack.entry.isDraft,
    };
    db.bomEntries.push(childEntry);
  });
  const flatHardwareEntryIds = new Set(hardwareChildren.map((item) => item.entry.id));
  db.bomEntries = db.bomEntries.filter((entry) => !flatHardwareEntryIds.has(entry.id));
}

function createMaterialDatabase(payload) {
  const source = payload || {};

  // --- Phase 1: Draft BOM (the current editable state) ---
  // This is the ONLY source used for BOM rendering, editing, and saving.
  const db = { version: 1, materials: {}, bomEntries: [] };
  const productEntriesByColor = new Map();
  Object.entries(source.bom || {}).forEach(([productCode, product]) => {
    const revMeta = source.productRevisions?.[productCode];
    const currentRevision = revMeta?.currentRevision || '';
    scanBomVersionIntoDb(db, source, productCode, product, currentRevision, true, productEntriesByColor);
  });
  productEntriesByColor.forEach((entries, key) => appendHardwarePackEntries(db, entries, key));

  // --- Phase 2: Released effective snapshots (for Where-Used cross-reference only) ---
  // These entries are SEPARATE: they are appended AFTER the main db is built.
  // They are tagged with isDraft:false. BOM renderers filter only isDraft entries
  // (or equivalently, entries with the same revision as currentRevision).
  // This phase only runs if a product has a DIFFERENT effective release from its current draft.
  const effectiveEntriesByColor = new Map();
  const effectiveDb = { version: 1, materials: db.materials, bomEntries: [] };
  Object.entries(source.bom || {}).forEach(([productCode]) => {
    const revMeta = source.productRevisions?.[productCode];
    if (!revMeta || !revMeta.effectiveRevision || revMeta.effectiveRevision === revMeta.currentRevision) return;
    const effectiveRevision = revMeta.effectiveRevision;
    const effectiveSnapshotRaw = (revMeta.revisions || []).find(r => r.revision === effectiveRevision)?.snapshot;
    if (!effectiveSnapshotRaw) return;
    // Normalize: snapshot.product has the color_info; snapshot may also have materialDb (ignored)
    const effectiveProduct = effectiveSnapshotRaw.product || effectiveSnapshotRaw;
    scanBomVersionIntoDb(effectiveDb, source, productCode, effectiveProduct, effectiveRevision, false, effectiveEntriesByColor);
  });
  effectiveEntriesByColor.forEach((entries, key) => appendHardwarePackEntries(effectiveDb, entries, key));

  // Merge: effective entries appended after draft entries.
  // Renderers that do not filter by revision will still only see the draft entries
  // IF they iterate based on source.bom, because they only look at productCode+colorName
  // combinations that exist in the draft.
  // However syncLegacyBomFromMaterialDb and resolveBomRows MUST only operate on isDraft entries.
  // To be safe, we tag draft entries AND do NOT mix them with effective entries in the flat array.
  // Instead, effective entries live in a SEPARATE array exposed as db.effectiveEntries.
  db.effectiveEntries = effectiveDb.bomEntries;

  return db;
}

function normalizeMaterialDatabase(payload) {
  if (payload?.materialDb?.materials && payload?.materialDb?.bomEntries) {
    return clone(payload.materialDb);
  }
  return createMaterialDatabase(payload);
}

function relationChildMaterialId(entry) {
  return entry?.childMaterialId || entry?.materialId || '';
}

function relationAppliesToProduct(entry, productCode, color) {
  const scopedProduct = String(entry?.productCode || '');
  const scopedColor = String(entry?.color || '');
  return (!scopedProduct || scopedProduct === productCode) && (!scopedColor || scopedColor === color);
}

function productUsageEntries(materialDb, targetMaterialIds, fallbackProductCode = '') {
  const entries = materialDb?.bomEntries || [];
  const childrenByParent = new Map();
  entries.forEach((entry) => {
    if (entry?.parentType !== 'material' || !entry.parentId || !relationChildMaterialId(entry)) return;
    if (!childrenByParent.has(entry.parentId)) childrenByParent.set(entry.parentId, []);
    childrenByParent.get(entry.parentId).push(entry);
  });

  function pathToTarget(materialId, productCode, color, visited = new Set()) {
    if (targetMaterialIds.has(materialId)) return [materialId];
    if (!materialId || visited.has(materialId)) return null;
    const nextVisited = new Set(visited);
    nextVisited.add(materialId);
    for (const relation of childrenByParent.get(materialId) || []) {
      if (!relationAppliesToProduct(relation, productCode, color)) continue;
      const childId = relationChildMaterialId(relation);
      const childPath = pathToTarget(childId, productCode, color, nextVisited);
      if (childPath) return [materialId, ...childPath];
    }
    return null;
  }

  const results = new Map();
  entries.filter((entry) => entry?.parentType === 'product' && entry.materialId).forEach((entry) => {
    const productCode = String(entry.productCode || fallbackProductCode || '');
    const color = String(entry.color || '');
    const path = pathToTarget(entry.materialId, productCode, color);
    if (!path) return;
    const usageType = path.length === 1 ? 'direct' : 'indirect';
    const usage = usageType === 'direct'
      ? { ...entry, productCode, usageType, viaMaterialId: '' }
      : {
        ...entry,
        productCode,
        materialId: path[path.length - 1],
        sourceEntryId: entry.id || '',
        usageType,
        viaMaterialId: entry.materialId,
        materialPath: path,
      };
    const key = `${productCode}|${color}|${entry.revision || ''}`;
    const existing = results.get(key);
    if (!existing || (existing.usageType === 'direct' && usageType === 'indirect')) results.set(key, usage);
  });
  return Array.from(results.values());
}

function usageStatus(revisionSet, revision) {
  const currentRevision = String(revisionSet?.currentRevision || '');
  const effectiveRevision = String(revisionSet?.effectiveRevision || currentRevision);
  if (revision && revision === effectiveRevision) return 'effective';
  if (revision && revision === currentRevision) return 'draft';
  return revision ? 'historical' : 'effective';
}

function materialWhereUsed(payload, materialId) {
  const entries = (payload?.materialDb?.bomEntries || []);
  const effectiveEntries = (payload?.materialDb?.effectiveEntries || []);
  const currentMaterial = payload?.materialDb?.materials?.[materialId];
  const currentDb = {
    materials: payload?.materialDb?.materials || {},
    bomEntries: [...entries, ...effectiveEntries],
  };
  const productEntries = productUsageEntries(currentDb, new Set([materialId]));
  const revisionEntryMap = new Map();
  const usageEntryMap = new Map();

  productEntries.forEach((entry) => {
    const revisionSet = payload?.productRevisions?.[entry.productCode];
    const revision = String(entry.revision || revisionSet?.currentRevision || '');
    const usage = {
      productCode: entry.productCode,
      color: String(entry.color || ''),
      revision,
      status: usageStatus(revisionSet, revision),
      usageType: entry.usageType,
      viaMaterialId: entry.viaMaterialId || '',
    };
    usageEntryMap.set(`${usage.productCode}|${usage.color}|${usage.revision}|${usage.usageType}`, usage);
  });

  Object.entries(payload?.productRevisions || {}).forEach(([productCode, revisionSet]) => {
    (revisionSet?.revisions || []).forEach((revision) => {
      const snapshotDb = revision?.snapshot?.materialDb;
      if (!snapshotDb) return;
      const snapshotMaterialIds = Object.values(snapshotDb.materials || {})
        .filter((material) => material?.id === materialId || (currentMaterial?.code && material?.code === currentMaterial.code))
        .map((material) => material.id);
      if (!snapshotMaterialIds.length) return;
      const snapshotUsage = productUsageEntries(snapshotDb, new Set(snapshotMaterialIds), productCode);
      if (!snapshotUsage.length) return;
      const revisionCode = String(revision?.revision || '');
      revisionEntryMap.set(`${productCode}|${revisionCode}`, { productCode, revision: revisionCode });
      snapshotUsage.forEach((entry) => {
        const usage = {
          productCode,
          color: String(entry.color || ''),
          revision: revisionCode,
          status: usageStatus(revisionSet, revisionCode),
          usageType: entry.usageType,
          viaMaterialId: entry.viaMaterialId || '',
        };
        const key = `${usage.productCode}|${usage.color}|${usage.revision}|${usage.usageType}`;
        if (!usageEntryMap.has(key)) usageEntryMap.set(key, usage);
      });
    });
  });

  return {
    productEntries,
    parentEntries: entries.filter((entry) => entry.parentType === 'material' && entry.materialId === materialId),
    childEntries: entries.filter((entry) => entry.parentType === 'material' && entry.parentId === materialId),
    revisionEntries: Array.from(revisionEntryMap.values()),
    usageEntries: Array.from(usageEntryMap.values()),
  };
}

function localizedValue(pair, lang) {
  if (!pair || typeof pair !== 'object') return '';
  return lang === 'vi' ? (pair.vi || pair.zh || '') : (pair.zh || pair.vi || '');
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function queryMatches(values, query) {
  if (!query) return true;
  const keywords = query.trim().split(/\s+/).filter(Boolean);
  if (!keywords.length) return true;
  const corpus = values.filter(Boolean).map(normalizeText).join(' ');
  return keywords.every((kw) => corpus.includes(kw));
}

function productColorNameTokens(product) {
  const tokens = [];
  Object.entries(product?.color_info || {}).forEach(([colorName, colorData]) => {
    tokens.push(colorName, colorData?.color_ver, colorData?.color_zh, colorData?.color_ver_vi, colorData?.color_vi);
  });
  return uniqueValues(tokens.map((value) => String(value || '').trim()))
    .sort((left, right) => right.length - left.length);
}

function stripProductColorName(value, product, lang) {
  const original = String(value || '').trim();
  if (!original) return '';
  let result = original;
  const tokens = productColorNameTokens(product);
  if (lang !== 'vi') {
    result = result
      .replace(/^[\p{Script=Han}]{1,6}色(?=[0-9０-９一二三四五六七八九十])/u, '')
      .replace(/[\p{Script=Han}]{1,6}色$/u, '');
    tokens
      .filter((token) => token.endsWith('色') && token.length > 1)
      .map((token) => token.slice(0, -1))
      .forEach((baseToken) => {
        const escapedBase = escapeRegExp(baseToken);
        result = result.replace(new RegExp(`^[\\p{Script=Han}]{0,4}${escapedBase}(?=[0-9０-９一二三四五六七八九十])`, 'u'), '');
        result = result.replace(new RegExp(`[\\p{Script=Han}]{0,4}${escapedBase}$`, 'u'), '');
      });
  }
  tokens.forEach((token) => {
    result = result.replace(new RegExp(escapeRegExp(token), 'giu'), '');
  });
  result = result
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,，;；:：)）\]-])/g, '$1')
    .replace(/([-(（\[])\s+/g, '$1')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
  return result || original;
}

function replaceBomEntryMaterial(payload, entryId, materialId) {
  const entry = (payload?.materialDb?.bomEntries || []).find((item) => item.id === entryId);
  const record = payload?.materialDb?.materials?.[materialId];
  if (!entry || !record) return null;
  entry.materialId = materialId;
  if (entry.parentType === 'material') entry.childMaterialId = materialId;
  return entry;
}

function updateMaterialRecord(payload, materialId, patch) {
  const record = payload?.materialDb?.materials?.[materialId];
  if (!record || !patch) return null;
  ['name', 'spec', 'material', 'color', 'attr'].forEach((field) => {
    if (!patch[field]) return;
    record[field] = {
      zh: String(patch[field].zh ?? record[field]?.zh ?? ''),
      vi: String(patch[field].vi ?? record[field]?.vi ?? patch[field].zh ?? record[field]?.zh ?? '')
    };
  });
  if (Object.prototype.hasOwnProperty.call(patch, 'code')) record.code = String(patch.code || '');
  if (Object.prototype.hasOwnProperty.call(patch, 'drawings')) record.drawings = clone(patch.drawings);
  if (Object.prototype.hasOwnProperty.call(patch, 'models3d')) record.models3d = clone(patch.models3d);
  return record;
}

function parseQty(value) {
  const textValue = String(value || '');
  if (!textValue) return 0;
  if (!textValue.includes('+')) return Number(textValue) || 0;
  return textValue.split('+').reduce((sum, item) => sum + (Number(item.trim()) || 0), 0);
}

function materialText(material, field, lang) {
  if (field === 'name') return lang === 'vi' ? (material.name_vi || material.name_zh || '') : (material.name_zh || material.name_vi || '');
  if (field === 'spec') return lang === 'vi' ? (material.spec_vi || material.spec || '') : (material.spec || material.spec_vi || '');
  if (field === 'material') return lang === 'vi' ? (material.material_vi || material.material_zh || '') : (material.material_zh || material.material_vi || '');
  if (field === 'color') return lang === 'vi' ? (material.color_vi || material.color_zh || '') : (material.color_zh || material.color_vi || '');
  if (field === 'attr') return lang === 'vi' ? (material.attr_vi || material.attr_zh || '') : (material.attr_zh || material.attr_vi || '');
  return material[field] || '';
}

function materialSearchMatch(material, query) {
  if (!query) return true;
  return queryMatches(materialSearchValues(material), query);
}

function materialSearchValues(material) {
  const assets = [...(material?.drawings || []), ...(material?.models3d || [])];
  return [
    material.mat_code, material.comp_code, material.name_zh, material.name_vi,
    material.spec, material.spec_vi, material.material_zh, material.material_vi,
    material.color_zh, material.color_vi, material.attr_zh, material.attr_vi,
    material?.code, material?.name?.zh, material?.name?.vi,
    material?.spec?.zh, material?.spec?.vi, material?.material?.zh, material?.material?.vi,
    material?.color?.zh, material?.color?.vi, material?.attr?.zh, material?.attr?.vi,
    ...assets.flatMap((asset) => [asset?.matched_name, asset?.name]),
  ];
}

function sortMaterials(materials, options) {
  return materials.slice().sort((left, right) => compareMaterial(left, right, options));
}

function compareMaterial(left, right, options) {
  const { sortCol, sortAsc, lang, attrOrder } = options;
  if (sortCol === 'stt') return directional((parseInt(left.stt, 10) || 0) - (parseInt(right.stt, 10) || 0), sortAsc);
  if (sortCol === 'qty') return directional(parseQty(left._effectiveQty ?? left.qty) - parseQty(right._effectiveQty ?? right.qty), sortAsc);
  if (sortCol === 'attr') {
    const diff = (attrOrder[left.attr_zh] ?? 99) - (attrOrder[right.attr_zh] ?? 99);
    if (diff !== 0) return directional(diff, sortAsc);
    const leftCode = String(left.mat_code || left.code || '');
    const rightCode = String(right.mat_code || right.code || '');
    return directional(leftCode.localeCompare(rightCode), sortAsc);
  }
  const leftValue = materialText(left, sortCol, lang);
  const rightValue = materialText(right, sortCol, lang);
  return directional(String(leftValue).localeCompare(String(rightValue), lang === 'vi' ? 'vi' : 'zh'), sortAsc);
}

function directional(value, sortAsc) {
  return sortAsc ? value : -value;
}

function filterMaterials({ materials, attr, query, sortCol, sortAsc, lang, attrOrder, dbFilters, has2D, has3D }) {
  const normalizedQuery = normalizeText(query);
  const filtered = (materials || [])
    .filter((material) => attr === 'all' || material.attr_zh === attr)
    .filter((material) => {
      if (dbFilters) {
        if (dbFilters.attr !== 'all' && materialText(material, 'attr', 'zh') !== dbFilters.attr) return false;
        if (dbFilters.material !== 'all' && materialText(material, 'material', 'zh') !== dbFilters.material) return false;
        if (dbFilters.color !== 'all' && materialText(material, 'color', 'zh') !== dbFilters.color) return false;

        const has2DVal = has2D ? has2D(material) : (material.drawings || []).length > 0;
        if (dbFilters.has2D === 'yes' && !has2DVal) return false;
        if (dbFilters.has2D === 'no' && has2DVal) return false;

        const has3DVal = has3D ? has3D(material) : (material.models3d || []).length > 0;
        if (dbFilters.has3D === 'yes' && !has3DVal) return false;
        if (dbFilters.has3D === 'no' && has3DVal) return false;
      }
      return true;
    })
    .filter((material) => materialSearchMatch(material, normalizedQuery));
  return sortMaterials(filtered, { sortCol, sortAsc, lang, attrOrder: attrOrder || {} });
}

export {
  clone,
  normalizeText,
  escapeRegExp,
  localizedPair,
  createMaterialDatabase,
  normalizeMaterialDatabase,
  materialWhereUsed,
  replaceBomEntryMaterial,
  updateMaterialRecord,
  filterMaterials,
  sortMaterials,
  stripProductColorName,
  localizedValue,
  materialText,
  materialSearchValues,
  queryMatches,
  isHardwarePackSummary,
  legacyRowFromRecord,
  uniqueValues,
  findBomAssetEntry,
  findBomAssets,
  stableId,
};
