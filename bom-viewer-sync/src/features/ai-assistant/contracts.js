// AI Contracts — versioned, deterministic validation for all AI interactions.
// All validators use stable error codes from ERROR_CODES.
// No mutation of data; all checks are fail-closed.

export const ERROR_CODES = Object.freeze({
  AI_MODEL_INCOMPATIBLE: 'AI_MODEL_INCOMPATIBLE',
  AI_POLICY_BLOCKED: 'AI_POLICY_BLOCKED',
  AI_TOOL_LIMIT: 'AI_TOOL_LIMIT',
  AI_STALE_SOURCE: 'AI_STALE_SOURCE',
});

export const ALLOWED_TOOLS = Object.freeze(new Set([
  'search_products',
  'get_product',
  'resolve_sku',
  'get_bom',
  'compare_boms',
  'get_material',
  'where_used',
  'get_revision_history',
  'audit_product_data',
  'apply_mutation',
  'get_marketplace_insights',
  'store_memory',
  'retrieve_memory',
  'compare_revisions',
  'search_pdm',
  'list_recent_changes',
  'inspect_pdm_schema',
  'get_pdm_help',
  'analyze_pdm'
]));

const ALLOWED_PROPOSAL_OPERATIONS = Object.freeze(new Set([
  'update_material_field',
  'update_bom_quantity',
]));

const ALLOWED_MATERIAL_FIELDS = Object.freeze(new Set(['name_zh', 'name_vi', 'spec', 'spec_vi', 'unit']));

// Max string length anywhere in tool arguments (prevents prompt injection via long strings)
const MAX_ARG_STRING_LEN = 1000;
// Max array length anywhere in tool arguments
const MAX_ARG_ARRAY_LEN = 100;
// Max total serialized argument length for string-type arguments
const MAX_ARG_TOTAL_LEN = 5000;
// Max answer text
const MAX_ANSWER_TEXT_LEN = 5000;
const PRODUCT_ID_PATTERN = /^LGS\d{3,4}$/i;

const TOOL_ARGUMENT_RULES = Object.freeze({
  search_products: { required: ['query'], allowed: ['query'] },
  get_product: { required: ['productId'], allowed: ['productId'] },
  resolve_sku: { required: ['alias'], allowed: ['alias'] },
  get_bom: { required: ['productId'], allowed: ['productId', 'color'] },
  compare_boms: {
    required: ['productId1', 'productId2'],
    allowed: ['productId1', 'color1', 'productId2', 'color2']
  },
  get_material: { required: ['materialId'], allowed: ['materialId'] },
  where_used: { required: ['materialId'], allowed: ['materialId'] },
  get_revision_history: { required: ['productId'], allowed: ['productId'] },
  audit_product_data: { required: ['productId'], allowed: ['productId'] },
  apply_mutation: {
    required: ['operationType', 'targetId', 'payload'],
    allowed: ['operationType', 'targetId', 'payload']
  },
  get_marketplace_insights: { required: ['productId'], allowed: ['productId'] },
  store_memory: { required: ['key', 'value'], allowed: ['key', 'value'] },
  retrieve_memory: { required: ['key'], allowed: ['key'] },
  compare_revisions: {
    required: ['productId', 'revision1', 'revision2'],
    allowed: ['productId', 'revision1', 'revision2']
  },
  search_pdm: { required: ['query'], allowed: ['query', 'productId', 'materialId'] },
  list_recent_changes: { required: [], allowed: [] },
  inspect_pdm_schema: { required: [], allowed: [] },
  get_pdm_help: { required: [], allowed: ['topic'] },
  analyze_pdm: { required: ['query'], allowed: ['query', 'scope', 'countMode', 'componentFamily', 'dimensionFilter'] }
});

function policyError(message) {
  const err = new Error(message);
  err.code = ERROR_CODES.AI_POLICY_BLOCKED;
  return err;
}

function limitError(message) {
  const err = new Error(message);
  err.code = ERROR_CODES.AI_TOOL_LIMIT;
  return err;
}

/**
 * Recursively check all string/array values in an object argument for oversize.
 * Throws with AI_TOOL_LIMIT if any string > MAX_ARG_STRING_LEN or array > MAX_ARG_ARRAY_LEN.
 */
function checkArgsDepth(value, path) {
  if (typeof value === 'string') {
    if (value.length > MAX_ARG_STRING_LEN) {
      throw limitError(`oversized argument string at ${path}: length ${value.length} exceeds ${MAX_ARG_STRING_LEN}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARG_ARRAY_LEN) {
      throw limitError(`oversized argument array at ${path}: length ${value.length} exceeds ${MAX_ARG_ARRAY_LEN}`);
    }
    value.forEach((item, i) => checkArgsDepth(item, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      checkArgsDepth(v, `${path}.${k}`);
    }
  }
}

function validateToolArguments(toolName, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw policyError(`${toolName} arguments must be an object`);
  }

  const rules = TOOL_ARGUMENT_RULES[toolName];
  for (const key of Object.keys(args)) {
    if (!rules.allowed.includes(key)) {
      throw policyError(`unexpected argument field for ${toolName}: ${key}`);
    }
  }

  for (const field of rules.required) {
    if (!(field in args)) {
      throw policyError(`${toolName}.${field} is required`);
    }
  }

  for (const field of rules.allowed) {
    if (!(field in args) || field === 'payload') continue;
    if (typeof args[field] !== 'string') throw policyError(`${toolName}.${field} must be a string`);
    if (args[field].trim().length === 0) throw policyError(`${toolName}.${field} must not be empty`);
  }

  if ('payload' in args && (!args.payload || typeof args.payload !== 'object' || Array.isArray(args.payload))) {
    throw policyError(`${toolName}.payload must be an object`);
  }

  for (const field of ['productId', 'productId1', 'productId2']) {
    if (field in args && !PRODUCT_ID_PATTERN.test(args[field])) {
      throw policyError(`${toolName}.${field} must match LGS followed by 3 or 4 digits`);
    }
  }

  if (toolName === 'search_pdm' && 'materialId' in args && !('productId' in args)) {
    throw policyError('search_pdm.materialId requires productId scope');
  }
}

export function validateToolCall(call) {
  if (!call || typeof call !== 'object' || Array.isArray(call)) {
    throw new Error('missing tool name');
  }
  if (!call.name || typeof call.name !== 'string') {
    throw new Error('missing tool name');
  }
  if (!ALLOWED_TOOLS.has(call.name)) {
    throw policyError(`unknown tool: ${call.name}`);
  }

  const keys = Object.keys(call);
  if (keys.some(k => k !== 'name' && k !== 'arguments')) {
    throw policyError('extra fields not allowed in tool call');
  }

  if ('arguments' in call) {
    const args = call.arguments;
    // String-type arguments: total length limit
    if (typeof args === 'string') {
      if (args.length > MAX_ARG_TOTAL_LEN) {
        throw limitError(`oversized arguments: length ${args.length} exceeds ${MAX_ARG_TOTAL_LEN}`);
      }
    } else if (args !== null && typeof args === 'object') {
      // Object-type arguments: deep check for nested oversized strings/arrays
      checkArgsDepth(args, 'arguments');
    }
  }

  validateToolArguments(call.name, call.arguments);

  return call;
}

export function validateEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error('missing id');
  }
  if (!evidence.id) {
    throw new Error('missing id');
  }
  if (!evidence.sourceType) {
    throw new Error('missing sourceType');
  }
  if (!evidence.sourceCommit) {
    throw new Error('missing sourceCommit');
  }
  if (!/^[0-9a-f]{40}$/i.test(evidence.sourceCommit)) {
    throw new Error('invalid sourceCommit: must be a 40-character hex SHA');
  }
  if (!evidence.sourcePath) {
    throw new Error('missing sourcePath');
  }
  if (!evidence.capturedAt) {
    throw new Error('missing capturedAt');
  }
  return evidence;
}

export function validateAnswer(answer) {
  if (!answer || typeof answer.text !== 'string') {
    throw new Error('missing text');
  }
  if (answer.text.length > MAX_ANSWER_TEXT_LEN) {
    throw limitError(`oversized answer text: length ${answer.text.length} exceeds ${MAX_ANSWER_TEXT_LEN}`);
  }
  return answer;
}

export function validateSkill(skill) {
  if (!skill || typeof skill !== 'object' || Array.isArray(skill)) {
    throw new Error('missing schemaVersion');
  }
  if (!skill.schemaVersion) {
    throw new Error('missing schemaVersion');
  }
  if (!skill.packVersion) {
    throw new Error('missing packVersion');
  }
  if (!skill.updatedAt) {
    throw new Error('missing updatedAt');
  }
  return skill;
}

const VALID_MEMORY_STATUSES = Object.freeze(new Set(['candidate', 'confirmed', 'rejected', 'stale']));

export function validateMemory(memory) {
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) {
    throw new Error('missing status');
  }
  if (!memory.status) {
    throw new Error('missing status');
  }
  if (!VALID_MEMORY_STATUSES.has(memory.status)) {
    throw new Error(`invalid status: "${memory.status}"; must be one of ${[...VALID_MEMORY_STATUSES].join(', ')}`);
  }
  if (!memory.provenance) {
    throw new Error('missing provenance');
  }
  return memory;
}

export function validateAudit(audit) {
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    throw new Error('missing audit data');
  }
  if (!audit.productId) {
    throw new Error('missing productId');
  }
  return audit;
}

export function validateMutation(mutation) {
  if (!mutation || typeof mutation !== 'object' || Array.isArray(mutation)) {
    throw new Error('missing mutation data');
  }
  if (!mutation.targetId) {
    throw new Error('missing targetId');
  }
  if (!mutation.operationType) {
    throw new Error('missing operationType');
  }
  if (!ALLOWED_PROPOSAL_OPERATIONS.has(mutation.operationType)) {
    throw policyError(`disallowed operationType: "${mutation.operationType}"`);
  }
  if (!mutation.payload || typeof mutation.payload !== 'object') {
    throw new Error('missing or invalid payload');
  }

  const topLevelKeys = Object.keys(mutation).sort();
  if (JSON.stringify(topLevelKeys) !== JSON.stringify(['operationType', 'payload', 'targetId'])) {
    throw policyError('mutation contains missing or extra fields');
  }
  if (typeof mutation.targetId !== 'string' || !mutation.targetId.trim() || mutation.targetId.length > 100) {
    throw new Error('invalid targetId');
  }

  if (mutation.operationType === 'update_bom_quantity') {
    const payloadKeys = Object.keys(mutation.payload).sort();
    if (JSON.stringify(payloadKeys) !== JSON.stringify(['childId', 'color', 'quantity'])) {
      throw policyError('update_bom_quantity payload contains missing or extra fields');
    }
    if (typeof mutation.payload.color !== 'string' || !mutation.payload.color.trim()) throw new Error('invalid color');
    if (typeof mutation.payload.childId !== 'string' || !mutation.payload.childId.trim()) throw new Error('invalid childId');
    const qty = mutation.payload.quantity;
    if (!Number.isInteger(qty) || qty < 1 || qty > 1_000_000) {
      throw new Error(`invalid quantity for update_bom_quantity: ${mutation.payload.quantity}`);
    }
  } else if (mutation.operationType === 'update_material_field') {
    const payloadKeys = Object.keys(mutation.payload).sort();
    if (JSON.stringify(payloadKeys) !== JSON.stringify(['field', 'value'])) {
      throw policyError('update_material_field payload contains missing or extra fields');
    }
    if (!mutation.payload.field || typeof mutation.payload.field !== 'string') {
      throw new Error('missing or invalid field for update_material_field');
    }
    if (!ALLOWED_MATERIAL_FIELDS.has(mutation.payload.field)) {
      throw new Error(`Field ${mutation.payload.field} is not allowed to be updated by AI`);
    }
    if (mutation.payload.value === undefined || typeof mutation.payload.value !== 'string' || mutation.payload.value.length > 1000) {
      throw new Error('missing or invalid string value for update_material_field');
    }
  }

  return mutation;
}
