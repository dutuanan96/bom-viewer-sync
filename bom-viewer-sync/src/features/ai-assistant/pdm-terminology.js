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
    searchAliases: ['\u7eb8\u7bb1', '\u7eb8\u5361', '\u6ce1\u6cab', '\u62a4\u89d2', '\u80f6\u888b', 'foam', 'corner protector', 'paper card'],
  },
  cabinet: {
    canonicalZh: '柜子',
    canonicalVi: 'tủ',
    canonicalEn: 'cabinet',
    aliases: ['柜子', '床头柜', '抽屉柜', 'tủ', 'cabinet'],
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
 * Resolve terminology concept for a given term or text fragment.
 */
export function resolveConcept(term = '') {
  const text = String(term).trim().toLowerCase();
  if (!text) return null;
  const foldedText = foldPdmText(text);

  for (const [conceptId, info] of Object.entries(CONCEPT_SYNONYMS)) {
    const aliases = [...info.aliases, ...(info.searchAliases || [])];
    if (aliases.some(alias => text.includes(alias.toLowerCase()) || foldedText.includes(foldPdmText(alias)))) {
      return {
        conceptId,
        canonicalZh: info.canonicalZh,
        canonicalVi: info.canonicalVi,
        canonicalEn: info.canonicalEn,
        confidence: 'candidate',
      };
    }
  }
  return null;
}

export function componentSearchTerms(query = '') {
  const concept = resolveConcept(query);
  if (!concept) return [];
  const info = CONCEPT_SYNONYMS[concept.conceptId];
  return [...new Set([...(info.aliases || []), ...(info.searchAliases || [])])];
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
