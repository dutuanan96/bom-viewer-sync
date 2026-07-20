import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTool } from '../src/features/ai-assistant/tools.js';

const goldenCasesPath = resolve(process.cwd(), 'evals/ai/golden-cases.json');
const redTeamCasesPath = resolve(process.cwd(), 'evals/ai/red-team-cases.json');

const goldenCases = JSON.parse(readFileSync(goldenCasesPath, 'utf-8'));
const redTeamCases = JSON.parse(readFileSync(redTeamCasesPath, 'utf-8'));

function validateCaseFormat(c) {
  if (!c.id) throw new Error(`Missing id in case`);
  if (!c.description) throw new Error(`Missing description in case ${c.id}`);
  if (!c.input) throw new Error(`Missing input in case ${c.id}`);
  if (!c.expected && !c.expectError) throw new Error(`Missing expected or expectError in case ${c.id}`);
}

test('Golden Cases', async (t) => {
  for (const c of goldenCases) {
    validateCaseFormat(c);
    await t.test(c.description, async () => {
      // Mock snapshot for now, we can enhance this to load real data
      const snapshot = {
        payload: {
          bom: {
            LGS433: {
              id: 'LGS433',
              materials: [{ comp_code: 'BH02S' }]
            }
          }
        }
      };

      if (c.id.startsWith('SKU_')) {
        const result = await executeTool('resolve_sku', { alias: c.input }, snapshot);
        assert.deepEqual(result, c.expected);
      } else {
        // Implement other tools as needed for golden cases
        const result = await executeTool(c.input.name, c.input.arguments, snapshot);
        assert.deepEqual(result, c.expected);
      }
    });
  }
});

test('Red Team Cases', async (t) => {
  for (const c of redTeamCases) {
    validateCaseFormat(c);
    await t.test(c.description, async () => {
      const snapshot = { payload: {} };
      let error;
      let args = c.input.arguments;
      if (args === 'x_oversized') {
        args = 'x'.repeat(6000);
      }
      try {
        await executeTool(c.input.name, args, snapshot);
      } catch (e) {
        error = e;
      }
      assert.ok(error, 'Expected an error');
      assert.match(error.message, new RegExp(c.expectError));
    });
  }
});
