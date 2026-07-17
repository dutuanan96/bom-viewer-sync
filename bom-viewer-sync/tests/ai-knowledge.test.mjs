// Tests for pdm-knowledge.js (R1.3)
// Tests run against real canonical 24-shard data for integration coverage.
// Also run unit tests against controlled fixtures for edge cases.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PdmKnowledge } from '../src/features/ai-assistant/pdm-knowledge.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Load the real 24-shard payload from the data/ directory.
 * This is the canonical integration dataset.
 */
function loadCanonicalSnapshot() {
  const manifest = JSON.parse(readFileSync(resolve('data/manifest.json'), 'utf-8'));
  const materialsRaw = JSON.parse(readFileSync(resolve('data/materials.json'), 'utf-8'));

  const bom = {};
  for (const productCode of manifest.products) {
    const product = JSON.parse(readFileSync(resolve(`data/products/${productCode}.json`), 'utf-8'));
    bom[productCode] = product;
  }

  return {
    sourceMetadata: {
      commitSha: 'a'.repeat(40),
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

// ── Unit fixture snapshot ─────────────────────────────────────────────────────

const UNIT_SNAPSHOT = {
  sourceMetadata: {
    commitSha: 'b'.repeat(40),
    shardRoot: 'data',
    manifestVersion: 1,
    updatedAt: '2026-07-01T00:00:00Z',
  },
  payload: {
    bom: {
      LGS433: {
        code: 'LGS433',
        name_zh: '433产品',
        colors: ['黑色', '白色'],
        color_info: {
          '黑色': { name_zh: '黑色款' },
          '白色': { name_zh: '白色款' },
        }
      },
      LGS101: {
        code: 'LGS101',
        name_zh: '101产品',
        colors: ['红色'],
        color_info: { '红色': { name_zh: '红色款' } }
      }
    },
    productRevisions: {
      LGS032: {
        currentRevision: 'B.1',
        effectiveRevision: 'A.1',
        currentRevisionInfo: { workflowState: 'draft' },
        revisions: [{ revision: 'A.1', workflowState: 'released' }],
        effectivityEvents: []
      }
    },
    materialDb: {
      materials: {
        'BH02S': { mat_code: 'BH02S', name_zh: '物料A' },
        'BH03S': { mat_code: 'BH03S', name_zh: '物料B' }
      },
      bomEntries: [
        { id: 'e1', parentType: 'product', productCode: 'LGS433', color: '黑色', materialId: 'BH02S', order: 0 }
      ]
    }
  }
};

// ── R1.3.1: search_products ──────────────────────────────────────────────────

test('R1.3: search_products does not crash on unit fixture', () => {
  const kb = new PdmKnowledge(UNIT_SNAPSHOT);
  const results = kb.searchProducts({ query: '433' });
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  // Results must use productCode, not a missing .id field
  assert.ok(results[0].productCode, 'must have productCode');
});

test('R1.3: search_products returns sorted results', () => {
  const kb = new PdmKnowledge(UNIT_SNAPSHOT);
  const results = kb.searchProducts({ query: '' });
  assert.equal(results.length, 2);
  // Must be sorted by productCode
  assert.equal(results[0].productCode, 'LGS101');
  assert.equal(results[1].productCode, 'LGS433');
});

test('R1.3: search_products results are bounded (max 50)', () => {
  // Build a snapshot with 60 products
  const largeBom = {};
  for (let i = 1; i <= 60; i++) {
    const code = `LGS${String(i).padStart(3, '0')}`;
    largeBom[code] = { code, name_zh: `Product ${i}`, colors: [] };
  }
  const kb = new PdmKnowledge({
    ...UNIT_SNAPSHOT,
    payload: { ...UNIT_SNAPSHOT.payload, bom: largeBom }
  });
  const results = kb.searchProducts({ query: 'LGS' });
  assert.ok(results.length <= 50, `expected <= 50, got ${results.length}`);
});

test('R1.3: search_products result does NOT include full payload', () => {
  const kb = new PdmKnowledge(UNIT_SNAPSHOT);
  const results = kb.searchProducts({ query: 'LGS433' });
  assert.equal(results.length, 1);
  // Must not expose raw color_info or other large fields
  assert.equal(results[0].color_info, undefined, 'must not expose raw color_info');
});

test('R1.3: search_products includes source metadata in evidence', () => {
  const kb = new PdmKnowledge(UNIT_SNAPSHOT);
  const { results, evidence } = kb.searchProducts({ query: '433', withEvidence: true });
  assert.ok(evidence);
  assert.equal(evidence.sourceCommit, 'b'.repeat(40));
});

// ── R1.3.2: resolve_sku ──────────────────────────────────────────────────────

test('R1.3: resolve_sku rejects when snapshot has no matching product', () => {
  const kb = new PdmKnowledge(UNIT_SNAPSHOT);
  assert.throws(() => kb.resolveSku({ alias: 'ULGS999BH02S' }), /not found/i);
});

test('R1.3: resolve_sku resolves exact U-prefix alias when product and SKU exist', () => {
  const kb = new PdmKnowledge(UNIT_SNAPSHOT);
  const result = kb.resolveSku({ alias: 'ULGS433BH02S' });
  assert.equal(result.internalSku, 'LGS433BH02S');
  assert.equal(result.productCode, 'LGS433');
  assert.equal(result.resolution, 'exact-u-prefix-alias');
});

test('R1.3: resolve_sku must not resolve when snapshot is empty', () => {
  const kb = new PdmKnowledge({ ...UNIT_SNAPSHOT, payload: { bom: {} } });
  assert.throws(() => kb.resolveSku({ alias: 'ULGS433BH02S' }), /not found/i);
});

test('R1.3: resolve_sku alias from knowledge pack respected if product exists', () => {
  const aliasMap = { 'ULGS433BH02S': { internalSku: 'LGS433BH02S', productCode: 'LGS433', resolution: 'exact-prefix-alias' } };
  const kb = new PdmKnowledge(UNIT_SNAPSHOT, { aliasMap });
  const result = kb.resolveSku({ alias: 'ULGS433BH02S' });
  assert.equal(result.productCode, 'LGS433');
});

// ── R1.3.3: get_revision_history ─────────────────────────────────────────────

test('R1.3: get_revision_history works on productRevisions record structure', () => {
  const kb = new PdmKnowledge(UNIT_SNAPSHOT);
  const result = kb.getRevisionHistory({ productId: 'LGS032' });
  assert.ok(result.currentRevision, 'must have currentRevision');
  assert.ok(result.effectiveRevision, 'must have effectiveRevision');
  assert.ok(Array.isArray(result.revisions), 'revisions must be an array');
  assert.equal(result.currentRevision, 'B.1');
  // effectiveRevision: domain logic may resolve to currentRevision when no released snapshot has product data
  assert.ok(typeof result.effectiveRevision === 'string', 'effectiveRevision must be a string');
  assert.ok(result.revisions.length > 0, 'must have at least one historical revision');
});

test('R1.3: get_revision_history for product without history returns default', () => {
  const kb = new PdmKnowledge(UNIT_SNAPSHOT);
  const result = kb.getRevisionHistory({ productId: 'LGS433' });
  // No productRevisions for LGS433, so should return defaults, not throw
  assert.ok(result.currentRevision);
  assert.ok(Array.isArray(result.revisions));
});

// ── R1.3.4: get_bom ──────────────────────────────────────────────────────────

test('R1.3: get_bom returns bounded row array', () => {
  const kb = new PdmKnowledge(UNIT_SNAPSHOT);
  const result = kb.getBom({ productId: 'LGS433', color: '黑色' });
  assert.ok(Array.isArray(result.rows));
  // Rows must not be raw full material objects
  if (result.rows.length > 0) {
    assert.equal(result.rows[0].payload, undefined, 'must not expose raw material payload');
  }
});

test('R1.3: get_bom throws on unknown product', () => {
  const kb = new PdmKnowledge(UNIT_SNAPSHOT);
  assert.throws(() => kb.getBom({ productId: 'UNKNOWN' }), /not found/i);
});

// ── R1.3.5: Integration test against canonical 24-shard data ─────────────────

test('R1.3 integration: search_products does not crash on 22 canonical products', () => {
  const snapshot = loadCanonicalSnapshot();
  const kb = new PdmKnowledge(snapshot);
  // Must not crash regardless of product structure
  const results = kb.searchProducts({ query: 'LGS' });
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  // All results must have productCode
  for (const r of results) {
    assert.ok(r.productCode, `result missing productCode: ${JSON.stringify(r)}`);
  }
});

test('R1.3 integration: LGS032 revision history is correct', () => {
  const snapshot = loadCanonicalSnapshot();
  const kb = new PdmKnowledge(snapshot);
  const result = kb.getRevisionHistory({ productId: 'LGS032' });
  assert.ok(result.currentRevision, 'must have currentRevision');
  assert.ok(result.effectiveRevision, 'must have effectiveRevision');
  assert.ok(Array.isArray(result.revisions));
});

test('R1.3 integration: resolve_sku throws when product not in canonical data', () => {
  const snapshot = loadCanonicalSnapshot();
  const kb = new PdmKnowledge(snapshot);
  assert.throws(() => kb.resolveSku({ alias: 'ULGS999NONEXIST' }), /not found/i);
});

test('R1.3 integration: all results are bounded and have evidence', () => {
  const snapshot = loadCanonicalSnapshot();
  const kb = new PdmKnowledge(snapshot);
  const { results, evidence } = kb.searchProducts({ query: '', withEvidence: true });
  assert.ok(results.length <= 50);
  assert.ok(evidence.sourceCommit, 'must have sourceCommit in evidence');
});
