import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { resolveBomRows } from '../src/domain/bom.js';
import { buildBomTreeRows } from '../src/domain/relationships.js';
import { materialWhereUsed } from '../src/domain/materials.js';
import { createProductRevision, payloadForProductRevision, productRevisionOptions } from '../src/domain/revisions.js';
import { assembleShardedPayload, splitPayloadToShards } from '../src/domain/sharded-data.js';
import { PdmKnowledge } from '../src/features/ai-assistant/pdm-knowledge.js';

const read = (path) => JSON.parse(fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = read('data/manifest.json');
const materials = read('data/materials.json');
const productCodes = manifest.products;
const products = Object.fromEntries(productCodes.map((code) => [code, read(`data/products/${code}.json`)]));
const payload = { ...manifest, ...materials, bom: products };

test('packaging BOM B1 applies without changing the effective design revision', () => {
  for (const [code, materialCode] of [['LGS723', 'DWZB990300'], ['LGS733', 'DWZB1130300']]) {
    const revision = manifest.productRevisions[code];
    assert.equal(revision.currentRevision, 'V4.2');
    assert.equal(revision.effectiveRevision, 'V4.2');
    const active = payloadForProductRevision(payload, code, 'V4.2');
    const row = resolveBomRows(active, code, '黑色').find((item) => item.mat_code === materialCode);
    assert.equal(row?.qty, '2');
    assert.equal(buildBomTreeRows(active, code, '黑色').find((item) => item.mat_code === materialCode)?.qty, '2');
    assert.equal(new PdmKnowledge({ payload }).getBom({ productId: code, color: '黑色' })
      .rows.find((item) => item.matCode === materialCode)?.qty, '2');
    const materialId = Object.values(materials.materialDb.materials)
      .find((item) => item.code === materialCode)?.id;
    assert.ok(materialWhereUsed(payload, materialId).usageEntries
      .some((item) => item.productCode === code && item.status === 'effective'));
    assert.ok(products[code].color_info['黑色'].materials.every((item) => item.mat_code !== materialCode));
    assert.ok(revision.revisions.find((item) => item.revision === 'V4.2').snapshot.product
      .color_info['黑色'].materials.every((item) => item.mat_code !== materialCode));
    assert.equal(productRevisionOptions(payload, code).filter((item) => item.revision === 'V4.2').length, 1);
  }
  const foam = payloadForProductRevision(payload, 'LGS043', 'V3.1');
  for (const color of ['复古色', '黑色']) {
    assert.equal(resolveBomRows(foam, 'LGS043', color)
      .find((item) => item.mat_code === 'PM3504035')?.qty, '2');
  }
  assert.equal(resolveBomRows(payloadForProductRevision(payload, 'LGS723', 'V4.1'), 'LGS723', '黑色')
    .some((item) => item.mat_code === 'DWZB990300'), false);
});

test('closed label Drafts retain their audit record and structural Drafts stay open', () => {
  assert.equal(Object.keys(manifest.closedDrafts).length, 15);
  for (const code of Object.keys(manifest.closedDrafts)) {
    const revision = manifest.productRevisions[code];
    assert.equal(revision.currentRevision, revision.effectiveRevision);
    assert.equal(revision.currentRevisionInfo.workflowState, 'released');
    assert.ok(manifest.closedDrafts[code][0].revision);
  }
  for (const code of ['LGS133', 'LGS433', 'LGS434']) {
    const revision = manifest.productRevisions[code];
    assert.notEqual(revision.currentRevision, revision.effectiveRevision);
    assert.equal(revision.currentRevisionInfo.workflowState, 'draft');
  }
});

test('BOM versions and closed Draft records survive shard round trip', async () => {
  const shards = splitPayloadToShards(payload);
  const restored = await assembleShardedPayload(shards.manifest, shards.materials,
    async (code) => shards.products.get(code));
  assert.deepEqual(restored.bomVersions, manifest.bomVersions);
  assert.deepEqual(restored.closedDrafts, manifest.closedDrafts);
});

test('a new design Draft inherits effective packaging without changing its released snapshot', () => {
  const draft = structuredClone(payload);
  createProductRevision(draft, 'LGS723', 'V9', { changeReason: 'Design change' });
  assert.equal(draft.productRevisions.LGS723.currentRevision, 'V9');
  assert.equal(draft.productRevisions.LGS723.effectiveRevision, 'V4.2');
  assert.equal(buildBomTreeRows(draft, 'LGS723', '黑色')
    .find((item) => item.mat_code === 'DWZB990300')?.qty, '2');
  assert.equal(draft.productRevisions.LGS723.revisions.find((item) => item.revision === 'V4.2')
    .snapshot.product.color_info['黑色'].materials.some((item) => item.mat_code === 'DWZB990300'), false);
});
