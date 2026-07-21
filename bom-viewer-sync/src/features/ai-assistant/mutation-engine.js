import { ERROR_CODES, validateMutation } from './contracts.js';
import { describePayloadChanges } from '../notifications.js';
import { syncLegacyBomFromMaterialDb } from '../../domain/relationships.js';

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

  const canEdit = snapshot.canEditRevision;
  if (!canEdit && mutation.operationType !== 'update_material_field') {
    const err = new Error('Mutations can only be applied to the current Draft revision. AI cannot modify released or historical revisions.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }
  
  if (
    mutation.operationType === 'update_bom_quantity' &&
    (
      snapshot.selection?.productCode !== mutation.targetId ||
      snapshot.selection?.color !== mutation.payload.color
    )
  ) {
    const err = new Error('BOM mutation target must match the selected product and color.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }
}

export function applyMutationToPayload(payload, mutation) {
  validateMutation(mutation);
  const { operationType, targetId, payload: opPayload } = mutation;

  if (operationType === 'update_material_field') {
    const mat = payload.materialDb?.materials?.[targetId];
    if (!mat) throw new Error(`Material ${targetId} not found.`);

    if (opPayload.field === 'name_zh') { mat.name = mat.name || {}; mat.name.zh = opPayload.value; }
    else if (opPayload.field === 'name_vi') { mat.name = mat.name || {}; mat.name.vi = opPayload.value; }
    else if (opPayload.field === 'spec') { mat.spec = mat.spec || {}; mat.spec.zh = opPayload.value; }
    else if (opPayload.field === 'spec_vi') { mat.spec = mat.spec || {}; mat.spec.vi = opPayload.value; }
    else if (opPayload.field === 'unit') mat.unit = opPayload.value;
    else throw new Error(`Field ${opPayload.field} is not allowed to be updated by AI.`);

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
        syncLegacyBomFromMaterialDb(payload);
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
  } else {
    throw new Error(`Unsupported operationType: ${operationType}`);
  }
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
