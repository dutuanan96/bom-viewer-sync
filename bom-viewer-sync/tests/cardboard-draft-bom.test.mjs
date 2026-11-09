import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { payloadForProductRevision } from '../src/domain/revisions.js';

const read = (path) => JSON.parse(fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = read('data/manifest.json');
const materialDb = read('data/materials.json').materialDb;

for (const [productCode, materialCode, spec] of [
  ['LGS723', 'DWZB990300', '990x300mm'],
  ['LGS733', 'DWZB1130300', '1130x300mm'],
]) {
test(`${productCode} effective packaging BOM contains two cardboard sheets without design revision`, () => {
    const revision = manifest.productRevisions[productCode];
    const product = read(`data/products/${productCode}.json`);
    const material = Object.values(materialDb.materials).find((item) => item.code === materialCode);
    const active = payloadForProductRevision({ ...manifest, materialDb, bom: { [productCode]: product } },
      productCode, 'V4.2');
    const rows = active.bom[productCode].color_info['黑色'].materials.filter((item) => item.mat_code === materialCode);
    const entries = active.materialDb.bomEntries.filter((item) => item.productCode === productCode
      && item.color === '黑色' && item.materialId === material?.id);
    assert.equal(revision.currentRevision, 'V4.2');
    assert.equal(revision.effectiveRevision, 'V4.2');
    assert.equal(revision.currentRevisionInfo.workflowState, 'released');
    assert.equal(material?.spec.zh, spec);
    assert.equal(material?.unit.zh, '张');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].qty, '2');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].qty, '2');
    for (const [color, variant] of Object.entries(product.color_info)) {
      if (color !== '黑色') assert.ok(variant.materials.every((item) => item.mat_code !== materialCode));
    }
    const effective = revision.revisions.find((item) => item.revision === 'V4.2');
    assert.ok(effective);
    assert.ok(effective.snapshot.product.color_info['黑色'].materials
      .every((item) => item.mat_code !== materialCode));
  });
}
