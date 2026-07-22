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
import { productRevisionOptions } from '../../domain/revisions.js';
import { createGithubKnowledgeSync } from './github-knowledge-sync.js';
import promptPack from '../../../knowledge/ai/prompt-pack.json' with { type: 'json' };
import skillsPack from '../../../knowledge/ai/skills.json' with { type: 'json' };
import companyEntityAliases from '../../../knowledge/entity-aliases.json' with { type: 'json' };
import marketplaceAliases from '../../../knowledge/marketplace-aliases.json' with { type: 'json' };

export const AI_PROMPT_PACK_VERSION = promptPack.packVersion;

function contextForRoute(route, snapshot, fallback = {}, query = '') {
  const entities = route?.entities || {};
  const productIds = Array.isArray(entities.productIds) ? entities.productIds.slice(0, 2) : [];
  const materialIds = Array.isArray(entities.materialIds) ? entities.materialIds.slice(0, 3) : [];
  let revisions = Array.isArray(entities.revisions) ? entities.revisions.slice(0, 4) : [];

  if (route?.intent === 'revision_status' && productIds.length === 1 && revisions.length < 2) {
    try {
      revisions = productRevisionOptions(snapshot?.payload, productIds[0])
        .filter(option => option.current || option.effective)
        .map(option => option.revision)
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    } catch {
      // Keep the route entities when revision metadata is not available.
    }
  }

  const fallbackProducts = fallback.productIds || [];
  const sameProductScope = productIds.length === 0 || (
    productIds.length === fallbackProducts.length && productIds.every((value, index) => value === fallbackProducts[index])
  );
  const context = {
    productIds: productIds.length > 0 ? productIds : fallbackProducts,
    materialIds: materialIds.length > 0 ? materialIds : (sameProductScope ? (fallback.materialIds || []) : []),
    revisions: revisions.length > 0 ? revisions : (sameProductScope ? (fallback.revisions || []) : []),
  };
  const routeSearchQuery = route?.preferredTool === 'search_pdm'
    ? String(entities.searchQuery || query || '').trim()
    : '';
  const searchQuery = routeSearchQuery || String(fallback.searchQuery || '').trim();
  if (searchQuery) context.searchQuery = searchQuery.slice(0, 500);
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value.length > 0));
}

function compactMaterialRow(row) {
  const value = row?.after || row;
  return [
    value?.color ? `[${value.color}]` : '',
    value?.materialCode || value?.componentCode || value?.code || value?.materialId || '',
    value?.nameZh || value?.nameVi || '',
    value?.specZh || value?.specVi || '',
    value?.quantity ? `x${value.quantity}` : '',
  ].filter(Boolean).join(' ');
}

export function formatLocalToolFallback(t, { toolCall, toolResult } = {}) {
  if (!toolCall?.name || !toolResult || toolResult.error) return '';
  const tr = (key, fallback) => {
    if (typeof t === 'function') {
      const res = t(key);
      if (res && res !== key) return res;
    }
    return fallback;
  };

  const lines = [tr('ai.localFallback.notice', 'Local PDM Fact Result')];

  if (toolCall.name === 'compare_revisions') {
    lines.push(`${tr('ai.localFallback.scope', 'Scope')}: ${toolResult.productId} ${toolResult.revision1?.revision} → ${toolResult.revision2?.revision}`);
    if (toolResult.revision1?.changeReason) lines.push(`${toolResult.revision1.revision}: ${toolResult.revision1.changeReason}`);
    if (toolResult.revision2?.changeReason) lines.push(`${toolResult.revision2.revision}: ${toolResult.revision2.changeReason}`);
    lines.push(`${tr('ai.localFallback.added', 'Added')}: ${toolResult.summary?.addedCount || 0}`);
    lines.push(...(toolResult.added || []).slice(0, 8).map(row => `+ ${compactMaterialRow(row)}`));
    lines.push(`${tr('ai.localFallback.removed', 'Removed')}: ${toolResult.summary?.removedCount || 0}`);
    lines.push(...(toolResult.removed || []).slice(0, 8).map(row => `- ${compactMaterialRow(row)}`));
    lines.push(`${tr('ai.localFallback.modified', 'Modified')}: ${toolResult.summary?.modifiedCount || 0}`);
    lines.push(...(toolResult.modified || []).slice(0, 8).map(row => `~ ${compactMaterialRow(row)}`));
    return lines.join('\n').slice(0, 5000);
  }

  if (toolCall.name === 'get_revision_history') {
    lines.push(`${tr('ai.localFallback.scope', 'Scope')}: ${toolResult.productCode || toolResult.productId}`);
    lines.push(`${tr('ai.localFallback.currentRevision', 'Current Revision')}: ${toolResult.currentRevision || ''}`);
    lines.push(`${tr('ai.localFallback.effectiveRevision', 'Effective Revision')}: ${toolResult.effectiveRevision || ''}`);
    if (toolResult.currentRevisionInfo?.changeReason) lines.push(toolResult.currentRevisionInfo.changeReason);
    return lines.join('\n').slice(0, 5000);
  }

  if (toolCall.name === 'search_pdm') {
    if (toolResult.productId) lines.push(`${tr('ai.localFallback.scope', 'Scope')}: ${toolResult.productId}`);
    if (toolResult.matchMode === 'scoped-candidates') {
      lines.push(tr('ai.localFallback.clarifyComponent', 'Please select component'));
      const hints = (toolResult.clarificationHints || []).map(hint => (
        [hint.zh, hint.vi].filter(Boolean).join(' / ')
      )).filter(Boolean);
      if (hints.length > 0) lines.push(hints.join(', '));
      return lines.join('\n').slice(0, 5000);
    }
    if (toolResult.matchMode === 'scoped-empty') {
      lines.push(tr('ai.localFallback.noScopedData', 'No scoped data'));
      return lines.join('\n').slice(0, 5000);
    }
    if (toolResult.matchMode === 'mapping-miss') {
      lines.push(tr('ai.localFallback.mappingConflict', 'Mapping conflict'));
      return lines.join('\n').slice(0, 5000);
    }
    lines.push(`${tr('ai.localFallback.matches', 'Matches')}: ${toolResult.totalMatches || 0}`);
    const usedProducts = [...new Set([
      ...(toolResult.products || []).map(item => item.productCode),
      ...(toolResult.materials || []).flatMap(item => (item.usedBy || []).map(value => value.productCode)),
    ].filter(Boolean))];
    if (usedProducts.length > 0) {
      lines.push(`${tr('ai.localFallback.usedProducts', 'Used Products')}: ${usedProducts.join(', ')}`);
    }
    lines.push(...(toolResult.products || []).slice(0, 10).map(item => `- ${item.productCode} ${item.nameZh || item.nameVi || ''}`.trim()));
    lines.push(...(toolResult.materials || []).slice(0, 10).map(item => {
      const usage = (item.usedBy || []).map(value => value.productCode).filter(Boolean).join(', ');
      return `- ${item.code || item.materialId} ${item.spec?.zh || item.spec?.vi || ''}${usage ? ` → ${usage}` : ''}`;
    }));
    return lines.join('\n').slice(0, 5000);
  }

  if (toolCall.name === 'list_recent_changes') {
    lines.push(`${tr('ai.localFallback.recentChanges', 'Recent Changes')}: ${toolResult.totalMatches || 0}`);
    lines.push(...(toolResult.changes || []).slice(0, 10).map(item => (
      `- ${item.occurredAt || ''} ${item.productCode || ''} ${item.revision || ''} ${item.changeReason || item.reason || item.title || ''}`.trim()
    )));
    return lines.join('\n').slice(0, 5000);
  }

  if (toolCall.name === 'compare_boms') {
    const p1 = toolResult.product1?.productCode || '';
    const p2 = toolResult.product2?.productCode || '';
    lines.push(`${tr('ai.localFallback.scope', 'Scope')}: ${p1} (${toolResult.product1?.color || '-'}) vs ${p2} (${toolResult.product2?.color || '-'})`);
    lines.push(`${tr('ai.localFallback.exactCommon', 'Exact Common')}: ${toolResult.summary?.commonCount || 0}`);
    lines.push(...(toolResult.common || []).slice(0, 6).map(row => `= ${compactMaterialRow(row)}`));
    if (toolResult.summary?.probableCommonCount > 0) {
      lines.push(`${tr('ai.localFallback.probableCommon', 'Probable Common')}: ${toolResult.summary.probableCommonCount}`);
      lines.push(...(toolResult.probableCommon || []).slice(0, 6).map(item => `~ ${compactMaterialRow(item.product1)} <==> ${compactMaterialRow(item.product2)}`));
    }
    if (toolResult.summary?.dataQualityWarningCount > 0) {
      lines.push(`${tr('ai.localFallback.dataQualityWarnings', 'Data Quality Warnings')}: ${toolResult.summary.dataQualityWarningCount}`);
      lines.push(...(toolResult.dataQualityWarnings || []).slice(0, 6).map(w => (
        `! ${w.item1 || ''} ↔ ${w.item2 || ''}: ${tr('ai.localFallback.attributeConflict', 'conflicting BOM attributes')}`
      )));
    }
    lines.push(`${tr('ai.localFallback.onlyProduct', 'Only')} ${p1}: ${toolResult.summary?.onlyProduct1Count || 0}`);
    lines.push(`${tr('ai.localFallback.onlyProduct', 'Only')} ${p2}: ${toolResult.summary?.onlyProduct2Count || 0}`);
    return lines.join('\n').slice(0, 5000);
  }

  if (toolCall.name === 'analyze_pdm') {
    lines.push(`${tr('ai.localFallback.scope', 'Scope')}: ${toolResult.scope || 'catalog'}`);
    if (toolResult.needsClarification && toolResult.clarificationText) {
      let clarification = toolResult.clarificationText;
      if (toolResult.clarificationCode === 'confirm_product_shorthand') {
        clarification = `${tr('ai.localFallback.confirmProduct', 'Do you mean')} ${toolResult.clarificationData?.candidateProductId || toolResult.scope}?`;
      } else if (toolResult.clarificationCode === 'dimension_near_match') {
        const data = toolResult.clarificationData || {};
        clarification = `${tr('ai.localFallback.noExactDimension', 'No exact dimension found')} ${data.requested ?? ''}mm. ${tr('ai.localFallback.nearDimensions', 'Nearby values')}: ${(data.nearValues || []).join(', ')}mm.`;
      } else if (toolResult.clarificationCode === 'parts_metric') {
        clarification = tr('ai.localFallback.choosePartsMetric', 'Please choose unique material types or total BOM quantity.');
      }
      lines.push(`${tr('ai.localFallback.clarificationPrompt', 'Clarification')}: ${clarification}`);
      return lines.join('\n').slice(0, 5000);
    }
    lines.push(`${tr('ai.localFallback.totalMatches', 'Total Matches / Count')}: ${toolResult.totalCount ?? toolResult.totalMatches ?? 0}`);
    lines.push(...(toolResult.results || []).slice(0, 12).map(r => {
      if (r.hardwareBagCount !== undefined) {
        const bags = (r.hardwareBags || []).map(item => item.matCode).filter(Boolean).join(', ');
        return `- ${r.productCode} / ${r.color}: ${r.hardwareBagCount}${bags ? ` (${bags})` : ''}`;
      }
      if (r.uniqueMaterialTypesCount !== undefined) {
        return `- ${r.productCode}${r.color ? ` / ${r.color}` : ''}: ${r.uniqueMaterialTypesCount} ${tr('ai.localFallback.materialTypes', 'material types')}, ${r.totalBomQuantity ?? 0} ${tr('ai.localFallback.totalQuantity', 'total quantity')}`;
      }
      if (r.hardwareCode) {
        return `- ${r.hardwareCode} ${r.nameZh || ''}${r.usedInProducts?.length ? ` → ${r.usedInProducts.join(', ')}` : ''}`.trim();
      }
      if (r.materialCode) {
        return `- ${r.materialCode} ${r.nameZh || ''} ${r.spec || ''}${r.usedInProducts?.length ? ` → ${r.usedInProducts.join(', ')}` : ''}`.trim();
      }
      return `- ${r.productCode || r.nameZh || ''}`;
    }));
    for (const warning of (toolResult.dataQualityWarnings || []).slice(0, 5)) {
      if (warning.type === 'requested_color_not_defined') {
        lines.push(`! ${warning.productCode}: ${warning.requestedColor} — ${tr('ai.localFallback.colorNotDefined', 'color variant is not defined')}. ${tr('ai.localFallback.availableColors', 'Available colors')}: ${(warning.availableColors || []).join(', ')}`);
      }
    }
    return lines.join('\n').slice(0, 5000);
  }

  return '';
}

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
  },
  compare_revisions: {
    description: 'Compare two revisions of a product to see what materials changed, added, or removed',
    parameters: { type: 'object', properties: { productId: PRODUCT_ID_SCHEMA, revision1: NON_EMPTY_STRING_SCHEMA, revision2: NON_EMPTY_STRING_SCHEMA }, required: ['productId', 'revision1', 'revision2'], additionalProperties: false }
  },
  search_pdm: {
    description: 'Search across products, material codes, names, specifications, BOM usage, and revision reasons, optionally scoped to one product',
    parameters: {
      type: 'object',
      properties: { query: NON_EMPTY_STRING_SCHEMA, productId: PRODUCT_ID_SCHEMA, materialId: NON_EMPTY_STRING_SCHEMA },
      required: ['query'],
      additionalProperties: false,
    }
  },
  list_recent_changes: {
    description: 'List recent bounded PDM revision, release, and saved-change events',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  inspect_pdm_schema: {
    description: 'Inspect the safe normalized PDM entity schema, field names, counts, and relationships without reading raw DOM or secrets',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  get_pdm_help: {
    description: 'Explain supported PDM assistant capabilities and give example requests',
    parameters: { type: 'object', properties: { topic: NON_EMPTY_STRING_SCHEMA }, additionalProperties: false }
  },
  analyze_pdm: {
    description: 'Perform catalog-wide aggregation, counting, listing, ranking, and concept/dimension filtering across PDM products and materials',
    parameters: {
      type: 'object',
      properties: {
        query: NON_EMPTY_STRING_SCHEMA,
        scope: NON_EMPTY_STRING_SCHEMA,
        countMode: NON_EMPTY_STRING_SCHEMA,
        componentFamily: NON_EMPTY_STRING_SCHEMA,
        dimensionFilter: NON_EMPTY_STRING_SCHEMA
      },
      required: ['query'],
      additionalProperties: false
    }
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

export function createAiAssistantFeature({ runTool, getSnapshot, localStore, fetchImpl = globalThis.fetch, t = (k) => k, githubSyncConfig = {} }) {
  let settings = null;
  const gateway = createOpenRouterGateway({ fetchImpl });
  const trustPolicy = createTrustPolicy();
  const runtime = createAgentController({
    gateway,
    trustPolicy,
    runTool: async (call, snapshot) => {
      const result = typeof runTool === 'function'
        ? await runTool(call, snapshot)
        : { error: 'Tool execution not provided' };
      if (call?.name === 'store_memory') settings?.refreshMemories?.();
      return result;
    },
    formatToolFallback: context => formatLocalToolFallback(t, context),
    formatProviderError: ({ code }) => {
      const key = `ai.error.${code}`;
      const message = t(key);
      return message && message !== key ? message : '';
    },
  });
  const knowledgeImporter = createKnowledgeImporter();
  const conversationSession = createConversationSession();
  const skillRegistry = createPdmSkillRegistry({ promptPack, skillsPack });
  const githubSync = createGithubKnowledgeSync({
    config: { owner: 'dutuanan96', repo: 'bom-viewer-sync', path: 'knowledge/ai', ref: 'main', ...githubSyncConfig },
    defaultPack: {
      provenance: {
        owner: 'dutuanan96',
        repo: 'bom-viewer-sync',
        path: 'knowledge/ai',
        ref: 'main',
        commitSha: 'bundled-default-' + '0'.repeat(24),
        capturedAt: promptPack.updatedAt,
        packVersion: promptPack.packVersion,
        schemaVersion: promptPack.schemaVersion,
      },
      files: {
        promptPack,
        skillsPack,
        entityAliases: companyEntityAliases,
      },
    },
    localStore,
    fetchImpl,
  });

  const activePack = githubSync.getActivePack();
  let activeCompanyMappings = activePack?.files?.entityAliases || companyEntityAliases;
  if (activePack?.files?.promptPack && activePack?.files?.skillsPack) {
    try {
      skillRegistry.reloadPack(activePack.files.promptPack, activePack.files.skillsPack);
    } catch {
      // Keep bundled default
    }
  }

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
        const conversationContext = conversationSession.latestContext();
        const currentSourceCommit = snapshot?.sourceMetadata?.commitSha || snapshot?.payload?.sourceMetadata?.commitSha || null;
        const personalMappings = personalMappingsFromStore(localStore, { currentSourceCommit });
        const entityResolver = createEntityResolver({
          snapshot,
          companyMappings: activeCompanyMappings,
          personalMappings,
          marketplaceAliases,
        });
        const entityResolution = entityResolver.resolve({ query: text });
        const materialResolution = entityResolver.resolve({ query: text, expectedTypes: ['material'] });
        const proposalTargetAuthorized = entityResolution.status === 'resolved'
          && entityResolution.requiresConfirmation === false
          && ['canonical-id', 'personal-confirmed', 'company-confirmed', 'marketplace-confirmed'].includes(entityResolution.source);
        const availableTools = proposalTargetAuthorized
          ? modelTools
          : modelTools.filter(tool => tool?.function?.name !== 'apply_mutation');
        const resolvedEntities = [];
        if (entityResolution.status === 'resolved' && entityResolution.target) {
          resolvedEntities.push(entityResolution.target);
        }
        if (materialResolution.status === 'resolved' && materialResolution.target) {
          const duplicate = resolvedEntities.some(target => (
            target.type === materialResolution.target.type
            && target.materialId === materialResolution.target.materialId
          ));
          if (!duplicate) resolvedEntities.push(materialResolution.target);
        }
        const route = routePdmIntent({ query: text, history, conversationContext, selection: snapshot.selection, availableTools, resolvedEntities });
        const turnEntityResolution = materialResolution.status === 'resolved'
          ? materialResolution
          : entityResolution;

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
          entityResolution: turnEntityResolution,
          clarificationText: t('ai.mapping.clarification'),
          conversationContext,
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
          const resultContext = result.conversationContext || {};
          const retainedContext = Object.keys(resultContext).length > 0 && !resultContext.searchQuery
            ? { ...conversationContext, searchQuery: '' }
            : conversationContext;
          conversationSession.record({
            userText: text,
            assistantText: result.text,
            context: contextForRoute(route, snapshot, {
              ...retainedContext,
              ...resultContext,
            }, text),
          });
        } catch {
          // Secret-like or otherwise unsafe conversation text is never retained.
        }
      } catch (err) {
        if (err.code === 'budgetExceeded') {
          workspace.renderMessage({ role: 'assistant', text: t('ai.error.budgetExceeded') });
        } else {
          workspace.renderMessage({ role: 'assistant', text: t('ai.message.error') });
        }
      } finally {
        if (workspace.toggleLoading) workspace.toggleLoading(false);
      }
    },
    onClear: () => {
      conversationSession.clear();
    }
  });

  settings = createSettingsView({
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
    },
    onGithubSync: async () => {
      const res = await githubSync.sync();
      if (res.pack?.files?.promptPack && res.pack?.files?.skillsPack) {
        skillRegistry.reloadPack(res.pack.files.promptPack, res.pack.files.skillsPack);
        activeCompanyMappings = res.pack.files.entityAliases || companyEntityAliases;
      }
      return res;
    },
    onGithubRollback: () => {
      const pack = githubSync.rollback();
      if (pack?.files?.promptPack && pack?.files?.skillsPack) {
        skillRegistry.reloadPack(pack.files.promptPack, pack.files.skillsPack);
        activeCompanyMappings = pack.files.entityAliases || companyEntityAliases;
      }
    },
    getGithubSyncStatus: () => githubSync.getStatus(),
  });

  return {
    githubSync,
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
