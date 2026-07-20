import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMarketplaceInsights,
  importMarketplaceReviews,
  lookupMarketplaceAsin,
  resolveMarketplaceAlias,
  validateMarketplaceSearch,
} from '../src/features/ai-assistant/marketplace-insights.js';

test('R3.3: exact user-confirmed LGS433 marketplace alias resolves', () => {
  assert.deepEqual(resolveMarketplaceAlias('ULGS433BH02S'), {
    marketplaceModel: 'ULGS433BH02S',
    internalSku: 'LGS433BH02S',
    productCode: 'LGS433',
    color: 'black',
  });
});

test('R3.3: user-confirmed ASIN lookup remains external evidence', () => {
  const result = lookupMarketplaceAsin('B0GTZDGNGN');
  assert.equal(result.productCode, 'LGS433');
  assert.equal(result.status, 'user-confirmed');
  assert.equal(result.canonicalPdm, false);
});

test('R3.3: marketplace web search is Amazon-only and bounded', () => {
  const request = validateMarketplaceSearch({ domain: 'amazon.com', query: 'ULGS433BH02S reviews', maxResults: 5 });
  assert.equal(request.allowedDomains[0], 'amazon.com');
  assert.throws(() => validateMarketplaceSearch({ domain: 'example.com', query: 'x', maxResults: 5 }), /domain/i);
  assert.throws(() => validateMarketplaceSearch({ domain: 'amazon.com', query: 'x', maxResults: 6 }), /result/i);
});

test('R3.3: review import deduplicates evidence and classifies repeated issues', () => {
  const imported = importMarketplaceReviews({
    marketplaceModel: 'ULGS433BH02S',
    asin: 'B0GTZDGNGN',
    sourceUrl: 'https://www.amazon.com/dp/B0GTZDGNGN',
    capturedAt: '2026-07-20T00:00:00.000Z',
    reviews: [
      { id: 'r1', text: 'The drawer does not slide smoothly.' },
      { id: 'r1-copy', text: 'The drawer does not slide smoothly.' },
      { id: 'r2', text: 'Drawer is difficult to open and close.' },
    ],
  });
  assert.equal(imported.evidence.length, 2);
  assert.ok(imported.evidence.every((item) => item.contentHash && item.sourceUrl && item.capturedAt));
  const drawerTheme = imported.themes.find((theme) => theme.category === 'drawer-fit-operation');
  assert.equal(drawerTheme.status, 'repeated');
});

test('R3.3: AI insight labels BOM correlations as hypotheses, never verified root cause', () => {
  const result = getMarketplaceInsights({
    productCode: 'LGS433',
    evidence: [{ category: 'stability-safety', status: 'repeated', count: 2 }],
  });
  assert.equal(result.possibleBomCandidates[0].claimType, 'hypothesis');
  assert.doesNotMatch(JSON.stringify(result), /verified root cause/i);
});
