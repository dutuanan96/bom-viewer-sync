import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parseDataJsPayload } from '../src/infrastructure/github-data.js';
import { buildLogicalShardFiles, parseLogicalShardFiles, toRepositoryShardFiles, validateRepositoryShardRoot } from '../src/domain/sharded-files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function listFiles(directory, rootDir) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(rootDir, absolutePath).replaceAll(path.sep, '/');
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in shard output: ${relativePath}`);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath, rootDir));
    else if (entry.isFile()) files.push(path.relative(rootDir, absolutePath).replaceAll(path.sep, '/'));
    else throw new Error(`Unsupported entry in shard output: ${relativePath}`);
  }
  return files.sort();
}

export async function materializeShards(dataJsPath, outputDir, options = {}) {
  const { rootDir = ROOT, expectedCount, expectedHash, verify = false } = options;
  const absoluteRoot = path.resolve(rootDir);
  try {
    if (path.isAbsolute(outputDir)) throw new Error('absolute path');
    validateRepositoryShardRoot(outputDir);
  } catch {
    throw new Error('Output directory must be a safe repository-relative shard root');
  }
  const absoluteOutputDir = path.resolve(absoluteRoot, outputDir);
  const relativeOutputDir = path.relative(absoluteRoot, absoluteOutputDir);
  if (!relativeOutputDir || relativeOutputDir.startsWith('..') || path.isAbsolute(relativeOutputDir)) {
    throw new Error('Output directory must be a safe repository-relative shard root');
  }
  try {
    const outputStats = await fs.lstat(absoluteOutputDir);
    if (outputStats.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in shard output: ${outputDir}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const source = await fs.readFile(dataJsPath, 'utf8');
  if (source.includes('pendingAssetId')) throw new Error('Unsafe payload: contains pendingAssetId');
  if (source.includes('blob:')) throw new Error('Unsafe payload: contains blob URLs');

  const payload = parseDataJsPayload(source);
  const logicalFiles = buildLogicalShardFiles(payload);
  const roundTrippedPayload = await parseLogicalShardFiles(logicalFiles);
  assert.deepEqual(
    JSON.parse(JSON.stringify(roundTrippedPayload)),
    JSON.parse(JSON.stringify(payload)),
    'Generated shards do not round-trip to the source payload',
  );
  const repoFiles = toRepositoryShardFiles(logicalFiles, outputDir);

  const fileCount = Object.keys(repoFiles).length;
  if (expectedCount && fileCount !== expectedCount) {
    throw new Error(`Expected ${expectedCount} shards, but got ${fileCount}`);
  }

  if (expectedHash) {
    const { computeShardAggregateHash } = await import('./lib/sharded-files.mjs');
    const actualHash = computeShardAggregateHash(logicalFiles);
    if (actualHash !== expectedHash) {
      throw new Error(`Hash mismatch. Expected ${expectedHash}, got ${actualHash}`);
    }
  }

  const expectedPaths = new Set(Object.keys(repoFiles));
  const existingPaths = await listFiles(absoluteOutputDir, absoluteRoot);
  const unexpectedPath = existingPaths.find((filepath) => !expectedPaths.has(filepath));
  if (unexpectedPath) throw new Error(`Unexpected existing file: ${unexpectedPath}`);

  const writtenPaths = [];
  try {
    for (const [filepath, content] of Object.entries(repoFiles)) {
      const absolutePath = path.resolve(absoluteRoot, filepath);
      try {
        const stats = await fs.stat(absolutePath);
        if (stats.isFile()) {
          if (verify) {
            const existing = await fs.readFile(absolutePath, 'utf8');
            if (existing.replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) {
              throw new Error(`Verification failed: Content mismatch in ${filepath}`);
            }
            writtenPaths.push(absolutePath);
            continue;
          } else {
            throw new Error(`Unexpected existing file: ${filepath}`);
          }
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        if (verify) throw new Error(`Verification failed: Missing file ${filepath}`);
      }
      if (!verify) {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, content, 'utf8');
        writtenPaths.push(absolutePath);
      }
    }
  } catch (error) {
    if (!verify) {
      for (const p of writtenPaths) {
        await fs.unlink(p).catch(() => {});
      }
    }
    throw error;
  }

  return fileCount;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const EXPECTED_HASH = 'd5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e';
  const EXPECTED_COUNT = 24;
  const isVerify = process.argv.includes('--verify');
  const args = process.argv.slice(2).filter(a => a !== '--verify');
  const outDir = args[0] || 'data';

  materializeShards(path.join(ROOT, 'data.js'), outDir, {
    expectedCount: EXPECTED_COUNT,
    expectedHash: EXPECTED_HASH,
    verify: isVerify
  }).then(size => {
    if (isVerify) {
      console.log(`Verified ${size} shards in ${outDir}/`);
    } else {
      console.log(`Materialized ${size} shards to ${outDir}/`);
    }
  }).catch(err => {
    console.error('Materialization failed:', err);
    process.exit(1);
  });
}
