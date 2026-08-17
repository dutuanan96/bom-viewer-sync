import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaterial, computeFileHash } from '../scripts/sync-drawing-assets.mjs';

test('matchMaterial matches by exact material code', () => {
  const materials = {
    mat_1: { id: 'mat_1', code: 'LGS032YKBH647', name: { zh: '右侧框' } },
    mat_2: { id: 'mat_2', code: '80132132LJJ', name: { zh: '连接件' } },
  };

  const match1 = matchMaterial('LGS032YKBH647.pdf', materials);
  assert.ok(match1);
  assert.equal(match1.id, 'mat_1');
  assert.equal(match1.matchType, 'exact_code');

  const match2 = matchMaterial('80132132LJJ.pdf', materials);
  assert.ok(match2);
  assert.equal(match2.id, 'mat_2');
});

test('matchMaterial matches by contained material code in filename', () => {
  const materials = {
    mat_1: { id: 'mat_1', code: 'LGS032YKBH647', name: { zh: '右侧框' } },
    mat_2: { id: 'mat_2', code: '2601502ZHKTP', name: { zh: '260左右中框铁片' } },
  };

  const match = matchMaterial('2601502ZHKTP_260_.pdf', materials);
  assert.ok(match);
  assert.equal(match.id, 'mat_2');
  assert.equal(match.matchType, 'contained_code');
});

test('matchMaterial matches by exact Chinese name', () => {
  const materials = {
    mat_1: { id: 'mat_1', code: 'LGS033ZKWH647', name: { zh: 'LGS033左侧框' } },
  };

  const match = matchMaterial('LGS033左侧框.pdf', materials);
  assert.ok(match);
  assert.equal(match.id, 'mat_1');
  assert.equal(match.matchType, 'exact_zh_name');
});

test('computeFileHash returns deterministic 8-character hex hash', () => {
  const buf = Buffer.from('test PDF binary content');
  const hash1 = computeFileHash(buf);
  const hash2 = computeFileHash(buf);

  assert.equal(hash1.length, 8);
  assert.equal(hash1, hash2);
});
