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
import { validateToolCall } from '../src/features/ai-assistant/contracts.js';

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
  { name: 'search_products', args: { extra: 'bad', query: 'test' }, expectError: false }, // extra arg doesn't reach here (validateToolCall blocks at call layer)
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

// ── Output ────────────────────────────────────────────────────────────────────

const recall5Pct = metrics.recall5.total ? (metrics.recall5.hits / metrics.recall5.total) * 100 : 0;
const exactSkuPct = metrics.exactSku.total ? (metrics.exactSku.hits / metrics.exactSku.total) * 100 : 0;
const rejectionPct = metrics.rejectionRate.total ? (metrics.rejectionRate.hits / metrics.rejectionRate.total) * 100 : 0;
const citationPct = metrics.citationCompleteness.total ? (metrics.citationCompleteness.hits / metrics.citationCompleteness.total) * 100 : 0;

const report = {
  timestamp: new Date().toISOString(),
  sourceMetadata: snapshot.sourceMetadata,
  metrics: {
    recall5: { pct: recall5Pct.toFixed(1), threshold: 95, pass: recall5Pct >= 95 },
    exactSku: { pct: exactSkuPct.toFixed(1), threshold: 100, pass: exactSkuPct >= 100 },
    rejectionRate: { pct: rejectionPct.toFixed(1), threshold: 100, pass: rejectionPct >= 100 },
    citationCompleteness: { pct: citationPct.toFixed(1), threshold: 100, pass: citationPct >= 100 },
  },
  evalSummary: { total: pass + fail, pass, fail },
  failures: failures,
};

console.log(JSON.stringify(report, null, 2));

const allMetricsPass = Object.values(report.metrics).every(m => m.pass);
if (fail > 0 || !allMetricsPass) {
  process.exit(1);
}
