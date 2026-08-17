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
import { createMemoryManager } from './memory-manager.js';
import { parseReviewerResponse, reviewerMessages } from './improvement-cycle.js';
import {
  buildDrawingAnalysisMessages,
  buildSingleDrawingAnalysisMessages,
  parseDrawingAnalysisResponse,
  parseSingleDrawingAnalysisResponse,
  runDrawingCommonalityCheck,
  runSingleDrawingAnalysis,
} from './engineering-drawing-commonality.js';
import promptPack from '../../../knowledge/ai/prompt-pack.json' with { type: 'json' };
import skillsPack from '../../../knowledge/ai/skills.json' with { type: 'json' };
import companyEntityAliases from '../../../knowledge/entity-aliases.json' with { type: 'json' };
import marketplaceAliases from '../../../knowledge/marketplace-aliases.json' with { type: 'json' };

export const AI_PROMPT_PACK_VERSION = promptPack.packVersion;

function workflowConfirmationText(t, workflowState) {
  const tasks = (workflowState?.tasks || []).filter(item => (
    item?.type === 'consolidate_materials' && item?.pendingAction === 'confirmation'
  ));
  if (tasks.length === 0) return '';
  const hasStructuredSummary = tasks.every(task => (
    Array.isArray(task.fields?.sourceMaterialCodes) && task.fields.sourceMaterialCodes.length > 0
  ));
  if (hasStructuredSummary) {
    const materialCount = new Set(tasks.flatMap(task => task.fields.sourceMaterialCodes)).size;
    const normalizationFields = [...new Set(tasks.flatMap(task => task.fields?.normalizationFields || []))];
    const lines = [String(t('ai.workflow.consolidate.summaryHeader'))
      .replace('{groups}', String(tasks.length))
      .replace('{materials}', String(materialCount))];
    for (const task of tasks) {
      lines.push(String(t('ai.workflow.consolidate.summaryItem'))
        .replace('{spec}', String(task.fields?.sourceSpec || '-'))
        .replace('{codes}', task.fields.sourceMaterialCodes.join(', '))
        .replace('{code}', String(task.fields?.newMaterialCode || '')));
    }
    if (normalizationFields.length > 0) {
      const normalizationCount = (workflowState?.tasks || []).filter(task => task?.type === 'update_material').length;
      lines.push(String(t('ai.workflow.consolidate.normalizationSummary'))
        .replace('{count}', String(normalizationCount))
        .replace('{fields}', normalizationFields.join(', ')));
    }
    const draftCount = (workflowState?.tasks || []).filter(task => task?.type === 'create_product_revision').length;
    if (draftCount > 0) {
      lines.push(String(t('ai.workflow.consolidate.draftSummary')).replace('{count}', String(draftCount)));
    }
    return lines.join('\n');
  }
  return tasks.map(task => {
    const sourceCount = Array.isArray(task.fields?.sourceMaterialIds) ? task.fields.sourceMaterialIds.length : 0;
    const code = String(task.fields?.newMaterialCode || '').trim();
    if (!code || sourceCount < 2) return '';
    return String(t('ai.workflow.consolidate.confirmation'))
      .replace('{code}', code)
      .replace('{count}', String(sourceCount));
  }).filter(Boolean).join('\n\n');
}

function agentDecisionForUi(t, decision) {
  if (decision?.type === 'duplicate_consolidation_details') {
    const materialName = String(decision.materialName || '').trim() || t('ai.agentDecision.duplicate.allMaterials');
    return {
      prompt: t('ai.agentDecision.duplicate.detailsPrompt')
        .replace('{materialName}', materialName)
        .replace('{exact}', String(decision.exactGroups || 0))
        .replace('{suspected}', String(decision.suspectedGroups || 0)),
      choices: [
        {
          id: 'use_dimension_code_rule',
          primary: true,
          label: t('ai.agentDecision.duplicate.useDimensionCodeRule'),
          query: String(t('ai.agentDecision.duplicate.useDimensionCodeRuleQuery')).replace('{materialName}', materialName),
        },
        { id: 'custom', kind: 'custom', label: t('ai.agentDecision.custom'), placeholder: t('ai.agentDecision.duplicate.codeRulePlaceholder') },
        { id: 'cancel', label: t('ai.agentDecision.workflow.cancel'), query: t('ai.agentDecision.workflow.cancelQuery') },
      ],
    };
  }
  if (decision?.type === 'workflow_confirmation') {
    return {
      prompt: t('ai.agentDecision.workflow.confirmPrompt').replace('{count}', String(decision.pendingCount || 1)),
      choices: [
        { id: 'confirm', primary: true, label: t('ai.agentDecision.workflow.confirm'), query: t('ai.agentDecision.workflow.confirmQuery') },
        { id: 'custom', kind: 'custom', label: t('ai.agentDecision.custom'), placeholder: t('ai.agentDecision.customPlaceholder') },
        { id: 'cancel', label: t('ai.agentDecision.workflow.cancel'), query: t('ai.agentDecision.workflow.cancelQuery') },
      ],
    };
  }
  if (decision?.type === 'workflow_clarification') {
    return {
      prompt: t('ai.agentDecision.workflow.clarificationPrompt'),
      choices: [
        { id: 'custom', kind: 'custom', primary: true, label: t('ai.agentDecision.workflow.provideDetails'), placeholder: t('ai.agentDecision.customPlaceholder') },
        { id: 'cancel', label: t('ai.agentDecision.workflow.cancel'), query: t('ai.agentDecision.workflow.cancelQuery') },
      ],
    };
  }
  return null;
}

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
    ...(fallback.workflowState ? { workflowState: fallback.workflowState } : {}),
  };
  const routeSearchQuery = ['search_pdm', 'analyze_pdm'].includes(route?.preferredTool)
    ? String(entities.searchQuery || query || '').trim()
    : '';
  const searchQuery = routeSearchQuery || String(fallback.searchQuery || '').trim();
  if (searchQuery) context.searchQuery = searchQuery.slice(0, 500);
  return Object.fromEntries(Object.entries(context).filter(([, value]) => (
    value && typeof value === 'object' ? Object.keys(value).length > 0 : value.length > 0
  )));
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
  const truncatedResultsMessage = total => tr(
    'ai.localFallback.resultsTruncated',
    'There are {total} matching records; only the first 50 are shown. Download Excel to view all results.',
  ).replace('{total}', String(total));

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

  if (toolCall.name === 'get_bom') {
    const scope = [toolResult.productCode, toolResult.color].filter(Boolean).join(' / ');
    const rows = (toolResult.rows || []).slice(0, 12);
    lines.push(`${tr('ai.localFallback.scope', 'Scope')}: ${scope}`);
    if (toolResult.colorAvailable === false) {
      lines.push(`! ${toolResult.productCode}: ${toolResult.color} — ${tr('ai.localFallback.colorNotDefined', 'color variant is not defined')}. ${tr('ai.localFallback.availableColors', 'Available colors')}: ${(toolResult.availableColors || []).join(', ') || '-'}`);
      return lines.join('\n').slice(0, 5000);
    }
    lines.push(`${tr('ai.localFallback.matches', 'Matches')}: ${toolResult.matchedRows ?? toolResult.totalRows ?? 0}`);
    if (rows.length > 1) {
      lines.push('| 序号 | 物料编码 | 名称 | 规格 | 数量 | 备注 |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      lines.push(...rows.map((row, index) => (
        `| ${index + 1} | ${row.matCode || row.materialId || '-'} | ${row.nameZh || row.nameVi || '-'} | ${row.spec || '-'} | ${row.qty || '-'} | ${row.remark || '-'} |`
      )));
    } else if (rows[0]) {
      const row = rows[0];
      lines.push(`- ${row.matCode || row.materialId || ''} — ${row.nameZh || row.nameVi || ''} — ${row.spec || ''} x${row.qty || ''}${row.remark ? ` — ${row.remark}` : ''}`.trim());
    }
    return lines.join('\n').slice(0, 5000);
  }

  if (toolCall.name === 'get_structure_mapping') {
    lines.push(`${tr('ai.localFallback.scope', 'Scope')}: ${toolResult.productCode || ''}`);
    if (!toolResult.found) {
      lines.push(tr('ai.localFallback.noStructureMapping', 'No owner-confirmed structural mapping was found.'));
      return lines.join('\n').slice(0, 5000);
    }
    lines.push(...(toolResult.mappings || []).slice(0, 8).map(mapping => (
      `- ${mapping.id}: ${mapping.explanationZh || ''} [${(mapping.target?.materialCodes || []).join(', ')}]${mapping.packagingRule?.summaryZh ? ` — ${mapping.packagingRule.summaryZh}` : ''}${mapping.packagingRuleStatus === 'pending' ? ` — ${tr('ai.localFallback.packagingRulePending', 'Packaging rule pending confirmation')}` : ''}`
    )));
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

  if (toolCall.name === 'find_duplicate_materials') {
    lines.push(`${tr('ai.localFallback.exactDuplicates', 'Exact duplicate groups')}: ${toolResult.totalGroups || 0}`);
    for (const group of (toolResult.duplicateGroups || []).slice(0, 12)) {
      const name = group.material?.name?.zh || group.material?.name?.vi || '';
      const spec = group.material?.spec?.zh || group.material?.spec?.vi || '';
      const codes = (group.sourceMaterialCodes || []).join(', ');
      lines.push(`- ${name} ${spec}: ${codes} (${group.affectedBomEntryCount || 0} BOM)`);
    }
    const suspectedGroups = toolResult.suspectedDuplicateGroups || [];
    if (suspectedGroups.length > 0) {
      lines.push(`${tr('ai.localFallback.suspectedDuplicates', 'Suspected duplicates requiring Admin confirmation')}: ${toolResult.totalSuspectedGroups || suspectedGroups.length}`);
      for (const group of suspectedGroups.slice(0, 12)) {
        const name = group.material?.name?.zh || group.material?.name?.vi || '';
        const spec = group.material?.spec?.zh || group.material?.spec?.vi || '';
        const codes = (group.sourceMaterialCodes || []).join(', ');
        const fields = (group.differingFields || []).join(', ');
        lines.push(`- ${name} ${spec}: ${codes}${fields ? ` (${fields})` : ''}`);
      }
    }
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
    const results = toolResult.results || [];
    if (toolResult.countMode === 'specification_summary') {
      const headers = [
        tr('ai.localFallback.tableIndex', 'No.'),
        tr('ai.localFallback.tableSpec', 'Specification'),
        tr('ai.localFallback.materialTypeCount', 'Material Types'),
        tr('ai.localFallback.usedProductsWithRevision', 'Used In (Effective Revision)'),
      ];
      lines.push(`| ${headers.join(' | ')} |`);
      lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
      lines.push(...results.map((result, index) => (
        `| ${[index + 1, result.spec || '-', result.materialCount ?? 0, (result.usedInProductRevisions || []).join(', ') || '-'].join(' | ')} |`
      )));
      if (toolResult.truncated) lines.push(`| ${headers.map(() => '...').join(' | ')} |`);
      if (toolResult.representativeColorPolicy) {
        lines.splice(2, 0, tr('ai.localFallback.representativeColorPolicy', 'No color was specified. One representative color is selected for each product in the order BH, KD, WH, then the first available color.'));
      }
      return lines.join('\n');
    }
    const materialResults = results.filter(result => result.materialCode);
    if (materialResults.length > 1 && materialResults.length === results.length) {
      const hasRepresentativeColor = materialResults.some(result => result.representativeColors?.length);
      const hasProductRevisionLabels = materialResults.some(result => result.usedInProductRevisions?.length);
      const hasEffectiveRevision = !hasProductRevisionLabels;
      const headers = [
        tr('ai.localFallback.tableIndex', 'No.'),
        tr('ai.localFallback.tableMaterialCode', 'Material Code'),
        tr('ai.localFallback.tableName', 'Name'),
        tr('ai.localFallback.tableSpec', 'Specification'),
        hasProductRevisionLabels
          ? tr('ai.localFallback.usedProductsWithRevision', 'Used In (Effective Revision)')
          : tr('ai.localFallback.usedProducts', 'Used In'),
      ];
      if (hasRepresentativeColor) headers.push(tr('ai.localFallback.representativeColor', 'Representative Color'));
      if (hasEffectiveRevision) headers.push(tr('ai.localFallback.effectiveRevision', 'Effective Revision'));
      lines.push(`| ${headers.join(' | ')} |`);
      lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
      lines.push(...materialResults.map((result, index) => (
        `| ${[
          index + 1,
          result.materialCode,
          result.nameZh || '-',
          result.spec || '-',
          (hasProductRevisionLabels ? result.usedInProductRevisions : result.usedInProducts || []).join(', ') || '-',
          ...(hasRepresentativeColor ? [(result.representativeColors || []).join(', ') || '-'] : []),
          ...(hasEffectiveRevision ? [(result.effectiveRevisions || []).join(', ') || '-'] : []),
        ].join(' | ')} |`
      )));
      if (toolResult.truncated) lines.push(`| ${headers.map(() => '...').join(' | ')} |`);
      if (toolResult.representativeColorPolicy) {
        lines.splice(2, 0, tr('ai.localFallback.representativeColorPolicy', 'No color was specified. One representative color is selected for each product in the order BH, KD, WH, then the first available color.'));
      }
      if (toolResult.truncated) lines.push(truncatedResultsMessage(toolResult.totalCount ?? toolResult.totalMatches ?? results.length));
      for (const warning of toolResult.colorAvailabilityWarnings || []) {
        lines.push(`! ${warning.productCode}: ${warning.requestedColor} — ${tr('ai.localFallback.colorNotDefined', 'color variant is not defined')}. ${tr('ai.localFallback.availableColors', 'Available colors')}: ${(warning.availableColors || []).join(', ') || '-'}`);
      }
      return lines.join('\n');
    }
    lines.push(...results.map(r => {
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

  if (toolCall.name === 'check_drawing_commonality') {
    lines.push(`${tr('ai.drawing.status', 'Drawing commonality status')}: ${toolResult.status}`);
    for (const pair of (toolResult.pairs || []).slice(0, 4)) {
      lines.push(`${pair.orientation}: ${pair.left?.material_code || ''} <=> ${pair.right?.material_code || ''}`);
      lines.push(`${tr('ai.drawing.pairStatus', 'Pair status')}: ${pair.status}`);
      lines.push(`${tr('ai.drawing.leftDocument', 'Left drawing')}: ${pair.left_asset?.name || tr('ai.drawing.missingDocument', 'missing')}`);
      lines.push(`${tr('ai.drawing.rightDocument', 'Right drawing')}: ${pair.right_asset?.name || tr('ai.drawing.missingDocument', 'missing')}`);
      for (const comparison of (pair.analysis?.comparisons || []).slice(0, 12)) {
        lines.push(`- ${comparison.check}: ${comparison.status} | ${comparison.left_value || '?'} <=> ${comparison.right_value || '?'}`);
      }
    }
    lines.push(tr('ai.drawing.engineeringApproval', 'Engineering confirmation is required before material or BOM consolidation.'));
    return lines.join('\n').slice(0, 5000);
  }

  if (toolCall.name === 'analyze_engineering_drawing') {
    lines.push(`${tr('ai.drawing.analysisStatus', 'Drawing analysis status')}: ${toolResult.status}`);
    lines.push(`${tr('ai.drawing.materialCode', 'Material code')}: ${toolResult.document?.material_code || '?'}`);
    lines.push(`${tr('ai.drawing.document', 'Drawing')}: ${toolResult.document?.file_name || tr('ai.drawing.missingDocument', 'missing')}`);
    const dimensions = toolResult.overall_dimensions || {};
    const dimensionText = ['length_mm', 'width_mm', 'height_mm']
      .map(key => dimensions[key]?.value_mm)
      .map(value => value === null || value === undefined ? '?' : value)
      .join(' x ');
    lines.push(`${tr('ai.drawing.dimensions', 'Overall dimensions')}: ${dimensionText} mm`);
    for (const feature of (toolResult.features || []).slice(0, 12)) {
      lines.push(`- ${feature.type}: ${feature.quantity ?? '?'} | Ø ${feature.diameter_mm ?? '?'} mm | confidence ${feature.confidence}`);
    }
    for (const warning of (toolResult.warnings || []).slice(0, 8)) lines.push(`! ${warning}`);
    lines.push(tr('ai.drawing.singleApproval', 'Engineering confirmation is required before production decisions.'));
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
    parameters: { type: 'object', properties: { productId: PRODUCT_ID_SCHEMA, color: NON_EMPTY_STRING_SCHEMA, query: NON_EMPTY_STRING_SCHEMA }, required: ['productId'], additionalProperties: false }
  },
  get_structure_mapping: {
    description: 'Get confirmed Excel-to-PDM mapping. Read-only; packaging material mappings may identify a pending physical packaging or attachment rule.',
    parameters: { type: 'object', properties: { productId: PRODUCT_ID_SCHEMA, query: NON_EMPTY_STRING_SCHEMA }, required: ['productId'], additionalProperties: false }
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
    description: [
      'Prepare a reviewed local PDM proposal using only allowlisted Admin actions.',
      'Never write code or upload to GitHub. Submit 1-50 ordered operations for deterministic validation and human selection.',
      'CRITICAL: If any required parameters (like materialId or color) are missing from the user\'s request, DO NOT guess them. You must ask the user for clarification before calling this tool.',
      'Use these exact button-equivalent patterns:',
      'create_product targetId=product code payload={name:{zh,vi},color:{zh,vi},size,sku};',
      'update_product targetId=product code payload={color,patch:{optional name:{zh,vi},size,sku}};',
      'create_product_revision targetId=product code payload={revision,changeReason};',
      'release_product_revision or withdraw_product_revision targetId=product code payload={reason};',
      'create_material targetId=new material ID payload={material:{code,name:{zh,vi}, optional spec/material/color/attr localized pairs, unit, drawings, models3d}};',
      'consolidate_materials targetId=new material ID payload={material:{code,name:{zh,vi},spec:{zh,vi},material:{zh,vi},color:{zh,vi},attr:{zh,vi}, optional unit/drawings/models3d},sourceMaterialIds:[existing internal material IDs]}; this atomically creates one canonical material and replaces every BOM and material-structure reference to the exact duplicate sources; it never deletes the old records.',
      'update_material targetId=material ID payload={patch:{same editable material fields}};',
      'update_material_field targetId=material ID payload={field,value};',
      'delete_material targetId=unused material ID payload={};',
      'add_bom_item targetId=product code payload={color,materialId,comp_code,quantity};',
      'update_bom_item targetId=BOM entry ID payload={comp_code,quantity};',
      'update_bom_quantity targetId=product code payload={color,childId,quantity};',
      'replace_bom_item targetId=BOM entry ID payload={materialId};',
      'remove_bom_item targetId=BOM entry ID payload={};',
      'remove_orphan_bom_entry targetId=orphan BOM entry ID payload={};',
      'add_material_child targetId=parent material ID payload={materialId,quantity};',
      'update_material_child_quantity targetId=parent material ID payload={childId,originalQuantity,quantity};',
      'remove_material_child targetId=child BOM entry ID payload={};',
      'delete_material_structure targetId=parent material ID payload={}.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', maxLength: 1000 },
        operations: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              operationType: {
                type: 'string',
                enum: [
                  'create_product',
                  'update_product',
                  'create_product_revision',
                  'release_product_revision',
                  'withdraw_product_revision',
                  'create_material',
                  'consolidate_materials',
                  'update_material',
                  'update_material_field',
                  'delete_material',
                  'add_bom_item',
                  'update_bom_item',
                  'update_bom_quantity',
                  'replace_bom_item',
                  'remove_bom_item',
                  'remove_orphan_bom_entry',
                  'add_material_child',
                  'update_material_child_quantity',
                  'remove_material_child',
                  'delete_material_structure',
                ],
              },
              targetId: { type: 'string', minLength: 1, maxLength: 100 },
              payload: { type: 'object' },
            },
            required: ['operationType', 'targetId', 'payload'],
            additionalProperties: false,
          },
        },
      },
      required: ['operations'],
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
  find_duplicate_materials: {
    description: 'Find groups of material records whose name, specification, material, color, and attribute are exactly identical while their material codes differ. Returns bounded source IDs, codes, and affected BOM counts. Read-only.',
    parameters: {
      type: 'object',
      properties: { name: NON_EMPTY_STRING_SCHEMA },
      additionalProperties: false,
    },
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
  },
  analyze_engineering_drawing: {
    description: 'Resolve and inspect one exact PDM PDF engineering drawing. Returns evidence-bound title block, dimensions, features, tolerances, notes, warnings, and readability status without changing PDM data.',
    parameters: {
      type: 'object',
      properties: { query: NON_EMPTY_STRING_SCHEMA, productId: PRODUCT_ID_SCHEMA },
      required: ['query', 'productId'],
      additionalProperties: false,
    },
  },
  check_drawing_commonality: {
    description: 'Inspect exact PDM PDF drawings and assess whether matched front/front or rear/rear parts are candidates for common use. Read-only and engineering approval remains required.',
    parameters: {
      type: 'object',
      properties: { query: NON_EMPTY_STRING_SCHEMA },
      required: ['query'],
      additionalProperties: false,
    },
  }
};

export function buildAvailableTools(modelInfo) {
  return Array.from(ALLOWED_TOOLS)
    .filter(name => name !== 'apply_mutation' || ['A', 'B'].includes(modelInfo?.grade))
    .map(name => ({
      type: 'function',
      function: { name, ...TOOL_SCHEMAS[name] }
    }));
}

export function createAiAssistantFeature({
  runTool,
  getSnapshot,
  getImprovementEvidence,
  mode = 'viewer',
  localStore,
  fetchImpl = globalThis.fetch,
  t = (k) => k,
  openPdmPrompt,
  openPdmConfirm,
  githubSyncConfig = {},
  onApplyFallbackProposal,
}) {
  let settings = null;
  const gateway = createOpenRouterGateway({ fetchImpl });
  const trustPolicy = createTrustPolicy();
  const runtime = createAgentController({
    gateway,
    trustPolicy,
    runTool: async (call, snapshot) => {
      if (call?.name === 'analyze_engineering_drawing') {
        const drawingModel = modelRegistry.find(model => model.id === 'xiaomi/mimo-v2.5')?.id || '';
        return runSingleDrawingAnalysis({
          query: call.arguments.query,
          productId: call.arguments.productId,
          snapshot,
          model: drawingModel,
          analyzeDocument: drawingModel
            ? async (part, asset) => {
                const response = await gateway.chat({
                  model: drawingModel,
                  messages: buildSingleDrawingAnalysisMessages(part, asset),
                  tools: [],
                  maxTokens: 3200,
                  pdfProcessing: { engine: 'native' },
                });
                return parseSingleDrawingAnalysisResponse(response?.choices?.[0]?.message?.content);
              }
            : null,
        });
      }
      if (call?.name === 'check_drawing_commonality') {
        const drawingModel = modelRegistry.find(model => model.id === 'xiaomi/mimo-v2.5')?.id || '';
        return runDrawingCommonalityCheck({
          query: call.arguments.query,
          snapshot,
          model: drawingModel,
          analyzePair: drawingModel
            ? async (pair, leftAsset, rightAsset) => {
                const response = await gateway.chat({
                  model: drawingModel,
                  messages: buildDrawingAnalysisMessages(pair, leftAsset, rightAsset),
                  tools: [],
                  maxTokens: 2600,
                  pdfProcessing: { engine: 'native' },
                });
                return parseDrawingAnalysisResponse(response?.choices?.[0]?.message?.content);
              }
            : null,
        });
      }
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
    formatWorkflowError: ({ message }) => String(t('ai.error.proposalValidation')).replace('{message}', String(message || '')),
    formatWorkflowRecovery: ({ hasEvidence }) => t(hasEvidence
      ? 'ai.error.proposalRecoveryWithEvidence'
      : 'ai.error.proposalRecoveryNeedsScope'),
  });
  const knowledgeImporter = createKnowledgeImporter();
  const conversationSession = createConversationSession();
  const skillRegistry = createPdmSkillRegistry({ promptPack, skillsPack });
  const memoryManager = createMemoryManager({ localStore });
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

  let currentModel = 'inclusionai/ling-3.0-flash:free';
  let modelRegistry = [];
  let marketplaceWebEnabled = false;
  let pendingTeachingQuery = '';

  const refreshModels = () => {
    modelRegistry = gateway.listModels();
    settings.updateModels(modelRegistry);
  };

  const getCurrentModelInfo = () => modelRegistry.find(model => model.id === currentModel);

  let _currentAbortController = null;

  const workspace = createWorkspaceView({
    t,
    openPdmPrompt,
    openPdmConfirm,
    onStop: () => {
      _currentAbortController?.abort();
    },
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
        const proposalRequested = mode === 'admin' && (
          /\b(?:add|create|update|edit|delete|remove|replace|change|modify)\b|thêm|tạo|sửa|chỉnh|xóa|thay|đổi|cập nhật|biến|添加|创建|修改|编辑|删除|移除|替换|更新|改|变/iu.test(text)
        );
        const lifecycleProposalRequested = mode === 'admin' && (
          /\b(?:release|publish|withdraw|link|attach)\b|ph\u00e1t h\u00e0nh|r\u00fat ph\u00e1t h\u00e0nh|\u53d1\u5e03|\u64a4\u56de/iu.test(text)
        );
        const availableTools = proposalRequested || lifecycleProposalRequested
          ? modelTools
          : modelTools.filter(tool => tool?.function?.name !== 'apply_mutation');
        const resolvedEntities = [];
        const addResolvedTarget = (target) => {
          if (!target) return;
          const duplicate = resolvedEntities.some(existing => (
            existing.type === target.type
            && (existing.productCode === target.productCode || existing.materialId === target.materialId)
          ));
          if (!duplicate) resolvedEntities.push(target);
        };

        const processResolution = (res) => {
          if (res.status === 'resolved' && res.target) {
            addResolvedTarget(res.target);
          } else if (res.status === 'ambiguous' && Array.isArray(res.candidates)) {
            res.candidates.forEach(candidate => {
              if (candidate.confidence >= 0.90) addResolvedTarget(candidate.target);
            });
          }
        };

        processResolution(entityResolution);
        processResolution(materialResolution);
        const learnedStrategies = localStore?.listConfirmed?.({ currentSourceCommit })
          .filter(memory => ['procedure', 'user-teaching'].includes(memory.scope?.memoryType)) || [];
        const route = routePdmIntent({
          query: text,
          history,
          conversationContext,
          selection: snapshot.selection,
          availableTools,
          resolvedEntities,
          learnedStrategies,
        });
        if (pendingTeachingQuery && route.confidence === 'ambiguous') {
          const teaching = memoryManager.storeUserTeaching(pendingTeachingQuery, text, snapshot);
          localStore?.createImprovementCandidate?.({
            issueType: 'user-teaching',
            userQuestion: pendingTeachingQuery,
            userCorrection: text,
            route,
            context: contextForRoute(route, snapshot),
            evidence: { sourceCommit: currentSourceCommit },
          });
          pendingTeachingQuery = '';
          settings.refreshMemories();
          settings.refreshImprovements?.();
          const reply = teaching.status === 'confirmed'
            ? t('ai.learning.teachingSaved')
            : t('ai.message.error');
          workspace.renderMessage({ role: 'assistant', text: reply });
          try { conversationSession.record({ userText: text, assistantText: reply }); } catch {}
          if (workspace.toggleLoading) workspace.toggleLoading(false);
          return;
        }
        if (pendingTeachingQuery && route.confidence !== 'ambiguous') pendingTeachingQuery = '';
        const hasDeterministicProductScope = ['deterministic', 'learned'].includes(route.confidence)
          && Array.isArray(route.entities?.productIds)
          && route.entities.productIds.length > 0;
        const isShortQuery = text.split(/\s+/).filter(Boolean).length <= 4;
        const hasExactResolutionConflict = isShortQuery
          && entityResolution.requiresConfirmation === true
          && entityResolution.confidence === 1;
        const turnEntityResolution = (entityResolution?.requiresConfirmation === true)
          ? entityResolution
          : hasExactResolutionConflict
          ? entityResolution
          : hasDeterministicProductScope
          ? null
          : materialResolution.status === 'resolved'
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
        _currentAbortController = new AbortController();

        let streamingMessageHandle = null;

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
          signal: _currentAbortController.signal,
          onProgress: (event) => {
            if (!streamingMessageHandle) {
              streamingMessageHandle = workspace.startStreamingMessage();
            }
            if (event.type === 'content' && event.delta) {
              streamingMessageHandle.updateText(event.delta);
            } else if (event.type === 'status') {
              streamingMessageHandle.updateStatus?.(t('ai.workspace.loading'));
            }
          }
        });
        _currentAbortController = null;
        if (result.needsTeaching) {
          pendingTeachingQuery = text;
          result.text = t('ai.learning.requestTeaching');
        }
        try {
          const successfulTools = result.learning?.successfulTools || [];
          const learnedTool = route.preferredTool || (
            route.confidence === 'ambiguous' && successfulTools.length === 1
              ? successfulTools[0]
              : ''
          );
          memoryManager.learnSuccessfulStrategy({
            query: text,
            intent: route.confidence === 'ambiguous' ? 'learned_read' : route.intent,
            preferredTool: learnedTool,
            successfulTools,
          });
        } catch {
          // Learning must never block a grounded answer.
        }

        const finalMessageProps = {
          role: 'assistant',
          text: workflowConfirmationText(t, result.conversationContext?.workflowState) || result.text,
          citations: result.citations,
          evidence: result.evidenceItems,
          proposal: result.proposal,
          diff: result.diff,
          proposalReview: result.proposalReview,
          catalogExport: result.catalogExport,
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
            localStore.createImprovementCandidate?.({
              issueType: 'entity-alias',
              userQuestion: result.entityResolution.phrase,
              userCorrection: canonicalTarget,
              route,
              context: contextForRoute(route, snapshot),
              evidence: { sourceCommit: currentSourceCommit },
            });
            settings.refreshMemories();
            settings.refreshImprovements?.();
            workspace.renderMessage({ role: 'assistant', text: t('ai.mapping.candidateCreated') });
          },
          snapshot,
          onApprove: typeof onApplyFallbackProposal === 'function' ? (selectedProposal, options) => {
            onApplyFallbackProposal(selectedProposal, snapshot, options);
          } : undefined,
        };

        if (result.suppressFinalMessage) {
          streamingMessageHandle?.remove?.();
        } else if (streamingMessageHandle) {
          streamingMessageHandle.finish(finalMessageProps);
        } else {
          workspace.renderMessage(finalMessageProps);
        }

        settings.updateTrace(result.trace);
        if (result.fallback) {
          localStore?.createImprovementCandidate?.({
            issueType: 'provider-failure',
            userQuestion: text,
            assistantAnswer: result.text,
            route,
            context: contextForRoute(route, snapshot, result.conversationContext, text),
            evidence: {
              sourceCommit: currentSourceCommit,
              evidenceIds: (result.evidenceItems || []).map(item => item?.id || item?.sourceRef).filter(Boolean),
            },
          });
          settings.refreshImprovements?.();
        }
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
        } else if (err.name === 'AbortError' || /abort|aborted/i.test(err.message || '')) {
          workspace.renderMessage({ role: 'assistant', text: t('ai.message.error') });
        } else if (/timeout/i.test(err.message || '')) {
          workspace.renderMessage({ role: 'assistant', text: t('ai.error.timeout') });
        } else {
          workspace.renderMessage({ role: 'assistant', text: t('ai.message.error') });
        }
      } finally {
        if (workspace.toggleLoading) workspace.toggleLoading(false);
      }
    },
    onClear: () => {
      pendingTeachingQuery = '';
      conversationSession.clear();
    }
  });

  settings = createSettingsView({
    mode,
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
      pendingTeachingQuery = '';
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
    onImprovementImport: async (file) => localStore.importImprovementBundle(await file.text()),
    onImprovementExport: () => localStore.exportImprovementBundle(),
    onImprovementReview: async (id) => {
      if (mode !== 'admin') throw new Error('Admin mode is required');
      const candidate = localStore.listImprovementCandidates().find(item => item.id === id);
      if (!candidate) throw new Error('Improvement candidate not found');
      const reviewerModel = modelRegistry
        .filter(model => model.id !== currentModel && (model.grade === 'A' || model.grade === 'B'))
        .sort((left, right) => (
          Number(right.id === 'xiaomi/mimo-v2.5') - Number(left.id === 'xiaomi/mimo-v2.5')
        ))[0]?.id;
      if (!reviewerModel) throw new Error('A separate compatible reviewer model is required');
      const evidence = typeof getImprovementEvidence === 'function'
        ? await getImprovementEvidence(candidate, getSnapshot())
        : {};
      const response = await gateway.chat({
        model: reviewerModel,
        messages: reviewerMessages(candidate, evidence),
        tools: [],
        maxTokens: 800,
      });
      const review = parseReviewerResponse(response?.choices?.[0]?.message?.content, {
        reviewerModel,
        reviewedAt: new Date().toISOString(),
      });
      return localStore.setImprovementReview(id, review);
    },
    onImprovementApprove: (id) => {
      if (mode !== 'admin') throw new Error('Admin mode is required');
      return localStore.approveImprovement(id);
    },
    onImprovementReject: (id) => {
      if (mode !== 'admin') throw new Error('Admin mode is required');
      return localStore.rejectImprovement(id);
    },
    onApprovedKnowledgeExport: () => {
      if (mode !== 'admin') throw new Error('Admin mode is required');
      const snapshot = getSnapshot();
      const sourceCommit = snapshot?.sourceMetadata?.commitSha || snapshot?.payload?.sourceMetadata?.commitSha || '';
      return localStore.exportApprovedKnowledge({ sourceCommit });
    },
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
      pendingTeachingQuery = '';
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
      pendingTeachingQuery = '';
      conversationSession.clear();
      if (typeof workspace.destroy === 'function') workspace.destroy();
      settings.element.remove();
    }
  };
}
