import { validateEntityMapping } from './entity-mapping.js';

const SCHEMA_VERSION = 1;
const DEFAULT_STORAGE_KEY = 'jintai.pdm.ai.local.v1';
const SECRET_KEY_PATTERN = /api.?key|authorization|password|secret|token|credential/i;
const SECRET_VALUE_PATTERN = /\b(?:sk-or-|sk-|ghp_|github_pat_|bearer\s+)[a-z0-9._-]{10,}/i;

function nowIso(clock) {
  const value = clock();
  return value instanceof Date ? value.toISOString() : String(value);
}

function emptyState() {
  return { schemaVersion: SCHEMA_VERSION, memories: [], audit: [], settings: {} };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNoSecrets(value, path = 'value') {
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

function migrateState(raw, capturedAt) {
  if (!raw || typeof raw !== 'object') return emptyState();
  if (raw.schemaVersion === SCHEMA_VERSION) {
    return {
      schemaVersion: SCHEMA_VERSION,
      memories: Array.isArray(raw.memories) ? raw.memories : [],
      audit: Array.isArray(raw.audit) ? raw.audit : [],
      settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
    };
  }
  if (raw.schemaVersion === 0) {
    const memories = (Array.isArray(raw.memories) ? raw.memories : []).map((item, index) => ({
      schemaVersion: SCHEMA_VERSION,
      id: `memory_legacy_${index + 1}`,
      status: 'candidate',
      scope: { project: 'jintai-pdm' },
      fact: String(item.fact ?? item.value ?? ''),
      provenance: [{ sourceType: 'local-import', sourceRef: String(item.key ?? 'legacy'), capturedAt }],
      sourceCommit: null,
      promptPackVersion: null,
      createdAt: capturedAt,
      confirmedAt: null,
    })).filter((item) => item.fact);
    return { ...emptyState(), memories };
  }
  throw new Error(`Unsupported local AI store schema: ${raw.schemaVersion}`);
}

function validateCandidate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Memory candidate must be an object');
  if (typeof input.fact !== 'string' || !input.fact.trim()) throw new Error('Memory fact is required');
  if (!Array.isArray(input.provenance) || input.provenance.length === 0) throw new Error('Memory provenance is required');
  if (input.sourceCommit !== null && input.sourceCommit !== undefined && !/^[0-9a-f]{40}$/i.test(input.sourceCommit)) {
    throw new Error('Memory sourceCommit must be a 40-character SHA or null');
  }
  if (input.entityMapping !== undefined) {
    const mapping = validateEntityMapping(input.entityMapping);
    if (mapping.scope !== 'personal' || mapping.status !== 'candidate') {
      throw new Error('Stored entity mapping must begin as a personal candidate');
    }
  }
  assertNoSecrets(input);
}

export function createLocalAiStore({
  storage = globalThis.localStorage,
  storageKey = DEFAULT_STORAGE_KEY,
  clock = () => new Date().toISOString(),
  maxMemories = 200,
  maxAudit = 500,
} = {}) {
  let persistence = 'persistent';
  let sequence = 0;
  let state = emptyState();

  try {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error('Storage unavailable');
    const raw = storage.getItem(storageKey);
    if (raw) state = migrateState(JSON.parse(raw), nowIso(clock));
    storage.setItem(`${storageKey}.probe`, '1');
    storage.removeItem?.(`${storageKey}.probe`);
  } catch {
    persistence = 'session-only';
    state = emptyState();
  }

  function persist() {
    state.memories = state.memories.slice(-maxMemories);
    state.audit = state.audit.slice(-maxAudit);
    if (persistence !== 'persistent') return;
    try {
      storage.setItem(storageKey, JSON.stringify(state));
    } catch {
      persistence = 'session-only';
    }
  }

  function appendAudit(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Audit event must be an object');
    assertNoSecrets(event, 'audit');
    const record = {
      schemaVersion: SCHEMA_VERSION,
      id: `audit_${Date.now()}_${++sequence}`,
      createdAt: nowIso(clock),
      ...clone(event),
    };
    state.audit.push(record);
    persist();
    return clone(record);
  }

  function createCandidate(input) {
    validateCandidate(input);
    const createdAt = nowIso(clock);
    const record = {
      schemaVersion: SCHEMA_VERSION,
      id: `memory_${Date.now()}_${++sequence}`,
      status: 'candidate',
      scope: { project: 'jintai-pdm', ...(clone(input.scope || {})) },
      fact: input.fact.trim(),
      provenance: clone(input.provenance),
      sourceCommit: input.sourceCommit || null,
      promptPackVersion: input.promptPackVersion || null,
      createdAt,
      confirmedAt: null,
    };
    if (input.entityMapping !== undefined) record.entityMapping = clone(validateEntityMapping(input.entityMapping));
    state.memories.push(record);
    appendAudit({ action: 'memory-candidate-created', memoryId: record.id });
    persist();
    return clone(record);
  }

  function findMemory(id) {
    const record = state.memories.find((item) => item.id === id);
    if (!record) throw new Error(`Memory not found: ${id}`);
    return record;
  }

  function transition(id, status) {
    const record = findMemory(id);
    record.status = status;
    record.confirmedAt = status === 'confirmed' ? nowIso(clock) : null;
    if (record.entityMapping) {
      record.entityMapping.status = status;
      if (status === 'confirmed') {
        record.entityMapping.provenance = Array.isArray(record.entityMapping.provenance)
          ? record.entityMapping.provenance
          : [];
        if (!record.entityMapping.provenance.some(item => item?.sourceType === 'user-confirmed')) {
          record.entityMapping.provenance.push({
            sourceType: 'user-confirmed',
            sourceRef: 'local-store-confirmation',
            capturedAt: record.confirmedAt,
          });
        }
      }
    }
    appendAudit({ action: `memory-${status}`, memoryId: id });
    persist();
    return clone(record);
  }

  function confirm(id) { return transition(id, 'confirmed'); }
  function reject(id) { return transition(id, 'rejected'); }

  function deleteMemory(id) {
    const before = state.memories.length;
    state.memories = state.memories.filter((item) => item.id !== id);
    if (state.memories.length === before) return false;
    appendAudit({ action: 'memory-deleted', memoryId: id });
    persist();
    return true;
  }

  function staleDependentMemories(currentSourceCommit) {
    if (!currentSourceCommit) return;
    let changed = false;
    for (const record of state.memories) {
      if (record.status === 'confirmed' && record.sourceCommit && record.sourceCommit !== currentSourceCommit) {
        record.status = 'stale';
        record.confirmedAt = null;
        changed = true;
      }
    }
    if (changed) persist();
  }

  function listMemories() { return clone(state.memories); }

  function listConfirmed({ currentSourceCommit } = {}) {
    staleDependentMemories(currentSourceCommit);
    return clone(state.memories.filter((item) => item.status === 'confirmed'));
  }

  function listAudit() { return clone(state.audit); }

  function exportData() {
    const exported = { schemaVersion: SCHEMA_VERSION, memories: state.memories, audit: state.audit, settings: state.settings };
    assertNoSecrets(exported);
    return JSON.stringify(exported, null, 2);
  }

  function importData(serialized) {
    if (typeof serialized !== 'string') throw new Error('Import must be JSON text');
    const imported = migrateState(JSON.parse(serialized), nowIso(clock));
    assertNoSecrets(imported);
    state = imported;
    persist();
    return { memoryCount: state.memories.length, auditCount: state.audit.length };
  }

  function clear() {
    state = emptyState();
    if (persistence === 'persistent') storage.removeItem?.(storageKey);
  }

  return {
    createCandidate,
    confirm,
    reject,
    deleteMemory,
    listMemories,
    listConfirmed,
    appendAudit,
    listAudit,
    exportData,
    importData,
    clear,
    diagnostics: () => ({ persistence, schemaVersion: SCHEMA_VERSION, memoryCount: state.memories.length, auditCount: state.audit.length }),
  };
}

const defaultStore = createLocalAiStore();

export function getDefaultLocalAiStore() {
  return defaultStore;
}

export function storeMemory(key, value) {
  return defaultStore.createCandidate({
    scope: { project: 'jintai-pdm', key },
    fact: String(value),
    provenance: [{ sourceType: 'model-proposed', sourceRef: String(key), capturedAt: new Date().toISOString() }],
    sourceCommit: null,
    promptPackVersion: null,
  });
}

export function retrieveMemory(key) {
  return defaultStore.listConfirmed().find((record) => record.scope?.key === key)?.fact || null;
}

export function clearMemory() {
  defaultStore.clear();
}

export { SCHEMA_VERSION as LOCAL_AI_STORE_SCHEMA_VERSION };
