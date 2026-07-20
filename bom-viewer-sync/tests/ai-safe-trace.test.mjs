import test from 'node:test';
import assert from 'node:assert/strict';

import { createSafeTrace } from '../src/features/ai-assistant/safe-trace.js';

function allStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach(item => allStrings(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => allStrings(item, output));
  return output;
}

test('safe trace keeps only allowlisted operational fields and redacts secrets', () => {
  let current = 1000;
  const trace = createSafeTrace({ now: () => current });
  current = 1012;
  trace.add('route_selected', {
    intent: 'revision_status',
    status: 'deterministic',
    rawPrompt: 'Why is LGS032 draft?',
    apiKey: 'sk-test-secret-1234567890',
    authorization: 'Bearer private-value-1234567890',
    providerError: 'upstream dumped private payload'
  });
  current = 1025;
  trace.add('model_requested', {
    modelId: 'sk-test-secret-1234567890',
    usage: { modelCalls: 1, promptTokens: 12, rawPrompt: 999 },
    oversized: 'x'.repeat(1000)
  });

  const result = trace.finish();
  const serialized = JSON.stringify(result);
  assert.equal(Object.isFrozen(result), true);
  assert.doesNotMatch(serialized, /sk-test|Bearer|rawPrompt|authorization|providerError|private payload/i);
  assert.deepEqual(Object.keys(result[0]).sort(), ['intent', 'offsetMs', 'status', 'type']);
  assert.equal(result[1].modelId, '[redacted]');
  assert.deepEqual(result[1].usage, { modelCalls: 1, promptTokens: 12 });
  assert.equal(allStrings(result).every(value => value.length <= 200), true);
});

test('safe trace is bounded to 32 deeply frozen events', () => {
  let current = 0;
  const trace = createSafeTrace({ now: () => current++ });
  for (let index = 0; index < 40; index += 1) {
    trace.add('tool_completed', {
      toolName: 'get_revision_history',
      status: 'success',
      latencyMs: index,
      evidenceIds: [`PDM-LGS032-${index}`]
    });
  }

  const result = trace.finish();
  assert.equal(result.length, 32);
  assert.equal(Object.isFrozen(result[0]), true);
  assert.equal(Object.isFrozen(result[0].evidenceIds), true);
  assert.throws(() => { result.push({}); }, TypeError);
});

test('safe trace rejects unknown event types', () => {
  const trace = createSafeTrace();
  assert.throws(() => trace.add('raw_provider_payload', { status: 'error' }), /event type/i);
});
