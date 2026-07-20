import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createPdmSkillRegistry } from '../src/features/ai-assistant/pdm-skill-registry.js';

const promptPack = JSON.parse(readFileSync(new URL('../knowledge/ai/prompt-pack.json', import.meta.url), 'utf8'));
const skillsPack = JSON.parse(readFileSync(new URL('../knowledge/ai/skills.json', import.meta.url), 'utf8'));

test('selects one deterministic specialist and emits compact guidance', () => {
  const registry = createPdmSkillRegistry({ promptPack, skillsPack });
  const selected = registry.select({ intent: 'bom_compare', confidence: 'deterministic' });

  assert.equal(selected.id, 'bom_comparison');
  assert.deepEqual(selected.allowedTools, ['compare_boms']);
  assert.match(registry.promptFor(selected), /materialId/i);
  assert.doesNotMatch(registry.promptFor(selected), /marketplace/i);
  assert.equal(Object.isFrozen(selected), true);
});

test('does not inject a specialist for ambiguous turns', () => {
  const registry = createPdmSkillRegistry({ promptPack, skillsPack });
  assert.equal(registry.select({ intent: 'ambiguous', confidence: 'ambiguous' }), null);
});

test('rejects specialist tools outside the governed tool pack', () => {
  const invalidPack = {
    ...promptPack,
    specialists: promptPack.specialists.map((specialist, index) => index === 0
      ? { ...specialist, allowedTools: ['github_write'] }
      : specialist),
  };

  assert.throws(
    () => createPdmSkillRegistry({ promptPack: invalidPack, skillsPack }),
    /unauthorized tool/i,
  );
});

test('fails closed when specialist instructions are absent', () => {
  const invalidPack = {
    ...promptPack,
    specialists: promptPack.specialists.map((specialist, index) => index === 0
      ? { ...specialist, instructions: [] }
      : specialist),
  };

  assert.throws(
    () => createPdmSkillRegistry({ promptPack: invalidPack, skillsPack }),
    /instructions/i,
  );
});
