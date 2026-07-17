// AI Contracts — versioned, deterministic validation for all AI interactions.
// All validators use stable error codes from ERROR_CODES.
// No mutation of data; all checks are fail-closed.

export const ERROR_CODES = Object.freeze({
  AI_MODEL_INCOMPATIBLE: 'AI_MODEL_INCOMPATIBLE',
  AI_POLICY_BLOCKED: 'AI_POLICY_BLOCKED',
  AI_TOOL_LIMIT: 'AI_TOOL_LIMIT',
  AI_STALE_SOURCE: 'AI_STALE_SOURCE',
});

const ALLOWED_TOOLS = Object.freeze(new Set([
  'search_products',
  'get_product',
  'resolve_sku',
  'get_bom',
  'compare_boms',
  'get_material',
  'where_used',
  'get_revision_history',
  'audit_product_data',
]));

const ALLOWED_PROPOSAL_OPERATIONS = Object.freeze(new Set([
  'update_material_field',
  'update_bom_quantity',
]));

// Max string length anywhere in tool arguments (prevents prompt injection via long strings)
const MAX_ARG_STRING_LEN = 1000;
// Max array length anywhere in tool arguments
const MAX_ARG_ARRAY_LEN = 100;
// Max total serialized argument length for string-type arguments
const MAX_ARG_TOTAL_LEN = 5000;
// Max answer text
const MAX_ANSWER_TEXT_LEN = 5000;

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

export function validateProposal(proposal) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    throw new Error('missing proposal data');
  }
  if (!proposal.targetId) {
    throw new Error('missing targetId');
  }
  if (!proposal.operationType) {
    throw new Error('missing operationType');
  }
  if (!ALLOWED_PROPOSAL_OPERATIONS.has(proposal.operationType)) {
    throw policyError(`disallowed operationType: "${proposal.operationType}"`);
  }
  return proposal;
}
