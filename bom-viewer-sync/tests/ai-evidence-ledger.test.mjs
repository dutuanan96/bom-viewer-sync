import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceLedger } from '../src/features/ai-assistant/evidence-ledger.js';
import { createLocalAiStore } from '../src/features/ai-assistant/local-store.js';

test('evidence-ledger: normalizes and tracks unique evidence', () => {
  const store = createLocalAiStore();
  const ledger = createEvidenceLedger(store);
  
  const ev1 = ledger.trackEvidence({
    id: 'ev1',
    sourceType: 'marketplace',
    sourceRef: 'https://example.com',
    sourceCommit: 'a'.repeat(40),
    capturedAt: new Date().toISOString(),
    sourcePath: 'web/search',
    metadata: { query: 'test' }
  });
  
  const ev2 = ledger.trackEvidence({
    id: 'ev1', // Same ID should be ignored/merged
    sourceType: 'marketplace',
    sourceRef: 'https://example.com',
    sourceCommit: 'a'.repeat(40),
    capturedAt: new Date().toISOString(),
    sourcePath: 'web/search',
    metadata: { query: 'test' }
  });
  
  assert.equal(ev1.id, 'ev1');
  assert.equal(ev2.id, 'ev1');
  
  const all = ledger.getEvidence();
  assert.equal(all.length, 1);
});

test('evidence-ledger: enforces correct provenance mapping', () => {
  const store = createLocalAiStore();
  const ledger = createEvidenceLedger(store);
  
  // PDM Tool -> canonical-pdm
  const e1 = ledger.trackEvidence({
    id: 'ev_pdm',
    sourceType: 'pdm-tool', // or tool name
    sourceRef: 'search_products',
    sourceCommit: 'a'.repeat(40),
    capturedAt: new Date().toISOString(),
    sourcePath: 'tool/search_products',
    metadata: { query: 'test' }
  });
  assert.equal(e1.sourceType, 'canonical-pdm');

  // OpenRouter web search -> official-web/marketplace/community-web
  // We'll test mapping logic inside ledger
  const e2 = ledger.trackEvidence({
    id: 'ev_web',
    sourceType: 'web-search',
    sourceRef: 'https://jintai-official.com/docs',
    sourceCommit: 'a'.repeat(40),
    capturedAt: new Date().toISOString(),
    sourcePath: 'openrouter/web',
  });
  // Assuming the ledger uses rules to categorize web results:
  assert.equal(e2.sourceType, 'official-web');
});
