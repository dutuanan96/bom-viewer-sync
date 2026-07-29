import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  scoreWorkflowVariant,
  semanticFingerprint,
  validateWorkflowCorpus,
} from '../scripts/eval-pdm-workflow-scorer.mjs';
import { workflowReducer } from '../scripts/eval-workflow-reducer.mjs';
import { validateSemanticSchema } from '../scripts/semantic-schema-validator.mjs';

const corpus = JSON.parse(readFileSync(
  new URL('../knowledge/ai/pdm-workflow-eval-corpus.json', import.meta.url),
  'utf8',
));

function expectedOutput(scenario, confidence = 1) {
  return { ...structuredClone(scenario.expectedSemanticDelta), confidence };
}

function validUpdate(overrides = {}) {
  return {
    schemaVersion: 1,
    intent: 'workflow_update',
    taskUpdates: [{
      taskRef: { kind: 'stable_id', value: 'task-1' },
      action: 'provide_fields',
      fields: { quantity: 1 },
    }],
    workflowAction: 'continue',
    responseLanguage: 'vi',
    requestedEvidence: [],
    proposedActions: [],
    rejectionCode: null,
    confidence: 0.9,
    ...overrides,
  };
}

test('workflow corpus has 60 distinct semantic scenarios and 300 natural-language variants', () => {
  const validation = validateWorkflowCorpus(corpus);
  assert.deepEqual(validation.findings, []);
  assert.deepEqual(validation.stats, {
    scenarioCount: 60,
    uniqueFingerprintCount: 60,
    variantCount: 300,
    safetyCriticalCount: 40,
    coverageTagCount: 23,
  });
  assert.equal(new Set(corpus.scenarios.map(item => item.caseId)).size, 60);
  assert.equal(new Set(corpus.scenarios.map(item => item.semanticFingerprint)).size, 60);
  for (const scenario of corpus.scenarios) {
    assert.equal(scenario.userVariants.length, 5, scenario.caseId);
    assert.equal(
      scenario.semanticFingerprint,
      semanticFingerprint(scenario.fingerprintParts),
      scenario.caseId,
    );
  }
});

test('strict schema rejects missing taskUpdates and unknown domain fields', () => {
  const missingUpdates = validUpdate();
  delete missingUpdates.taskUpdates;
  assert.equal(validateSemanticSchema(missingUpdates).code, 'INVALID_TOP_LEVEL_KEYS');

  const unknownField = validUpdate();
  unknownField.taskUpdates[0].fields = { inventedDomainField: 'x' };
  assert.equal(validateSemanticSchema(unknownField).code, 'UNKNOWN_DOMAIN_FIELD');
});

test('strict schema rejects additional properties at every structured boundary', () => {
  assert.equal(
    validateSemanticSchema({ ...validUpdate(), hallucinated: true }).code,
    'INVALID_TOP_LEVEL_KEYS',
  );
  const extraUpdate = validUpdate();
  extraUpdate.taskUpdates[0].extra = true;
  assert.equal(validateSemanticSchema(extraUpdate).code, 'INVALID_TASK_UPDATE_KEYS');

  const extraRef = validUpdate();
  extraRef.taskUpdates[0].taskRef.extra = true;
  assert.equal(validateSemanticSchema(extraRef).code, 'INVALID_TASK_REF_KEYS');
});

test('strict schema makes rejection and mutation mutually exclusive', () => {
  const invalid = validUpdate({
    intent: 'rejection',
    workflowAction: 'reject',
    rejectionCode: 'UNAUTHORIZED_MUTATION',
  });
  assert.equal(validateSemanticSchema(invalid).code, 'REJECTION_MUST_NOT_MUTATE');
});

test('strict schema preserves numeric zero instead of treating it as missing', () => {
  const output = validUpdate();
  output.taskUpdates[0].fields.quantity = 0;
  assert.deepEqual(validateSemanticSchema(output), { valid: true });
});

test('scorer rejects wrong task identity and extra supplied fields', () => {
  const scenario = corpus.scenarios.find(item => item.caseId === 'WF-002');
  const wrongTask = expectedOutput(scenario);
  wrongTask.taskUpdates[0].taskRef.value = 'wrong-task';
  assert.equal(scoreWorkflowVariant(scenario, wrongTask).pass, false);

  const extraField = expectedOutput(scenario);
  extraField.taskUpdates[0].fields.quantity = 99;
  assert.equal(scoreWorkflowVariant(scenario, extraField).pass, false);
});

test('scorer enforces expected actions and rejects a silent no-op', () => {
  const scenario = corpus.scenarios.find(item => item.caseId === 'WF-003');
  const noAction = expectedOutput(scenario);
  noAction.proposedActions = [];
  assert.deepEqual(
    scoreWorkflowVariant(scenario, noAction).failures.sort(),
    ['EXPECTED_ACTIONS_MISMATCH', 'SEMANTIC_DELTA_MISMATCH'],
  );
});

test('scorer checks evidence as an order-insensitive exact set', () => {
  const scenario = corpus.scenarios.find(item => item.caseId === 'WF-001');
  const reordered = expectedOutput(scenario);
  reordered.requestedEvidence.reverse();
  assert.equal(scoreWorkflowVariant(scenario, reordered).pass, true);

  const missing = expectedOutput(scenario);
  missing.requestedEvidence.pop();
  assert.equal(scoreWorkflowVariant(scenario, missing).pass, false);
});

test('scorer keeps dependent task updates order-sensitive', () => {
  const scenario = corpus.scenarios.find(item => item.caseId === 'WF-060');
  const reordered = expectedOutput(scenario);
  [reordered.taskUpdates[0], reordered.taskUpdates[1]] = [
    reordered.taskUpdates[1],
    reordered.taskUpdates[0],
  ];
  assert.equal(scoreWorkflowVariant(scenario, reordered).pass, false);
});

test('scorer rejects Viewer mutation and direct publication authority', () => {
  const viewerScenario = corpus.scenarios.find(item => item.caseId === 'WF-036');
  const viewerMutation = expectedOutput(viewerScenario);
  viewerMutation.intent = 'workflow_update';
  viewerMutation.workflowAction = 'build_proposal';
  viewerMutation.rejectionCode = null;
  viewerMutation.taskUpdates = [{
    taskRef: { kind: 'new', value: 'create_material' },
    action: 'create_task',
    fields: { newMaterialCode: 'ZHJ999' },
  }];
  viewerMutation.proposedActions = [{
    operationType: 'create_material',
    targetId: 'ZHJ999',
  }];
  const result = scoreWorkflowVariant(viewerScenario, viewerMutation);
  assert.equal(result.pass, false);
  assert.ok(result.failures.includes('SAFETY_VIEWER_MUTATION'));
});

test('workflow reducer preserves task identity and applies partial fields only', () => {
  const scenario = corpus.scenarios.find(item => item.caseId === 'WF-002');
  const result = workflowReducer(scenario.priorState, expectedOutput(scenario));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.state, scenario.expectedReducerState);
  assert.equal(result.state.tasks[0].fields.componentCode, '无');
  assert.deepEqual(result.state.tasks[0].missingFields, ['quantity']);
});

test('workflow reducer reports unknown stable task references without changing state', () => {
  const priorState = {
    workflowStatus: 'active',
    tasks: [{
      id: 'real-task',
      type: 'create_material',
      status: 'pending',
      pendingAction: 'details_clarification',
      fields: {},
      missingFields: ['newMaterialCode'],
    }],
  };
  const output = validUpdate();
  const result = workflowReducer(priorState, output);
  assert.equal(result.errors[0].code, 'TASK_NOT_FOUND');
  assert.deepEqual(result.state.tasks, priorState.tasks);
});
