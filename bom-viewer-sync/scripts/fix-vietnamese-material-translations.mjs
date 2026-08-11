import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const productRoot = path.join(repoRoot, 'data', 'products');
const productPaths = readdirSync(productRoot)
  .filter((name) => name.endsWith('.json'))
  .map((name) => path.join(productRoot, name));
const materialsPath = path.join(repoRoot, 'data', 'materials.json');
const writeChanges = process.argv.includes('--write');
const summaryOnly = process.argv.includes('--summary');
const hanPattern = /[\p{Script=Han}]/u;

const rowFieldPairs = [
  ['name_zh', 'name_vi', 'name'],
  ['spec', 'spec_vi', 'spec'],
  ['material_zh', 'material_vi', 'material'],
  ['color_zh', 'color_vi', 'color'],
  ['attr_zh', 'attr_vi', 'attr'],
];

function stripVietnamese(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, (letter) => letter === 'Đ' ? 'D' : 'd')
    .toLowerCase();
}

function hasVietnameseDiacritics(value) {
  return stripVietnamese(value) !== String(value || '').toLowerCase();
}

function visitRows(product, callback) {
  const visit = (row) => {
    callback(row);
    for (const child of row.materials || []) visit(child);
  };
  for (const colorInfo of Object.values(product.color_info || {})) {
    for (const row of colorInfo.materials || []) visit(row);
  }
}

const productFiles = productPaths.map((filePath) => ({
  filePath,
  data: JSON.parse(readFileSync(filePath, 'utf8')),
}));
const referenceCounts = new Map();

for (const { data } of productFiles) {
  visitRows(data, (row) => {
    for (const [zhKey, viKey, field] of rowFieldPairs) {
      const zh = String(row[zhKey] || '').trim();
      const vi = String(row[viKey] || '').trim();
      if (!zh || !vi || hanPattern.test(vi)) continue;
      const key = `${field}\u0000${zh}`;
      if (!referenceCounts.has(key)) referenceCounts.set(key, new Map());
      const counts = referenceCounts.get(key);
      counts.set(vi, (counts.get(vi) || 0) + 1);
    }
  });
}

function canonicalReference(field, zh) {
  const counts = referenceCounts.get(`${field}\u0000${zh}`);
  if (!counts) return '';
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  const total = ranked.reduce((sum, entry) => sum + entry[1], 0);
  if (ranked[0][1] < 3 || ranked[0][1] / total < 0.75) return '';
  return ranked[0][0];
}

function inferredReference(field, zh, currentVi) {
  const singleWave = field === 'spec' ? zh.match(/^\u5355\u74e6(.+)$/u) : null;
  if (singleWave) return `s\u00f3ng \u0111\u01a1n ${singleWave[1]}`;
  const singleLayer = field === 'spec' ? zh.match(/^\u5355\u5c42(.+)$/u) : null;
  if (singleLayer) return `T\u1ea7ng \u0111\u01a1n ${singleLayer[1]}`;
  const fabricDrawerBottom = field === 'name' ? zh.match(/^(LGS)\u5e03\u62bd\u5e95\u677f(.+)$/u) : null;
  if (fabricDrawerBottom) {
    const currentSize = currentVi.match(/^LGS\u5e03\u62bd\u5e95\u677f(.+)$/u)?.[1] || fabricDrawerBottom[2];
    return `${fabricDrawerBottom[1]} \u0110\u00e1y t\u00fai ${currentSize}`;
  }
  const fabricDrawer = field === 'name' ? zh.match(/^(LGS)\u5e03\u62bd(.+)$/u) : null;
  if (fabricDrawer) {
    const currentSize = currentVi.match(/^LGS\u5e03\u62bd(.+)$/u)?.[1] || fabricDrawer[2];
    return `${fabricDrawer[1]} T\u00fai v\u1ea3i ${currentSize}`;
  }
  const dedicatedCornerGuard = field === 'name' ? zh.match(/^(PP)?\u4e13\u7528\u62a4\u89d2$/u) : null;
  if (dedicatedCornerGuard) {
    return `${dedicatedCornerGuard[1] ? `${dedicatedCornerGuard[1]} ` : ''}G\u00f3c nh\u1ef1a chuy\u00ean d\u00f9ng`;
  }
  const hardwareBag = field === 'name' ? zh.match(/^(LGS\d{3,4})\u4e94\u91d1\u5305$/u) : null;
  if (hardwareBag && /tui ngu kim/i.test(currentVi)) return `${hardwareBag[1]} t\u00fai ng\u0169 kim`;
  const productPaperCard = field === 'name' ? zh.match(/^(LGS\d{3,4})\s+\u7eb8\u5361$/u) : null;
  if (productPaperCard) {
    const paperCard = canonicalReference('name', '\u7eb8\u5361');
    if (paperCard) return `${productPaperCard[1]} ${paperCard}`;
  }
  const sequenceLabel = field === 'name' ? zh.match(/^\u5e8f\u53f7\u6807\s*([A-Z]\d{2,3})$/u) : null;
  if (sequenceLabel) {
    const knownLabel = canonicalReference('name', '\u5e8f\u53f7\u6807BL');
    if (knownLabel?.endsWith('BL')) return `${knownLabel.slice(0, -2).trim()} ${sequenceLabel[1]}`;
  }
  return canonicalReference(field, zh);
}

function shouldReplace(currentVi, replacement) {
  if (!replacement || currentVi === replacement) return false;
  if (!currentVi || hanPattern.test(currentVi)) return true;
  return !hasVietnameseDiacritics(currentVi)
    && stripVietnamese(currentVi) === stripVietnamese(replacement);
}

const changes = [];
const unresolved = [];
const changedLocations = new Set();

function updatePair(target, zhKey, viKey, field, location, code) {
  const zh = String(target?.[zhKey] || '').trim();
  const vi = String(target?.[viKey] || '').trim();
  if (!zh) return;
  const replacement = inferredReference(field, zh, vi);
  if (shouldReplace(vi, replacement)) {
    target[viKey] = replacement;
    changes.push({ location, code, field: viKey, zh, before: vi, after: replacement });
    changedLocations.add(location);
  } else if (!vi || hanPattern.test(vi)) {
    unresolved.push({ location, code, field: viKey, zh, vi });
  }
}

for (const file of productFiles) {
  visitRows(file.data, (row) => {
    for (const [zhKey, viKey, field] of rowFieldPairs) {
      updatePair(file.data && row, zhKey, viKey, field, path.basename(file.filePath), row.mat_code || '');
    }
  });
}

const materialsFile = JSON.parse(readFileSync(materialsPath, 'utf8'));
for (const material of Object.values(materialsFile.materialDb?.materials || {})) {
  for (const field of ['name', 'spec', 'material', 'color', 'attr']) {
    updatePair(material[field], 'zh', 'vi', field, 'materials.json', material.code || material.id || '');
  }
}

if (writeChanges) {
  for (const file of productFiles) {
    if (changedLocations.has(path.basename(file.filePath))) {
      writeFileSync(file.filePath, `${JSON.stringify(file.data, null, 2)}\n`, 'utf8');
    }
  }
  if (changedLocations.has('materials.json')) {
    writeFileSync(materialsPath, `${JSON.stringify(materialsFile, null, 2)}\n`, 'utf8');
  }
}

function groupMappings(items, mapper) {
  const grouped = new Map();
  for (const item of items) {
    const mapped = mapper(item);
    const key = JSON.stringify(mapped);
    const existing = grouped.get(key) || { ...mapped, count: 0, codes: [] };
    existing.count += 1;
    if (item.code && !existing.codes.includes(item.code)) existing.codes.push(item.code);
    grouped.set(key, existing);
  }
  return [...grouped.values()].sort((left, right) => right.count - left.count || left.zh.localeCompare(right.zh));
}

const report = {
  mode: writeChanges ? 'write' : 'dry-run',
  changedCount: changes.length,
  unresolvedCount: unresolved.length,
  changes,
  unresolved,
};
console.log(JSON.stringify(summaryOnly ? {
  mode: report.mode,
  changedCount: report.changedCount,
  unresolvedCount: report.unresolvedCount,
  changesByField: Object.fromEntries(Object.entries(Object.groupBy(changes, (item) => item.field)).map(([field, items]) => [field, items.length])),
  unresolvedByField: Object.fromEntries(Object.entries(Object.groupBy(unresolved, (item) => item.field)).map(([field, items]) => [field, items.length])),
  changeMappings: groupMappings(changes, ({ field, zh, after }) => ({ field, zh, after })),
  unresolvedMappings: groupMappings(unresolved, ({ field, zh, vi }) => ({ field, zh, vi })),
} : report, null, 2));
