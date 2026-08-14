function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[×*]/g, 'x').replace(/\s+/g, ' ').trim();
}

function mappingMatchesProduct(mapping, productId) {
  return mapping.productCodes.includes('*') || mapping.productCodes.includes(productId);
}

function mappingSearchText(mapping) {
  return [mapping.id, mapping.source?.name, mapping.source?.spec, ...(mapping.target?.materialCodes || [])]
    .map(normalize)
    .filter(Boolean)
    .join(' ');
}

function mappingMatchesQuery(mapping, query) {
  const text = normalize(query);
  if (!text) return true;
  const tokens = text.split(/[^\p{L}\p{N}_]+/u).filter(token => token.length >= 2);
  const searchText = mappingSearchText(mapping);
  const numericTokens = tokens.filter(token => /\d/.test(token));
  return numericTokens.every(token => searchText.includes(token))
    && (searchText.includes(text) || tokens.some(token => searchText.includes(token)));
}

function mappingQueryScore(mapping, query) {
  const text = normalize(query);
  if (!text) return 0;
  const searchText = mappingSearchText(mapping);
  const tokens = text.split(/[^\p{L}\p{N}_]+/u).filter(token => token.length >= 2);
  return (searchText.includes(text) ? 100 : 0)
    + tokens.reduce((score, token) => score + (searchText.includes(token) ? (/\d/.test(token) ? 10 : 1) : 0), 0);
}

const MAX_MAPPING_RESULTS = 24;

export function findStructureMappings(mappingPack, { productId, query = '' } = {}) {
  if (!productId || !/^LGS\d{3,4}$/i.test(productId)) throw new Error('A valid productId is required');
  const mappings = Array.isArray(mappingPack?.mappings) ? mappingPack.mappings : [];
  return mappings
    .filter(mapping => mapping?.status === 'confirmed' && mappingMatchesProduct(mapping, productId) && mappingMatchesQuery(mapping, query))
    .sort((left, right) => mappingQueryScore(right, query) - mappingQueryScore(left, query))
    .map(mapping => ({
      id: mapping.id,
      relationship: mapping.relationship,
      source: mapping.source,
      target: mapping.target,
      explanationZh: mapping.explanationZh,
      evidence: mapping.evidence,
      status: mapping.status,
      category: mapping.category || 'structure',
      packagingRuleStatus: mapping.packagingRuleStatus || 'confirmed',
      packagingRule: mapping.packagingRule || null,
    }))
    .slice(0, MAX_MAPPING_RESULTS);
}
