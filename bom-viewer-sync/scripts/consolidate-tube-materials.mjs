import fs from 'fs';
import path from 'path';

const materialsPath = path.resolve('data/materials.json');
const raw = fs.readFileSync(materialsPath, 'utf8');
const data = JSON.parse(raw);

const { materials, bomEntries } = data.materialDb;

// Map tube code to ID
const codeToId = {};
Object.values(materials).forEach(m => {
  if (m.code) codeToId[m.code] = m.id;
});

// Ensure target materials exist
const targetSpecs = {
  FG1515064804: { specZh: '15×15×0.6Tmm，长度 4804mm', specVi: '15×15×0.6Tmm, dài 4804mm' },
  FG1515064876: { specZh: '15×15×0.6Tmm，长度 4876mm', specVi: '15×15×0.6Tmm, dài 4876mm' },
  FG1515065011: { specZh: '15×15×0.6Tmm，长度 5011mm', specVi: '15×15×0.6Tmm, dài 5011mm' },
  FG1515065566: { specZh: '15×15×0.6Tmm，长度 5566mm', specVi: '15×15×0.6Tmm, dài 5566mm' },
  FG1515065663: { specZh: '15×15×0.6Tmm，长度 5663mm', specVi: '15×15×0.6Tmm, dài 5663mm' },
  FG1515065766: { specZh: '15×15×0.6Tmm，长度 5766mm', specVi: '15×15×0.6Tmm, dài 5766mm' },
  FG1515065814: { specZh: '15×15×0.6Tmm，长度 5814mm', specVi: '15×15×0.6Tmm, dài 5814mm' },
  FG1515065900: { specZh: '15×15×0.6Tmm，长度 5900mm', specVi: '15×15×0.6Tmm, dài 5900mm' },
  FG1515065935: { specZh: '15×15×0.6Tmm，长度 5935mm', specVi: '15×15×0.6Tmm, dài 5935mm' },
  FG1515066013: { specZh: '15×15×0.6Tmm，长度 6013mm', specVi: '15×15×0.6Tmm, dài 6013mm' },
  FG1515066091: { specZh: '15×15×0.6Tmm，长度 6091mm', specVi: '15×15×0.6Tmm, dài 6091mm' },
  FG1515066182: { specZh: '15×15×0.6Tmm，长度 6182mm', specVi: '15×15×0.6Tmm, dài 6182mm' },
};

// 18 fromCode -> toCode mapping
const mapping = {
  // Cụm 1: 4804 vs 4816 -> 4804
  FG1515064816: 'FG1515064804',
  // Cụm 2: 4864 vs 4876 -> 4876
  FG1515064864: 'FG1515064876',
  // Cụm 3: 5000 vs 5011 -> 5011
  FG1515065000: 'FG1515065011',
  // Cụm 4: 5560 vs 5566 -> 5566
  FG1515065560: 'FG1515065566',
  // Cụm 5: 5655, 5662, 5663 -> 5663
  FG1515065655: 'FG1515065663',
  FG1515065662: 'FG1515065663',
  // Cụm 6: 5752, 5753, 5766 -> 5766
  FG1515065752: 'FG1515065766',
  FG1515065753: 'FG1515065766',
  // Cụm 7: 5782, 5790, 5800, 5814 -> 5814
  FG1515065782: 'FG1515065814',
  FG1515065790: 'FG1515065814',
  FG1515065800: 'FG1515065814',
  // Cụm 8: 5884, 5886, 5900 -> 5900
  FG1515065884: 'FG1515065900',
  FG1515065886: 'FG1515065900',
  // Cụm 9: 5918, 5930, 5935 -> 5935
  FG1515065918: 'FG1515065935',
  FG1515065930: 'FG1515065935',
  // Cụm 10: 6010 vs 6013 -> 6013
  FG1515066010: 'FG1515066013',
  // Cụm 11: 6082 vs 6091 -> 6091
  FG1515066082: 'FG1515066091',
  // Cụm 12: 6170 vs 6182 -> 6182
  FG1515066170: 'FG1515066182'
};

console.log('=== BẮT ĐẦU GỘP 18 MÃ PHÔI ỐNG 15x15 ===\n');

// Build replacement map by Material ID
const idReplacementMap = {};
Object.entries(mapping).forEach(([fromCode, toCode]) => {
  const fromId = codeToId[fromCode];
  const toId = codeToId[toCode];
  if (!fromId) {
    console.warn(`Warning: fromCode ${fromCode} has no ID in database`);
    return;
  }
  if (!toId) {
    console.error(`Error: toCode ${toCode} has no ID in database!`);
    return;
  }
  idReplacementMap[fromId] = toId;
});

// Update all BOM entries
let updatedBomCount = 0;
bomEntries.forEach(b => {
  if (b.materialId && idReplacementMap[b.materialId]) {
    const oldId = b.materialId;
    const newId = idReplacementMap[oldId];
    b.materialId = newId;
    if (b.childMaterialId) b.childMaterialId = newId;
    updatedBomCount++;
  } else if (b.childMaterialId && idReplacementMap[b.childMaterialId]) {
    const oldId = b.childMaterialId;
    const newId = idReplacementMap[oldId];
    b.childMaterialId = newId;
    if (b.materialId) b.materialId = newId;
    updatedBomCount++;
  }
});
console.log(`Đã cập nhật ${updatedBomCount} BOM entries sang các mã phôi gộp.`);

// Fix split BOMs for LGS421SHLBH and LGS421QHLBH (which had 2 split lines 0.083333 each)
// Combine identical BOM entries in the same parent if any
const combinedBomEntries = [];
const parentChildMap = new Map();

bomEntries.forEach(b => {
  const key = `${b.parentId}|${b.materialId || b.childMaterialId}|${b.color || ''}`;
  if (parentChildMap.has(key)) {
    const existing = parentChildMap.get(key);
    const existingQty = parseFloat(existing.qty || '0');
    const currentQty = parseFloat(b.qty || '0');
    const sumQty = (existingQty + currentQty).toFixed(6).replace(/\.?0+$/, '');
    console.log(`Gộp 2 dòng BOM trùng lặp cho parent ${materials[b.parentId]?.code || b.parentId} child ${materials[b.materialId]?.code}: ${existing.qty} + ${b.qty} = ${sumQty}`);
    existing.qty = sumQty;
  } else {
    parentChildMap.set(key, b);
    combinedBomEntries.push(b);
  }
});

console.log(`Tổng số BOM entries sau khi gộp trùng: ${combinedBomEntries.length} (giảm ${bomEntries.length - combinedBomEntries.length} dòng)`);
data.materialDb.bomEntries = combinedBomEntries;

// Delete retired materials
let deletedCount = 0;
Object.keys(idReplacementMap).forEach(oldId => {
  const remaining = combinedBomEntries.filter(b => b.materialId === oldId || b.childMaterialId === oldId);
  if (remaining.length === 0) {
    const code = materials[oldId]?.code;
    delete materials[oldId];
    deletedCount++;
    console.log(`- Đã xóa mã phôi nghỉ hưu: ${code} (${oldId})`);
  } else {
    console.warn(`Không thể xóa ${oldId}, còn ${remaining.length} BOMs`);
  }
});

console.log(`\nTổng số mã phôi nguyên vật liệu đã xóa: ${deletedCount}`);

fs.writeFileSync(materialsPath, JSON.stringify(data, null, 2), 'utf8');
console.log('✅ Đã lưu data/materials.json thành công!');
