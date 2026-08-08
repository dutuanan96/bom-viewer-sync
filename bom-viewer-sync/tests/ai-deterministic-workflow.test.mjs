import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDuplicateConsolidationWorkflow,
  deterministicWorkflowControl,
} from '../src/features/ai-assistant/deterministic-workflow.js';

function material(id, code, width, viSpec = `s\u00f3ng \u0111\u01a1n ${width}x100mm`) {
  return {
    materialId: id,
    code,
    name: { zh: '\u7eb8\u5361', vi: 'gi\u1ea5y l\u00f3t' },
    spec: { zh: `\u5355\u74e6${width}x100mm`, vi: viSpec },
    material: { zh: '\u74e6\u695e\u7eb8\u5355\u74e6', vi: 'carton' },
    color: { zh: '\u7eb8\u8272', vi: 'm\u00e0u gi\u1ea5y' },
    attr: { zh: '\u5305\u6750', vi: 'bao b\u00ec' },
  };
}

function group(records, matchType, differingFields = []) {
  return {
    matchType,
    material: records[0],
    sourceMaterialIds: records.map(record => record.materialId),
    sourceMaterialCodes: records.map(record => record.code),
    differingFields,
  };
}

test('deterministic duplicate workflow merges overlapping exact and suspected groups once', () => {
  const exact1100 = [material('A', 'LGS031ZK', 1100), material('B', 'LGS032ZK', 1100)];
  const translated1100 = material('C', 'LGS433ZK', 1100, '\u5355\u74e61100x100mm');
  const group860 = [material('D', 'LGS131ZK', 860), material('E', 'LGS420ZK', 860, '\u5355\u74e6860x100mm')];
  const auditedMaterials = [...exact1100, translated1100, ...group860];
  const audit = {
    duplicateGroups: [group(exact1100, 'exact')],
    suspectedDuplicateGroups: [
      group([...exact1100, translated1100], 'translation_mismatch', ['spec']),
      group(group860, 'translation_mismatch', ['spec']),
    ],
    auditedMaterials,
    truncated: false,
  };

  const result = buildDuplicateConsolidationWorkflow(
    '\u8bf7\u5904\u7406\u4ee5\u4e0a\u6240\u6709\u91cd\u590d\u7ec4\uff0c1100x100mm \u4f7f\u7528 ZK1100100\uff0c\u5e76\u66ff\u6362\u5168\u90e8 BOM',
    audit,
  );

  assert.ok(result);
  assert.equal(result.logicalGroupCount, 2);
  const consolidationTasks = result.delta.taskUpdates.filter(update => update.taskRef.value === 'consolidate_materials');
  const normalizationTasks = result.delta.taskUpdates.filter(update => update.taskRef.value === 'update_material');
  assert.deepEqual(consolidationTasks.map(update => update.fields.newMaterialCode), ['ZK1100100', 'ZK0860100']);
  assert.deepEqual(consolidationTasks[0].fields.sourceMaterialIds, ['A', 'B', 'C']);
  assert.equal(normalizationTasks.length, 2);
  assert.deepEqual(normalizationTasks.map(update => update.fields.materialCode).sort(), ['LGS420ZK', 'LGS433ZK']);
  assert.equal(normalizationTasks[0].fields.spec_vi, 's\u00f3ng \u0111\u01a1n 1100x100mm');
});

test('deterministic duplicate workflow prepares drafts for released BOM products and preserves canonical fields', () => {
  const first = material('A', 'LGS031ZK', 1100, '\u5355\u74e61100x100mm');
  const second = material('B', 'LGS032ZK', 1100);
  const third = material('C', 'LGS033ZK', 1100);
  const audit = {
    duplicateGroups: [],
    suspectedDuplicateGroups: [{
      ...group([first, second, third], 'translation_mismatch', ['spec']),
      affectedProducts: ['LGS031', 'LGS032'],
    }],
    auditedMaterials: [first, second, third],
    truncated: false,
  };
  const snapshotPayload = {
    materialDb: {
      bomEntries: [
        { parentType: 'product', productCode: 'LGS031', materialId: 'A' },
        { parentType: 'product', productCode: 'LGS032', materialId: 'B' },
      ],
    },
    bom: {
      LGS031: { revision: 'V4' },
      LGS032: { revision: 'V2.1' },
    },
    productRevisions: {
      LGS031: { currentRevision: 'V4', currentRevisionInfo: { workflowState: 'released' }, revisions: [] },
      LGS032: { currentRevision: 'V2.1', currentRevisionInfo: { workflowState: 'draft' }, revisions: [] },
    },
  };

  const result = buildDuplicateConsolidationWorkflow(
    '\u8bf7\u5904\u7406\u4ee5\u4e0a\u6240\u6709\u91cd\u590d\u7ec4\uff0c1100x100mm \u4f7f\u7528 ZK1100100',
    audit,
    { snapshotPayload },
  );

  const revisionTasks = result.delta.taskUpdates.filter(update => update.taskRef.value === 'create_product_revision');
  const consolidation = result.delta.taskUpdates.find(update => update.taskRef.value === 'consolidate_materials');
  assert.deepEqual(revisionTasks.map(update => update.fields), [{
    productCode: 'LGS031',
    revision: 'V4.1',
    reason: '\u8bf7\u5904\u7406\u4ee5\u4e0a\u6240\u6709\u91cd\u590d\u7ec4,1100x100mm \u4f7f\u7528 ZK1100100',
  }]);
  assert.equal(consolidation.fields.spec_zh, '\u5355\u74e61100x100mm');
  assert.equal(consolidation.fields.spec_vi, 's\u00f3ng \u0111\u01a1n 1100x100mm');
  assert.equal(consolidation.fields.preserveMaterialCodes, true);
});

test('deterministic duplicate workflow prefers a complete bilingual value when suspected values are tied', () => {
  const untranslated = material('A', 'LGS111ZK', 785, '\u5355\u74e6785x100mm');
  const translated = material('B', 'LGS133ZK', 785);
  const result = buildDuplicateConsolidationWorkflow(
    '\u8bf7\u5904\u7406\u4ee5\u4e0a\u6240\u6709\u91cd\u590d\u7ec4\uff0c785x100mm \u4f7f\u7528 ZK0785100',
    {
      duplicateGroups: [],
      suspectedDuplicateGroups: [group([untranslated, translated], 'translation_mismatch', ['spec'])],
      auditedMaterials: [untranslated, translated],
      truncated: false,
    },
  );

  const normalization = result.delta.taskUpdates.find(update => update.taskRef.value === 'update_material');
  assert.equal(normalization.fields.materialCode, 'LGS111ZK');
  assert.equal(normalization.fields.spec_vi, 's\u00f3ng \u0111\u01a1n 785x100mm');
});

test('deterministic duplicate workflow derives a new revision from the canonical legacy revision', () => {
  const first = material('A', 'LGS133ZK', 785);
  const second = material('B', 'LGS111ZK', 785);
  const result = buildDuplicateConsolidationWorkflow(
    '\u8bf7\u5904\u7406\u4ee5\u4e0a\u6240\u6709\u91cd\u590d\u7ec4\uff0c785x100mm \u4f7f\u7528 ZK0785100',
    {
      duplicateGroups: [group([first, second], 'exact')],
      suspectedDuplicateGroups: [],
      auditedMaterials: [first, second],
      truncated: false,
    },
    {
      snapshotPayload: {
        bom: { LGS133: { code: 'LGS133', colors: ['black'], color_info: { black: { sku: 'LGS133-B' } } } },
        manuals: { LGS133: [{ name: 'LGS133-S-A4-V4.pdf' }] },
        materialDb: { bomEntries: [{ parentType: 'product', productCode: 'LGS133', materialId: 'A' }] },
        productRevisions: {},
      },
    },
  );

  const revision = result.delta.taskUpdates.find(update => update.taskRef.value === 'create_product_revision');
  assert.equal(revision.fields.revision, 'V4.1');
});

test('deterministic workflow control confirms every pending task without a model', () => {
  const workflowState = {
    workflowStatus: 'awaiting_clarification',
    responseLanguage: 'zh',
    tasks: [
      { id: 'task_1', pendingAction: 'confirmation' },
      { id: 'task_2', pendingAction: 'confirmation' },
    ],
  };

  const result = deterministicWorkflowControl(
    '\u6211\u786e\u8ba4\u5f53\u524d\u8303\u56f4\u3002\u8bf7\u521b\u5efa proposal\u3002',
    workflowState,
  );

  assert.equal(result.delta.workflowAction, 'build_proposal');
  assert.deepEqual(result.delta.taskUpdates.map(update => update.taskRef.value), ['task_1', 'task_2']);
  assert.ok(result.delta.taskUpdates.every(update => update.action === 'confirm_task'));
});

test('deterministic duplicate workflow refuses ambiguous or truncated code plans', () => {
  assert.equal(buildDuplicateConsolidationWorkflow('merge all duplicates', { truncated: false }), null);
  assert.equal(buildDuplicateConsolidationWorkflow('1100x100mm -> ZK1100100', { truncated: true }), null);
});
