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
