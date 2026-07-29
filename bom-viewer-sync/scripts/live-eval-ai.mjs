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

  const manifest = JSON.parse(readFileSync('./data/manifest.json', 'utf8'));
  const materialData = JSON.parse(readFileSync('./data/materials.json', 'utf8'));
  const bom = Object.fromEntries(manifest.products.map(productCode => [
    productCode,
    JSON.parse(readFileSync(`./data/products/${productCode}.json`, 'utf8')),
  ]));
  const payload = { bom, ...materialData };

  const mockSnapshot = {
    isAdmin: true,
    canEditRevision: false,
    dirty: false,
    payload,
    sourceMetadata: { commitSha: '123' },
    selection: { productCode: 'LGS433', color: '复古色' }
  };
  const knowledge = new PdmKnowledge(mockSnapshot);

  const gateway = createOpenRouterGateway();
  await gateway.connect(apiKey);

  const runtime = createRuntime({
    gateway,
    getSystemState: () => mockSnapshot,
    runTool: async (call) => {
      console.log(`\n[TOOL CALL] ${call.name}`, JSON.stringify(call.arguments, null, 2));
      const methodName = call.name.replace(/_([a-z])/g, g => g[1].toUpperCase());
      if (typeof knowledge[methodName] === 'function') {
        return knowledge[methodName](call.arguments);
      }
      return { success: true };
    }
  });

  const abort = new AbortController();
  const userQuery = `LGS433 thùng giấy 1185x330x110mm sửa thành 1185x330x105mm，纸护角 50x50x100mm sửa thành 50x50x95mm，泡沫 20kg,320x100x8mm sửa thành 20kg, 322x95x11mm còn 泡沫 16kg,925x295x10mm sửa thành 16kg, 300x40x15mm， thêm 纸卡 có 物料编码 là 1100310ZK`;
  const iter = runtime.sendMessage(userQuery, abort.signal);

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
