import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/features/ai-assistant/runtime.js';
import { createOpenRouterGateway } from '../src/features/ai-assistant/openrouter-gateway.js';
import { createTrustPolicy } from '../src/features/ai-assistant/trust-policy.js';

// ── Mock Helpers ──────────────────────────────────────────────────────────────

function createMockGateway({ chatResponses = [], onChat = null, shouldFail = false, failCode = 500 } = {}) {
  let callCount = 0;
  return {
    async connect() { return { connected: true }; },
    clearKey() {},
    async refreshModels() {},
    listModels() { return [{ id: 'mock-model', grade: 'A' }]; },
    getFallbackChain() { return []; },
    async chat(req) {
      if (onChat) onChat(JSON.parse(JSON.stringify(req)));
      if (shouldFail) {
        const err = new Error('Gateway Error');
        err.status = failCode;
        throw err;
      }
      const response = chatResponses[callCount] || { choices: [{ message: { content: 'Default response' } }] };
      callCount++;
      return response;
    },
    diagnostics() { return { connected: true }; }
  };
}

function createMockTools(handlers = {}) {
  return async (call) => {
    if (handlers[call.name]) {
      return handlers[call.name](call.arguments);
    }
    throw new Error(`Tool not found: ${call.name}`);
  };
}

const VALID_SNAPSHOT = {
  sourceMetadata: { commitSha: 'a'.repeat(40) },
  selection: { productCode: 'LGS433' }
};

// ── Tests ─────────────────────────────────────────────────────────────────────

test('R2.3: runtime handles a simple no-tool answer', async () => {
  const gateway = createMockGateway({
    chatResponses: [
      {
        choices: [{ message: { role: 'assistant', content: 'Here is the answer' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      }
    ]
  });
  const policy = createTrustPolicy();
  const runtime = createRuntime({ gateway, trustPolicy: policy });

  const result = await runtime.runTurn({
    query: 'Hello',
    snapshot: VALID_SNAPSHOT,
    model: 'mock-model',
    availableTools: []
  });

  assert.equal(result.text, 'Here is the answer');
  assert.deepEqual(result.citations, []);
  assert.ok(result.usage);
  assert.equal(result.usage.modelCalls, 1);
});

test('R2.3: runtime executes a complete tool loop', async () => {
  let chatRequests = [];
  const gateway = createMockGateway({
    onChat: (req) => chatRequests.push(req),
    chatResponses: [
      { // Turn 1: model calls tool
        choices: [{
          message: {
            role: 'assistant',
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_products', arguments: '{"query":"LGS"}' } }]
          }
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      },
      { // Turn 2: model answers
        choices: [{ message: { role: 'assistant', content: 'Found it.' } }],
        usage: { prompt_tokens: 15, completion_tokens: 5 }
      }
    ]
  });

  const toolRunner = createMockTools({
    search_products: () => ({ results: ['LGS433'] })
  });

  const policy = createTrustPolicy();
  const runtime = createRuntime({ gateway, trustPolicy: policy, runTool: toolRunner });

  const result = await runtime.runTurn({
    query: 'Find LGS',
    snapshot: VALID_SNAPSHOT,
    model: 'mock-model',
    availableTools: [{ type: 'function', function: { name: 'search_products' } }]
  });

  assert.equal(result.text, 'Found it.');
  assert.equal(chatRequests.length, 2, 'should make 2 model calls');
  assert.equal(chatRequests[1].messages[chatRequests[1].messages.length - 1].role, 'tool', 'last message should be tool result');
});

test('R2.3: runtime enforces parallel_tool_calls=false', async () => {
  let capturedReq;
  const gateway = createMockGateway({
    onChat: (req) => { capturedReq = req; },
    chatResponses: [{ choices: [{ message: { role: 'assistant', content: 'ok' } }] }]
  });
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });

  await runtime.runTurn({ query: 'Hello', snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools: [] });
  
  assert.equal(capturedReq.parallel_tool_calls, false, 'must set parallel_tool_calls to false');
});

test('R2.3: runtime fails closed on budget exceed (max model calls)', async () => {
  const gateway = createMockGateway({
    chatResponses: [
      { choices: [{ message: { role: 'assistant', tool_calls: [{ id: '1', type: 'function', function: { name: 'search_products', arguments: '{}' } }] } }] },
      { choices: [{ message: { role: 'assistant', tool_calls: [{ id: '2', type: 'function', function: { name: 'search_products', arguments: '{}' } }] } }] },
      { choices: [{ message: { role: 'assistant', tool_calls: [{ id: '3', type: 'function', function: { name: 'search_products', arguments: '{}' } }] } }] },
      { choices: [{ message: { role: 'assistant', content: 'Answer' } }] }
    ]
  });
  const toolRunner = createMockTools({ search_products: () => ({}) });
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy(), runTool: toolRunner });

  await assert.rejects(
    () => runtime.runTurn({ query: 'Loop', snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools: [{ type: 'function', function: { name: 'search_products' } }] }),
    /budget exceeded|max.*model calls/i
  );
});

test('R2.3: runtime provides deterministic local fallback on provider error', async () => {
  const gateway = createMockGateway({ shouldFail: true, failCode: 503 });
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });

  const result = await runtime.runTurn({ query: 'Hello', snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools: [] });
  
  assert.ok(result.text.includes('AI assistant is currently unavailable'), 'must return deterministic fallback message');
  assert.ok(result.fallback, 'must flag as fallback');
});

test('R2.3: runtime supports cancellation', async () => {
  const gateway = createMockGateway({ chatResponses: [{ choices: [{ message: { content: 'ok' } }] }] });
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });
  
  const abortController = new AbortController();
  abortController.abort(); // Cancel immediately

  await assert.rejects(
    () => runtime.runTurn({ query: 'Hello', snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools: [], signal: abortController.signal }),
    /abort|cancel/i
  );
});

test('R2.3: fails closed on invalid structured output', async () => {
  const gateway = createMockGateway({
    chatResponses: [
      { choices: [{ message: { role: 'assistant', content: '<script>alert(1)</script>' } }] } // Will be rejected by trust-policy
    ]
  });
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });

  await assert.rejects(
    () => runtime.runTurn({ query: 'Hack', snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools: [] }),
    /unsafe|html/i
  );
});
