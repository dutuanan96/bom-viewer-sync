import { createOpenRouterGateway } from './openrouter-gateway.js';
import { createTrustPolicy } from './trust-policy.js';
import { createRuntime } from './runtime.js';
import { createWorkspaceView, createSettingsView } from './workspace-view.js';
import { ALLOWED_TOOLS } from './contracts.js';
import { t } from './i18n.js';

export function createAiAssistantFeature({ runTool, getSnapshot, fetchImpl = globalThis.fetch }) {
  const gateway = createOpenRouterGateway({ fetchImpl });
  const trustPolicy = createTrustPolicy();
  const runtime = createRuntime({ gateway, trustPolicy, runTool });

  let currentModel = 'openrouter/auto';

  const workspace = createWorkspaceView({
    onSend: async (text) => {
      workspace.renderMessage({ role: 'user', text });
      if (workspace.toggleLoading) workspace.toggleLoading(true);
      try {
        const result = await runtime.runTurn({
          query: text,
          snapshot: getSnapshot(),
          model: currentModel,
          availableTools: Array.from(ALLOWED_TOOLS).map(name => ({ type: 'function', function: { name } }))
        });
        
        workspace.renderMessage({ role: 'assistant', text: result.text, citations: result.citations });
      } catch (err) {
        workspace.renderMessage({ role: 'assistant', text: t('ai.message.error') + ': ' + err.message });
      } finally {
        if (workspace.toggleLoading) workspace.toggleLoading(false);
      }
    },
    onClear: () => {
      // Clear runtime state if necessary
    }
  });

  const settings = createSettingsView({
    onConnect: async (key) => {
      try {
        await gateway.connect(key);
        settings.updateState(true);
      } catch (err) {
        settings.updateState(false);
        console.error('AI connection failed:', err);
      }
    },
    onDisconnect: () => {
      gateway.clearKey();
      settings.updateState(false);
      workspace.clear();
    },
    getDiagnostics: () => gateway.diagnostics()
  });

  return {
    connect: async (key) => {
      await gateway.connect(key);
      settings.updateState(true);
    },
    disconnect: () => {
      gateway.clearKey();
      settings.updateState(false);
      workspace.clear();
    },
    ui: {
      workspaceElement: workspace.element,
      settingsElement: settings.element,
      renderMessage: workspace.renderMessage
    }
  };
}
