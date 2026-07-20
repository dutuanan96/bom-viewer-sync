import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AI_PROMPT_PACK_VERSION, buildAvailableTools } from '../src/features/ai-assistant/index.js';

test('runtime memory provenance uses the active prompt pack version', () => {
  const promptPack = JSON.parse(readFileSync(new URL('../knowledge/ai/prompt-pack.json', import.meta.url), 'utf8'));
  assert.equal(AI_PROMPT_PACK_VERSION, promptPack.packVersion);
});

test('Grade B models receive read-only tools without submit_proposal', () => {
  const tools = buildAvailableTools({ grade: 'B' });

  assert.equal(tools.some(tool => tool.function.name === 'submit_proposal'), false);
  assert.equal(tools.some(tool => tool.function.name === 'search_products'), true);
});

test('Grade A models receive submit_proposal', () => {
  const tools = buildAvailableTools({ grade: 'A' });

  assert.equal(tools.some(tool => tool.function.name === 'submit_proposal'), true);
});

test('unknown model capability fails closed to read-only tools', () => {
  const tools = buildAvailableTools(undefined);

  assert.equal(tools.some(tool => tool.function.name === 'submit_proposal'), false);
});

test('provider-visible tool schemas reject additional properties', () => {
  const tools = buildAvailableTools({ grade: 'A' });

  for (const tool of tools) {
    assert.equal(
      tool.function.parameters.additionalProperties,
      false,
      `${tool.function.name} must reject additional properties`
    );
  }
});

test('provider-visible schemas require a non-empty query and canonical product IDs', () => {
  const tools = buildAvailableTools({ grade: 'A' });
  const byName = new Map(tools.map(tool => [tool.function.name, tool.function.parameters]));

  assert.deepEqual(byName.get('search_products').required, ['query']);
  assert.equal(byName.get('search_products').properties.query.minLength, 1);
  assert.equal(byName.get('get_revision_history').properties.productId.pattern, '^LGS\\d{3,4}$');
  assert.equal(byName.get('compare_boms').properties.productId1.pattern, '^LGS\\d{3,4}$');
  assert.equal(byName.get('compare_boms').properties.productId2.pattern, '^LGS\\d{3,4}$');
});
