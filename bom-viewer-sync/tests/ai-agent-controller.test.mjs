import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentController } from '../src/features/ai-assistant/agent-controller.js';
import { buildMutationProposalReview } from '../src/features/ai-assistant/mutation-engine.js';

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

test('agent-controller: asks locally when an exact read-only entity conflicts with the requested color', async () => {
  const controller = createAgentController({
    gateway: {
      listModels: () => [{ id: 'test-model', grade: 'B' }],
      chat: async () => { throw new Error('Exact conflicts must not call the model'); },
    },
    trustPolicy: {
      buildContext: ({ query }) => ({ query }),
      createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
    },
    runTool: async () => { throw new Error('Exact conflicts must not call a tool'); },
  });

  const entityResolution = {
    status: 'ambiguous',
    confidence: 1,
    requiresConfirmation: true,
    candidates: [{ target: { type: 'product', productCode: 'LGS433' } }],
  };
  const result = await controller.runTurn({
    query: 'Show LGS433 blue BOM',
    route: {
      intent: 'bom_lookup',
      confidence: 'deterministic',
      entities: { productIds: ['LGS433'] },
      preferredTool: 'get_bom',
    },
    snapshot: {},
    model: 'test-model',
    availableTools: ['get_bom'],
    entityResolution,
    clarificationText: 'Please choose an available color.',
  });

  assert.equal(result.text, 'Please choose an available color.');
  assert.equal(result.clarification, true);
  assert.equal(result.entityResolution, entityResolution);
  assert.equal(result.usage.modelCalls, 0);
  assert.equal(result.usage.toolCalls, 0);
});

test('agent-controller: executes streamed DSML tool calls without rendering the protocol', async () => {
  let callCount = 0;
  const dsml = '< | DSML | tool_calls>< | DSML | invoke name="where_used">< | DSML | parameter name="materialId" string="true">mat_paper</ | DSML | parameter></ | DSML | invoke>< | DSML | invoke name="search_pdm">< | DSML | parameter name="query" string="true">\u7eb8\u5361 60mm</ | DSML | parameter></ | DSML | invoke></ | DSML | tool_calls>';
  const mockGateway = {
    listModels: () => [{ id: 'dsml-model', grade: 'B' }],
    chatStream: async function* () {
      callCount += 1;
      yield { content: callCount === 1 ? dsml : 'Found the matching paper cards.' };
    },
  };
  const mockTrustPolicy = {
    buildContext: ({ query }) => ({ query }),
    createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
    authorizeToolCall: call => call,
    validateModelOutput: output => output,
  };
  const toolCalls = [];
  const progressText = [];
  const controller = createAgentController({
    gateway: mockGateway,
    trustPolicy: mockTrustPolicy,
    runTool: async call => {
      toolCalls.push(call);
      return call.name === 'search_pdm'
        ? { query: call.arguments.query, materials: [{ materialId: 'mat_paper' }] }
        : { materialId: call.arguments.materialId, products: [] };
    },
  });

  const result = await controller.runTurn({
    query: '\u67e5\u627e60mm\u7eb8\u5361',
    route: { intent: 'ambiguous', confidence: 'ambiguous', entities: {} },
    snapshot: {},
    model: 'dsml-model',
    availableTools: ['where_used', 'search_pdm'],
    onProgress: event => {
      if (event.type === 'content') progressText.push(event.delta);
    },
  });

  assert.equal(result.text, 'Found the matching paper cards.');
  assert.deepEqual(toolCalls, [
    { name: 'where_used', arguments: { materialId: 'mat_paper' } },
    { name: 'search_pdm', arguments: { query: '\u7eb8\u5361 60mm' } },
  ]);
  assert.equal(progressText.join('').includes('DSML'), false);
  assert.equal(callCount, 2);
});

test('agent-controller: deterministically prepares an exact bulk material dimension proposal', async () => {
  const query = '\u6211\u60f3\u6539\u6240\u6709\u7eb8\u5361\u670960mm\u5bbd\u5ea6\u6539\u4e3a100mm\u5bbd\u5ea6';
  const calls = [];
  const mockGateway = {
    listModels: () => [{ id: 'test-model', grade: 'B' }],
    chat: async () => { throw new Error('The deterministic proposal must not call the model'); },
  };
  const mockTrustPolicy = {
    buildContext: ({ query: userQuery }) => ({ query: userQuery }),
    createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
    authorizeToolCall: call => call,
    validateModelOutput: output => output,
  };
  const controller = createAgentController({
    gateway: mockGateway,
    trustPolicy: mockTrustPolicy,
    runTool: async call => {
      calls.push(call);
      if (call.name === 'search_pdm') {
        return {
          products: [],
          revisions: [],
          materials: [
            { materialId: 'mat_a', code: 'PAPER-A', spec: { zh: '\u5355\u74e7785x60mm', vi: 's\u00f3ng \u0111\u01a1n 785x60 mm' } },
            { materialId: 'mat_b', code: 'PAPER-B', spec: { zh: '60mmx925x60mm', vi: '60mmx925x60mm' } },
          ],
          totalMatches: 2,
          truncated: false,
          evidence: {
            id: 'pdm_search_bulk',
            sourceType: 'pdm-search',
            sourcePath: 'data/materials.json',
            recordId: 'bulk-paper-width',
            sourceCommit: 'a'.repeat(40),
            capturedAt: '2026-08-08T00:00:00.000Z',
          },
        };
      }
      return 'Mutation presented for review.';
    },
  });

  const result = await controller.runTurn({
    query,
    route: {
      intent: 'proposal',
      confidence: 'deterministic',
      preferredTool: 'search_pdm',
      entities: { searchQuery: query },
    },
    snapshot: { sourceMetadata: { commitSha: 'a'.repeat(40) } },
    model: 'test-model',
    availableTools: ['search_pdm', 'apply_mutation'],
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { name: 'search_pdm', arguments: { query } });
  assert.deepEqual(calls[1], {
    name: 'apply_mutation',
    arguments: {
      operations: [
        {
          operationType: 'update_material',
          targetId: 'mat_a',
          payload: { patch: { spec: { zh: '\u5355\u74e7785x100mm', vi: 's\u00f3ng \u0111\u01a1n 785x100mm' } } },
        },
        {
          operationType: 'update_material',
          targetId: 'mat_b',
          payload: { patch: { spec: { zh: '60mmx925x100mm', vi: '60mmx925x100mm' } } },
        },
      ],
    },
  });
  assert.equal(result.suppressFinalMessage, true);
  assert.equal(result.text, '');
});

test('agent-controller: requires confirmation before building a duplicate-material consolidation proposal', async () => {
  const toolCalls = [];
  let turn = 0;
  const duplicateFields = {
    name: { zh: '\u7eb8\u5361', vi: 'gi\u1ea5y l\u00f3t' },
    spec: { zh: '\u5355\u74e61100x100mm', vi: 's\u00f3ng \u0111\u01a1n 1100x100mm' },
    material: { zh: '\u74e6\u695e\u7eb8\u5355\u74e6', vi: 'gi\u1ea5y carton s\u00f3ng \u0111\u01a1n' },
    color: { zh: '\u7eb8\u8272', vi: 'm\u00e0u gi\u1ea5y' },
    attr: { zh: '\u5305\u6750', vi: 'v\u1eadt li\u1ec7u \u0111\u00f3ng g\u00f3i' },
    drawings: [], models3d: [],
  };
  const workflow = [
    {
      intent: 'workflow_update', workflowAction: 'build_proposal', responseLanguage: 'zh', schemaVersion: 1, rejectionCode: null,
      taskUpdates: [{ taskRef: { kind: 'new', value: 'consolidate_materials' }, action: 'create_task', fields: { sourceMaterialIds: ['S1', 'S2'], newMaterialCode: 'ZK1100100' } }],
      proposedActions: [{ operationType: 'consolidate_materials', targetId: 'mat_zk1100100' }],
    },
    {
      intent: 'workflow_update', workflowAction: 'build_proposal', responseLanguage: 'zh', schemaVersion: 1, rejectionCode: null,
      taskUpdates: [{ taskRef: { kind: 'current', value: '' }, action: 'confirm_task' }],
      proposedActions: [{ operationType: 'consolidate_materials', targetId: 'mat_zk1100100' }],
    },
  ];
  const controller = createAgentController({
    gateway: { listModels: () => [{ id: 'test-model', grade: 'B' }], chat: async () => ({ choices: [{ message: { content: JSON.stringify(workflow[turn++]) } }] }) },
    trustPolicy: {
      buildContext: ({ query }) => ({ query }),
      createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
      authorizeToolCall: call => call,
      validateModelOutput: output => output,
    },
    runTool: async call => { toolCalls.push(call); return 'Mutation presented for review.'; },
  });
  const snapshot = { sourceMetadata: { commitSha: 'a'.repeat(40) }, payload: { materialDb: { materials: {
    S1: { id: 'S1', code: 'LGS031ZK', ...structuredClone(duplicateFields) },
    S2: { id: 'S2', code: 'LGS032ZK', ...structuredClone(duplicateFields) },
  }, bomEntries: [] } } };
  const route = { intent: 'proposal', confidence: 'deterministic', preferredTool: null, entities: {} };

  const first = await controller.runTurn({ query: 'Create ZK1100100', route, snapshot, model: 'test-model', availableTools: ['apply_mutation'] });
  assert.equal(toolCalls.length, 0);
  assert.equal(first.conversationContext.workflowState.tasks[0].pendingAction, 'confirmation');

  await controller.runTurn({
    query: 'Confirm',
    route: { intent: 'ambiguous', confidence: 'ambiguous', preferredTool: null, entities: {} },
    snapshot,
    model: 'test-model',
    availableTools: ['apply_mutation'],
    conversationContext: first.conversationContext,
  });
  assert.equal(turn, 1);
  assert.equal(toolCalls.length, 1);
  assert.deepEqual(toolCalls[0].arguments.operations[0], {
    operationType: 'consolidate_materials',
    targetId: 'mat_zk1100100',
    payload: {
      material: { code: 'ZK1100100', ...duplicateFields },
      sourceMaterialIds: ['S1', 'S2'],
    },
  });
});

test('agent-controller: does not allow extra PDM lookups after a duplicate-material proposal prefetch', async () => {
  const toolCalls = [];
  const gatewayCalls = [];
  const duplicateFields = {
    name: { zh: '\u7eb8\u5361', vi: 'gi\u1ea5y l\u00f3t' },
    spec: { zh: '\u5355\u74e61100x100mm', vi: 's\u00f3ng \u0111\u01a1n 1100x100mm' },
    material: { zh: '\u74e6\u695e\u7eb8\u5355\u74e6', vi: 'gi\u1ea5y carton s\u00f3ng \u0111\u01a1n' },
    color: { zh: '\u7eb8\u8272', vi: 'm\u00e0u gi\u1ea5y' },
    attr: { zh: '\u5305\u6750', vi: 'v\u1eadt li\u1ec7u \u0111\u00f3ng g\u00f3i' },
  };
  const controller = createAgentController({
    gateway: {
      listModels: () => [{ id: 'test-model', grade: 'B' }],
      chat: async request => {
        gatewayCalls.push(request);
        return { choices: [{ message: { content: JSON.stringify({
          intent: 'workflow_update', workflowAction: 'ask_clarification', responseLanguage: 'zh', schemaVersion: 1, rejectionCode: null,
          taskUpdates: [{ taskRef: { kind: 'new', value: 'consolidate_materials' }, action: 'create_task', fields: { sourceMaterialIds: ['S1', 'S2'], newMaterialCode: 'ZK1100100' } }],
          proposedActions: [],
        }) } }] };
      },
    },
    trustPolicy: {
      buildContext: ({ query }) => ({ query }),
      createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
      authorizeToolCall: call => call,
      validateModelOutput: output => output,
    },
    runTool: async call => {
      toolCalls.push(call);
      return {
        duplicateGroups: [{ material: duplicateFields, sourceMaterialIds: ['S1', 'S2'], sourceMaterialCodes: ['LGS031ZK', 'LGS032ZK'], materialCount: 2, affectedBomEntryCount: 4, affectedProducts: ['LGS031'] }],
        totalGroups: 1, totalMaterials: 2, truncated: false,
        evidence: { id: 'duplicate-1', sourceType: 'pdm-material-duplicate-audit', sourcePath: 'data/materials.json', recordId: 'paper-card', sourceCommit: 'a'.repeat(40), capturedAt: '2026-08-08T00:00:00Z' },
      };
    },
  });
  const result = await controller.runTurn({
    query: '\u8bf7\u628a1100x100mm\u7eb8\u5361\u7edf\u4e00\u4e3aZK1100100\u5e76\u66ff\u6362BOM',
    route: { intent: 'proposal', confidence: 'deterministic', preferredTool: 'find_duplicate_materials', entities: { materialName: '\u7eb8\u5361' } },
    snapshot: { sourceMetadata: { commitSha: 'a'.repeat(40) }, payload: { materialDb: { materials: {} } } },
    model: 'test-model',
    availableTools: ['find_duplicate_materials', 'search_pdm'],
  });

  assert.deepEqual(toolCalls.map(call => call.name), ['find_duplicate_materials']);
  assert.deepEqual(gatewayCalls[0].tools, []);
  assert.match(JSON.stringify(gatewayCalls[0].messages), /never create a consolidation task from a suspected group/i);
  assert.equal(result.conversationContext.workflowState.tasks[0].pendingAction, 'confirmation');
});

test('agent-controller: retries a failed model-selected lookup with one bounded PDM recovery search', async () => {
  let modelCallCount = 0;
  const toolCalls = [];
  const controller = createAgentController({
    gateway: {
      listModels: () => [{ id: 'test-model', grade: 'B' }],
      chat: async () => {
        modelCallCount += 1;
        if (modelCallCount === 1) {
          return { choices: [{ message: { tool_calls: [{
            id: 'bad_lookup',
            function: { name: 'get_material', arguments: '{"materialId":"unknown"}' },
          }] } }] };
        }
        return { choices: [{ message: { content: 'I checked the recovered PDM result.' } }] };
      },
    },
    trustPolicy: {
      buildContext: ({ query }) => ({ query }),
      createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
      authorizeToolCall: call => {
        if (call.name === 'get_material') throw new Error('Unknown material');
        return call;
      },
      validateModelOutput: output => output,
    },
    runTool: async call => {
      toolCalls.push(call);
      return { materials: [{ code: 'LGS031ZK' }] };
    },
  });

  const result = await controller.runTurn({
    query: 'Find the paper card material',
    route: { intent: 'ambiguous', confidence: 'ambiguous', entities: {} },
    snapshot: {},
    model: 'test-model',
    availableTools: ['get_material', 'search_pdm'],
  });

  assert.equal(result.text, 'I checked the recovered PDM result.');
  assert.deepEqual(toolCalls, [{ name: 'search_pdm', arguments: { query: 'Find the paper card material' } }]);
});

test('agent-controller: converts malformed proposal output into a grounded clarification workflow', async () => {
  const controller = createAgentController({
    gateway: {
      listModels: () => [{ id: 'test-model', grade: 'B' }],
      chat: async () => ({ choices: [{ message: { content: '{"intent":"workflow_update"' } }] }),
    },
    trustPolicy: {
      buildContext: ({ query }) => ({ query }),
      createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
      validateModelOutput: output => output,
    },
    formatWorkflowRecovery: ({ hasEvidence }) => hasEvidence ? 'Recovered from verified data.' : 'Need a safe scope.',
  });

  const result = await controller.runTurn({
    query: 'Create a proposal for those materials',
    route: { intent: 'proposal', confidence: 'ambiguous', entities: {} },
    snapshot: {},
    model: 'test-model',
    availableTools: [],
  });

  assert.equal(result.text, 'Need a safe scope.');
  assert.equal(result.conversationContext.workflowState.workflowStatus, 'awaiting_clarification');
  assert.equal(result.conversationContext.workflowState.tasks.length, 0);
});

test('agent-controller: gives the model the full duplicate audit for an independent review', async () => {
  let modelCalls = 0;
  const requests = [];
  const controller = createAgentController({
    gateway: {
      listModels: () => [{ id: 'test-model', grade: 'B' }],
      chat: async request => {
        modelCalls += 1;
        requests.push(request);
        return { choices: [{ message: { content: '1100x100mm, 860x100mm' } }] };
      },
    },
    trustPolicy: {
      buildContext: ({ query }) => ({ query }),
      createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
      authorizeToolCall: call => call,
      validateModelOutput: output => output,
    },
    runTool: async () => ({
      duplicateGroups: [
        { material: { name: { zh: '\u7eb8\u5361' }, spec: { zh: '1100x100mm' } }, sourceMaterialCodes: ['A', 'B'], affectedBomEntryCount: 2 },
        { material: { name: { zh: '\u7eb8\u5361' }, spec: { zh: '860x100mm' } }, sourceMaterialCodes: ['C', 'D'], affectedBomEntryCount: 2 },
      ],
      auditedMaterials: [{ materialId: 'A', code: 'A' }, { materialId: 'B', code: 'B' }, { materialId: 'C', code: 'C' }, { materialId: 'D', code: 'D' }],
      totalGroups: 2,
      evidence: { id: 'duplicate-all', sourceType: 'pdm-material-duplicate-audit', sourcePath: 'data/materials.json', recordId: 'paper-card', sourceCommit: 'a'.repeat(40), capturedAt: '2026-08-08T00:00:00Z' },
    }),
    formatToolFallback: ({ toolResult }) => toolResult.duplicateGroups.map(group => group.material.spec.zh).join(', '),
  });

  const result = await controller.runTurn({
    query: '\u68c0\u67e5\u7eb8\u5361\u91cd\u590d\u7269\u6599',
    route: { intent: 'duplicate_materials', confidence: 'deterministic', preferredTool: 'find_duplicate_materials', entities: { materialName: '\u7eb8\u5361' } },
    snapshot: { sourceMetadata: { commitSha: 'a'.repeat(40) } },
    model: 'test-model',
    availableTools: ['find_duplicate_materials'],
  });

  assert.equal(modelCalls, 1);
  assert.equal(result.text, '1100x100mm, 860x100mm');
  assert.deepEqual(result.citations, ['duplicate-all']);
  assert.equal(result.agentDecision, null);
  assert.match(JSON.stringify(requests[0].messages), /PDM_DUPLICATE_AUDIT_REVIEW/);
  assert.match(JSON.stringify(requests[0].messages), /auditedMaterials/);
});

test('agent-controller: applies an explicit code convention to every audited duplicate group', async () => {
  const requests = [];
  const controller = createAgentController({
    gateway: {
      listModels: () => [{ id: 'test-model', grade: 'B' }],
      chat: async request => {
        requests.push(request);
        return { choices: [{ message: { content: JSON.stringify({
          intent: 'workflow_update', workflowAction: 'ask_clarification', responseLanguage: 'zh', schemaVersion: 1, rejectionCode: null,
          taskUpdates: [
            { taskRef: { kind: 'new', value: 'consolidate_materials' }, action: 'create_task', fields: { sourceMaterialIds: ['A', 'B'], newMaterialCode: 'ZK1100100' } },
            { taskRef: { kind: 'new', value: 'update_material' }, action: 'create_task', fields: { materialCode: 'C', spec_zh: '\u5355\u74e6860x100mm', spec_vi: 's\u00f3ng \u0111\u01a1n 860x100mm' } },
            { taskRef: { kind: 'new', value: 'consolidate_materials' }, action: 'create_task', fields: { sourceMaterialIds: ['C', 'D'], newMaterialCode: 'ZK0860100' } },
          ],
          proposedActions: [],
        }) } }] };
      },
    },
    trustPolicy: {
      buildContext: ({ query }) => ({ query }),
      createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
      authorizeToolCall: call => call,
      validateModelOutput: output => output,
    },
    runTool: async () => ({
      duplicateGroups: [{ sourceMaterialIds: ['A', 'B'], material: { spec: { zh: '1100x100mm' } } }],
      suspectedDuplicateGroups: [{ sourceMaterialIds: ['C', 'D'], differingFields: ['spec'], material: { spec: { zh: '\u5355\u74e6860x100mm', vi: 's\u00f3ng \u0111\u01a1n 860x100mm' } } }],
      auditedMaterials: [
        { materialId: 'A', code: 'LGS031ZK', spec: { zh: '\u5355\u74e61100x100mm', vi: 's\u00f3ng \u0111\u01a1n 1100x100mm' } },
        { materialId: 'B', code: 'LGS032ZK', spec: { zh: '\u5355\u74e61100x100mm', vi: 's\u00f3ng \u0111\u01a1n 1100x100mm' } },
        { materialId: 'C', code: 'LGS131ZK', spec: { zh: '\u5355\u74e6860x100mm', vi: 's\u00f3ng \u0111\u01a1n 860x100mm' } },
        { materialId: 'D', code: 'LGS420ZK', spec: { zh: '\u5355\u74e6860x100mm', vi: '\u5355\u74e6860x100mm' } },
      ],
      truncated: false,
      evidence: { id: 'duplicate-all-groups', sourceType: 'pdm-material-duplicate-audit', sourcePath: 'data/materials.json', recordId: 'paper-card', sourceCommit: 'a'.repeat(40), capturedAt: '2026-08-08T00:00:00Z' },
    }),
  });

  const result = await controller.runTurn({
    query: '\u90a3\u4e9b\u91cd\u590d\u7ec4\u4ee5\u4e0a\u5e2e\u6211\u7edf\u4e00\u4e00\u65b0\u7269\u6599\u7f16\u7801\u6bd4\u5982\u7eb8\u5361\u67091100x100mm\u89c4\u683c\u5c31\u662fZK1100100\u7136\u540e\u5e76\u66ff\u6362\u5168\u90e8\u76f8\u5173BOM',
    route: { intent: 'proposal', confidence: 'deterministic', preferredTool: 'find_duplicate_materials', entities: { materialName: '\u7eb8\u5361' } },
    snapshot: { sourceMetadata: { commitSha: 'a'.repeat(40) }, payload: { materialDb: { materials: {} } } },
    model: 'test-model',
    availableTools: ['find_duplicate_materials'],
  });

  assert.equal(requests.length, 0);
  assert.equal(result.usage.modelCalls, 0);
  assert.deepEqual(
    result.conversationContext.workflowState.tasks.map(task => task.type),
    ['update_material', 'consolidate_materials', 'consolidate_materials'],
  );
});

test('agent-controller: confirms a deterministic consolidation proposal without recalling the model', async () => {
  let modelCalls = 0;
  const appliedOperations = [];
  const baseMaterial = {
    name: { zh: '\u7eb8\u5361', vi: 'gi\u1ea5y l\u00f3t' },
    material: { zh: '\u74e6\u695e\u7eb8\u5355\u74e6', vi: 'carton' },
    color: { zh: '\u7eb8\u8272', vi: 'm\u00e0u gi\u1ea5y' },
    attr: { zh: '\u5305\u6750', vi: 'bao b\u00ec' },
    drawings: [],
    models3d: [],
  };
  const materials = {
    A: { id: 'A', code: 'LGS031ZK', ...baseMaterial, spec: { zh: '\u5355\u74e61100x100mm', vi: '\u5355\u74e61100x100mm' } },
    B: { id: 'B', code: 'LGS032ZK', ...baseMaterial, spec: { zh: '\u5355\u74e61100x100mm', vi: 's\u00f3ng \u0111\u01a1n 1100x100mm' } },
    C: { id: 'C', code: 'LGS033ZK', ...baseMaterial, spec: { zh: '\u5355\u74e61100x100mm', vi: 's\u00f3ng \u0111\u01a1n 1100x100mm' } },
  };
  const audit = {
    duplicateGroups: [],
    suspectedDuplicateGroups: [{
      matchType: 'translation_mismatch',
      material: materials.B,
      sourceMaterialIds: ['A', 'B', 'C'],
      sourceMaterialCodes: ['LGS031ZK', 'LGS032ZK', 'LGS033ZK'],
      differingFields: ['spec'],
      affectedProducts: ['LGS031'],
    }],
    auditedMaterials: Object.values(materials).map(item => ({ ...item, materialId: item.id })),
    truncated: false,
    evidence: {
      id: 'duplicate-confirmation',
      sourceType: 'pdm-material-duplicate-audit',
      sourcePath: 'data/materials.json',
      sourceCommit: 'a'.repeat(40),
      capturedAt: '2026-08-08T00:00:00Z',
    },
  };
  const snapshot = {
    isAdmin: true,
    canEditRevision: false,
    dirty: false,
    selection: { productCode: 'LGS031', color: 'black' },
    sourceMetadata: { commitSha: 'a'.repeat(40) },
    payload: {
      bom: {
        LGS031: {
          code: 'LGS031',
          revision: 'V4',
          colors: ['black'],
          color_info: { black: { sku: 'LGS031-B', materials: [] } },
        },
      },
      materialDb: {
        materials,
        bomEntries: [{
          id: 'entry-1',
          parentType: 'product',
          parentId: 'LGS031',
          productCode: 'LGS031',
          color: 'black',
          materialId: 'A',
          comp_code: 'ZK',
          qty: '1',
          order: 0,
        }],
      },
      productRevisions: {
        LGS031: { currentRevision: 'V4', currentRevisionInfo: { workflowState: 'released' }, revisions: [] },
      },
    },
  };
  const controller = createAgentController({
    gateway: {
      listModels: () => [{ id: 'test-model', grade: 'B' }],
      chat: async () => {
        modelCalls += 1;
        throw new Error('The deterministic flow must not call the model.');
      },
    },
    trustPolicy: {
      buildContext: ({ query }) => ({ query }),
      createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
      authorizeToolCall: call => call,
      validateModelOutput: output => output,
    },
    runTool: async (call) => {
      if (call.name === 'find_duplicate_materials') return audit;
      if (call.name === 'apply_mutation') {
        appliedOperations.push(...call.arguments.operations);
        return buildMutationProposalReview(snapshot, {
          summary: 'Consolidate duplicate paper cards',
          operations: call.arguments.operations,
        });
      }
      throw new Error(`Unexpected tool ${call.name}`);
    },
  });
  const first = await controller.runTurn({
    query: '\u8bf7\u5904\u7406\u4ee5\u4e0a\u6240\u6709\u91cd\u590d\u7ec4\uff0c1100x100mm \u4f7f\u7528 ZK1100100\uff0c\u66ff\u6362\u5168\u90e8 BOM',
    route: { intent: 'proposal', confidence: 'deterministic', preferredTool: 'find_duplicate_materials', entities: { materialName: '\u7eb8\u5361' } },
    snapshot,
    model: 'test-model',
    availableTools: ['find_duplicate_materials'],
  });
  const second = await controller.runTurn({
    query: '\u6211\u786e\u8ba4\u5f53\u524d\u8303\u56f4\u3002\u8bf7\u521b\u5efa proposal\u3002',
    route: { intent: 'ambiguous', confidence: 'ambiguous', preferredTool: null, entities: {} },
    snapshot,
    model: 'test-model',
    availableTools: ['apply_mutation'],
    conversationContext: first.conversationContext,
  });

  assert.equal(modelCalls, 0);
  assert.deepEqual(appliedOperations.map(operation => operation.operationType), [
    'create_product_revision',
    'update_material',
    'consolidate_materials',
  ]);
  assert.equal(appliedOperations[0].payload.revision, 'V4.1');
  assert.equal(appliedOperations[1].payload.patch.spec.vi, 's\u00f3ng \u0111\u01a1n 1100x100mm');
  assert.equal(appliedOperations[2].payload.material.spec.vi, 's\u00f3ng \u0111\u01a1n 1100x100mm');
  assert.doesNotMatch(second.text, /valid operation data|\u6709\u6548\u7684\u64cd\u4f5c\u6570\u636e/iu);
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

test('agent-controller: requests user teaching when an ambiguous turn has no local or model answer', async () => {
  const providerError = new Error('Overloaded');
  providerError.status = 503;
  const controller = createAgentController({
    gateway: {
      listModels: () => [{ id: 'only:free', grade: 'B' }],
      chat: async () => { throw providerError; },
    },
    trustPolicy: {
      buildContext: ({ query }) => ({ query }),
      createBudget: () => ({ recordToolCall: () => {}, recordModelCall: () => {}, checkExpiry: () => {} }),
      authorizeToolCall: call => call,
      validateModelOutput: output => output,
    },
  });

  const result = await controller.runTurn({
    query: '火星架是什么意思?',
    route: { intent: 'ambiguous', confidence: 'ambiguous', entities: {} },
    snapshot: {},
    model: 'only:free',
    availableTools: [],
  });

  assert.equal(result.fallback, true);
  assert.equal(result.needsTeaching, true);
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
