import fs from 'fs';
import path from 'path';

const materialsFilePath = path.resolve('data/materials.json');
const materialsData = JSON.parse(fs.readFileSync(materialsFilePath, 'utf8'));

if (!materialsData.materialDb) {
  materialsData.materialDb = {};
}
if (!materialsData.materialDb.materials) {
  materialsData.materialDb.materials = {};
}
if (!materialsData.materialDb.bomEntries) {
  materialsData.materialDb.bomEntries = [];
}

const materials = materialsData.materialDb.materials;
const bomEntries = materialsData.materialDb.bomEntries;

// 1. Add Master Material FG1515064930 if not exists
const newMaterialId = 'mat_fg1515064930';
if (!materials[newMaterialId]) {
  materials[newMaterialId] = {
    id: newMaterialId,
    code: 'FG1515064930',
    name: {
      zh: '方管',
      vi: 'Sắt hộp'
    },
    spec: {
      zh: '15×15×0.6Tmm，长度 4930mm',
      vi: '15×15×0.6Tmm, dài 4930mm'
    },
    material: {
      zh: 'Q195',
      vi: 'Q195'
    },
    color: {
      zh: '光亮',
      vi: 'sáng bóng'
    },
    attr: {
      zh: '原材料',
      vi: 'Nguyên vật liệu'
    },
    drawings: [],
    models3d: [],
    unit: {
      zh: '根',
      vi: 'thanh'
    }
  };
  console.log(`Added new master material: ${newMaterialId} (FG1515064930)`);
} else {
  console.log(`Master material ${newMaterialId} already exists`);
}

// 2. Identify 18 frame IDs for 647x335mm
const targetFrameIds = new Set([
  'mat_lgs043zkbh647',
  'mat_lgs043ykbh647',
  'mat_lgs132zkbh647',
  'mat_lgs132ykbh647',
  'mat_lgs133zkbh647',
  'mat_lgs133ykbh647',
  'mat_lgs334zkbh647',
  'mat_lgs334ykbh647',
  'mat_lgs434zkwh647',
  'mat_lgs434ykwh647',
  'mat_lgs723zkbh647',
  'mat_lgs723ykbh647',
  'mat_lgs723zkwh647',
  'mat_lgs723ykwh647',
  'mat_lgs834zkbh647',
  'mat_lgs834ykbh647',
  'mat_lgs834zkwh647',
  'mat_lgs834ykwh647'
]);

const targetCodes = new Set([
  'LGS043ZKBH647',
  'LGS043YKBH647',
  'LGS132ZKBH647',
  'LGS132YKBH647',
  'LGS133ZKBH647',
  'LGS133YKBH647',
  'LGS334ZKBH647',
  'LGS334YKBH647',
  'LGS434ZKWH647',
  'LGS434YKWH647',
  'LGS723ZKBH647',
  'LGS723YKBH647',
  'LGS723ZKWH647',
  'LGS723YKWH647',
  'LGS834ZKBH647',
  'LGS834YKBH647',
  'LGS834ZKWH647',
  'LGS834YKWH647'
]);

let mainPipeUpdatedCount = 0;
let crossPipeUpdatedCount = 0;

for (const entry of bomEntries) {
  const pId = entry.parentId || entry.parentMaterialId;
  if (targetFrameIds.has(pId) || targetCodes.has(pId)) {
    const childId = entry.childMaterialId || entry.materialId;

    // Check main pipe replacement: FG1515064804 or FG1515064816 -> FG1515064930
    if (
      childId === 'mat_fg1515064804647' ||
      childId === 'mat_fg1515064804' ||
      childId === 'FG1515064804' ||
      childId === 'mat_fg1515064816647' ||
      childId === 'mat_fg1515064816' ||
      childId === 'FG1515064816'
    ) {
      entry.childMaterialId = newMaterialId;
      entry.materialId = newMaterialId;
      entry.qty = '0.333333';
      mainPipeUpdatedCount++;
      console.log(`Updated main pipe for ${pId} -> ${newMaterialId} (qty: 0.333333)`);
    }

    // Check cross pipe replacement: FG1515065790 on LGS723 -> FG1515066170
    if (
      childId === 'mat_fg1515065790' ||
      childId === 'FG1515065790'
    ) {
      entry.childMaterialId = 'mat_fg1515066170';
      entry.materialId = 'mat_fg1515066170';
      entry.qty = '0.05';
      crossPipeUpdatedCount++;
      console.log(`Updated cross pipe for ${pId} -> mat_fg1515066170 (qty: 0.05)`);
    }
  }
}

console.log(`Total main pipe entries updated: ${mainPipeUpdatedCount}`);
console.log(`Total cross pipe entries updated: ${crossPipeUpdatedCount}`);

// Save back to data/materials.json
fs.writeFileSync(materialsFilePath, JSON.stringify(materialsData, null, 2) + '\n', 'utf8');
console.log('Saved data/materials.json successfully.');
