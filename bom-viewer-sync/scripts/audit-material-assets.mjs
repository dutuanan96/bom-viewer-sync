import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  applyCanonicalMaterialAssets,
  assetLocator,
  auditMaterialAssets,
} from './lib/material-asset-audit.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function resolveInside(baseDir, relativePath, errorCode) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, relativePath);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`${errorCode}:${relativePath}`);
  }
  return resolved;
}

function mappedSource(locator, kind, { rootDir, pdfRoot, sources }) {
  const source = sources?.[locator];
  if (!source) return null;
  if (typeof source === 'object' && source.type === 'git' && source.spec) {
    return [{ type: 'git', spec: String(source.spec) }];
  }
  const sourcePaths = Array.isArray(source) ? source : [source];
  if (!sourcePaths.length || sourcePaths.some((value) => typeof value !== 'string')) {
    throw new Error(`INVALID_ASSET_SOURCE:${locator}`);
  }
  const baseDir = kind === 'drawings' ? pdfRoot : rootDir;
  if (!baseDir) throw new Error(`ASSET_SOURCE_ROOT_REQUIRED:${locator}`);
  return sourcePaths.map((sourcePath) => ({
    type: 'file',
    path: resolveInside(baseDir, sourcePath, 'ASSET_SOURCE_OUTSIDE_ROOT'),
  }));
}

function sourceForAsset(asset, kind, options) {
  const locator = assetLocator(asset);
  const override = mappedSource(locator, kind, options);
  if (override) return override;
  if (kind === 'models3d') {
    if (!asset?.path) throw new Error(`UNRESOLVED_MODEL_SOURCE:${locator}`);
    return [{
      type: 'file',
      path: resolveInside(options.rootDir, asset.path, 'ASSET_PATH_OUTSIDE_ROOT'),
    }];
  }
  const parts = String(asset?.path || '').split(' > ').map((value) => value.trim()).filter(Boolean);
  if (parts[0] !== 'Google Drive' || parts.length < 3 || !options.pdfRoot) {
    throw new Error(`UNRESOLVED_PDF_SOURCE:${locator}`);
  }
  return [{
    type: 'file',
    path: resolveInside(options.pdfRoot, path.join(...parts.slice(1)), 'PDF_PATH_OUTSIDE_ROOT'),
  }];
}

async function hashSource(source, options) {
  if (source.type === 'file') return sha256(await readFile(source.path));
  const result = spawnSync('git', ['cat-file', 'blob', source.spec], {
    cwd: options.rootDir,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`GIT_ASSET_READ_FAILED:${source.spec}`);
  return sha256(result.stdout);
}

async function hashAsset(asset, kind, options) {
  const sources = sourceForAsset(asset, kind, options);
  const hashes = await Promise.all(sources.map((source) => hashSource(source, options)));
  const unique = [...new Set(hashes)];
  if (unique.length !== 1) {
    throw new Error(`SOURCE_CONTENT_CONFLICT:${assetLocator(asset)}:${unique.join(',')}`);
  }
  return unique[0];
}

async function collectHashes(payload, options) {
  const assetsByLocator = new Map();
  for (const material of Object.values(payload?.materialDb?.materials || {})) {
    for (const kind of ['drawings', 'models3d']) {
      for (const asset of material?.[kind] || []) {
        const locator = assetLocator(asset);
        if (locator && !assetsByLocator.has(locator)) assetsByLocator.set(locator, { asset, kind });
      }
    }
  }
  const hashes = {};
  const ordered = [...assetsByLocator.keys()].sort();
  const concurrency = 8;
  for (let index = 0; index < ordered.length; index += concurrency) {
    const batch = ordered.slice(index, index + concurrency);
    const values = await Promise.all(batch.map((locator) => {
      const { asset, kind } = assetsByLocator.get(locator);
      return hashAsset(asset, kind, options);
    }));
    batch.forEach((locator, batchIndex) => {
      hashes[locator] = values[batchIndex];
    });
  }
  return hashes;
}

function parseJson(text, source) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`INVALID_JSON:${source}`);
  }
}

export async function runMaterialAssetAudit({
  rootDir = repoRoot,
  pdfRoot = process.env.PDM_2D_ROOT,
  inputPath = path.join(rootDir, 'data', 'materials.json'),
  mappingPath,
  apply = false,
} = {}) {
  if (apply && !mappingPath) throw new Error('MAPPING_REQUIRED');
  const inputText = await readFile(inputPath, 'utf8');
  const payload = parseJson(inputText, inputPath);
  const mapping = mappingPath
    ? parseJson(await readFile(mappingPath, 'utf8'), mappingPath)
    : { version: 1, sources: {}, materials: {} };
  if (mapping?.version !== 1 || !mapping?.materials || typeof mapping.materials !== 'object') {
    throw new Error('INVALID_MAPPING');
  }
  const hashes = await collectHashes(payload, {
    rootDir,
    pdfRoot,
    sources: mapping.sources || {},
  });
  const audit = auditMaterialAssets(payload, hashes);
  if (!apply) {
    return { applied: false, changed: false, hashes, audit };
  }
  const migrated = applyCanonicalMaterialAssets(payload, mapping);
  const outputText = `${JSON.stringify(migrated.payload, null, 2)}\n`;
  const changed = outputText !== inputText;
  if (changed) await writeFile(inputPath, outputText, 'utf8');
  return {
    applied: true,
    changed,
    changes: changed ? migrated.changes : [],
    hashes,
    audit,
  };
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

async function main(args) {
  const result = await runMaterialAssetAudit({
    rootDir: repoRoot,
    pdfRoot: optionValue(args, '--pdf-root', process.env.PDM_2D_ROOT),
    inputPath: path.resolve(optionValue(args, '--input', path.join(repoRoot, 'data', 'materials.json'))),
    mappingPath: args.includes('--mapping')
      ? path.resolve(optionValue(args, '--mapping'))
      : undefined,
    apply: args.includes('--apply'),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
