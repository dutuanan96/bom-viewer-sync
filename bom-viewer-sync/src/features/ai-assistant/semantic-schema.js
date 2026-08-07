const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const PRODUCT_CODE_PATTERN = /^LGS\d{3,4}$/iu;

export const WORKFLOW_INTENTS = Object.freeze([
  'workflow_update',
  'clarification',
  'rejection',
  'cancel_workflow',
  'start_new_request',
]);

export const TASK_ACTIONS = Object.freeze([
  'create_task',
  'provide_fields',
  'correct_fields',
  'confirm_task',
  'reject_task',
  'cancel_task',
  'set_scope',
]);

export const WORKFLOW_ACTIONS = Object.freeze([
  'continue',
  'ask_clarification',
  'build_proposal',
  'reject',
  'cancel',
  'restart',
]);

export const RESPONSE_LANGUAGES = Object.freeze(['vi', 'zh']);

export const TASK_TYPES = Object.freeze([
  'create_product',
  'update_product',
  'create_product_revision',
  'release_product_revision',
  'withdraw_product_revision',
  'create_material',
  'update_material',
  'update_material_field',
  'delete_material',
  'add_bom_item',
  'update_bom_item',
  'update_bom_quantity',
  'replace_bom_item',
  'remove_bom_item',
  'add_material_child',
  'update_material_child_quantity',
  'remove_material_child',
  'delete_material_structure',
  'workflow_scope',
]);

export const PROPOSAL_OPERATIONS = Object.freeze(TASK_TYPES.filter(type => type !== 'workflow_scope'));

export const REJECTION_CODES = Object.freeze([
  'AMBIGUOUS_TARGET',
  'COLOR_SCOPE_REQUIRED',
  'DUPLICATE_MATERIAL_CODE',
  'EVIDENCE_REQUIRED',
  'HISTORICAL_REVISION_IMMUTABLE',
  'INVALID_QUANTITY',
  'MATERIAL_CODE_REQUIRED',
  'MATERIAL_ID_NOT_USER_CODE',
  'MATERIAL_SHARED_OUTSIDE_SCOPE',
  'OPERATION_NOT_ALLOWED',
  'PRODUCT_SCOPE_REQUIRED',
  'PROVIDER_OUTPUT_INVALID',
  'RELEASE_REASON_REQUIRED',
  'REVISION_WITHDRAWAL_REQUIRED',
  'STALE_CONTEXT',
  'STRUCTURE_CYCLE',
  'TASK_NOT_FOUND',
  'UNAUTHORIZED_MUTATION',
  'UNKNOWN_COLOR',
  'UNKNOWN_MATERIAL',
]);

const FIELD_RULES = Object.freeze({
  allColors: value => typeof value === 'boolean',
  attribute: nonEmptyString,
  code: nonEmptyString,
  color: nonEmptyString,
  componentCode: nonEmptyString,
  field: nonEmptyString,
  material: nonEmptyString,
  materialCode: identifier,
  materialColor: nonEmptyString,
  materialName: nonEmptyString,
  name: nonEmptyString,
  nameVi: nonEmptyString,
  nameZh: nonEmptyString,
  newMaterialCode: identifier,
  operationTypes: stringArray,
  preserveMaterialCodes: value => typeof value === 'boolean',
  productCode: value => typeof value === 'string' && PRODUCT_CODE_PATTERN.test(value),
  productColors: stringArray,
  quantity: value => typeof value === 'number' && Number.isFinite(value) && value >= 0,
  reason: nonEmptyString,
  revision: nonEmptyString,
  scope: nonEmptyString,
  sourceMaterialCode: identifier,
  spec: nonEmptyString,
  targetId: nonEmptyString,
  targetMaterialCode: identifier,
  targetSpec: nonEmptyString,
  unit: nonEmptyString,
  value: value => value !== undefined,
  withdrawReleasedRevision: value => typeof value === 'boolean',
});

const EVIDENCE_ARGUMENT_RULES = Object.freeze({
  compare_boms: {
    required: ['productCode1', 'productCode2'],
    optional: ['color1', 'color2'],
  },
  get_bom: {
    required: ['productCode'],
    optional: ['color'],
  },
  get_material: {
    required: ['materialCode'],
    optional: [],
  },
  get_revision_history: {
    required: ['productCode'],
    optional: [],
  },
  search_pdm: {
    required: ['query'],
    optional: ['productCode'],
  },
  where_used: {
    required: ['materialCode'],
    optional: [],
  },
});

const REQUIRED_TOP_LEVEL_KEYS = Object.freeze([
  'intent',
  'workflowAction'
]);

const OPTIONAL_TOP_LEVEL_KEYS = Object.freeze([
  'proposedActions',
  'rejectionCode',
  'requestedEvidence',
  'confidence',
  'responseLanguage',
  'schemaVersion',
  'taskUpdates',
  'fields',
]);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
}

function identifier(value) {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function stringArray(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= 50
    && value.every(nonEmptyString);
}

function exactKeys(value, required, optional = []) {
  const keys = Object.keys(value).sort();
  const allowed = [...required, ...optional].sort();
  if (keys.some(key => !allowed.includes(key))) return false;
  return required.every(key => Object.hasOwn(value, key));
}

function invalid(code, path = '') {
  return { valid: false, code, path };
}

function validateFields(fields, path) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return invalid('INVALID_FIELDS_OBJECT', path);
  }
  const keys = Object.keys(fields);
  if (keys.length === 0) return invalid('EMPTY_FIELDS_OBJECT', path);
  for (const key of keys) {
    const rule = FIELD_RULES[key];
    if (!rule) return invalid('UNKNOWN_DOMAIN_FIELD', `${path}.${key}`);
    if (!rule(fields[key])) return invalid('INVALID_DOMAIN_FIELD_VALUE', `${path}.${key}`);
  }
  return { valid: true };
}

function validateTaskRef(taskRef, path) {
  if (!taskRef || typeof taskRef !== 'object' || Array.isArray(taskRef)) {
    return invalid('INVALID_TASK_REF', path);
  }
  if (!exactKeys(taskRef, ['kind', 'value'])) {
    return invalid('INVALID_TASK_REF_KEYS', path);
  }
  if (!['current', 'stable_id', 'ordinal', 'new'].includes(taskRef.kind)) {
    return invalid('INVALID_TASK_REF_KIND', `${path}.kind`);
  }
  if (typeof taskRef.value !== 'string') {
    return invalid('INVALID_TASK_REF_VALUE_TYPE', `${path}.value`);
  }
  if (taskRef.kind === 'current' && taskRef.value !== '') {
    return invalid('CURRENT_TASK_REF_MUST_BE_EMPTY', `${path}.value`);
  }
  if (taskRef.kind === 'stable_id' && !identifier(taskRef.value)) {
    return invalid('INVALID_STABLE_TASK_ID', `${path}.value`);
  }
  if (taskRef.kind === 'ordinal' && !/^[1-9]\d*$/u.test(taskRef.value)) {
    return invalid('INVALID_TASK_ORDINAL', `${path}.value`);
  }
  if (taskRef.kind === 'new' && !TASK_TYPES.includes(taskRef.value)) {
    // Lenient: if model appended extra suffix (e.g. "update_material_LGS111ZK"),
    // try to strip the suffix and find a valid TASK_TYPE prefix.
    const matchedType = TASK_TYPES.find(t => taskRef.value.startsWith(t + '_') || taskRef.value.startsWith(t + '-'));
    if (matchedType) {
      taskRef.value = matchedType;
    } else {
      return invalid('INVALID_NEW_TASK_TYPE', `${path}.value`);
    }
  }
  return { valid: true };
}

function validateTaskUpdate(update, index) {
  const path = `taskUpdates[${index}]`;
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    return invalid('INVALID_TASK_UPDATE_OBJECT', path);
  }
  if (!TASK_ACTIONS.includes(update.action)) {
    return invalid('INVALID_TASK_ACTION', `${path}.action`);
  }
  const needsFields = ['create_task', 'provide_fields', 'correct_fields', 'set_scope']
    .includes(update.action);
  const required = needsFields ? ['action', 'fields', 'taskRef'] : ['action', 'taskRef'];
  if (!exactKeys(update, required)) return invalid('INVALID_TASK_UPDATE_KEYS', path);
  const refValidation = validateTaskRef(update.taskRef, `${path}.taskRef`);
  if (!refValidation.valid) return refValidation;
  if (update.action === 'create_task' && update.taskRef.kind !== 'new') {
    return invalid('CREATE_TASK_REQUIRES_NEW_REF', `${path}.taskRef.kind`);
  }
  if (update.action === 'set_scope' && update.taskRef.kind === 'new' && update.taskRef.value !== 'workflow_scope') {
    return invalid('SET_SCOPE_REQUIRES_WORKFLOW_SCOPE', `${path}.taskRef.value`);
  }
  if (needsFields) {
    const fieldsValidation = validateFields(update.fields, `${path}.fields`);
    if (!fieldsValidation.valid) return fieldsValidation;
  }
  return { valid: true };
}

function validateEvidenceRequest(request, index) {
  const path = `requestedEvidence[${index}]`;
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return invalid('INVALID_EVIDENCE_REQUEST', path);
  }
  if (!exactKeys(request, ['args', 'tool'])) return invalid('INVALID_EVIDENCE_REQUEST_KEYS', path);
  const rules = EVIDENCE_ARGUMENT_RULES[request.tool];
  if (!rules) return invalid('INVALID_EVIDENCE_TOOL', `${path}.tool`);
  if (!request.args || typeof request.args !== 'object' || Array.isArray(request.args)) {
    return invalid('INVALID_EVIDENCE_ARGS', `${path}.args`);
  }
  if (!exactKeys(request.args, rules.required, rules.optional)) {
    return invalid('INVALID_EVIDENCE_ARG_KEYS', `${path}.args`);
  }
  for (const [key, value] of Object.entries(request.args)) {
    if (key.startsWith('productCode') && !PRODUCT_CODE_PATTERN.test(String(value))) {
      return invalid('INVALID_EVIDENCE_PRODUCT_CODE', `${path}.args.${key}`);
    }
    if (!key.startsWith('productCode') && !nonEmptyString(value)) {
      return invalid('INVALID_EVIDENCE_ARG_VALUE', `${path}.args.${key}`);
    }
  }
  return { valid: true };
}

function validateProposedAction(action, index) {
  const path = `proposedActions[${index}]`;
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return invalid('INVALID_PROPOSED_ACTION', path);
  }
  if (!exactKeys(action, ['operationType', 'targetId'])) {
    return invalid('INVALID_PROPOSED_ACTION_KEYS', path);
  }
  if (!PROPOSAL_OPERATIONS.includes(action.operationType)) {
    return invalid('INVALID_PROPOSAL_OPERATION', `${path}.operationType`);
  }
  if (!nonEmptyString(action.targetId)) {
    return invalid('INVALID_PROPOSAL_TARGET', `${path}.targetId`);
  }
  return { valid: true };
}

export function validateSemanticSchema(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return invalid('INVALID_JSON_OBJECT', 'root');
  }

  if (!exactKeys(json, REQUIRED_TOP_LEVEL_KEYS, OPTIONAL_TOP_LEVEL_KEYS)) {
    return invalid('MISSING_REQUIRED_KEYS', 'root');
  }
  if (json.schemaVersion !== undefined && json.schemaVersion !== 1) return invalid('INVALID_SCHEMA_VERSION', 'schemaVersion');
  if (!WORKFLOW_INTENTS.includes(json.intent)) return invalid('INVALID_INTENT', 'intent');
  if (!WORKFLOW_ACTIONS.includes(json.workflowAction)) {
    return invalid('INVALID_WORKFLOW_ACTION', 'workflowAction');
  }
  if (json.responseLanguage !== undefined && !RESPONSE_LANGUAGES.includes(json.responseLanguage)) {
    return invalid('INVALID_RESPONSE_LANGUAGE', 'responseLanguage');
  }
  if (
    json.confidence !== undefined &&
    (typeof json.confidence !== 'number'
    || !Number.isFinite(json.confidence)
    || json.confidence < 0
    || json.confidence > 1)
  ) {
    return invalid('INVALID_CONFIDENCE', 'confidence');
  }
  if (json.taskUpdates !== undefined && !Array.isArray(json.taskUpdates)) return invalid('INVALID_TASK_UPDATES_ARRAY', 'taskUpdates');
  
  if (json.requestedEvidence && !Array.isArray(json.requestedEvidence)) {
    return invalid('INVALID_REQUESTED_EVIDENCE_ARRAY', 'requestedEvidence');
  }
  if (json.proposedActions && !Array.isArray(json.proposedActions)) {
    return invalid('INVALID_PROPOSED_ACTIONS_ARRAY', 'proposedActions');
  }

  if (json.taskUpdates !== undefined) {
    for (let index = 0; index < json.taskUpdates.length; index += 1) {
      const validation = validateTaskUpdate(json.taskUpdates[index], index);
      if (!validation.valid) return validation;
    }
  }
  if (json.requestedEvidence) {
    for (let index = 0; index < json.requestedEvidence.length; index += 1) {
      const validation = validateEvidenceRequest(json.requestedEvidence[index], index);
      if (!validation.valid) return validation;
    }
  }
  if (json.proposedActions) {
    for (let index = 0; index < json.proposedActions.length; index += 1) {
      const validation = validateProposedAction(json.proposedActions[index], index);
      if (!validation.valid) return validation;
    }
  }

  const isRejection = json.intent === 'rejection';
  if (isRejection) {
    if (!REJECTION_CODES.includes(json.rejectionCode)) {
      return invalid('INVALID_REJECTION_CODE', 'rejectionCode');
    }
    if (
      json.workflowAction !== 'reject'
      || (json.taskUpdates && json.taskUpdates.length > 0)
      || (json.proposedActions && json.proposedActions.length > 0)
    ) {
      return invalid('REJECTION_MUST_NOT_MUTATE');
    }
  } else if (json.rejectionCode !== null && json.rejectionCode !== undefined) {
    return invalid('NON_REJECTION_HAS_REJECTION_CODE', 'rejectionCode');
  }

  if (json.intent === 'cancel_workflow' && json.workflowAction !== 'cancel') {
    return invalid('CANCEL_INTENT_ACTION_MISMATCH');
  }
  if (json.intent === 'start_new_request' && json.workflowAction !== 'restart') {
    return invalid('RESTART_INTENT_ACTION_MISMATCH');
  }
  if (
    json.intent === 'workflow_update'
    && (!json.taskUpdates || json.taskUpdates.length === 0)
    && (!json.proposedActions || json.proposedActions.length === 0)
  ) {
    return invalid('EMPTY_WORKFLOW_UPDATE');
  }
  if (json.intent === 'clarification' && json.workflowAction !== 'ask_clarification') {
    return invalid('CLARIFICATION_ACTION_MISMATCH');
  }
  return { valid: true };
}

export function semanticSchemaPrompt() {
  return [
    'You are a strict semantic interpreter for a governed PDM workflow. Extract user intent into a precise JSON structure.',
    'Return exactly one JSON object. Do not return markdown or hidden reasoning.',
    'Required keys: intent, workflowAction. Optional: confidence, responseLanguage, schemaVersion, taskUpdates, rejectionCode, requestedEvidence, proposedActions.',
    `intent: ${WORKFLOW_INTENTS.join(' | ')}.`,
    `workflowAction: ${WORKFLOW_ACTIONS.join(' | ')}.`,
    'taskUpdates must be an array of objects: { taskRef: { kind: "current" | "stable_id" | "ordinal" | "new", value: string }, action: string, fields?: object }.',
    `If taskRef.kind is "new", value must be one of: ${TASK_TYPES.join(', ')}.`,
    `If taskRef.kind is "current", value must be "".`,
    `task action must be one of: ${TASK_ACTIONS.join(', ')}.`,
    `When action is "create_task", taskRef.kind MUST be "new".`,
    `fields object can ONLY contain these keys: ${Object.keys(FIELD_RULES).join(', ')}. Do not add other keys.`,
    `materialCode, sourceMaterialCode, targetMaterialCode MUST be valid identifiers (e.g. "LGS334PM001"), NOT Vietnamese/Chinese names. If the user provides a name, omit the code field.`,
    `requestedEvidence must be an array of objects: { tool: string, args: object }. Do NOT use "input".`,
    `allowed requestedEvidence tools: ${Object.keys(EVIDENCE_ARGUMENT_RULES).join(', ')}.`,
    `proposedActions must be an array of objects: { operationType: string, targetId: string }. Do NOT use "parameters" or "payload".`,
    `proposedActions operationType must be one of: ${PROPOSAL_OPERATIONS.join(', ')}.`,
    `rejectionCode must be null or one of: ${REJECTION_CODES.join(', ')}.`,
    `If intent is NOT "rejection", rejectionCode MUST be null.`,
    `If intent is "clarification", workflowAction MUST be "ask_clarification".`,
    `If intent is "start_new_request", workflowAction MUST be "restart".`,
    'schemaVersion MUST be 1.',
    'A rejection must use intent="rejection", workflowAction="reject", and empty taskUpdates/proposedActions.',
    'Viewer requests must never propose mutations. Never propose GitHub save or arbitrary code.',
    '',
    'CRITICAL BEHAVIORAL RULES:',
    '1. Compound requests: Create a separate task for EACH action requested by the user. Do not drop tasks.',
    '2. State continuity: Preserve every pending task from priorState unless explicitly cancelled.',
    '3. Dominant language: responseLanguage MUST match the dominant language of the user input (vi or zh).',
    '4. Color semantics: "productColors" is for the product variant scope. "materialColor" is the color property of a specific material.',
    '5. Multi-color scope: If the user says "all colors" or "cả ba màu", you MUST set "allColors": true in a workflow_scope task.',
    '6. Search-before-create: Before creating a new material, request evidence using search_pdm to verify it doesn\'t exist.',
    '7. Duplicate codes: If a user specifies an existing code with conflicting identity, reject with DUPLICATE_MATERIAL_CODE.',
    '8. Shared materials: If editing a shared material outside its scope, reject with MATERIAL_SHARED_OUTSIDE_SCOPE.',
    '9. Revision immutability: Do not mutate historical/released revisions directly. Reject if attempted.',
    '10. Clarification: If details are missing or ambiguous (e.g. missing identifiers), use intent "clarification" and request evidence.',
    '11. Proposal: When all task fields are gathered and evidence supports it, propose the action in proposedActions.',
    '',
    'EXAMPLE:',
    'User: "Đổi 纸护角 và 泡沫 của LGS334, đồng thời thêm 750380ZK 纸卡."',
    '{"confidence":1,"intent":"workflow_update","workflowAction":"ask_clarification","responseLanguage":"vi","schemaVersion":1,"rejectionCode":null,"taskUpdates":[{"taskRef":{"kind":"new","value":"replace_bom_item"},"action":"create_task","fields":{"productCode":"LGS334","spec":"纸护角"}},{"taskRef":{"kind":"new","value":"replace_bom_item"},"action":"create_task","fields":{"productCode":"LGS334","spec":"泡沫"}},{"taskRef":{"kind":"new","value":"add_bom_item"},"action":"create_task","fields":{"productCode":"LGS334","materialCode":"750380ZK","spec":"纸卡"}}],"requestedEvidence":[{"tool":"get_bom","args":{"productCode":"LGS334"}},{"tool":"search_pdm","args":{"query":"750380ZK"}}],"proposedActions":[]}',
  ].join('\n');
}
