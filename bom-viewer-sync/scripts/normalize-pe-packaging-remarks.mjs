import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const dataRoot = path.join(repoRoot, 'data');
const materialsPath = path.join(dataRoot, 'materials.json');
const checkOnly = process.argv.includes('--check');
const payload = JSON.parse(readFileSync(materialsPath, 'utf8'));
const materials = payload.materialDb?.materials || {};
const materialCodes = new Map(Object.values(materials).map((material) => [material.code, material]));

function normalizeRemark(remark, bagCount) {
  const value = String(remark || '').trim();
  if (!value || value.startsWith('包装对象：')) return value;

  const sourced = value.match(/^\[包装\] 包装对象=(.+)；规则=(.+)；依据=(.+)$/);
  if (sourced) {
    return `包装对象：${sourced[1]}\n规则：${sourced[2]}；用袋：${bagCount}袋；依据：${sourced[3]}`;
  }

  const mixedRules = value.match(/^包装：(.+)$/);
  if (!mixedRules) return value;
  const [objects, details = ''] = mixedRules[1].split('；', 2);
  if (!details) {
    const itemRules = [...objects.matchAll(/([^、]+)（([^）]+)）/g)];
    if (!itemRules.length) return value;
    const packagingObjects = itemRules.map((match) => match[1]).join('、');
    const rule = itemRules.map((match) => `${match[1]}为${match[2]}`).join('；');
    return `包装对象：${packagingObjects}\n规则：${rule}；用袋：${bagCount}袋`;
  }

  const total = details.match(/^合计(\d+)件\/(\d+)袋（(.+)）$/);
  if (total) {
    return `包装对象：${objects}\n规则：${total[3]}；用袋：${total[2]}袋；合计：${total[1]}件`;
  }
  const variableRule = details.match(/^(\d+)袋（(.+)）$/);
  if (variableRule) {
    return `包装对象：${objects}\n规则：${variableRule[2]}；用袋：${variableRule[1]}袋`;
  }
  return `包装对象：${objects}\n规则：${details}；用袋：${bagCount}袋`;
}

let updated = 0;
let productRowsUpdated = 0;
const unresolved = [];
for (const entry of payload.materialDb?.bomEntries || []) {
  if (entry.parentType !== 'product' || materials[entry.materialId]?.name?.zh !== 'PE袋') continue;
  const normalized = normalizeRemark(entry.remark, entry.qty);
  if (normalized === String(entry.remark || '').trim()) continue;
  unresolved.push(`${entry.productCode}/${entry.color}/${materials[entry.materialId].code}`);
  if (!checkOnly) {
    entry.remark = normalized;
    updated += 1;
  }
}

for (const file of readdirSync(path.join(dataRoot, 'products'))) {
  if (!file.endsWith('.json')) continue;
  const productPath = path.join(dataRoot, 'products', file);
  const product = JSON.parse(readFileSync(productPath, 'utf8'));
  let productUpdated = false;
  for (const colorData of Object.values(product.color_info || {})) {
    for (const row of colorData.materials || []) {
      if (materialCodes.get(row.mat_code)?.name?.zh !== 'PE袋') continue;
      const normalized = normalizeRemark(row.remark, row.qty);
      if (normalized === String(row.remark || '').trim()) continue;
      unresolved.push(`${product.code}/${row.color_ver}/${row.mat_code}`);
      if (!checkOnly) {
        row.remark = normalized;
        productUpdated = true;
        productRowsUpdated += 1;
      }
    }
  }
  if (!checkOnly && productUpdated) {
    writeFileSync(productPath, `${JSON.stringify(product, null, 2)}\n`, 'utf8');
  }
}

if (checkOnly && unresolved.length) {
  throw new Error(`PE packaging remarks are not normalized: ${unresolved.join(', ')}`);
}
if (!checkOnly && updated) {
  writeFileSync(materialsPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({ updated, productRowsUpdated, mismatches: unresolved.length }));
