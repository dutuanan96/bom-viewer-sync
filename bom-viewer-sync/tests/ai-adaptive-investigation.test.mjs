import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { routePdmIntent, PDM_INTENTS } from '../src/features/ai-assistant/intent-router.js';
import { createAgentController } from '../src/features/ai-assistant/agent-controller.js';
import { createTrustPolicy } from '../src/features/ai-assistant/trust-policy.js';
import { createLocalAiStore } from '../src/features/ai-assistant/local-store.js';
import { createMemoryManager } from '../src/features/ai-assistant/memory-manager.js';
import { createAiAssistantFeature } from '../src/features/ai-assistant/index.js';

const ROUTER_TOOLS = [
  'search_products',
  'get_product',
  'resolve_sku',
  'get_bom',
  'compare_boms',
  'get_material',
  'where_used',
  'get_revision_history',
  'audit_product_data',
  'get_marketplace_insights',
  'compare_revisions',
  'search_pdm',
  'list_recent_changes',
  'inspect_pdm_schema',
  'get_pdm_help',
];

const MOCK_SNAPSHOT = {
  sourceMetadata: { commitSha: 'a'.repeat(40), shardRoot: 'data' },
  payload: {
    bom: {
      LGS433: { productCode: 'LGS433', rows: [{ materialId: 'mat_wood_01', quantity: 2, color: '01' }] },
      LGS032: { productCode: 'LGS032', rows: [] },
      LGS031: { productCode: 'LGS031', rows: [] },
    },
    materials: {
      mat_wood_01: { materialId: 'mat_wood_01', nameZh: '木板', specZh: '460x282x187mm' },
    },
    productRevisions: {
      LGS032: {
        currentRevision: 'V3.1',
        effectiveRevision: 'V3',
        revisions: [{ revision: 'V3', workflowState: 'released' }, { revision: 'V3.1', workflowState: 'draft' }],
      },
    },
  },
};

function createMockGateway(responseText = 'Analysis complete.', toolCalls = []) {
  return {
    listModels: () => [{ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', grade: 'A', name: 'Mock Model' }],
    chat: async ({ messages }) => {
      if (toolCalls.length > 0) {
        const nextCall = toolCalls.shift();
        return {
          choices: [{ message: { role: 'assistant', tool_calls: [nextCall] } }],
          usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 },
        };
      }
      return {
        choices: [{ message: { role: 'assistant', content: responseText } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 },
      };
    },
  };
}

describe('Adaptive PDM Investigation Loop', () => {
  // ── 1. Fast Path ────────────────────────────────────────────────────────────

  test('Fast Path: dimension query uses search_pdm once', () => {
    const route = routePdmIntent({ query: '布抽规格460x282×187哪一个产品用的?', availableTools: ROUTER_TOOLS });
    assert.equal(route.intent, PDM_INTENTS.PDM_SEARCH);
    assert.equal(route.preferredTool, 'search_pdm');
  });

  test('Fast Path: exact BOM query uses get_bom once', () => {
    const route = routePdmIntent({ query: 'LGS433 BOM rows', availableTools: ROUTER_TOOLS });
    assert.equal(route.intent, PDM_INTENTS.BOM_LOOKUP);
    assert.equal(route.preferredTool, 'get_bom');
  });

  test('Fast Path: revision status query uses get_revision_history once', () => {
    const route = routePdmIntent({ query: 'LGS032 revision status', availableTools: ROUTER_TOOLS });
    assert.equal(route.intent, PDM_INTENTS.REVISION_STATUS);
    assert.equal(route.preferredTool, 'get_revision_history');
  });

  test('Fast Path: two revisions comparison query uses compare_revisions once', () => {
    const route = routePdmIntent({ query: 'LGS032 V3 vs V3.1 changes', availableTools: ROUTER_TOOLS });
    assert.equal(route.intent, PDM_INTENTS.REVISION_COMPARE);
    assert.equal(route.preferredTool, 'compare_revisions');
  });

  test('Fast Path: two products comparison query uses compare_boms once', () => {
    const route = routePdmIntent({ query: 'Compare LGS031 vs LGS032 BOM', availableTools: ROUTER_TOOLS });
    assert.equal(route.intent, PDM_INTENTS.BOM_COMPARE);
    assert.equal(route.preferredTool, 'compare_boms');
  });

  // ── 2. Follow-Up Context ───────────────────────────────────────────────────

  test('Follow-Up: search follow-up reuses original searchQuery', () => {
    const conversationContext = { searchQuery: '460x282x187' };
    const route = routePdmIntent({ query: 'Is LGS723 the only one?', conversationContext, availableTools: ROUTER_TOOLS });
    assert.equal(route.preferredTool, 'search_pdm');
    assert.equal(route.entities.searchQuery, '460x282x187');
  });

  test('Follow-Up: revision follow-up reuses productIds and revisions', () => {
    const conversationContext = { productIds: ['LGS032'], revisions: ['V3', 'V3.1'] };
    const route = routePdmIntent({ query: 'What is the difference between those two versions?', conversationContext, availableTools: ROUTER_TOOLS });
    assert.equal(route.preferredTool, 'compare_revisions');
    assert.deepEqual(route.entities.productIds, ['LGS032']);
    assert.deepEqual(route.entities.revisions, ['V3', 'V3.1']);
  });

  test('Follow-Up: unrelated new topic query drops prior search context', () => {
    const conversationContext = { searchQuery: '460x282x187' };
    const route = routePdmIntent({ query: 'LGS433 BOM rows', conversationContext, availableTools: ROUTER_TOOLS });
    assert.equal(route.preferredTool, 'get_bom');
    assert.equal(route.entities.searchQuery, undefined);
  });

  // ── 3. Tool Deduplication & Escalation ─────────────────────────────────────

  test('Deduplication: duplicate tool call with identical arguments in same turn is suppressed', async () => {
    const duplicateCall = {
      id: 'call_1',
      type: 'function',
      function: { name: 'get_product', arguments: JSON.stringify({ productId: 'LGS433' }) },
    };

    const gateway = createMockGateway('Final answer text.', [duplicateCall, duplicateCall]);
    const trustPolicy = createTrustPolicy();

    let toolExecutionCount = 0;
    const runTool = async () => {
      toolExecutionCount++;
      return { productCode: 'LGS433', nameZh: '测试产品' };
    };

    const controller = createAgentController({ gateway, trustPolicy, runTool });
    const route = { intent: 'ambiguous', confidence: 'ambiguous' };
    const availableTools = [{ type: 'function', function: { name: 'get_product', description: 'Get product' } }];

    const result = await controller.runTurn({
      query: 'Check LGS433 details',
      route,
      snapshot: MOCK_SNAPSHOT,
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      availableTools,
    });

    assert.equal(toolExecutionCount, 1); // Second duplicate call was suppressed
    assert.equal(typeof result.text, 'string');
  });

  test('Deduplication: semantically equivalent arguments are suppressed', async () => {
    const calls = [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'search_products', arguments: JSON.stringify({ query: ' LGS433 ' }) },
      },
      {
        id: 'call_2',
        type: 'function',
        function: { name: 'search_products', arguments: JSON.stringify({ query: 'lgs433' }) },
      },
    ];
    const gateway = createMockGateway('Final answer text.', calls);
    let toolExecutionCount = 0;
    const controller = createAgentController({
      gateway,
      trustPolicy: createTrustPolicy(),
      runTool: async () => {
        toolExecutionCount++;
        return [];
      },
    });

    await controller.runTurn({
      query: 'Find LGS433',
      route: { intent: 'ambiguous', confidence: 'ambiguous' },
      snapshot: MOCK_SNAPSHOT,
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      availableTools: [{ type: 'function', function: { name: 'search_products', description: 'Search' } }],
    });

    assert.equal(toolExecutionCount, 1);
  });

  for (const incompleteResult of [
    { totalMatches: 0, truncated: false },
    { totalMatches: 1, truncated: true },
    { totalMatches: 10, truncated: false, matchMode: 'scoped-candidates' },
  ]) {
    test(`Escalation: incomplete deterministic result keeps read-only tools available (${JSON.stringify(incompleteResult)})`, async () => {
      let modelCallCount = 0;
      const exposedToolNames = [];
      const gateway = {
        listModels: () => [{ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', grade: 'A' }],
        chat: async ({ tools }) => {
          modelCallCount++;
          exposedToolNames.push((tools || []).map(tool => tool.function?.name || tool));
          if (modelCallCount === 1) {
            return {
              choices: [{ message: { role: 'assistant', tool_calls: [{
                id: 'help_1',
                type: 'function',
                function: { name: 'get_pdm_help', arguments: JSON.stringify({ topic: 'broader search' }) },
              }] } }],
              usage: {},
            };
          }
          return { choices: [{ message: { role: 'assistant', content: 'Need a broader PDM query.' } }], usage: {} };
        },
      };
      const executedTools = [];
      const controller = createAgentController({
        gateway,
        trustPolicy: createTrustPolicy(),
        runTool: async call => {
          executedTools.push(call.name);
          if (call.name === 'search_pdm') {
            return {
              query: call.arguments.query,
              products: incompleteResult.totalMatches ? [{ productCode: 'LGS723' }] : [],
              materials: [],
              revisions: [],
              ...incompleteResult,
              evidence: [{
                id: `search_${incompleteResult.truncated ? 'truncated' : 'empty'}`,
                sourceType: 'pdm-local',
                sourcePath: 'data/manifest.json',
                sourceCommit: MOCK_SNAPSHOT.sourceMetadata.commitSha,
                capturedAt: '2026-07-22T00:00:00Z',
              }],
            };
          }
          return { topic: call.arguments.topic, suggestions: [] };
        },
      });

      await controller.runTurn({
        query: 'Find an unusual drawer',
        route: {
          intent: 'pdm_search',
          confidence: 'deterministic',
          preferredTool: 'search_pdm',
          entities: { searchQuery: 'unusual drawer' },
        },
        snapshot: MOCK_SNAPSHOT,
        model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        availableTools: [
          { type: 'function', function: { name: 'search_pdm', description: 'Search PDM' } },
          { type: 'function', function: { name: 'get_pdm_help', description: 'Get search guidance' } },
          { type: 'function', function: { name: 'apply_mutation', description: 'Apply mutation' } },
        ],
      });

      assert.deepEqual(executedTools, ['search_pdm', 'get_pdm_help']);
      assert.ok(exposedToolNames[0].includes('get_pdm_help'));
      assert.equal(exposedToolNames[0].includes('apply_mutation'), false);
    });
  }

  test('Progress: consecutive tool calls without new progress trigger investigation limit', async () => {
    const call1 = {
      id: 'call_1',
      type: 'function',
      function: { name: 'get_product', arguments: JSON.stringify({ productId: 'LGS433' }) },
    };
    const call2 = {
      id: 'call_2',
      type: 'function',
      function: { name: 'search_products', arguments: JSON.stringify({ query: 'LGS433' }) },
    };

    const gateway = createMockGateway('Final answer.', [call1, call2]);
    const trustPolicy = createTrustPolicy();

    const runTool = async () => ({ totalMatches: 0, products: [] }); // No new entities/evidence returned

    const controller = createAgentController({ gateway, trustPolicy, runTool });
    const route = { intent: 'ambiguous', confidence: 'ambiguous' };
    const availableTools = [
      { type: 'function', function: { name: 'get_product', description: 'Get product' } },
      { type: 'function', function: { name: 'search_products', description: 'Search' } },
    ];

    const result = await controller.runTurn({
      query: 'Search LGS433',
      route,
      snapshot: MOCK_SNAPSHOT,
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      availableTools,
    });

    assert.equal(typeof result.text, 'string');
  });

  // ── 4. Ground Truth & Learning Classification ──────────────────────────────

  test('Ground Truth: local Store memory cannot auto-confirm or override PDM snapshot ground truth', () => {
    const localStore = createLocalAiStore();
    const candidate = localStore.createCandidate({
      scope: { project: 'jintai-pdm', key: 'LGS433_spec' },
      fact: 'LGS433 uses plastic instead of wood',
      provenance: [{ sourceType: 'user-proposed', sourceRef: 'test', capturedAt: new Date().toISOString() }],
      sourceCommit: MOCK_SNAPSHOT.sourceMetadata.commitSha,
    });

    assert.equal(candidate.status, 'candidate'); // Stays candidate, never auto-confirmed
    const confirmedList = localStore.listConfirmed({ currentSourceCommit: MOCK_SNAPSHOT.sourceMetadata.commitSha });
    assert.equal(confirmedList.length, 0); // Not in confirmed list
  });

  test('Learning: model-proposed memory remains a candidate until user confirmation', () => {
    const localStore = createLocalAiStore();
    const manager = createMemoryManager({ localStore });

    const res1 = manager.storeMemory('pref_lang', 'Vietnamese', MOCK_SNAPSHOT);
    assert.equal(res1.status, 'candidate');
    assert.deepEqual(manager.retrieveMemory('pref_lang', MOCK_SNAPSHOT), { found: false });

    localStore.confirm(res1.memoryId);
    const retrieved = manager.retrieveMemory('pref_lang', MOCK_SNAPSHOT);
    assert.equal(retrieved.fact, 'Vietnamese');
  });

  // ── 5. Regressions ──────────────────────────────────────────────────────────

  test('Regression: local PDM fallback is returned when provider endpoints fail after deterministic tool', async () => {
    const failingGateway = {
      listModels: () => [{ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', grade: 'A' }],
      chat: async () => {
        const err = new Error('Provider unavailable');
        err.status = 503;
        throw err;
      },
    };
    const trustPolicy = createTrustPolicy();
    const runTool = async () => ({
      productCode: 'LGS032',
      currentRevision: 'V3.1',
      effectiveRevision: 'V3',
      currentRevisionInfo: { changeReason: 'Draft revision V3.1' },
      evidence: [{ id: 'ev_1', sourceType: 'pdm-local', sourceCommit: MOCK_SNAPSHOT.sourceMetadata.commitSha, sourcePath: 'data/products/LGS032.json', capturedAt: new Date().toISOString() }],
    });

    const controller = createAgentController({
      gateway: failingGateway,
      trustPolicy,
      runTool,
      formatToolFallback: ({ toolResult }) => `Local PDM Fallback: LGS032 current ${toolResult.currentRevision}, effective ${toolResult.effectiveRevision}`,
    });

    const route = routePdmIntent({ query: 'LGS032 revision status', availableTools: ROUTER_TOOLS });
    const result = await controller.runTurn({
      query: 'LGS032 revision status',
      route,
      snapshot: MOCK_SNAPSHOT,
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      availableTools: ROUTER_TOOLS,
    });

    assert.equal(result.fallback, true);
    assert.match(result.text, /Local PDM Fallback: LGS032/);
  });
});
