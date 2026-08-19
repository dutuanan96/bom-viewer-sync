import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Mock DOM
global.document = {
  createElement(tag) {
    return {
      tagName: tag,
      className: '',
      style: {},
      children: [],
      textContent: '',
      innerHTML: '',
      dataset: {},
      addEventListener() {},
      appendChild(child) { this.children.push(child); return child; },
      replaceChildren(...nodes) { this.children = nodes; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      remove() {},
      setAttribute() {},
      focus() {},
      scrollTo() {}
    };
  }
};
global.window = {
  localStorage: {
    data: {},
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; }
  }
};

import { createAiAssistantFeature } from '../src/features/ai-assistant/index.js';
import { createSettingsView } from '../src/features/ai-assistant/workspace-view.js';

function findByClass(node, className) {
  if (node?.className === className) return node;
  for (const child of node?.children || []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

function findAll(node, predicate, output = []) {
  if (predicate(node)) output.push(node);
  for (const child of node?.children || []) findAll(child, predicate, output);
  return output;
}

test('R2.4: feature initializes safely and returns UI component', async () => {
  const feature = createAiAssistantFeature({
    runTool: async () => {},
    getSnapshot: () => ({ selection: {} })
  });

  assert.ok(feature.ui, 'Feature must expose UI component');
  assert.ok(feature.ui.workspaceElement, 'Feature must expose workspace element');
  assert.ok(feature.ui.settingsElement, 'Feature must expose settings element');
});

test('R2.4: key lifecycle is delegated to gateway, never stored in localStorage', async () => {
  global.window.localStorage.data = {}; // reset

  const feature = createAiAssistantFeature({
    runTool: async () => {},
    getSnapshot: () => ({ selection: {} }),
    // mock gateway for test
    fetchImpl: async (url) => {
      if (url.includes('/api/v1/key')) return { ok: true, json: async () => ({ data: { label: 'test' } }) };
      if (url.includes('/api/v1/models')) return { ok: true, json: async () => ({ data: [] }) };
      return { ok: true, json: async () => ({}) };
    }
  });

  await feature.connect('sk-or-test-key');

  const storageDump = JSON.stringify(global.window.localStorage.data);
  assert.ok(!storageDump.includes('sk-or-test-key'), 'Key must not be in localStorage');
});

test('R2.4: workspace uses textContent to prevent HTML injection', () => {
  const feature = createAiAssistantFeature({
    runTool: async () => {},
    getSnapshot: () => ({ selection: {} })
  });

  feature.ui.renderMessage({ role: 'assistant', text: '<script>alert("hack")</script>', citations: [] });

  // The workspace element should contain the text safely, meaning innerHTML shouldn't execute it
  // Since we use mock DOM, we just verify textContent is used on the message element
  const messagesContainer = feature.ui.workspaceElement.children[0];
  const msgElements = messagesContainer.children;
  const lastMsg = msgElements[msgElements.length - 1];
  
  // lastMsg is the .ai-message-row div. We need to find the text container inside it.
  const msgBody = lastMsg.children.find(c => c.className === 'ai-message') || lastMsg.children[0];
  const textDiv = msgBody.children.find(c => c.className === 'ai-message-text') || msgBody.children[0];
  
  assert.equal(textDiv.textContent, '<script>alert("hack")</script>', 'Must use textContent for text');
  assert.ok(!textDiv.innerHTML.includes('<script>'), 'Must not inject HTML');
});

test('R2.4: assistant Markdown markers are normalized to readable plain text', () => {
  const feature = createAiAssistantFeature({
    runTool: async () => {},
    getSnapshot: () => ({ selection: {} })
  });

  feature.ui.renderMessage({ role: 'assistant', text: '**\u5171\u7528\u94c1\u4ef6\uff1a**\n* **M6x22\u87ba\u4e1d**', citations: [] });

  const messagesContainer = feature.ui.workspaceElement.children[0];
  const row = messagesContainer.children[messagesContainer.children.length - 1];
  const body = row.children.find(child => child.className === 'ai-message');
  const textDiv = body.children.find(child => child.className === 'ai-message-text');
  assert.equal(textDiv.textContent, '\u5171\u7528\u94c1\u4ef6\uff1a\n- M6x22\u87ba\u4e1d');
  assert.equal(textDiv.innerHTML, '');
});

test('R2.4: clearing connection clears gateway and workspace', async () => {
  const feature = createAiAssistantFeature({
    runTool: async () => {},
    getSnapshot: () => ({ selection: {} })
  });

  feature.disconnect();
  
  const messagesContainer = feature.ui.workspaceElement.children[0];
  const msgElements = messagesContainer.children;
  assert.equal(msgElements.length, 0, 'Workspace must be cleared');
});

test('R2.4: settings renders the latest safe trace with textContent', () => {
  const settings = createSettingsView({
    getDiagnostics: () => ({ connected: true }),
    t: key => key
  });
  settings.updateTrace(Object.freeze([
    Object.freeze({ type: 'route_selected', offsetMs: 0, intent: 'revision_status' }),
    Object.freeze({ type: 'answer_validated', offsetMs: 12, status: 'success' })
  ]));

  const output = findByClass(settings.element, 'ai-trace-output');
  assert.ok(output);
  assert.match(output.textContent, /revision_status/);
  assert.equal(output.innerHTML, '');
});

test('settings renders governed mapping details and disables promotion until confirmation', () => {
  const baseMapping = {
    schemaVersion: 1,
    id: 'mapping_candidate_bellah',
    mappingType: 'entity-alias',
    scope: 'personal',
    phrase: 'con BellaH',
    normalizedPhrase: 'con bellah',
    target: { type: 'product', productCode: 'LGS433' },
    status: 'candidate',
    confidence: 0.95,
    provenance: [{ sourceType: 'user-proposed', sourceRef: 'chat', capturedAt: '2026-07-20T00:00:00.000Z' }],
    sourceCommit: 'a'.repeat(40),
  };
  const localStore = {
    listMemories: () => [{ id: 'memory_1', status: 'candidate', fact: 'con BellaH -> LGS433', entityMapping: baseMapping }],
    diagnostics: () => ({ persistence: 'persistent' }),
    confirm() {}, reject() {}, deleteMemory() {},
  };
  const settings = createSettingsView({ localStore, t: key => key, onExportMapping: () => '{}' });
  const detail = findByClass(settings.element, 'ai-mapping-details');
  assert.match(detail.textContent, /con BellaH/);
  assert.match(detail.textContent, /LGS433/);
  assert.match(detail.textContent, /0\.95/);
  assert.equal(detail.innerHTML, '');

  const buttons = findAll(settings.element, node => node?.tagName === 'button');
  const exportButton = buttons.find(button => button.textContent === 'ai.mapping.exportPromotion');
  assert.ok(exportButton);
  assert.equal(exportButton.disabled, true);
  assert.ok(buttons.some(button => button.textContent === 'ai.memory.confirm'));
  assert.ok(buttons.some(button => button.textContent === 'ai.memory.reject'));
});

test('improvement settings separate viewer export from admin review and approval controls', () => {
  const localStore = {
    listMemories: () => [],
    listImprovementCandidates: () => [{
      id: 'improvement_1',
      status: 'reviewed',
      userQuestion: 'Which product uses this part?',
      userCorrection: 'LGS433',
      review: {
        decision: 'recommend-approve',
        evidenceStatus: 'supported',
        summary: 'Supported by PDM.',
      },
    }],
    diagnostics: () => ({ persistence: 'persistent' }),
  };
  const viewer = createSettingsView({ mode: 'viewer', localStore, t: key => key });
  const viewerButtons = findAll(viewer.element, node => node?.tagName === 'button');
  assert.ok(viewerButtons.some(button => button.textContent === 'ai.improvement.export'));
  assert.ok(!viewerButtons.some(button => button.textContent === 'ai.improvement.approve'));
  assert.equal(findAll(viewer.element, node => node?.tagName === 'input' && node.accept === '.json').length, 0);

  const admin = createSettingsView({ mode: 'admin', localStore, t: key => key });
  const adminButtons = findAll(admin.element, node => node?.tagName === 'button');
  assert.ok(adminButtons.some(button => button.textContent === 'ai.improvement.review'));
  assert.ok(adminButtons.some(button => button.textContent === 'ai.improvement.approve'));
  assert.ok(adminButtons.some(button => button.textContent === 'ai.improvement.reject'));
  assert.ok(adminButtons.some(button => button.textContent === 'ai.improvement.exportApproved'));
  assert.equal(findAll(admin.element, node => node?.tagName === 'input' && node.accept === '.json').length, 1);
});

test('workspace renders bounded canonical mapping choices with safe text nodes', () => {
  const feature = createAiAssistantFeature({ runTool: async () => {}, getSnapshot: () => ({ selection: {} }) });
  feature.ui.renderMessage({
    role: 'assistant',
    text: 'Choose a product',
    mappingCandidates: [{ target: { type: 'product', productCode: 'LGS433' }, confidence: 0.94, source: 'fuzzy-canonical' }],
  });
  const card = findByClass(feature.ui.workspaceElement, 'ai-mapping-candidates');
  assert.ok(card);
  assert.match(card.textContent + card.children.map(child => child.textContent).join(' '), /LGS433/);
  assert.equal(card.innerHTML, '');
});

test('R2.4: per-turn budget message does not tell the user to start a new conversation', () => {
  const applicationSource = readFileSync(new URL('../src/application.js', import.meta.url), 'utf8');
  const budgetLine = applicationSource.split('\n').find(line => line.includes("'ai.error.budgetExceeded'"));
  assert.ok(budgetLine);
  assert.doesNotMatch(budgetLine, /\u65b0\u5efa\u5bf9\u8bdd/);
});

test('R2.4: workspace renders multiple categorized markdown tables and intervening text', () => {
  const feature = createAiAssistantFeature({
    runTool: async () => {},
    getSnapshot: () => ({ selection: {} })
  });

  const markdownWithMultipleTables = [
    'Header info text',
    '**零件** (2):',
    '| 序号 | 物料编码 | 名称 |',
    '| --- | --- | --- |',
    '| 1 | P001 | Part 1 |',
    '| 2 | P002 | Part 2 |',
    '**包材** (1):',
    '| 序号 | 物料编码 | 名称 |',
    '| --- | --- | --- |',
    '| 1 | B001 | Box 1 |',
    'Footer summary text'
  ].join('\n');

  feature.ui.renderMessage({ role: 'assistant', text: markdownWithMultipleTables });

  const messagesContainer = feature.ui.workspaceElement.children[0];
  const row = messagesContainer.children[messagesContainer.children.length - 1];
  const body = row.children.find(child => child.className === 'ai-message');
  const tables = findAll(body, node => node?.className === 'ai-message-table-wrap');
  const texts = findAll(body, node => node?.className === 'ai-message-text');

  assert.equal(tables.length, 2, 'Must render both markdown tables');
  assert.ok(texts.some(t => t.textContent.includes('Header info text')));
  assert.ok(texts.some(t => t.textContent.includes('包材 (1):')));
  assert.ok(texts.some(t => t.textContent.includes('Footer summary text')));
});

