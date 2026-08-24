import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const guide = readFileSync(new URL('../AI_DEBUG_GUIDE.md', import.meta.url), 'utf8');

test('AI debug guide is readable, self-contained, and operational', () => {
  const requiredHeadings = [
    '## 1. Start Here',
    '## 2. Source And Artifact Boundaries',
    '## 3. Runtime Data Flow',
    '## 4. Module Ownership',
    '## 5. Debugging Runbook',
    '## 6. Required Invariants',
    '## 7. Verification And Handoff',
  ];

  for (const heading of requiredHeadings) assert.match(guide, new RegExp(heading.replaceAll('.', '\\.')));
  for (const path of ['src/domain/', 'src/features/', 'src/infrastructure/', 'src/ui/', 'src/application.js']) {
    assert.match(guide, new RegExp(path.replaceAll('.', '\\.')));
  }

  assert.match(guide, /npm run build/);
  assert.match(guide, /npm run check/);
  assert.match(guide, /github-sharded-data\.js/);
  assert.match(guide, /github-git-data\.js/);
  assert.match(guide, /manifest-defined shard set/);
  assert.match(guide, /expectedHeadSha/);
  assert.match(guide, /force:false/);
  assert.match(guide, /there is no `data\.js` fallback/);
  assert.match(guide, /LF\/CRLF/);
  assert.match(guide, /file:\/\//);
  assert.doesNotMatch(guide, /[^\x09\x0A\x0D\x20-\x7E]/);
  assert.doesNotMatch(guide, /[A-Z]:\\Users\\/i);
  assert.doesNotMatch(guide, /TBD|TODO|PLACEHOLDER/);
});
