import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyMutationProposalTransaction } from '../src/features/ai-assistant/mutation-engine.js';
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

function materialChildPairs(payload, materialCode, replacements = new Map()) {
  const parent = materialByCode(payload, materialCode);
  assert.ok(parent, `${materialCode} must exist`);
  return payload.materialDb.bomEntries
    .filter((entry) => entry.parentType === 'material' && entry.parentId === parent.id)
    .map((entry) => [
      replacements.get(payload.materialDb.materials[entry.childMaterialId || entry.materialId].code)
        || payload.materialDb.materials[entry.childMaterialId || entry.materialId].code,
      String(entry.qty),
    ])
    .sort(([leftCode, leftQuantity], [rightCode, rightQuantity]) => (
      leftCode.localeCompare(rightCode) || leftQuantity.localeCompare(rightQuantity)
    ));
}

test('corrective ECN completes all nested color BOM mappings without creating another revision', () => {
  let snapshot = loadCanonicalSnapshot();
  const initialRevisions = Object.fromEntries(['LGS032', 'LGS033', 'LGS132', 'LGS133']
    .map((spu) => [spu, snapshot.payload.productRevisions[spu].currentRevision]));

  let batchCount = 0;
  while (batchCount < 4) {
    const [batch] = buildFourColorVariantProposalBatches(snapshot.payload, 40);
    if (!batch) break;
    snapshot = { ...snapshot, payload: applyMutationProposalTransaction(snapshot, batch).payload };
    batchCount += 1;
  }
  assert.equal(batchCount, 2);
  assert.equal(buildFourColorVariantProposalBatches(snapshot.payload, 40).length, 0);

  for (const config of COLOR_VARIANTS) {
    const targetColor = colorBySku(snapshot.payload.bom[config.spu], config.sku);
    assert.equal(targetColor, config.color.zh);
    const sourceColor = colorBySku(snapshot.payload.bom[config.spu], config.sourceSku);
    const sourceEntries = productEntries(snapshot.payload, config.spu, sourceColor);
    const targetEntries = productEntries(snapshot.payload, config.spu, targetColor);
    assert.equal(targetEntries.length, sourceEntries.length);
    const replacements = new Map(config.replacements);
    sourceEntries.forEach((sourceEntry, index) => {
      const sourceCode = snapshot.payload.materialDb.materials[sourceEntry.materialId].code;
      const targetCode = snapshot.payload.materialDb.materials[targetEntries[index].materialId].code;
      assert.equal(targetCode, replacements.get(sourceCode) || sourceCode, `${config.spu} order ${sourceEntry.order}`);
    });
  }

  for (const [spu, revision] of Object.entries(initialRevisions)) {
    assert.equal(snapshot.payload.productRevisions[spu].currentRevision, revision, `${spu} revision must stay unchanged`);
  }

  const whiteChildReplacements = new Map([
    ['M6GS1515BH', 'M6GS1515WH'],
    ['NLPLS6018BZ', 'NLPLS6018WZ'],
  ]);
  for (const [sourceCode, targetCode] of COLOR_VARIANTS.find((config) => config.spu === 'LGS032').replacements) {
    if (sourceCode === 'LGS032WJBBH') continue;
    assert.deepEqual(
      materialChildPairs(snapshot.payload, targetCode),
      materialChildPairs(snapshot.payload, sourceCode, whiteChildReplacements),
      `${targetCode} must retain the full mapped child BOM`,
    );
  }
  for (const [sourceCode, targetCode] of COLOR_VARIANTS.find((config) => config.spu === 'LGS132').replacements) {
    assert.deepEqual(
      materialChildPairs(snapshot.payload, targetCode),
      materialChildPairs(snapshot.payload, sourceCode),
      `${targetCode} must retain the full mapped child BOM`,
    );
  }
  for (const spu of ['LGS033', 'LGS133']) {
    const config = COLOR_VARIANTS.find((candidate) => candidate.spu === spu);
    for (const [sourceCode, targetCode] of config.replacements) {
      assert.deepEqual(
        materialChildPairs(snapshot.payload, targetCode),
        materialChildPairs(snapshot.payload, sourceCode),
        `${targetCode} must retain the full mapped child BOM`,
      );
    }
  }

  assert.equal(materialByCode(snapshot.payload, 'DD0310WH').color.zh, '白泊板');
  const lgs032WhiteEntries = productEntries(snapshot.payload, 'LGS032', '白色');
  const lgs032WhiteCodes = new Set(lgs032WhiteEntries
    .map((entry) => snapshot.payload.materialDb.materials[entry.materialId].code));
  assert.ok(lgs032WhiteCodes.has('LGS032ZKWH647'));
  assert.ok(lgs032WhiteCodes.has('LGS032YKWH647'));
  assert.ok(lgs032WhiteCodes.has('DD0310WH'));
  assert.ok(!lgs032WhiteCodes.has('DD0310'));

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
  const blackHardwarePack = materialByCode(snapshot.payload, 'LGS032WJBBH');
  assert.equal(
    snapshot.payload.materialDb.bomEntries.filter((entry) => entry.parentType === 'material'
      && entry.parentId === blackHardwarePack.id
      && entry.productCode === 'LGS032'
      && entry.color === '白色').length,
    0,
  );
});
