// src/features/ai-assistant/intent-router.js
import {
  detectProductShorthand,
  foldPdmText,
  resolveConcept,
  extractComponentConcept,
  extractMetric,
  parseRelativeChange,
} from './pdm-terminology.js';
import {
  normalizeConversationState,
  extractReferenceExpressions,
  resolveReferences,
  applyContextTransition,
  inferExpectedReferenceType,
  filterReferentsBySemanticFocus,
} from './context-resolution.js';

const PRODUCT_PATTERN = /\bLGS\d{3,4}\b/gi;
const ALIAS_PATTERN = /\bULGS\d{3,4}[A-Z0-9]+\b/gi;
const MATERIAL_PATTERN = /\b(?:mat|MAT|CARTON)_[a-zA-Z0-9_]+\b/g;
const REVISION_PATTERN = /\b(?:[A-Z]\.)?V?\d+(?:\.\d+)+\b|\bV\d+\b/gi;
const DIMENSION_PATTERN = /\b\d+(?:\.\d+)?\s*(?:x|\u00d7|\*)\s*\d+(?:\.\d+)?(?:\s*(?:x|\u00d7|\*)\s*\d+(?:\.\d+)?)?(?:\s*mm)?\b/iu;
const SINGLE_DIMENSION_PATTERN = /(?:(?:宽度?|高度?|深度?|长度?)\s*\d{1,4}(?:\.\d+)?|\b\d{1,4}(?:\.\d+)?\s*(?:(?:mm|cm|li|inch|in)\b|分米|毫米|厘米|寸|吋|宽|高|长|深))/giu;
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
const SPECIFICATION_ONLY_FOLLOW_UP_PATTERN = /(?:只要|仅|只|只需).{0,12}(?:统计|列出)?.{0,12}(?:规格|规\s*格)|(?:chi|chi can|chi muon).{0,20}(?:thong ke|liet ke)?.{0,20}(?:quy cach|kich thuoc)|\b(?:only|just)\b.{0,24}\b(?:spec|specification|dimensions?)\b/iu;
const HELP_PATTERN = /\b(?:guide|instructions?|capabilities|what can you do|how (?:do|can) i use|help (?:me )?(?:use|with))\b|h\u01b0\u1edbng d\u1eabn|c\u00f3 th\u1ec3 l\u00e0m g\u00ec|gi\u00fap \u0111\u01b0\u1ee3c g\u00ec|\u4f7f\u7528\u5e2e\u52a9|\u600e\u4e48\u7528|\u4f7f\u7528\u6307\u5357|\u6709\u4ec0\u4e48\u529f\u80fd/iu;
const SCHEMA_PATTERN = /\b(?:schema|data structure|fields?|entities|html data|dom data)\b|c\u1ea5u tr\u00fac d\u1eef li\u1ec7u|tr\u01b0\u1eddng d\u1eef li\u1ec7u|d\u1eef li\u1ec7u html|\u6570\u636e\u7ed3\u6784|\u5b57\u6bb5|\u5b9e\u4f53|HTML\s*\u6570\u636e/iu;
const DRAWING_COMMONALITY_PATTERN = /\b(?:drawing|drawings|blueprint|interchangeable)\b|b\u1ea3n v\u1ebd|thay th\u1ebf l\u1eabn nhau|\u56fe\u7eb8|\u53ef\u4ee5\u4e92\u6362/iu;
const VIETNAMESE_CATALOG_SCOPE_PATTERN = /\b(?:toan bo|tat ca|moi|cac)\b/iu;
const VIETNAMESE_PRODUCT_SCOPE_PATTERN = /\b(?:san pham|LGS)\b/iu;
const CATALOG_COMPONENT_SCOPE_PATTERN = /(?:所有|全部|全体|统计|統計|列出|列表|清单|汇总|all|every|toan bo|tat ca|moi|cac)/iu;
const GENERIC_CATALOG_MATERIAL_SCOPE_PATTERN = /(?:所有|全部|全体|统计|統計|列出|列表|清单|汇总|all|every|toan bo|tat ca|thong ke|liet ke|danh sach)/iu;
const FOLDED_PRODUCT_DETAIL_PATTERN = /\b(?:mau|mau sac|kich thuoc|rong|cao|sau|dai|thong tin san pham|ma san pham)\b/iu;
const FOLDED_COMPONENT_LOOKUP_PATTERN = /\b(?:dung gi|dung loai nao|loai nao|ma nao|ma gi|bao nhieu|so luong|quy cach|kich thuoc)\b.{0,40}\b(?:linh kien|vat lieu|bo phan|tui vai|day tui|ngan keo|ngu kim|thung|hop|bao bi|oc vit|tay nam|chan|thanh|khung)\b|\b(?:linh kien|vat lieu|bo phan|tui vai|day tui|ngan keo|ngu kim|thung|hop|bao bi|oc vit|tay nam|chan|thanh|khung)\b.{0,40}\b(?:dung gi|dung loai nao|loai nao|ma nao|ma gi|bao nhieu|so luong|quy cach|kich thuoc)\b/iu;
const FOLDED_REVISION_PATTERN = /\b(?:phien ban|version|ban nhap|hien hanh|da phat hanh|trang thai)\b/iu;
const FOLDED_COMPARISON_PATTERN = /\b(?:so sanh|doi chieu|khac nhau|giong nhau|dung chung|chung nhau)\b/iu;
const FOLDED_DISCOVERY_PATTERN = /\b(?:tim|tra|kiem tra|liet ke|cho xem)\b.{0,40}\b(?:vat lieu|linh kien|quy cach|kich thuoc|ma)\b|\b(?:vat lieu|linh kien|quy cach|kich thuoc)\b.{0,40}\b(?:nao|gi|bao nhieu)\b/iu;

const SPEC_PATTERN = /\b(?:(?:M|ST)\d+(?:\.\d+)?(?:\s*(?:x|×|\*)\s*\d+(?:\.\d+)?)?(?:\s*mm)?|\d+(?:\.\d+)?\s*(?:x|×|\*)\s*\d+(?:\.\d+)?(?:\s*(?:x|×|\*)\s*\d+(?:\.\d+)?)?\s*mm|\d+(?:\.\d+)?\s*mm)\b/gi;

function extractKnownSpecs(text) {
  const matches = [];
  const regex = new RegExp(SPEC_PATTERN.source, 'gi');
  let m;
  while ((m = regex.exec(text)) !== null) {
    matches.push({
      raw: m[0],
      canonical: m[0].replace(/×|\*/g, 'x').replace(/\s+/g, ''),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return matches;
}

function parseExplicitSpecReplacement(text) {
  const specs = extractKnownSpecs(text);
  if (specs.length < 2) return null;

  const patterns = [
    /(?:改为|换成|变成|修改为|更换为|thành|thay bằng|sang|đổi thành|to|into)\s*([^\s,;]+)/iu,
    /([^\s,;]+)\s*(?:改为|换成|变成|修改为|更换为|thành|thay bằng|sang|đổi thành|->|=>|→)/iu,
  ];

  for (const pat of patterns) {
    const match = text.match(pat);
    if (match) {
      const matchedText = match[1] || match[0];
      const targetSpec = specs.find(s => matchedText.includes(s.raw));
      if (targetSpec) {
        const otherSpec = specs.find(s => s !== targetSpec);
        if (otherSpec) {
          const isTargetNew = /改为|换成|变成|修改为|更换为|thành|thay bằng|sang|đổi thành|to|into/iu.test(match[0]);
          return isTargetNew
            ? { oldSpec: otherSpec.canonical, newSpec: targetSpec.canonical }
            : { oldSpec: targetSpec.canonical, newSpec: otherSpec.canonical };
        }
      }
    }
  }

  if (specs.length === 2) {
    return {
      oldSpec: specs[0].canonical,
      newSpec: specs[1].canonical,
    };
  }

  return null;
}

function selectBomCandidate(query, candidates, selectedCandidate = null) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const text = String(query || '').normalize('NFKC').toLowerCase();
  const ordinalWords = new Map([
    ['\u7b2c\u4e00', 1], ['\u7b2c\u4e8c', 2], ['\u7b2c\u4e09', 3], ['\u7b2c\u56db', 4],
    ['\u7b2c\u4e00\u4e2a', 1], ['\u7b2c\u4e8c\u4e2a', 2], ['\u7b2c\u4e09\u4e2a', 3],
    ['\u0111\u1ea7u ti\u00ean', 1], ['th\u1ee9 hai', 2], ['th\u1ee9 ba', 3], ['th\u1ee9 t\u01b0', 4],
    ['first', 1], ['second', 2], ['third', 3], ['fourth', 4],
  ]);
  const ordinal = text.match(/(?:\u7b2c\s*|s\u1ed1\s*|lo\u1ea1i\s*|th\u1ee9\s*|m\u1eabu\s*)(\d{1,2})/u)?.[1];
  const ordinalWord = [...ordinalWords.entries()].find(([phrase]) => text.includes(phrase))?.[1];
  if (ordinal || ordinalWord) return candidates[Number(ordinal || ordinalWord) - 1] || null;
  if (/\u7b2c\u4e00\u4e2a|\u7b2c\u4e00\u79cd|\u0111\u1ea7u ti\u00ean|first|\u0111\u1ea7u$/u.test(text)) return candidates[0] || null;
  if (/\u6700\u540e|\u7b2c\u4e00\u4e2a\u4ee5\u5916|cu\u1ed1i c\u00f9ng|last|latter/u.test(text)) return candidates.at(-1) || null;
  if (/\u5269\u4e0b|\u5176\u4ed6\u7684|\u53e6\u4e00\u4e2a|c\u00f2n l\u1ea1i|c\u00e1i kh\u00e1c|the other/u.test(text) && selectedCandidate?.matCode) {
    const remaining = candidates.filter(row => row.matCode !== selectedCandidate.matCode);
    return remaining.length === 1 ? remaining[0] : null;
  }
  const code = candidates.find(row => row.matCode && text.includes(row.matCode.toLowerCase()));
  if (code) return code;
  const dimension = text.match(/\d+(?:\.\d+)?\s*(?:x|\u00d7|\*)\s*\d+(?:\.\d+)?(?:\s*(?:x|\u00d7|\*)\s*\d+(?:\.\d+)?)?/i)?.[0]?.replace(/\s+/g, '');
  if (dimension) {
    const matched = candidates.filter(row => String(row.spec || '').replace(/\s+/g, '').toLowerCase().includes(dimension.toLowerCase()));
    return matched.length === 1 ? matched[0] : null;
  }
  const singleDimension = text.match(/\b\d{2,4}(?:\.\d+)?\s*(?:mm)?\b/i)?.[0]?.replace(/\s+/g, '');
  if (singleDimension) {
    const matched = candidates.filter(row => String(row.spec || '').replace(/\s+/g, '').toLowerCase().includes(singleDimension.toLowerCase()));
    return matched.length === 1 ? matched[0] : null;
  }
  const direction = /\u5de6|left|tr\u00e1i/u.test(text) ? '\u5de6' : /\u53f3|right|ph\u1ea3i/u.test(text) ? '\u53f3' : '';
  if (direction) {
    const matched = candidates.filter(row => String(row.nameZh || '').includes(direction));
    return matched.length === 1 ? matched[0] : null;
  }
  return null;
}
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
  PRODUCT_LOOKUP: 'product_lookup',
  MATERIAL_DETAIL: 'material_detail',
  MATERIAL_USAGE: 'material_usage',
  DUPLICATE_MATERIALS: 'duplicate_materials',
  MARKETPLACE: 'marketplace',
  CATALOG_ANALYSIS: 'catalog_analysis',
  PDM_SEARCH: 'pdm_search',
  DRAWING_COMMONALITY: 'drawing_commonality',
  DRAWING_ANALYSIS: 'drawing_analysis',
  PROPOSAL: 'proposal',
  HELP: 'help',
  SCHEMA: 'schema',
  GREETING: 'greeting',
  AMBIGUOUS: 'ambiguous',
  ECN_IMPACT: 'ecn_impact',
});

function toolNames(availableTools = []) {
  return new Set(availableTools.map(t => (typeof t === 'string' ? t : (t?.function?.name || t?.name))).filter(Boolean));
}

function uniqueMatches(text, pattern) {
  return [...new Set(Array.from(String(text || '').matchAll(pattern), m => m[0].toUpperCase()))];
}

function productMatches(text) {
  return uniqueMatches(text, PRODUCT_PATTERN);
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

function ambiguous(entities, clarificationCode = null, candidates = []) {
  const res = result(PDM_INTENTS.AMBIGUOUS, entities, null, 'ambiguous');
  return Object.freeze({
    ...res,
    needsClarification: true,
    ...(clarificationCode ? { clarificationCode } : {}),
    ...(candidates.length > 0 ? { candidates: Object.freeze(candidates) } : {}),
  });
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
  const NEGATIVE_SALES_PATTERN = /bán chạy|sales|doanh thu|thị trường|best seller|销量|热销|好卖|卖得好/iu;
  if (NEGATIVE_SALES_PATTERN.test(text)) return null;

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
    best.memory.scope.intent || PDM_INTENTS.PDM_SEARCH,
    { ...entities, ...(best.memory.scope.entities || {}) },
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
  const foldedText = foldPdmText(text);
  const tools = toolNames(availableTools);
  const normState = normalizeConversationState(conversationContext);

  // 1. Pending Clarification State Lock
  if (normState.pendingClarification) {
    const isCancel = /hủy|bỏ qua|thôi|cancel|取消/iu.test(text);
    const hasExplicitNewProducts = productMatches(text).length > 0;
    if (!isCancel && !hasExplicitNewProducts) {
      const refExpr = extractReferenceExpressions(text);
      const refRes = resolveReferences({ referenceExpr: refExpr, state: normState });
      if (refRes.resolved) {
        const resolvedTarget = refRes.resolved.id || refRes.resolved.mat_code || refRes.resolved;
        if (refRes.resumeFrame) {
          const resume = refRes.resumeFrame;
          return result(resume.intent || PDM_INTENTS.ECN_IMPACT, {
            productIds: normState.scope.productIds,
            targetMaterialId: resolvedTarget,
            componentConcept: resume.frame?.componentConcept || 'fastener',
            change: resume.frame?.change,
            searchQuery: text,
          }, resume.preferredTool || 'analyze_ecn_impact');
        }
        const tool = tools.has('get_material') ? 'get_material' : (tools.has('analyze_ecn_impact') ? 'analyze_ecn_impact' : null);
        return result(PDM_INTENTS.MATERIAL_DETAIL, {
          productIds: normState.scope.productIds,
          materialIds: [resolvedTarget],
          targetMaterialId: resolvedTarget,
        }, tool);
      }
      if (refRes.needsClarification) {
        const candidates = refRes.candidates || (normState.pendingClarification.candidates || []).map(c => c.id || c);
        return ambiguous({
          productIds: normState.scope.productIds,
          candidates,
        }, normState.pendingClarification.type || 'reference_ambiguous', candidates);
      }
    }
  }

  if (DUPLICATE_MATERIAL_PATTERN.test(text) && tools.has('find_duplicate_materials')) {
    const name = /\u7eb8\u5361/iu.test(text) ? '\u7eb8\u5361' : '';
    const intent = MUTATION_REQUEST_PATTERN.test(text)
      ? PDM_INTENTS.PROPOSAL
      : PDM_INTENTS.DUPLICATE_MATERIALS;
    return result(intent, { ...(name ? { materialName: name } : {}) }, 'find_duplicate_materials');
  }

  // 2. Explicit Entity Extraction & Dimensions Stripping
  const explicitProductIds = productMatches(text);
  const textWithoutDimensions = text
    .replace(DIMENSION_PATTERN, ' ')
    .replace(SINGLE_DIMENSION_PATTERN, ' ')
    .replace(SPEC_PATTERN, ' ');
  const allShorthands = (textWithoutDimensions.match(/\b\d{3,4}\b/g) || []).map(num => `LGS${num}`);
  const shorthandProduct = detectProductShorthand(textWithoutDimensions);
  const bareProductPair = textWithoutDimensions.match(/(?:^|[^\d])(\d{3,4})\s*(?:\u548c|\u4e0e|\u53ca|and|với|và|&|\/|,|vs|v\.s|so\s+với|\s+)\s*(\d{3,4})(?:[^\d]|$)/iu);
  const shorthandProductIds = bareProductPair
    ? [`LGS${bareProductPair[1]}`, `LGS${bareProductPair[2]}`]
    : allShorthands.length > 0
      ? [...new Set(allShorthands)].slice(0, 2)
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

  const queryProductIds = [...new Set([...explicitProductIds, ...shorthandProductIds])];
  const directProductIds = queryProductIds.length > 0 ? queryProductIds : resolvedProductIds;

  const extractedColor = (text.match(/白色|黑色|复古色|白色带灯|黑色带电|白色带电|黑色带灯|màu\s*(?:gỗ|trắng|đen)|\b(?:black|white|rustic|vintage|wh|bh|kd)\b/iu) || [])[0]
    ? ((text.match(/白色|\bwhite\b|\bwh\b/iu) ? '白色' : '') || (text.match(/黑色|\bblack\b|\bbh\b/iu) ? '黑色' : '') || (text.match(/复古色|màu\s*gỗ|\brustic\b|\bvintage\b|\bkd\b/iu) ? '复古色' : '') || (text.match(/màu\s*trắng/iu) ? '白色' : '') || (text.match(/màu\s*đen/iu) ? '黑色' : ''))
    : null;

  const explicitMaterialIds = [...new Set(
    (text.match(MATERIAL_PATTERN) || []).map(val => {
      const trimmed = String(val).trim();
      return trimmed.startsWith('mat_') ? trimmed.toLowerCase() : trimmed.toUpperCase();
    })
  )];
  const resolvedMaterialIds = resolved
    .filter(entity => entity?.type === 'material' && typeof entity.materialId === 'string')
    .map(entity => entity.materialId);
  let materialIds = explicitMaterialIds.length > 0 ? explicitMaterialIds : [...new Set(resolvedMaterialIds)];

  const activeConcept = extractComponentConcept(text) || normState.focus.componentConcept || null;
  const activeMetric = extractMetric(text) || normState.focus.metric || null;

  // 3. State Transition Matrix (Anti-Stale Scope Switch)
  const transitionedState = applyContextTransition({
    state: normState,
    explicitEntities: {
      productIds: directProductIds.length > 0 ? directProductIds : normState.scope.productIds,
      colors: extractedColor ? [extractedColor] : (resolvedColors.length > 0 ? resolvedColors : []),
      materialIds: explicitMaterialIds,
      componentConcept: activeConcept,
      metric: activeMetric,
    },
    query: text,
  });

  const priorProductIds = transitionedState.scope.productIds;
  const previousScopeProductIds = normState.scope.productIds;
  const priorRevisions = normState.scope.revisions;
  const priorSearchQuery = typeof conversationContext?.searchQuery === 'string' ? conversationContext.searchQuery.trim() : '';
  const explicitScope = explicitProductIds.length > 0 ? explicitProductIds : resolvedProductIds;
  const priorScopeMatches = explicitScope.length === 0 || (
    previousScopeProductIds.length > 0 &&
    explicitScope.length === previousScopeProductIds.length &&
    explicitScope.every((value, index) => value === previousScopeProductIds[index])
  );
  const isRevisionComparisonFollowUp = REVISION_COMPARISON_REFERENCE_PATTERN.test(text);
  const isFollowUpKeyword = /thế|còn|thì sao|thế nào|với cả|chỉ xem|tem nào|phần nào|bao bì|ốc|vít|五金|包材|序号标|不同|一样|那|呢|怎么样/iu.test(text);
  const hasComponentFollowUp = Boolean(extractComponentConcept(text) && priorProductIds.length > 0);
  const isContextualFollowUp = !isRecentChanges && (
    COMPARISON_FOLLOW_UP_PATTERN.test(text) ||
    REFERENTIAL_FOLLOW_UP_PATTERN.test(text) ||
    REVISION_CHANGE_PATTERN.test(text) || REVISION_STATUS_PATTERN.test(text) ||
    isRevisionComparisonFollowUp || revisionMatches(text).length > 0 ||
    isFollowUpKeyword || hasComponentFollowUp ||
    (normState.activeTask === 'bom_compare' && explicitProductIds.length === 0 && shorthandProductIds.length === 0)
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

  const selectedProduct = String(selection?.productCode || '').toUpperCase();
  const canUseSelection = explicitProductIds.length === 0
    && /^LGS\d{3,4}$/.test(selectedProduct)
    && (INTENT_PATTERNS.currentProduct.test(text) || DRAWING_COMMONALITY_PATTERN.test(text));

  const mergedDirectProductIds = [...new Set(directProductIds)];

  const isRevisionQuery = isRevisionComparisonFollowUp
    || REVISION_STATUS_PATTERN.test(text)
    || REVISION_CHANGE_PATTERN.test(text)
    || INTENT_PATTERNS.revision.test(text);

  const contextualDirectProductIds = (
    mergedDirectProductIds.length === 1
    && !isRevisionQuery
    && explicitProductIds.length === 0
    && (INTENT_PATTERNS.comparison.test(text) || COMPARISON_FOLLOW_UP_PATTERN.test(text))
    && previousScopeProductIds.length === 1
    && previousScopeProductIds[0] !== mergedDirectProductIds[0]
  )
    ? [previousScopeProductIds[0], mergedDirectProductIds[0]]
    : mergedDirectProductIds;

  let productIds = canUseSelection
    ? [selectedProduct]
    : contextualDirectProductIds.length > 0
      ? contextualDirectProductIds
      : isContextualFollowUp && priorProductIds.length > 0 ? priorProductIds : historicalProductIds;

  if (productIds.length > 0 && transitionedState.scope.productIds.length === 0) {
    transitionedState.scope.productIds = [...productIds];
    transitionedState.referents.products = productIds.map(id => ({ id, type: 'product' }));
  }

  if (DRAWING_COMMONALITY_PATTERN.test(text)) {
    transitionedState.focus.documentType = 'engineering_drawing';
  }

  const hasSemanticState = Boolean(
    transitionedState.scope.color ||
    transitionedState.scope.productIds.length >= 2 ||
    transitionedState.focus.componentConcept ||
    transitionedState.focus.metric ||
    transitionedState.focus.documentType ||
    conversationContext?.scope ||
    conversationContext?.focus ||
    (conversationContext?.turnCount && conversationContext.turnCount > 0) ||
    conversationContext?.productIds?.length ||
    conversationContext?.color ||
    conversationContext?.componentConcept ||
    conversationContext?.activeIntent ||
    conversationContext?.comparison
  );

  const entities = {
    productIds,
    ...(materialIds.length > 0 ? { materialIds } : {}),
    ...(transitionedState.scope.color ? { color: transitionedState.scope.color, colors: [transitionedState.scope.color] } : {}),
    ...(activeConcept ? { componentConcept: activeConcept } : {}),
    ...(activeMetric ? { metric: activeMetric } : {}),
    ...(hasSemanticState ? { scope: transitionedState.scope, focus: transitionedState.focus } : {}),
  };

  if (GREETING_PATTERN.test(text) && productIds.length === 0 && materialIds.length === 0) {
    return result(PDM_INTENTS.GREETING, entities, null, 'greeting');
  }

  if (isRecentChanges && tools.has('list_recent_changes')) {
    return result('recent_changes', entities, 'list_recent_changes');
  }

  if (INTENT_PATTERNS.discovery.test(text) && productIds.length === 0 && !DIMENSION_PATTERN.test(text) && tools.has('search_products')) {
    return result('discovery', entities, 'search_products');
  }

  if (SCHEMA_PATTERN.test(text) && tools.has('inspect_pdm_schema')) {
    return result(PDM_INTENTS.SCHEMA, entities, 'inspect_pdm_schema');
  }

  if (SCHEMA_PATTERN.test(text)) {
    return result(PDM_INTENTS.SCHEMA, entities, null);
  }

  const learned = learnedRoute(text, entities, tools, learnedStrategies);
  if (learned) return learned;

  if (aliases.length > 0 && INTENT_PATTERNS.alias.test(text) && tools.has('resolve_sku')) {
    return result(PDM_INTENTS.SKU_ALIAS, { productIds, aliases }, 'resolve_sku');
  }

  if (aliases.length > 0 && tools.has('get_product_by_alias')) {
    return result(PDM_INTENTS.ALIAS, { ...entities, alias: aliases[0] }, 'get_product_by_alias');
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

  const EXPLICIT_CATALOG_PATTERN = /\b(?:all\s+lgs|所有\s*lgs|tất\s+cả\s+lgs|所有的?)\b/iu;
  const VIETNAMESE_CATALOG_PATTERN = /\b(?:tất\s+cả(?:\s+các)?|toàn\s+bộ|mọi)\s+(?:các\s+)?lgs\b/iu;
  const CATALOG_ANALYSIS_PATTERN = /\b(?:all\s+lgs|tất\s+cả\s+lgs)\b|所有(?:的)?\s*lgs|有几个柜子|有几种铁框|多种布抽|有多零件|共有几个|共用部件|客诉|所有(?:的)?五金包|五金包.{0,16}共用/iu;
  const CATALOG_COMPONENT_QUESTION_PATTERN = /(?:产品|SKU).{0,24}(?:用|使用|包含|有).{0,24}(?:上横梁|竖梁|竖零件|纸箱|carton|upper crossbar|vertical beam)|(?:上横梁|竖梁|竖零件|纸箱|carton|upper crossbar|vertical beam).{0,24}(?:哪(?:一|些|个)|哪些|共用|独用).{0,12}(?:产品|SKU)?|(?:largest|biggest|maximum|最大的?|最大).{0,20}(?:carton|纸箱)/iu;

  const isCatalogQuery = (
    EXPLICIT_CATALOG_PATTERN.test(text) ||
    VIETNAMESE_CATALOG_PATTERN.test(text) ||
    CATALOG_COMPONENT_QUESTION_PATTERN.test(text) ||
    CATALOG_ANALYSIS_PATTERN.test(text) ||
    /(?:哪个|哪一个|哪些).{0,10}(?:产品|SKU|型号)/iu.test(text) ||
    (productIds.length === 0 && (PRODUCT_SINGLE_DIMENSION_PATTERN.test(text) || PRODUCT_FILTER_PATTERN.test(text)))
  );

  // 4. Universal Referential Safety Gate (P0-1)
  const refExpr = extractReferenceExpressions(text);
  const isExplicitMultiProductQuery = directProductIds.length >= 2;
  const isMultiProductComparison = productIds.length >= 2 && /共用|dùng chung|xài chung|so sánh|khác nhau|difference|compare|\bvs\b/iu.test(text);
  const isEcnRel = Boolean(parseRelativeChange(text));
  let refRes = null;
  if (refExpr && !isExplicitMultiProductQuery && !isEcnRel && !isCatalogQuery && !isMultiProductComparison) {
    const expectedType = inferExpectedReferenceType(text);
    refRes = resolveReferences({
      referenceExpr: refExpr,
      state: transitionedState,
      expectedType,
      semanticFocus: activeConcept,
    });
    if (refRes.needsClarification) {
      return ambiguous({
        ...entities,
        candidates: refRes.candidates || [],
      }, refRes.clarificationCode || 'ambiguous_reference', refRes.candidates || []);
    }
    if (refRes.resolved) {
      if (refRes.resolvedType === 'products') {
        productIds = Array.isArray(refRes.resolved) ? refRes.resolved : [refRes.resolved];
        entities.productIds = [...productIds];
        transitionedState.scope.productIds = [...productIds];
      } else {
        const resolvedId = refRes.resolved.id || refRes.resolved.mat_code || refRes.resolved;
        if (refRes.resolvedType === 'material') {
          materialIds = [resolvedId];
          entities.materialIds = [resolvedId];
          entities.targetMaterialId = resolvedId;
          transitionedState.focus.materialId = resolvedId;
        } else if (refRes.resolvedType === 'product') {
          productIds = [resolvedId];
          entities.productIds = [resolvedId];
          transitionedState.scope.productIds = [resolvedId];
        }
      }
    }
  }

  // ECN & Spec Extraction
  const isEcnQuery = /ecn|thay đổi|biến động|đổi|thay|ảnh hưởng|tác động|工程变更|变更影响|如果|改为|换成|变成|修改为|更换|修改规格|有什么影响|影响什么|影响哪些/iu.test(text);
  const relativeChange = parseRelativeChange(text);
  const specReplacement = parseExplicitSpecReplacement(text);
  const oldSpec = specReplacement ? specReplacement.oldSpec : '';
  const newSpec = specReplacement ? specReplacement.newSpec : '';
  const knownSpecs = extractKnownSpecs(text);
  const singleSpec = (!oldSpec && knownSpecs.length === 1) ? knownSpecs[0].canonical : '';
  const componentMatched = PRODUCT_BOM_COMPONENT_PATTERN.test(text) || Boolean(oldSpec) || Boolean(singleSpec);

  const structureMappingPattern = /展开|折弯|u形|映射|结构|内衬管|连接管|连接件|包装规则|包装对象|贴附规则|贴附对象|pe袋|đóng\s*gói|quy\s*tắc\s*đóng\s*gói|c[nơ]c|khung\s*u|u\s*hình|mapping|bent\s*frame|packaging/i;
  if (productIds.length === 1 && structureMappingPattern.test(text) && tools.has('get_structure_mapping')) {
    return result('structure_mapping', { ...entities, searchQuery: text }, 'get_structure_mapping');
  }

  const isWhereUsedQuery = (MATERIAL_USAGE_PATTERN.test(text) || (
    /dùng ở đâu|ở đâu|在哪里|where used/i.test(text) && materialIds.length === 1
  )) && !isEcnQuery && !relativeChange && !newSpec;
  if (isWhereUsedQuery && materialIds.length === 1 && tools.has('where_used')) {
    return result(PDM_INTENTS.MATERIAL_USAGE, entities, 'where_used');
  }

  if (revisions.length === 2 && tools.has('compare_revisions')) {
    return result(PDM_INTENTS.REVISION_COMPARE, { ...entities, revisions }, 'compare_revisions');
  }

  const isComponentUsageCompare = /dùng\s+(?:loại|ốc|vải|ngăn\s+kéo|khung|mã|gì)|xài\s+(?:loại|ốc|vải|ngăn\s+kéo|khung|mã|gì)|dùng\s+ốc|dùng\s+ngăn\s+kéo|dùng\s+khung|dùng\s+thùng|dùng\s+vải|xài\s+ốc|xài\s+ngăn\s+kéo|xài\s+khung|xài\s+thùng|xài\s+vải/iu.test(text);

  const isComparisonQuery = productIds.length >= 2 && !(refRes && refRes.resolvedType === 'material') && (
    INTENT_PATTERNS.comparison.test(text) ||
    COMPARISON_FOLLOW_UP_PATTERN.test(text) ||
    FOLDED_COMPARISON_PATTERN.test(foldedText) ||
    isComponentUsageCompare ||
    Boolean(activeConcept && activeMetric) ||
    Boolean(extractedColor) ||
    normState.activeTask === 'bom_compare' ||
    directProductIds.length >= 2 ||
    /dùng chung|xài chung|giống nhau|khác nhau|so sánh|đối chiếu|so\s+với|so\s+\d+|共用|不同|区别|对比|比较|一样|一样不一样|bom|物料|五金|螺丝|cái gì|\bvs\b|\bv\.s\b|với|và|&|khác|lắp vừa|lắp cho|dùng cho/i.test(text)
  ) && !/bán chạy|doanh thu|sales|bán được|đắt hơn|rẻ hơn|giá/i.test(text);

  // 5. BOM Candidate Ordinal Routing
  const explicitProductInQuery = PRODUCT_PATTERN.test(text);
  PRODUCT_PATTERN.lastIndex = 0;
  const selectedBomCandidate = !explicitProductInQuery
    ? selectBomCandidate(text, transitionedState.referents.bomCandidates, null)
    : null;
  if (selectedBomCandidate && transitionedState.scope.productIds.length === 1 && tools.has('get_bom')) {
    return result(
      PDM_INTENTS.BOM_LOOKUP,
      { productIds: transitionedState.scope.productIds, componentQuery: selectedBomCandidate.matCode },
      'get_bom',
    );
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

  // 6. ECN Impact & Relative Changes
  const isScopeSwitched = queryProductIds.length > 0 && (
    queryProductIds.length !== normState.scope.productIds.length ||
    queryProductIds.some((id, idx) => id !== normState.scope.productIds[idx])
  );
  const inheritedMaterialId = isScopeSwitched ? null : transitionedState.focus.materialId;

  if (isEcnQuery && relativeChange && tools.has('analyze_ecn_impact')) {
    if (isScopeSwitched && !materialIds[0] && !oldSpec && !singleSpec) {
      return ambiguous({
        ...entities,
        change: relativeChange,
      }, 'scope_switched_material_lost');
    }

    let targetMat = materialIds[0] || oldSpec || singleSpec || inheritedMaterialId || '';
    if (!targetMat) {
      const refExpr = extractReferenceExpressions(text);
      if (refExpr) {
        const refRes = resolveReferences({
          referenceExpr: refExpr,
          state: transitionedState,
          expectedType: 'material',
          semanticFocus: activeConcept,
        });
        if (refRes.needsClarification) {
          return ambiguous({
            ...entities,
            change: relativeChange,
            candidates: refRes.candidates || [],
          }, refRes.clarificationCode || 'ambiguous_material_reference', refRes.candidates || []);
        }
        if (refRes.resolved) {
          targetMat = refRes.resolved.id || refRes.resolved.mat_code || refRes.resolved;
        }
      }
    }

    if (!targetMat) {
      return ambiguous({
        ...entities,
        change: relativeChange,
      }, 'target_not_specified');
    }

    return result(PDM_INTENTS.ECN_IMPACT, {
      ...entities,
      targetMaterialId: targetMat,
      componentConcept: activeConcept || 'fastener',
      change: relativeChange,
      searchQuery: text,
    }, 'analyze_ecn_impact');
  }

  if (isEcnQuery && (materialIds.length >= 1 || componentMatched) && tools.has('analyze_ecn_impact')) {
    const targetMaterialId = materialIds[0] || oldSpec || singleSpec || '';
    if (targetMaterialId) {
      return result(PDM_INTENTS.ECN_IMPACT, {
        ...entities,
        targetMaterialId,
        ...(newSpec ? { newSpec } : {}),
        searchQuery: text,
      }, 'analyze_ecn_impact');
    }
  }

  if (MATERIAL_DETAIL_PATTERN.test(text) && materialIds.length === 1 && tools.has('get_material')) {
    return result(PDM_INTENTS.MATERIAL_DETAIL, entities, 'get_material');
  }

  if (refExpr && !isEcnQuery && !isComparisonQuery && materialIds.length === 1 && tools.has('get_material')) {
    return result(PDM_INTENTS.MATERIAL_DETAIL, { ...entities, targetMaterialId: materialIds[0] }, 'get_material');
  }

  if (INTENT_PATTERNS.marketplace.test(text)) {
    if (productIds.length === 1 && tools.has('get_marketplace_insights')) {
      return result(PDM_INTENTS.MARKETPLACE, entities, 'get_marketplace_insights');
    }
    if (tools.has('analyze_pdm')) {
      return result(PDM_INTENTS.CATALOG_ANALYSIS, { ...entities, searchQuery: text }, 'analyze_pdm');
    }
  }

  const requestedConcept = resolveConcept(text);
  const basicBomConcept = [
    'drawer_fabric',
    'hardware_bag',
    'upper_crossbar',
    'bottom_crossbar',
    'crossbar',
    'vertical_beam',
    'packaging_carton',
    'packaging_material',
    'drawer_bottom',
  ].includes(requestedConcept?.conceptId) || /\u5305\u6750|\u5305\u88c5/u.test(text);

  if (
    SPECIFICATION_ONLY_FOLLOW_UP_PATTERN.test(text)
    && priorSearchQuery
    && tools.has('analyze_pdm')
  ) {
    return result(
      PDM_INTENTS.CATALOG_ANALYSIS,
      { ...entities, searchQuery: `${priorSearchQuery} ${text}` },
      'analyze_pdm',
    );
  }

  if (
    productIds.length >= 2
    && ['crossbar', 'upper_crossbar', 'bottom_crossbar', 'vertical_beam'].includes(requestedConcept?.conceptId)
    && tools.has('analyze_pdm')
  ) {
    return result(PDM_INTENTS.CATALOG_ANALYSIS, { ...entities, productIds: productIds.slice(0, 2), searchQuery: text }, 'analyze_pdm');
  }

  if (
    isComparisonQuery
    && tools.has('compare_boms')
  ) {
    return result(PDM_INTENTS.BOM_COMPARE, {
      ...entities,
      productIds: productIds.slice(0, 2),
      ...(activeConcept ? { componentConcept: activeConcept } : {}),
      ...(activeMetric ? { metric: activeMetric } : {}),
    }, 'compare_boms');
  }

  if (
    tools.has('analyze_pdm')
    && (PRODUCT_FILTER_PATTERN.test(text) || (productIds.length === 0 && PRODUCT_SINGLE_DIMENSION_PATTERN.test(text)))
  ) {
    return result(PDM_INTENTS.CATALOG_ANALYSIS, { ...entities, searchQuery: text }, 'analyze_pdm');
  }

  if (
    productIds.length === 1
    && (PRODUCT_BOM_COMPONENT_PATTERN.test(text) || basicBomConcept || Boolean(singleSpec) || knownSpecs.length > 0 || FOLDED_COMPONENT_LOOKUP_PATTERN.test(foldedText))
    && (!detectProductShorthand(text) || PRODUCT_BOM_COMPONENT_PATTERN.test(text) || Boolean(singleSpec) || knownSpecs.length > 0)
    && !PRODUCT_VARIANT_GAP_PATTERN.test(text)
    && tools.has('get_bom')
  ) {
    return result(PDM_INTENTS.BOM_LOOKUP, { ...entities, componentQuery: text }, 'get_bom');
  }

  if (productIds.length < 2 && tools.has('analyze_pdm') && detectProductShorthand(text) && !PRODUCT_DETAIL_PATTERN.test(text) && !singleSpec && knownSpecs.length === 0) {
    return result(PDM_INTENTS.CATALOG_ANALYSIS, { ...entities, searchQuery: text }, 'analyze_pdm');
  }

  if (
    tools.has('analyze_pdm') &&
    (
      EXPLICIT_CATALOG_PATTERN.test(text) ||
      VIETNAMESE_CATALOG_PATTERN.test(text) ||
      CATALOG_COMPONENT_QUESTION_PATTERN.test(text) ||
      (
        basicBomConcept &&
        VIETNAMESE_CATALOG_SCOPE_PATTERN.test(foldedText) &&
        VIETNAMESE_PRODUCT_SCOPE_PATTERN.test(foldedText)
      ) ||
      (
        basicBomConcept &&
        productIds.length === 0 &&
        CATALOG_COMPONENT_SCOPE_PATTERN.test(foldedText)
      ) ||
      (
        productIds.length === 0 &&
        !isRecentChanges &&
        GENERIC_CATALOG_MATERIAL_SCOPE_PATTERN.test(foldedText)
      ) ||
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

  if (productIds.length === 1 && revisions.length === 2 && (REVISION_CHANGE_PATTERN.test(text) || isRevisionComparisonFollowUp) && tools.has('compare_revisions')) {
    return result(PDM_INTENTS.REVISION_COMPARE, entities, 'compare_revisions');
  }

  if (
    (INTENT_PATTERNS.revision.test(text) || REVISION_STATUS_PATTERN.test(text) || FOLDED_REVISION_PATTERN.test(foldedText))
    && productIds.length === 1
    && (tools.has('get_revision_history') || tools.has('get_product'))
  ) {
    const prefTool = tools.has('get_revision_history') ? 'get_revision_history' : 'get_product';
    return result(PDM_INTENTS.REVISION_STATUS, entities, prefTool);
  }

  if (
    productIds.length === 1
    && (PRODUCT_DETAIL_PATTERN.test(text) || FOLDED_PRODUCT_DETAIL_PATTERN.test(foldedText) || INTENT_PATTERNS.currentProduct.test(text))
    && !PRODUCT_BOM_COMPONENT_PATTERN.test(text)
    && !INTENT_PATTERNS.bom.test(text)
    && !basicBomConcept
    && !singleSpec
    && knownSpecs.length === 0
    && tools.has('get_product')
  ) {
    return result(PDM_INTENTS.PRODUCT_LOOKUP, entities, 'get_product');
  }

  if (
    INTENT_PATTERNS.bom.test(text) ||
    PRODUCT_SCOPED_LOOKUP_PATTERN.test(text) ||
    PDM_DISCOVERY_PATTERN.test(text) ||
    FOLDED_DISCOVERY_PATTERN.test(foldedText) ||
    FOLDED_COMPONENT_LOOKUP_PATTERN.test(foldedText)
  ) {
    if (productIds.length === 1 && tools.has('get_bom')) {
      const componentQuery = text
        .replace(PRODUCT_PATTERN, ' ')
        .replace(REVISION_PATTERN, ' ')
        .trim();
      return result(
        PDM_INTENTS.BOM_LOOKUP,
        { ...entities, ...(componentQuery ? { componentQuery } : {}) },
        'get_bom',
      );
    }
  }

  if (productIds.length === 1 && (PRODUCT_DETAIL_PATTERN.test(text) || FOLDED_PRODUCT_DETAIL_PATTERN.test(foldedText) || INTENT_PATTERNS.currentProduct.test(text)) && tools.has('get_product')) {
    return result(PDM_INTENTS.PRODUCT_LOOKUP, entities, 'get_product');
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

  if ((DIMENSION_PATTERN.test(text) || PDM_DISCOVERY_PATTERN.test(text) || FOLDED_DISCOVERY_PATTERN.test(foldedText)) && tools.has('search_pdm')) {
    return result(PDM_INTENTS.PDM_SEARCH, {
      ...entities,
      searchQuery: text,
      ...(searchProductId ? { searchProductId } : {}),
    }, 'search_pdm');
  }

  return ambiguous(entities);
}
