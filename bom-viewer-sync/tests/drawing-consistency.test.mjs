import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const materialsPath = path.join(repoRoot, 'data', 'materials.json');

test('all shared materials with identical technical specs have consistent drawing URLs', () => {
  const matData = JSON.parse(fs.readFileSync(materialsPath, 'utf8'));
  const materials = matData.materialDb?.materials || {};

  const groups = new Map();

  for (const [id, m] of Object.entries(materials)) {
    const nameZh = String(m.name?.zh || '').trim();
    const specZh = String(m.spec?.zh || '').trim();
    const rawMatZh = String(m.material?.zh || '').trim();
    const attrZh = String(m.attr?.zh || '').trim();
    const drawings = m.drawings || [];

    if (!drawings.length) continue;

    const key = `${nameZh} | ${specZh} | ${rawMatZh} | ${attrZh}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id, code: m.code, drawings });
  }

  const inconsistentGroups = [];

  for (const [key, items] of groups.entries()) {
    if (items.length <= 1) continue;

    const urls = new Set();
    for (const it of items) {
      for (const d of it.drawings) {
        if (d.url) urls.add(d.url);
      }
    }

    if (urls.size > 1) {
      inconsistentGroups.push({
        key,
        itemCount: items.length,
        distinctUrls: [...urls],
      });
    }
  }

  assert.equal(
    inconsistentGroups.length,
    0,
    `Found ${inconsistentGroups.length} material groups with fragmented drawing URLs: ${JSON.stringify(inconsistentGroups, null, 2)}`
  );
});
