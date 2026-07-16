import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const durableDocumentNames = [
  'README.md',
  'AI_DEBUG_GUIDE.md',
  'docs/ARCHITECTURE.md',
  'docs/RELEASE.md',
];

const legacyDocumentNames = [
  'HANDOVER.md',
  'PROJECT_CONTEXT.md',
  'REVIEW_CONTEXT.md',
  'README_SYNC.md',
];

const documents = new Map(
  durableDocumentNames.map((name) => {
    const url = new URL(`../${name}`, import.meta.url);
    return [name, existsSync(url) ? readFileSync(url, 'utf8') : ''];
  }),
);

test('repository keeps one minimal durable documentation set', () => {
  for (const name of durableDocumentNames) {
    assert.notEqual(documents.get(name), '', `${name} must exist and contain documentation`);
  }

  for (const name of legacyDocumentNames) {
    assert.equal(existsSync(new URL(`../${name}`, import.meta.url)), false, `${name} must be removed`);
  }
});

test('durable documents remain portable and free of volatile snapshots', () => {
  for (const [name, content] of documents) {
    assert.doesNotMatch(content, /[^\x09\x0A\x0D\x20-\x7E]/, `${name} contains non-ASCII or corrupted text`);
    assert.doesNotMatch(content, /[A-Z]:\\Users\\/i, `${name} contains a machine-specific user path`);
    assert.doesNotMatch(content, /\b[0-9a-f]{40}\b/i, `${name} contains a commit snapshot`);
    assert.doesNotMatch(
      content,
      /\b\d+\s+(materials|BOM entries|products|notifications)\b/i,
      `${name} contains volatile data counts`,
    );
  }
});

test('durable documents have distinct responsibilities and navigation', () => {
  assert.match(documents.get('README.md'), /Project entrypoint/);
  assert.match(documents.get('AI_DEBUG_GUIDE.md'), /Operational debugging guide/);
  assert.match(documents.get('docs/ARCHITECTURE.md'), /Stable system architecture/);
  assert.match(documents.get('docs/RELEASE.md'), /Build, verification, and publication/);

  for (const target of ['AI_DEBUG_GUIDE.md', 'docs/ARCHITECTURE.md', 'docs/RELEASE.md']) {
    assert.match(documents.get('README.md'), new RegExp(target.replaceAll('.', '\\.')));
  }
});

test('documentation preserves source, data, and mirror safety boundaries', () => {
  const combined = [...documents.values()].join('\n');
  assert.match(combined, /exact 24 shards/);
  assert.match(combined, /`data\.js` is .*rollback/i);
  assert.match(combined, /Generated artifacts are never hand-edited/);
  assert.match(combined, /Mirrors are non-canonical/);
  assert.doesNotMatch(combined, /Desktop contains the current|outputs\/.*match the reviewed build/i);
});
