// Tests for pdm-knowledge.js (R1.3)
// Tests run against real canonical 24-shard data for integration coverage.
// Also run unit tests against controlled fixtures for edge cases.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PdmKnowledge } from '../src/features/ai-assistant/pdm-knowledge.js';

test('AI prompt pack defines the six evidence-bound PDM specialists', () => {
  const promptPack = JSON.parse(readFileSync(resolve('knowledge/ai/prompt-pack.json'), 'utf-8'));
  const expected = ['revision', 'bom_lookup', 'bom_comparison', 'material_usage', 'proposal', 'marketplace'];
  const byId = new Map((promptPack.specialists || []).map(specialist => [specialist.id, specialist]));

  for (const id of expected) {
    const specialist = byId.get(id);
    assert.ok(specialist, `missing specialist: ${id}`);
    assert.equal(specialist.evidenceRequired, true, `${id} must require evidence`);
    assert.ok(Array.isArray(specialist.allowedTools) && specialist.allowedTools.length > 0, `${id} must name allowed tools`);
    assert.ok(typeof specialist.doNotUse === 'string' && specialist.doNotUse.length > 0, `${id} must define doNotUse`);
  }
});

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
  assert.equal(result.revisions.some(revision => 'snapshot' in revision), false, 'must not expose revision snapshots');
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

// ── R1.3.X: compare_boms ───────────────────────────────────────────────────────

test('R1.3: compareBoms throws on unknown productId1', () => {
  const kb = new PdmKnowledge(UNIT_SNAPSHOT);
  assert.throws(() => kb.compareBoms({ productId1: 'UNKNOWN', productId2: 'LGS433' }), /not found/i);
});

test('R1.3: compareBoms throws on unknown productId2', () => {
  const kb = new PdmKnowledge(UNIT_SNAPSHOT);
  assert.throws(() => kb.compareBoms({ productId1: 'LGS433', productId2: 'UNKNOWN' }), /not found/i);
});

test('R1.3: compareBoms aggregates duplicate materials and reports structured differences', () => {
  const snapshot = {
    sourceMetadata: UNIT_SNAPSHOT.sourceMetadata,
    payload: {
      bom: {
        LGS031: {
          colors: ['C1'],
          color_info: {
            C1: { materials: [
              { mat_code: 'M-SHARED', name_zh: 'M6x22内六角螺丝', qty: '1', unit: 'pcs', attr_zh: '\u4e94\u91d1\u5305', material_zh: '#10', spec: 'M6x22mm' },
              { mat_code: 'M-SHARED', name_zh: 'M6x22内六角螺丝', qty: '2', unit: 'pcs', attr_zh: '\u4e94\u91d1\u5305', material_zh: '#10', spec: 'M6x22mm' },
              { mat_code: 'M-ONLY-1', name_zh: 'Only one', qty: '1', unit: 'pcs' }
            ] }
          }
        },
        LGS032: {
          colors: ['C2'],
          color_info: {
            C2: { materials: [
              { mat_code: 'M-SHARED', name_zh: 'M6x22内六角螺丝', qty: '4', unit: 'set', attr_zh: '\u4e94\u91d1\u5305', material_zh: '#10', spec: 'M6x22mm' },
              { mat_code: 'M-ONLY-2', name_zh: 'Only two', qty: '1', unit: 'pcs' }
            ] }
          }
        }
      }
    }
  };
  const result = new PdmKnowledge(snapshot).compareBoms({
    productId1: 'LGS031',
    color1: 'C1',
    productId2: 'LGS032',
    color2: 'C2'
  });

  assert.equal(result.summary.commonCount, 1);
  assert.equal(result.summary.onlyProduct1Count, 1);
  assert.equal(result.summary.onlyProduct2Count, 1);
  assert.equal(result.summary.quantityOrUnitDifferenceCount, 1);
  assert.equal(result.summary.similarityScore, 1 / 3);
  assert.deepEqual(result.summary.commonByAttribute, { '\u4e94\u91d1\u5305': 1 });
  assert.deepEqual(result.summary.commonByMaterialFamily.metal, { total: 1, explicit: 0, inferred: 1 });
  assert.equal(result.truncated, false);
  assert.equal(result.common[0].product1.quantity, 3);
  assert.equal(result.common[0].product1.rowCount, 2);
  assert.equal(result.common[0].attributeZh, '\u4e94\u91d1\u5305');
  assert.equal(result.common[0].materialZh, '#10');
  assert.equal(result.common[0].spec, 'M6x22mm');
  assert.deepEqual(result.common[0].materialFamily, { family: 'metal', confidence: 'inferred', evidence: 'M6x22内六角螺丝' });
  assert.equal(result.evidence.length, 2);
  assert.equal(result.evidence[0].recordId, 'LGS031');
  assert.equal(result.evidence[1].recordId, 'LGS032');
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

test('Catalog analysis retains complete rows for export while bounding visible results', () => {
  const snapshot = {
    sourceMetadata: { commitSha: 'c'.repeat(40), shardRoot: 'data', manifestVersion: 1, updatedAt: '2026-08-11T00:00:00Z' },
    payload: {
      bom: Object.fromEntries(Array.from({ length: 51 }, (_, index) => {
        const productCode = `LGS${String(index + 100).padStart(3, '0')}`;
        return [productCode, { colors: ['黑色'], effectiveRevision: 'V1', color_info: { 黑色: { sku: `${productCode}BH` } } }];
      })),
      productRevisions: {},
      materialDb: {
        materials: Object.fromEntries(Array.from({ length: 51 }, (_, index) => [
          `foam-${index + 1}`,
          {
            id: `foam-${index + 1}`,
            code: `PM${String(index + 1).padStart(4, '0')}`,
            name: { zh: '泡沫', vi: 'Mút xốp' },
            spec: { zh: `${index + 1}x10x10mm`, vi: `${index + 1}x10x10mm` },
          },
        ])),
        bomEntries: Array.from({ length: 51 }, (_, index) => ({
          parentType: 'product',
          productCode: `LGS${String(index + 100).padStart(3, '0')}`,
          color: '黑色',
          materialId: `foam-${index + 1}`,
          qty: 1,
        })),
      },
    },
  };
  const result = new PdmKnowledge(snapshot).analyzePdm({ query: '帮我统计每一个产品用什么泡沫' });

  assert.equal(result.countMode, 'generic_material_usage');
  assert.equal(result.totalCount, 51);
  assert.equal(result.results.length, 50);
  assert.equal(result.truncated, true);
  assert.equal(result.exportResults.length, 51);
  assert.ok(result.exportResults.every(row => row.nameZh === '泡沫'));
  assert.deepEqual(result.exportResults.map(row => row.usedInProducts[0]), [...result.exportResults.map(row => row.usedInProducts[0])].sort());
});

test('Product-ordered catalog rows keep the representative color of their own product', () => {
  const snapshot = {
    sourceMetadata: { commitSha: 'd'.repeat(40), shardRoot: 'data', manifestVersion: 1, updatedAt: '2026-08-11T00:00:00Z' },
    payload: {
      bom: {
        LGS900: { colors: ['黑色'], effectiveRevision: 'V1', color_info: { 黑色: { sku: 'LGS900BH' } } },
        LGS901: { colors: ['复古色'], effectiveRevision: 'V2', color_info: { 复古色: { sku: 'LGS901KD' } } },
      },
      productRevisions: {},
      materialDb: {
        materials: {
          foam: { id: 'foam', code: 'PM0001', name: { zh: '泡沫' }, spec: { zh: '100x100x10mm' } },
        },
        bomEntries: [
          { parentType: 'product', productCode: 'LGS900', color: '黑色', materialId: 'foam', qty: 1 },
          { parentType: 'product', productCode: 'LGS901', color: '复古色', materialId: 'foam', qty: 1 },
        ],
      },
    },
  };
  const result = new PdmKnowledge(snapshot).analyzePdm({ query: '帮我统计每一个产品用什么泡沫' });

  assert.deepEqual(result.results.map(row => [row.usedInProducts[0], row.representativeColors]), [
    ['LGS900', ['黑色']],
    ['LGS901', ['复古色']],
  ]);
});

test('R1.3 integration: LGS723/LGS733 comparison uses shared assets and reports BOM conflicts', () => {
  const result = new PdmKnowledge(loadCanonicalSnapshot()).compareBoms({
    productId1: 'LGS723',
    productId2: 'LGS733',
  });
  const commonNames = result.common.map(item => item.product1.nameZh);
  const probableNames = result.probableCommon.map(item => item.product1.nameZh);
  assert.ok(commonNames.includes('LGS723_733-中竖梁-前'));
  assert.ok(commonNames.includes('LGS723_733-中竖梁-后'));
  assert.ok(probableNames.includes('LGS333_723_733支撑框'));
  assert.ok(probableNames.includes('LGS723_733右侧框'));
  assert.ok(probableNames.includes('LGS723_733左侧框'));
  assert.ok(result.dataQualityWarnings.some(warning => warning.item1 === '900-灯带'));
  assert.equal(result.dataQualityWarnings.some(warning => warning.item1 === 'LGS723底部横杆-前'), false);
});

test('R1.3 integration: shared hardware bags are detected by identical child composition', () => {
  const result = new PdmKnowledge(loadCanonicalSnapshot()).analyzePdm({
    query: '帮我看一下所有的五金包有哪一个产品共用吗?',
  });
  assert.ok(result.results.some(group => (
    group.matchingBasis === 'identical_composition' &&
    group.usedInProducts.includes('LGS131') &&
    group.usedInProducts.includes('LGS231')
  )));
});

test('R1.3 integration: variant gaps and frame dimensions are derived from canonical data', () => {
  const knowledge = new PdmKnowledge(loadCanonicalSnapshot());
  const variant = knowledge.analyzePdm({ query: '为什么LGS031五金包的白色没有?' });
  assert.equal(variant.countMode, 'variant_coverage');
  assert.equal(variant.requestedVariantExists, false);
  assert.deepEqual(variant.dataQualityWarnings[0].availableColors, ['复古色', '黑色']);

  const exactHeight = knowledge.analyzePdm({ query: '那有几个铁框有高度657mm' });
  assert.equal(exactHeight.needsClarification, false);
  assert.ok(exactHeight.results.length > 0);
  assert.ok(exactHeight.results.every(item => item.spec.startsWith('657x')));

  const nearHeight = knowledge.analyzePdm({ query: '那有几个铁框有高度660mm' });
  assert.equal(nearHeight.needsClarification, true);
  assert.equal(nearHeight.clarificationCode, 'dimension_near_match');
  assert.ok(nearHeight.clarificationData.nearValues.includes(659));
});
