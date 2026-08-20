import fs from 'fs';
import path from 'path';

const materialsPath = path.resolve('data/materials.json');
const raw = fs.readFileSync(materialsPath, 'utf8');
const data = JSON.parse(raw);

const { materials, bomEntries } = data.materialDb;

console.log('--- Step 1: Adding new raw materials ---');

// 1. FG132132105190
if (!materials['mat_fg132132105190']) {
  materials['mat_fg132132105190'] = {
    id: 'mat_fg132132105190',
    code: 'FG132132105190',
    name: { zh: '方管', vi: 'Sắt hộp' },
    spec: { zh: '13.2×13.2×1Tmm，长度 5190mm', vi: '13.2×13.2×1Tmm, dài 5190mm' },
    material: { zh: 'Q195', vi: 'Q195' },
    color: { zh: '光亮', vi: 'sáng bóng' },
    attr: { zh: '原材料', vi: 'Nguyên vật liệu' },
    drawings: [],
    models3d: [],
    unit: { zh: '根', vi: 'thanh' }
  };
  console.log('+ Added mat_fg132132105190 (13.2x13.2x1T 5190mm)');
}

// 2. FG3015065014
if (!materials['mat_fg3015065014']) {
  materials['mat_fg3015065014'] = {
    id: 'mat_fg3015065014',
    code: 'FG3015065014',
    name: { zh: '方管', vi: 'Sắt hộp' },
    spec: { zh: '30×15×0.6Tmm，长度 5014mm', vi: '30×15×0.6Tmm, dài 5014mm' },
    material: { zh: 'Q195', vi: 'Q195' },
    color: { zh: '光亮', vi: 'sáng bóng' },
    attr: { zh: '原材料', vi: 'Nguyên vật liệu' },
    drawings: [],
    models3d: [],
    unit: { zh: '根', vi: 'thanh' }
  };
  console.log('+ Added mat_fg3015065014 (30x15x0.6T 5014mm)');
}

// 3. FG3015066550
if (!materials['mat_fg3015066550']) {
  materials['mat_fg3015066550'] = {
    id: 'mat_fg3015066550',
    code: 'FG3015066550',
    name: { zh: '方管', vi: 'Sắt hộp' },
    spec: { zh: '30×15×0.6Tmm，长度 6550mm', vi: '30×15×0.6Tmm, dài 6550mm' },
    material: { zh: 'Q195', vi: 'Q195' },
    color: { zh: '光亮', vi: 'sáng bóng' },
    attr: { zh: '原材料', vi: 'Nguyên vật liệu' },
    drawings: [],
    models3d: [],
    unit: { zh: '根', vi: 'thanh' }
  };
  console.log('+ Added mat_fg3015066550 (30x15x0.6T 6550mm)');
}

// 4. FG28136065190
if (!materials['mat_fg28136065190']) {
  materials['mat_fg28136065190'] = {
    id: 'mat_fg28136065190',
    code: 'FG28136065190',
    name: { zh: '方管', vi: 'Sắt hộp' },
    spec: { zh: '28×13.6×0.6Tmm，长度 5190mm', vi: '28×13.6×0.6Tmm, dài 5190mm' },
    material: { zh: 'Q195', vi: 'Q195' },
    color: { zh: '光亮', vi: 'sáng bóng' },
    attr: { zh: '原材料', vi: 'Nguyên vật liệu' },
    drawings: [],
    models3d: [],
    unit: { zh: '根', vi: 'thanh' }
  };
  console.log('+ Added mat_fg28136065190 (28x13.6x0.6T 5190mm)');
}

console.log('\n--- Step 2: Fixing LGS233 647mm frame components ---');
const lgs233FrameIds = [
  'mat_lgs233zkbh647',
  'mat_lgs233ykbh647',
  'mat_lgs233zkwh647',
  'mat_lgs233ykwh647'
];

lgs233FrameIds.forEach(id => {
  const m = materials[id];
  if (m) {
    m.spec = { zh: '647x335x15mm', vi: '647x335x15mm' };
    console.log(`Updated spec for ${m.code} -> 647x335x15mm`);
  }
});

// Update BOM entries of LGS233 frames: replace FG1515064804 with FG1515064930
let lgs233BomFixCount = 0;
bomEntries.forEach(b => {
  if (lgs233FrameIds.includes(b.parentId)) {
    if (b.materialId === 'mat_fg1515064804647' || b.childMaterialId === 'mat_fg1515064804647' ||
        materials[b.materialId]?.code === 'FG1515064804') {
      b.materialId = 'mat_fg1515064930';
      if (b.childMaterialId) b.childMaterialId = 'mat_fg1515064930';
      b.qty = '0.333333';
      lgs233BomFixCount++;
    }
  }
});
console.log(`Updated ${lgs233BomFixCount} BOM entries for LGS233 frames to FG1515064930`);

console.log('\n--- Step 3: Standardizing 13.2x13.2 connector tubes in 19 parent components ---');
const old132ChildIds = ['mat_fg132132065990', 'mat_fg132132066150', 'mat_80132132ljj'];
const parent132Ids = [
  'mat_14esgeh', 'mat_1cp9ev', 'mat_1gdsuz4', 'mat_1glusot', 'mat_1iggj1x',
  'mat_1q0gpue', 'mat_1saxqhd', 'mat_1ss85ek', 'mat_1t1yeyb', 'mat_1tpfqgh',
  'mat_1xtwol6', 'mat_1yw5hcz', 'mat_5p95gk', 'mat_8edcv4', 'mat_i2358e',
  'mat_ivadk', 'mat_moakt4', 'mat_mzzijl', 'mat_yoxn6d'
];

// Remove old 13.2 BOM entries for these parents
const initialBomCount = bomEntries.length;
const filteredBomEntries = bomEntries.filter(b => {
  if (parent132Ids.includes(b.parentId) && old132ChildIds.includes(b.materialId)) {
    return false;
  }
  return true;
});

const removed132Boms = initialBomCount - filteredBomEntries.length;
console.log(`Removed ${removed132Boms} old 13.2mm / 80132132LJJ BOM entries`);

// Add one standardized 13.2mm BOM entry for each parent
let added132Count = 0;
parent132Ids.forEach(pid => {
  filteredBomEntries.push({
    id: `bomc_${pid}_mat_fg132132105190`,
    parentType: 'material',
    parentId: pid,
    materialId: 'mat_fg132132105190',
    childMaterialId: 'mat_fg132132105190',
    qty: '0.015625',
    order: 1,
    comp_code: '',
    stt: ''
  });
  added132Count++;
});
console.log(`Added ${added132Count} standardized FG132132105190 BOM entries (qty: 0.015625)`);

console.log('\n--- Step 4: Standardizing LGS834 30x15 and 28x13.6 tubes ---');
// LGS834QSYHLWH (mat_1v7m89j) & LGS834QSYHLBH (mat_t6gqeb) -> FG3015065014 (0.125) & FG28136065190 (0.015625)
// LGS834QSZHLWH (mat_16kpy8h) & LGS834QSZHLBH (mat_i7u7xx) -> FG3015066550 (0.125)
filteredBomEntries.forEach(b => {
  if (b.parentId === 'mat_1v7m89j' || b.parentId === 'mat_t6gqeb') {
    if (b.materialId === 'mat_fg3015065632' || materials[b.materialId]?.code === 'FG3015065632') {
      b.materialId = 'mat_fg3015065014';
      if (b.childMaterialId) b.childMaterialId = 'mat_fg3015065014';
      b.qty = '0.125';
      console.log(`Updated 30x15 tube in ${materials[b.parentId]?.code} -> FG3015065014 (0.125)`);
    } else if (b.materialId === 'mat_fg28136066150' || materials[b.materialId]?.code === 'FG28136066150') {
      b.materialId = 'mat_fg28136065190';
      if (b.childMaterialId) b.childMaterialId = 'mat_fg28136065190';
      b.qty = '0.015625';
      console.log(`Updated 28x13.6 tube in ${materials[b.parentId]?.code} -> FG28136065190 (0.015625)`);
    }
  } else if (b.parentId === 'mat_16kpy8h' || b.parentId === 'mat_i7u7xx') {
    if (b.materialId === 'mat_fg3015065740' || materials[b.materialId]?.code === 'FG3015065740') {
      b.materialId = 'mat_fg3015066550';
      if (b.childMaterialId) b.childMaterialId = 'mat_fg3015066550';
      b.qty = '0.125';
      console.log(`Updated 30x15 tube in ${materials[b.parentId]?.code} -> FG3015066550 (0.125)`);
    }
  }
});

// Remove product-level redundant LJJ8028136 from LGS834
const finalBomEntries = filteredBomEntries.filter(b => {
  if (b.parentId === 'LGS834' && b.materialId === 'mat_y8rp64') {
    console.log(`Removed redundant product BOM entry LJJ8028136 from LGS834 (${b.color})`);
    return false;
  }
  return true;
});

// Delete unused retired materials
const retiredMatIds = [
  'mat_fg132132065990',
  'mat_fg132132066150',
  'mat_80132132ljj',
  'mat_fg3015065632',
  'mat_fg3015065740',
  'mat_fg28136066150',
  'mat_y8rp64'
];

retiredMatIds.forEach(id => {
  // Check if any BOM still references it
  const remaining = finalBomEntries.filter(b => b.materialId === id || b.parentId === id);
  if (remaining.length === 0) {
    const code = materials[id]?.code;
    delete materials[id];
    console.log(`Cleaned up unused material ${code} (${id})`);
  } else {
    console.warn(`Cannot delete material ${id}, still used in ${remaining.length} BOMs`);
  }
});

data.materialDb.bomEntries = finalBomEntries;

fs.writeFileSync(materialsPath, JSON.stringify(data, null, 2), 'utf8');
console.log('\n Successfully updated data/materials.json');
