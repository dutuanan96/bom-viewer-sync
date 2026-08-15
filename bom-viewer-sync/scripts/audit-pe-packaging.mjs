import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { assertCutoverShardCount, parseLogicalShardFiles } from '../src/domain/sharded-files.js';

const SUPPLIER_PACKAGING_PATTERN = /拉杆|底脚/;
const TARGET_PATTERN = /([A-Z0-9_]*[A-Z_][A-Z0-9_]*)[×x](\d+)/g;

function materialByCode(materials) {
  return new Map(Object.values(materials).map((material) => [material.code, material]));
}

function packagingTargets(remark) {
  const targets = new Map();
  const packagingLine = String(remark || '').match(/^\s*包装对象[：:]\s*(.*)$/m)?.[1] || '';
  for (const [, code, rawQty] of packagingLine.matchAll(TARGET_PATTERN)) {
    targets.set(code, (targets.get(code) || 0) + Number(rawQty));
  }
  return targets;
}

function colorCounterpart(code) {
  if (code.endsWith('BH')) return `${code.slice(0, -2)}WH`;
  if (code.endsWith('WH')) return `${code.slice(0, -2)}BH`;
  return null;
}

function isQ195Part(row, material) {
  return material?.attr?.zh === '零件' && material?.material?.zh === 'Q195';
}

function numericQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : null;
}

export function auditPePackaging(payload) {
  const materials = payload.materialDb?.materials || {};
  const byCode = materialByCode(materials);
  const result = {
    covered: [],
    supplierProvided: [],
    unreferenced: [],
    wrongColorCode: [],
    quantityMismatch: [],
    outOfVariantTargets: [],
    unknownTargets: [],
  };

  for (const [productCode, product] of Object.entries(payload.bom || {})) {
    for (const [color, colorData] of Object.entries(product.color_info || {})) {
      const rows = colorData.materials || [];
      const rowByCode = new Map(rows.map((row) => [row.mat_code, row]));
      const targets = new Map();

      for (const bag of rows) {
        if (byCode.get(bag.mat_code)?.name?.zh !== 'PE袋') continue;
        for (const [code, quantity] of packagingTargets(bag.remark)) {
          targets.set(code, (targets.get(code) || 0) + quantity);
        }
      }

      for (const [code, quantity] of targets) {
        if (!rowByCode.has(code)) {
          const item = { productCode, color, code, quantity };
          if (byCode.has(code)) result.outOfVariantTargets.push(item);
          else result.unknownTargets.push(item);
        }
      }

      for (const row of rows) {
        const material = byCode.get(row.mat_code);
        if (!isQ195Part(row, material)) continue;

        const item = {
          productCode,
          color,
          code: row.mat_code,
          name: row.name_zh,
          bomQuantity: numericQuantity(row.qty),
        };
        const packedQuantity = targets.get(row.mat_code);
        if (packedQuantity !== undefined) {
          if (item.bomQuantity !== null && packedQuantity !== item.bomQuantity) {
            result.quantityMismatch.push({ ...item, packedQuantity });
          } else {
            result.covered.push({ ...item, packedQuantity });
          }
          continue;
        }

        if (SUPPLIER_PACKAGING_PATTERN.test(item.name || '')) {
          result.supplierProvided.push(item);
          continue;
        }

        const counterpart = colorCounterpart(item.code);
        if (counterpart && targets.has(counterpart)) {
          result.wrongColorCode.push({ ...item, referencedCode: counterpart });
          continue;
        }
        result.unreferenced.push(item);
      }
    }
  }
  return result;
}

function readCanonicalShardPayload(repoRoot) {
  const files = new Map();
  const dataRoot = path.join(repoRoot, 'data');
  for (const logicalPath of ['manifest.json', 'materials.json']) {
    const absolutePath = path.join(dataRoot, logicalPath);
    if (!lstatSync(absolutePath).isFile()) throw new Error(`Canonical shard is not a file: ${logicalPath}`);
    files.set(logicalPath, readFileSync(absolutePath, 'utf8'));
  }
  for (const entry of readdirSync(path.join(dataRoot, 'products'), { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error(`Canonical product shard is not a file: ${entry.name}`);
    files.set(`products/${entry.name}`, readFileSync(path.join(dataRoot, 'products', entry.name), 'utf8'));
  }
  assertCutoverShardCount(files);
  return parseLogicalShardFiles(files);
}

function summarize(result) {
  return Object.fromEntries(Object.entries(result).map(([key, rows]) => [key, rows.length]));
}

if (import.meta.main) {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const result = auditPePackaging(await readCanonicalShardPayload(repoRoot));
  const summary = summarize(result);
  console.log(JSON.stringify(summary, null, 2));
  if (process.argv.includes('--strict') && (
    summary.unreferenced || summary.wrongColorCode || summary.quantityMismatch || summary.outOfVariantTargets || summary.unknownTargets
  )) process.exitCode = 1;
}
