// src/features/ai-assistant/memory-manager.js
// R4 — Automatic Memory Lifecycle
// Implements auto-write, decay, supersession, and secret rejection.

import { createLocalAiStore } from './local-store.js';

export function createMemoryManager({ localStore = null } = {}) {
  const store = localStore || createLocalAiStore();

  function storeMemory(key, value, snapshot) {
    // Supersession: Delete existing memories with the same key
    const existing = store.listConfirmed().filter(m => m.scope?.key === key);
    for (const mem of existing) {
      store.deleteMemory(mem.id);
    }

    // Secret rejection is handled natively by localStore.createCandidate (assertNoSecrets)
    const memory = store.createCandidate({
      scope: {
        project: 'jintai-pdm',
        key,
        productCode: snapshot?.selection?.productCode || null,
        materialId: snapshot?.selection?.materialId || null,
      },
      fact: value,
      provenance: [{
        sourceType: 'model-proposed',
        sourceRef: key,
        capturedAt: new Date().toISOString(),
      }],
      sourceCommit: snapshot?.sourceMetadata?.commitSha || null,
      promptPackVersion: null,
    });

    // Auto-confirm
    store.confirm(memory.id);

    return { status: 'confirmed', memoryId: memory.id };
  }

  function retrieveMemory(key, snapshot) {
    const currentSourceCommit = snapshot?.sourceMetadata?.commitSha;
    const memories = store.listConfirmed({ currentSourceCommit });
    return memories.find((memory) => memory.scope?.key === key) || { found: false };
  }

  function decayMemories() {
    const confirmed = store.listConfirmed();
    if (confirmed.length > 100) {
      confirmed.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const toDelete = confirmed.slice(0, confirmed.length - 100);
      for (const mem of toDelete) {
        store.deleteMemory(mem.id);
      }
    }
  }

  return { storeMemory, retrieveMemory, decayMemories, localStore: store };
}
