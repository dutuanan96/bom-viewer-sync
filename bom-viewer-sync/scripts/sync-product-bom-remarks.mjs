import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const dataRoot = path.join(repoRoot, 'data');
const checkOnly = process.argv.includes('--check');
const materialsPath = path.join(dataRoot, 'materials.json');
const materialsPayload = JSON.parse(readFileSync(materialsPath, 'utf8'));
const materialIdsByCode = new Map();

for (const material of Object.values(materialsPayload.materialDb?.materials || {})) {
  if (material?.code) materialIdsByCode.set(material.code, material.id);
}

let updated = 0;
const mismatches = [];
for (const file of readdirSync(path.join(dataRoot, 'products'))) {
  if (!file.endsWith('.json')) continue;
  const product = JSON.parse(readFileSync(path.join(dataRoot, 'products', file), 'utf8'));
  const productCode = String(product.code || '').trim();
  for (const [color, colorData] of Object.entries(product.color_info || {})) {
    for (const row of colorData.materials || []) {
      const remark = String(row?.remark || '').trim();
      if (!remark) continue;
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
        updated += 1;
      }
    }
  }
}

if (checkOnly && mismatches.length) {
  throw new Error(`Product BOM remarks are not synchronized: ${mismatches.join(', ')}`);
}
if (!checkOnly && updated) {
  writeFileSync(materialsPath, `${JSON.stringify(materialsPayload, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({ updated, mismatches: mismatches.length }));
