import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntityResolver } from '../src/features/ai-assistant/entity-resolver.js';

const SOURCE_SHA = 'a'.repeat(40);
const snapshot = {
  payload: {
    bom: {
      LGS433: { code: 'LGS433', name_zh: '八抽屉黑色斗柜', name_vi: 'tủ 8 ngăn màu đen', name_en: '8 drawer dresser black', colors: ['复古色', '白色', '黑色'] },
      LGS434: { code: 'LGS434', name_zh: '八抽屉白色斗柜', name_vi: 'tủ 8 ngăn màu trắng', name_en: '8 drawer dresser white', colors: ['白色'] },
    },
    materialDb: {
      materials: {
        mat_001: { id: 'mat_001', mat_code: 'ZG001', name_zh: '左侧框', name_vi: 'khung trái' },
      },
    },
  },
};

function mapping({ id, scope, phrase, target }) {
  return {
    schemaVersion: 1,
    id,
    mappingType: 'entity-alias',
    scope,
    phrase,
    normalizedPhrase: phrase.toLocaleLowerCase('und'),
    target,
    status: 'confirmed',
    confidence: 1,
    provenance: [{ sourceType: 'user-confirmed', sourceRef: 'test', capturedAt: '2026-07-20T00:00:00.000Z' }],
    sourceCommit: SOURCE_SHA,
  };
}

function resolver(overrides = {}) {
  return createEntityResolver({
    snapshot,
    companyMappings: [mapping({
      id: 'mapping_company_black_dresser',
      scope: 'company',
      phrase: 'black dresser',
      target: { type: 'product-variant', productCode: 'LGS433', color: '黑色' },
    })],
    personalMappings: [mapping({
      id: 'mapping_personal_bellah',
      scope: 'personal',
      phrase: 'con bellah màu đen',
      target: { type: 'product-variant', productCode: 'LGS433', color: '黑色' },
    })],
    marketplaceAliases: {
      ULGS433BH02S: { productCode: 'LGS433', confirmedColor: 'black' },
    },
    ...overrides,
  });
}

test('resolves canonical product and material identifiers with NFKC normalization', () => {
  assert.equal(resolver().resolve({ query: 'ＢＯＭ ｌｇｓ４３３' }).target.productCode, 'LGS433');
  assert.equal(resolver().resolve({ query: 'chi tiết MAT_001', expectedTypes: ['material'] }).target.materialId, 'mat_001');
  assert.equal(resolver().resolve({ query: 'chi tiết zg001', expectedTypes: ['material'] }).target.materialId, 'mat_001');
});

test('resolves exact personal, company, and marketplace aliases', () => {
  const personal = resolver().resolve({ query: 'xem BOM con BellaH màu đen', expectedTypes: ['product-variant'] });
  assert.equal(personal.status, 'resolved');
  assert.equal(personal.target.productCode, 'LGS433');
  assert.equal(personal.source, 'personal-confirmed');
  assert.equal(personal.requiresConfirmation, false);

  assert.equal(resolver().resolve({ query: 'review black dresser' }).source, 'company-confirmed');
  const marketplace = resolver().resolve({ query: 'ULGS433BH02S' });
  assert.equal(marketplace.source, 'marketplace-confirmed');
  assert.deepEqual(marketplace.target, { type: 'product-variant', productCode: 'LGS433', color: '黑色' });
});

test('auto-resolves only a high-score fuzzy read match with sufficient margin', () => {
  const result = resolver().resolve({ query: 'black 8 drawer dresser', expectedTypes: ['product'] });
  assert.equal(result.status, 'resolved');
  assert.equal(result.target.productCode, 'LGS433');
  assert.equal(result.source, 'fuzzy-canonical');
  assert.ok(result.confidence >= 0.9);
  assert.ok(result.margin >= 0.15);

  const proposal = resolver().resolve({ query: 'black 8 drawer dresser', expectedTypes: ['product'], purpose: 'proposal' });
  assert.equal(proposal.requiresConfirmation, true);
});

test('returns at most three candidates when fuzzy evidence is ambiguous', () => {
  const result = resolver().resolve({ query: '8 drawer dresser', expectedTypes: ['product'] });
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.requiresConfirmation, true);
  assert.ok(result.candidates.length <= 3);
  assert.deepEqual(result.candidates.map(item => item.target.productCode), ['LGS433', 'LGS434']);
});

test('fails closed for same-scope collisions, stale targets, wrong types, and unknown colors', () => {
  const collision = resolver({
    personalMappings: [
      mapping({ id: 'mapping_personal_one', scope: 'personal', phrase: 'my dresser', target: { type: 'product', productCode: 'LGS433' } }),
      mapping({ id: 'mapping_personal_two', scope: 'personal', phrase: 'my dresser', target: { type: 'product', productCode: 'LGS434' } }),
    ],
  }).resolve({ query: 'my dresser' });
  assert.equal(collision.status, 'conflicted');

  const stale = resolver({
    personalMappings: [mapping({ id: 'mapping_personal_stale', scope: 'personal', phrase: 'old item', target: { type: 'product', productCode: 'LGS999' } })],
  }).resolve({ query: 'old item' });
  assert.equal(stale.status, 'stale');

  assert.equal(resolver().resolve({ query: 'MAT_001', expectedTypes: ['product'] }).status, 'unresolved');
  const badColor = resolver({
    personalMappings: [mapping({ id: 'mapping_personal_bad_color', scope: 'personal', phrase: 'blue bellah', target: { type: 'product-variant', productCode: 'LGS433', color: '蓝色' } })],
  }).resolve({ query: 'blue bellah' });
  assert.equal(badColor.status, 'stale');
});

test('keeps query, labels, and result candidates bounded', () => {
  const result = resolver().resolve({ query: `${'x'.repeat(1000)} LGS433` });
  assert.ok(result.phrase.length <= 500);
  assert.ok(result.candidates.length <= 3);
  assert.equal(Object.isFrozen(result), true);
});

test('P1 regression: product code + valid color becomes a product-variant', () => {
  for (const query of ['show BOM LGS433 black', 'LGS433 黑色', 'LGS433 màu đen', 'xem BOM LGS433 đen']) {
    const result = resolver().resolve({ query });
    assert.equal(result.status, 'resolved', `query=${query}`);
    assert.deepEqual(result.target, { type: 'product-variant', productCode: 'LGS433', color: '黑色' }, `query=${query}`);
    assert.equal(result.requiresConfirmation, false, `query=${query}`);
  }
});

test('P1 regression: actual antique color aliases resolve to the canonical PDM color', () => {
  for (const query of ['LGS433 复古色', 'LGS433 antique', 'LGS433 vintage', 'LGS433 màu gỗ cổ', 'LGS433 màu cổ điển']) {
    const result = resolver().resolve({ query });
    assert.equal(result.status, 'resolved', `query=${query}`);
    assert.deepEqual(result.target, { type: 'product-variant', productCode: 'LGS433', color: '复古色' }, `query=${query}`);
  }
});

test('P1 regression: product code + unoffered color asks instead of silently defaulting', () => {
  const result = resolver().resolve({ query: 'show BOM LGS433 blue' });
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.requiresConfirmation, true);
  assert.ok(/not available/.test(result.disclosure));
});

test('P1 regression: color lift works end-to-end when no explicit expectedTypes', () => {
  const result = resolver().resolve({ query: 'LGS433 black' });
  assert.equal(result.target.type, 'product-variant');
  assert.equal(result.target.color, '黑色');
});
