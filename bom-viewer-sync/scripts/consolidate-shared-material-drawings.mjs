/**
 * JinTai PDM - Consolidate Shared Material Drawings
 *
 * Canonicalizes 2D drawing URLs across shared materials that have identical
 * name.zh, spec.zh, material.zh, and attr.zh, ensuring a Single Source of Truth.
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const materialsPath = path.join(repoRoot, 'data', 'materials.json');

export function loadMaterials() {
  return JSON.parse(fs.readFileSync(materialsPath, 'utf8'));
}

export function consolidateDrawings(matData) {
  const materials = matData.materialDb?.materials || {};

  // Group materials by technical signature: name.zh | spec.zh | material.zh | attr.zh
  const groups = new Map();

  for (const [id, m] of Object.entries(materials)) {
    const nameZh = String(m.name?.zh || '').trim();
    const specZh = String(m.spec?.zh || '').trim();
    const rawMatZh = String(m.material?.zh || '').trim();
    const attrZh = String(m.attr?.zh || '').trim();
    const drawings = m.drawings || [];

    if (!drawings.length) continue;

    const key = `${nameZh} | ${specZh} | ${rawMatZh} | ${attrZh}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id, material: m });
  }

  let totalUpdated = 0;
  const changes = [];

  for (const [key, list] of groups.entries()) {
    if (list.length <= 1) continue;

    // Collect all drawings in this group
    const allDrawings = [];
    for (const item of list) {
      for (const d of item.material.drawings) {
        allDrawings.push(d);
      }
    }

    // Determine the best/canonical drawing:
    // 1. Prefer CDN/github URL if available
    // 2. Prefer drawing with the most complete name or highest file size / newest revision
    // 3. Fallback to the first valid drawing
    let canonicalDrawing = allDrawings.find(d => (d.url || '').includes('jsdelivr') || (d.url || '').includes('github'));
    if (!canonicalDrawing) {
      // Find longest path or name (e.g. LGS334_434_834 instead of LGS334_434)
      canonicalDrawing = allDrawings.reduce((best, cur) => {
        const bestScore = (best.path || '').length + (best.name || '').length;
        const curScore = (cur.path || '').length + (cur.name || '').length;
        return curScore > bestScore ? cur : best;
      }, allDrawings[0]);
    }

    if (!canonicalDrawing) continue;

    // Standardize drawing object
    const canonicalDrawingObj = {
      name: canonicalDrawing.name,
      path: canonicalDrawing.path,
      url: canonicalDrawing.url,
      previewUrl: canonicalDrawing.previewUrl || canonicalDrawing.url,
    };

    // Apply to all items in group
    for (const item of list) {
      const currentDrawings = item.material.drawings || [];
      const currentDrawing = currentDrawings[0];
      const isDifferent =
        currentDrawings.length !== 1 ||
        !currentDrawing ||
        currentDrawing.url !== canonicalDrawingObj.url ||
        currentDrawing.path !== canonicalDrawingObj.path;

      if (isDifferent) {
        item.material.drawings = [JSON.parse(JSON.stringify(canonicalDrawingObj))];
        totalUpdated++;
        changes.push({
          id: item.id,
          code: item.material.code,
          name: item.material.name?.zh,
          color: item.material.color?.zh,
          canonicalUrl: canonicalDrawingObj.url,
          canonicalPath: canonicalDrawingObj.path,
        });
      }
    }
  }

  return { totalUpdated, changes, matData };
}

if (process.argv[1] === import.meta.filename) {
  const matData = loadMaterials();
  const isDryRun = process.argv.includes('--dry-run');

  console.log(`Consolidating shared material drawings (dryRun: ${isDryRun})...\n`);
  const result = consolidateDrawings(matData);

  console.log(`Total materials updated: ${result.totalUpdated}`);
  for (const c of result.changes) {
    console.log(`✓ [${c.code}] ${c.name} (${c.color || '-'}) -> ${c.canonicalPath || c.canonicalUrl}`);
  }

  if (!isDryRun && result.totalUpdated > 0) {
    fs.writeFileSync(materialsPath, JSON.stringify(result.matData, null, 2) + '\n', 'utf8');
    console.log(`\nSuccessfully saved changes to data/materials.json!`);
  }
}
