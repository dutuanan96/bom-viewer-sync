/**
 * Deduplicate Canonical Materials & Remap BOM References
 * 
 * Unifies duplicate materials with identical technical specifications into canonical materials,
 * remaps all BOM entries and product JSON shards, and removes orphan duplicate records.
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const materialsPath = path.join(repoRoot, 'data', 'materials.json');
const productsDir = path.join(repoRoot, 'data', 'products');

// 1. Read materials.json
const rawMaterials = fs.readFileSync(materialsPath, 'utf8');
const materialsData = JSON.parse(rawMaterials);
const materials = materialsData.materialDb.materials;
const bomEntries = materialsData.materialDb.bomEntries;

console.log('=== STARTING MATERIAL DEDUPLICATION & BOM REMAPPING ===');
console.log(`Initial materials count: ${Object.keys(materials).length}`);
console.log(`Initial BOM entries count: ${bomEntries.length}`);

// 2. Define canonical material additions/updates
const CANONICAL_DDGDKKR1 = {
  id: 'mat_ddgdkkr1',
  code: 'DDGDKKR1',
  name: {
    zh: '自粘灯带固定卡扣',
    vi: 'Khóa cố định dây đèn tự dính'
  },
  spec: {
    zh: '以实际为准',
    vi: 'theo thực tế'
  },
  material: {
    zh: 'PP',
    vi: 'PP'
  },
  color: {
    zh: '白色',
    vi: 'màu trắng'
  },
  attr: {
    zh: '零件',
    vi: 'linh kiện'
  },
  drawings: [],
  models3d: [],
  unit: {
    zh: '根',
    vi: 'thanh'
  }
};

// Add DDGDKKR1 to materials
materials[CANONICAL_DDGDKKR1.id] = CANONICAL_DDGDKKR1;

// 3. Mapping of retired material IDs to canonical material IDs
const ID_REMAP = {
  // LGS421 side panels -> LGS420
  'mat_14lrnc4': 'mat_id7glj', // LGS421CBZYKD -> LGS420CBZYKD (复古色)
  'mat_1tcgi6o': 'mat_jz7mz1', // LGS421CBZYBH -> LGS420CBZYBH (黑色)

  // LED clips (9 old codes) -> DDGDKKR1
  'mat_47zmys': 'mat_ddgdkkr1', // DD1050R1
  'mat_r787pi': 'mat_ddgdkkr1', // DD0310R1
  'mat_13imrat': 'mat_ddgdkkr1', // DD0900R1
  'mat_az72aa': 'mat_ddgdkkr1', // DD1500R1
  'mat_17un1su': 'mat_ddgdkkr1', // DD0400R1
  'mat_1oeda3c': 'mat_ddgdkkr1', // DD1700R1
  'mat_1abho09': 'mat_ddgdkkr1', // DD0500R1
  'mat_1j506i6': 'mat_ddgdkkr1', // DD0650R1
  'mat_ijhbi8': 'mat_ddgdkkr1', // DD1350R1

  // ST5x38 screw -> WZ
  'mat_aqgyo3': 'mat_37j9ck', // GSSNZGLS5040WH -> GSSNZGLS5040WZ
};

// Mapping of retired material codes to canonical material codes for product JSONs
const CODE_REMAP = {
  'LGS421CBZYKD': 'LGS420CBZYKD',
  'LGS421CBZYBH': 'LGS420CBZYBH',
  'DD1050R1': 'DDGDKKR1',
  'DD0310R1': 'DDGDKKR1',
  'DD0900R1': 'DDGDKKR1',
  'DD1500R1': 'DDGDKKR1',
  'DD0400R1': 'DDGDKKR1',
  'DD1700R1': 'DDGDKKR1',
  'DD0500R1': 'DDGDKKR1',
  'DD0650R1': 'DDGDKKR1',
  'DD1350R1': 'DDGDKKR1',
  'GSSNZGLS5040WH': 'GSSNZGLS5040WZ',
};

// List of retired material IDs to remove from materialDb.materials
const RETIRED_MATERIAL_IDS = [
  // LGS231XHLBH (orphan)
  'mat_1xbfswb',

  // LGS421 panels
  'mat_14lrnc4',
  'mat_1tcgi6o',

  // LED clips (9 old codes)
  'mat_47zmys',
  'mat_r787pi',
  'mat_13imrat',
  'mat_az72aa',
  'mat_17un1su',
  'mat_1oeda3c',
  'mat_1abho09',
  'mat_1j506i6',
  'mat_ijhbi8',

  // ST5x38 WH screw
  'mat_aqgyo3',

  // 纸卡 (14 orphan codes)
  'mat_kmfvry', // LGS031ZK
  'mat_14l5oxj', // LGS032ZK
  'mat_rkasfe', // LGS033ZK
  'mat_1wv5gal', // LGS232ZK
  'mat_1bo9pcf', // LGS333ZK
  'mat_1df1w8e', // LGS433ZK
  'mat_jvzvz7', // LGS733ZK
  'mat_i7io6q', // LGS833ZK
  'mat_dqhrxf', // LGS111ZK
  'mat_x8jdfj', // LGS133ZK
  'mat_13k6uej', // LGS131ZK
  'mat_1m8fmss', // LGS420ZK
  'mat_rjeops', // LGS334ZK
  'mat_1zbn', // LGS434ZK

  // 纸护角 (2 orphan codes)
  'mat_1horzo8', // ZHJ5050055
  'mat_fsi9u8', // ZHJ5050065
];

// 4. Remap materialDb.bomEntries and remove orphan child entries of retired parents
const retiredSet = new Set(RETIRED_MATERIAL_IDS);

const filteredBomEntries = bomEntries.filter(entry => {
  if (entry.parentType === 'material' && entry.parentId && retiredSet.has(entry.parentId)) {
    return false;
  }
  return true;
});

let remappedEntriesCount = 0;
for (const entry of filteredBomEntries) {
  if (entry.materialId && ID_REMAP[entry.materialId]) {
    entry.materialId = ID_REMAP[entry.materialId];
    remappedEntriesCount++;
  }
  if (entry.childMaterialId && ID_REMAP[entry.childMaterialId]) {
    entry.childMaterialId = ID_REMAP[entry.childMaterialId];
  }
}
materialsData.materialDb.bomEntries = filteredBomEntries;
console.log(`Remapped ${remappedEntriesCount} material references in materialDb.bomEntries (removed ${bomEntries.length - filteredBomEntries.length} orphan parent-child entries)`);

// 5. Remove retired material records from materialDb.materials
let removedCount = 0;
for (const rid of RETIRED_MATERIAL_IDS) {
  if (materials[rid]) {
    delete materials[rid];
    removedCount++;
  }
}
console.log(`Removed ${removedCount} retired material records from materialDb.materials`);
console.log(`Remaining materials count: ${Object.keys(materials).length}`);

// 6. Save updated data/materials.json
fs.writeFileSync(materialsPath, JSON.stringify(materialsData, null, 2) + '\n', 'utf8');
console.log(`Saved updated ${materialsPath}`);

// 7. Update data/products/*.json shards
const productFiles = fs.readdirSync(productsDir).filter(f => f.endsWith('.json'));
let updatedProductFilesCount = 0;
let updatedProductRowsCount = 0;

for (const pFile of productFiles) {
  const pPath = path.join(productsDir, pFile);
  const pData = JSON.parse(fs.readFileSync(pPath, 'utf8'));
  let fileModified = false;

  function updateMaterialRow(row) {
    if (!row || typeof row !== 'object') return;
    const oldCode = row.mat_code;
    if (oldCode && CODE_REMAP[oldCode]) {
      const newCode = CODE_REMAP[oldCode];
      row.mat_code = newCode;
      fileModified = true;
      updatedProductRowsCount++;

      // If LED clip, update attributes to match DDGDKKR1
      if (newCode === 'DDGDKKR1') {
        row.name_zh = CANONICAL_DDGDKKR1.name.zh;
        row.name_vi = CANONICAL_DDGDKKR1.name.vi;
        row.spec = CANONICAL_DDGDKKR1.spec.zh;
        row.spec_vi = CANONICAL_DDGDKKR1.spec.vi;
        row.material_zh = CANONICAL_DDGDKKR1.material.zh;
        row.material_vi = CANONICAL_DDGDKKR1.material.vi;
        row.color_zh = CANONICAL_DDGDKKR1.color.zh;
        row.color_vi = CANONICAL_DDGDKKR1.color.vi;
        row.attr_zh = CANONICAL_DDGDKKR1.attr.zh;
        row.attr_vi = CANONICAL_DDGDKKR1.attr.vi;
        row.unit = CANONICAL_DDGDKKR1.unit.zh;
      } else if (newCode === 'LGS420CBZYKD') {
        const matRecord = materials['mat_id7glj'];
        row.name_zh = matRecord.name.zh;
        row.name_vi = matRecord.name.vi;
        row.spec = matRecord.spec.zh;
        row.spec_vi = matRecord.spec.vi;
        row.material_zh = matRecord.material.zh;
        row.material_vi = matRecord.material.vi;
        row.color_zh = matRecord.color.zh;
        row.color_vi = matRecord.color.vi;
      } else if (newCode === 'LGS420CBZYBH') {
        const matRecord = materials['mat_jz7mz1'];
        row.name_zh = matRecord.name.zh;
        row.name_vi = matRecord.name.vi;
        row.spec = matRecord.spec.zh;
        row.spec_vi = matRecord.spec.vi;
        row.material_zh = matRecord.material.zh;
        row.material_vi = matRecord.material.vi;
        row.color_zh = matRecord.color.zh;
        row.color_vi = matRecord.color.vi;
      } else if (newCode === 'GSSNZGLS5040WZ') {
        const matRecord = materials['mat_37j9ck'];
        row.name_zh = matRecord.name.zh;
        row.name_vi = matRecord.name.vi;
        row.spec = matRecord.spec.zh;
        row.spec_vi = matRecord.spec.vi;
        row.material_zh = matRecord.material.zh;
        row.material_vi = matRecord.material.vi;
        row.color_zh = matRecord.color.zh;
        row.color_vi = matRecord.color.vi;
      }
    }
    if (Array.isArray(row.materials)) {
      row.materials.forEach(updateMaterialRow);
    }
  }

  for (const colorData of Object.values(pData.color_info || {})) {
    if (Array.isArray(colorData.materials)) {
      colorData.materials.forEach(updateMaterialRow);
    }
  }

  if (fileModified) {
    fs.writeFileSync(pPath, JSON.stringify(pData, null, 2) + '\n', 'utf8');
    updatedProductFilesCount++;
    console.log(`Updated product shard: ${pFile}`);
  }
}

console.log(`Updated ${updatedProductRowsCount} rows across ${updatedProductFilesCount} product shard files.`);
console.log('=== MATERIAL DEDUPLICATION & BOM REMAPPING COMPLETE ===');
