import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const guide = readFileSync(new URL('../AI_DEBUG_GUIDE.md', import.meta.url), 'utf8');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('AI debug guide is self-contained, portable, and operational', () => {
  const requiredHeadings = [
    '## 1. Định hướng trong 60 giây',
    '## 2. Bản đồ kiến trúc',
    '## 3. Luồng dữ liệu runtime',
    '## 4. Ma trận triệu chứng',
    '## 5. Debug runbook',
    '## 6. Invariants bắt buộc',
    '## 7. Bẫy thường gặp',
    '## 8. Verification và handoff',
  ];

  for (const heading of requiredHeadings) assert.match(guide, new RegExp(escapeRegExp(heading)));
  for (const path of ['src/domain/', 'src/features/', 'src/infrastructure/', 'src/ui/', 'src/application.js']) {
    assert.match(guide, new RegExp(escapeRegExp(path)));
  }

  assert.match(guide, /npm run build/);
  assert.match(guide, /npm run check/);
  assert.match(guide, /work\\build_standalone_viewer\.mjs/);
  assert.match(guide, /github-sharded-data\.js/);
  assert.match(guide, /github-git-data\.js/);
  assert.match(guide, /exact 24 shards/);
  assert.match(guide, /expectedHeadSha/);
  assert.match(guide, /force:false/);
  assert.match(guide, /there is no `data\.js` fallback/);
  assert.match(guide, /Build normalizes LF\/CRLF/);
  assert.match(guide, /notification history/);
  assert.match(guide, /file:\/\//);
  assert.doesNotMatch(guide, /loadForWrite\(\).*ONLY.*data\.js/i);
  assert.doesNotMatch(guide, /Contents API PUT/i);
  assert.doesNotMatch(guide, /inactive at runtime/i);
  assert.doesNotMatch(guide, /no runtime or save cutover/i);
  assert.doesNotMatch(guide, /Line endings.*build hash.*đổi/i);
  assert.doesNotMatch(guide, /[A-Z]:\\Users\\/i);
  assert.doesNotMatch(guide, /pdm-build[^\n]*[0-9a-f]{12}/i);
  assert.doesNotMatch(guide, /TBD|TODO|PLACEHOLDER/);
});
