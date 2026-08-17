import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaterials, computeFileHash } from '../scripts/sync-drawing-assets.mjs';

test('matchMaterials matches by exact material code', () => {
  const materials = {
    mat_1: { id: 'mat_1', code: 'LGS032YKBH647', name: { zh: '右侧框' } },
    mat_2: { id: 'mat_2', code: '80132132LJJ', name: { zh: '连接件' } },
  };

  const match1 = matchMaterials('LGS032YKBH647.pdf', materials);
  assert.equal(match1.length, 1);
  assert.equal(match1[0].id, 'mat_1');
  assert.equal(match1[0].matchType, 'exact_code');

  const match2 = matchMaterials('80132132LJJ.pdf', materials);
  assert.equal(match2.length, 1);
  assert.equal(match2[0].id, 'mat_2');
});

test('matchMaterials matches by contained material code in filename', () => {
  const materials = {
    mat_1: { id: 'mat_1', code: 'LGS032YKBH647', name: { zh: '右侧框' } },
    mat_2: { id: 'mat_2', code: '2601502ZHKTP', name: { zh: '260左右中框铁片' } },
  };

  const match = matchMaterials('2601502ZHKTP_260_.pdf', materials);
  assert.equal(match.length, 1);
  assert.equal(match[0].id, 'mat_2');
  assert.equal(match[0].matchType, 'contained_code');
});

test('matchMaterials matches all color variants sharing an exact Chinese name', () => {
  const materials = {
    mat_1: { id: 'mat_1', code: 'BC257282168KD', name: { zh: 'LGS布抽25.7x28.2x16.8' }, color: { zh: '复古色' } },
    mat_2: { id: 'mat_2', code: 'BC257282168WH', name: { zh: 'LGS布抽25.7x28.2x16.8' }, color: { zh: '白色' } },
    mat_3: { id: 'mat_3', code: 'BC257282168BH', name: { zh: 'LGS布抽25.7x28.2x16.8' }, color: { zh: '黑色' } },
  };

  const matches = matchMaterials('LGS布抽25.7x28.2x16.8.pdf', materials);
  assert.equal(matches.length, 3);
  assert.deepEqual(matches.map(m => m.id), ['mat_1', 'mat_2', 'mat_3']);
  assert.ok(matches.every(m => m.matchType === 'exact_zh_name'));
});

test('computeFileHash returns deterministic 8-character hex hash', () => {
  const buf = Buffer.from('test PDF binary content');
  const hash1 = computeFileHash(buf);
  const hash2 = computeFileHash(buf);

  assert.equal(hash1.length, 8);
  assert.equal(hash1, hash2);
});
