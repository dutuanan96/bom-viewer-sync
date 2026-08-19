#!/usr/bin/env node
/**
 * Patch unit values for 53 materials based on reference Excel
 * 致欧11款斗柜黑色(BH)BOM.xlsx
 *
 * Keep unchanged (PDM is more accurate than Excel):
 *   SLPZLS6030WH  颗 (bulong nhựa — 颗 hợp lý)
 *   XHBBL010      张 (nhãn tờ — 张 hợp lý)
 *   XHBBR010      张 (nhãn tờ — 张 hợp lý)
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------- Patch map: code → correct unit (zh) from Excel ----------
const CORRECTIONS = {
  // 横杆/竖梁/支撑框 — 根 → 个
  'LGS133XQYHLBH': '个', 'LGS133XHYHLBH': '个', 'LGS133XQZHLBH': '个',
  'LGS133XHZHLBH': '个', 'LGS133SZQHLBH': '个',
  'LGS233XQYHLBH': '个', 'LGS233XHYHLBH': '个', 'LGS233XQZHLBH': '个',
  'LGS233XHZHLBH': '个', 'LGS233SZQHLBH': '个',
  'LGS334SQYHLBH': '个', 'LGS334XQZHLBH': '个', 'LGS334XHZHLBH': '个',
  'LGS334XQYHLBH': '个', 'LGS334XHYHLBH': '个', 'LGS334SZKBH':   '个',
  'LGS334SQZHLBH': '个',
  'LGS433SZKBH':   '个', 'LGS433SQHLDEPBH': '个',
  'LGS434SQZHLDEPBH': '个', 'LGS434SHZHLDEPBH': '个',
  'LGS434SQYHLDEPBH': '个', 'LGS434SHYHLDEPBH': '个',
  'LGS434SZKBH':   '个', 'LGS434DBHLBH': '个',
  'LGS723XZQSLBH': '个', 'LGS723XZHSLBH': '个', 'LGS723ZZQHLBH': '个',
  'LGS723XQHLBH':  '个', 'LGS723XHHLBH':  '个', 'LGS723SQHLBH':  '个',
  'LGS833SQHLBH':  '个',
  'LGS834QSYHLBH': '个', 'LGS834QSZHLBH': '个',
  // 横杆/支撑框 — 根 → 套 (per Excel)
  'LGS333XHHLBH': '套', 'LGS333SZKBH': '套', 'LGS333SQHLBH': '套',
  'LGS733SQHLBH': '套',
  // 灯带 — 根 → 个
  'DD1050': '个', 'DD0900': '个', 'DD0500': '个', 'DD0650': '个', 'DD1350': '个',
  // 布抽条 — 根 → 个
  'SLHGZY001BH': '个', 'SLHGZZ001BH': '个', 'SLHGZZ002BH': '个', 'SLHGZY002BH': '个',
  // 螺丝刀 — 颗 → 只
  'LNSLSD65254BZ': '只',
  // 布抽/侧框 — 个 → 套
  'BC550327187BH': '套', 'BC550327173BH': '套',
  'LGS333YKBH': '套', 'LGS333ZKBH': '套',
};

// Vietnamese equivalents for zh units
const UNIT_VI = {
  '个': 'cái', '块': 'miếng', '套': 'bộ', '根': 'thanh',
  '只': 'cái', '颗': 'viên', '张': 'tờ', '本': 'quyển',
  'pcs': 'pcs', 'm': 'm', 'm²': 'm²', 'kg': 'kg',
};

const DATA_DIR = 'data';
let totalPatched = 0;

// -------- 1. materials.json (canonical) --------
const matPath = join(DATA_DIR, 'materials.json');
const matDb = JSON.parse(readFileSync(matPath, 'utf8'));
const mats = matDb.materialDb.materials;

let patchedMats = 0;
for (const [id, record] of Object.entries(mats)) {
  const correction = CORRECTIONS[record.code];
  if (!correction) continue;
  const oldUnit = typeof record.unit === 'object' ? record.unit?.zh : record.unit;
  if (oldUnit === correction) continue;
  record.unit = { zh: correction, vi: UNIT_VI[correction] || correction };
  patchedMats++;
  console.log(`materials.json  ${record.code}  ${oldUnit} → ${correction}`);
}
writeFileSync(matPath, JSON.stringify(matDb, null, 2) + '\n', 'utf8');
console.log(`\nmaterials.json: ${patchedMats} materials patched`);
totalPatched += patchedMats;

// -------- 2. data/shards/*.json --------
const shardsDir = join(DATA_DIR, 'shards');
let shardFiles;
try { shardFiles = readdirSync(shardsDir).filter(f => f.endsWith('.json')); }
catch { shardFiles = []; }

let patchedShards = 0;
for (const sf of shardFiles) {
  const p = join(shardsDir, sf);
  const shard = JSON.parse(readFileSync(p, 'utf8'));
  const shardMats = shard?.materialDb?.materials || shard?.materials;
  if (!shardMats) continue;
  let changed = false;
  for (const record of Object.values(shardMats)) {
    const correction = CORRECTIONS[record.code];
    if (!correction) continue;
    const oldUnit = typeof record.unit === 'object' ? record.unit?.zh : record.unit;
    if (oldUnit === correction) continue;
    record.unit = { zh: correction, vi: UNIT_VI[correction] || correction };
    changed = true; patchedShards++;
  }
  if (changed) writeFileSync(p, JSON.stringify(shard, null, 2) + '\n', 'utf8');
}
console.log(`shards: ${patchedShards} records patched across ${shardFiles.length} files`);
totalPatched += patchedShards;

// -------- 3. data/products/*.json --------
const productsDir = join(DATA_DIR, 'products');
let productFiles;
try { productFiles = readdirSync(productsDir).filter(f => f.endsWith('.json')); }
catch { productFiles = []; }

let patchedProducts = 0;
function patchBomEntries(entries) {
  if (!Array.isArray(entries)) return 0;
  let n = 0;
  for (const entry of entries) {
    const correction = CORRECTIONS[entry.mat_code];
    if (correction) {
      const oldUnit = typeof entry.unit === 'object' ? entry.unit?.zh : entry.unit;
      if (oldUnit !== correction) {
        entry.unit = { zh: correction, vi: UNIT_VI[correction] || correction };
        n++;
      }
    }
    if (entry.children) n += patchBomEntries(entry.children);
  }
  return n;
}

for (const pf of productFiles) {
  const p = join(productsDir, pf);
  const prod = JSON.parse(readFileSync(p, 'utf8'));
  const count = patchBomEntries(prod?.bom || prod?.bomEntries || []);
  if (count > 0) {
    writeFileSync(p, JSON.stringify(prod, null, 2) + '\n', 'utf8');
    patchedProducts += count;
  }
}
console.log(`products: ${patchedProducts} BOM entries patched across ${productFiles.length} files`);
totalPatched += patchedProducts;

console.log(`\n✅ Total patched: ${totalPatched} records`);
console.log('Run: npm run audit:data  to verify');
