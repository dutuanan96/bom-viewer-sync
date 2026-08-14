function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[×*]/g, 'x').replace(/\s+/g, ' ').trim();
}

function mappingMatchesProduct(mapping, productId) {
  return mapping.productCodes.includes('*') || mapping.productCodes.includes(productId);
}

function mappingMatchesQuery(mapping, query) {
  const text = normalize(query);
  if (!text) return true;
  const terms = [mapping.id, mapping.source?.name, mapping.source?.spec, ...(mapping.target?.materialCodes || [])]
    .map(normalize)
    .filter(Boolean);
  const tokens = text.split(/[^\p{L}\p{N}_]+/u).filter(token => token.length >= 2);
  return terms.some(term => text.includes(term) || term.includes(text) || tokens.some(token => term.includes(token)));
}

const MAX_MAPPING_RESULTS = 24;

export function findStructureMappings(mappingPack, { productId, query = '' } = {}) {
  if (!productId || !/^LGS\d{3,4}$/i.test(productId)) throw new Error('A valid productId is required');
  const mappings = Array.isArray(mappingPack?.mappings) ? mappingPack.mappings : [];
  return mappings
    .filter(mapping => mapping?.status === 'confirmed' && mappingMatchesProduct(mapping, productId) && mappingMatchesQuery(mapping, query))
    .map(mapping => ({
      id: mapping.id,
      relationship: mapping.relationship,
      source: mapping.source,
      target: mapping.target,
      explanationZh: mapping.explanationZh,
      evidence: mapping.evidence,
      status: mapping.status,
    }))
    .slice(0, MAX_MAPPING_RESULTS);
}
