import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBilingualDictionary,
  findCanonicalCandidates,
  findCanonicalPair,
  lookupViFromZh,
  lookupZhFromVi,
  normalizeBilingualValue,
} from '../src/domain/bilingual-dictionary.js';

function materialsFixture() {
  return {
    M1: {
      id: 'M1',
      code: 'PAPER-1',
      name: { zh: '纸卡', vi: 'Giấy lót' },
      spec: { zh: '单瓦750×380mm', vi: 'Sóng đơn 750×380mm' },
      material: { zh: '瓦楞纸', vi: 'Giấy carton' },
      color: { zh: '纸色', vi: 'Màu giấy' },
      attr: { zh: '包材', vi: 'Vật liệu đóng gói' },
    },
    M2: {
      id: 'M2',
      code: 'PAPER-2',
      name: { zh: '纸卡', vi: 'Giấy lót' },
      spec: { zh: '', vi: '' },
      material: { zh: '瓦楞纸', vi: 'Giấy carton' },
      color: { zh: '纸色', vi: 'Màu giấy' },
      attr: { zh: '包材', vi: 'Vật liệu đóng gói' },
    },
  };
}

test('bilingual dictionary returns empty field indexes for empty input', () => {
  const dictionary = buildBilingualDictionary({});
  for (const field of ['name', 'material', 'color', 'attr', 'spec']) {
    assert.equal(dictionary[field].pairs.length, 0);
    assert.equal(dictionary[field].zhIndex.size, 0);
    assert.equal(dictionary[field].viIndex.size, 0);
  }
});

test('bilingual dictionary skips incomplete pairs without mutating source data', () => {
  const materials = {
    M1: { code: 'A', name: { zh: '纸卡', vi: '' } },
    M2: { code: 'B', name: { zh: '', vi: 'Giấy lót' } },
  };
  const before = structuredClone(materials);
  const dictionary = buildBilingualDictionary(materials);
  assert.equal(dictionary.name.pairs.length, 0);
  assert.deepEqual(materials, before);
});

test('bilingual dictionary resolves unique values in both directions', () => {
  const dictionary = buildBilingualDictionary(materialsFixture());
  assert.equal(lookupViFromZh(dictionary, 'name', '纸卡'), 'Giấy lót');
  assert.equal(lookupZhFromVi(dictionary, 'name', 'giấy lót'), '纸卡');
  assert.equal(lookupViFromZh(dictionary, 'name', 'unknown'), null);
  assert.equal(lookupZhFromVi(dictionary, 'name', 'unknown'), null);
  assert.deepEqual(
    findCanonicalPair(dictionary, 'name', '  GIẤY   LÓT '),
    { zh: '纸卡', vi: 'Giấy lót', count: 2, materialCodes: ['PAPER-1', 'PAPER-2'] },
  );
});

test('bilingual dictionary covers every supported localized field', () => {
  const dictionary = buildBilingualDictionary(materialsFixture());
  assert.equal(lookupViFromZh(dictionary, 'material', '瓦楞纸'), 'Giấy carton');
  assert.equal(lookupViFromZh(dictionary, 'color', '纸色'), 'Màu giấy');
  assert.equal(lookupViFromZh(dictionary, 'attr', '包材'), 'Vật liệu đóng gói');
  assert.equal(lookupViFromZh(dictionary, 'spec', '单瓦750×380mm'), 'Sóng đơn 750×380mm');
});

test('ambiguous bilingual values return candidates instead of selecting the most frequent value', () => {
  const materials = materialsFixture();
  materials.M3 = {
    ...structuredClone(materials.M1),
    id: 'M3',
    code: 'PAPER-3',
    name: { zh: '纸卡', vi: 'Thẻ giấy' },
  };
  const dictionary = buildBilingualDictionary(materials);
  assert.equal(lookupViFromZh(dictionary, 'name', '纸卡'), null);
  assert.equal(findCanonicalPair(dictionary, 'name', '纸卡'), null);
  assert.deepEqual(
    findCanonicalCandidates(dictionary, 'name', '纸卡').map((item) => item.vi),
    ['Giấy lót', 'Thẻ giấy'],
  );
});

test('normalization preserves semantic distinctions while canonicalizing safe formatting', () => {
  assert.equal(normalizeBilingualValue('  Giấy   lót  '), normalizeBilingualValue('GIẤY LÓT'));
  assert.notEqual(normalizeBilingualValue('Giấy lót'), normalizeBilingualValue('Giay lot'));
  assert.notEqual(normalizeBilingualValue('750380ZK'), normalizeBilingualValue('750380 ZK'));
  assert.notEqual(normalizeBilingualValue('750×380mm'), normalizeBilingualValue('750x380mm'));
});
