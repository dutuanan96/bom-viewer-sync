// src/features/ai-assistant/pdm-terminology.js
// Data-driven terminology, concept mapping, and dimension normalization layer.

const SHORTHAND_PRODUCT_PATTERN = /(?:^|[^\w])(\d{3,4})(?:[^\w]|$)/;
const DIMENSION_PATTERN = /(\d+(?:\.\d+)?)\s*(?:x|\u00d7|\*)\s*(\d+(?:\.\d+)?)(?:\s*(?:x|\u00d7|\*)\s*(\d+(?:\.\d+)?))?\s*(?:mm)?/gi;
const SINGLE_AXIS_PATTERN = /(?:(width|height|depth|长度|宽度|高度|厚度)\s*)?(\d+(?:\.\d+)?)\s*mm/gi;

const CONCEPT_SYNONYMS = Object.freeze({
  bottom_crossbar: {
    canonicalZh: '底部横杆',
    canonicalVi: 'thanh ngang dưới',
    canonicalEn: 'bottom crossbar',
    aliases: ['下横梁', '底部横杆', '下横杆', '底部横梁', 'thanh ngang duoi'],
  },
  drawer_fabric: {
    canonicalZh: '布抽',
    canonicalVi: 'ngăn kéo vải',
    canonicalEn: 'drawer fabric',
    aliases: ['布抽', '布袋', '布兜', 'vải ngăn kéo', 'fabric drawer'],
  },
  hardware_bag: {
    canonicalZh: '五金包',
    canonicalVi: 'túi ngũ kim',
    canonicalEn: 'hardware bag',
    aliases: ['五金包', '螺丝包', '配件包', '五金袋', 'túi phụ kiện', 'túi ngũ kim'],
  },
  metal_frame: {
    canonicalZh: '铁框',
    canonicalVi: 'khung sắt',
    canonicalEn: 'metal frame',
    aliases: ['铁框', '金属框', '支撑框', '侧框', 'khung sắt'],
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

  for (const [conceptId, info] of Object.entries(CONCEPT_SYNONYMS)) {
    if (info.aliases.some(alias => text.includes(alias.toLowerCase()))) {
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
    const axisName = match[1] ? match[1].toLowerCase() : null;
    const value = Number(match[2]);
    let axis = 'unspecified';
    if (axisName) {
      if (['width', '宽度'].includes(axisName)) axis = 'width';
      else if (['height', '高度'].includes(axisName)) axis = 'height';
      else if (['depth', '厚度', '长度'].includes(axisName)) axis = 'depth';
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
