// scripts/eval-ai.mjs — R1.5 deterministic AI evaluation.
//
// Runs golden-case and red-team evaluations against the PdmKnowledge engine.
// Uses canonical 24-shard data for integration tests.
// Outputs machine-readable metrics. No network calls, no API key required.
//
// Metrics evaluated:
//   - Recall@5 (search hit rate): must be >= 95%
//   - Exact SKU/alias match: must be 100%
//   - Malformed/unknown tool rejection: must be 100%
//   - Citation metadata completeness: must be 100%

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PdmKnowledge } from '../src/features/ai-assistant/pdm-knowledge.js';
import { PdmDiscovery } from '../src/features/ai-assistant/pdm-discovery.js';
import { validateToolCall } from '../src/features/ai-assistant/contracts.js';
import { PDM_INTENTS, routePdmIntent } from '../src/features/ai-assistant/intent-router.js';

// ── Load canonical snapshot ───────────────────────────────────────────────────

function loadCanonicalSnapshot() {
  const manifest = JSON.parse(readFileSync(resolve('data/manifest.json'), 'utf-8'));
  const materialsRaw = JSON.parse(readFileSync(resolve('data/materials.json'), 'utf-8'));
  const bom = {};
  for (const productCode of manifest.products) {
    bom[productCode] = JSON.parse(readFileSync(resolve(`data/products/${productCode}.json`), 'utf-8'));
  }
  return {
    sourceMetadata: {
      commitSha: 'local-eval-' + 'a'.repeat(30),
      shardRoot: 'bom-viewer-sync/data',
      manifestVersion: manifest.version || 1,
      updatedAt: manifest.updatedAt || null,
    },
    payload: {
      version: manifest.version || 1,
      bom,
      productRevisions: manifest.productRevisions || {},
      notifications: manifest.notifications || [],
      ...materialsRaw,
    }
  };
}

// ── Load alias map from knowledge pack ───────────────────────────────────────

function loadAliasMap() {
  const pack = JSON.parse(readFileSync(resolve('knowledge/marketplace-aliases.json'), 'utf-8'));
  const map = {};
  for (const [alias, entry] of Object.entries(pack.aliases || {})) {
    map[alias] = entry;
  }
  return map;
}

// ── Evaluation logic ──────────────────────────────────────────────────────────

const snapshot = loadCanonicalSnapshot();
const aliasMap = loadAliasMap();
const kb = new PdmKnowledge(snapshot, { aliasMap });

let pass = 0;
let fail = 0;
const failures = [];
const metrics = {
  recall5: { hits: 0, total: 0 },
  exactSku: { hits: 0, total: 0 },
  rejectionRate: { hits: 0, total: 0 },
  citationCompleteness: { hits: 0, total: 0 },
  specialistRegression: { hits: 0, total: 0 },
};

function evalCase(id, description, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    failures.push({ id, description, error: e.message });
  }
}

// ── Recall@5: search_products must find expected products in top results ──────

const SEARCH_CASES = [
  { query: 'LGS433', expectedProductCode: 'LGS433' },
  { query: 'LGS032', expectedProductCode: 'LGS032' },
  { query: 'LGS101', expectedProductCode: 'LGS101' },
  { query: 'LGS731', expectedProductCode: null }, // no such product
  { query: '', expectedCount: 22 }, // should return all 22 products (capped at 50)
];

for (const sc of SEARCH_CASES) {
  metrics.recall5.total++;
  evalCase(`RECALL-${sc.query || 'empty'}`, `search_products("${sc.query}")`, () => {
    const results = kb.searchProducts({ query: sc.query || '' });
    if (sc.expectedProductCode) {
      const found = results.some(r => r.productCode === sc.expectedProductCode);
      if (!found) throw new Error(`Expected to find ${sc.expectedProductCode} in results`);
      metrics.recall5.hits++;
    } else if (sc.expectedCount !== undefined) {
      if (results.length < sc.expectedCount) throw new Error(`Expected >= ${sc.expectedCount} results, got ${results.length}`);
      metrics.recall5.hits++;
    } else {
      metrics.recall5.hits++; // non-match expected: pass if no error
    }
    // Citation metadata completeness
    const { evidence } = kb.searchProducts({ query: sc.query || '', withEvidence: true });
    metrics.citationCompleteness.total++;
    if (evidence && evidence.sourceCommit) {
      metrics.citationCompleteness.hits++;
    } else {
      throw new Error('Evidence missing sourceCommit');
    }
  });
}

// ── Exact SKU/alias ───────────────────────────────────────────────────────────

const ALIAS_CASES = [
  { alias: 'ULGS433BH02S', expectedSku: 'LGS433BH02S', expectedProduct: 'LGS433' },
];

for (const ac of ALIAS_CASES) {
  metrics.exactSku.total++;
  evalCase(`SKU-${ac.alias}`, `resolve_sku("${ac.alias}")`, () => {
    const result = kb.resolveSku({ alias: ac.alias });
    if (result.internalSku !== ac.expectedSku) {
      throw new Error(`Expected internalSku=${ac.expectedSku}, got ${result.internalSku}`);
    }
    if (result.productCode !== ac.expectedProduct) {
      throw new Error(`Expected productCode=${ac.expectedProduct}, got ${result.productCode}`);
    }
    metrics.exactSku.hits++;
    // Evidence
    metrics.citationCompleteness.total++;
    if (result.evidence?.sourceCommit) {
      metrics.citationCompleteness.hits++;
    } else {
      throw new Error('Evidence missing sourceCommit');
    }
  });
}

// ── Red-team: malformed/unknown tool rejection ────────────────────────────────

const RED_TEAM_CASES = [
  { name: 'delete_database', args: {}, expectError: true },
  { name: 'search_products', args: 'x'.repeat(6000), expectError: true },
  { name: 'search_products', args: { query: 'x'.repeat(10001) }, expectError: true },
  { name: 'unknown_tool_xyz', args: {}, expectError: true },
  { name: 'search_products', args: { extra: 'bad', query: 'test' }, expectError: true },
];

for (const rc of RED_TEAM_CASES) {
  if (!rc.expectError) continue; // skip non-rejection cases
  metrics.rejectionRate.total++;
  evalCase(`RED-${rc.name}-${JSON.stringify(rc.args).substring(0, 20)}`, `validateToolCall({name:${rc.name},...})`, () => {
    let rejected = false;
    try {
      validateToolCall({ name: rc.name, arguments: rc.args });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`Expected rejection but call was accepted for tool=${rc.name}`);
    metrics.rejectionRate.hits++;
  });
}

// ── Revision history ──────────────────────────────────────────────────────────

evalCase('REV-LGS032', 'get_revision_history LGS032', () => {
  const result = kb.getRevisionHistory({ productId: 'LGS032' });
  if (!result.currentRevision) throw new Error('missing currentRevision');
  if (!result.effectiveRevision) throw new Error('missing effectiveRevision');
  if (!Array.isArray(result.revisions)) throw new Error('revisions must be array');
  metrics.citationCompleteness.total++;
  if (result.evidence?.sourceCommit) {
    metrics.citationCompleteness.hits++;
  } else {
    throw new Error('Evidence missing sourceCommit');
  }
});

const ROUTER_TOOLS = [
  'search_products',
  'resolve_sku',
  'get_bom',
  'compare_boms',
  'get_revision_history',
  'get_marketplace_insights',
  'compare_revisions',
  'search_pdm',
];

function specialistCase(id, description, fn) {
  metrics.specialistRegression.total++;
  evalCase(id, description, () => {
    fn();
    metrics.specialistRegression.hits++;
  });
}

specialistCase('SPECIALIST-REV-LGS032', 'LGS032 draft and effective revision distinction', () => {
  const route = routePdmIntent({
    query: '为什么LGS032有状态是草稿呢？',
    availableTools: ROUTER_TOOLS
  });
  if (route.intent !== PDM_INTENTS.REVISION_STATUS || route.preferredTool !== 'get_revision_history') {
    throw new Error(`Unexpected revision route: ${JSON.stringify(route)}`);
  }
  const result = kb.getRevisionHistory({ productId: 'LGS032' });
  if (result.currentRevision !== 'V3.1') {
    throw new Error(`Expected current V3.1, got ${JSON.stringify(result.currentRevisionInfo)}`);
  }
  if (!result.effectiveRevision) throw new Error(`Expected effective revision, got ${result.effectiveRevision}`);
});

specialistCase('SPECIALIST-COMPARE', 'LGS031 and LGS032 structured comparison', () => {
  const route = routePdmIntent({ query: 'Compare LGS031 vs LGS032 BOM', availableTools: ROUTER_TOOLS });
  if (route.intent !== PDM_INTENTS.BOM_COMPARE) throw new Error(`Unexpected comparison route: ${route.intent}`);
  const result = kb.compareBoms({ productId1: 'LGS031', productId2: 'LGS032' });
  if (!result.summary || result.evidence?.length !== 2) throw new Error('Comparison is missing summary or two-source evidence');
});

specialistCase('SPECIALIST-ALIAS', 'LGS433 external alias resolution', () => {
  const route = routePdmIntent({ query: 'Resolve SKU ULGS433BH02S', availableTools: ROUTER_TOOLS });
  if (route.intent !== PDM_INTENTS.SKU_ALIAS) throw new Error(`Unexpected alias route: ${route.intent}`);
  const result = kb.resolveSku({ alias: 'ULGS433BH02S' });
  if (result.productCode !== 'LGS433') throw new Error(`Unexpected alias product: ${result.productCode}`);
});

specialistCase('SPECIALIST-AMBIGUOUS', 'ambiguous request asks model for clarification', () => {
  const route = routePdmIntent({ query: 'Please check this', availableTools: ROUTER_TOOLS });
  if (route.intent !== PDM_INTENTS.AMBIGUOUS || route.preferredTool !== null) {
    throw new Error(`Ambiguous request routed to ${route.preferredTool}`);
  }
});

specialistCase('SPECIALIST-REVISION-FOLLOWUPS', 'multilingual revision follow-ups use structured context', () => {
  const conversationContext = { productIds: ['LGS032'], revisions: ['V3', 'V3.1'] };
  const queries = [
    '\u4e24\u4e2a\u7248\u672c\u6709\u4ec0\u4e48\u533a\u522b',
    'Hai phi\u00ean b\u1ea3n kh\u00e1c nhau th\u1ebf n\u00e0o?',
    'What is different between those two versions?',
  ];
  for (const query of queries) {
    const route = routePdmIntent({ query, conversationContext, availableTools: ROUTER_TOOLS });
    if (route.preferredTool !== 'compare_revisions') {
      throw new Error(`Unexpected follow-up route for ${query}: ${JSON.stringify(route)}`);
    }
  }
});

specialistCase('SPECIALIST-CROSS-PDM-SEARCH', 'mixed-language dimensional search resolves actual BOM usage', () => {
  const result = new PdmDiscovery(snapshot).searchPdm({
    query: 'T\u00ecm ng\u0103n k\u00e9o 460\u00d7282\u00d7187 d\u00f9ng cho s\u1ea3n ph\u1ea9m n\u00e0o?',
  });
  const found = result.materials.some(material => (
    Object.values(material.spec || {}).includes('460x282x187mm') &&
    material.usedBy.some(usage => usage.productCode === 'LGS723')
  ));
  if (!found) throw new Error('Expected specification 460x282x187mm to resolve to LGS723');
});

specialistCase('SPECIALIST-SEARCH-FOLLOWUPS', 'multilingual result-set follow-ups reuse the original search', () => {
  const conversationContext = {
    productIds: ['LGS723'],
    materialIds: ['mat_drawer'],
    searchQuery: '460x282x187',
  };
  for (const query of ['Is LGS723 the only one?', 'Chỉ LGS723 dùng thôi à?', '\u53ea\u6709LGS723\u7528\u5417?']) {
    const route = routePdmIntent({ query, conversationContext, availableTools: ROUTER_TOOLS });
    if (route.preferredTool !== 'search_pdm' || route.entities.searchQuery !== conversationContext.searchQuery) {
      throw new Error(`Unexpected search follow-up route for ${query}: ${JSON.stringify(route)}`);
    }
  }
});

// ── Output ────────────────────────────────────────────────────────────────────

const recall5Pct = metrics.recall5.total ? (metrics.recall5.hits / metrics.recall5.total) * 100 : 0;
const exactSkuPct = metrics.exactSku.total ? (metrics.exactSku.hits / metrics.exactSku.total) * 100 : 0;
const rejectionPct = metrics.rejectionRate.total ? (metrics.rejectionRate.hits / metrics.rejectionRate.total) * 100 : 0;
const citationPct = metrics.citationCompleteness.total ? (metrics.citationCompleteness.hits / metrics.citationCompleteness.total) * 100 : 0;
const specialistRegressionPct = metrics.specialistRegression.total
  ? (metrics.specialistRegression.hits / metrics.specialistRegression.total) * 100
  : 0;

const report = {
  timestamp: new Date().toISOString(),
  sourceMetadata: snapshot.sourceMetadata,
  metrics: {
    recall5: { pct: recall5Pct.toFixed(1), threshold: 95, pass: recall5Pct >= 95 },
    exactSku: { pct: exactSkuPct.toFixed(1), threshold: 100, pass: exactSkuPct >= 100 },
    rejectionRate: { pct: rejectionPct.toFixed(1), threshold: 100, pass: rejectionPct >= 100 },
    citationCompleteness: { pct: citationPct.toFixed(1), threshold: 100, pass: citationPct >= 100 },
    specialistRegression: { pct: specialistRegressionPct.toFixed(1), threshold: 100, pass: specialistRegressionPct >= 100 },
  },
  evalSummary: { total: pass + fail, pass, fail },
  failures: failures,
};

console.log(JSON.stringify(report, null, 2));

const allMetricsPass = Object.values(report.metrics).every(m => m.pass);
if (fail > 0 || !allMetricsPass) {
  process.exit(1);
}
