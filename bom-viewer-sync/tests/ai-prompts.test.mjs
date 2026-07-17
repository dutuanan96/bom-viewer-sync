import test from 'node:test';
import assert from 'node:assert/strict';
import { getPdmPromptContext } from '../src/features/ai-assistant/prompts.js';

test('getPdmPromptContext returns valid context without network calls', () => {
  const contextZh = getPdmPromptContext('zh');
  assert.ok(contextZh.systemInstructions.length > 0);
  assert.ok(contextZh.strictRules.length > 0);
  assert.ok(contextZh.uiVocabulary);

  const contextVi = getPdmPromptContext('vi');
  assert.ok(contextVi.systemInstructions.length > 0);
  assert.ok(contextVi.strictRules.length > 0);
  assert.ok(contextVi.uiVocabulary);
});
