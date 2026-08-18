/**
 * One-time migration: add `unit` field to every material record in data/materials.json.
 * Unit inference rules based on attr + name keywords, matching the reference BOM convention.
 *
 * Run:
 *   node scripts/add-material-unit-field.mjs
 * Dry-run (no writes):
 *   node scripts/add-material-unit-field.mjs --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MATERIALS_FILE = path.join(ROOT, 'data', 'materials.json');
const DRY_RUN = process.argv.includes('--dry-run');

/** Infer a unit string from a material record. */
function inferUnit(record) {
  const attr = String(record.attr?.zh || '').trim();
  const name = String(record.name?.zh || '').toLowerCase();

  // --- 原材料 group ---
  if (attr === '原材料') return '根';

  // --- 五金包 group (hardware bag items) ---
  if (attr === '五金包') {
    // Screws / bolts / rivets → 颗
    if (/螺丝|螺钉|自攻|螺母|铆钉/.test(name)) return '颗';
    // Feet / handles / tools → 只
    if (/脚|把手|扳手|螺丝刀/.test(name)) return '只';
    // Everything else → 个
    return '个';
  }

  // --- 包材 group (packaging) ---
  if (attr === '包材') {
    // Foam / sponge / board → 块
    if (/泡沫|海绵|垫片板|发泡/.test(name)) return '块';
    // Manual / booklet → 本
    if (/说明书|手册/.test(name)) return '本';
    // Flat labels / cards (exclude 护角 which is shaped) → 张
    if (/纸卡|警告标|产地标|序号标|贴纸|标签/.test(name) && !/护角/.test(name)) return '张';
    // Boxes, corner guards, tape, kits → 个
    return '个';
  }

  // --- 零件 group (parts) ---
  if (attr === '零件') {
    // Hardware kit / iron set → 套
    if (/五金包|铁件|工具包|配件包/.test(name)) return '套';
    // Screws/bolts in part group → 颗 (rare, just in case)
    if (/螺丝|螺钉|自攻螺/.test(name)) return '颗';
    // Tools in part group → 只
    if (/扳手|螺丝刀/.test(name)) return '只';
    // Boards / panels / foam → 块
    if (/板|泡沫|海绵/.test(name) && !/横梁|后梁|前梁/.test(name)) return '块';
    // Bars / tubes / rails / beams / strips / wires → 根
    if (/横梁|竖梁|拉杆|杆|灯带|管|撑|线|导轨|条/.test(name)) return '根';
    // Everything else in 零件 → 个
    return '个';
  }

  // Default fallback for any unrecognized attr
  return '个';
}

function main() {
  const raw = JSON.parse(fs.readFileSync(MATERIALS_FILE, 'utf8'));
  const materials = raw.materialDb?.materials;
  if (!materials || typeof materials !== 'object') {
    console.error('ERROR: materialDb.materials not found or not an object');
    process.exit(1);
  }

  let total = 0;
  let skipped = 0;
  let assigned = 0;
  const unitCounts = {};

  for (const [id, record] of Object.entries(materials)) {
    total++;
    if (record.unit !== undefined) {
      skipped++;
      continue;
    }
    const unit = inferUnit(record);
    record.unit = unit;
    unitCounts[unit] = (unitCounts[unit] || 0) + 1;
    assigned++;
  }

  console.log(`Total: ${total}, Already had unit: ${skipped}, Newly assigned: ${assigned}`);
  console.log('Distribution:', unitCounts);

  if (DRY_RUN) {
    console.log('[DRY-RUN] No files written.');
    return;
  }

  fs.writeFileSync(MATERIALS_FILE, JSON.stringify(raw, null, 2), 'utf8');
  console.log(`Wrote ${MATERIALS_FILE}`);
}

main();
