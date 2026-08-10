import { readFile, writeFile } from 'node:fs/promises';

const dataPath = new URL('../data/materials.json', import.meta.url);
const writeChanges = process.argv.includes('--write');

function foamDimensions(specification) {
  const dimensions = [...String(specification).matchAll(
    /(\d+(?:\.\d+)?)\s*[x×*]+\s*(\d+(?:\.\d+)?)\s*[x×*]+\s*(\d+(?:\.\d+)?)/g
  )].at(-1)?.slice(1);

  if (!dimensions) {
    throw new Error(`Cannot determine foam dimensions from specification: ${specification}`);
  }

  return dimensions.map((value, index) => {
    const integer = Number(value);
    const codePart = Number.isInteger(integer) ? String(integer) : value.replace('.', '');
    return index === 2 ? codePart.padStart(2, '0') : codePart;
  });
}

function foamCodeFromSpecification(specification) {
  return `PM${foamDimensions(specification).join('')}`;
}

function foamSignature(specification) {
  const density = String(specification).match(/(\d+(?:\.\d+)?)\s*kg/i)?.[1];
  if (!density) {
    throw new Error(`Cannot determine foam density from specification: ${specification}`);
  }
  return `${density}kg:${foamDimensions(specification).join('x')}`;
}

function needsNormalization(material) {
  return material.attr?.zh === '包材'
    && material.name?.zh === '泡沫'
    && material.code !== foamCodeFromSpecification(material.spec.zh);
}

const payload = JSON.parse(await readFile(dataPath, 'utf8'));
const materials = payload.materialDb.materials;
const candidates = Object.values(materials).filter(needsNormalization);
const targets = new Map(candidates.map(material => [material.id, foamCodeFromSpecification(material.spec.zh)]));
const groups = new Map();

for (const material of Object.values(materials)) {
  const targetCode = targets.get(material.id) ?? material.code;
  if (!targets.has(material.id) && ![...targets.values()].includes(material.code)) continue;
  const group = groups.get(targetCode) ?? [];
  group.push(material);
  groups.set(targetCode, group);
}

const replacements = new Map();
let consolidatedMaterialCount = 0;

for (const [targetCode, group] of groups) {
  const specifications = new Set(group.map(material => foamSignature(material.spec.zh)));
  if (specifications.size !== 1) {
    throw new Error(`Conflicting specifications for ${targetCode}: ${[...specifications].join(', ')}`);
  }

  const canonical = group.find(material => material.code === targetCode) ?? group[0];
  canonical.code = targetCode;
  canonical.name.zh = '泡沫';

  for (const material of group) {
    if (material.id === canonical.id) continue;
    replacements.set(material.id, canonical.id);
    delete materials[material.id];
    consolidatedMaterialCount += 1;
  }
}

for (const entry of payload.materialDb.bomEntries) {
  if (replacements.has(entry.materialId)) {
    entry.materialId = replacements.get(entry.materialId);
  }
  if (replacements.has(entry.childMaterialId)) {
    entry.childMaterialId = replacements.get(entry.childMaterialId);
  }
}

const codes = new Set();
for (const material of Object.values(materials)) {
  if (codes.has(material.code)) {
    throw new Error(`Duplicate material code after normalization: ${material.code}`);
  }
  codes.add(material.code);
}

const report = {
  candidateCount: candidates.length,
  standardizedCodeCount: groups.size,
  consolidatedMaterialCount,
  duplicateCodeCount: 0
};

if (writeChanges) {
  await writeFile(dataPath, `${JSON.stringify(payload, null, 2)}\n`);
}

console.log(JSON.stringify(report));
