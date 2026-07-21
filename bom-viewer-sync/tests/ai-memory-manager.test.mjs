import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryManager } from '../src/features/ai-assistant/memory-manager.js';

test('memory-manager: stores memory with confidence, expiry, lastUsedAt', () => {
  const manager = createMemoryManager();
  const snapshot = { sourceMetadata: { commitSha: 'a'.repeat(40) } };
  
  const result = manager.storeMemory('alias', 'Black variant is con Bellah', snapshot, { confidence: 0.9, expiryDays: 30 });
  assert.equal(result.status, 'confirmed');
  
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
  const m2 = manager.storeMemory('alias', 'Black is Bellah 2', snapshot);
  
  const memory = manager.retrieveMemory('alias', snapshot);
  assert.equal(memory.fact, 'Black is Bellah 2');
  assert.deepEqual(memory.supersedes, [m1.memoryId]);
});

test('memory-manager: duplicate merge', () => {
  const manager = createMemoryManager();
  const snapshot = { sourceMetadata: { commitSha: 'a'.repeat(40) } };
  
  manager.storeMemory('pref', 'User likes tables', snapshot);
  const m2 = manager.storeMemory('pref', 'User likes tables', snapshot); // exact same fact
  
  const memories = manager.localStore.listConfirmed();
  assert.equal(memories.length, 1);
  assert.equal(memories[0].id, m2.memoryId);
  // Merged
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
  const m2 = manager.storeMemory('task1', 'Step 2 done', snapshot);
  
  const closure = manager.summarizeTask('task1', 'Task complete', snapshot);
  assert.equal(closure.status, 'confirmed');
  
  const memories = manager.localStore.listConfirmed();
  assert.equal(memories.length, 1);
  assert.equal(memories[0].fact, 'Task complete');
  assert.ok(memories[0].scope.supersedes.includes(m2.memoryId));
});
