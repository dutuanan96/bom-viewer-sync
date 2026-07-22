import { detectProductShorthand } from './pdm-terminology.js';

const PRODUCT_PATTERN = /\bLGS\d{3,4}\b/gi;
const ALIAS_PATTERN = /\bULGS\d{3,4}[A-Z0-9]+\b/gi;
const MATERIAL_PATTERN = /\bmat_[a-z0-9]+\b/gi;
const REVISION_PATTERN = /\b(?:[A-Z]\.)?V?\d+(?:\.\d+)+\b|\bV\d+\b/gi;
const DIMENSION_PATTERN = /\b\d+(?:\.\d+)?\s*(?:x|\u00d7|\*)\s*\d+(?:\.\d+)?(?:\s*(?:x|\u00d7|\*)\s*\d+(?:\.\d+)?)?(?:\s*mm)?\b/iu;
const SINGLE_DIMENSION_PATTERN = /\d+(?:\.\d+)?\s*mm/iu;
const MATERIAL_DETAIL_PATTERN = /\b(material|part)\b|v\u1eadt li\u1ec7u|\u7269\u6599|\u6750\u6599/iu;
const MATERIAL_USAGE_PATTERN = /\bwhere\b.{0,40}\bused\b|\bwhere[- ]?used\b|\bused in\b|d\u00f9ng \u1edf|s\u1ea3n ph\u1ea9m n\u00e0o|\u54ea\u4e9b\u4ea7\u54c1|\u5728\u54ea\u91cc\u4f7f\u7528/iu;
const COMPARISON_FOLLOW_UP_PATTERN = /\b(?:both|shared|common|those|these two)\b|c\u1ea3 hai|d\u00f9ng chung|kh\u00e1c nhau|\u5b83\u4eec|\u4e24\u8005|\u4e24\u4e2a\u4ea7\u54c1|\u5171\u7528|\u5171\u540c|\u5de6\s*\/\s*\u53f3|\u5de6\u53f3|\u5176\u4ed6/iu;
const REVISION_CHANGE_PATTERN = /\b(?:change|changed|changes|difference|revision diff)\b|thay \u0111\u1ed5i|kh\u00e1c g\u00ec|bi\u1ebfn \u0111\u1ed5i|\u6539\u53d8|\u53d8\u5316|\u53d8\u66f4|\u6539\u4e86|\u5dee\u5f02/iu;
const RECENT_CHANGES_PATTERN = /\b(?:recent|latest)\b.{0,30}\b(?:change|changes|updates?)\b|thay \u0111\u1ed5i g\u1ea7n \u0111\u00e2y|bi\u1ebfn \u0111\u1ed5i g\u1ea7n \u0111\u00e2y|\u6700\u8fd1.{0,12}(?:\u53d8\u66f4|\u53d8\u5316|\u66f4\u65b0)|\u8fd1\u671f.{0,12}(?:\u53d8\u66f4|\u53d8\u5316|\u66f4\u65b0)/iu;
const PDM_DISCOVERY_PATTERN = /\b(?:spec|specification|material|drawer|where[- ]?used|used in|belongs)\b|quy c\u00e1ch|th\u00f4ng s\u1ed1|v\u1eadt li\u1ec7u|ng\u0103n k\u00e9o|d\u00f9ng cho|\u89c4\u683c|\u7269\u6599|\u5e03\u62bd|\u62bd\u5c49|\u7528\u4e8e|\u5c5e\u4e8e/iu;
const PRODUCT_SCOPED_LOOKUP_PATTERN = /\b(?:what|which|find|show|list|use|uses|using|contain|contains|has|have)\b|d\u00f9ng|s\u1eed d\u1ee5ng|lo\u1ea1i n\u00e0o|g\u00ec|t\u00ecm|xem|\u7528\u4ec0\u4e48|\u7528\u54ea|\u6709\u4ec0\u4e48|\u6709\u54ea\u4e9b|\u54ea\u4e2a|\u54ea\u4e9b|\u67e5\u770b|\u67e5\u8be2|\u627e/iu;
const REVISION_STATUS_PATTERN = /phi\u00ean b\u1ea3n|tr\u1ea1ng th\u00e1i|b\u1ea3n nh\u00e1p|hi\u1ec7n h\u00e0nh|\u7248\u672c|\u72b6\u6001|\u8349\u7a3f|\u53d1\u5e03|\u73b0\u884c|\u4fee\u8ba2/iu;
const REVISION_COMPARISON_REFERENCE_PATTERN = /\b(?:two|both|these|those)\s+(?:revisions?|versions?)\b|\b(?:revisions?|versions?)\b.{0,30}\b(?:difference|different)\b|hai\s+(?:phi\u00ean b\u1ea3n|b\u1ea3n).{0,30}(?:kh\u00e1c|so s\u00e1nh)|(?:kh\u00e1c nhau|so s\u00e1nh).{0,30}hai\s+(?:phi\u00ean b\u1ea3n|b\u1ea3n)|\u4e24\u4e2a(?:\u7248\u672c|\u4fee\u8ba2)|\u4e24\u7248|\u8fd9\u4e24\u4e2a(?:\u7248\u672c|\u4fee\u8ba2)|(?:\u7248\u672c|\u4fee\u8ba2).{0,12}(?:\u533a\u522b|\u5dee\u522b|\u4e0d\u540c)/iu;
const SEARCH_RESULT_FOLLOW_UP_PATTERN = /\b(?:only one|any others?|anything else|any more)\b|\b(?:is|are)\b.{0,40}\b(?:only|all)\b|ch\u1ec9.{0,40}(?:th\u00f4i|\u00e0|\?)|c\u00f2n.{0,40}(?:kh\u00e1c|n\u00e0o)|c\u00f3.{0,40}n\u00e0o kh\u00e1c|t\u1ea5t c\u1ea3|\u53ea\u6709|\u4ec5.{0,20}(?:\u5417|\uff1f|\?)|\u8fd8\u6709.{0,20}(?:\u5176\u4ed6|\u522b\u7684)|\u5168\u90e8/iu;
const HELP_PATTERN = /\b(?:guide|instructions?|capabilities|what can you do|how (?:do|can) i use|help (?:me )?(?:use|with))\b|h\u01b0\u1edbng d\u1eabn|c\u00f3 th\u1ec3 l\u00e0m g\u00ec|gi\u00fap \u0111\u01b0\u1ee3c g\u00ec|\u4f7f\u7528\u5e2e\u52a9|\u600e\u4e48\u7528|\u4f7f\u7528\u6307\u5357|\u6709\u4ec0\u4e48\u529f\u80fd/iu;
const SCHEMA_PATTERN = /\b(?:schema|data structure|fields?|entities|html data|dom data)\b|c\u1ea5u tr\u00fac d\u1eef li\u1ec7u|tr\u01b0\u1eddng d\u1eef li\u1ec7u|d\u1eef li\u1ec7u html|\u6570\u636e\u7ed3\u6784|\u5b57\u6bb5|\u5b9e\u4f53|HTML\s*\u6570\u636e/iu;
const GREETING_PATTERN = /^(hi|hello|hey|你好|xin ch[aà]o|ch[aà]o)(\s|!|\.|。|$)/iu;

const INTENT_PATTERNS = Object.freeze({
  revision: /\b(revisions?|versions?|status|draft|released|current|effective)\b|phi[eê]n b[aả]n|tr[aạ]ng th[aá]i|b[aả]n nh[aá]p|hi[eệ]n h[aà]nh|版本|状态|草稿|发布|现行|修订/iu,
  comparison: /\b(compare|comparison|difference|different|versus|vs)\b|so s[aá]nh|kh[aá]c nhau|对比|比较|区别|差异/iu,
  bom: /\b(bom|parts?|materials?|quantit(?:y|ies))\b|v[aậ]t li[eệ]u|linh ki[eệ]n|b[oộ] ph[aậ]n|s[oố] l[uư][oợ]ng|零件|物料|部件|用量|数量|多少/iu,
  marketplace: /\b(amazon|reviews?|comments?|feedback)\b|[dđ][aá]nh gi[aá]|b[iì]nh lu[aậ]n|评价|评论|亚马逊/iu,
  alias: /\b(sku|alias)\b|m[aã] h[aà]ng|商品编码|别名/iu,
  currentProduct: /\b(this|current) product\b|s[aả]n ph[aẩ]m n[aà]y|s[aả]n ph[aẩ]m hi[eệ]n t[aạ]i|当前产品|这个产品|该产品/iu,
  discovery: /\b(find|search|list)\b|t[iì]m|danh s[aá]ch|搜索|查找|列表/iu,
});

export const PDM_INTENTS = Object.freeze({
  REVISION_STATUS: 'revision_status',
  REVISION_COMPARE: 'revision_compare',
  BOM_LOOKUP: 'bom_lookup',
  BOM_COMPARE: 'bom_compare',
  MATERIAL_DETAIL: 'material_detail',
  MATERIAL_USAGE: 'material_usage',
  MARKETPLACE: 'marketplace',
  SKU_ALIAS: 'sku_alias',
  DISCOVERY: 'discovery',
  PDM_SEARCH: 'pdm_search',
  RECENT_CHANGES: 'recent_changes',
  HELP: 'help',
  SCHEMA: 'schema',
  GREETING: 'greeting',
  CATALOG_ANALYSIS: 'catalog_analysis',
  AMBIGUOUS: 'ambiguous',
});

function toolNames(availableTools) {
  return new Set((Array.isArray(availableTools) ? availableTools : [])
    .map(tool => typeof tool === 'string' ? tool : tool?.function?.name)
    .filter(Boolean));
}

function uniqueMatches(text, pattern) {
  return [...new Set((text.match(pattern) || []).map(value => value.toUpperCase()))];
}

function productMatches(text) {
  const matches = uniqueMatches(text, PRODUCT_PATTERN);
  const shorthand = String(text || '').match(/\bLGS(\d{3,4})\s*(?:and|&|\/|,|v\u00e0|v\u1edbi|\u548c|\u4e0e|\u53ca)\s*(\d{3,4})\b/iu);
  if (shorthand) {
    matches.push(`LGS${shorthand[1]}`, `LGS${shorthand[2]}`);
  }
  return [...new Set(matches)];
}

function revisionMatches(text) {
  return uniqueMatches(text, REVISION_PATTERN)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function result(intent, entities, preferredTool, confidence = 'deterministic') {
  const frozenEntities = {};
  for (const [key, value] of Object.entries(entities)) {
    frozenEntities[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }
  return Object.freeze({
    intent,
    entities: Object.freeze(frozenEntities),
    preferredTool,
    confidence,
  });
}

function ambiguous(entities) {
  return result(PDM_INTENTS.AMBIGUOUS, entities, null, 'ambiguous');
}

export function routePdmIntent({ query, history = [], conversationContext = {}, selection = {}, availableTools = [], resolvedEntities = [] }) {
  const text = String(query || '').trim();
  const tools = toolNames(availableTools);
  const explicitProductIds = productMatches(text);
  const resolved = Array.isArray(resolvedEntities) ? resolvedEntities : [];
  const resolvedProductTargets = resolved.filter(entity => (
    entity?.type === 'product' || entity?.type === 'product-variant'
  ) && /^LGS\d{3,4}$/.test(entity.productCode || ''));
  const resolvedProductIds = [...new Set(resolvedProductTargets.map(entity => entity.productCode))];
  const resolvedColors = resolvedProductTargets
    .filter(entity => entity.type === 'product-variant' && typeof entity.color === 'string' && entity.color)
    .map(entity => entity.color);
  const isRecentChanges = RECENT_CHANGES_PATTERN.test(text);
  const priorProductIds = Array.isArray(conversationContext?.productIds) ? conversationContext.productIds : [];
  const priorRevisions = Array.isArray(conversationContext?.revisions) ? conversationContext.revisions : [];
  const priorSearchQuery = typeof conversationContext?.searchQuery === 'string' ? conversationContext.searchQuery.trim() : '';
  const explicitScope = explicitProductIds.length > 0 ? explicitProductIds : resolvedProductIds;
  const priorScopeMatches = explicitScope.length === 0 || (
    explicitScope.length === priorProductIds.length && explicitScope.every((value, index) => value === priorProductIds[index])
  );
  const isRevisionComparisonFollowUp = REVISION_COMPARISON_REFERENCE_PATTERN.test(text);
  const isContextualFollowUp = !isRecentChanges && (
    COMPARISON_FOLLOW_UP_PATTERN.test(text) ||
    REVISION_CHANGE_PATTERN.test(text) || REVISION_STATUS_PATTERN.test(text) ||
    isRevisionComparisonFollowUp || revisionMatches(text).length > 0
  );
  const historicalProductIds = explicitProductIds.length === 0 && isContextualFollowUp
    ? uniqueMatches(
        (Array.isArray(history) ? history : [])
          .slice(-6)
          .map(message => typeof message?.content === 'string' ? message.content : '')
          .join(' '),
        PRODUCT_PATTERN
      ).slice(0, 2)
    : [];
  const aliases = uniqueMatches(text, ALIAS_PATTERN);
  const historyText = (Array.isArray(history) ? history : [])
    .slice(-6)
    .map(message => typeof message?.content === 'string' ? message.content : '')
    .join(' ');
  const revisions = [...new Set([
    ...revisionMatches(text),
    ...(!isRecentChanges && priorScopeMatches && (REVISION_CHANGE_PATTERN.test(text) || isRevisionComparisonFollowUp) ? priorRevisions : []),
    ...(!isRecentChanges && priorScopeMatches && (REVISION_CHANGE_PATTERN.test(text) || isRevisionComparisonFollowUp) ? revisionMatches(historyText) : []),
  ])].sort((left, right) => left.localeCompare(right, undefined, { numeric: true })).slice(0, 2);
  const explicitMaterialIds = [...new Set((text.match(MATERIAL_PATTERN) || []).map(value => value.toLowerCase()))];
  const resolvedMaterialIds = resolved
    .filter(entity => entity?.type === 'material' && typeof entity.materialId === 'string')
    .map(entity => entity.materialId);
  const materialIds = explicitMaterialIds.length > 0 ? explicitMaterialIds : [...new Set(resolvedMaterialIds)];
  const selectedProduct = String(selection?.productCode || '').toUpperCase();
  const canUseSelection = explicitProductIds.length === 0
    && /^LGS\d{3,4}$/.test(selectedProduct)
    && INTENT_PATTERNS.currentProduct.test(text);
  const productIds = canUseSelection
    ? [selectedProduct]
    : explicitProductIds.length > 0
      ? explicitProductIds
      : resolvedProductIds.length > 0
        ? resolvedProductIds
        : isContextualFollowUp && priorProductIds.length > 0 ? priorProductIds : historicalProductIds;
  const entities = materialIds.length > 0 ? { productIds, materialIds } : { productIds };
  if (revisions.length > 0) entities.revisions = revisions;
  // Attach resolved colors whenever the resolved variant's product is among the
  // chosen productIds — whether the product id came from the query or resolution.
  // (Previously colors were dropped when an explicit product id was present,
  //  silently defaulting get_bom to the first color — P1 correctness.)
  const resolvedColorProducts = resolvedProductTargets
    .filter(entity => entity.type === 'product-variant' && typeof entity.color === 'string' && entity.color)
    .map(entity => entity.productCode);
  if (resolvedColors.length > 0 && productIds.some(code => resolvedColorProducts.includes(code))) {
    entities.colors = resolvedColors;
  }

  if (MATERIAL_USAGE_PATTERN.test(text) && materialIds.length === 1 && tools.has('where_used')) {
    return result(PDM_INTENTS.MATERIAL_USAGE, entities, 'where_used');
  }

  if (MATERIAL_DETAIL_PATTERN.test(text) && materialIds.length === 1 && tools.has('get_material')) {
    return result(PDM_INTENTS.MATERIAL_DETAIL, entities, 'get_material');
  }

  if (INTENT_PATTERNS.marketplace.test(text)) {
    if (productIds.length === 1 && tools.has('get_marketplace_insights')) {
      return result(PDM_INTENTS.MARKETPLACE, entities, 'get_marketplace_insights');
    }
    if (tools.has('analyze_pdm')) {
      return result(PDM_INTENTS.CATALOG_ANALYSIS, { ...entities, searchQuery: text }, 'analyze_pdm');
    }
  }

  if (tools.has('analyze_pdm') && detectProductShorthand(text)) {
    return result(PDM_INTENTS.CATALOG_ANALYSIS, { ...entities, searchQuery: text }, 'analyze_pdm');
  }

  const EXPLICIT_CATALOG_PATTERN = /\b(?:all\s+lgs|所有\s*lgs|tất\s+cả\s+lgs|所有的?)\b/iu;
  const CATALOG_ANALYSIS_PATTERN = /\b(?:all\s+lgs|tất\s+cả\s+lgs)\b|所有(?:的)?\s*lgs|有几个柜子|有几种铁框|多种布抽|有多零件|共有几个|共用部件|客诉|所有(?:的)?五金包|五金包.{0,16}共用/iu;
  const PRODUCT_VARIANT_PATTERN = /五金包.{0,20}(?:白色|黑色|复古色|颜色).{0,12}(?:没有|缺少|缺失|不见)|(?:白色|黑色|复古色|颜色).{0,20}五金包.{0,12}(?:没有|缺少|缺失|不见)/iu;
  if (
    tools.has('analyze_pdm') &&
    (
      EXPLICIT_CATALOG_PATTERN.test(text) ||
      (PRODUCT_VARIANT_PATTERN.test(text) && productIds.length === 1) ||
      (
        (
          CATALOG_ANALYSIS_PATTERN.test(text) ||
          (/(?:铁框|支撑框|侧框|金属框)/i.test(historyText) &&
            (DIMENSION_PATTERN.test(text) || SINGLE_DIMENSION_PATTERN.test(text)))
        ) &&
        productIds.length === 0
      )
    )
  ) {
    return result(PDM_INTENTS.CATALOG_ANALYSIS, { ...entities, searchQuery: text }, 'analyze_pdm');
  }

  if (
    priorSearchQuery &&
    !isRecentChanges &&
    !INTENT_PATTERNS.revision.test(text) &&
    !REVISION_STATUS_PATTERN.test(text) &&
    !REVISION_CHANGE_PATTERN.test(text) &&
    SEARCH_RESULT_FOLLOW_UP_PATTERN.test(text) &&
    tools.has('search_pdm')
  ) {
    return result(PDM_INTENTS.PDM_SEARCH, { ...entities, searchQuery: priorSearchQuery }, 'search_pdm');
  }

  if (HELP_PATTERN.test(text) && tools.has('get_pdm_help')) {
    return result(PDM_INTENTS.HELP, entities, 'get_pdm_help');
  }

  if (SCHEMA_PATTERN.test(text) && tools.has('inspect_pdm_schema')) {
    return result(PDM_INTENTS.SCHEMA, entities, 'inspect_pdm_schema');
  }

  if (isRecentChanges && tools.has('list_recent_changes')) {
    return result(PDM_INTENTS.RECENT_CHANGES, entities, 'list_recent_changes');
  }

  if (
    productIds.length === 1 && revisions.length === 2 &&
    (REVISION_CHANGE_PATTERN.test(text) || isRevisionComparisonFollowUp) && tools.has('compare_revisions')
  ) {
    return result(PDM_INTENTS.REVISION_COMPARE, entities, 'compare_revisions');
  }

  if (INTENT_PATTERNS.comparison.test(text) || productIds.length >= 2 || (COMPARISON_FOLLOW_UP_PATTERN.test(text) && productIds.length >= 2)) {
    if (productIds.length >= 2 && tools.has('compare_boms')) {
      return result(PDM_INTENTS.BOM_COMPARE, { productIds: productIds.slice(0, 2) }, 'compare_boms');
    }
    return ambiguous(entities);
  }

  if ((INTENT_PATTERNS.revision.test(text) || REVISION_STATUS_PATTERN.test(text)) && productIds.length === 1 && tools.has('get_revision_history')) {
    return result(PDM_INTENTS.REVISION_STATUS, entities, 'get_revision_history');
  }

  if (aliases.length > 0 && INTENT_PATTERNS.alias.test(text) && tools.has('resolve_sku')) {
    return result(PDM_INTENTS.SKU_ALIAS, { productIds, aliases }, 'resolve_sku');
  }

  if (INTENT_PATTERNS.bom.test(text) && productIds.length === 1 && tools.has('get_bom')) {
    return result(PDM_INTENTS.BOM_LOOKUP, entities, 'get_bom');
  }

  if (GREETING_PATTERN.test(text) && Object.keys(entities).every(k => !entities[k] || entities[k].length === 0)) {
    return result(PDM_INTENTS.GREETING, entities, null, 'greeting');
  }

  const searchProductId = productIds.length === 1 && (
    explicitProductIds.length === 1 || resolvedProductIds.length === 1
  ) ? productIds[0] : '';
  if (searchProductId && PRODUCT_SCOPED_LOOKUP_PATTERN.test(text) && tools.has('search_pdm')) {
    return result(PDM_INTENTS.PDM_SEARCH, {
      ...entities,
      searchQuery: text,
      searchProductId,
    }, 'search_pdm');
  }

  if ((DIMENSION_PATTERN.test(text) || PDM_DISCOVERY_PATTERN.test(text)) && tools.has('search_pdm')) {
    const searchEntities = searchProductId
      ? {
          ...entities,
          searchQuery: text,
          searchProductId,
        }
      : entities;
    return result(PDM_INTENTS.PDM_SEARCH, searchEntities, 'search_pdm');
  }

  if (INTENT_PATTERNS.discovery.test(text) && tools.has('search_products')) {
    return result(PDM_INTENTS.DISCOVERY, entities, 'search_products');
  }

  return ambiguous(entities);
}
