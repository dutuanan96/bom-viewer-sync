import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAiStore } from '../src/features/ai-assistant/local-store.js';

class MemoryStorage {
  constructor(seed = {}) { this.data = { ...seed }; }
  getItem(key) { return this.data[key] ?? null; }
  setItem(key, value) { this.data[key] = String(value); }
  removeItem(key) { delete this.data[key]; }
}

const COMMIT_A = 'a'.repeat(40);
const COMMIT_B = 'b'.repeat(40);

function candidate(overrides = {}) {
  return {
    scope: { project: 'jintai-pdm', productCode: 'LGS433' },
    fact: 'Confirmed product fact.',
    provenance: [{ sourceType: 'pdm', sourceRef: 'LGS433', capturedAt: '2026-07-20T00:00:00.000Z' }],
    sourceCommit: COMMIT_A,
    promptPackVersion: '1.0.0',
    ...overrides,
  };
}

test('R3.1: memory is candidate until a user confirms it', () => {
  const store = createLocalAiStore({ storage: new MemoryStorage(), clock: () => '2026-07-20T00:00:00.000Z' });
  const record = store.createCandidate(candidate());

  assert.equal(record.status, 'candidate');
  assert.deepEqual(store.listConfirmed({ currentSourceCommit: COMMIT_A }), []);
  assert.equal(store.confirm(record.id).status, 'confirmed');
  assert.equal(store.listConfirmed({ currentSourceCommit: COMMIT_A }).length, 1);
});

test('R3.1: confirmed PDM memory becomes stale when source commit changes', () => {
  const store = createLocalAiStore({ storage: new MemoryStorage(), clock: () => '2026-07-20T00:00:00.000Z' });
  const record = store.createCandidate(candidate());
  store.confirm(record.id);

  assert.deepEqual(store.listConfirmed({ currentSourceCommit: COMMIT_B }), []);
  assert.equal(store.listMemories().find((item) => item.id === record.id).status, 'stale');
});

test('R3.1: reject and delete remain explicit user actions', () => {
  const store = createLocalAiStore({ storage: new MemoryStorage() });
  const rejected = store.reject(store.createCandidate(candidate()).id);
  assert.equal(rejected.status, 'rejected');
  assert.equal(store.deleteMemory(rejected.id), true);
  assert.equal(store.listMemories().length, 0);
});

test('R3.1: storage failure falls back to visible session-only mode', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const store = createLocalAiStore({ storage });
  store.createCandidate(candidate({ sourceCommit: null, provenance: [{ sourceType: 'user-confirmed', sourceRef: 'user', capturedAt: '2026-07-20T00:00:00.000Z' }] }));

  assert.equal(store.diagnostics().persistence, 'session-only');
  assert.equal(store.listMemories().length, 1);
});

test('R3.1: secret-like fields and values are excluded from memory and audit', () => {
  const store = createLocalAiStore({ storage: new MemoryStorage() });
  assert.throws(() => store.createCandidate(candidate({ fact: 'sk-or-super-secret-value-1234567890' })), /secret|credential/i);
  assert.throws(() => store.appendAudit({ action: 'connect', apiKey: 'not-allowed' }), /secret|credential/i);
});

test('R3.1: export/import preserves governed records and retention is bounded', () => {
  const store = createLocalAiStore({ storage: new MemoryStorage(), maxMemories: 2 });
  store.createCandidate(candidate({ fact: 'one' }));
  store.createCandidate(candidate({ fact: 'two' }));
  store.createCandidate(candidate({ fact: 'three' }));
  assert.equal(store.listMemories().length, 2);

  const exported = store.exportData();
  const restored = createLocalAiStore({ storage: new MemoryStorage() });
  restored.importData(exported);
  assert.equal(restored.listMemories().length, 2);
  assert.doesNotMatch(exported, /apiKey|authorization|fullPrompt/i);
});

test('R3.1: legacy schema is migrated without auto-confirming memory', () => {
  const storageKey = 'jintai.pdm.ai.local.v1';
  const storage = new MemoryStorage({
    [storageKey]: JSON.stringify({ schemaVersion: 0, memories: [{ key: 'legacy', value: 'legacy fact' }] }),
  });
  const store = createLocalAiStore({ storage, storageKey });
  const records = store.listMemories();
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'candidate');
});

test('typed entity mappings remain candidates until confirmation and survive persistence', () => {
  const storage = new MemoryStorage();
  const store = createLocalAiStore({ storage, clock: () => '2026-07-20T00:00:00.000Z' });
  const record = store.createCandidate(candidate({
    fact: 'Personal alias: con BellaH -> LGS433',
    entityMapping: {
      schemaVersion: 1,
      id: 'mapping_candidate_bellah',
      mappingType: 'entity-alias',
      scope: 'personal',
      phrase: 'con BellaH',
      normalizedPhrase: 'con bellah',
      target: { type: 'product', productCode: 'LGS433' },
      status: 'candidate',
      confidence: 0.95,
      provenance: [{ sourceType: 'user-proposed', sourceRef: 'chat', capturedAt: '2026-07-20T00:00:00.000Z' }],
      sourceCommit: COMMIT_A,
    },
  }));

  assert.equal(record.entityMapping.status, 'candidate');
  assert.equal(store.confirm(record.id).entityMapping.status, 'confirmed');

  const restored = createLocalAiStore({ storage });
  const confirmed = restored.listConfirmed({ currentSourceCommit: COMMIT_A });
  assert.equal(confirmed[0].entityMapping.target.productCode, 'LGS433');
  assert.equal(confirmed[0].entityMapping.status, 'confirmed');
});

test('viewer improvement candidates require AI review before admin approval', () => {
  const store = createLocalAiStore({
    storage: new MemoryStorage(),
    clock: () => '2026-07-27T00:00:00.000Z',
  });
  const record = store.createImprovementCandidate({
    issueType: 'user-teaching',
    userQuestion: 'Which product uses this part?',
    userCorrection: 'LGS433',
    context: { productIds: ['LGS433'] },
  });

  assert.throws(() => store.approveImprovement(record.id), /review is required/i);
  store.setImprovementReview(record.id, {
    decision: 'recommend-approve',
    evidenceStatus: 'supported',
    confidence: 0.9,
    category: 'terminology',
    summary: 'Supported by current PDM evidence.',
    proposedKnowledge: 'This part is used by LGS433.',
    risks: [],
    reviewerModel: 'reviewer/model',
    reviewedAt: '2026-07-27T00:00:00.000Z',
  });
  assert.equal(store.approveImprovement(record.id).status, 'approved');
  const exported = JSON.parse(store.exportApprovedKnowledge({ sourceCommit: COMMIT_A }));
  assert.equal(exported.entries.length, 1);
});

test('improvement bundles import once and repeated observations are deduplicated', () => {
  const viewer = createLocalAiStore({
    storage: new MemoryStorage(),
    clock: () => '2026-07-27T00:00:00.000Z',
  });
  const input = {
    issueType: 'provider-failure',
    userQuestion: 'Compare LGS433 and LGS434.',
  };
  viewer.createImprovementCandidate(input);
  assert.equal(viewer.createImprovementCandidate(input).occurrences, 2);

  const admin = createLocalAiStore({ storage: new MemoryStorage() });
  const bundle = viewer.exportImprovementBundle();
  assert.equal(admin.importImprovementBundle(bundle).importedCount, 1);
  assert.equal(admin.importImprovementBundle(bundle).importedCount, 0);
});
