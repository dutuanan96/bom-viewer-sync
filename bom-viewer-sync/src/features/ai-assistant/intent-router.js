import { detectProductShorthand } from './pdm-terminology.js';

const PRODUCT_PATTERN = /\bLGS\d{3,4}\b/gi;
const ALIAS_PATTERN = /\bULGS\d{3,4}[A-Z0-9]+\b/gi;
const MATERIAL_PATTERN = /\bmat_[a-z0-9]+\b/gi;
const REVISION_PATTERN = /\b(?:[A-Z]\.)?V?\d+(?:\.\d+)+\b|\bV\d+\b/gi;
const DIMENSION_PATTERN = /\b\d+(?:\.\d+)?\s*(?:x|\u00d7|\*)\s*\d+(?:\.\d+)?(?:\s*(?:x|\u00d7|\*)\s*\d+(?:\.\d+)?)?(?:\s*mm)?\b/iu;
const SINGLE_DIMENSION_PATTERN = /\d+(?:\.\d+)?\s*mm/iu;
const PRODUCT_SINGLE_DIMENSION_PATTERN = /(?:宽度?|高度?|深度?|长度?)\s*\d+(?:\.\d+)?(?:\s*mm)?|\d+(?:\.\d+)?\s*(?:mm\s*)?(?:宽|高|深|长)/iu;
const PRODUCT_DETAIL_PATTERN = /颜色|色号|尺寸|宽度?|高度?|深度?|产品编号|产品编码|\bSKU\b|màu|kích thước|\b(?:color|size|width|height|depth)\b/iu;
const PRODUCT_FILTER_PATTERN = /(?:一|二|两|三|四|五|\d+)\s*列|(?:一|二|三|四|五|六|七|八|九|十|\d+)\s*(?:个)?抽(?:屉)?|带灯|带电|有灯|有电|\b(?:columns?|drawers?|with light|with power)\b/iu;
const PRODUCT_BOM_COMPONENT_PATTERN = /\b(?:M|ST)\d+(?:\.\d+)?(?:\s*(?:x|×|\*)\s*\d+(?:\.\d+)?)?|\b(?:ốc|vít)\b|tay nắm|tay kéo|chân đế|túi (?:ngũ kim|phụ kiện)|螺丝|螺钉|螺母|把手|底脚|五金包|配件包/iu;
const PRODUCT_VARIANT_GAP_PATTERN = /五金包.{0,20}(?:白色|黑色|复古色|颜色).{0,12}(?:没有|缺少|缺失|不见)|(?:白色|黑色|复古色|颜色).{0,20}五金包.{0,12}(?:没有|缺少|缺失|不见)/iu;
const MATERIAL_DETAIL_PATTERN = /\b(material|part)\b|v\u1eadt li\u1ec7u|\u7269\u6599|\u6750\u6599/iu;
const MATERIAL_USAGE_PATTERN = /\bwhere\b.{0,40}\bused\b|\bwhere[- ]?used\b|\bused in\b|d\u00f9ng \u1edf|s\u1ea3n ph\u1ea9m n\u00e0o|\u54ea\u4e9b\u4ea7\u54c1|\u5728\u54ea\u91cc\u4f7f\u7528/iu;
const COMPARISON_FOLLOW_UP_PATTERN = /\b(?:both|shared|common|those|these two)\b|c\u1ea3 hai|d\u00f9ng chung|kh\u00e1c nhau|\u5b83\u4eec|\u4e24\u8005|\u4e24\u4e2a\u4ea7\u54c1|\u5171\u7528|\u5171\u540c|\u5de6\s*\/\s*\u53f3|\u5de6\u53f3|\u5176\u4ed6/iu;
const REFERENTIAL_FOLLOW_UP_PATTERN = /\b(?:it|that one|this one|the first|the other|those two)\b|n\u00f3|c\u00e1i \u0111\u00f3|c\u00e1i n\u00e0y|c\u00e1i \u0111\u1ea7u|c\u00e1i c\u00f2n l\u1ea1i|\u5b83|\u8fd9\u4e2a|\u90a3\u4e2a|\u521a\u624d|\u7b2c\u4e00\u4e2a|\u53e6\u5916\u4e00\u4e2a|\u53e6\u4e00\u4e2a|\u8fd9\u4e24\u4e2a|\u90a3\u4e24\u4e2a/iu;
const REVISION_CHANGE_PATTERN = /\b(?:change|changed|changes|difference|revision diff)\b|thay \u0111\u1ed5i|kh\u00e1c g\u00ec|bi\u1ebfn \u0111\u1ed5i|\u6539\u53d8|\u53d8\u5316|\u53d8\u66f4|\u6539\u4e86|\u5dee\u5f02/iu;
const RECENT_CHANGES_PATTERN = /\b(?:recent|latest)\b.{0,30}\b(?:change|changes|updates?)\b|thay \u0111\u1ed5i g\u1ea7n \u0111\u00e2y|bi\u1ebfn \u0111\u1ed5i g\u1ea7n \u0111\u00e2y|\u6700\u8fd1.{0,12}(?:\u53d8\u66f4|\u53d8\u5316|\u66f4\u65b0)|\u8fd1\u671f.{0,12}(?:\u53d8\u66f4|\u53d8\u5316|\u66f4\u65b0)/iu;
const PDM_DISCOVERY_PATTERN = /\b(?:spec|specification|material|drawer|where[- ]?used|used in|belongs)\b|quy c\u00e1ch|th\u00f4ng s\u1ed1|v\u1eadt li\u1ec7u|ng\u0103n k\u00e9o|d\u00f9ng cho|\u89c4\u683c|\u7269\u6599|\u5e03\u62bd|\u62bd\u5c49|\u7528\u4e8e|\u5c5e\u4e8e/iu;
const PRODUCT_SCOPED_LOOKUP_PATTERN = /\b(?:what|which|find|show|list|use|uses|using|contain|contains|has|have)\b|d\u00f9ng|s\u1eed d\u1ee5ng|lo\u1ea1i n\u00e0o|g\u00ec|t\u00ecm|xem|\u7528\u4ec0\u4e48|\u7528\u54ea|\u6709\u4ec0\u4e48|\u6709\u54ea\u4e9b|\u54ea\u4e2a|\u54ea\u4e9b|\u67e5\u770b|\u67e5\u8be2|\u627e/iu;
const REVISION_STATUS_PATTERN = /phi\u00ean b\u1ea3n|tr\u1ea1ng th\u00e1i|b\u1ea3n nh\u00e1p|hi\u1ec7n h\u00e0nh|\u7248\u672c|\u72b6\u6001|\u8349\u7a3f|\u53d1\u5e03|\u73b0\u884c|\u4fee\u8ba2/iu;
const REVISION_COMPARISON_REFERENCE_PATTERN = /\b(?:two|both|these|those)\s+(?:revisions?|versions?)\b|\b(?:revisions?|versions?)\b.{0,30}\b(?:difference|different)\b|hai\s+(?:phi\u00ean b\u1ea3n|b\u1ea3n).{0,30}(?:kh\u00e1c|so s\u00e1nh)|(?:kh\u00e1c nhau|so s\u00e1nh).{0,30}hai\s+(?:phi\u00ean b\u1ea3n|b\u1ea3n)|\u4e24\u4e2a(?:\u7248\u672c|\u4fee\u8ba2)|\u4e24\u7248|\u8fd9\u4e24\u4e2a(?:\u7248\u672c|\u4fee\u8ba2)|(?:\u7248\u672c|\u4fee\u8ba2).{0,12}(?:\u533a\u522b|\u5dee\u522b|\u4e0d\u540c)/iu;
const SEARCH_RESULT_FOLLOW_UP_PATTERN = /\b(?:only one|any others?|anything else|any more)\b|\b(?:is|are)\b.{0,40}\b(?:only|all)\b|ch\u1ec9.{0,40}(?:th\u00f4i|\u00e0|\?)|c\u00f2n.{0,40}(?:kh\u00e1c|n\u00e0o)|c\u00f3.{0,40}n\u00e0o kh\u00e1c|t\u1ea5t c\u1ea3|\u53ea\u6709|\u4ec5.{0,20}(?:\u5417|\uff1f|\?)|\u8fd8\u6709.{0,20}(?:\u5176\u4ed6|\u522b\u7684)|\u5168\u90e8/iu;
const HELP_PATTERN = /\b(?:guide|instructions?|capabilities|what can you do|how (?:do|can) i use|help (?:me )?(?:use|with))\b|h\u01b0\u1edbng d\u1eabn|c\u00f3 th\u1ec3 l\u00e0m g\u00ec|gi\u00fap \u0111\u01b0\u1ee3c g\u00ec|\u4f7f\u7528\u5e2e\u52a9|\u600e\u4e48\u7528|\u4f7f\u7528\u6307\u5357|\u6709\u4ec0\u4e48\u529f\u80fd/iu;
const SCHEMA_PATTERN = /\b(?:schema|data structure|fields?|entities|html data|dom data)\b|c\u1ea5u tr\u00fac d\u1eef li\u1ec7u|tr\u01b0\u1eddng d\u1eef li\u1ec7u|d\u1eef li\u1ec7u html|\u6570\u636e\u7ed3\u6784|\u5b57\u6bb5|\u5b9e\u4f53|HTML\s*\u6570\u636e/iu;
const DRAWING_COMMONALITY_PATTERN = /\b(?:drawing|drawings|blueprint|interchangeable)\b|b\u1ea3n v\u1ebd|thay th\u1ebf l\u1eabn nhau|\u56fe\u7eb8|\u53ef\u4ee5\u4e92\u6362/iu;
const DUPLICATE_MATERIAL_PATTERN = /\b(?:duplicate|duplicates|deduplicate)\b|tr\u00f9ng(?:\s*l\u1eb7p)?|gi\u1ed1ng\s*h\u1ec7t|(?:g\u1ed9p|gom)\s*(?:chung|m\u00e3)|\u91cd\u590d|\u76f8\u540c|\u5408\u5e76\u7269\u6599/iu;
const MUTATION_REQUEST_PATTERN = /\b(?:add|create|update|edit|delete|remove|replace|change|modify|release|publish|withdraw|link|attach)\b|th\u00eam|t\u1ea1o|s\u1eeda|ch\u1ec9nh|x\u00f3a|thay|\u0111\u1ed5i|c\u1eadp nh\u1eadt|ph\u00e1t h\u00e0nh|r\u00fat ph\u00e1t h\u00e0nh|bi\u1ebfn|\u6dfb\u52a0|\u521b\u5efa|\u4fee\u6539|\u7f16\u8f91|\u5220\u9664|\u79fb\u9664|\u66ff\u6362|\u66f4\u65b0|\u53d1\u5e03|\u64a4\u56de|\u6539|\u53d8/iu;
const GREETING_PATTERN = /^(hi|hello|hey|你好|xin ch[aà]o|ch[aà]o)(\s|!|\.|。|$)/iu;
const AFFIRMATION_PATTERN = /^(?:是|是的|对|对的|没错|确认|yes|yep|correct|đúng|đúng rồi|phải)$/iu;
const EXPAND_USAGE_PATTERN = /除外|除此之外|还有.{0,16}(?:产品|SKU)|其他.{0,8}(?:产品|SKU)|any other products?|còn.{0,16}sản phẩm/iu;

const INTENT_PATTERNS = Object.freeze({
  revision: /\b(revisions?|versions?|status|draft|released|current|effective)\b|phi[eê]n b[aả]n|tr[aạ]ng th[aá]i|b[aả]n nh[aá]p|hi[eệ]n h[aà]nh|版本|状态|草稿|发布|现行|修订/iu,
  comparison: /\b(compare|comparison|difference|different|versus|vs)\b|so s[aá]nh|kh[aá]c nhau|rộng hơn|hơn (?:bao nhiêu|mấy)|对比|比较|相比|比一下|比一比|区别|差异/iu,
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
  DRAWING_ANALYSIS: 'drawing_analysis',
  DRAWING_COMMONALITY: 'drawing_commonality',
  DUPLICATE_MATERIALS: 'duplicate_materials',
  PROPOSAL: 'proposal',
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

function strategyTokens(value) {
  const text = String(value || '').normalize('NFKC').toLowerCase();
  const tokens = new Set(text.match(/[a-z0-9_]{2,}/g) || []);
  const hanRuns = text.match(/[\p{Script=Han}]{2,}/gu) || [];
  for (const run of hanRuns) {
    for (let index = 0; index < run.length - 1; index++) tokens.add(run.slice(index, index + 2));
  }
  return tokens;
}

function strategySimilarity(left, right) {
  const leftTokens = strategyTokens(left);
  const rightTokens = strategyTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap++;
  }
  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function learnedRoute(text, entities, tools, learnedStrategies) {
  const candidates = (Array.isArray(learnedStrategies) ? learnedStrategies : [])
    .filter(memory => (
      memory?.status === 'confirmed'
      && memory.scope?.memoryType === 'procedure'
      && typeof memory.scope?.exampleQuery === 'string'
      && typeof memory.scope?.preferredTool === 'string'
      && tools.has(memory.scope.preferredTool)
      && !['apply_mutation', 'store_memory'].includes(memory.scope.preferredTool)
    ))
    .map(memory => ({ memory, similarity: strategySimilarity(text, memory.scope.exampleQuery) }))
    .sort((left, right) => right.similarity - left.similarity);
  const best = candidates[0];
  if (!best || best.similarity < 0.6) return null;
  return result(
    best.memory.scope.intent || PDM_INTENTS.AMBIGUOUS,
    { ...entities, searchQuery: text },
    best.memory.scope.preferredTool,
    'learned',
  );
}

export function routePdmIntent({
  query,
  history = [],
  conversationContext = {},
  selection = {},
  availableTools = [],
  resolvedEntities = [],
  learnedStrategies = [],
}) {
  const text = String(query || '').trim();
  const tools = toolNames(availableTools);
  if (DUPLICATE_MATERIAL_PATTERN.test(text) && tools.has('find_duplicate_materials')) {
    const name = /\u7eb8\u5361/iu.test(text) ? '\u7eb8\u5361' : '';
    const intent = MUTATION_REQUEST_PATTERN.test(text)
      ? PDM_INTENTS.PROPOSAL
      : PDM_INTENTS.DUPLICATE_MATERIALS;
    return result(intent, { ...(name ? { materialName: name } : {}) }, 'find_duplicate_materials');
  }
  const explicitProductIds = productMatches(text);
  const shorthandProduct = detectProductShorthand(text);
  const bareProductPair = text.match(/(?:^|[^\d])(\d{3,4})\s*(?:\u548c|\u4e0e|\u53ca|and|với|và|&|\/|,)\s*(\d{3,4})(?:[^\d]|$)/iu);
  const shorthandProductIds = bareProductPair
    ? [`LGS${bareProductPair[1]}`, `LGS${bareProductPair[2]}`]
    : shorthandProduct
      ? [shorthandProduct.candidateProductId]
      : [];
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
    REFERENTIAL_FOLLOW_UP_PATTERN.test(text) ||
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
    && (INTENT_PATTERNS.currentProduct.test(text) || DRAWING_COMMONALITY_PATTERN.test(text));
  const contextualShorthandProductIds = (
    shorthandProductIds.length === 1
    && INTENT_PATTERNS.comparison.test(text)
    && priorProductIds.length === 1
    && priorProductIds[0] !== shorthandProductIds[0]
  )
    ? [priorProductIds[0], shorthandProductIds[0]]
    : shorthandProductIds;
  const productIds = canUseSelection
    ? [selectedProduct]
    : explicitProductIds.length > 0
      ? explicitProductIds
      : resolvedProductIds.length > 0
        ? resolvedProductIds
        : contextualShorthandProductIds.length > 0
          ? contextualShorthandProductIds
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

  if (
    AFFIRMATION_PATTERN.test(text)
    && priorProductIds.length === 1
    && priorSearchQuery
    && tools.has('analyze_pdm')
  ) {
    const digits = priorProductIds[0].slice(3);
    const confirmedQuery = priorSearchQuery.replace(new RegExp(`\\b${digits}\\b`, 'g'), priorProductIds[0]);
    return result(
      PDM_INTENTS.CATALOG_ANALYSIS,
      { ...entities, productIds: priorProductIds, searchQuery: confirmedQuery },
      'analyze_pdm',
    );
  }

  if (MUTATION_REQUEST_PATTERN.test(text) && tools.has('apply_mutation')) {
    const dimensions = text.match(/\d+(?:\.\d+)?\s*mm/giu) || [];
    const preferredTool = dimensions.length >= 2 && tools.has('search_pdm')
      ? 'search_pdm'
      : 'apply_mutation';
    return result(
      PDM_INTENTS.PROPOSAL,
      { ...entities, searchQuery: text },
      preferredTool,
    );
  }

  if (
    EXPAND_USAGE_PATTERN.test(text)
    && priorProductIds.length >= 2
    && priorSearchQuery
    && tools.has('analyze_pdm')
  ) {
    return result(
      PDM_INTENTS.CATALOG_ANALYSIS,
      { ...entities, productIds: priorProductIds, searchQuery: `${priorSearchQuery} ${text}` },
      'analyze_pdm',
    );
  }

  if (
    DRAWING_COMMONALITY_PATTERN.test(text)
    && productIds.length >= 2
    && tools.has('check_drawing_commonality')
  ) {
    return result(
      PDM_INTENTS.DRAWING_COMMONALITY,
      { ...entities, productIds: productIds.slice(0, 4), searchQuery: text },
      'check_drawing_commonality',
    );
  }

  if (
    DRAWING_COMMONALITY_PATTERN.test(text)
    && productIds.length === 1
    && tools.has('analyze_engineering_drawing')
  ) {
    return result(
      PDM_INTENTS.DRAWING_ANALYSIS,
      { ...entities, productIds: productIds.slice(0, 1), searchQuery: text },
      'analyze_engineering_drawing',
    );
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

  if (
    productIds.length === 1
    && PRODUCT_BOM_COMPONENT_PATTERN.test(text)
    && !PRODUCT_VARIANT_GAP_PATTERN.test(text)
    && tools.has('get_bom')
  ) {
    return result(PDM_INTENTS.BOM_LOOKUP, { ...entities, componentQuery: text }, 'get_bom');
  }

  if (
    INTENT_PATTERNS.comparison.test(text)
    && productIds.length >= 2
    && tools.has('compare_boms')
  ) {
    return result(PDM_INTENTS.BOM_COMPARE, { productIds: productIds.slice(0, 2) }, 'compare_boms');
  }

  if (
    tools.has('analyze_pdm')
    && (PRODUCT_FILTER_PATTERN.test(text) || (productIds.length === 0 && PRODUCT_SINGLE_DIMENSION_PATTERN.test(text)))
  ) {
    return result(PDM_INTENTS.CATALOG_ANALYSIS, { ...entities, searchQuery: text }, 'analyze_pdm');
  }

  if (tools.has('analyze_pdm') && detectProductShorthand(text) && !PRODUCT_DETAIL_PATTERN.test(text)) {
    return result(PDM_INTENTS.CATALOG_ANALYSIS, { ...entities, searchQuery: text }, 'analyze_pdm');
  }

  const EXPLICIT_CATALOG_PATTERN = /\b(?:all\s+lgs|所有\s*lgs|tất\s+cả\s+lgs|所有的?)\b/iu;
  const CATALOG_ANALYSIS_PATTERN = /\b(?:all\s+lgs|tất\s+cả\s+lgs)\b|所有(?:的)?\s*lgs|有几个柜子|有几种铁框|多种布抽|有多零件|共有几个|共用部件|客诉|所有(?:的)?五金包|五金包.{0,16}共用/iu;
  const CATALOG_COMPONENT_QUESTION_PATTERN = /(?:产品|SKU).{0,24}(?:用|使用|包含|有).{0,24}(?:上横梁|竖梁|竖零件|纸箱|carton|upper crossbar|vertical beam)|(?:上横梁|竖梁|竖零件|纸箱|carton|upper crossbar|vertical beam).{0,24}(?:哪(?:一|些|个)|哪些|共用|独用).{0,12}(?:产品|SKU)?|(?:largest|biggest|maximum|最大的?|最大).{0,20}(?:carton|纸箱)/iu;
  if (
    tools.has('analyze_pdm') &&
    (
      EXPLICIT_CATALOG_PATTERN.test(text) ||
      CATALOG_COMPONENT_QUESTION_PATTERN.test(text) ||
      (PRODUCT_VARIANT_GAP_PATTERN.test(text) && productIds.length === 1) ||
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

  if (productIds.length === 1 && PRODUCT_DETAIL_PATTERN.test(text) && tools.has('get_product')) {
    return result(PDM_INTENTS.DISCOVERY, entities, 'get_product');
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

  const learned = learnedRoute(text, entities, tools, learnedStrategies);
  if (learned) return learned;

  return ambiguous(entities);
}
