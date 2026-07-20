// src/features/ai-assistant/proposal-engine.js
import { ERROR_CODES, validateProposal } from './contracts.js';
import { describePayloadChanges } from '../notifications.js';
import { syncLegacyBomFromMaterialDb } from '../../domain/relationships.js';
function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function staleError(message) {
  const error = new Error(message);
  error.code = ERROR_CODES.AI_STALE_SOURCE;
  return error;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function validateProposalContext(snapshot, proposal) {
  validateProposal(proposal);

  if (!snapshot.isAdmin) {
    const err = new Error('Proposals can only be made in Admin mode.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }
  if (snapshot.dirty) {
    const err = new Error('Cannot propose changes while there are unsaved human edits. Please save or discard your changes first.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }

  const canEdit = snapshot.canEditRevision;
  if (!canEdit) {
    const err = new Error('Proposals can only be applied to the current Draft revision. AI cannot modify released or historical revisions.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }
  if (
    proposal.operationType === 'update_bom_quantity' &&
    (
      snapshot.selection?.productCode !== proposal.targetId ||
      snapshot.selection?.color !== proposal.payload.color
    )
  ) {
    const err = new Error('BOM proposal target must match the selected product and color.');
    err.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw err;
  }
}

/**
 * Apply a proposal to a payload object (mutates the payload).
 * Used for both dry-run (on a clone) and actual apply.
 */
export function applyProposalToPayload(payload, proposal) {
  validateProposal(proposal);
  const { operationType, targetId, payload: opPayload } = proposal;

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
    // targetId is productId
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

    // Legacy fallback for pre-cutover payloads without canonical BOM entries.
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

/**
 * Compute the exact differences a proposal would make to the snapshot's payload.
 * Returns an array of change objects using the same logic as human edits.
 */
export function computeProposalDiff(snapshot, proposal) {
  validateProposalContext(snapshot, proposal);

  const clonedPayload = clone(snapshot.payload);
  applyProposalToPayload(clonedPayload, proposal);

  return describePayloadChanges(snapshot.payload, clonedPayload);
}

export function createProposalPreview(snapshot, proposal) {
  const sourceCommit = snapshot?.sourceMetadata?.commitSha;
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit || '')) {
    throw staleError('Proposal preview requires an exact source commit');
  }
  const changes = computeProposalDiff(snapshot, proposal);
  if (changes.length === 0) {
    const error = new Error('Proposal produces no changes');
    error.code = ERROR_CODES.AI_POLICY_BLOCKED;
    throw error;
  }
  return {
    schemaVersion: 1,
    proposal: clone(proposal),
    changes: clone(changes),
    binding: {
      sourceCommit,
      selection: stableJson(snapshot.selection || {}),
      payload: stableJson(snapshot.payload || {}),
    },
  };
}

export function applyApprovedProposal(snapshot, preview) {
  if (!preview || preview.schemaVersion !== 1 || !preview.binding || !Array.isArray(preview.changes)) {
    throw staleError('Invalid or missing proposal approval state');
  }
  validateProposalContext(snapshot, preview.proposal);
  if (snapshot.sourceMetadata?.commitSha !== preview.binding.sourceCommit) {
    throw staleError('Proposal is stale because the source commit changed');
  }
  if (stableJson(snapshot.selection || {}) !== preview.binding.selection) {
    throw staleError('Proposal is stale because the selection changed');
  }
  if (stableJson(snapshot.payload || {}) !== preview.binding.payload) {
    throw staleError('Proposal is stale because the payload changed');
  }

  const changes = computeProposalDiff(snapshot, preview.proposal);
  if (stableJson(changes) !== stableJson(preview.changes)) {
    throw staleError('Proposal is stale because the exact diff changed');
  }
  const payload = clone(snapshot.payload);
  applyProposalToPayload(payload, preview.proposal);
  return { payload, changes };
}
