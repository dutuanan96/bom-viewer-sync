import { ERROR_CODES, validateMutation, validateMutationProposal } from './contracts.js';
import { describePayloadChanges } from '../notifications.js';
import { syncLegacyBomFromMaterialDb } from '../../domain/relationships.js';
import {
  materialWhereUsed,
  replaceBomEntryMaterial,
  stableId,
  updateMaterialRecord,
} from '../../domain/materials.js';
import {
  createProductRevision,
  releaseProductRevision,
  withdrawProductRevision,
} from '../../domain/revisions.js';
import {
  buildBilingualDictionary,
  lookupCandidates,
  normalizeBilingualValue,
} from '../../domain/bilingual-dictionary.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

export function validateMutationContext(snapshot, mutation) {
  validateMutation(mutation);

  if (!snapshot.isAdmin) {
    const err = new Error('Mutations can only be applied in Admin mode.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }
  if (snapshot.dirty) {
    const err = new Error('Cannot apply mutations while there are unsaved human edits. Please save or discard your changes first.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }

  const masterDataOperations = new Set([
    'create_product',
    'create_material',
    'update_material',
    'update_material_field',
    'delete_material',
    'add_material_child',
    'update_material_child_quantity',
    'remove_material_child',
    'delete_material_structure',
  ]);
  const revisionOperations = new Set([
    'create_product_revision',
    'release_product_revision',
    'withdraw_product_revision',
  ]);
  const canEdit = snapshot.canEditRevision;
  if (!canEdit && !masterDataOperations.has(mutation.operationType) && !revisionOperations.has(mutation.operationType)) {
    const err = new Error('Mutations can only be applied to the current Draft revision. AI cannot modify released or historical revisions.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }

  if (mutation.operationType === 'update_product') {
    if (
      snapshot.selection?.productCode !== mutation.targetId ||
      snapshot.selection?.color !== mutation.payload.color
    ) {
      const err = new Error('Product mutation target must match the selected product and color.');
      err.code = ERROR_CODES.AI_POLICY_BLOCKED;
      throw err;
    }
  }
  if (revisionOperations.has(mutation.operationType) && snapshot.selection?.productCode !== mutation.targetId) {
    const err = new Error('Revision mutation target must match the selected product.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }
  if (mutation.operationType === 'create_product_revision' && canEdit) {
    const err = new Error('A new revision can only be created from a released current revision.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }
  if (mutation.operationType === 'release_product_revision' && !canEdit) {
    const err = new Error('Only the current Draft revision can be released.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }
  if (mutation.operationType === 'withdraw_product_revision' && canEdit) {
    const err = new Error('Only the current released revision can be withdrawn.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }

  if (mutation.operationType === 'add_bom_item' || mutation.operationType === 'update_bom_quantity') {
    if (
      snapshot.selection?.productCode !== mutation.targetId ||
      snapshot.selection?.color !== mutation.payload.color
    ) {
      const err = new Error('BOM mutation target must match the selected product and color.');
      err.code = ERROR_CODES.AI_POLICY_BLOCKED;
      throw err;
    }
  }
  if (['update_bom_item', 'remove_bom_item'].includes(mutation.operationType)) {
    const entry = snapshot.payload?.materialDb?.bomEntries?.find(item => item.id === mutation.targetId);
    if (!entry) {
      const err = new Error(`BOM entry ${mutation.targetId} not found.`);
      err.code = ERROR_CODES.AI_POLICY_BLOCKED;
      throw err;
    }
    if (
      snapshot.selection?.productCode !== (entry.productCode || entry.parentId) ||
      snapshot.selection?.color !== entry.color
    ) {
      const err = new Error('BOM entry mutation must match the selected product and color.');
      err.code = ERROR_CODES.AI_POLICY_BLOCKED;
      throw err;
    }
  }
  if (mutation.operationType === 'replace_bom_item') {
    const entry = snapshot.payload?.materialDb?.bomEntries?.find(item => item.id === mutation.targetId);
    if (!entry) {
      const err = new Error(`BOM entry ${mutation.targetId} not found.`);
      err.code = ERROR_CODES.AI_POLICY_BLOCKED;
      throw err;
    }
  }
  if (mutation.operationType === 'delete_material') {
    const usage = materialWhereUsed(snapshot.payload, mutation.targetId);
    const usageCount = usage.productEntries.length + usage.parentEntries.length + usage.childEntries.length;
    if (usageCount > 0) {
      const err = new Error(`Material ${mutation.targetId} is still used by ${usageCount} BOM relationships.`);
      err.code = ERROR_CODES.AI_POLICY_BLOCKED;
      throw err;
    }
  }
  if (mutation.operationType === 'add_material_child') {
    if (!snapshot.payload?.materialDb?.materials?.[mutation.targetId]) throw new Error(`Parent material ${mutation.targetId} not found.`);
    if (!snapshot.payload?.materialDb?.materials?.[mutation.payload.materialId]) throw new Error(`Child material ${mutation.payload.materialId} not found.`);
    if (mutation.targetId === mutation.payload.materialId) throw new Error('A material cannot be its own child.');
    const childIdsByParent = new Map();
    for (const entry of snapshot.payload?.materialDb?.bomEntries || []) {
      if (entry.parentType !== 'material') continue;
      if (!childIdsByParent.has(entry.parentId)) childIdsByParent.set(entry.parentId, []);
      childIdsByParent.get(entry.parentId).push(entry.childMaterialId || entry.materialId);
    }
    const pending = [mutation.payload.materialId];
    const visited = new Set();
    while (pending.length) {
      const materialId = pending.pop();
      if (materialId === mutation.targetId) throw new Error('Material child relation would create a cycle.');
      if (visited.has(materialId)) continue;
      visited.add(materialId);
      pending.push(...(childIdsByParent.get(materialId) || []));
    }
  }
  if (mutation.operationType === 'update_material_child_quantity') {
    if (!snapshot.payload?.materialDb?.materials?.[mutation.targetId]) throw new Error(`Parent material ${mutation.targetId} not found.`);
  }
  if (mutation.operationType === 'remove_material_child') {
    const entry = snapshot.payload?.materialDb?.bomEntries?.find(item => item.id === mutation.targetId);
    if (!entry || entry.parentType !== 'material') throw new Error(`Material child entry ${mutation.targetId} not found.`);
  }
  if (mutation.operationType === 'delete_material_structure' && !snapshot.payload?.materialDb?.materials?.[mutation.targetId]) {
    throw new Error(`Parent material ${mutation.targetId} not found.`);
  }
}

export function applyMutationToPayload(payload, mutation) {
  validateMutation(mutation);
  const { operationType, targetId, payload: opPayload } = mutation;

  let shouldSyncBom = false;
  if (operationType === 'create_product') {
    if (payload.bom?.[targetId]) throw new Error(`Product ${targetId} already exists.`);
    const colorName = opPayload.color.zh.trim();
    payload.bom = payload.bom || {};
    payload.bom[targetId] = {
      code: targetId,
      colors: [colorName],
      color_info: {
        [colorName]: {
          sku: opPayload.sku.trim().toUpperCase(),
          name: opPayload.name.zh || opPayload.name.vi,
          name_zh: opPayload.name.zh || opPayload.name.vi,
          name_vi: opPayload.name.vi || opPayload.name.zh,
          size: opPayload.size,
          color_ver: colorName,
          color_ver_vi: opPayload.color.vi || colorName,
          materials: [],
        },
      },
    };
  } else if (operationType === 'update_product') {
    const product = payload.bom?.[targetId];
    const colorData = product?.color_info?.[opPayload.color];
    if (!colorData) throw new Error(`Product/color ${targetId}/${opPayload.color} not found.`);
    const patch = opPayload.patch;
    if (patch.name) {
      if ('zh' in patch.name) {
        colorData.name = patch.name.zh;
        colorData.name_zh = patch.name.zh;
      }
      if ('vi' in patch.name) colorData.name_vi = patch.name.vi;
    }
    if ('size' in patch) colorData.size = patch.size;
    if ('sku' in patch) colorData.sku = patch.sku.trim().toUpperCase();
  } else if (operationType === 'create_product_revision') {
    createProductRevision(payload, targetId, opPayload.revision, { changeReason: opPayload.changeReason });
  } else if (operationType === 'release_product_revision') {
    releaseProductRevision(payload, targetId, undefined, { reason: opPayload.reason });
  } else if (operationType === 'withdraw_product_revision') {
    withdrawProductRevision(payload, targetId, undefined, { reason: opPayload.reason });
  } else if (operationType === 'create_material') {
    if (payload.materialDb?.materials?.[targetId]) throw new Error(`Material ${targetId} already exists.`);
    const input = clone(opPayload.material);
    const duplicateCode = Object.values(payload.materialDb?.materials || {})
      .some(material => String(material?.code || '').trim().toLowerCase() === String(input.code || '').trim().toLowerCase());
    if (duplicateCode) throw new Error(`Material code ${input.code} already exists.`);
    payload.materialDb.materials[targetId] = {
      id: targetId,
      code: String(input.code || ''),
      name: { zh: String(input.name?.zh || input.name?.vi || ''), vi: String(input.name?.vi || input.name?.zh || '') },
      spec: { zh: String(input.spec?.zh || ''), vi: String(input.spec?.vi || input.spec?.zh || '') },
      material: { zh: String(input.material?.zh || ''), vi: String(input.material?.vi || input.material?.zh || '') },
      color: { zh: String(input.color?.zh || ''), vi: String(input.color?.vi || input.color?.zh || '') },
      attr: { zh: String(input.attr?.zh || '零件'), vi: String(input.attr?.vi || input.attr?.zh || 'linh kiện') },
      drawings: clone(input.drawings || []),
      models3d: clone(input.models3d || []),
      ...(input.unit ? { unit: String(input.unit) } : {}),
    };
  } else if (operationType === 'update_material') {
    const record = updateMaterialRecord(payload, targetId, opPayload.patch);
    if (!record) throw new Error(`Material ${targetId} not found.`);
    if (Object.prototype.hasOwnProperty.call(opPayload.patch, 'unit')) record.unit = String(opPayload.patch.unit || '');
  } else if (operationType === 'update_material_field') {
    const mat = payload.materialDb?.materials?.[targetId];
    if (!mat) throw new Error(`Material ${targetId} not found.`);

    if (opPayload.field === 'code') mat.code = opPayload.value;
    else if (opPayload.field === 'name_zh') { mat.name = mat.name || {}; mat.name.zh = opPayload.value; }
    else if (opPayload.field === 'name_vi') { mat.name = mat.name || {}; mat.name.vi = opPayload.value; }
    else if (opPayload.field === 'spec') { mat.spec = mat.spec || {}; mat.spec.zh = opPayload.value; }
    else if (opPayload.field === 'spec_vi') { mat.spec = mat.spec || {}; mat.spec.vi = opPayload.value; }
    else if (opPayload.field === 'material_zh') { mat.material = mat.material || {}; mat.material.zh = opPayload.value; }
    else if (opPayload.field === 'material_vi') { mat.material = mat.material || {}; mat.material.vi = opPayload.value; }
    else if (opPayload.field === 'color_zh') { mat.color = mat.color || {}; mat.color.zh = opPayload.value; }
    else if (opPayload.field === 'color_vi') { mat.color = mat.color || {}; mat.color.vi = opPayload.value; }
    else if (opPayload.field === 'attr_zh') { mat.attr = mat.attr || {}; mat.attr.zh = opPayload.value; }
    else if (opPayload.field === 'attr_vi') { mat.attr = mat.attr || {}; mat.attr.vi = opPayload.value; }
    else if (opPayload.field === 'unit') mat.unit = opPayload.value;
    else throw new Error(`Field ${opPayload.field} is not allowed to be updated by AI.`);
  } else if (operationType === 'delete_material') {
    const mat = payload.materialDb?.materials?.[targetId];
    if (!mat) throw new Error(`Material ${targetId} not found.`);
    const usage = materialWhereUsed(payload, targetId);
    const usageCount = usage.productEntries.length + usage.parentEntries.length + usage.childEntries.length;
    if (usageCount > 0) throw new Error(`Material ${targetId} is still used by ${usageCount} BOM relationships.`);
    delete payload.materialDb.materials[targetId];
  } else if (operationType === 'add_bom_item') {
    const product = payload.bom?.[targetId];
    if (!product?.color_info?.[opPayload.color]) throw new Error(`Product/color ${targetId}/${opPayload.color} not found.`);
    if (!payload.materialDb?.materials?.[opPayload.materialId]) throw new Error(`Material ${opPayload.materialId} not found.`);
    const scopedEntries = payload.materialDb.bomEntries.filter(entry => (
      (entry.productCode === targetId || entry.parentId === targetId) && entry.color === opPayload.color
    ));
    let entryId = stableId('bom', `${targetId}|${opPayload.color}|${opPayload.materialId}|${scopedEntries.length}`);
    let suffix = 1;
    while (payload.materialDb.bomEntries.some(entry => entry.id === entryId)) {
      entryId = stableId('bom', `${targetId}|${opPayload.color}|${opPayload.materialId}|${scopedEntries.length}|${suffix++}`);
    }
    payload.materialDb.bomEntries.push({
      id: entryId,
      parentType: 'product',
      parentId: targetId,
      productCode: targetId,
      color: opPayload.color,
      materialId: opPayload.materialId,
      stt: String(scopedEntries.length + 1),
      comp_code: opPayload.comp_code,
      qty: String(opPayload.quantity),
      color_ver: opPayload.color,
      color_ver_vi: opPayload.color,
      order: scopedEntries.length,
    });
    shouldSyncBom = true;
  } else if (operationType === 'update_bom_item') {
    const entry = payload.materialDb?.bomEntries?.find(item => item.id === targetId);
    if (!entry) throw new Error(`BOM entry ${targetId} not found.`);
    entry.comp_code = opPayload.comp_code;
    entry.qty = String(opPayload.quantity);
    shouldSyncBom = true;
  } else if (operationType === 'update_bom_quantity') {
    const product = payload.bom?.[targetId];
    if (!product) throw new Error(`Product ${targetId} not found.`);

    const color = opPayload.color;
    if (!color) throw new Error('Missing color in update_bom_quantity payload.');

    const colorInfo = product.color_info?.[color];
    if (!colorInfo) throw new Error(`Color ${color} not found in product ${targetId}.`);

    const childId = opPayload.childId;
    if (!childId) throw new Error('Missing childId in update_bom_quantity payload.');

    const materials = payload.materialDb?.materials;
    const entries = payload.materialDb?.bomEntries;
    if (materials && Array.isArray(entries)) {
      const materialIds = new Set(Object.entries(materials)
        .filter(([id, material]) => id === childId || material?.id === childId || material?.code === childId)
        .flatMap(([id, material]) => [id, material?.id].filter(Boolean)));
      const matchingEntries = entries.filter((entry) =>
        (entry.productCode === targetId || entry.parentId === targetId) &&
        entry.color === color &&
        (materialIds.has(entry.materialId) || materialIds.has(entry.childMaterialId)));
      if (matchingEntries.length > 0) {
        matchingEntries.forEach((entry) => { entry.qty = String(opPayload.quantity); });
        shouldSyncBom = true;
        if (shouldSyncBom) syncLegacyBomFromMaterialDb(payload);
        return;
      }
    }

    function updateQty(materials) {
      if (!materials) return false;
      for (const m of materials) {
        if (m.mat_code === childId) {
          m.qty = String(opPayload.quantity);
          return true;
        }
        if (updateQty(m.materials)) return true;
      }
      return false;
    }

    const found = updateQty(colorInfo.materials);
    if (!found) {
      throw new Error(`Material ${childId} not found in BOM for product ${targetId} (${color}).`);
    }
  } else if (operationType === 'replace_bom_item') {
    const entry = replaceBomEntryMaterial(payload, targetId, opPayload.materialId);
    if (!entry) throw new Error(`BOM entry ${targetId} or material ${opPayload.materialId} not found.`);
    shouldSyncBom = true;
  } else if (operationType === 'remove_bom_item') {
    const before = payload.materialDb?.bomEntries?.length || 0;
    payload.materialDb.bomEntries = (payload.materialDb?.bomEntries || []).filter(entry => entry.id !== targetId);
    if (payload.materialDb.bomEntries.length === before) throw new Error(`BOM entry ${targetId} not found.`);
    shouldSyncBom = true;
  } else if (operationType === 'add_material_child') {
    if (!payload.materialDb?.materials?.[targetId]) throw new Error(`Parent material ${targetId} not found.`);
    if (!payload.materialDb?.materials?.[opPayload.materialId]) throw new Error(`Child material ${opPayload.materialId} not found.`);
    const duplicate = payload.materialDb.bomEntries.some(entry => (
      entry.parentType === 'material' &&
      entry.parentId === targetId &&
      (entry.childMaterialId || entry.materialId) === opPayload.materialId
    ));
    if (duplicate) throw new Error(`Material child relation ${targetId}/${opPayload.materialId} already exists.`);
    const scopedEntries = payload.materialDb.bomEntries.filter(entry => entry.parentType === 'material' && entry.parentId === targetId);
    let entryId = stableId('bomc', `${targetId}|${opPayload.materialId}|${scopedEntries.length}`);
    let suffix = 1;
    while (payload.materialDb.bomEntries.some(entry => entry.id === entryId)) {
      entryId = stableId('bomc', `${targetId}|${opPayload.materialId}|${scopedEntries.length}|${suffix++}`);
    }
    payload.materialDb.bomEntries.push({
      id: entryId,
      parentType: 'material',
      parentId: targetId,
      productCode: '',
      color: '',
      materialId: opPayload.materialId,
      childMaterialId: opPayload.materialId,
      stt: '',
      comp_code: '',
      qty: String(opPayload.quantity),
      color_ver: '',
      color_ver_vi: '',
      order: scopedEntries.length,
    });
    shouldSyncBom = true;
  } else if (operationType === 'update_material_child_quantity') {
    const matching = payload.materialDb?.bomEntries?.filter(entry => (
      entry.parentType === 'material' &&
      entry.parentId === targetId &&
      (entry.childMaterialId || entry.materialId) === opPayload.childId &&
      String(entry.qty || '') === String(opPayload.originalQuantity)
    )) || [];
    if (!matching.length) throw new Error(`Material child relation ${targetId}/${opPayload.childId} not found.`);
    matching.forEach(entry => { entry.qty = String(opPayload.quantity); });
    shouldSyncBom = true;
  } else if (operationType === 'remove_material_child') {
    const entry = payload.materialDb?.bomEntries?.find(item => item.id === targetId && item.parentType === 'material');
    if (!entry) throw new Error(`Material child entry ${targetId} not found.`);
    payload.materialDb.bomEntries = payload.materialDb.bomEntries.filter(item => item.id !== targetId);
    shouldSyncBom = true;
  } else if (operationType === 'delete_material_structure') {
    const before = payload.materialDb?.bomEntries?.length || 0;
    payload.materialDb.bomEntries = (payload.materialDb?.bomEntries || [])
      .filter(entry => !(entry.parentType === 'material' && entry.parentId === targetId));
    if (payload.materialDb.bomEntries.length === before) throw new Error(`Material structure ${targetId} is empty or not found.`);
    shouldSyncBom = true;
  } else {
    throw new Error(`Unsupported operationType: ${operationType}`);
  }
  if (shouldSyncBom) syncLegacyBomFromMaterialDb(payload);
}

export function computeMutationDiff(snapshot, mutation) {
  validateMutationContext(snapshot, mutation);

  const clonedPayload = clone(snapshot.payload);
  applyMutationToPayload(clonedPayload, mutation);

  return describePayloadChanges(snapshot.payload, clonedPayload);
}

export function applyMutationTransaction(snapshot, mutation) {
  const changes = computeMutationDiff(snapshot, mutation);
  if (changes.length === 0) {
    const error = new Error('Mutation produces no changes');
    error.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw error;
  }
  
  const payload = clone(snapshot.payload);
  applyMutationToPayload(payload, mutation);
  return { payload, changes };
}

function operationCategory(operationType) {
  if (operationType.includes('revision')) return 'revision';
  if (operationType.includes('product')) return 'product';
  if (operationType.includes('material_child') || operationType === 'delete_material_structure') return 'structure';
  return operationType.includes('material') && !operationType.includes('bom') ? 'material' : 'bom';
}

function operationRisk(operationType) {
  if ([
    'delete_material',
    'remove_bom_item',
    'replace_bom_item',
    'delete_material_structure',
    'release_product_revision',
    'withdraw_product_revision',
  ].includes(operationType)) return 'high';
  if ([
    'create_product',
    'create_product_revision',
    'create_material',
    'add_bom_item',
    'update_material',
    'add_material_child',
    'remove_material_child',
  ].includes(operationType)) return 'medium';
  return 'low';
}

function operationWarnings(operation, payload, t = (k) => k) {
  const warnings = [];
  if (operation.operationType === 'delete_material') warnings.push(t('ai.warning.delete_material'));
  if (operation.operationType === 'remove_bom_item') warnings.push(t('ai.warning.remove_bom_item'));
  if (operation.operationType === 'replace_bom_item') warnings.push(t('ai.warning.replace_bom_item'));
  if (operation.operationType === 'create_material') warnings.push(t('ai.warning.create_material'));
  if (operation.operationType === 'add_bom_item') warnings.push(t('ai.warning.add_bom_item'));
  if (operation.operationType === 'create_product') warnings.push(t('ai.warning.create_product'));
  if (operation.operationType === 'create_product_revision') warnings.push(t('ai.warning.create_product_revision'));
  if (operation.operationType === 'release_product_revision') warnings.push(t('ai.warning.release_product_revision'));
  if (operation.operationType === 'withdraw_product_revision') warnings.push(t('ai.warning.withdraw_product_revision'));
  if (operation.operationType === 'delete_material_structure') warnings.push(t('ai.warning.delete_material_structure'));
  if (operation.operationType === 'remove_material_child') warnings.push(t('ai.warning.remove_material_child'));
  
  if (payload && (operation.operationType === 'update_material' || operation.operationType === 'update_material_field')) {
    const updatedMaterial = payload.materialDb?.materials?.[operation.targetId];
    if (updatedMaterial) {
      const allMaterialIds = Object.keys(payload.materialDb?.materials || {});
      for (const id of allMaterialIds) {
        if (id === operation.targetId) continue;
        const otherMaterial = payload.materialDb.materials[id];
        
        let isDuplicate = true;
        for (const field of ['name', 'spec', 'material', 'color', 'attr']) {
          const val1 = updatedMaterial[field] || {};
          const val2 = otherMaterial[field] || {};
          if ((val1.zh || '') !== (val2.zh || '') || (val1.vi || '') !== (val2.vi || '')) {
            isDuplicate = false;
            break;
          }
        }
        
        if (isDuplicate) {
          warnings.push({
            message: t('ai.warning.duplicateMaterial').replace('{duplicateCode}', otherMaterial.code || id),
            action: { type: 'swap', duplicateId: id }
          });
          break;
        }
      }
    }

    const usage = materialWhereUsed(payload, operation.targetId);
    const usageCount = usage.productEntries.length + usage.parentEntries.length + usage.childEntries.length;
    if (usageCount > 1) {
      const productMap = {};
      usage.productEntries.forEach(e => {
        if (!productMap[e.parentId]) productMap[e.parentId] = new Set();
        productMap[e.parentId].add(e.color ? e.color : t('ai.warning.allColors'));
      });
      const productCodes = Object.entries(productMap).map(([pid, colors]) => {
        if (colors.size === 0) return pid;
        return `${pid} - ${Array.from(colors).join(', ')}`;
      });
      const parentMaterialCodes = [...new Set(usage.parentEntries.map(e => payload.materialDb?.materials?.[e.parentId]?.code || e.parentId))];
      const locations = [...productCodes, ...parentMaterialCodes].filter(Boolean).join('; ');
      const locationText = locations ? ` (${locations})` : '';
      
      warnings.push(t('ai.warning.materialShared').replace('{count}', usageCount).replace('{locations}', locationText));
    }
  }

  return warnings;
}

function enrichCreateMaterialMutation(materials, sourceMutation) {
  const mutation = clone(sourceMutation);
  const warnings = [];
  if (mutation.operationType !== 'create_material') return { mutation, warnings };

  const dictionary = buildBilingualDictionary(materials);
  const material = mutation.payload.material;
  for (const field of ['name', 'material', 'color', 'attr']) {
    const pair = material[field];
    if (!pair) continue;
    const zh = String(pair.zh || '').trim();
    const vi = String(pair.vi || '').trim();

    if (zh && !vi) {
      const candidates = lookupCandidates(dictionary, field, 'zh', zh);
      if (candidates.length === 1) {
        pair.vi = candidates[0].vi;
        warnings.push(`${field}.vi auto-filled from bilingual dictionary.`);
      } else if (candidates.length > 1) {
        warnings.push(`${field} has multiple bilingual mappings; Admin confirmation is required.`);
      }
      continue;
    }

    if (vi && !zh) {
      const candidates = lookupCandidates(dictionary, field, 'vi', vi);
      if (candidates.length === 1) {
        pair.zh = candidates[0].zh;
        warnings.push(`${field}.zh auto-filled from bilingual dictionary.`);
      } else if (candidates.length > 1) {
        warnings.push(`${field} has multiple bilingual mappings; Admin confirmation is required.`);
      }
      continue;
    }

    if (zh && vi) {
      const candidates = lookupCandidates(dictionary, field, 'zh', zh);
      if (
        candidates.length > 0
        && !candidates.some((candidate) =>
          normalizeBilingualValue(candidate.vi) === normalizeBilingualValue(vi))
      ) {
        warnings.push(`${field} conflicts with the current bilingual dictionary; verify both values.`);
      }
    }
  }
  return { mutation, warnings };
}

function verifyProposalPayload(payload) {
  const errors = [];
  const warnings = [];
  const materials = payload.materialDb?.materials || {};
  const entries = payload.materialDb?.bomEntries || [];
  for (const [productId, product] of Object.entries(payload.bom || {})) {
    if (productId !== product.code) errors.push(`Product key/code mismatch: ${productId}/${product.code || ''}.`);
    if (!Array.isArray(product.colors) || product.colors.length === 0) errors.push(`Product ${productId} has no color.`);
    for (const color of product.colors || []) {
      if (!product.color_info?.[color]) errors.push(`Product ${productId} references missing color data ${color}.`);
      if (!String(product.color_info?.[color]?.sku || '').trim()) errors.push(`Product ${productId}/${color} has no SKU.`);
    }
  }
  const codes = new Map();
  for (const [id, material] of Object.entries(materials)) {
    const code = String(material?.code || '').trim().toLowerCase();
    if (!code) warnings.push(`Material ${id} has no code.`);
    else if (codes.has(code)) errors.push(`Duplicate material code: ${material.code}.`);
    else codes.set(code, id);
  }
  for (const entry of entries) {
    const materialId = entry.childMaterialId || entry.materialId;
    if (!materials[materialId]) errors.push(`BOM entry ${entry.id} references missing material ${materialId}.`);
    const quantityText = String(entry.qty || '').trim();
    const quantity = /^\d+(?:\s*\+\s*\d+)*$/.test(quantityText)
      ? quantityText.split('+').reduce((sum, item) => sum + Number(item.trim()), 0)
      : Number.NaN;
    if (!Number.isFinite(quantity) || quantity <= 0) errors.push(`BOM entry ${entry.id} has invalid quantity.`);
    if (entry.parentType !== 'material') {
      const productId = entry.productCode || entry.parentId;
      if (!payload.bom?.[productId]) errors.push(`BOM entry ${entry.id} references missing product ${productId}.`);
      else if (entry.color && !payload.bom[productId]?.color_info?.[entry.color]) {
        errors.push(`BOM entry ${entry.id} references missing color ${productId}/${entry.color}.`);
      }
    }
  }
  const childIdsByParent = new Map();
  for (const entry of entries.filter(item => item.parentType === 'material')) {
    const childId = entry.childMaterialId || entry.materialId;
    if (!childIdsByParent.has(entry.parentId)) childIdsByParent.set(entry.parentId, []);
    childIdsByParent.get(entry.parentId).push(childId);
  }
  const visiting = new Set();
  const visited = new Set();
  function visitMaterial(materialId) {
    if (visiting.has(materialId)) {
      errors.push(`Material structure cycle detected at ${materialId}.`);
      return;
    }
    if (visited.has(materialId)) return;
    visiting.add(materialId);
    for (const childId of childIdsByParent.get(materialId) || []) visitMaterial(childId);
    visiting.delete(materialId);
    visited.add(materialId);
  }
  Object.keys(materials).forEach(visitMaterial);
  return { valid: errors.length === 0, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) };
}

export function buildMutationProposalReview(snapshot, proposalInput, t = (k) => k) {
  const proposal = validateMutationProposal(proposalInput);
  let payload = clone(snapshot.payload);
  let currentCanEdit = snapshot.canEditRevision;
  const operations = proposal.operations.map((sourceMutation, index) => {
    const enrichment = enrichCreateMaterialMutation(payload.materialDb?.materials || {}, sourceMutation);
    const mutation = enrichment.mutation;
    const operationSnapshot = { ...snapshot, payload, canEditRevision: currentCanEdit };
    validateMutationContext(operationSnapshot, mutation);
    const before = clone(payload);
    applyMutationToPayload(payload, mutation);

    if (mutation.operationType === 'create_product_revision' && snapshot.selection?.productCode === mutation.targetId) {
      currentCanEdit = true;
    } else if (mutation.operationType === 'release_product_revision' && snapshot.selection?.productCode === mutation.targetId) {
      currentCanEdit = false;
    } else if (mutation.operationType === 'withdraw_product_revision' && snapshot.selection?.productCode === mutation.targetId) {
      currentCanEdit = false;
    }

    const diff = describePayloadChanges(before, payload);
    if (diff.length === 0) {
      const error = new Error(`Operation ${index + 1} produces no changes.`);
      error.code = ERROR_CODES.AI_POLICY_BLOCKED;
      throw error;
    }
    return {
      id: `change-${index + 1}`,
      category: operationCategory(mutation.operationType),
      risk: operationRisk(mutation.operationType),
      warnings: [...operationWarnings(mutation, operationSnapshot.payload, t), ...enrichment.warnings],
      mutation: clone(mutation),
      diff,
    };
  });
  const verification = verifyProposalPayload(payload);
  if (!verification.valid) {
    const error = new Error(`Proposal verification failed: ${verification.errors.join(' ')}`);
    error.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw error;
  }
  return {
    summary: proposal.summary,
    operations,
    verification,
    finalDiff: describePayloadChanges(snapshot.payload, payload),
  };
}

export function applyMutationProposalTransaction(snapshot, proposalInput) {
  const review = buildMutationProposalReview(snapshot, proposalInput);
  return {
    payload: review.operations.reduce((payload, operation) => {
      applyMutationToPayload(payload, operation.mutation);
      return payload;
    }, clone(snapshot.payload)),
    changes: review.finalDiff,
    review,
  };
}
