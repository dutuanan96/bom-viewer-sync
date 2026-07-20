export const CONFIRMED_MARKETPLACE_ALIASES = Object.freeze({
  ULGS433BH02S: Object.freeze({
    marketplaceModel: 'ULGS433BH02S',
    internalSku: 'LGS433BH02S',
    productCode: 'LGS433',
    color: 'black',
  }),
});

const CONFIRMED_ASINS = Object.freeze({
  B0GTZDGNGN: Object.freeze({
    asin: 'B0GTZDGNGN',
    marketplaceModel: 'ULGS433BH02S',
    internalSku: 'LGS433BH02S',
    productCode: 'LGS433',
    color: 'black',
    sourceUrl: 'https://www.amazon.com/dp/B0GTZDGNGN',
    status: 'user-confirmed',
    canonicalPdm: false,
  }),
});

const TAXONOMY = Object.freeze([
  ['assembly-instructions', /assembl|instruction|manual|screw|install/i],
  ['missing-damaged-parts', /missing|damaged|broken|bent|crack/i],
  ['packaging-shipping', /packag|shipping|delivery|box/i],
  ['stability-safety', /unstable|stability|wobbl|tip|safety|unsafe/i],
  ['drawer-fit-operation', /drawer|slide|open|close|rail|track/i],
  ['electronics', /\bled\b|outlet|charging|charger|power|usb/i],
  ['dimensions-fit', /dimension|size|height|width|depth|fit/i],
  ['finish-appearance', /paint|finish|color|scratch|appearance|chip/i],
  ['odor-material', /odor|smell|material|fabric|wood/i],
  ['durability-wear', /durab|wear|tear|loose|lasting/i],
]);

function normalizeText(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function contentHash(text) {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function classify(text) {
  return TAXONOMY.filter(([, pattern]) => pattern.test(text)).map(([category]) => category);
}

export function resolveMarketplaceAlias(value) {
  const alias = CONFIRMED_MARKETPLACE_ALIASES[String(value || '').trim().toUpperCase()];
  if (!alias) throw new Error(`Unknown or unconfirmed marketplace alias: ${value}`);
  return { ...alias };
}

export function lookupMarketplaceAsin(value) {
  const record = CONFIRMED_ASINS[String(value || '').trim().toUpperCase()];
  if (!record) throw new Error(`Unknown or unconfirmed ASIN: ${value}`);
  return { ...record };
}

export function validateMarketplaceSearch({ domain, query, maxResults = 5 } = {}) {
  const normalizedDomain = String(domain || '').toLowerCase();
  if (normalizedDomain !== 'amazon.com' && normalizedDomain !== 'www.amazon.com') {
    throw new Error('Marketplace search domain must be amazon.com');
  }
  if (typeof query !== 'string' || !query.trim() || query.length > 500) throw new Error('Marketplace search query is invalid');
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 5) throw new Error('Marketplace search result limit must be between 1 and 5');
  return { query: query.trim(), allowedDomains: ['amazon.com'], maxResults };
}

export function importMarketplaceReviews({ marketplaceModel, asin, sourceUrl, capturedAt, reviews } = {}) {
  resolveMarketplaceAlias(marketplaceModel);
  const asinRecord = lookupMarketplaceAsin(asin);
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:' || !/(^|\.)amazon\.com$/i.test(url.hostname)) throw new Error('Review source must be an HTTPS Amazon URL');
  if (!Array.isArray(reviews) || reviews.length === 0 || reviews.length > 500) throw new Error('Reviews must be a non-empty bounded array');

  const seen = new Set();
  const evidence = [];
  for (const review of reviews) {
    const normalized = normalizeText(review?.text);
    if (!normalized) continue;
    const hash = contentHash(normalized);
    if (seen.has(hash)) continue;
    seen.add(hash);
    evidence.push({
      schemaVersion: 1,
      id: String(review.id || `review_${hash.slice(-8)}`),
      marketplace: 'amazon.com',
      marketplaceModel,
      asin: asinRecord.asin,
      productCode: asinRecord.productCode,
      sourceUrl: url.toString(),
      capturedAt: String(capturedAt || new Date().toISOString()),
      contentHash: hash,
      status: 'observed',
      categories: classify(normalized),
      text: String(review.text),
    });
  }

  const counts = new Map();
  for (const item of evidence) {
    for (const category of item.categories) counts.set(category, (counts.get(category) || 0) + 1);
  }
  const themes = [...counts.entries()].map(([category, count]) => ({
    category,
    count,
    status: count >= 2 ? 'repeated' : 'observed',
  })).sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));

  return { evidence, themes };
}

export function getMarketplaceInsights({ productCode, evidence = [] } = {}) {
  if (typeof productCode !== 'string' || !productCode) throw new Error('productCode is required');
  const themes = evidence.filter((item) => item && typeof item.category === 'string');
  const possibleBomCandidates = themes.map((theme) => ({
    category: theme.category,
    signalStatus: theme.status === 'repeated' ? 'repeated' : 'observed',
    claimType: 'hypothesis',
    statement: `External ${theme.category} signals may justify reviewing related ${productCode} BOM items. Internal evidence is required before assigning a cause.`,
  }));
  return {
    productCode,
    evidenceState: themes.some((theme) => theme.status === 'repeated') ? 'repeated' : 'observed',
    possibleBomCandidates,
    rootCauseStatus: 'not-verified',
  };
}
