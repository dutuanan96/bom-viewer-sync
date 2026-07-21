import { createOpenRouterGateway } from './openrouter-gateway.js';
import { createTrustPolicy } from './trust-policy.js';
import { createAgentController } from './agent-controller.js';
import { createWorkspaceView, createSettingsView } from './workspace-view.js';
import { ALLOWED_TOOLS } from './contracts.js';
import { createKnowledgeImporter } from './knowledge-import.js';
import { routePdmIntent } from './intent-router.js';
import { createConversationSession } from './conversation-session.js';
import { createPdmSkillRegistry } from './pdm-skill-registry.js';
import { selectScopedMemories } from './scoped-memory.js';
import { createEntityResolver } from './entity-resolver.js';
import { createMappingCandidate, exportCompanyPromotion, personalMappingsFromStore } from './entity-mapping.js';
import promptPack from '../../../knowledge/ai/prompt-pack.json' with { type: 'json' };
import skillsPack from '../../../knowledge/ai/skills.json' with { type: 'json' };
import companyEntityAliases from '../../../knowledge/entity-aliases.json' with { type: 'json' };
import marketplaceAliases from '../../../knowledge/marketplace-aliases.json' with { type: 'json' };

export const AI_PROMPT_PACK_VERSION = promptPack.packVersion;

const PRODUCT_ID_SCHEMA = Object.freeze({ type: 'string', pattern: '^LGS\\d{3,4}$' });
const NON_EMPTY_STRING_SCHEMA = Object.freeze({ type: 'string', minLength: 1, maxLength: 1000 });

const TOOL_SCHEMAS = {
  search_products: {
    description: 'Search for products by name or code',
    parameters: { type: 'object', properties: { query: NON_EMPTY_STRING_SCHEMA }, required: ['query'], additionalProperties: false }
  },
  get_product: {
    description: 'Get product summary by product code',
    parameters: { type: 'object', properties: { productId: PRODUCT_ID_SCHEMA }, required: ['productId'], additionalProperties: false }
  },
  resolve_sku: {
    description: 'Resolve a SKU alias to internal SKU',
    parameters: { type: 'object', properties: { alias: NON_EMPTY_STRING_SCHEMA }, required: ['alias'], additionalProperties: false }
  },
  get_bom: {
    description: 'Get BOM rows for a product',
    parameters: { type: 'object', properties: { productId: PRODUCT_ID_SCHEMA, color: NON_EMPTY_STRING_SCHEMA }, required: ['productId'], additionalProperties: false }
  },
  get_revision_history: {
    description: 'Get revision history and status (draft, released) for a product',
    parameters: { type: 'object', properties: { productId: PRODUCT_ID_SCHEMA }, required: ['productId'], additionalProperties: false }
  },
  get_material: {
    description: 'Get a material by materialId',
    parameters: { type: 'object', properties: { materialId: NON_EMPTY_STRING_SCHEMA }, required: ['materialId'], additionalProperties: false }
  },
  where_used: {
    description: 'Find all products that use a given materialId',
    parameters: { type: 'object', properties: { materialId: NON_EMPTY_STRING_SCHEMA }, required: ['materialId'], additionalProperties: false }
  },
  compare_boms: {
    description: 'Compare BOM rows between two products',
    parameters: { type: 'object', properties: { productId1: PRODUCT_ID_SCHEMA, color1: NON_EMPTY_STRING_SCHEMA, productId2: PRODUCT_ID_SCHEMA, color2: NON_EMPTY_STRING_SCHEMA }, required: ['productId1', 'productId2'], additionalProperties: false }
  },
  audit_product_data: {
    description: 'Audit product data quality',
    parameters: { type: 'object', properties: { productId: PRODUCT_ID_SCHEMA }, required: ['productId'], additionalProperties: false }
  },
  apply_mutation: {
    description: 'Apply an exact data mutation locally. Use this to update material fields or BOM quantities. operationType must be update_material_field or update_bom_quantity.',
    parameters: {
      type: 'object',
      properties: {
        operationType: { type: 'string' },
        targetId: { type: 'string' },
        payload: { type: 'object' }
      },
      required: ['operationType', 'targetId', 'payload'],
      additionalProperties: false
    }
  },
  get_marketplace_insights: {
    description: 'Get Amazon Voice of Customer insights for a product',
    parameters: { type: 'object', properties: { productId: PRODUCT_ID_SCHEMA }, required: ['productId'], additionalProperties: false }
  },
  store_memory: {
    description: 'Store self-learning memory about user preferences',
    parameters: { type: 'object', properties: { key: NON_EMPTY_STRING_SCHEMA, value: NON_EMPTY_STRING_SCHEMA }, required: ['key', 'value'], additionalProperties: false }
  },
  retrieve_memory: {
    description: 'Retrieve self-learning memory',
    parameters: { type: 'object', properties: { key: NON_EMPTY_STRING_SCHEMA }, required: ['key'], additionalProperties: false }
  }
};

export function buildAvailableTools(modelInfo) {
  return Array.from(ALLOWED_TOOLS)
    .filter(name => name !== 'apply_mutation' || modelInfo?.grade === 'A')
    .map(name => ({
      type: 'function',
      function: { name, ...TOOL_SCHEMAS[name] }
    }));
}

export function createAiAssistantFeature({ runTool, getSnapshot, localStore, fetchImpl = globalThis.fetch, t = (k) => k }) {
  const gateway = createOpenRouterGateway({ fetchImpl });
  const trustPolicy = createTrustPolicy();
  const runtime = createAgentController({ gateway, trustPolicy, runTool });
  const knowledgeImporter = createKnowledgeImporter();
  const conversationSession = createConversationSession();
  const skillRegistry = createPdmSkillRegistry({ promptPack, skillsPack });

  let currentModel = 'nvidia/nemotron-3-ultra-550b-a55b:free';
  let modelRegistry = [];
  let marketplaceWebEnabled = false;

  const refreshModels = () => {
    modelRegistry = gateway.listModels();
    settings.updateModels(modelRegistry);
  };

  const getCurrentModelInfo = () => modelRegistry.find(model => model.id === currentModel);

  const workspace = createWorkspaceView({
    t,
    onSend: async (text) => {
      workspace.renderMessage({ role: 'user', text });
      if (workspace.toggleLoading) workspace.toggleLoading(true);
      try {
        const snapshot = getSnapshot();
        const modelTools = buildAvailableTools(getCurrentModelInfo());
        const history = conversationSession.contextFor(text);
        const currentSourceCommit = snapshot?.sourceMetadata?.commitSha || snapshot?.payload?.sourceMetadata?.commitSha || null;
        const personalMappings = personalMappingsFromStore(localStore, { currentSourceCommit });
        const entityResolver = createEntityResolver({
          snapshot,
          companyMappings: companyEntityAliases,
          personalMappings,
          marketplaceAliases,
        });
        const entityResolution = entityResolver.resolve({ query: text });
        const proposalTargetAuthorized = entityResolution.status === 'resolved'
          && entityResolution.requiresConfirmation === false
          && ['canonical-id', 'personal-confirmed', 'company-confirmed', 'marketplace-confirmed'].includes(entityResolution.source);
        const availableTools = proposalTargetAuthorized
          ? modelTools
          : modelTools.filter(tool => tool?.function?.name !== 'apply_mutation');
        const resolvedEntities = entityResolution.status === 'resolved' && entityResolution.target
          ? [entityResolution.target]
          : [];
        const route = routePdmIntent({ query: text, history, selection: snapshot.selection, availableTools, resolvedEntities });

        if (route.intent === 'greeting') {
          const reply = t('ai.message.greetingResponse');
          workspace.renderMessage({ role: 'assistant', text: reply });
          try { conversationSession.record({ userText: text, assistantText: reply }); } catch {}
          if (workspace.toggleLoading) workspace.toggleLoading(false);
          return;
        }

        const skill = skillRegistry.select(route);
        const confirmedMemories = selectScopedMemories({
          localStore,
          route,
          snapshot,
          query: text,
        });
        const result = await runtime.runTurn({
          query: text,
          history,
          route,
          snapshot,
          model: currentModel,
          marketplaceWebEnabled,
          availableTools,
          specialistPrompt: skillRegistry.promptFor(skill),
          confirmedMemories,
          entityResolution,
          clarificationText: t('ai.mapping.clarification'),
        });

        workspace.renderMessage({
          role: 'assistant',
          text: result.text,
          citations: result.citations,
          evidence: result.evidenceItems,
          mappingCandidates: result.clarification ? result.entityResolution?.candidates : [],
          onSelectMapping: (candidate) => {
            if (!localStore?.createCandidate || !candidate?.target) return;
            const mapping = createMappingCandidate({
              id: `mapping_candidate_${Date.now().toString(36)}`,
              phrase: result.entityResolution.phrase,
              target: candidate.target,
              confidence: candidate.confidence,
              sourceType: 'user-proposed',
              sourceRef: 'mapping-clarification',
              capturedAt: new Date().toISOString(),
              sourceCommit: currentSourceCommit,
            });
            const canonicalTarget = mapping.target.type === 'material'
              ? mapping.target.materialId
              : [mapping.target.productCode, mapping.target.color].filter(Boolean).join(' / ');
            localStore.createCandidate({
              scope: { project: 'jintai-pdm', mappingType: 'entity-alias' },
              fact: `${mapping.phrase} -> ${canonicalTarget}`,
              provenance: mapping.provenance,
              sourceCommit: currentSourceCommit,
              promptPackVersion: AI_PROMPT_PACK_VERSION,
              entityMapping: mapping,
            });
            settings.refreshMemories();
            workspace.renderMessage({ role: 'assistant', text: t('ai.mapping.candidateCreated') });
          },
        });
        settings.updateTrace(result.trace);
        try {
          conversationSession.record({ userText: text, assistantText: result.text });
        } catch {
          // Secret-like or otherwise unsafe conversation text is never retained.
        }
      } catch (err) {
        let msg = err.message;
        if (err.code === 'budgetExceeded') {
          msg = t('ai.error.budgetExceeded') || 'Budget exceeded for this turn.';
        }
        workspace.renderMessage({ role: 'assistant', text: t('ai.message.error') + ': ' + msg });
      } finally {
        if (workspace.toggleLoading) workspace.toggleLoading(false);
      }
    },
    onClear: () => {
      conversationSession.clear();
    }
  });

  const settings = createSettingsView({
    t,
    onConnect: async (key) => {
      try {
        await gateway.connect(key);
        refreshModels();
        settings.updateState(true);
      } catch {
        settings.updateState(false);
        workspace.renderMessage({ role: 'assistant', text: t('ai.message.error') });
      }
    },
    onDisconnect: () => {
      gateway.clearKey();
      conversationSession.clear();
      settings.updateState(false);
      workspace.clear();
    },
    onModelChange: (model) => {
      currentModel = model;
    },
    onMarketplaceWebChange: (enabled) => {
      marketplaceWebEnabled = enabled === true;
    },
    getDiagnostics: () => gateway.diagnostics(),
    localStore,
    onExportMapping: exportCompanyPromotion,
    onKnowledgeImport: async (file) => {
      const imported = knowledgeImporter.importFile({ name: file.name, text: await file.text() });
      return localStore.createCandidate({
        scope: { project: 'jintai-pdm', knowledgeImportId: imported.id },
        fact: imported.content,
        provenance: [{
          sourceType: imported.provenance.sourceType,
          sourceRef: imported.provenance.sourceRef,
          capturedAt: imported.provenance.capturedAt,
          contentHash: imported.contentHash,
        }],
        sourceCommit: null,
        promptPackVersion: AI_PROMPT_PACK_VERSION,
      });
    }
  });

  return {
    connect: async (key) => {
      await gateway.connect(key);
      refreshModels();
      settings.updateState(true);
    },
    disconnect: () => {
      gateway.clearKey();
      conversationSession.clear();
      settings.updateState(false);
      workspace.clear();
    },
    updateLanguage: () => {
      workspace.updateLanguage();
      settings.updateLanguage();
    },
    ui: {
      workspaceElement: workspace.element,
      settingsElement: settings.element,
      renderMessage: workspace.renderMessage
    },
    destroy: () => {
      gateway.clearKey();
      conversationSession.clear();
      if (typeof workspace.destroy === 'function') workspace.destroy();
      settings.element.remove();
    }
  };
}
