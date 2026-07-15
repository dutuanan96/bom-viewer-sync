import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDataJsPayload } from '../src/infrastructure/github-data.js';
import { buildLogicalShardFiles, toRepositoryShardFiles } from '../src/domain/sharded-files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export async function materializeShards(dataJsPath, outputDir, options = {}) {
  const { rootDir = ROOT, expectedCount, expectedHash, verify = false } = options;
  const source = await fs.readFile(dataJsPath, 'utf8');
  if (source.includes('pendingAssetId')) throw new Error('Unsafe payload: contains pendingAssetId');
  if (source.includes('blob:')) throw new Error('Unsafe payload: contains blob URLs');

  const payload = parseDataJsPayload(source);
  const logicalFiles = buildLogicalShardFiles(payload);
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

  const writtenPaths = [];
  try {
    for (const [filepath, content] of Object.entries(repoFiles)) {
      if (filepath.includes('..')) throw new Error('Unsafe output path traversal');
      const absolutePath = path.resolve(rootDir, filepath);
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
