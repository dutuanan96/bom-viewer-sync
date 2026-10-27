import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildFourColorVariantProposalBatches,
  COLOR_VARIANTS,
} from '../src/features/ecn-proposal/four-color-variant-proposal-builder.js';

function loadCanonicalPayload() {
  const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
  const materials = JSON.parse(fs.readFileSync('data/materials.json', 'utf8'));
  const bom = Object.fromEntries(manifest.products.map((code) => [code,
    JSON.parse(fs.readFileSync(path.join('data/products', `${code}.json`), 'utf8')),
  ]));
  return { bom, materialDb: materials.materialDb, productRevisions: manifest.productRevisions };
}

test('approved four-color variants resolve to the current BOM and Material Master', () => {
  const payload = loadCanonicalPayload();
  for (const config of COLOR_VARIANTS) {
    const product = payload.bom[config.spu];
    const color = Object.keys(product.color_info).find((key) => product.color_info[key].sku === config.sku);
    assert.equal(color, config.color.zh, `${config.spu}/${config.sku} color`);
    const entries = payload.materialDb.bomEntries.filter((entry) => entry.parentType === 'product'
      && entry.productCode === config.spu && entry.color === color);
    assert.ok(entries.length > 0, `${config.spu}/${color} must have BOM entries`);
    for (const entry of entries) {
      assert.ok(payload.materialDb.materials[entry.materialId], `${config.spu}/${color}/${entry.id} material`);
    }
  }
});

test('completed four-color ECN does not rerun after its source material was replaced', () => {
  const payload = loadCanonicalPayload();
  assert.equal(Object.values(payload.materialDb.materials).some((material) => material.code === 'LG05254BH'), false);
  assert.deepEqual(buildFourColorVariantProposalBatches(payload, 40), []);
});
