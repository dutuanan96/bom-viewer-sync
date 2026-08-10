import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PdmDiscovery } from '../src/features/ai-assistant/pdm-discovery.js';

function loadCanonicalSnapshot() {
  const manifest = JSON.parse(readFileSync(resolve('data/manifest.json'), 'utf8'));
  const materialDb = JSON.parse(readFileSync(resolve('data/materials.json'), 'utf8'));
  const bom = {};
  for (const productCode of manifest.products) {
    bom[productCode] = JSON.parse(readFileSync(resolve(`data/products/${productCode}.json`), 'utf8'));
  }
  return {
    sourceMetadata: { commitSha: 'a'.repeat(40), updatedAt: manifest.updatedAt },
    payload: {
      bom,
      productRevisions: manifest.productRevisions || {},
      notifications: manifest.notifications || [],
      ...materialDb,
    },
  };
}

const discovery = new PdmDiscovery(loadCanonicalSnapshot());

test('findDuplicateMaterials groups exact paper-card master-data duplicates with BOM impact', () => {
  const result = discovery.findDuplicateMaterials({ name: '\u7eb8\u5361' });
  const target = result.duplicateGroups.find(group => (
    group.material.spec.zh === '\u5355\u74e61100x100mm'
  ));

  assert.ok(result.totalGroups >= 1);
  assert.ok(target);
  assert.ok(target.sourceMaterialCodes.includes('LGS031ZK'));
  assert.ok(target.sourceMaterialCodes.includes('LGS833ZK'));
  assert.ok(target.materialCount >= 5);
  assert.equal(target.affectedBomEntryCount, 0);
  assert.ok(result.auditedMaterials.length >= 20);
  assert.equal(result.totalAuditedMaterials, result.auditedMaterials.length);
  assert.equal(result.evidence.sourceCommit, 'a'.repeat(40));
});

test('findDuplicateMaterials surfaces translation mismatches as suspected duplicates', () => {
  const result = discovery.findDuplicateMaterials({ name: '\u7eb8\u5361' });
  const candidate = result.suspectedDuplicateGroups.find(group => (
    group.material.spec.zh === '\u5355\u74e6785x100mm'
  ));

  assert.ok(result.totalSuspectedGroups >= 3);
  assert.ok(candidate);
  assert.deepEqual(candidate.sourceMaterialCodes, ['LGS111ZK', 'LGS133ZK']);
  assert.deepEqual(candidate.differingFields, ['spec']);
  assert.equal(candidate.matchType, 'translation_mismatch');
});

test('searchPdm finds a dimensional material and its actual product usage across languages', () => {
  for (const query of [
    '帮我看一下那个布抽规格460x282x187用什么产品?',
    'Tìm ngăn kéo 460×282×187 dùng cho sản phẩm nào?',
  ]) {
    const result = discovery.searchPdm({ query });
    assert.ok(result.materials.length >= 1);
    assert.ok(result.materials.every(material => Object.values(material.spec).includes('460x282x187mm')));
    assert.ok(result.materials.some(material => material.usedBy.some(usage => usage.productCode === 'LGS723')));
    assert.equal(result.truncated, false);
    assert.equal(result.evidence.sourceCommit, 'a'.repeat(40));
  }
});

test('searchPdm treats a material dimension change as source filtering, not source-and-target matching', () => {
  const mutationDiscovery = new PdmDiscovery({
    payload: {
      bom: {},
      materialDb: {
        materials: {
          sourcePaperCard: {
            id: 'sourcePaperCard',
            name: { zh: '\u7eb8\u5361', vi: 'gi\u1ea5y l\u00f3t' },
            spec: { zh: '\u5355\u74e6785x60mm', vi: 's\u00f3ng \u0111\u01a1n 785x60mm' },
          },
          targetPaperCard: {
            id: 'targetPaperCard',
            name: { zh: '\u7eb8\u5361', vi: 'gi\u1ea5y l\u00f3t' },
            spec: { zh: '\u5355\u74e6785x100mm', vi: 's\u00f3ng \u0111\u01a1n 785x100mm' },
          },
          unrelatedMaterial: {
            id: 'unrelatedMaterial',
            name: { zh: '\u6ce1\u68c9', vi: 'm\u00fat x\u1ed1p' },
            spec: { zh: '785x60mm', vi: '785x60mm' },
          },
        },
        bomEntries: [],
      },
      productRevisions: {},
    },
  });
  const result = mutationDiscovery.searchPdm({ query: '\u6211\u60f3\u6539\u6240\u6709\u7eb8\u5361\u670960mm\u5bbd\u5ea6\u6539\u4e3a100mm\u5bbd\u5ea6' });

  assert.equal(result.materials.length, 1);
  assert.equal(result.materials[0].materialId, 'sourcePaperCard');
  assert.ok(result.materials.every((material) => material.name.zh === '\u7eb8\u5361'));
  assert.ok(result.materials.every((material) => material.spec.zh.includes('60mm')));
  assert.ok(result.materials.every((material) => !material.spec.zh.includes('100mm')));
});

test('searchPdm ranks different component types from product-scoped multilingual queries', () => {
  for (const [query, expectedName] of [
    ['LGS043\u7528\u4ec0\u4e48\u5e03\u62bd', '\u5e03\u62bd'],
    ['LGS043\u7528\u4ec0\u4e48\u628a\u624b', '\u628a\u624b'],
    ['LGS043 d\u00f9ng tay n\u1eafm n\u00e0o', 'tay n\u1eafm'],
    ['LGS043 d\u00f9ng lo\u1ea1i \u1ed1c n\u00e0o', '\u1ed1c'],
  ]) {
    const result = discovery.searchPdm({ query, productId: 'LGS043' });

    assert.equal(result.productId, 'LGS043', query);
    assert.ok(result.materials.length > 0, query);
    assert.equal(result.matchMode, 'scoped-ranked', query);
    assert.ok(JSON.stringify(result.materials[0].name).toLowerCase().includes(expectedName), query);
    assert.ok(result.materials.every(material => (
      material.usedBy.length > 0 && material.usedBy.every(usage => usage.productCode === 'LGS043')
    )), query);
    assert.ok(result.products.every(product => product.productCode === 'LGS043'), query);
  }
});

test('searchPdm returns a bounded product BOM candidate set when local words have no lexical match', () => {
  const result = discovery.searchPdm({ query: 'Which handle does LGS043 use?', productId: 'LGS043' });

  assert.equal(result.matchMode, 'scoped-candidates');
  assert.equal(result.matchedCount, 0);
  assert.ok(result.candidateCount > 0);
  assert.ok(result.materials.some(material => material.code === 'BCLS129228BH'));
  assert.ok(result.materials.every(material => material.usedBy.every(usage => usage.productCode === 'LGS043')));
  assert.ok(result.materials.length <= 50);
});

test('searchPdm applies a confirmed material mapping only inside the requested product BOM', () => {
  const mapped = discovery.searchPdm({
    query: 'Which handle does LGS043 use?',
    productId: 'LGS043',
    materialId: 'mat_vz636a',
  });
  assert.equal(mapped.matchMode, 'scoped-mapped');
  assert.equal(mapped.materials.length, 1);
  assert.equal(mapped.materials[0].code, 'BCLS129228BH');

  const conflict = discovery.searchPdm({
    query: 'Which drawer does LGS043 use?',
    productId: 'LGS043',
    materialId: 'mat_117swgv',
  });
  assert.equal(conflict.matchMode, 'mapping-miss');
  assert.equal(conflict.requestedMaterialId, 'mat_117swgv');
  assert.deepEqual(conflict.materials, []);
});

test('searchPdm distinguishes an empty product BOM from an unclear component phrase', () => {
  const emptyDiscovery = new PdmDiscovery({
    payload: {
      bom: { LGS999: { code: 'LGS999', name_zh: 'Empty product' } },
      materialDb: { materials: {}, bomEntries: [] },
      productRevisions: {},
    },
  });
  const result = emptyDiscovery.searchPdm({ query: 'LGS999 uses what?', productId: 'LGS999' });
  assert.equal(result.matchMode, 'scoped-empty');
  assert.equal(result.candidateCount, 0);
});

test('compareRevisions reads two immutable revision payloads and returns bounded differences', () => {
  const result = discovery.compareRevisions({ productId: 'LGS032', revision1: 'V3', revision2: 'V3.1' });
  assert.equal(result.productId, 'LGS032');
  assert.equal(result.revision1.revision, 'V3');
  assert.equal(result.revision2.revision, 'V3.1');
  assert.ok(result.summary.addedCount + result.summary.removedCount + result.summary.modifiedCount > 0);
  assert.ok(result.added.length <= 100 && result.removed.length <= 100 && result.modified.length <= 100);
  assert.equal(result.evidence.length, 2);
});

test('schema, help, and recent changes expose bounded read-only metadata', () => {
  const schema = discovery.inspectPdmSchema();
  assert.match(schema.scope, /read-only/i);
  assert.ok(schema.entities.products.count > 0);
  assert.ok(schema.entities.materials.count > 0);
  assert.equal('apiKey' in schema.entities, false);

  const help = discovery.getPdmHelp({ topic: 'revision' });
  assert.match(help.safety, /cannot execute arbitrary JavaScript/i);
  assert.ok(help.capabilities.length > 0);

  const recent = discovery.listRecentChanges();
  assert.ok(recent.changes.length <= 50);
  assert.equal(typeof recent.truncated, 'boolean');
});
