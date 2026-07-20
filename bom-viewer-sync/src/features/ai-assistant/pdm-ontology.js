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
