const PRODUCT_PATTERN = /\bLGS\d{3,4}\b/gi;
const ALIAS_PATTERN = /\bULGS\d{3,4}[A-Z0-9]+\b/gi;
const MATERIAL_PATTERN = /\bmat_[a-z0-9]+\b/gi;
const MATERIAL_DETAIL_PATTERN = /\b(material|part)\b|v\u1eadt li\u1ec7u|\u7269\u6599|\u6750\u6599/iu;
const MATERIAL_USAGE_PATTERN = /\bwhere\b.{0,40}\bused\b|\bwhere[- ]?used\b|\bused in\b|d\u00f9ng \u1edf|s\u1ea3n ph\u1ea9m n\u00e0o|\u54ea\u4e9b\u4ea7\u54c1|\u5728\u54ea\u91cc\u4f7f\u7528/iu;
const COMPARISON_FOLLOW_UP_PATTERN = /\b(?:both|shared|common|those|these two)\b|c\u1ea3 hai|d\u00f9ng chung|kh\u00e1c nhau|\u5b83\u4eec|\u4e24\u8005|\u4e24\u4e2a\u4ea7\u54c1|\u5171\u7528|\u5171\u540c|\u5de6\s*\/\s*\u53f3|\u5de6\u53f3|\u5176\u4ed6/iu;

const INTENT_PATTERNS = Object.freeze({
  revision: /\b(revision|version|status|draft|released|current|effective)\b|phi[eê]n b[aả]n|tr[aạ]ng th[aá]i|b[aả]n nh[aá]p|hi[eệ]n h[aà]nh|版本|状态|草稿|发布|现行|修订/iu,
  comparison: /\b(compare|comparison|difference|different|versus|vs)\b|so s[aá]nh|kh[aá]c nhau|对比|比较|区别|差异/iu,
  bom: /\b(bom|parts?|materials?|quantit(?:y|ies))\b|v[aậ]t li[eệ]u|linh ki[eệ]n|b[oộ] ph[aậ]n|s[oố] l[uư][oợ]ng|零件|物料|部件|用量|数量|多少/iu,
  marketplace: /\b(amazon|reviews?|comments?|feedback)\b|[dđ][aá]nh gi[aá]|b[iì]nh lu[aậ]n|评价|评论/iu,
  alias: /\b(sku|alias)\b|m[aã] h[aà]ng|商品编码|别名/iu,
  currentProduct: /\b(this|current) product\b|s[aả]n ph[aẩ]m n[aà]y|s[aả]n ph[aẩ]m hi[eệ]n t[aạ]i|当前产品|这个产品|该产品/iu,
  discovery: /\b(find|search|list)\b|t[iì]m|danh s[aá]ch|搜索|查找|列表/iu,
});

export const PDM_INTENTS = Object.freeze({
  REVISION_STATUS: 'revision_status',
  BOM_LOOKUP: 'bom_lookup',
  BOM_COMPARE: 'bom_compare',
  MATERIAL_DETAIL: 'material_detail',
  MATERIAL_USAGE: 'material_usage',
  MARKETPLACE: 'marketplace',
  SKU_ALIAS: 'sku_alias',
  DISCOVERY: 'discovery',
  GREETING: 'greeting',
  AMBIGUOUS: 'ambiguous',
});

const GREETING_PATTERN = /^(hi|hello|hey|你好|xin ch[aà]o|ch[aà]o)(\s|!|\.|。|$)/iu;

function toolNames(availableTools) {
  return new Set((Array.isArray(availableTools) ? availableTools : [])
    .map(tool => typeof tool === 'string' ? tool : tool?.function?.name)
    .filter(Boolean));
}

function uniqueMatches(text, pattern) {
  return [...new Set((text.match(pattern) || []).map(value => value.toUpperCase()))];
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

export function routePdmIntent({ query, history = [], selection = {}, availableTools = [], resolvedEntities = [] }) {
  const text = String(query || '').trim();
  const tools = toolNames(availableTools);
  const explicitProductIds = uniqueMatches(text, PRODUCT_PATTERN);
  const resolved = Array.isArray(resolvedEntities) ? resolvedEntities : [];
  const resolvedProductTargets = resolved.filter(entity => (
    entity?.type === 'product' || entity?.type === 'product-variant'
  ) && /^LGS\d{3,4}$/.test(entity.productCode || ''));
  const resolvedProductIds = [...new Set(resolvedProductTargets.map(entity => entity.productCode))];
  const resolvedColors = resolvedProductTargets
    .filter(entity => entity.type === 'product-variant' && typeof entity.color === 'string' && entity.color)
    .map(entity => entity.color);
  const historicalProductIds = explicitProductIds.length === 0 && COMPARISON_FOLLOW_UP_PATTERN.test(text)
    ? uniqueMatches(
        (Array.isArray(history) ? history : [])
          .slice(-6)
          .map(message => typeof message?.content === 'string' ? message.content : '')
          .join(' '),
        PRODUCT_PATTERN
      ).slice(0, 2)
    : [];
  const aliases = uniqueMatches(text, ALIAS_PATTERN);
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
      : resolvedProductIds.length > 0 ? resolvedProductIds : historicalProductIds;
  const entities = materialIds.length > 0 ? { productIds, materialIds } : { productIds };
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

  if (INTENT_PATTERNS.marketplace.test(text) && productIds.length === 1 && tools.has('get_marketplace_insights')) {
    return result(PDM_INTENTS.MARKETPLACE, entities, 'get_marketplace_insights');
  }

  if (INTENT_PATTERNS.comparison.test(text) || (COMPARISON_FOLLOW_UP_PATTERN.test(text) && productIds.length >= 2)) {
    if (productIds.length >= 2 && tools.has('compare_boms')) {
      return result(PDM_INTENTS.BOM_COMPARE, { productIds: productIds.slice(0, 2) }, 'compare_boms');
    }
    return ambiguous(entities);
  }

  if (INTENT_PATTERNS.revision.test(text) && productIds.length === 1 && tools.has('get_revision_history')) {
    return result(PDM_INTENTS.REVISION_STATUS, entities, 'get_revision_history');
  }

  if (aliases.length > 0 && INTENT_PATTERNS.alias.test(text) && tools.has('resolve_sku')) {
    return result(PDM_INTENTS.SKU_ALIAS, { productIds, aliases }, 'resolve_sku');
  }

  if (INTENT_PATTERNS.bom.test(text) && productIds.length === 1 && tools.has('get_bom')) {
    return result(PDM_INTENTS.BOM_LOOKUP, entities, 'get_bom');
  }

  if (INTENT_PATTERNS.discovery.test(text) && tools.has('search_products')) {
    return result(PDM_INTENTS.DISCOVERY, entities, 'search_products');
  }

  if (GREETING_PATTERN.test(text) && Object.keys(entities).every(k => !entities[k] || entities[k].length === 0)) {
    return result(PDM_INTENTS.GREETING, entities, null, 'greeting');
  }

  return ambiguous(entities);
}
