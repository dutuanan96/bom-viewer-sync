const FAMILY_PATTERNS = Object.freeze({
  metal: /\bq(?:195|235|345)\b|stainless\s*steel|carbon\s*steel|\bsteel\b|\biron\b|alum(?:inium|inum)|不锈钢|钢|铁|铝|thép|sắt|nhôm/iu,
  polymer: /\b(?:pp|abs|pvc|pa|pe|pet|nylon)\b|plastic|polymer|塑料|尼龙|nhựa/iu,
  woodComposite: /\b(?:mdf|pb|hdf)\b|particle\s*board|wood|中纤板|刨花板|木|板材|gỗ/iu,
  textile: /fabric|textile|cloth|布|织物|vải/iu,
  packaging: /carton|paper|cardboard|foam|\bepe\b|纸|纸箱|泡沫|包装|bao\s*bì/iu,
});

const INFERRED_METAL_NAME = /螺丝|螺钉|螺栓|螺母|垫圈|扳手|铁片|金属|铰链|screw|bolt|nut|washer|wrench|metal\s*bracket|ốc\s*vít|bu\s*lông|đai\s*ốc/iu;
const SUMMARY_FAMILIES = Object.freeze(['metal', 'polymer', 'woodComposite', 'textile', 'packaging', 'unknown']);

function freezeResult(value) {
  return Object.freeze(value);
}

export function classifyMaterialFamily(row = {}) {
  const material = String(row.materialZh || row.material || '').normalize('NFKC').trim();
  if (material) {
    const matches = Object.entries(FAMILY_PATTERNS)
      .filter(([, pattern]) => pattern.test(material))
      .map(([family]) => family);
    if (matches.length === 1) {
      return freezeResult({ family: matches[0], confidence: 'explicit', evidence: material });
    }
    if (matches.length > 1) {
      return freezeResult({ family: 'unknown', confidence: 'conflict', evidence: material });
    }
  }

  const name = String(row.nameZh || row.nameVi || row.name || '').normalize('NFKC').trim();
  if (name && INFERRED_METAL_NAME.test(name)) {
    return freezeResult({ family: 'metal', confidence: 'inferred', evidence: name });
  }
  return freezeResult({ family: 'unknown', confidence: 'unknown', evidence: '' });
}

export function summarizeMaterialFamilies(rows = []) {
  const summary = Object.fromEntries(SUMMARY_FAMILIES.map(family => [family, { total: 0, explicit: 0, inferred: 0 }]));
  for (const row of rows) {
    const classification = row?.materialFamily || classifyMaterialFamily(row);
    const bucket = summary[classification.family] || summary.unknown;
    bucket.total += 1;
    if (classification.confidence === 'explicit') bucket.explicit += 1;
    if (classification.confidence === 'inferred') bucket.inferred += 1;
  }
  for (const bucket of Object.values(summary)) Object.freeze(bucket);
  return Object.freeze(summary);
}

// ---------------------------------------------------------------------------
// Dynamic Parametric Manufacturing & CNC Tube Cutting Engine
// ---------------------------------------------------------------------------

export const CNC_CLAMPING_STANDARDS = Object.freeze({
  DEFAULT_MIN_CLAMP_WASTE: 70, // Standard minimum tail clamp waste in mm
  ACCEPTABLE_WASTE_MIN: 50,    // Lower operational threshold in mm
  ACCEPTABLE_WASTE_MAX: 110,   // Upper operational threshold in mm
  INNER_SLEEVE_LENGTH: 80,     // Standard reinforcement insert length in mm
  PLUG_FLANGE_OFFSET: 3,       // M6 threaded cap outer thickness in mm
  SPLICED_BEAM_OFFSET: 40,     // Spliced beam cut deduction in mm
});

export function parseRawPipeLength(spec = '') {
  const text = String(spec).normalize('NFKC').trim();
  const match = text.match(/长度\s*(\d+)mm/i);
  return match ? Number(match[1]) : 0;
}

export function parseDimensions(spec = '') {
  const text = String(spec).normalize('NFKC').trim().replace(/[×*]/g, 'x');
  const match = text.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:\.\d+)?))?/i);
  if (!match) return null;
  return {
    d1: Number(match[1]),
    d2: Number(match[2]),
    d3: match[3] ? Number(match[3]) : null,
  };
}

export function calculateDynamicCncCuts(rawPipeLength, cutLength, minClampWaste = CNC_CLAMPING_STANDARDS.DEFAULT_MIN_CLAMP_WASTE) {
  const rawLen = Number(rawPipeLength) || 0;
  const cutLen = Number(cutLength) || 0;
  if (rawLen <= 0 || cutLen <= 0) {
    return freezeResult({ cuts: 0, rate: 0, clampWaste: 0, isShortageRisk: false, status: 'INVALID_INPUT' });
  }

  const cuts = Math.floor((rawLen - minClampWaste) / cutLen);
  const totalCutLength = cuts * cutLen;
  const clampWaste = rawLen - totalCutLength;
  const isShortageRisk = totalCutLength > rawLen || cuts <= 0;
  const rate = cuts > 0 ? Number((1 / cuts).toFixed(6)) : 0;

  const isWasteOptimal = clampWaste >= CNC_CLAMPING_STANDARDS.ACCEPTABLE_WASTE_MIN && clampWaste <= CNC_CLAMPING_STANDARDS.ACCEPTABLE_WASTE_MAX;

  return freezeResult({
    rawPipeLength: rawLen,
    cutLength: cutLen,
    cuts,
    rate,
    clampWaste,
    totalCutLength,
    isShortageRisk,
    isWasteOptimal,
    status: isShortageRisk ? 'SHORTAGE_RISK' : (isWasteOptimal ? 'OPTIMAL' : 'NON_OPTIMAL_WASTE'),
  });
}

export function calculateComponentCutGeometry(spec = '', options = {}) {
  const dims = parseDimensions(spec);
  if (!dims) {
    return freezeResult({ cutLength: 0, formula: 'UNKNOWN', explanation: 'Could not parse dimensions' });
  }

  const { type = 'straight_beam', hasM6Cap = false, hasFlushNut = false } = options;
  const { d1: h, d2: w } = dims;

  switch (type) {
    case 'u_bend': {
      // Inverted U-bend: height * 2 + width
      const cutH = hasM6Cap ? Math.max(0, h - CNC_CLAMPING_STANDARDS.PLUG_FLANGE_OFFSET) : h;
      const cutLength = cutH * 2 + w;
      return freezeResult({
        cutLength,
        formula: hasM6Cap ? `(${h} - 3) * 2 + ${w} = ${cutLength}mm` : `${h} * 2 + ${w} = ${cutLength}mm`,
        explanation: hasM6Cap ? 'U-bend with bottom M6 caps (3mm deduction per arm)' : 'U-bend with flush weld nuts (no deduction)',
      });
    }
    case 'support_frame': {
      // Support frame oriented as [Width]x[Height]x15mm
      const cutLength = w * 2 + h;
      return freezeResult({
        cutLength,
        formula: `${w} * 2 + ${h} = ${cutLength}mm`,
        explanation: 'Support frame U-bend ([Height]*2 + [Width])',
      });
    }
    case 'composite_led_vertical_posts': {
      // 2 vertical posts for LED middle frame
      const singlePost = Math.max(0, h - CNC_CLAMPING_STANDARDS.PLUG_FLANGE_OFFSET);
      const cutLength = singlePost * 2;
      return freezeResult({
        cutLength,
        singlePostLength: singlePost,
        formula: `(${h} - 3) * 2 = ${cutLength}mm (2 posts of ${singlePost}mm)`,
        explanation: '2 vertical posts for composite LED middle frame (with bottom M6 caps)',
      });
    }
    case 'composite_led_cross_bar': {
      // Bottom cross rail for LED middle frame
      const cutLength = Math.max(0, w - 30);
      return freezeResult({
        cutLength,
        formula: `${w} - 30 = ${cutLength}mm`,
        explanation: 'Bottom cross rail for middle frame (width minus 2x15mm side tubes)',
      });
    }
    case 'spliced_beam': {
      // Main tube for spliced longitudinal beam
      const cutLength = Math.max(0, h - CNC_CLAMPING_STANDARDS.SPLICED_BEAM_OFFSET);
      return freezeResult({
        cutLength,
        formula: `${h} - 40 = ${cutLength}mm`,
        explanation: 'Spliced longitudinal beam (nominal minus 40mm sleeve offset)',
      });
    }
    case 'foot': {
      // Foot tube section
      const cutLength = h === 57 ? 41.5 : (h === 70 || h === 80.5 ? 54.0 : (h === 51 ? 51.0 : h));
      return freezeResult({
        cutLength,
        formula: `${cutLength}mm`,
        explanation: `Leveling foot tube cut (${cutLength}mm)`,
      });
    }
    default: {
      return freezeResult({
        cutLength: h,
        formula: `${h}mm`,
        explanation: `Straight profile cut (${h}mm)`,
      });
    }
  }
}

export function findOptimalRawPipe(candidateRawPipes = [], cutLength, minClamp = CNC_CLAMPING_STANDARDS.ACCEPTABLE_WASTE_MIN, maxClamp = CNC_CLAMPING_STANDARDS.ACCEPTABLE_WASTE_MAX) {
  const evaluated = candidateRawPipes.map(pipe => {
    const rawLen = typeof pipe === 'number' ? pipe : parseRawPipeLength(pipe?.spec?.zh || pipe?.spec || '');
    const code = typeof pipe === 'object' ? pipe.code : `PIPE_${rawLen}`;
    const result = calculateDynamicCncCuts(rawLen, cutLength);
    return {
      pipe,
      code,
      rawLen,
      ...result,
      wasteDifferenceFromTarget: Math.abs(result.clampWaste - 70),
    };
  });

  const valid = evaluated.filter(e => !e.isShortageRisk && e.clampWaste >= minClamp && e.clampWaste <= maxClamp);
  valid.sort((a, b) => a.wasteDifferenceFromTarget - b.wasteDifferenceFromTarget || b.cuts - a.cuts);

  return freezeResult({
    optimal: valid[0] || null,
    allEvaluations: evaluated,
  });
}

