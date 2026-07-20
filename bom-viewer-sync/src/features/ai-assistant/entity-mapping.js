const SECRET_KEY_PATTERN = /api.?key|authorization|password|secret|token|credential/i;
const SECRET_VALUE_PATTERN = /\b(?:sk-or-|sk-|ghp_|github_pat_|bearer\s+)[a-z0-9._-]{10,}/i;
const PRODUCT_CODE_PATTERN = /^LGS\d{3,4}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

export const ENTITY_TYPES = Object.freeze({
  PRODUCT: 'product',
  PRODUCT_VARIANT: 'product-variant',
  MATERIAL: 'material',
});

const ENTITY_TYPE_VALUES = new Set(Object.values(ENTITY_TYPES));
const STATUS_VALUES = new Set(['candidate', 'confirmed', 'rejected', 'stale']);
const SCOPE_VALUES = new Set(['personal', 'company']);
const MAPPING_FIELDS = new Set([
  'schemaVersion', 'id', 'mappingType', 'scope', 'phrase', 'normalizedPhrase',
  'target', 'status', 'confidence', 'provenance', 'sourceCommit', 'promotedFrom',
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function assertNoSecrets(value, path = 'mapping') {
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERN.test(value)) throw new Error(`Secret or credential is not allowed at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) throw new Error(`Secret or credential field is not allowed at ${path}.${key}`);
      assertNoSecrets(nested, `${path}.${key}`);
    }
  }
}

function assertExactFields(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
  }
}

function validateTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) throw new Error('Mapping target is required');
  if (!ENTITY_TYPE_VALUES.has(target.type)) throw new Error('Unsupported target type');

  if (target.type === ENTITY_TYPES.PRODUCT) {
    assertExactFields(target, new Set(['type', 'productCode']), 'Target');
    if (!PRODUCT_CODE_PATTERN.test(target.productCode || '')) throw new Error('Target productCode must be canonical');
  } else if (target.type === ENTITY_TYPES.PRODUCT_VARIANT) {
    assertExactFields(target, new Set(['type', 'productCode', 'color']), 'Target');
    if (!PRODUCT_CODE_PATTERN.test(target.productCode || '')) throw new Error('Target productCode must be canonical');
    if (typeof target.color !== 'string' || !target.color.trim() || target.color.length > 100) throw new Error('Target color is required');
  } else {
    assertExactFields(target, new Set(['type', 'materialId']), 'Target');
    if (typeof target.materialId !== 'string' || !target.materialId.trim() || target.materialId.length > 160) {
      throw new Error('Target materialId is required');
    }
  }
}

function validateProvenance(provenance) {
  if (!Array.isArray(provenance) || provenance.length === 0 || provenance.length > 10) throw new Error('Mapping provenance is required');
  for (const item of provenance) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Mapping provenance entry is invalid');
    assertExactFields(item, new Set(['sourceType', 'sourceRef', 'capturedAt', 'contentHash']), 'Provenance');
    if (typeof item.sourceType !== 'string' || !item.sourceType.trim()) throw new Error('Provenance sourceType is required');
    if (typeof item.sourceRef !== 'string' || !item.sourceRef.trim()) throw new Error('Provenance sourceRef is required');
    if (typeof item.capturedAt !== 'string' || Number.isNaN(Date.parse(item.capturedAt))) throw new Error('Provenance capturedAt is invalid');
    if (item.contentHash !== undefined && (typeof item.contentHash !== 'string' || item.contentHash.length > 160)) {
      throw new Error('Provenance contentHash is invalid');
    }
  }
}

export function normalizeAlias(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('und')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateEntityMapping(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Entity mapping must be an object');
  assertExactFields(input, MAPPING_FIELDS, 'Entity mapping');
  assertNoSecrets(input);
  if (input.schemaVersion !== 1) throw new Error('Entity mapping schemaVersion must be 1');
  if (typeof input.id !== 'string' || !/^mapping_[a-z0-9_-]{3,120}$/i.test(input.id)) throw new Error('Entity mapping id is invalid');
  if (input.mappingType !== 'entity-alias') throw new Error('Entity mapping mappingType is invalid');
  if (!SCOPE_VALUES.has(input.scope)) throw new Error('Entity mapping scope is invalid');
  if (typeof input.phrase !== 'string' || !input.phrase.trim() || input.phrase.length > 500) throw new Error('Entity mapping phrase is required');
  const normalizedPhrase = normalizeAlias(input.phrase);
  if (!normalizedPhrase || input.normalizedPhrase !== normalizedPhrase) throw new Error('Entity mapping normalizedPhrase is invalid');
  if (!STATUS_VALUES.has(input.status)) throw new Error('Entity mapping status is invalid');
  if (input.scope === 'company' && input.status !== 'confirmed') throw new Error('Company mappings must be confirmed');
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) throw new Error('Entity mapping confidence must be between 0 and 1');
  if (input.sourceCommit !== null && input.sourceCommit !== undefined && !SHA_PATTERN.test(input.sourceCommit)) {
    throw new Error('Entity mapping sourceCommit must be a 40-character SHA or null');
  }
  if (input.promotedFrom !== undefined && (input.scope !== 'company' || input.promotedFrom !== 'personal')) {
    throw new Error('Entity mapping promotedFrom is invalid');
  }
  validateTarget(input.target);
  validateProvenance(input.provenance);
  const sourceTypes = new Set(input.provenance.map(item => item.sourceType));
  if (input.status === 'confirmed' && sourceTypes.has('model-proposed') && !sourceTypes.has('user-confirmed')) {
    throw new Error('A model-proposed mapping cannot be confirmed without user-confirmed provenance');
  }
  return deepFreeze(clone({ ...input, phrase: input.phrase.trim(), target: clone(input.target) }));
}

export function createMappingCandidate(input = {}) {
  const sourceType = input.sourceType === 'user-proposed' ? 'user-proposed' : 'model-proposed';
  return validateEntityMapping({
    schemaVersion: 1,
    id: input.id || `mapping_candidate_${normalizeAlias(input.phrase).replace(/\s+/g, '_').slice(0, 80)}`,
    mappingType: 'entity-alias',
    scope: 'personal',
    phrase: String(input.phrase || '').trim(),
    normalizedPhrase: normalizeAlias(input.phrase),
    target: clone(input.target),
    status: 'candidate',
    confidence: Number(input.confidence),
    provenance: [{
      sourceType,
      sourceRef: String(input.sourceRef || 'assistant'),
      capturedAt: String(input.capturedAt || new Date().toISOString()),
    }],
    sourceCommit: input.sourceCommit || null,
  });
}

export function personalMappingsFromStore(localStore, { currentSourceCommit } = {}) {
  if (!localStore || typeof localStore.listConfirmed !== 'function') return Object.freeze([]);
  const mappings = [];
  for (const record of localStore.listConfirmed({ currentSourceCommit })) {
    if (!record?.entityMapping) continue;
    try {
      mappings.push(validateEntityMapping({
        ...record.entityMapping,
        scope: 'personal',
        status: 'confirmed',
        sourceCommit: record.sourceCommit || record.entityMapping.sourceCommit || null,
      }));
    } catch {
      // Invalid or stale typed records are never available to resolution.
    }
  }
  return Object.freeze(mappings);
}

export function exportCompanyPromotion(record) {
  const mapping = validateEntityMapping(record);
  if (mapping.scope !== 'personal' || mapping.status !== 'confirmed') throw new Error('Only a confirmed personal mapping can be promoted');
  const promotion = {
    schemaVersion: 1,
    mappingType: 'entity-alias',
    scope: 'company',
    phrase: mapping.phrase,
    normalizedPhrase: mapping.normalizedPhrase,
    target: mapping.target,
    status: 'confirmed',
    confidence: mapping.confidence,
    provenance: mapping.provenance,
    sourceCommit: mapping.sourceCommit,
    promotedFrom: 'personal',
  };
  assertNoSecrets(promotion);
  return JSON.stringify(promotion, null, 2);
}
