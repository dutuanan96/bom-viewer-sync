import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentController } from '../src/features/ai-assistant/agent-controller.js';

test('agent-controller: routes intent to OpenRouter webSearch and maps citations', async () => {
  const mockGateway = {
    listModels: () => [{ id: 'test-model', grade: 'supported' }],
    chat: async (params) => {
      assert.equal(params.webSearch, true, 'Should enable webSearch for research intent');
      return {
        model: 'test-model',
        usage: { prompt_tokens: 10, completion_tokens: 10 },
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Found some good info on the web.',
              annotations: [
                { type: 'url_citation', url_citation: { url: 'https://jintai-official.com/docs/test' } },
                { type: 'url_citation', url_citation: { url: 'https://taobao.com/item/123' } }
              ]
            }
          }
        ]
      };
    }
  };

  const mockTrustPolicy = {
    buildContext: () => ({ query: 'test query' }),
    createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
    validateModelOutput: (output, ledgerState) => {
      return { text: output.text, citations: ledgerState.evidence.map(e => e.id) };
    }
  };

  const controller = createAgentController({ gateway: mockGateway, trustPolicy: mockTrustPolicy, runTool: async () => ({}) });

  const result = await controller.runTurn({
    query: 'Research latest BOM standard',
    route: { intent: 'research_web', confidence: 'deterministic' },
    snapshot: { sourceMetadata: { commitSha: 'a'.repeat(40) } },
    model: 'test-model',
    marketplaceWebEnabled: true
  });

  assert.equal(result.text, 'Found some good info on the web.');
  assert.equal(result.citations.length, 2);
  // Citations should be mapped by the ledger! We can't easily assert the ledger mapping from the outside if they just return IDs, 
  // but we know it parsed 2 URLs.
});

test('agent-controller: runs tools and collects evidence', async () => {
  const mockGateway = {
    listModels: () => [{ id: 'test-model', grade: 'supported' }],
    chat: async (params) => {
      if (params.messages.some(m => m.role === 'tool')) {
        return {
          model: 'test-model',
          choices: [{ message: { role: 'assistant', content: 'Tool done.' } }]
        };
      }
      return {
        model: 'test-model',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_1',
                function: { name: 'audit_product_data', arguments: '{"productId":"LGS123"}' }
              }]
            }
          }
        ]
      };
    }
  };

  const mockTrustPolicy = {
    buildContext: () => ({ query: 'audit LGS123' }),
    createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
    authorizeToolCall: (call) => call,
    validateModelOutput: (output, ledgerState) => {
      return { text: output.text, citations: ledgerState.evidence.map(e => e.id) };
    }
  };

  const controller = createAgentController({
    gateway: mockGateway,
    trustPolicy: mockTrustPolicy,
    runTool: async () => ({
      evidence: {
        id: 'ev_123',
        sourceType: 'pdm-tool',
        sourceRef: 'audit_product_data',
        sourceCommit: 'a'.repeat(40),
        capturedAt: new Date().toISOString(),
        sourcePath: 'tool/audit'
      }
    })
  });

  const result = await controller.runTurn({
    query: 'audit LGS123',
    availableTools: ['audit_product_data'],
    model: 'test-model'
  });

  assert.equal(result.text, 'Tool done.');
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0], 'ev_123'); // Should track the evidence from the tool result
});

test('agent-controller: retries one compatible free model when the selected endpoint is unavailable', async () => {
  const calls = [];
  const mockGateway = {
    listModels: () => [
      { id: 'primary:free', grade: 'B' },
      { id: 'fallback:free', grade: 'B' },
    ],
    chat: async ({ model, maxTokens }) => {
      calls.push({ model, maxTokens });
      if (model === 'primary:free') {
        const error = new Error('No compatible endpoints found');
        error.code = 'AI_NO_COMPATIBLE_ENDPOINT';
        throw error;
      }
      return {
        model,
        choices: [{ message: { role: 'assistant', content: 'Fallback model answered.' } }],
      };
    },
  };
  const budget = {
    recordToolCall: () => {},
    recordModelCall: () => {},
    checkExpiry: () => {},
    summary: () => ({ limits: { maxOutputTokens: 3000 } }),
  };
  const mockTrustPolicy = {
    buildContext: ({ query }) => ({ query }),
    createBudget: () => budget,
    validateModelOutput: output => output,
  };
  const controller = createAgentController({ gateway: mockGateway, trustPolicy: mockTrustPolicy });

  const result = await controller.runTurn({
    query: 'Explain this PDM item',
    route: { intent: 'open_question', confidence: 'model', entities: {} },
    snapshot: {},
    model: 'primary:free',
    availableTools: [],
  });

  assert.equal(result.text, 'Fallback model answered.');
  assert.deepEqual(calls.map(call => call.model), ['primary:free', 'fallback:free']);
  assert.ok(calls.every(call => call.maxTokens === 3000));
  assert.equal(result.usage.actualModel, 'fallback:free');
});

test('agent-controller: lets the model choose a read-only discovery tool for an ambiguous long-tail request', async () => {
  let callCount = 0;
  const mockGateway = {
    listModels: () => [{ id: 'reasoning:free', grade: 'B' }],
    chat: async () => {
      callCount += 1;
      if (callCount === 1) {
        return { choices: [{ message: { role: 'assistant', tool_calls: [{
          id: 'search_1',
          function: { name: 'search_pdm', arguments: '{"query":"460x282x187"}' },
        }] } }] };
      }
      return { choices: [{ message: { role: 'assistant', content: 'LGS723 uses the matching material.' } }] };
    },
  };
  const mockTrustPolicy = {
    buildContext: ({ query }) => ({ query }),
    createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
    authorizeToolCall: call => call,
    validateModelOutput: output => output,
  };
  const toolCalls = [];
  const controller = createAgentController({
    gateway: mockGateway,
    trustPolicy: mockTrustPolicy,
    runTool: async call => {
      toolCalls.push(call);
      return { products: [{ productCode: 'LGS723' }] };
    },
  });

  const result = await controller.runTurn({
    query: 'Can you figure out which cabinet this unusual drawer belongs to?',
    route: { intent: 'ambiguous', confidence: 'ambiguous', entities: {} },
    snapshot: {},
    model: 'reasoning:free',
    availableTools: ['search_pdm'],
    conversationContext: { productIds: ['LGS723'] },
  });

  assert.equal(result.text, 'LGS723 uses the matching material.');
  assert.equal(toolCalls[0].name, 'search_pdm');
  assert.equal(callCount, 2);
  assert.deepEqual(result.conversationContext, {
    productIds: ['LGS723'],
    materialIds: [],
    revisions: [],
    searchQuery: '460x282x187',
  });
});

test('agent-controller: returns trusted local facts when prefetch succeeded but every provider endpoint failed', async () => {
  const providerError = new Error('Overloaded');
  providerError.status = 503;
  const mockGateway = {
    listModels: () => [{ id: 'only:free', grade: 'B' }],
    chat: async () => { throw providerError; },
  };
  const mockTrustPolicy = {
    buildContext: ({ query }) => ({ query }),
    createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
    authorizeToolCall: call => call,
    validateModelOutput: output => output,
  };
  const evidence = {
    id: 'search-local-1',
    sourceType: 'pdm-search',
    sourcePath: 'data/materials.json',
    recordId: '460x282x187',
    sourceCommit: 'a'.repeat(40),
    capturedAt: '2026-07-22T00:00:00Z',
  };
  const toolCalls = [];
  const controller = createAgentController({
    gateway: mockGateway,
    trustPolicy: mockTrustPolicy,
    runTool: async call => {
      toolCalls.push(call);
      return {
        query: call.arguments.query,
        products: [],
        materials: [{ materialId: 'mat_drawer', usedBy: [{ productCode: 'LGS723' }] }],
        revisions: [],
        totalMatches: 1,
        truncated: false,
        evidence,
      };
    },
    formatToolFallback: () => 'Trusted local PDM result: LGS723.',
  });

  const result = await controller.runTurn({
    query: 'Is LGS723 the only one?',
    route: {
      intent: 'pdm_search',
      confidence: 'deterministic',
      preferredTool: 'search_pdm',
      entities: { searchQuery: '460x282x187' },
    },
    snapshot: { sourceMetadata: { commitSha: 'a'.repeat(40) } },
    model: 'only:free',
    availableTools: ['search_pdm'],
  });

  assert.equal(result.text, 'Trusted local PDM result: LGS723.');
  assert.deepEqual(result.citations, ['search-local-1']);
  assert.equal(result.fallback, true);
  assert.equal(toolCalls[0].arguments.query, '460x282x187');
  assert.deepEqual(result.conversationContext, {
    productIds: ['LGS723'],
    materialIds: ['mat_drawer'],
    revisions: [],
    searchQuery: '460x282x187',
  });
});

test('agent-controller: passes an explicit product scope to deterministic PDM search', async () => {
  const mockGateway = {
    listModels: () => [{ id: 'reasoning:free', grade: 'B' }],
    chat: async () => ({ choices: [{ message: { role: 'assistant', content: 'LGS043 drawer result.' } }] }),
  };
  const mockTrustPolicy = {
    buildContext: ({ query }) => ({ query }),
    createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
    authorizeToolCall: call => call,
    validateModelOutput: output => output,
  };
  const toolCalls = [];
  const controller = createAgentController({
    gateway: mockGateway,
    trustPolicy: mockTrustPolicy,
    runTool: async call => {
      toolCalls.push(call);
      return {
        query: call.arguments.query,
        productId: call.arguments.productId,
        products: [],
        materials: [],
        revisions: [],
        totalMatches: 1,
        truncated: false,
        evidence: {
          id: 'search-scoped-1',
          sourceType: 'pdm-search',
          sourcePath: 'data/materials.json',
          recordId: 'LGS043:drawer',
          sourceCommit: 'a'.repeat(40),
          capturedAt: '2026-07-22T00:00:00Z',
        },
      };
    },
  });

  const result = await controller.runTurn({
    query: '\u597d\uff0c\u90a3LGS043\u7528\u4ec0\u4e48\u5e03\u62bd',
    route: {
      intent: 'pdm_search',
      confidence: 'deterministic',
      preferredTool: 'search_pdm',
      entities: {
        productIds: ['LGS043'],
        materialIds: ['mat_vz636a'],
        searchQuery: '\u5e03\u62bd',
        searchProductId: 'LGS043',
      },
    },
    snapshot: {},
    model: 'reasoning:free',
    availableTools: ['search_pdm'],
  });

  assert.equal(result.text, 'LGS043 drawer result.');
  assert.deepEqual(toolCalls[0], {
    name: 'search_pdm',
    arguments: { query: '\u5e03\u62bd', productId: 'LGS043', materialId: 'mat_vz636a' },
  });
});
