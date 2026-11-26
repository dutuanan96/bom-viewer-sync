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

test('closed label Drafts retain their audit record and the LGS133 Draft stays open', () => {
  assert.equal(Object.keys(manifest.closedDrafts).length, 15);
  for (const code of Object.keys(manifest.closedDrafts)) {
    const revision = manifest.productRevisions[code];
    assert.equal(revision.currentRevision, revision.effectiveRevision);
    assert.equal(revision.currentRevisionInfo.workflowState, 'released');
    assert.ok(manifest.closedDrafts[code][0].revision);
  }
  const revision = manifest.productRevisions.LGS133;
  assert.notEqual(revision.currentRevision, revision.effectiveRevision);
  assert.equal(revision.currentRevisionInfo.workflowState, 'draft');
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

test('LGS033 B1 replaces packaging for the three existing colors without modifying V4.2', () => {
  const code = 'LGS033';
  const revision = manifest.productRevisions[code];
  const active = payloadForProductRevision(payload, code, 'V4.2');
  const baselineSnapshot = structuredClone(revision.revisions.find((item) => item.revision === 'V4.2'));
  const replacements = [
    ['ZHJ5050105', 'ZHJ505090', '50x50x90mm', '4'],
    ['PM32210511', 'PM3229008', '20kg, 322x90x8mm', '2'],
  ];

  assert.equal(manifest.bomVersions[code].effectiveVersion, 'B1');
  assert.equal(revision.currentRevision, 'V4.2');
  assert.equal(revision.effectiveRevision, 'V4.2');
  assert.equal(productRevisionOptions(payload, code).filter((item) => item.revision === 'V4.2').length, 1);
  assert.equal(payloadForProductRevision(active, code, 'V4.2'), active);
  assert.deepEqual(Object.keys(active.bom[code].color_info), ['复古色', '白色', '黑色']);

  for (const [oldCode, newCode, spec, quantity] of replacements) {
    const oldId = Object.values(materials.materialDb.materials).find((item) => item.code === oldCode).id;
    const newId = Object.values(materials.materialDb.materials).find((item) => item.code === newCode).id;
    for (const color of active.bom[code].colors) {
      const rows = resolveBomRows(active, code, color);
      const tree = buildBomTreeRows(active, code, color);
      assert.equal(rows.length, resolveBomRows(payload, code, color).length);
      assert.ok(rows.every((item) => item.mat_code !== oldCode));
      assert.ok(tree.every((item) => item.mat_code !== oldCode));
      const row = rows.find((item) => item.mat_code === newCode);
      assert.equal(row?.spec, spec);
      assert.equal(row?.qty, quantity);
      assert.match(row?.remark, /1001/);
      assert.equal(tree.find((item) => item.mat_code === newCode)?.qty, quantity);
      assert.equal(new PdmKnowledge({ payload }).getBom({ productId: code, color })
        .rows.find((item) => item.matCode === newCode)?.qty, quantity);
      assert.ok(products[code].color_info[color].materials.some((item) => item.mat_code === oldCode));
    }
    const isEffectiveUse = (item) => item.productCode === code && item.status === 'effective';
    assert.equal(materialWhereUsed(payload, newId).usageEntries.filter(isEffectiveUse).length, 3);
    assert.equal(materialWhereUsed(payload, oldId).usageEntries.filter(isEffectiveUse).length, 0);
  }
  assert.deepEqual(revision.revisions.find((item) => item.revision === 'V4.2'), baselineSnapshot);
});

test('LGS834 B1 applies the new packaging to all three existing SKUs on V4.2', () => {
  const code = 'LGS834';
  const revision = manifest.productRevisions[code];
  const version = manifest.bomVersions[code];
  const active = payloadForProductRevision(payload, code, 'V4.2');

  assert.equal(revision.currentRevision, 'V4.2');
  assert.equal(revision.effectiveRevision, 'V4.2');
  assert.equal(version.effectiveVersion, 'B1');
  assert.equal(version.changes.length, 9);
  assert.deepEqual(active.bom[code].colors, ['白色', '黑色', '山纹黑']);
  assert.equal(payloadForProductRevision(active, code, 'V4.2'), active);

  for (const [color, carton] of [
    ['白色', 'LGS834ZFXWHB1'],
    ['黑色', 'LGS834ZFXBHB1'],
    ['山纹黑', 'LGS834ZFXSWHB1'],
  ]) {
    const rows = resolveBomRows(active, code, color);
    const oldRows = products[code].color_info[color].materials;
    const tree = buildBomTreeRows(active, code, color);
    assert.equal(rows.length, oldRows.length);
    for (const [materialCode, spec, qty] of [
      [carton, '975x380x155mm', '1'],
      ['PM60012010', '16kg, 600x120x10mm', '2'],
      ['PM66031006', '16kg, 660x310x6mm', '1'],
    ]) {
      const row = rows.find((item) => item.mat_code === materialCode);
      assert.equal(row?.spec, spec);
      assert.equal(row?.qty, qty);
      assert.equal(tree.find((item) => item.mat_code === materialCode)?.qty, qty);
    }
    for (const replacement of version.changes.filter((row) => row.color === color)) {
      assert.ok(oldRows.some((row) => row.mat_code === replacement.code));
      assert.ok(rows.every((row) => row.mat_code !== replacement.code));
    }
  }
  for (const materialCode of ['PM60012010', 'PM66031006']) {
    const material = Object.values(materials.materialDb.materials).find((item) => item.code === materialCode);
    const usage = materialWhereUsed(payload, material.id).usageEntries;
    assert.equal(usage.length, 3);
    assert.ok(usage.every((item) => item.productCode === code && item.status === 'effective'));
  }
  assert.equal(payloadForProductRevision(payload, code, 'V4.1').bom[code].colors.includes('山纹黑'), false);
});
