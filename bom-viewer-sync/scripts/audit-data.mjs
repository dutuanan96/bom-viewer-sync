/**
 * PDM Data Integrity Audit Script
 * Checks for: duplicate materials, orphan entries, missing fields,
 * parent-child inconsistencies, BOM entry issues.
 */
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { resolveBomRows } from '../src/domain/bom.js';
import { parseDataJsPayload } from '../src/infrastructure/github-data.js';
import { assertCutoverShardCount, parseLogicalShardFiles } from '../src/domain/sharded-files.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const dataArgumentIndex = process.argv.indexOf('--data');
const dataPath = dataArgumentIndex >= 0 ? process.argv[dataArgumentIndex + 1] : null;

function readCanonicalShardPayload() {
  const logicalFiles = new Map();
  const dataRoot = path.join(repoRoot, 'data');
  for (const logicalPath of ['manifest.json', 'materials.json']) {
    const absolutePath = path.join(dataRoot, logicalPath);
    if (!lstatSync(absolutePath).isFile()) throw new Error(`Canonical shard is not a file: ${logicalPath}`);
    logicalFiles.set(logicalPath, readFileSync(absolutePath, 'utf8'));
  }

  const productsRoot = path.join(dataRoot, 'products');
  for (const entry of readdirSync(productsRoot, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error(`Canonical product shard is not a file: ${entry.name}`);
    const logicalPath = `products/${entry.name}`;
    logicalFiles.set(logicalPath, readFileSync(path.join(productsRoot, entry.name), 'utf8'));
  }

  assertCutoverShardCount(logicalFiles);
  return parseLogicalShardFiles(logicalFiles);
}

if (dataArgumentIndex >= 0 && !dataPath) throw new Error('--data requires a data.js rollback snapshot path');
const payload = dataPath
  ? parseDataJsPayload(readFileSync(path.resolve(dataPath), 'utf8'))
  : await readCanonicalShardPayload();
console.log(dataPath
  ? 'Audit source: rollback snapshot (not canonical runtime data)'
  : 'Audit source: canonical runtime shards (24)');

const issues = [];
function report(severity, category, message, detail) {
  issues.push({ severity, category, message, detail });
}

// 1. Check material database
const materials = payload.materialDb?.materials || {};
const bomEntries = payload.materialDb?.bomEntries || [];
const materialCount = Object.keys(materials).length;
console.log(`Materials: ${materialCount}`);
console.log(`BOM Entries: ${bomEntries.length}`);
console.log(`Products: ${Object.keys(payload.bom || {}).length}`);
console.log(`Notifications: ${(payload.notifications || []).length}`);

// 2. Duplicate material codes
const codeToIds = {};
Object.values(materials).forEach(m => {
  const code = m.code || '';
  if (!code) {
    report('WARNING', 'MATERIAL', `Material ${m.id} has no code`, m);
    return;
  }
  if (!codeToIds[code]) codeToIds[code] = [];
  codeToIds[code].push(m.id);
});
Object.entries(codeToIds).forEach(([code, ids]) => {
  if (ids.length > 1) {
    report('ERROR', 'DUPLICATE_CODE', `Material code "${code}" used by ${ids.length} IDs`, ids);
  }
});

// 3. BOM entries referencing non-existent materials
bomEntries.forEach(entry => {
  if (entry.materialId && !materials[entry.materialId]) {
    report('ERROR', 'ORPHAN_ENTRY', `BOM entry ${entry.id} references missing material ${entry.materialId}`, entry);
  }
  if (entry.parentType === 'material' && entry.parentId && !materials[entry.parentId]) {
    report('ERROR', 'ORPHAN_PARENT', `BOM entry ${entry.id} references missing parent ${entry.parentId}`, entry);
  }
  if (entry.childMaterialId && !materials[entry.childMaterialId]) {
    report('ERROR', 'ORPHAN_CHILD', `BOM entry ${entry.id} references missing child material ${entry.childMaterialId}`, entry);
  }
});

// 4. Product BOM missing materials
Object.entries(payload.bom || {}).forEach(([productCode, product]) => {
  Object.entries(product.color_info || {}).forEach(([colorName, colorData]) => {
    const rows = resolveBomRows(payload, productCode, colorName);
    if (!rows.length) {
      report('WARNING', 'EMPTY_BOM', `${productCode}/${colorName} has 0 BOM rows`, null);
    }
    // Check for missing fields
    rows.forEach((row, i) => {
      if (!row.mat_code) report('WARNING', 'MISSING_CODE', `${productCode}/${colorName} row ${i}: no mat_code`, row);
    });
  });
});

// 5. Materials with empty name
Object.values(materials).forEach(m => {
  if (!m.name?.zh && !m.name?.vi) {
    report('WARNING', 'EMPTY_NAME', `Material ${m.code || m.id} has no name`, m);
  }
});

// 6. BOM entry duplicate check (same product+color+material)
const entryKeys = new Map();
bomEntries.filter(e => e.parentType === 'product').forEach(entry => {
  const key = `${entry.productCode}|${entry.color}|${entry.materialId}|${entry.comp_code || ''}`;
  if (!entryKeys.has(key)) entryKeys.set(key, []);
  entryKeys.get(key).push(entry.id);
});
entryKeys.forEach((ids, key) => {
  if (ids.length > 1) {
    report('WARNING', 'DUPLICATE_ENTRY', `Duplicate BOM entries for key ${key}`, ids);
  }
});

// 7. Parent-child circular references
const parentChildMap = new Map();
bomEntries.filter(e => e.parentType === 'material').forEach(entry => {
  const parentId = entry.parentId;
  const childId = entry.childMaterialId || entry.materialId;
  if (!parentChildMap.has(parentId)) parentChildMap.set(parentId, new Set());
  parentChildMap.get(parentId).add(childId);
});
function detectCycle(startId, visited = new Set()) {
  if (visited.has(startId)) return true;
  visited.add(startId);
  const children = parentChildMap.get(startId) || new Set();
  for (const childId of children) {
    if (detectCycle(childId, new Set(visited))) return true;
  }
  return false;
}
parentChildMap.forEach((children, parentId) => {
  children.forEach(childId => {
    if (parentChildMap.has(childId)) {
      if (detectCycle(parentId)) {
        report('ERROR', 'CIRCULAR_REF', `Circular parent-child: ${parentId} -> ${childId}`, null);
      }
    }
  });
});

// 8. Notification integrity
(payload.notifications || []).forEach(n => {
  if (!n.id) report('WARNING', 'NOTIFICATION', 'Notification missing id', n);
  if (!n.createdAt) report('WARNING', 'NOTIFICATION', 'Notification missing createdAt', n);
  if (n.changes && n.changes.length) {
    n.changes.forEach(c => {
      if (!c.code) report('WARNING', 'NOTIFICATION', `Notification ${n.id} has change without code`, c);
    });
  }
});

// 9. Products without colors array
Object.entries(payload.bom || {}).forEach(([code, product]) => {
  if (!product.colors || !product.colors.length) {
    report('WARNING', 'PRODUCT', `Product ${code} has no colors array`, product);
  }
  if (!product.color_info || !Object.keys(product.color_info).length) {
    report('ERROR', 'PRODUCT', `Product ${code} has no color_info`, product);
  }
});

// Print results
console.log(`\n=== AUDIT RESULTS ===`);
console.log(`Total issues: ${issues.length}`);
const errors = issues.filter(i => i.severity === 'ERROR');
const warnings = issues.filter(i => i.severity === 'WARNING');
if (errors.length || warnings.length) process.exitCode = 1;
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);

if (errors.length) {
  console.log('\n--- ERRORS ---');
  errors.forEach(e => console.log(`[${e.category}] ${e.message}`));
}
if (warnings.length) {
  console.log('\n--- WARNINGS ---');
  warnings.forEach(w => console.log(`[${w.category}] ${w.message}`));
}

// 10. Summary stats
const productsWithBom = Object.entries(payload.bom || {}).map(([code, product]) => {
  const colorCount = Object.keys(product.color_info || {}).length;
  const totalRows = Object.entries(product.color_info || {}).reduce((sum, [cn]) =>
    sum + resolveBomRows(payload, code, cn).length, 0);
  return { code, colorCount, totalRows };
});
console.log('\n--- PRODUCT SUMMARY ---');
productsWithBom.forEach(p => console.log(`${p.code}: ${p.colorCount} colors, ${p.totalRows} total BOM rows`));

// JSON output for further analysis
const summary = {
  materialCount,
  bomEntryCount: bomEntries.length,
  productCount: Object.keys(payload.bom || {}).length,
  notificationCount: (payload.notifications || []).length,
  errorCount: errors.length,
  warningCount: warnings.length,
  duplicateCodes: Object.entries(codeToIds).filter(([, ids]) => ids.length > 1).map(([code, ids]) => ({ code, count: ids.length, ids })),
  errors: errors.map(e => ({ category: e.category, message: e.message })),
  warnings: warnings.slice(0, 20).map(w => ({ category: w.category, message: w.message }))
};
console.log('\n--- JSON SUMMARY ---');
console.log(JSON.stringify(summary, null, 2));
