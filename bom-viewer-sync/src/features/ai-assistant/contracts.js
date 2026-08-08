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
  'analyze_pdm',
  'analyze_engineering_drawing',
  'check_drawing_commonality',
  'find_duplicate_materials',
]));

const ALLOWED_PROPOSAL_OPERATIONS = Object.freeze(new Set([
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
  'consolidate_materials',
]));

const ALLOWED_MATERIAL_FIELDS = Object.freeze(new Set([
  'code',
  'name_zh',
  'name_vi',
  'spec',
  'spec_vi',
  'material_zh',
  'material_vi',
  'color_zh',
  'color_vi',
  'attr_zh',
  'attr_vi',
  'unit',
]));

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
  get_bom: { required: ['productId'], allowed: ['productId', 'color', 'query'] },
  compare_boms: {
    required: ['productId1', 'productId2'],
    allowed: ['productId1', 'color1', 'productId2', 'color2']
  },
  get_material: { required: ['materialId'], allowed: ['materialId'] },
  where_used: { required: ['materialId'], allowed: ['materialId'] },
  get_revision_history: { required: ['productId'], allowed: ['productId'] },
  audit_product_data: { required: ['productId'], allowed: ['productId'] },
  apply_mutation: {
    required: [],
    allowed: ['operationType', 'targetId', 'payload', 'operations', 'summary']
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
  analyze_pdm: { required: ['query'], allowed: ['query', 'scope', 'countMode', 'componentFamily', 'dimensionFilter'] },
  analyze_engineering_drawing: { required: ['query', 'productId'], allowed: ['query', 'productId'] },
  check_drawing_commonality: { required: ['query'], allowed: ['query'] },
  find_duplicate_materials: { required: [], allowed: ['name'] },
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
    if (toolName === 'apply_mutation' && field === 'operations') {
      if (!Array.isArray(args.operations)) throw policyError('apply_mutation.operations must be an array');
      continue;
    }
    if (typeof args[field] !== 'string') throw policyError(`${toolName}.${field} must be a string`);
    if (args[field].trim().length === 0) throw policyError(`${toolName}.${field} must not be empty`);
  }

  if ('payload' in args && (!args.payload || typeof args.payload !== 'object' || Array.isArray(args.payload))) {
    throw policyError(`${toolName}.payload must be an object`);
  }

  if (toolName === 'apply_mutation') validateMutationProposal(args);

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
  validateSafeIdentifier(mutation.targetId, 'targetId');

  if (mutation.operationType === 'create_product') {
    validateExactPayloadKeys(mutation, ['color', 'name', 'size', 'sku']);
    validateProductId(mutation.targetId, 'create_product targetId');
    validateLocalizedPair(mutation.payload.name, 'product name');
    validateLocalizedPair(mutation.payload.color, 'product color');
    if (!mutation.payload.name.zh?.trim() && !mutation.payload.name.vi?.trim()) throw new Error('product name is required');
    if (!mutation.payload.color.zh?.trim()) throw new Error('product color zh is required');
    validateBoundedString(mutation.payload.size, 'product size', false);
    validateBoundedString(mutation.payload.sku, 'product sku', true);
  } else if (mutation.operationType === 'update_product') {
    validateExactPayloadKeys(mutation, ['color', 'patch']);
    validateProductId(mutation.targetId, 'update_product targetId');
    validateBoundedString(mutation.payload.color, 'product color', true);
    validateProductPatch(mutation.payload.patch);
  } else if (mutation.operationType === 'create_product_revision') {
    validateExactPayloadKeys(mutation, ['changeReason', 'revision']);
    validateProductId(mutation.targetId, 'create_product_revision targetId');
    validateBoundedString(mutation.payload.revision, 'revision', true);
    validateBoundedString(mutation.payload.changeReason, 'change reason', true, 1000);
  } else if (mutation.operationType === 'release_product_revision' || mutation.operationType === 'withdraw_product_revision') {
    validateExactPayloadKeys(mutation, ['reason']);
    validateProductId(mutation.targetId, `${mutation.operationType} targetId`);
    validateBoundedString(mutation.payload.reason, 'revision reason', true, 1000);
  } else if (mutation.operationType === 'create_material') {
    const payloadKeys = Object.keys(mutation.payload).sort();
    if (JSON.stringify(payloadKeys) !== JSON.stringify(['material'])) {
      throw policyError('create_material payload contains missing or extra fields');
    }
    validateMaterialRecordInput(mutation.payload.material);
  } else if (mutation.operationType === 'consolidate_materials') {
    validateExactPayloadKeys(mutation, ['material', 'sourceMaterialIds']);
    validateMaterialRecordInput(mutation.payload.material);
    validateMaterialIdList(mutation.payload.sourceMaterialIds);
  } else if (mutation.operationType === 'update_material') {
    const payloadKeys = Object.keys(mutation.payload).sort();
    if (JSON.stringify(payloadKeys) !== JSON.stringify(['patch'])) {
      throw policyError('update_material payload contains missing or extra fields');
    }
    validateMaterialPatch(mutation.payload.patch);
  } else if (mutation.operationType === 'delete_material' || mutation.operationType === 'remove_bom_item') {
    if (Object.keys(mutation.payload).length !== 0) {
      throw policyError(`${mutation.operationType} payload must be empty`);
    }
  } else if (mutation.operationType === 'add_bom_item') {
    validateExactPayloadKeys(mutation, ['color', 'comp_code', 'materialId', 'quantity']);
    validateProductId(mutation.targetId, 'add_bom_item targetId');
    validateBomItemPayload(mutation.payload, true);
  } else if (mutation.operationType === 'update_bom_item') {
    validateExactPayloadKeys(mutation, ['comp_code', 'quantity']);
    validateBomItemPayload(mutation.payload, false);
  } else if (mutation.operationType === 'replace_bom_item') {
    validateExactPayloadKeys(mutation, ['materialId']);
    validateSafeIdentifier(mutation.payload.materialId, 'replacement materialId');
  } else if (mutation.operationType === 'add_material_child') {
    validateExactPayloadKeys(mutation, ['materialId', 'quantity']);
    validateSafeIdentifier(mutation.payload.materialId, 'child materialId');
    validatePositiveQuantity(mutation.payload.quantity, 'child material quantity');
  } else if (mutation.operationType === 'update_material_child_quantity') {
    validateExactPayloadKeys(mutation, ['childId', 'originalQuantity', 'quantity']);
    validateSafeIdentifier(mutation.payload.childId, 'child materialId');
    validatePositiveQuantity(mutation.payload.originalQuantity, 'original child quantity');
    validatePositiveQuantity(mutation.payload.quantity, 'child material quantity');
  } else if (mutation.operationType === 'remove_material_child') {
    if (Object.keys(mutation.payload).length !== 0) throw policyError('remove_material_child payload must be empty');
  } else if (mutation.operationType === 'delete_material_structure') {
    if (Object.keys(mutation.payload).length !== 0) throw policyError('delete_material_structure payload must be empty');
  } else if (mutation.operationType === 'update_bom_quantity') {
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

function validateSafeIdentifier(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || !/^[\p{L}\p{N}_.:-]+$/u.test(value)) {
    throw new Error(`invalid ${label}`);
  }
}

function validateProductId(value, label) {
  if (!PRODUCT_ID_PATTERN.test(value || '')) throw new Error(`invalid ${label}`);
}

function validateBoundedString(value, label, required, maxLength = 200) {
  if (typeof value !== 'string' || value.length > maxLength || (required && !value.trim())) {
    throw new Error(`${label} must be a bounded${required ? ' non-empty' : ''} string`);
  }
}

function validatePositiveQuantity(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > 1_000_000) throw new Error(`invalid ${label}`);
}

function validateMaterialIdList(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 50) {
    throw new Error('sourceMaterialIds must contain 2 to 50 material IDs');
  }
  const unique = new Set();
  for (const materialId of value) {
    validateSafeIdentifier(materialId, 'source materialId');
    if (unique.has(materialId)) throw new Error('sourceMaterialIds must be unique');
    unique.add(materialId);
  }
}

function validateExactPayloadKeys(mutation, expected) {
  const keys = Object.keys(mutation.payload).sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(keys) !== JSON.stringify(sortedExpected)) {
    throw policyError(`${mutation.operationType} payload contains missing or extra fields`);
  }
}

function validateLocalizedPair(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const keys = Object.keys(value);
  if (keys.some(key => !['zh', 'vi'].includes(key))) throw policyError(`${label} contains unsupported fields`);
  for (const item of Object.values(value)) {
    if (typeof item !== 'string' || item.length > 1000) throw new Error(`${label} values must be bounded strings`);
  }
}

function validateAssetList(value, label) {
  if (!Array.isArray(value) || value.length > 1) throw new Error(`${label} must contain at most one asset`);
  for (const asset of value) {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) throw new Error(`${label} asset must be an object`);
    const keys = Object.keys(asset);
    if (keys.some(key => !['name', 'url', 'previewUrl', 'path'].includes(key))) {
      throw policyError(`${label} asset contains unsupported fields`);
    }
    for (const item of Object.values(asset)) {
      if (typeof item !== 'string' || item.length > 2000) throw new Error(`${label} asset values must be bounded strings`);
    }
    if (!asset.url) throw new Error(`${label} asset url is required`);
    let url;
    try {
      url = new URL(asset.url);
    } catch {
      throw new Error(`${label} asset url is invalid`);
    }
    if (url.protocol !== 'https:') throw new Error(`${label} asset url must use https`);
    const path = url.pathname.toLowerCase();
    if (label === 'drawings' && url.hostname !== 'drive.google.com' && !path.endsWith('.pdf')) {
      throw new Error('drawings asset must be a PDF or Google Drive URL');
    }
    if (label === 'models3d' && (url.hostname === 'drive.google.com' || (!path.endsWith('.glb') && !path.endsWith('.gltf')))) {
      throw new Error('models3d asset must be a direct GLB or GLTF URL');
    }
  }
}

function validateMaterialPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('material patch must be an object');
  const allowed = new Set(['code', 'name', 'spec', 'material', 'color', 'attr', 'drawings', 'models3d', 'unit']);
  const keys = Object.keys(patch);
  if (keys.length === 0 || keys.some(key => !allowed.has(key))) throw policyError('material patch contains unsupported fields');
  for (const key of ['name', 'spec', 'material', 'color', 'attr']) {
    if (key in patch) validateLocalizedPair(patch[key], `material patch ${key}`);
  }
  for (const key of ['code', 'unit']) {
    if (key in patch && (typeof patch[key] !== 'string' || patch[key].length > 200)) {
      throw new Error(`material patch ${key} must be a bounded string`);
    }
  }
  if ('drawings' in patch) validateAssetList(patch.drawings, 'drawings');
  if ('models3d' in patch) validateAssetList(patch.models3d, 'models3d');
}

function validateProductPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('product patch must be an object');
  const allowed = new Set(['name', 'size', 'sku']);
  const keys = Object.keys(patch);
  if (keys.length === 0 || keys.some(key => !allowed.has(key))) throw policyError('product patch contains unsupported fields');
  if ('name' in patch) validateLocalizedPair(patch.name, 'product patch name');
  if ('size' in patch) validateBoundedString(patch.size, 'product patch size', false);
  if ('sku' in patch) validateBoundedString(patch.sku, 'product patch sku', true);
}

function validateMaterialRecordInput(material) {
  validateMaterialPatch(material);
  if (typeof material.code !== 'string' || !material.code.trim()) throw new Error('new material code is required');
  if (!material.name?.zh?.trim() && !material.name?.vi?.trim()) throw new Error('new material name is required');
}

function validateBomItemPayload(payload, requiresMaterial) {
  if (requiresMaterial) {
    validateSafeIdentifier(payload.materialId, 'materialId');
    if (typeof payload.color !== 'string' || !payload.color.trim() || payload.color.length > 100) {
      throw new Error('invalid BOM color');
    }
  }
  if (typeof payload.comp_code !== 'string' || payload.comp_code.length > 100) throw new Error('invalid BOM component code');
  if (!Number.isInteger(payload.quantity) || payload.quantity < 1 || payload.quantity > 1_000_000) {
    throw new Error('invalid BOM quantity');
  }
}

export function validateMutationProposal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('mutation proposal must be an object');
  const operations = Array.isArray(value.operations)
    ? value.operations
    : value.operationType
      ? [{ operationType: value.operationType, targetId: value.targetId, payload: value.payload }]
      : [];
  if (operations.length === 0 || operations.length > 50) throw new Error('mutation proposal must contain 1 to 50 operations');
  operations.forEach(validateMutation);
  if ('summary' in value && (typeof value.summary !== 'string' || value.summary.length > 1000)) {
    throw new Error('mutation proposal summary must be a bounded string');
  }
  return {
    summary: typeof value.summary === 'string' ? value.summary : '',
    operations,
  };
}
