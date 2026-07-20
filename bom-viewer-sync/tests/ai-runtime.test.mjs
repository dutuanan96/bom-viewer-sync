import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/features/ai-assistant/runtime.js';
import { createOpenRouterGateway } from '../src/features/ai-assistant/openrouter-gateway.js';
import { createTrustPolicy } from '../src/features/ai-assistant/trust-policy.js';
import { routePdmIntent } from '../src/features/ai-assistant/intent-router.js';

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
      const response = chatResponses[callCount] || { choices: [{ message: { content: '{"text":"Default response","citations":[]}' } }] };
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

function createGroundedComparison(productCode1, productCode2, overrides = {}) {
  return {
    product1: { productCode: productCode1 },
    product2: { productCode: productCode2 },
    summary: {
      commonCount: 0,
      onlyProduct1Count: 0,
      onlyProduct2Count: 0,
      quantityOrUnitDifferenceCount: 0,
      similarityScore: 1,
      commonByAttribute: {},
      commonByMaterialFamily: {},
    },
    common: [],
    onlyProduct1: [],
    onlyProduct2: [],
    quantityOrUnitDifferences: [],
    evidence: [
      { id: `bom:${productCode1}`, type: 'bom', recordId: productCode1 },
      { id: `bom:${productCode2}`, type: 'bom', recordId: productCode2 },
    ],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('R2.3: runtime handles a simple no-tool answer', async () => {
  const gateway = createMockGateway({
    chatResponses: [
      {
        choices: [{ message: { role: 'assistant', content: '{"text":"Here is the answer","citations":[]}' } }],
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
  assert.equal(Object.isFrozen(result.trace), true);
  assert.deepEqual(result.trace.map(event => event.type), [
    'route_selected',
    'model_requested',
    'answer_validated'
  ]);
});

test('R2.3: runtime sends the exact bounded Unicode query to the provider', async () => {
  let capturedRequest;
  const gateway = createMockGateway({
    onChat: (request) => { capturedRequest = request; },
    chatResponses: [{
      choices: [{ message: { role: 'assistant', content: '{"text":"回答","citations":[]}' } }]
    }]
  });
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });
  const query = '为什么LGS032有状态是草稿呢？';

  await runtime.runTurn({
    query,
    snapshot: VALID_SNAPSHOT,
    model: 'mock-model',
    availableTools: []
  });

  const userMessage = capturedRequest.messages.find(message => message.role === 'user');
  assert.equal(userMessage.content, query);
});

test('runtime injects one selected specialist and bounded confirmed memory', async () => {
  let capturedRequest;
  const gateway = createMockGateway({
    onChat: request => { capturedRequest = request; },
    chatResponses: [{
      choices: [{ message: { role: 'assistant', content: '{"text":"Grounded answer","citations":[]}' } }],
    }],
  });
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });

  await runtime.runTurn({
    query: 'Compare LGS723 and LGS733 metal parts',
    snapshot: VALID_SNAPSHOT,
    model: 'mock-model',
    availableTools: [],
    specialistPrompt: 'PDM SPECIALIST: bom_comparison\n- Use exact materialId as BOM identity.',
    confirmedMemories: [{
      id: 'memory_rail_term',
      status: 'confirmed',
      fact: 'The user calls the left rail thanh trái.',
      scope: { productCode: 'LGS723' },
      provenance: [{ sourceType: 'user-confirmed' }],
    }],
  });

  const system = capturedRequest.messages.find(message => message.role === 'system').content;
  assert.match(system, /PDM SPECIALIST: bom_comparison/);
  assert.match(system, /TRUSTED_USER_CONFIRMED_MEMORY/);
  assert.match(system, /memory_rail_term/);
  assert.doesNotMatch(system, /PDM SPECIALIST: marketplace/);
});

test('R2.3: deterministic revision route prefetches LGS032 before the first model call', async () => {
  const chatRequests = [];
  const toolCalls = [];
  const availableTools = [{ type: 'function', function: { name: 'get_revision_history' } }];
  const query = '为什么LGS032有状态是草稿呢？';
  const gateway = createMockGateway({
    onChat: request => chatRequests.push(request),
    chatResponses: [{
      choices: [{ message: { role: 'assistant', content: '{"text":"LGS032 当前修订版 V3.1 是草稿；当前生效版是已发布的 V3。","citations":[]}' } }]
    }]
  });
  const runtime = createRuntime({
    gateway,
    trustPolicy: createTrustPolicy(),
    runTool: async call => {
      toolCalls.push(call);
      return {
        productId: 'LGS032',
        currentRevision: { revision: 'V3.1', status: 'draft' },
        effectiveRevision: { revision: 'V3', status: 'released' },
        evidence: { id: 'revision:LGS032', type: 'revision', recordId: 'LGS032' },
      };
    }
  });
  const route = routePdmIntent({ query, selection: VALID_SNAPSHOT.selection, availableTools });

  const result = await runtime.runTurn({
    query,
    route,
    snapshot: VALID_SNAPSHOT,
    model: 'mock-model',
    availableTools
  });

  assert.equal(result.text.includes('V3.1'), true);
  assert.equal(toolCalls[0].name, 'get_revision_history');
  assert.deepEqual(toolCalls[0].arguments, { productId: 'LGS032' });
  assert.equal(chatRequests.length, 1);
  assert.match(JSON.stringify(chatRequests[0].messages), /V3\.1/);
  assert.doesNotMatch(JSON.stringify(chatRequests[0].messages), /22 products/i);
  assert.equal(result.usage.toolCalls, 1);
});

test('R2.3: deterministic BOM comparison preserves every bounded evidence citation', async () => {
  const availableTools = [{ type: 'function', function: { name: 'compare_boms' } }];
  const query = 'Compare the BOM of LGS031 and LGS032';
  const gateway = createMockGateway({
    chatResponses: [{
      choices: [{ message: {
        role: 'assistant',
        content: '{"text":"The BOMs differ in one material quantity.","citations":["bom:LGS031","bom:LGS032"]}'
      } }]
    }]
  });
  const runtime = createRuntime({
    gateway,
    trustPolicy: createTrustPolicy(),
    runTool: async () => createGroundedComparison('LGS031', 'LGS032', {
      quantityOrUnitDifferences: [{ materialId: 'mat_001', quantity1: 1, quantity2: 2 }],
      summary: {
        commonCount: 0,
        onlyProduct1Count: 0,
        onlyProduct2Count: 0,
        quantityOrUnitDifferenceCount: 1,
        similarityScore: 0,
        commonByAttribute: {},
        commonByMaterialFamily: {},
      },
      evidence: [
        { id: 'bom:LGS031', type: 'bom', recordId: 'LGS031' },
        { id: 'bom:LGS032', type: 'bom', recordId: 'LGS032' }
      ]
    })
  });
  const route = routePdmIntent({ query, selection: VALID_SNAPSHOT.selection, availableTools });

  const result = await runtime.runTurn({
    query,
    route,
    snapshot: VALID_SNAPSHOT,
    model: 'mock-model',
    availableTools
  });

  assert.deepEqual(result.citations, ['bom:LGS031', 'bom:LGS032']);
  assert.equal(result.usage.toolCalls, 1);
});

test('R2.3: deterministic evidence safely accepts a Grade B plain-text answer', async () => {
  const availableTools = [{ type: 'function', function: { name: 'compare_boms' } }];
  const query = '帮我看一下LGS723和LGS733有什么铁件共用';
  const gateway = createMockGateway({
    chatResponses: [{ choices: [{ message: {
      role: 'assistant',
      content: 'LGS723 和 LGS733 共用 20 个相同物料编码。'
    } }] }]
  });
  const runtime = createRuntime({
    gateway,
    trustPolicy: createTrustPolicy(),
    runTool: async () => createGroundedComparison('LGS723', 'LGS733', {
      summary: {
        commonCount: 20,
        onlyProduct1Count: 0,
        onlyProduct2Count: 0,
        quantityOrUnitDifferenceCount: 0,
        similarityScore: 1,
        commonByAttribute: {},
        commonByMaterialFamily: {},
      },
      evidence: [
        { id: 'bom:LGS723', type: 'bom', recordId: 'LGS723' },
        { id: 'bom:LGS733', type: 'bom', recordId: 'LGS733' }
      ]
    })
  });
  const route = routePdmIntent({ query, availableTools });

  const result = await runtime.runTurn({
    query,
    route,
    snapshot: VALID_SNAPSHOT,
    model: 'grade-b-model',
    availableTools
  });

  assert.equal(result.text, 'LGS723 和 LGS733 共用 20 个相同物料编码。');
  assert.deepEqual(result.citations, ['bom:LGS723', 'bom:LGS733']);
  assert.equal(result.usage.toolCalls, 1);
});

test('R2.3: deterministic prefetch prevents the model from repeating the same tool loop', async () => {
  let capturedRequest;
  const availableTools = [{ type: 'function', function: { name: 'compare_boms' } }];
  const query = 'Compare the BOM of LGS723 and LGS733';
  const gateway = createMockGateway({
    onChat: request => { capturedRequest = request; },
    chatResponses: [{ choices: [{ message: {
      role: 'assistant',
      content: '{"text":"The products share 20 exact material IDs.","citations":[]}'
    } }] }]
  });
  const runtime = createRuntime({
    gateway,
    trustPolicy: createTrustPolicy(),
    runTool: async () => createGroundedComparison('LGS723', 'LGS733', {
      summary: {
        commonCount: 20,
        onlyProduct1Count: 0,
        onlyProduct2Count: 0,
        quantityOrUnitDifferenceCount: 0,
        similarityScore: 1,
        commonByAttribute: {},
        commonByMaterialFamily: {},
      },
    })
  });
  const route = routePdmIntent({ query, availableTools });

  const result = await runtime.runTurn({ query, route, snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools });

  assert.deepEqual(capturedRequest.tools, []);
  assert.equal(result.usage.modelCalls, 1);
  assert.equal(result.usage.toolCalls, 1);
});

test('deterministic grounding fails before a provider call when comparison evidence is malformed', async () => {
  let providerCalls = 0;
  const query = 'Compare LGS723 and LGS733 BOM';
  const availableTools = [{ type: 'function', function: { name: 'compare_boms' } }];
  const route = routePdmIntent({ query, availableTools });
  const runtime = createRuntime({
    gateway: createMockGateway({ onChat: () => { providerCalls += 1; } }),
    trustPolicy: createTrustPolicy(),
    runTool: async () => ({
      product1: { productCode: 'LGS723' },
      product2: { productCode: 'LGS433' },
      summary: {},
      common: [], onlyProduct1: [], onlyProduct2: [], quantityOrUnitDifferences: [],
      evidence: [],
    }),
  });

  await assert.rejects(
    runtime.runTurn({ query, route, snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools }),
    error => error.code === 'AI_GROUNDING_INVALID',
  );
  assert.equal(providerCalls, 0);
});

test('runtime discloses only the selected personal mapping in the grounded provider context', async () => {
  let capturedRequest;
  const gateway = createMockGateway({
    onChat: request => { capturedRequest = request; },
    chatResponses: [{ choices: [{ message: { role: 'assistant', content: '{"text":"Grounded BOM answer","citations":[]}' } }] }],
  });
  const route = {
    intent: 'bom_lookup',
    entities: { productIds: ['LGS433'], colors: ['黑色'] },
    preferredTool: 'get_bom',
    confidence: 'deterministic',
  };
  const runtime = createRuntime({
    gateway,
    trustPolicy: createTrustPolicy(),
    runTool: async () => ({
      productCode: 'LGS433',
      color: '黑色',
      rows: [],
      evidence: { id: 'bom:LGS433', type: 'bom', recordId: 'LGS433' },
    }),
  });

  await runtime.runTurn({
    query: 'BOM con BellaH màu đen có gì?',
    route,
    snapshot: VALID_SNAPSHOT,
    model: 'mock-model',
    availableTools: [{ type: 'function', function: { name: 'get_bom' } }],
    entityResolution: {
      status: 'resolved',
      phrase: 'con BellaH màu đen',
      target: { type: 'product-variant', productCode: 'LGS433', color: '黑色' },
      confidence: 1,
      margin: 1,
      source: 'personal-confirmed',
      candidates: [{ target: { type: 'product', productCode: 'LGS999' } }],
      requiresConfirmation: false,
    },
  });

  const serialized = JSON.stringify(capturedRequest.messages);
  assert.match(serialized, /USER_PHRASE_MAPPING/);
  assert.match(serialized, /con BellaH màu đen/);
  assert.match(serialized, /LGS433/);
  assert.doesNotMatch(serialized, /LGS999/);
});

test('runtime returns local clarification for ambiguous mappings without calling the provider', async () => {
  let providerCalls = 0;
  const runtime = createRuntime({
    gateway: createMockGateway({ onChat: () => { providerCalls += 1; } }),
    trustPolicy: createTrustPolicy(),
  });
  const response = await runtime.runTurn({
    query: 'BOM tủ 8 ngăn',
    route: { intent: 'ambiguous', entities: {}, preferredTool: null, confidence: 'ambiguous' },
    snapshot: VALID_SNAPSHOT,
    model: 'mock-model',
    entityResolution: {
      status: 'ambiguous',
      phrase: 'tủ 8 ngăn',
      target: null,
      confidence: 0.94,
      margin: 0,
      source: null,
      candidates: [
        { target: { type: 'product', productCode: 'LGS433' }, confidence: 0.94 },
        { target: { type: 'product', productCode: 'LGS434' }, confidence: 0.94 },
      ],
      requiresConfirmation: true,
    },
    clarificationText: 'Please choose LGS433 or LGS434.',
  });

  assert.equal(response.text, 'Please choose LGS433 or LGS434.');
  assert.equal(response.clarification, true);
  assert.equal(providerCalls, 0);
});

test('runtime rejects a model-selected tool that was not exposed for the turn', async () => {
  let toolCalls = 0;
  const runtime = createRuntime({
    gateway: createMockGateway({
      chatResponses: [{ choices: [{ message: {
        role: 'assistant',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'submit_proposal', arguments: '{}' } }],
      } }] }],
    }),
    trustPolicy: createTrustPolicy(),
    runTool: async () => { toolCalls += 1; },
  });

  await assert.rejects(
    runtime.runTurn({ query: 'change it', snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools: [] }),
    /not available for this turn/i,
  );
  assert.equal(toolCalls, 0);
});

test('R2.3: PDM answer rules require scope and explicit category interpretation', async () => {
  let capturedRequest;
  const gateway = createMockGateway({
    onChat: request => { capturedRequest = request; },
    chatResponses: [{ choices: [{ message: { role: 'assistant', content: '{"text":"Clarify the category.","citations":[]}' } }] }]
  });
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });

  await runtime.runTurn({ query: 'Which parts are shared?', snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools: [] });

  const systemPrompt = capturedRequest.messages.find(message => message.role === 'system').content;
  assert.match(systemPrompt, /product.*color.*revision.*scope/is);
  assert.match(systemPrompt, /attribute.*material.*specification/is);
  assert.match(systemPrompt, /ambiguous domain category/is);
  assert.match(systemPrompt, /plain text.*Markdown/is);
});

test('R2.3: bounded history precedes the latest follow-up query', async () => {
  let capturedRequest;
  const gateway = createMockGateway({
    onChat: request => { capturedRequest = request; },
    chatResponses: [{
      choices: [{ message: { role: 'assistant', content: '{"text":"Because V3.1 is still draft.","citations":[]}' } }]
    }]
  });
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });

  await runtime.runTurn({
    query: 'Why is it non-current?',
    history: [
      { role: 'user', content: 'What is the status of LGS032?' },
      { role: 'assistant', content: 'LGS032 V3.1 is draft; V3 is effective.' }
    ],
    snapshot: VALID_SNAPSHOT,
    model: 'mock-model',
    availableTools: []
  });

  assert.deepEqual(capturedRequest.messages.slice(1).map(message => message.content), [
    'What is the status of LGS032?',
    'LGS032 V3.1 is draft; V3 is effective.',
    'Why is it non-current?'
  ]);
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
        choices: [{ message: { role: 'assistant', content: '{"text":"Found it.","citations":[]}' } }],
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
    chatResponses: [{ choices: [{ message: { role: 'assistant', content: '{"text":"ok","citations":[]}' } }] }]
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
      { choices: [{ message: { role: 'assistant', content: '{"text":"Answer","citations":[]}' } }] }
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
  assert.equal(result.trace.some(event => event.type === 'fallback_used'), true);
});

test('R2.3: runtime supports cancellation', async () => {
  const gateway = createMockGateway({ chatResponses: [{ choices: [{ message: { content: '{"text":"ok","citations":[]}' } }] }] });
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
    /unsafe|html|structured|json/i
  );
});

test('R3.3: marketplace tool enables one consented web-search request and returns Amazon annotations', async () => {
  const requests = [];
  const amazonUrl = 'https://www.amazon.com/dp/B0GTZDGNGN';
  const gateway = createMockGateway({
    onChat: request => requests.push(request),
    chatResponses: [
      { choices: [{ message: { role: 'assistant', tool_calls: [{
        id: 'market_1', type: 'function', function: { name: 'get_marketplace_insights', arguments: '{"productId":"LGS433"}' }
      }] } }] },
      { choices: [{ message: {
        role: 'assistant',
        content: '{"text":"Customers mention drawer fit.","citations":[]}',
        annotations: [{ type: 'url_citation', url_citation: { url: amazonUrl, title: 'Amazon product' } }]
      } }] },
    ],
  });
  const runtime = createRuntime({
    gateway,
    trustPolicy: createTrustPolicy(),
    runTool: createMockTools({
      get_marketplace_insights: () => ({
        rootCauseStatus: 'not-verified',
        webSearchRequest: { allowedDomains: ['amazon.com'], maxResults: 5 },
      }),
    }),
  });

  const result = await runtime.runTurn({
    query: 'Review Amazon feedback for LGS433',
    snapshot: VALID_SNAPSHOT,
    model: 'mock-model',
    marketplaceWebEnabled: true,
    availableTools: [{ type: 'function', function: { name: 'get_marketplace_insights' } }],
  });

  assert.equal(requests[0].webSearch, false);
  assert.equal(requests[1].webSearch, true);
  assert.deepEqual(result.citations, [amazonUrl]);
});

test('R3.3: marketplace web search remains disabled without explicit consent', async () => {
  const requests = [];
  const gateway = createMockGateway({
    onChat: request => requests.push(request),
    chatResponses: [
      { choices: [{ message: { role: 'assistant', tool_calls: [{
        id: 'market_1', type: 'function', function: { name: 'get_marketplace_insights', arguments: '{"productId":"LGS433"}' }
      }] } }] },
      { choices: [{ message: { role: 'assistant', content: '{"text":"No imported evidence.","citations":[]}' } }] },
    ],
  });
  const runtime = createRuntime({
    gateway,
    trustPolicy: createTrustPolicy(),
    runTool: createMockTools({
      get_marketplace_insights: () => ({ webSearchRequest: { allowedDomains: ['amazon.com'], maxResults: 5 } }),
    }),
  });

  await runtime.runTurn({
    query: 'Review Amazon feedback for LGS433',
    snapshot: VALID_SNAPSHOT,
    model: 'mock-model',
    marketplaceWebEnabled: false,
    availableTools: [{ type: 'function', function: { name: 'get_marketplace_insights' } }],
  });

  assert.equal(requests.every(request => request.webSearch === false), true);
});

test('R2.3: plain unstructured final output fails closed', async () => {
  const gateway = createMockGateway({
    chatResponses: [{ choices: [{ message: { role: 'assistant', content: 'plain answer' } }] }],
  });
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });
  await assert.rejects(
    () => runtime.runTurn({ query: 'Hello', snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools: [] }),
    /structured|json|model output/i,
  );
});

test('R2.3: provider fallback never exposes provider error details', async () => {
  const gateway = createMockGateway({ shouldFail: true, failCode: 503 });
  gateway.chat = async () => { throw new Error('secret upstream payload'); };
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });
  const result = await runtime.runTurn({ query: 'Hello', snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools: [] });
  assert.equal(result.fallback, true);
  assert.doesNotMatch(result.text, /secret upstream payload/);
});

test('R2.3: invalid gateway response does not dump raw provider payload', async () => {
  const gateway = createMockGateway({ chatResponses: [{ privateMetadata: 'must-not-leak' }] });
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });
  await assert.rejects(
    () => runtime.runTurn({ query: 'Hello', snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools: [] }),
    (error) => !error.message.includes('must-not-leak'),
  );
});

test('R2.3: cancellation signal is forwarded to the gateway', async () => {
  let capturedSignal;
  const gateway = {
    async chat(request) {
      capturedSignal = request.signal;
      return { choices: [{ message: { content: '{"text":"ok","citations":[]}' } }] };
    },
  };
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });
  const controller = new AbortController();
  await runtime.runTurn({ query: 'Hello', snapshot: VALID_SNAPSHOT, model: 'mock-model', availableTools: [], signal: controller.signal });
  assert.equal(capturedSignal, controller.signal);
});

test('R2.3: repeated malformed emulated output returns only a safe local fallback', async () => {
  let calls = 0;
  const gateway = createMockGateway();
  gateway.chat = async () => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('unsupported');
      error.code = 'AI_MODEL_INCOMPATIBLE';
      throw error;
    }
    return { choices: [{ message: { content: '<img src=x onerror=alert(1)>' } }] };
  };
  const runtime = createRuntime({ gateway, trustPolicy: createTrustPolicy() });
  const result = await runtime.runTurn({
    query: 'Hello', snapshot: VALID_SNAPSHOT, model: 'mock-model',
    availableTools: [{ type: 'function', function: { name: 'search_products', parameters: {} } }],
  });
  assert.doesNotMatch(result.text, /<img|onerror/i);
  assert.equal(result.fallback, true);
});

test('R4: emulated tools mode cannot execute submit_proposal', async () => {
  let calls = 0;
  let proposalExecutions = 0;
  const gateway = {
    async chat() {
      calls += 1;
      if (calls === 1) {
        const error = new Error('unsupported');
        error.code = 'AI_MODEL_INCOMPATIBLE';
        throw error;
      }
      if (calls === 2) {
        return { choices: [{ message: { content: '{"action":"submit_proposal","arguments":{"operationType":"update_material_field","targetId":"M1","payload":{"field":"unit","value":"pcs"}},"answer":""}' } }] };
      }
      return { choices: [{ message: { content: '{"action":"final","arguments":{},"answer":"Proposal mode is unavailable."}' } }] };
    },
  };
  const runtime = createRuntime({
    gateway,
    trustPolicy: createTrustPolicy(),
    runTool: async () => { proposalExecutions += 1; return {}; },
  });
  await runtime.runTurn({
    query: 'change unit', snapshot: VALID_SNAPSHOT, model: 'mock-model',
    availableTools: [{ type: 'function', function: { name: 'submit_proposal', parameters: {} } }],
  });
  assert.equal(proposalExecutions, 0);
});
