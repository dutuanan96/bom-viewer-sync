import { currentProductRevision } from '../../domain/revisions.js';

const BILINGUAL_FIELDS = Object.freeze(['name', 'spec', 'material', 'color', 'attr']);

function normalizedText(value) {
  return String(value || '').normalize('NFKC').trim();
}

function pendingConfirmationTasks(workflowState) {
  return (workflowState?.tasks || []).filter(task => task?.pendingAction === 'confirmation');
}

export function deterministicWorkflowControl(query, workflowState) {
  const pending = pendingConfirmationTasks(workflowState);
  if (pending.length === 0) return null;
  const text = normalizedText(query);
  const confirms = /^(?:confirm|confirmed|yes|ok|x\u00e1c\s*nh\u1eadn|\u0111\u1ed3ng\s*\u00fd|\u786e\u8ba4|\u540c\u610f|\u597d\u7684)[.!\s]*$/iu.test(text)
    || /^(?:i\s+confirm\s+the\s+current\s+scope|t\u00f4i\s+x\u00e1c\s+nh\u1eadn\s+ph\u1ea1m\s+vi\s+hi\u1ec7n\s+t\u1ea1i|\u6211\u786e\u8ba4\u5f53\u524d\u8303\u56f4)[\s\S]*$/iu.test(text);
  if (confirms) {
    return {
      confidence: 1,
      delta: {
        confidence: 1,
        intent: 'workflow_update',
        workflowAction: 'build_proposal',
        responseLanguage: workflowState?.responseLanguage || 'zh',
        schemaVersion: 1,
        rejectionCode: null,
        taskUpdates: pending.map(task => ({
          taskRef: { kind: 'stable_id', value: task.id },
          action: 'confirm_task',
        })),
        proposedActions: [],
      },
    };
  }
  const cancels = /^(?:cancel|stop|abort|h\u1ee7y|huy|d\u1eebng|\u53d6\u6d88|\u505c\u6b62|\u653e\u5f03)(?:\s+(?:task|workflow|nhi\u1ec7m\s*v\u1ee5|\u4efb\u52a1))?[.!\s]*$/iu.test(text)
    || /^(?:cancel\s+the\s+current\s+workflow|h\u1ee7y\s+workflow\s+hi\u1ec7n\s+t\u1ea1i|\u53d6\u6d88\u5f53\u524d\u5de5\u4f5c\u6d41)[\s\S]*$/iu.test(text);
  if (cancels) {
    return {
      confidence: 1,
      delta: {
        confidence: 1,
        intent: 'cancel_workflow',
        workflowAction: 'cancel',
        responseLanguage: workflowState?.responseLanguage || 'zh',
        schemaVersion: 1,
        rejectionCode: null,
        taskUpdates: [],
        proposedActions: [],
      },
    };
  }
  return null;
}

function codeConvention(query) {
  const text = normalizedText(query);
  const dimensionMatches = [...text.matchAll(/(\d{2,5}(?:\.\d+)?)\s*[x\u00d7*]\s*(\d{2,5}(?:\.\d+)?)\s*(?:mm)?/giu)];
  const codeMatches = [...text.matchAll(/\b([A-Z]{1,8})(\d{4,})\b/gu)];
  for (const dimension of dimensionMatches) {
    const width = Number(dimension[1]);
    const height = Number(dimension[2]);
    if (!Number.isInteger(width) || !Number.isInteger(height)) continue;
    for (const code of codeMatches) {
      const digits = code[2];
      for (let split = 1; split < digits.length; split += 1) {
        const widthDigits = digits.slice(0, split);
        const heightDigits = digits.slice(split);
        if (Number(widthDigits) !== width || Number(heightDigits) !== height) continue;
        return Object.freeze({
          exampleCode: code[0],
          format(nextWidth, nextHeight) {
            if (!Number.isInteger(nextWidth) || !Number.isInteger(nextHeight)) return '';
            if (String(nextWidth).length > widthDigits.length || String(nextHeight).length > heightDigits.length) return '';
            return `${code[1]}${String(nextWidth).padStart(widthDigits.length, '0')}${String(nextHeight).padStart(heightDigits.length, '0')}`;
          },
        });
      }
    }
  }
  return null;
}

function materialDimension(group) {
  for (const value of [group?.material?.spec?.zh, group?.material?.spec?.vi]) {
    const match = normalizedText(value).match(/(\d{2,5}(?:\.\d+)?)\s*[x\u00d7*]\s*(\d{2,5}(?:\.\d+)?)\s*(?:mm)?/iu);
    if (!match) continue;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (Number.isInteger(width) && Number.isInteger(height)) return { width, height };
  }
  return null;
}

function sourceSet(group) {
  return new Set(Array.isArray(group?.sourceMaterialIds) ? group.sourceMaterialIds : []);
}

function isSubset(left, right) {
  for (const value of left) if (!right.has(value)) return false;
  return left.size > 0;
}

function logicalDuplicateGroups(audit) {
  const suspected = Array.isArray(audit?.suspectedDuplicateGroups) ? audit.suspectedDuplicateGroups : [];
  const suspectedSets = suspected.map(sourceSet);
  const exact = (Array.isArray(audit?.duplicateGroups) ? audit.duplicateGroups : [])
    .filter(group => !suspectedSets.some(set => isSubset(sourceSet(group), set)));
  return [...suspected, ...exact];
}

function mostFrequentBilingualValue(records, field, fallback = {}) {
  const counts = new Map();
  for (const record of records) {
    const value = record?.[field] || {};
    const key = JSON.stringify({ zh: normalizedText(value.zh), vi: normalizedText(value.vi) });
    const zh = normalizedText(value.zh);
    const vi = normalizedText(value.vi);
    const quality = (
      (zh ? 2 : 0)
      + (vi ? 2 : 0)
      + (/\p{Script=Han}/u.test(zh) ? 2 : 0)
      + (!/\p{Script=Han}/u.test(vi) ? 1 : 0)
      + (zh !== vi ? 1 : 0)
    );
    const current = counts.get(key) || { count: 0, quality, value };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((left, right) => (
    right.count - left.count
    || right.quality - left.quality
    || JSON.stringify(left.value).localeCompare(JSON.stringify(right.value))
  ))[0]?.value || fallback;
}

function normalizationTaskFields(record, differingFields, canonicalValues) {
  const fields = { materialCode: record.code || record.materialId };
  for (const field of differingFields) {
    const canonical = canonicalValues[field] || {};
    if (JSON.stringify(record?.[field] || {}) === JSON.stringify(canonical)) continue;
    if (field === 'name') {
      fields.nameZh = normalizedText(canonical.zh);
      fields.nameVi = normalizedText(canonical.vi);
    } else {
      fields[`${field}_zh`] = normalizedText(canonical.zh);
      fields[`${field}_vi`] = normalizedText(canonical.vi);
    }
  }
  return Object.keys(fields).length > 1 ? fields : null;
}

function canonicalMaterialTaskFields(canonicalValues) {
  const fields = {};
  const mappings = {
    name: ['nameZh', 'nameVi'],
    spec: ['spec_zh', 'spec_vi'],
    material: ['material_zh', 'material_vi'],
    color: ['color_zh', 'color_vi'],
    attr: ['attr_zh', 'attr_vi'],
  };
  for (const [field, [zhKey, viKey]] of Object.entries(mappings)) {
    const zh = normalizedText(canonicalValues?.[field]?.zh);
    const vi = normalizedText(canonicalValues?.[field]?.vi);
    if (zh) fields[zhKey] = zh;
    if (vi) fields[viKey] = vi;
  }
  return fields;
}

function nextDraftRevision(payload, productCode) {
  const record = payload?.productRevisions?.[productCode] || {};
  const current = normalizedText(currentProductRevision(payload, productCode) || record.currentRevision || payload?.bom?.[productCode]?.revision || 'V1');
  const existing = new Set([
    current,
    ...(Array.isArray(record.revisions) ? record.revisions.map(item => normalizedText(item?.revision)) : []),
  ]);
  const parts = current.split('.');
  let candidate;
  if (parts.length > 1 && /^\d+$/u.test(parts.at(-1))) {
    const base = parts.slice(0, -1).join('.');
    let suffix = Number(parts.at(-1)) + 1;
    candidate = `${base}.${suffix}`;
    while (existing.has(candidate)) candidate = `${base}.${++suffix}`;
  } else {
    let suffix = 1;
    candidate = `${current}.${suffix}`;
    while (existing.has(candidate)) candidate = `${current}.${++suffix}`;
  }
  return candidate;
}

function hasCurrentDraft(payload, productCode) {
  return String(payload?.productRevisions?.[productCode]?.currentRevisionInfo?.workflowState || '').toLowerCase() === 'draft';
}

export function buildDuplicateConsolidationWorkflow(query, audit, {
  responseLanguage = 'zh',
  snapshotPayload = null,
} = {}) {
  const convention = codeConvention(query);
  if (!convention || !audit || audit.truncated === true) return null;
  const auditedById = new Map((audit.auditedMaterials || []).map(record => [record.materialId, record]));
  const groups = logicalDuplicateGroups(audit);
  if (groups.length === 0) return null;
  const planned = [];

  for (const group of groups) {
    const dimension = materialDimension(group);
    const newMaterialCode = dimension ? convention.format(dimension.width, dimension.height) : '';
    const sourceMaterialIds = [...sourceSet(group)];
    if (!newMaterialCode || sourceMaterialIds.length < 2) return null;
    const records = sourceMaterialIds.map(id => auditedById.get(id)).filter(Boolean);
    if (records.length !== sourceMaterialIds.length) return null;
    const differingFields = Array.isArray(group.differingFields) ? group.differingFields.filter(field => BILINGUAL_FIELDS.includes(field)) : [];
    const canonicalValues = Object.fromEntries(BILINGUAL_FIELDS.map(field => [
      field,
      mostFrequentBilingualValue(records, field, group?.material?.[field] || {}),
    ]));
    const normalizations = records
      .map(record => normalizationTaskFields(record, differingFields, canonicalValues))
      .filter(Boolean);
    planned.push({
      group,
      sourceMaterialIds,
      records,
      newMaterialCode,
      differingFields,
      normalizations,
      canonicalValues,
    });
  }

  const taskUpdates = [];
  if (snapshotPayload) {
    const affectedProducts = new Set(planned.flatMap(item => (
      Array.isArray(item.group?.affectedProducts) ? item.group.affectedProducts : []
    )));
    const allSourceIds = new Set(planned.flatMap(item => item.sourceMaterialIds));
    for (const entry of snapshotPayload?.materialDb?.bomEntries || []) {
      if (entry?.parentType === 'product' && allSourceIds.has(entry.materialId)) {
        affectedProducts.add(entry.productCode || entry.parentId);
      }
    }
    for (const productCode of [...affectedProducts].filter(Boolean).sort()) {
      if (hasCurrentDraft(snapshotPayload, productCode)) continue;
      taskUpdates.push({
        taskRef: { kind: 'new', value: 'create_product_revision' },
        action: 'create_task',
        fields: {
          productCode,
          revision: nextDraftRevision(snapshotPayload, productCode),
          reason: normalizedText(query).slice(0, 500),
        },
      });
    }
  }
  for (const item of planned) {
    for (const fields of item.normalizations) {
      taskUpdates.push({ taskRef: { kind: 'new', value: 'update_material' }, action: 'create_task', fields });
    }
    taskUpdates.push({
      taskRef: { kind: 'new', value: 'consolidate_materials' },
      action: 'create_task',
      fields: {
        sourceMaterialIds: item.sourceMaterialIds,
        sourceMaterialCodes: item.records.map(record => record.code || record.materialId),
        sourceSpec: normalizedText(item.group?.material?.spec?.zh || item.group?.material?.spec?.vi),
        ...(item.differingFields.length > 0 ? { normalizationFields: item.differingFields } : {}),
        newMaterialCode: item.newMaterialCode,
        preserveMaterialCodes: true,
        ...canonicalMaterialTaskFields(item.canonicalValues),
      },
    });
  }

  return {
    confidence: 1,
    logicalGroupCount: planned.length,
    normalizationTaskCount: planned.reduce((count, item) => count + item.normalizations.length, 0),
    delta: {
      confidence: 1,
      intent: 'workflow_update',
      workflowAction: 'ask_clarification',
      responseLanguage,
      schemaVersion: 1,
      rejectionCode: null,
      taskUpdates,
      proposedActions: [],
    },
  };
}
