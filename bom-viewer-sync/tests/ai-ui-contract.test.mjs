import test from 'node:test';
import assert from 'node:assert/strict';

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
