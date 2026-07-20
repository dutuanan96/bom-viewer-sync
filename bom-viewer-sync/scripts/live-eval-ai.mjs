import { createOpenRouterGateway } from '../src/features/ai-assistant/openrouter-gateway.js';
import { PdmKnowledge } from '../src/features/ai-assistant/pdm-knowledge.js';
import { createRuntime } from '../src/features/ai-assistant/runtime.js';
import { readFileSync } from 'node:fs';

async function runLiveEval() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('Skipping live eval: OPENROUTER_API_KEY not set');
    process.exit(0);
  }

  console.log('Starting Live Eval...');

  // Setup fake snapshot
  const mockSnapshot = {
    payload: { bom: {} },
    sourceMetadata: { commitSha: '123' }
  };
  const knowledge = new PdmKnowledge(mockSnapshot);

  // Setup gateway
  const gateway = createOpenRouterGateway();
  await gateway.connect(apiKey);

  const runtime = createRuntime({
    gateway,
    runTool: async (call) => {
      const methodName = call.name.replace(/_([a-z])/g, g => g[1].toUpperCase());
      if (typeof knowledge[methodName] === 'function') {
        return knowledge[methodName](call.arguments);
      }
      throw new Error('Tool not implemented');
    }
  });

  const abort = new AbortController();
  const iter = runtime.sendMessage('Hello, what can you do?', abort.signal);

  let finalResponse = '';
  try {
    for await (const chunk of iter) {
      if (chunk.type === 'text') {
        finalResponse += chunk.delta;
      }
    }
    console.log('Model Response:', finalResponse);
    if (!finalResponse) {
      throw new Error('No text response received');
    }
    console.log('Live Eval Passed');
  } catch (err) {
    console.error('Live Eval Failed:', err);
    process.exit(1);
  } finally {
    gateway.clearKey();
  }
}

runLiveEval();
