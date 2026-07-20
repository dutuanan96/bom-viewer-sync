import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMappingCandidate,
  exportCompanyPromotion,
  normalizeAlias,
  personalMappingsFromStore,
  validateEntityMapping,
} from '../src/features/ai-assistant/entity-mapping.js';

const NOW = '2026-07-20T00:00:00.000Z';
const SOURCE_SHA = 'a'.repeat(40);

function confirmedMapping(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'mapping_personal_bellah_black',
    mappingType: 'entity-alias',
    scope: 'personal',
    phrase: 'con BellaH màu đen',
    normalizedPhrase: 'con bellah màu đen',
    target: { type: 'product-variant', productCode: 'LGS433', color: '黑色' },
    status: 'confirmed',
    confidence: 1,
    provenance: [{ sourceType: 'user-confirmed', sourceRef: 'settings', capturedAt: NOW }],
    sourceCommit: SOURCE_SHA,
    ...overrides,
  };
}

test('validates and deeply freezes a confirmed personal product variant mapping', () => {
  const mapping = validateEntityMapping(confirmedMapping());
  assert.equal(mapping.target.productCode, 'LGS433');
  assert.equal(Object.isFrozen(mapping), true);
  assert.equal(Object.isFrozen(mapping.target), true);
  assert.equal(Object.isFrozen(mapping.provenance[0]), true);
});

test('rejects invalid targets, company candidates, and extra target fields', () => {
  assert.throws(
    () => validateEntityMapping(confirmedMapping({ target: { type: 'product', productCode: '433' } })),
    /productCode/i,
  );
  assert.throws(
    () => validateEntityMapping(confirmedMapping({ scope: 'company', status: 'candidate' })),
    /company.*confirmed/i,
  );
  assert.throws(
    () => validateEntityMapping(confirmedMapping({ target: { type: 'product', productCode: 'LGS433', color: '黑色' } })),
    /target.*field/i,
  );
});

test('rejects malformed metadata, secret-like values, and model auto-confirmation', () => {
  assert.throws(() => validateEntityMapping(confirmedMapping({ phrase: ' ' })), /phrase/i);
  assert.throws(() => validateEntityMapping(confirmedMapping({ confidence: 1.1 })), /confidence/i);
  assert.throws(() => validateEntityMapping(confirmedMapping({ sourceCommit: 'abc' })), /sourceCommit/i);
  assert.throws(() => validateEntityMapping(confirmedMapping({ provenance: [] })), /provenance/i);
  assert.throws(() => validateEntityMapping(confirmedMapping({ phrase: 'sk-or-1234567890abcdef' })), /secret|credential/i);
  assert.throws(() => validateEntityMapping(confirmedMapping({
    provenance: [{ sourceType: 'model-proposed', sourceRef: 'assistant', capturedAt: NOW }],
  })), /model-proposed.*confirmed/i);
});

test('normalizes aliases and candidate creation never accepts confirmed state', () => {
  assert.equal(normalizeAlias('  CON，ＢｅｌｌａＨ!!!  '), 'con bellah');
  const candidate = createMappingCandidate({
    id: 'mapping_candidate_bellah',
    phrase: 'Con BellaH',
    target: { type: 'product', productCode: 'LGS433' },
    status: 'confirmed',
    scope: 'company',
    confidence: 0.94,
    sourceType: 'model-proposed',
    sourceRef: 'assistant',
    capturedAt: NOW,
    sourceCommit: SOURCE_SHA,
  });
  assert.equal(candidate.scope, 'personal');
  assert.equal(candidate.status, 'candidate');
  assert.equal(candidate.provenance[0].sourceType, 'model-proposed');
});

test('reads only confirmed typed personal mappings for the current commit', () => {
  const records = [
    { id: 'memory_mapping', status: 'confirmed', sourceCommit: SOURCE_SHA, entityMapping: confirmedMapping({ id: 'mapping_old', status: 'candidate' }) },
    { id: 'memory_prose', status: 'confirmed', sourceCommit: SOURCE_SHA, fact: 'ordinary memory' },
  ];
  const localStore = { listConfirmed: ({ currentSourceCommit }) => currentSourceCommit === SOURCE_SHA ? records : [] };
  const mappings = personalMappingsFromStore(localStore, { currentSourceCommit: SOURCE_SHA });
  assert.equal(mappings.length, 1);
  assert.equal(mappings[0].id, 'mapping_old');
  assert.equal(mappings[0].status, 'confirmed');
});

test('exports one reviewed company promotion without browser-local fields', () => {
  const serialized = exportCompanyPromotion(confirmedMapping());
  const promotion = JSON.parse(serialized);
  assert.equal(promotion.scope, 'company');
  assert.equal(promotion.status, 'confirmed');
  assert.equal(promotion.promotedFrom, 'personal');
  assert.equal('id' in promotion, false);
  assert.doesNotMatch(serialized, /audit|browser|api.?key/i);
  assert.throws(() => exportCompanyPromotion(confirmedMapping({ status: 'candidate' })), /confirmed personal/i);
});
