const BILINGUAL_FIELDS = Object.freeze(['name', 'material', 'color', 'attr', 'spec']);

export function normalizeBilingualValue(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function createFieldDictionary() {
  return {
    pairs: [],
    zhIndex: new Map(),
    viIndex: new Map(),
    zhOriginals: new Set(),
    viOriginals: new Set(),
  };
}

function addCandidate(index, sourceKey, targetKey, sourceValue, targetValue, materialCode) {
  if (!index.has(sourceKey)) index.set(sourceKey, new Map());
  const targets = index.get(sourceKey);
  if (!targets.has(targetKey)) {
    targets.set(targetKey, {
      sourceValue,
      targetValue,
      count: 0,
      materialCodes: new Set(),
    });
  }
  const candidate = targets.get(targetKey);
  candidate.count += 1;
  if (materialCode) candidate.materialCodes.add(materialCode);
}

function publicCandidates(targets, direction) {
  if (!targets) return [];
  return Array.from(targets.values())
    .map((candidate) => ({
      zh: direction === 'zh' ? candidate.sourceValue : candidate.targetValue,
      vi: direction === 'zh' ? candidate.targetValue : candidate.sourceValue,
      count: candidate.count,
      materialCodes: Array.from(candidate.materialCodes).sort().slice(0, 5),
    }))
    .sort((left, right) =>
      right.count - left.count
      || left.zh.localeCompare(right.zh)
      || left.vi.localeCompare(right.vi));
}

/**
 * Builds a read-only bilingual lookup index from canonical Material Master data.
 * The source records are never changed.
 */
export function buildBilingualDictionary(materials) {
  const dictionary = Object.fromEntries(BILINGUAL_FIELDS.map((field) => [field, createFieldDictionary()]));

  for (const record of Object.values(materials || {})) {
    for (const field of BILINGUAL_FIELDS) {
      const zh = String(record?.[field]?.zh || '').trim();
      const vi = String(record?.[field]?.vi || '').trim();
      if (!zh || !vi) continue;

      const fieldDictionary = dictionary[field];
      const zhKey = normalizeBilingualValue(zh);
      const viKey = normalizeBilingualValue(vi);
      const materialCode = String(record?.code || record?.id || '').trim();
      fieldDictionary.zhOriginals.add(zh);
      fieldDictionary.viOriginals.add(vi);
      addCandidate(fieldDictionary.zhIndex, zhKey, viKey, zh, vi, materialCode);
      addCandidate(fieldDictionary.viIndex, viKey, zhKey, vi, zh, materialCode);
    }
  }

  for (const field of BILINGUAL_FIELDS) {
    const fieldDictionary = dictionary[field];
    const seen = new Set();
    for (const candidates of fieldDictionary.zhIndex.values()) {
      for (const candidate of publicCandidates(candidates, 'zh')) {
        const key = `${normalizeBilingualValue(candidate.zh)}\u0000${normalizeBilingualValue(candidate.vi)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        fieldDictionary.pairs.push(candidate);
      }
    }
    fieldDictionary.pairs.sort((left, right) =>
      left.zh.localeCompare(right.zh) || left.vi.localeCompare(right.vi));
  }

  return dictionary;
}

export function lookupCandidates(dict, field, lang, value) {
  const fieldDictionary = dict?.[field];
  const normalized = normalizeBilingualValue(value);
  if (!fieldDictionary || !normalized) return [];
  const index = lang === 'vi' ? fieldDictionary.viIndex : fieldDictionary.zhIndex;
  return publicCandidates(index.get(normalized), lang === 'vi' ? 'vi' : 'zh');
}

export function lookupViFromZh(dict, field, zhValue) {
  const candidates = lookupCandidates(dict, field, 'zh', zhValue);
  return candidates.length === 1 ? candidates[0].vi : null;
}

export function lookupZhFromVi(dict, field, viValue) {
  const candidates = lookupCandidates(dict, field, 'vi', viValue);
  return candidates.length === 1 ? candidates[0].zh : null;
}

export function findCanonicalCandidates(dict, field, rawValue) {
  const candidates = [
    ...lookupCandidates(dict, field, 'zh', rawValue),
    ...lookupCandidates(dict, field, 'vi', rawValue),
  ];
  const unique = new Map();
  for (const candidate of candidates) {
    const key = `${normalizeBilingualValue(candidate.zh)}\u0000${normalizeBilingualValue(candidate.vi)}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return Array.from(unique.values());
}

export function findCanonicalPair(dict, field, rawValue) {
  const candidates = findCanonicalCandidates(dict, field, rawValue);
  return candidates.length === 1 ? candidates[0] : null;
}
