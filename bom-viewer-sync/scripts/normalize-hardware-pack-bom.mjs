import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isHardwarePackSummary } from '../src/domain/materials.js';
import { syncLegacyBomFromMaterialDb } from '../src/domain/relationships.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const dataRoot = path.join(repoRoot, 'data');
const applyChanges = process.argv.includes('--apply');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const manifestPath = path.join(dataRoot, 'manifest.json');
const materialsPath = path.join(dataRoot, 'materials.json');
const manifest = readJson(manifestPath);
const materialsShard = readJson(materialsPath);
const products = Object.create(null);
const productPaths = new Map();

for (const fileName of readdirSync(path.join(dataRoot, 'products')).filter((name) => name.endsWith('.json')).sort()) {
  const filePath = path.join(dataRoot, 'products', fileName);
  const product = readJson(filePath);
  products[product.code] = product;
  productPaths.set(product.code, filePath);
}

const payload = {
  bom: products,
  productRevisions: manifest.productRevisions || {},
  materialDb: materialsShard.materialDb,
};
const materialDb = payload.materialDb;
const materials = materialDb.materials || {};
const originalEntries = materialDb.bomEntries || [];
const childMaterialId = (entry) => entry.childMaterialId || entry.materialId || '';
const directHardwareEntries = originalEntries.filter((entry) => (
  entry.parentType === 'product' && materials[entry.materialId]?.attr?.zh === '五金包'
));

const normalizedRelations = originalEntries
  .filter((entry) => entry.parentType === 'material')
  .map((entry) => ({ ...entry }));

for (const relation of normalizedRelations) {
  if (!isHardwarePackSummary(materials[relation.parentId]) || (relation.productCode && relation.color)) continue;
  const parentCode = String(materials[relation.parentId]?.code || '');
  const productCode = parentCode.match(/^LGS\d+/i)?.[0]?.toUpperCase() || '';
  const candidates = directHardwareEntries.filter((entry) => (
    entry.productCode === productCode && entry.materialId === childMaterialId(relation)
  ));
  if (candidates.length !== 1) {
    throw new Error(`Cannot infer one product/color scope for relation ${relation.id}: ${candidates.length} candidates`);
  }
  relation.productCode = candidates[0].productCode;
  relation.color = candidates[0].color;
}

const relationKeys = new Set();
const duplicateRelationIds = new Set();
const deduplicatedRelations = normalizedRelations.filter((entry) => {
  const key = [
    entry.parentId,
    entry.productCode || '',
    entry.color || '',
    childMaterialId(entry),
    entry.qty || '',
  ].join('|');
  if (relationKeys.has(key)) {
    duplicateRelationIds.add(entry.id);
    return false;
  }
  relationKeys.add(key);
  return true;
});

const canonicalHardwareRelations = deduplicatedRelations.filter((entry) => (
  isHardwarePackSummary(materials[entry.parentId])
));
for (const directEntry of directHardwareEntries) {
  const hasCanonicalRelation = canonicalHardwareRelations.some((relation) => (
    relation.productCode === directEntry.productCode &&
    relation.color === directEntry.color &&
    childMaterialId(relation) === directEntry.materialId
  ));
  if (!hasCanonicalRelation) {
    throw new Error(`Direct hardware item ${directEntry.id} has no canonical pack relation`);
  }
}

const directHardwareEntryIds = new Set(directHardwareEntries.map((entry) => entry.id));
const normalizedRelationById = new Map(deduplicatedRelations.map((entry) => [entry.id, entry]));
materialDb.bomEntries = originalEntries.flatMap((entry) => {
  if (directHardwareEntryIds.has(entry.id) || duplicateRelationIds.has(entry.id)) return [];
  if (entry.parentType === 'material') return [normalizedRelationById.get(entry.id) || entry];
  return [entry];
});
syncLegacyBomFromMaterialDb(payload);

const nextMaterialsText = jsonText(materialsShard);
const changedProducts = [];
for (const [productCode, product] of Object.entries(products)) {
  const filePath = productPaths.get(productCode);
  if (readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n') !== jsonText(product)) changedProducts.push(productCode);
}
const materialsChanged = readFileSync(materialsPath, 'utf8').replace(/\r\n/g, '\n') !== nextMaterialsText;

console.log(`Direct hardware rows removed: ${directHardwareEntries.length}`);
console.log(`Duplicate relations removed: ${normalizedRelations.length - deduplicatedRelations.length}`);
console.log(`Product shards normalized: ${changedProducts.length}`);

if (!materialsChanged && !changedProducts.length) {
  console.log('Hardware-pack BOM is already canonical.');
  process.exit(0);
}

if (!applyChanges) {
  console.error('Hardware-pack BOM normalization is required. Run with --apply.');
  process.exit(1);
}

writeFileSync(materialsPath, nextMaterialsText, 'utf8');
for (const productCode of changedProducts) {
  writeFileSync(productPaths.get(productCode), jsonText(products[productCode]), 'utf8');
}
console.log('Hardware-pack BOM normalization applied.');
