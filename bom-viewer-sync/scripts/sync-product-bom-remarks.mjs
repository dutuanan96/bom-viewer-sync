import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const dataRoot = path.join(repoRoot, 'data');
const checkOnly = process.argv.includes('--check');
const packagingRemarkPrefix = /^内包装[：:]\s*/;
const redundantSerialLabelRemark = /^\[包装\] 贴附编号=[^；]+；颜色=[^；]+(?:；贴附对象=待确认)?$/;
const materialsPath = path.join(dataRoot, 'materials.json');
const materialsPayload = JSON.parse(readFileSync(materialsPath, 'utf8'));
const materialIdsByCode = new Map();

for (const material of Object.values(materialsPayload.materialDb?.materials || {})) {
  if (material?.code) materialIdsByCode.set(material.code, material.id);
}

let productRowsUpdated = 0;
let bomEntriesUpdated = 0;
let serialLabelRemarksUpdated = 0;
const mismatches = [];

for (const entry of materialsPayload.materialDb.bomEntries || []) {
  const remark = String(entry?.remark || '').trim();
  if (!redundantSerialLabelRemark.test(remark)) continue;
  mismatches.push(`${entry.productCode}/${entry.color}/${entry.materialId}: redundant serial-label remark`);
  if (!checkOnly) {
    entry.remark = '';
    serialLabelRemarksUpdated += 1;
  }
}

for (const file of readdirSync(path.join(dataRoot, 'products'))) {
  if (!file.endsWith('.json')) continue;
  const productPath = path.join(dataRoot, 'products', file);
  const product = JSON.parse(readFileSync(productPath, 'utf8'));
  const productCode = String(product.code || '').trim();
  let productUpdated = false;
  for (const [color, colorData] of Object.entries(product.color_info || {})) {
    for (const row of colorData.materials || []) {
      const sourceRemark = String(row?.remark || '').trim();
      const remark = sourceRemark.replace(packagingRemarkPrefix, '');
      if (!remark) continue;
      if (sourceRemark !== remark) {
        mismatches.push(`${productCode}/${color}/${row.mat_code}/${row.comp_code}: packaging prefix`);
        if (!checkOnly) {
          row.remark = remark;
          productUpdated = true;
          productRowsUpdated += 1;
        }
      }
      const materialId = materialIdsByCode.get(row.mat_code);
      const entry = materialsPayload.materialDb.bomEntries.find((candidate) => (
        candidate.parentType === 'product' &&
        candidate.productCode === productCode &&
        candidate.color === color &&
        candidate.materialId === materialId &&
        String(candidate.comp_code || '') === String(row.comp_code || '')
      ));
      if (!entry) {
        mismatches.push(`${productCode}/${color}/${row.mat_code}/${row.comp_code}: missing BOM entry`);
        continue;
      }
      if (String(entry.remark || '').trim() === remark) continue;
      mismatches.push(`${productCode}/${color}/${row.mat_code}/${row.comp_code}`);
      if (!checkOnly) {
        entry.remark = remark;
        bomEntriesUpdated += 1;
      }
    }
  }
  if (!checkOnly && productUpdated) {
    writeFileSync(productPath, `${JSON.stringify(product, null, 2)}\n`, 'utf8');
  }
}

if (checkOnly && mismatches.length) {
  throw new Error(`Product BOM remarks are not synchronized: ${mismatches.join(', ')}`);
}
if (!checkOnly && (bomEntriesUpdated || serialLabelRemarksUpdated)) {
  writeFileSync(materialsPath, `${JSON.stringify(materialsPayload, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({
  productRowsUpdated,
  bomEntriesUpdated,
  serialLabelRemarksUpdated,
  mismatches: mismatches.length
}));
