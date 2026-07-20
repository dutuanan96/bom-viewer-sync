// tests/ai-knowledge-pack.test.mjs — R1.4 knowledge pack validation
// Verifies that all knowledge pack files satisfy schema, provenance, and governance rules.
// Does NOT make network calls. Deterministic test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadJson(relativePath) {
  try {
    return JSON.parse(readFileSync(resolve(relativePath), 'utf-8'));
  } catch (e) {
    throw new Error(`Failed to load ${relativePath}: ${e.message}`);
  }
}

// ── Load packs ────────────────────────────────────────────────────────────────

const skillsPack = loadJson('knowledge/ai/skills.json');
const promptPack = loadJson('knowledge/ai/prompt-pack.json');
const pdmExpertPack = loadJson('knowledge/pdm-expert-pack.json');
const marketplaceAliases = loadJson('knowledge/marketplace-aliases.json');
const contractsSrc = readFileSync(resolve('src/features/ai-assistant/contracts.js'), 'utf-8');

// ── Skills pack ───────────────────────────────────────────────────────────────

test('knowledge/ai/skills.json has schemaVersion, packVersion, updatedAt', () => {
  assert.ok(skillsPack.schemaVersion, 'must have schemaVersion');
  assert.ok(skillsPack.packVersion, 'must have packVersion');
  assert.ok(skillsPack.updatedAt, 'must have updatedAt');
});

test('knowledge/ai/skills.json tool IDs all exist in contracts.js ALLOWED_TOOLS', () => {
  for (const skill of skillsPack.skills) {
    assert.ok(skill.id, `skill missing id: ${JSON.stringify(skill)}`);
    // Tool ID must appear in contracts.js ALLOWED_TOOLS set
    assert.ok(
      contractsSrc.includes(`'${skill.id}'`),
      `skill id '${skill.id}' not found in contracts.js ALLOWED_TOOLS`
    );
  }
});

test('knowledge/ai/skills.json all skills are marked readonly', () => {
  for (const skill of skillsPack.skills) {
    assert.equal(skill.readonly, true, `skill '${skill.id}' must be marked readonly`);
  }
});

test('knowledge/ai/skills.json has no mutation tools', () => {
  const mutationKeywords = ['write', 'delete', 'save', 'release', 'create', 'update', 'push'];
  for (const skill of skillsPack.skills) {
    for (const keyword of mutationKeywords) {
      assert.ok(
        !skill.id.toLowerCase().includes(keyword),
        `skill '${skill.id}' looks like a mutation tool and must not be in R1 read-only skills`
      );
    }
  }
});

// ── Prompt pack ───────────────────────────────────────────────────────────────

test('knowledge/ai/prompt-pack.json has required metadata fields', () => {
  assert.ok(promptPack.schemaVersion, 'must have schemaVersion');
  assert.ok(promptPack.packVersion, 'must have packVersion');
  assert.ok(promptPack.updatedAt, 'must have updatedAt');
});

test('knowledge/ai/prompt-pack.json roles array is non-empty', () => {
  assert.ok(Array.isArray(promptPack.roles) && promptPack.roles.length > 0);
  for (const role of promptPack.roles) {
    assert.ok(role.id, `role missing id`);
    assert.ok(role.level, `role '${role.id}' missing level`);
  }
});

// ── PDM expert pack ───────────────────────────────────────────────────────────

test('knowledge/pdm-expert-pack.json has schemaVersion, packVersion, updatedAt', () => {
  assert.ok(pdmExpertPack.schemaVersion);
  assert.ok(pdmExpertPack.packVersion);
  assert.ok(pdmExpertPack.updatedAt);
});

test('knowledge/pdm-expert-pack.json documents that productRevisions is an object, not an array', () => {
  const note = pdmExpertPack.productRevisionStructure?.note || '';
  assert.ok(note.toLowerCase().includes('object'), 'must document that productRevisions record is an object');
  assert.ok(
    pdmExpertPack.productRevisionStructure?.fields?.revisions,
    'must document revisions field'
  );
});

test('knowledge/pdm-expert-pack.json documents that bom products have no .id field', () => {
  const note = pdmExpertPack.productStructure?.note || '';
  assert.ok(note.includes('code') || note.includes('key'), 'must document using productCode/map key');
});

// ── Marketplace aliases ───────────────────────────────────────────────────────

test('knowledge/marketplace-aliases.json has schemaVersion, packVersion, updatedAt, governance', () => {
  assert.ok(marketplaceAliases.schemaVersion);
  assert.ok(marketplaceAliases.packVersion);
  assert.ok(marketplaceAliases.updatedAt);
  assert.ok(marketplaceAliases.governance, 'must have governance block');
});

test('knowledge/marketplace-aliases.json governance blocks ASIN without approval', () => {
  const asinPolicy = marketplaceAliases.governance?.asinPolicy || '';
  assert.ok(
    asinPolicy.toLowerCase().includes('asin') &&
    (asinPolicy.toLowerCase().includes('not') || asinPolicy.toLowerCase().includes('separate')),
    'must explicitly state ASIN requires separate approval'
  );
});

test('knowledge/marketplace-aliases.json does NOT include B0GTZDGNGN ASIN in alias entries', () => {
  const raw = JSON.stringify(marketplaceAliases.aliases || {});
  assert.ok(!raw.includes('B0GTZDGNGN'), 'ASIN B0GTZDGNGN must not appear in alias entries — it was not user-confirmed');
});

test('knowledge/marketplace-aliases.json alias ULGS433BH02S maps to correct internal SKU and product', () => {
  const alias = marketplaceAliases.aliases?.['ULGS433BH02S'];
  assert.ok(alias, 'ULGS433BH02S must be present (user-confirmed)');
  assert.equal(alias.internalSku, 'LGS433BH02S');
  assert.equal(alias.productCode, 'LGS433');
  assert.ok(alias.confirmedBy, 'must have confirmedBy field');
});

test('knowledge/marketplace-aliases.json all aliases have required fields', () => {
  for (const [aliasKey, entry] of Object.entries(marketplaceAliases.aliases || {})) {
    assert.ok(entry.internalSku, `alias '${aliasKey}' missing internalSku`);
    assert.ok(entry.productCode, `alias '${aliasKey}' missing productCode`);
    assert.ok(entry.resolution, `alias '${aliasKey}' missing resolution`);
    assert.ok(entry.confirmedBy, `alias '${aliasKey}' missing confirmedBy`);
    assert.ok(entry.confirmedAt, `alias '${aliasKey}' missing confirmedAt`);
  }
});
