import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyMutationProposalTransaction } from '../src/features/ai-assistant/mutation-engine.js';
import { buildB201WithdrawalProposalBatches } from '../src/features/ecn-proposal/b201-shanwenhei-variant-proposal-builder.js';
import {
  buildFourColorVariantProposalBatches,
  COLOR_VARIANTS,
} from '../src/features/ecn-proposal/four-color-variant-proposal-builder.js';

function loadCanonicalSnapshot() {
  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8'));
  const materialsData = JSON.parse(fs.readFileSync(path.join(root, 'data/materials.json'), 'utf8'));
  const products = Object.fromEntries(manifest.products.map((code) => [
    code, JSON.parse(fs.readFileSync(path.join(root, `data/products/${code}.json`), 'utf8')),
  ]));
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
      materialDb: materialsData.materialDb,
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

test('four approved color variants reuse master materials and create only the confirmed missing codes', () => {
  const initialSnapshot = loadCanonicalSnapshot();
  const withdrawal = buildB201WithdrawalProposalBatches(initialSnapshot.payload);
  assert.equal(withdrawal.length, 1);
  let snapshot = { ...initialSnapshot, payload: applyMutationProposalTransaction(initialSnapshot, withdrawal[0]).payload };
  const initialPayload = structuredClone(snapshot.payload);
  const missingCodes = new Set([
    'LGS033DB101BH', 'BC460327173BH',
    'LGS132DB101KD', 'LGS132YZKKD', 'LGS132DB102KD', 'LGS132CBXKD', 'LGS132ZZKKD', 'LGS132CBSKD',
    'LGS032WJBWH', 'LGS032DB101WH', 'LGS032CBSWH', 'LGS032CBXWH', 'LGS032ZZKWH', 'LGS032YZKWH',
    'LGS032XHLWH', 'LGS032XQHLWH', 'LGS032SHLWH',
  ]);

  let batchCount = 0;
  while (batchCount < 6) {
    const [batch] = buildFourColorVariantProposalBatches(snapshot.payload, 40);
    if (!batch) break;
    snapshot = { ...snapshot, payload: applyMutationProposalTransaction(snapshot, batch).payload };
    batchCount += 1;
  }
  assert.equal(batchCount, 3);
  assert.equal(buildFourColorVariantProposalBatches(snapshot.payload, 40).length, 0);

  for (const config of COLOR_VARIANTS) {
    const targetColor = colorBySku(snapshot.payload.bom[config.spu], config.sku);
    assert.equal(targetColor, config.color.zh);
    const sourceColor = colorBySku(initialPayload.bom[config.spu], config.sourceSku);
    const sourceEntries = productEntries(initialPayload, config.spu, sourceColor);
    const targetEntries = productEntries(snapshot.payload, config.spu, targetColor);
    assert.equal(targetEntries.length, sourceEntries.length);
    const replacements = new Map(config.replacements);
    sourceEntries.forEach((sourceEntry, index) => {
      const sourceCode = initialPayload.materialDb.materials[sourceEntry.materialId].code;
      const targetCode = snapshot.payload.materialDb.materials[targetEntries[index].materialId].code;
      assert.equal(targetCode, replacements.get(sourceCode) || sourceCode, `${config.spu} order ${sourceEntry.order}`);
    });
  }

  for (const code of missingCodes) assert.ok(materialByCode(snapshot.payload, code), `${code} must be created`);
  const createdCodes = Object.values(snapshot.payload.materialDb.materials)
    .filter((material) => !materialByCode(initialPayload, material.code))
    .map((material) => material.code);
  assert.deepEqual(new Set(createdCodes), missingCodes);
  assert.equal(snapshot.payload.productRevisions.LGS032.currentRevision, 'V3.2');
  assert.equal(snapshot.payload.productRevisions.LGS132.currentRevision, 'V3.2');
  assert.equal(snapshot.payload.productRevisions.LGS032.effectiveRevision, 'V3.1');
  assert.equal(snapshot.payload.productRevisions.LGS132.effectiveRevision, 'V3.1');
  const hardwarePack = materialByCode(snapshot.payload, 'LGS032WJBWH');
  const hardwareChildren = snapshot.payload.materialDb.bomEntries
    .filter((entry) => entry.parentType === 'material'
      && entry.parentId === hardwarePack.id
      && entry.productCode === 'LGS032'
      && entry.color === '白色')
    .sort((left, right) => Number(left.order) - Number(right.order));
  assert.deepEqual(
    hardwareChildren.map((entry) => snapshot.payload.materialDb.materials[entry.materialId].code),
    ['TZJD629825WH', 'BCLS129228WH', 'NLPLS6022WZ', 'GSSNZGLS5040WZ', 'NLPLS6010WZ', 'ZGLS4010WZ', 'PTZGLS6308WZ', 'SLPZLS6030WH', 'ZGLS3560WH', 'LNSLSD65254BZ', 'LNBS57253BZ', 'NLDP15508020WH'],
  );
});
