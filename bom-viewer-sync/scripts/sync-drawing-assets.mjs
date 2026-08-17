/**
 * JinTai PDM - Automated Drawing Asset Sync Tool
 * 
 * Scans local / Google Drive folders for 2D drawings (PDF), matches them with
 * materials in the PDM database, copies/hashes them into drawings/catalog/,
 * and updates data/materials.json with canonical CDN and local paths.
 *
 * Usage:
 *   node scripts/sync-drawing-assets.mjs --source "D:\1.金汰产品\..."
 *   node scripts/sync-drawing-assets.mjs --source "G:\My Drive\..." --dry-run
 *   node scripts/sync-drawing-assets.mjs --links links.json
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const materialsPath = path.join(repoRoot, 'data', 'materials.json');
const catalogDir = path.join(repoRoot, 'drawings', 'catalog');

// Parse CLI flags
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const sourceIdx = args.indexOf('--source');
const sourcePath = sourceIdx >= 0 ? args[sourceIdx + 1] : null;
const linksIdx = args.indexOf('--links');
const linksPath = linksIdx >= 0 ? args[linksIdx + 1] : null;

export function loadMaterialsData() {
  const content = readFileSync(materialsPath, 'utf8');
  return JSON.parse(content);
}

export function scanPdfFiles(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        results.push({
          fullPath,
          fileName: entry.name,
          baseName: path.parse(entry.name).name,
          sizeBytes: statSync(fullPath).size,
        });
      }
    }
  }
  walk(dir);
  return results;
}

export function matchMaterials(fileName, materials) {
  const cleanName = fileName.replace(/\.pdf$/i, '').trim();
  const cleanNameLower = cleanName.toLowerCase();
  const matches = [];

  // 1. Direct code exact match (case-insensitive)
  for (const [id, m] of Object.entries(materials)) {
    const code = String(m.code || '').trim();
    if (code && cleanNameLower === code.toLowerCase()) {
      matches.push({ id, material: m, matchType: 'exact_code' });
    }
  }
  if (matches.length > 0) return matches;

  // 2. File name starts with or contains material code
  for (const [id, m] of Object.entries(materials)) {
    const code = String(m.code || '').trim();
    if (code && code.length >= 4) {
      const codeRegex = new RegExp(`(^|[^a-zA-Z0-9])${code}([^a-zA-Z0-9]|$)`, 'i');
      if (codeRegex.test(cleanName)) {
        matches.push({ id, material: m, matchType: 'contained_code' });
      }
    }
  }
  if (matches.length > 0) return matches;

  // 3. Chinese name exact match (matches all color variants of this component)
  for (const [id, m] of Object.entries(materials)) {
    const zhName = String(m.name?.zh || '').trim();
    if (zhName && cleanName === zhName) {
      matches.push({ id, material: m, matchType: 'exact_zh_name' });
    }
  }
  if (matches.length > 0) return matches;

  return [];
}

export function computeFileHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 8);
}

export function syncDrawingsFromDirectory(sourceDir, options = {}) {
  const materialsData = options.materialsData || loadMaterialsData();
  const materials = materialsData.materialDb?.materials || {};
  const pdfs = scanPdfFiles(sourceDir);

  const matched = [];
  const unmatched = [];
  const updated = [];

  for (const pdf of pdfs) {
    const fileMatches = matchMaterials(pdf.fileName, materials);
    if (!fileMatches.length) {
      unmatched.push(pdf);
      continue;
    }

    const fileBuffer = readFileSync(pdf.fullPath);
    const hash = computeFileHash(fileBuffer);

    for (const match of fileMatches) {
      const { id, material } = match;
      matched.push({ pdf, material, id });

      const catalogFileName = `drawing-${id.replace(/^mat_/, '')}-${hash}.pdf`;
      const targetCatalogPath = path.join(catalogDir, catalogFileName);
      const relativePath = `drawings/catalog/${catalogFileName}`;
      const cdnUrl = `https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-sync@main/bom-viewer-sync/${relativePath}`;

      const existingDrawing = (material.drawings || [])[0];
      const isAlreadySynced = existingDrawing && existingDrawing.path === relativePath && existingDrawing.url === cdnUrl;

      if (!isAlreadySynced) {
        if (!options.dryRun) {
          mkdirSync(catalogDir, { recursive: true });
          writeFileSync(targetCatalogPath, fileBuffer);
          material.drawings = [
            {
              name: `${material.name?.zh || material.code}.pdf`,
              path: relativePath,
              url: cdnUrl,
              previewUrl: cdnUrl,
            },
          ];
        }
        updated.push({
          id,
          code: material.code,
          name: material.name?.zh,
          color: material.color?.zh,
          file: pdf.fileName,
          catalogFileName,
        });
      }
    }
  }

  if (!options.dryRun && updated.length > 0) {
    writeFileSync(materialsPath, JSON.stringify(materialsData, null, 2) + '\n', 'utf8');
  }

  return { matched, unmatched, updated, totalPdfs: pdfs.length };
}

// CLI Execution
if (process.argv[1] === import.meta.filename) {
  if (!sourcePath && !linksPath) {
    console.log(`
=== JinTai PDM Drawing Asset Sync Tool ===

Usage:
  node scripts/sync-drawing-assets.mjs --source <folder_path> [--dry-run]
  node scripts/sync-drawing-assets.mjs --links <links_file.json> [--dry-run]

Examples:
  node scripts/sync-drawing-assets.mjs --source "D:\\1.金汰产品\\11款致欧第20260526_671变更"
  node scripts/sync-drawing-assets.mjs --source "G:\\My Drive\\BOM-Drawings" --dry-run
`);
    process.exit(0);
  }

  if (sourcePath) {
    console.log(`\nScanning folder: ${sourcePath}`);
    console.log(`Dry run mode: ${isDryRun ? 'ENABLED (no files will be written)' : 'DISABLED (live sync)'}\n`);

    const result = syncDrawingsFromDirectory(sourcePath, { dryRun: isDryRun });

    console.log(`=== SCAN RESULTS ===`);
    console.log(`Total PDF files found: ${result.totalPdfs}`);
    console.log(`Matched materials:     ${result.matched.length}`);
    console.log(`Updated records:       ${result.updated.length}`);
    console.log(`Unmatched files:       ${result.unmatched.length}\n`);

    if (result.updated.length > 0) {
      console.log(`--- UPDATED MATERIALS ---`);
      for (const item of result.updated) {
        console.log(`✓ [${item.code}] ${item.name} <- ${item.file} (${item.catalogFileName})`);
      }
      console.log('');
    }

    if (result.unmatched.length > 0) {
      console.log(`--- UNMATCHED FILES (Could not identify material code) ---`);
      for (const item of result.unmatched) {
        console.log(`? ${item.fileName} (${item.fullPath})`);
      }
      console.log('');
    }

    if (!isDryRun && result.updated.length > 0) {
      console.log(`✓ Successfully updated ${result.updated.length} materials in data/materials.json`);
      console.log(`Next step: run 'npm run build' and 'npm run check' to verify and deploy.`);
    }
  }
}
