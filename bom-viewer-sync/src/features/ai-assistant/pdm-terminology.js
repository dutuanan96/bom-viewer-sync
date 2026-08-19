// src/features/ai-assistant/pdm-terminology.js
// Data-driven terminology, concept mapping, and dimension normalization layer.

const SHORTHAND_PRODUCT_PATTERN = /(?:^|[^\w])(\d{3,4})(?:[^\w]|$)/;
const DIMENSION_PATTERN = /(\d+(?:\.\d+)?)\s*(?:x|\u00d7|\*)\s*(\d+(?:\.\d+)?)(?:\s*(?:x|\u00d7|\*)\s*(\d+(?:\.\d+)?))?\s*(?:mm)?/gi;
const SINGLE_AXIS_PATTERN = /(?:(width|height|depth|长度|宽度|高度|厚度)\s*(\d+(?:\.\d+)?)\s*(?:mm)?|(\d+(?:\.\d+)?)\s*(mm|宽|高|深|长))/gi;

export function foldPdmText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/gi, letter => letter === '\u0110' ? 'D' : 'd')
    .toLowerCase();
}

const CONCEPT_SYNONYMS = Object.freeze({
  bottom_crossbar: {
    canonicalZh: '底部横杆',
    canonicalVi: 'thanh ngang dưới',
    canonicalEn: 'bottom crossbar',
    aliases: ['下横梁', '底部横杆', '下横杆', '底部横梁', '\u4e0b\u6a2a\u6881(\u65e0\u5b54)', 'thanh ngang duoi'],
  },
  upper_crossbar: {
    canonicalZh: '上横梁',
    canonicalVi: 'thanh ngang trên',
    canonicalEn: 'upper crossbar',
    aliases: ['上横梁', '顶部横梁', '顶部横杆', '上横杆', '\u4e0a\u6a2a\u6881\u524d(\u6709\u5b54)', '\u4e0a\u6a2a\u6881\u540e(\u6709\u5b54)', '\u4e0a\u6a2a\u6881\u524d(2\u5b54)', '\u4e0a\u6a2a\u6881\u540e(2\u5b54)', '\u4e0a\u6a2a\u6881(2\u5b54)', 'upper crossbar', 'thanh ngang trên'],
  },
  crossbar: {
    canonicalZh: '\u6a2a\u6746',
    canonicalVi: 'thanh ngang',
    canonicalEn: 'crossbar',
    aliases: ['\u6a2a\u6881', '\u6a2a\u6746', 'crossbar', 'thanh ngang'],
  },
  drawer_fabric: {
    canonicalZh: '布抽',
    canonicalVi: 'ngăn kéo vải',
    canonicalEn: 'drawer fabric',
    searchAliases: ['\u5e03\u62bd\u5c49', '\u5e03\u62bd\u76d2', '\u8f6f\u62bd', '\u6298\u53e0\u62bd', '\u5c0f\u5e03\u62bd', '\u4e2d\u5e03\u62bd', '\u5927\u5e03\u62bd', 'fabric bin', 'fabric basket', 'ng\u0103n k\u00e9o v\u1ea3i', 'h\u1ed9p k\u00e9o v\u1ea3i', 'gi\u1ecf v\u1ea3i'],
    aliases: ['布抽', '布袋', '布兜', 'vải ngăn kéo', 'fabric drawer', 'túi vải', 'tui vai'],
  },
  drawer_bottom: {
    canonicalZh: '布抽底板',
    canonicalVi: 'đáy túi',
    canonicalEn: 'fabric drawer bottom',
    aliases: ['布抽底板', '抽屉底板', 'đáy túi', 'day tui', 'fabric drawer bottom', 'drawer bottom'],
  },
  hardware_bag: {
    canonicalZh: '五金包',
    canonicalVi: 'túi ngũ kim',
    canonicalEn: 'hardware bag',
    searchAliases: ['\u5de5\u5177\u5305', '\u87ba\u4e1d\u888b', '\u914d\u4ef6\u888b', 'screw bag', 'fastener bag', 't\u00fai \u1ed1c v\u00edt', 't\u00fai d\u1ee5ng c\u1ee5'],
    aliases: ['五金包', '螺丝包', '配件包', '五金袋', 'túi phụ kiện', 'túi ngũ kim'],
  },
  metal_frame: {
    canonicalZh: '铁框',
    canonicalVi: 'khung sắt',
    canonicalEn: 'metal frame',
    aliases: ['铁框', '金属框', '支撑框', '侧框', 'khung sắt'],
  },
  vertical_beam: {
    canonicalZh: '竖梁',
    canonicalVi: 'thanh đứng',
    canonicalEn: 'vertical beam',
    aliases: ['竖梁', '中竖梁', '竖零件', 'vertical beam', 'thanh đứng'],
  },
  packaging_carton: {
    canonicalZh: '纸箱',
    canonicalVi: 'thùng carton',
    canonicalEn: 'carton',
    searchAliases: ['\u5916\u7bb1', '\u5185\u7bb1', '\u4e2d\u5c01\u7bb1', '\u5e73\u53e3\u7bb1', 'outer carton', 'inner carton', 'th\u00f9ng ngo\u00e0i', 'th\u00f9ng trong'],
    aliases: ['纸箱', '纸盒', 'carton', 'cardboard box', 'thùng carton', 'thùng giấy', 'hộp giấy', 'thùng bìa', 'carton giấy', 'thung carton', 'thung giay', 'hop giay', 'thung bia', 'carton giay'],
  },
  packaging_material: {
    canonicalZh: '\u5305\u6750',
    canonicalVi: 'v\u1eadt li\u1ec7u \u0111\u00f3ng g\u00f3i',
    canonicalEn: 'packaging material',
    aliases: ['\u5305\u6750', '\u5305\u88c5\u6750\u6599', '\u5305\u88c5\u4ef6', 'packaging', 'packing material', 'v\u1eadt li\u1ec7u \u0111\u00f3ng g\u00f3i', 'bao b\u00ec', 'vat lieu dong goi', 'bao bi'],
    searchAliases: ['\u7eb8\u7bb1', '\u7eb8\u5361', '\u6ce1\u6cab', '\u62a4\u89d2', '\u80f6\u888b', '\u80f6\u5e26', '\u73cd\u73e0\u68c9', '\u5e72\u71e5\u5242', '\u624e\u5e26', '\u6253\u5305\u5e26', '\u5851\u6599\u888b', 'pe\u888b', 'foam', 'corner protector', 'paper card'],
  },
  cabinet: {
    canonicalZh: '柜子',
    canonicalVi: 'tủ',
    canonicalEn: 'cabinet',
    aliases: ['柜子', '床头柜', '抽屉柜', 'tủ', 'cabinet'],
  },
  panel: {
    canonicalZh: '板件',
    canonicalVi: 'v\u00e1n g\u1ed7',
    canonicalEn: 'panel',
    aliases: ['\u677f\u4ef6', '\u6728\u677f', 'panel', 'board', 'v\u00e1n g\u1ed7', 't\u1ea5m g\u1ed7'],
    searchAliases: ['\u9876\u677f', '\u5e95\u677f', '\u4fa7\u677f', '\u5c42\u677f', '\u9762\u677f', '\u95e8\u677f', '\u9694\u677f', '\u62bd\u5c49\u9762\u677f', '\u80cc\u677f'],
  },
  hardware: {
    canonicalZh: '五金',
    canonicalVi: 'ng\u0169 kim',
    canonicalEn: 'hardware',
    aliases: ['\u4e94\u91d1', 'hardware', 'ng\u0169 kim', 'ph\u1ee5 ki\u1ec7n'],
    searchAliases: ['\u87ba\u4e1d', '\u87ba\u6bcd', '\u87ba\u6813', '\u6ed1\u8f68', '\u94f0\u94fe', '\u62c9\u624b', '\u811a\u57ab', '\u6273\u624b', '\u516d\u89d2\u5319'],
  },
  metal_tube: {
    canonicalZh: '铁件',
    canonicalVi: 'linh kiện sắt',
    canonicalEn: 'metal part',
    aliases: ['铁件', '管材', 'metal part', 'metal tube', 'linh kiện sắt', 'ống sắt'],
    searchAliases: ['铁管', '方管', '圆管', '铁网', '网架'],
  },
  fastener: {
    canonicalZh: '螺丝紧固件',
    canonicalVi: 'ốc vít',
    canonicalEn: 'fastener',
    aliases: ['螺丝', '螺钉', '螺母', 'ốc', 'vít', 'ốc vít', 'bu lông', 'bulong', 'screw', 'screws', 'bolt', 'bolts', 'fastener', 'fasteners', 'oc', 'vit', 'oc vit'],
    searchAliases: ['螺丝', '螺钉', '螺母', '外六角螺丝', '内六角螺丝', '平头螺丝', '自攻螺丝', 'screw', 'bolt'],
  },
});

/**
 * Detect if text contains a standalone 3-4 digit product number (e.g. "723" -> LGS723).
 */
export function detectProductShorthand(query = '') {
  const text = String(query).trim();
  // If user already wrote LGS prefix, it's not an ambiguous shorthand
  if (/\bLGS\d{3,4}\b/i.test(text)) return null;

  // Strip dimension expressions so numbers in 460x282x187 or 290mm are not misidentified as product shorthands
  const textClean = text.replace(DIMENSION_PATTERN, ' ').replace(SINGLE_AXIS_PATTERN, ' ');

  const match = textClean.match(SHORTHAND_PRODUCT_PATTERN);
  if (!match) return null;

  const digits = match[1];
  const candidateProductId = `LGS${digits}`;
  return {
    isShorthand: true,
    userNumber: digits,
    candidateProductId,
    confirmationPrompt: `Do you mean ${candidateProductId}?`,
  };
}

/**
 * Resolve all matching terminology concepts for a given term or text fragment.
 */
export function resolveConcepts(term = '') {
  const text = String(term).trim().toLowerCase();
  if (!text) return [];
  const foldedText = foldPdmText(text);

  const matchedConcepts = [];
  for (const [conceptId, info] of Object.entries(CONCEPT_SYNONYMS)) {
    const aliases = [...info.aliases, ...(info.searchAliases || [])];
    if (aliases.some(alias => text.includes(alias.toLowerCase()) || foldedText.includes(foldPdmText(alias)))) {
      matchedConcepts.push({
        conceptId,
        canonicalZh: info.canonicalZh,
        canonicalVi: info.canonicalVi,
        canonicalEn: info.canonicalEn,
        confidence: 'candidate',
      });
    }
  }
  return matchedConcepts;
}

/**
 * Resolve terminology concept for a given term or text fragment (returns first match).
 */
export function resolveConcept(term = '') {
  return resolveConcepts(term)[0] || null;
}

export function componentSearchTerms(query = '') {
  const concepts = resolveConcepts(query);
  if (concepts.length === 0) return [];
  const allAliases = concepts.flatMap(concept => {
    const info = CONCEPT_SYNONYMS[concept.conceptId];
    return [...(info.aliases || []), ...(info.searchAliases || [])];
  });
  return [...new Set(allAliases)];
}

/**
 * Parse structured dimensions from query supporting x, ×, * and optional mm.
 */
export function parseDimensions(query = '') {
  const text = String(query).normalize('NFKC').trim();
  const results = [];

  // Match 2D/3D composite dimensions e.g. 460x282x187mm or 460*282
  let match;
  const compRegex = new RegExp(DIMENSION_PATTERN);
  while ((match = compRegex.exec(text)) !== null) {
    const numbers = [match[1], match[2], match[3]].filter(Boolean).map(Number);
    results.push({
      raw: match[0],
      numbers,
      type: numbers.length === 3 ? '3d' : '2d',
      axisConfidence: 'composite',
    });
  }

  if (results.length > 0) return results;

  // Match single axis dimension e.g. 宽度290mm or 高度657mm or 290mm
  const singleRegex = new RegExp(SINGLE_AXIS_PATTERN);
  while ((match = singleRegex.exec(text)) !== null) {
    const axisName = (match[1] || match[4] || '').toLowerCase() || null;
    const value = Number(match[2] || match[3]);
    let axis = 'unspecified';
    if (axisName) {
      if (['width', '宽度', '宽'].includes(axisName)) axis = 'width';
      else if (['height', '高度', '高'].includes(axisName)) axis = 'height';
      else if (['depth', '厚度', '长度', '深', '长'].includes(axisName)) axis = 'depth';
    }
    results.push({
      raw: match[0],
      numbers: [value],
      type: '1d',
      axis,
      axisConfidence: axis !== 'unspecified' ? 'explicit' : 'unspecified',
    });
  }

  return results;
}

/**
 * Check if a dimension query matches exact or near values in dataset.
 * e.g. 657mm requested vs 659mm nearby.
 */
export function checkDimensionProximity(targetValue, datasetValues = []) {
  if (typeof targetValue !== 'number' || !Array.isArray(datasetValues)) {
    return { exactMatches: [], nearMatches: [], promptClarification: false };
  }

  const exactMatches = datasetValues.filter(val => Math.abs(val - targetValue) < 0.01);
  const nearMatches = datasetValues.filter(val => {
    const diff = Math.abs(val - targetValue);
    return diff > 0.01 && diff <= 5.0; // Within 5mm difference
  });

  return {
    exactMatches,
    nearMatches,
    promptClarification: exactMatches.length === 0 && nearMatches.length > 0,
    clarificationPrompt: nearMatches.length > 0
      ? `No exact match for ${targetValue}mm, but nearby value(s) ${nearMatches.join(', ')}mm exist. Did you mean exact ${targetValue}mm or approximate matching?`
      : null,
  };
}

/**
 * Extract component concept from unstructured text.
 */
export function extractComponentConcept(text = '') {
  const t = String(text).toLowerCase();
  const folded = foldPdmText(t);
  if (/\b(?:ốc|vít|bu lông|bulong|ốc vít|screws?|bolts?|fasteners?)\b|螺丝|螺钉|螺母|五金件/iu.test(t) || /\b(?:oc|vit|oc vit|bu long)\b/iu.test(folded)) {
    return 'fastener';
  }
  if (/\b(?:ngăn kéo|túi vải|hộc kéo|drawers?|fabric drawers?)\b|布抽|抽屉/iu.test(t) || /\b(?:ngan keo|tui vai|hoc keo)\b/iu.test(folded)) {
    return 'drawer_fabric';
  }
  if (/\b(?:túi ngũ kim|túi phụ kiện|hardware bags?)\b|五金包|配件包/iu.test(t) || /\b(?:tui ngu kim|tui phu kien)\b/iu.test(folded)) {
    return 'hardware_bag';
  }
  if (/\b(?:thanh ngang|thanh giằng|crossbars?)\b|横梁|上横梁|下横梁/iu.test(t) || /\b(?:thanh ngang|thanh giang)\b/iu.test(folded)) {
    return 'crossbar';
  }
  if (/\b(?:thanh đứng|cột đứng|vertical beams?|columns?)\b|竖梁|立柱/iu.test(t) || /\b(?:thanh dung|cot dung)\b/iu.test(folded)) {
    return 'vertical_beam';
  }
  if (/\b(?:thùng|hộp|bao bì|cartons?|packages?)\b|纸箱|包材|外箱/iu.test(t) || /\b(?:thung|hop|bao bi)\b/iu.test(folded)) {
    return 'packaging_carton';
  }
  return null;
}

/**
 * Extract comparison / lookup metric from unstructured text.
 */
export function extractMetric(text = '') {
  const t = String(text).toLowerCase();
  const folded = foldPdmText(t);

  // 1. similarity_ratio (e.g. "giống nhau bao nhiêu %", "相似度", "similarity")
  if (
    /giống nhau.{0,15}(?:bao nhiêu\s*%|mấy\s*%)|similarity|相似度|trùng nhau.{0,15}%|bao nhiêu\s*%/iu.test(t) ||
    /giong nhau.{0,15}(?:bao nhieu\s*%|may\s*%)|bao nhieu\s*%/iu.test(folded)
  ) {
    return 'similarity_ratio';
  }

  // 2. difference_count (e.g. "khác nhau bao nhiêu", "mấy điểm khác", "多少.*不同")
  if (
    /khác nhau.{0,15}bao nhiêu|mấy điểm khác|bao nhiêu điểm khác|多少.*不同|几处不同|how many differences/iu.test(t) ||
    /khac nhau.{0,15}bao nhieu|may diem khac|bao nhieu diem khac/iu.test(folded)
  ) {
    return 'difference_count';
  }

  // 3. total_quantity (e.g. "tốn ốc", "nhiều ốc hơn", "dùng nhiều hơn", "多少螺丝", "how many screws")
  if (
    /tốn|nhiều hơn|ít hơn|bao nhiêu ốc|nhiều ốc|ít ốc|số lượng|多|少|多少螺丝|用得多|用得少|数量|more screws|fewer screws|how many screws|total quantity|quantity/iu.test(t) ||
    /ton|nhieu hon|it hon|bao nhieu oc|nhieu oc|it oc|so luong/iu.test(folded)
  ) {
    return 'total_quantity';
  }

  // 4. commonality (e.g. "dùng chung", "共用")
  if (
    /chung|dùng chung|xài chung|tương thích|giao nhau|共用|通用|互换|common|shared|interchangeable/iu.test(t) ||
    /chung|dung chung|xai chung|tuong thich/iu.test(folded)
  ) {
    return 'commonality';
  }

  // 5. difference (e.g. "khác nhau", "不同")
  if (
    /khác|khác nhau|lệch|chênh lệch|phân biệt|不同|差异|区别|different|difference/iu.test(t) ||
    /khac|khac nhau|lech|chenh lech/iu.test(folded)
  ) {
    return 'difference';
  }

  return null;
}

/**
 * Parse relative change expressions (e.g. "dài hơn 3 li", "tăng 3mm", "加长3mm").
 */
export function parseRelativeChange(text = '') {
  const t = String(text).toLowerCase();
  const match = t.match(/(?:dài hơn|ngắn hơn|tăng|giảm|加长|缩短|增加|减少|thêm|bớt)\s*(\d+(?:\.\d+)?)\s*(mm|li|cm|毫米)?|(\+|-)\s*(\d+(?:\.\d+)?)\s*(mm|li|cm|毫米)?/iu);
  if (match) {
    const rawVal = parseFloat(match[1] || match[4]);
    let unit = (match[2] || match[5] || 'mm').toLowerCase();
    let valInMm = rawVal;
    if (unit === 'li' || unit === '毫米') valInMm = rawVal;
    if (unit === 'cm') valInMm = rawVal * 10;
    
    const isDecrease = /ngắn hơn|giảm|缩短|减少|bớt|-/iu.test(match[0]);
    const operator = 'delta';
    const deltaValue = isDecrease ? -valInMm : valInMm;

    return {
      field: 'length',
      operator,
      value: deltaValue,
      unit: 'mm',
    };
  }
  return null;
}
