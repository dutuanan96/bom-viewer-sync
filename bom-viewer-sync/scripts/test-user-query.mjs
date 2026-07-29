import { createOpenRouterGateway } from '../src/features/ai-assistant/openrouter-gateway.js';
import { PdmKnowledge } from '../src/features/ai-assistant/pdm-knowledge.js';
import { createAgentController } from '../src/features/ai-assistant/agent-controller.js';
import { createTrustPolicy } from '../src/features/ai-assistant/trust-policy.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function runTest() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');

  const manifest = JSON.parse(readFileSync(resolve('data/manifest.json'), 'utf8'));
  const materialData = JSON.parse(readFileSync(resolve('data/materials.json'), 'utf8'));
  const bom = Object.fromEntries(manifest.products.map(productCode => [
    productCode,
    JSON.parse(readFileSync(resolve(`data/products/${productCode}.json`), 'utf8')),
  ]));
  const payload = { bom, ...materialData };

  const snapshot = {
    isAdmin: true,
    canEditRevision: false,
    dirty: false,
    payload,
    sourceMetadata: { commitSha: '123' },
    selection: { productCode: 'LGS433', color: '复古色' }
  };

  const knowledge = new PdmKnowledge(snapshot);
  const gateway = createOpenRouterGateway();
  await gateway.connect(apiKey);

  const trustPolicy = createTrustPolicy();

  const agent = createAgentController({
    gateway,
    trustPolicy,
    runTool: async (call) => {
      console.log(`\n[TOOL CALL] ${call.name}`, JSON.stringify(call.arguments, null, 2));
      if (call.name === 'apply_mutation') return { success: true };
      const methodName = call.name.replace(/_([a-z])/g, g => g[1].toUpperCase());
      return knowledge[methodName](call.arguments);
    }
  });

  const abort = new AbortController();
  const userQuery = `LGS433 thùng giấy 1185x330x110mm sửa thành 1185x330x105mm，纸护角 50x50x100mm sửa thành 50x50x95mm，泡沫 20kg,320x100x8mm sửa thành 20kg, 322x95x11mm còn 泡沫 16kg,925x295x10mm sửa thành 16kg, 300x40x15mm， thêm 纸卡 có 物料编码 là 1100310ZK`;

  console.log('Sending query:', userQuery);
  const result = await agent.runTurn({
    query: userQuery,
    snapshot,
    model: 'xiaomi/mimo-v2.5',
    signal: abort.signal
  });
  
  console.log('\n\nFinal Answer:', result.text);
  gateway.clearKey();
}

runTest();
