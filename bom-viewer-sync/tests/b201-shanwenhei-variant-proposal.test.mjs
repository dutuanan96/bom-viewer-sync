import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyMutationProposalTransaction } from '../src/features/ai-assistant/mutation-engine.js';
import {
  buildB201ProposalBatches,
  buildB201WithdrawalProposalBatches,
  VARIANT_CONFIGS,
} from '../src/features/ecn-proposal/b201-shanwenhei-variant-proposal-builder.js';

function loadCanonicalSnapshot() {
  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8'));
  const materialsData = JSON.parse(fs.readFileSync(path.join(root, 'data/materials.json'), 'utf8'));
  const products = Object.fromEntries(manifest.products.map((productCode) => [
    productCode,
    JSON.parse(fs.readFileSync(path.join(root, `data/products/${productCode}.json`), 'utf8')),
  ]));
  const bomEntries = materialsData.materialDb.bomEntries.filter((entry) => {
    if (entry.parentType === 'material') return true;
    const productCode = entry.productCode || entry.parentId;
    return Boolean(products[productCode]?.color_info?.[entry.color]);
  });
  return {
    isAdmin: true,
    canEditRevision: false,
    dirty: false,
    selection: { productCode: null, color: null },
    payload: {
      bom: products,
      productImages: manifest.productImages,
      productRevisions: manifest.productRevisions,
      notifications: manifest.notifications,
      materialDb: { ...materialsData.materialDb, bomEntries },
    },
  };
}

function materialByCode(payload, code) {
  return Object.values(payload.materialDb.materials).find((material) => material.code === code);
}

function colorBySku(product, sku) {
  return Object.entries(product.color_info).find(([, info]) => info.sku === sku)?.[0];
}

function productEntries(payload, productCode, color) {
  return payload.materialDb.bomEntries
    .filter((entry) => entry.parentType === 'product'
      && (entry.productCode === productCode || entry.parentId === productCode)
      && entry.color === color)
    .sort((left, right) => Number(left.order) - Number(right.order));
}

function shanWenHeiCode(code) {
  return `${code.slice(0, -2)}SWH`;
}

test('B201 shanwenhei variants clone black BOMs and replace only fabric drawers and SKU cartons', async (t) => {
  const initialSnapshot = loadCanonicalSnapshot();
  if (VARIANT_CONFIGS.every((config) => colorBySku(initialSnapshot.payload.bom[config.spu], config.sku))) {
    t.skip('canonical snapshot already contains the approved B201 variants');
    return;
  }
  const initialPayload = structuredClone(initialSnapshot.payload);
  let snapshot = initialSnapshot;
  let batchCount = 0;

  while (batchCount < 10) {
    const [batch] = buildB201ProposalBatches(snapshot.payload, 40);
    if (!batch) break;
    assert.ok(batch.operations.length > 0 && batch.operations.length <= 40);
    const transaction = applyMutationProposalTransaction(snapshot, batch);
    snapshot = { ...snapshot, payload: transaction.payload };
    batchCount += 1;
  }

  assert.ok(batchCount > 0 && batchCount < 10, `Unexpected batch count: ${batchCount}`);
  assert.equal(buildB201ProposalBatches(snapshot.payload, 40).length, 0);
  const finalPayload = snapshot.payload;

  await t.test('creates exactly nine reusable shanwenhei fabric materials and eleven SKU-specific cartons', () => {
    const fabricCodes = [...new Set(VARIANT_CONFIGS.flatMap((config) => config.fabricCodes))];
    assert.equal(fabricCodes.length, 9);
    for (const sourceCode of fabricCodes) {
      const source = materialByCode(initialPayload, sourceCode);
      const target = materialByCode(finalPayload, shanWenHeiCode(sourceCode));
      assert.ok(target, `${shanWenHeiCode(sourceCode)} must exist`);
      assert.deepEqual(target.name, source.name);
      assert.deepEqual(target.spec, source.spec);
      assert.deepEqual(target.material, source.material);
      assert.deepEqual(target.color, { zh: '山纹黑', vi: 'màu đen vân gỗ' });
    }
    for (const config of VARIANT_CONFIGS) {
      const source = materialByCode(initialPayload, config.cartonCode);
      const target = materialByCode(finalPayload, shanWenHeiCode(config.cartonCode));
      assert.ok(target, `${shanWenHeiCode(config.cartonCode)} must exist`);
      assert.deepEqual(target.spec, source.spec);
      assert.deepEqual(target.material, source.material);
      assert.deepEqual(target.color, source.color);
      assert.match(target.name.zh, new RegExp(config.sku));
      assert.deepEqual(target.drawings, []);
      assert.deepEqual(target.models3d, []);
    }
  });

  await t.test('creates eleven shanwenhei SKUs in Draft revisions without changing production effectivity', () => {
    for (const config of VARIANT_CONFIGS) {
      const product = finalPayload.bom[config.spu];
      const color = colorBySku(product, config.sku);
      assert.equal(color, '山纹黑');
      assert.equal(product.color_info[color].color_ver_vi, 'màu đen vân gỗ');
      assert.equal(finalPayload.productRevisions[config.spu].currentRevisionInfo.workflowState, 'draft');
      assert.equal(
        finalPayload.productRevisions[config.spu].effectiveRevision,
        initialPayload.productRevisions[config.spu].effectiveRevision,
      );
      assert.equal(finalPayload.productImages?.[config.spu]?.['山纹黑'], undefined);
    }
  });

  await t.test('preserves every BOM row except the confirmed fabric bags and printed carton', () => {
    for (const config of VARIANT_CONFIGS) {
      const initialProduct = initialPayload.bom[config.spu];
      const sourceColor = colorBySku(initialProduct, config.sourceSku);
      const sourceEntries = productEntries(initialPayload, config.spu, sourceColor);
      const targetEntries = productEntries(finalPayload, config.spu, '山纹黑');
      assert.equal(targetEntries.length, sourceEntries.length, `${config.spu} row count mismatch`);
      const replacementCodes = new Set([...config.fabricCodes, config.cartonCode]);
      sourceEntries.forEach((sourceEntry, index) => {
        const targetEntry = targetEntries[index];
        const sourceMaterial = initialPayload.materialDb.materials[sourceEntry.materialId];
        const targetMaterial = finalPayload.materialDb.materials[targetEntry.materialId];
        const expectedCode = replacementCodes.has(sourceMaterial.code)
          ? shanWenHeiCode(sourceMaterial.code)
          : sourceMaterial.code;
        assert.equal(targetMaterial.code, expectedCode, `${config.spu} unexpected replacement at order ${sourceEntry.order}`);
        assert.equal(targetEntry.qty, sourceEntry.qty);
        assert.equal(targetEntry.comp_code, sourceEntry.comp_code);
        assert.equal(targetEntry.stt, sourceEntry.stt);
      });
    }
  });

  await t.test('does not mutate any source black BOM', () => {
    for (const config of VARIANT_CONFIGS) {
      const sourceColor = colorBySku(initialPayload.bom[config.spu], config.sourceSku);
      const before = productEntries(initialPayload, config.spu, sourceColor)
        .map((entry) => ({ ...entry, materialCode: initialPayload.materialDb.materials[entry.materialId]?.code }));
      const after = productEntries(finalPayload, config.spu, sourceColor)
        .map((entry) => ({ ...entry, materialCode: finalPayload.materialDb.materials[entry.materialId]?.code }));
      assert.deepEqual(after, before);
    }
  });
});

test('B201 withdrawal proposal restores the preceding effective revisions while preserving the B201 Drafts', () => {
  const snapshot = loadCanonicalSnapshot();
  const batches = buildB201WithdrawalProposalBatches(snapshot.payload);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].operations.length, 11);
  const transaction = applyMutationProposalTransaction(snapshot, batches[0]);
  for (const config of VARIANT_CONFIGS) {
    const revision = transaction.payload.productRevisions[config.spu];
    assert.equal(revision.currentRevisionInfo.workflowState, 'draft');
    assert.equal(revision.effectiveRevision, revision.currentRevisionInfo.sourceRevision);
    assert.equal(colorBySku(transaction.payload.bom[config.spu], config.sku), '山纹黑');
  }
});
