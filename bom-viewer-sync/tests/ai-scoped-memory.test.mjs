import test from 'node:test';
import assert from 'node:assert/strict';

import { formatScopedMemories, selectScopedMemories } from '../src/features/ai-assistant/scoped-memory.js';

const SOURCE_SHA = 'a'.repeat(40);

function memory(id, overrides = {}) {
  return {
    id,
    status: 'confirmed',
    fact: `Fact ${id}`,
    scope: { project: 'jintai-pdm' },
    provenance: [{ sourceType: 'user-confirmed', sourceRef: 'user', capturedAt: '2026-07-20T00:00:00Z' }],
    sourceCommit: SOURCE_SHA,
    ...overrides,
  };
}

function store(records) {
  return {
    listConfirmed({ currentSourceCommit }) {
      assert.equal(currentSourceCommit, SOURCE_SHA);
      return records.filter(record => record.status === 'confirmed' && (!record.sourceCommit || record.sourceCommit === currentSourceCommit));
    },
  };
}

test('ranks exact product and intent memory before unrelated records', () => {
  const records = [
    memory('unrelated', { fact: 'LGS433 marketplace wording', scope: { project: 'jintai-pdm', productCode: 'LGS433' } }),
    memory('product', { fact: 'LGS723 left rail is called thanh trái', scope: { project: 'jintai-pdm', productCode: 'LGS723' } }),
    memory('intent', { fact: 'Metal means explicit material first', scope: { project: 'jintai-pdm', intent: 'bom_compare' } }),
  ];

  const selected = selectScopedMemories({
    localStore: store(records),
    route: { intent: 'bom_compare', entities: { productIds: ['LGS723', 'LGS733'] } },
    snapshot: { sourceMetadata: { commitSha: SOURCE_SHA } },
    query: 'LGS723和LGS733有什么铁件共用？',
  });

  assert.deepEqual(selected.map(record => record.id), ['product', 'intent']);
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(Object.isFrozen(selected[0]), true);
});

test('never returns candidate, stale, or unrelated global memory', () => {
  const records = [
    memory('candidate', { status: 'candidate', fact: 'candidate LGS723' }),
    memory('stale', { status: 'stale', fact: 'stale LGS723' }),
    memory('global-unrelated', { sourceCommit: null, fact: 'Amazon dining chair reviews' }),
  ];

  const selected = selectScopedMemories({
    localStore: store(records),
    route: { intent: 'bom_compare', entities: { productIds: ['LGS723', 'LGS733'] } },
    snapshot: { sourceMetadata: { commitSha: SOURCE_SHA } },
    query: 'compare common metal parts',
  });

  assert.deepEqual(selected, []);
});

test('bounds confirmed memory to four complete records and 1600 characters', () => {
  const records = Array.from({ length: 8 }, (_, index) => memory(`m${index}`, {
    fact: `${'metal '.repeat(80)}${index}`,
    scope: { project: 'jintai-pdm', intent: 'bom_compare' },
  }));

  const selected = selectScopedMemories({
    localStore: store(records),
    route: { intent: 'bom_compare', entities: { productIds: ['LGS723', 'LGS733'] } },
    snapshot: { sourceMetadata: { commitSha: SOURCE_SHA } },
    query: 'compare metal parts',
  });
  const formatted = formatScopedMemories(selected);

  assert.ok(selected.length <= 4);
  assert.ok(formatted.length <= 1600);
  for (const record of selected) assert.match(formatted, new RegExp(record.id));
});

test('requires two meaningful overlaps before selecting global imported knowledge', () => {
  const records = [
    memory('weak', { sourceCommit: null, fact: 'Metal terminology for cabinets' }),
    memory('strong', { sourceCommit: null, fact: 'LGS723 metal rail terminology and shared parts' }),
  ];

  const selected = selectScopedMemories({
    localStore: store(records),
    route: { intent: 'bom_compare', entities: { productIds: ['LGS723', 'LGS733'] } },
    snapshot: { sourceMetadata: { commitSha: SOURCE_SHA } },
    query: 'LGS723 shared metal parts',
  });

  assert.deepEqual(selected.map(record => record.id), ['strong']);
});
