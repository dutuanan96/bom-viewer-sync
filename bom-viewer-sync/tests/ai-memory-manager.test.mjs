import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryManager } from '../src/features/ai-assistant/memory-manager.js';

test('memory-manager: stores memory with confidence, expiry, lastUsedAt', () => {
  const manager = createMemoryManager();
  const snapshot = { sourceMetadata: { commitSha: 'a'.repeat(40) } };
  
  const result = manager.storeMemory('alias', 'Black variant is con Bellah', snapshot, { confidence: 0.9, expiryDays: 30 });
  assert.equal(result.status, 'candidate');
  assert.deepEqual(manager.retrieveMemory('alias', snapshot), { found: false });
  manager.localStore.confirm(result.memoryId);

  const memory = manager.retrieveMemory('alias', snapshot);
  assert.equal(memory.fact, 'Black variant is con Bellah');
  assert.equal(memory.confidence, 0.9);
  assert.ok(memory.expiresAt);
  assert.ok(memory.lastUsedAt);
});

test('memory-manager: supersedes existing memory and tracks history', () => {
  const manager = createMemoryManager();
  const snapshot = { sourceMetadata: { commitSha: 'a'.repeat(40) } };
  
  const m1 = manager.storeMemory('alias', 'Black is Bellah', snapshot);
  manager.localStore.confirm(m1.memoryId);
  const m2 = manager.storeMemory('alias', 'Black is Bellah 2', snapshot);

  assert.equal(manager.retrieveMemory('alias', snapshot).fact, 'Black is Bellah');
  manager.localStore.confirm(m2.memoryId);
  const memory = manager.retrieveMemory('alias', snapshot);
  assert.equal(memory.fact, 'Black is Bellah 2');
  assert.deepEqual(memory.supersedes, [m1.memoryId]);
  assert.equal(manager.localStore.listMemories().find(item => item.id === m1.memoryId).status, 'stale');
});

test('memory-manager: duplicate merge', () => {
  const manager = createMemoryManager();
  const snapshot = { sourceMetadata: { commitSha: 'a'.repeat(40) } };
  
  const first = manager.storeMemory('pref', 'User likes tables', snapshot);
  const m2 = manager.storeMemory('pref', 'User likes tables', snapshot); // exact same fact

  const memories = manager.localStore.listMemories();
  assert.equal(memories.length, 1);
  assert.equal(memories[0].status, 'candidate');
  assert.equal(first.memoryId, m2.memoryId);
  assert.equal(memories[0].id, m2.memoryId);
});

test('memory-manager: rejects secrets', () => {
  const manager = createMemoryManager();
  const snapshot = { sourceMetadata: { commitSha: 'a'.repeat(40) } };
  
  assert.throws(() => manager.storeMemory('secret', 'my token is sk-or-mock123456', snapshot), /secret/i);
});

test('memory-manager: summarizes task closure', () => {
  const manager = createMemoryManager();
  const snapshot = { sourceMetadata: { commitSha: 'a'.repeat(40) } };
  
  const m1 = manager.storeMemory('task1', 'Step 1 done', snapshot);
  manager.localStore.confirm(m1.memoryId);
  const m2 = manager.storeMemory('task1', 'Step 2 done', snapshot);
  manager.localStore.confirm(m2.memoryId);

  const closure = manager.summarizeTask('task1', 'Task complete', snapshot);
  assert.equal(closure.status, 'candidate');
  assert.equal(manager.retrieveMemory('task1', snapshot).fact, 'Step 2 done');
  manager.localStore.confirm(closure.memoryId);

  const memories = manager.localStore.listConfirmed();
  assert.equal(memories.length, 1);
  assert.equal(memories[0].fact, 'Task complete');
  assert.ok(memories[0].scope.supersedes.includes(m2.memoryId));
});

test('memory-manager: auto-confirms only verified read-only strategies and deduplicates them', () => {
  const manager = createMemoryManager();
  const input = {
    query: '哪些型号使用这个特殊托架',
    intent: 'catalog_analysis',
    preferredTool: 'analyze_pdm',
    successfulTools: ['analyze_pdm'],
  };

  const first = manager.learnSuccessfulStrategy(input);
  const second = manager.learnSuccessfulStrategy(input);
  const memories = manager.localStore.listConfirmed();

  assert.equal(first.status, 'confirmed');
  assert.equal(second.memoryId, first.memoryId);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].scope.memoryType, 'procedure');
  assert.equal(memories[0].provenance[0].sourceType, 'verified-tool-strategy');
  assert.equal(memories[0].sourceCommit, null);
});

test('memory-manager: does not auto-learn writes or unverified strategies', () => {
  const manager = createMemoryManager();

  assert.equal(manager.learnSuccessfulStrategy({
    query: 'change BOM',
    intent: 'bom_mutation',
    preferredTool: 'apply_mutation',
    successfulTools: ['apply_mutation'],
  }).status, 'ignored');
  assert.equal(manager.learnSuccessfulStrategy({
    query: 'find a component',
    intent: 'pdm_search',
    preferredTool: 'search_pdm',
    successfulTools: [],
  }).status, 'ignored');
  assert.equal(manager.localStore.listMemories().length, 0);
});

test('memory-manager: user teaching is confirmed, source-bound, and deduplicated', () => {
  const manager = createMemoryManager();
  const snapshot = { sourceMetadata: { commitSha: 'b'.repeat(40) } };

  const first = manager.storeUserTeaching('火星架是什么意思?', '火星架是内部测试名称', snapshot);
  const duplicate = manager.storeUserTeaching('火星架是什么意思?', '火星架是内部测试名称', snapshot);
  const memory = manager.localStore.listConfirmed()[0];

  assert.equal(first.status, 'confirmed');
  assert.equal(duplicate.memoryId, first.memoryId);
  assert.equal(memory.scope.memoryType, 'user-teaching');
  assert.equal(memory.provenance[0].sourceType, 'user-taught');
  assert.equal(memory.sourceCommit, 'b'.repeat(40));
});
