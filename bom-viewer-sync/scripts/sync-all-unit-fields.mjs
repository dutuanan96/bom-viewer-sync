/**
 * Complete migration: Add `unit` field to all materials in:
 * 1. data/materials.json (already done, but verified)
 * 2. data/manifest.json (all productRevisions snapshot materials)
 * 3. data/products/*.json (all legacy embedded materials)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MATERIALS_FILE = path.join(ROOT, 'data', 'materials.json');
const MANIFEST_FILE = path.join(ROOT, 'data', 'manifest.json');
const PRODUCTS_DIR = path.join(ROOT, 'data', 'products');

function main() {
  const matData = JSON.parse(fs.readFileSync(MATERIALS_FILE, 'utf8'));
  const canonicalMats = matData.materialDb.materials;

  // Build code -> unit map and id -> unit map
  const idToUnit = {};
  const codeToUnit = {};
  for (const [id, m] of Object.entries(canonicalMats)) {
    if (m.unit) {
      idToUnit[id] = m.unit;
      if (m.code) codeToUnit[m.code] = m.unit;
    }
  }

  // 1. Update manifest.json snapshots
  const manifestData = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  let manifestUpdated = 0;
  if (manifestData.productRevisions) {
    for (const [prodCode, revObj] of Object.entries(manifestData.productRevisions)) {
      for (const rev of revObj.revisions || []) {
        if (rev.snapshot?.materialDb?.materials) {
          for (const [id, m] of Object.entries(rev.snapshot.materialDb.materials)) {
            if (!m.unit) {
              const unit = idToUnit[id] || (m.code ? codeToUnit[m.code] : null) || '个';
              m.unit = unit;
              manifestUpdated++;
            }
          }
        }
      }
    }
  }
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifestData, null, 2) + '\n', 'utf8');
  console.log(`Updated ${manifestUpdated} snapshot materials in manifest.json`);

  // 2. Update products/*.json
  let productMaterialsUpdated = 0;
  const productFiles = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith('.json'));
  for (const file of productFiles) {
    const filePath = path.join(PRODUCTS_DIR, file);
    const prod = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let fileChanged = false;

    function updateMaterialList(list) {
      for (const item of list || []) {
        if (!item.unit && item.mat_code && codeToUnit[item.mat_code]) {
          item.unit = codeToUnit[item.mat_code];
          productMaterialsUpdated++;
          fileChanged = true;
        }
        if (item.materials && Array.isArray(item.materials)) {
          updateMaterialList(item.materials);
        }
      }
    }

    for (const ci of Object.values(prod.color_info || {})) {
      updateMaterialList(ci.materials);
    }

    if (fileChanged) {
      fs.writeFileSync(filePath, JSON.stringify(prod, null, 2) + '\n', 'utf8');
    }
  }
  console.log(`Updated ${productMaterialsUpdated} materials across ${productFiles.length} product files`);
}

main();
