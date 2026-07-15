import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLogicalShardFiles } from '../src/domain/sharded-files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export async function verifyRollback(dataDir, rootDir = ROOT) {
  const logicalFiles = new Map();
  const repoFiles = [
    'manifest.json',
    'materials.json',
  ];
  
  // Find all products
  const productsDir = path.resolve(rootDir, dataDir, 'products');
  let productFiles = [];
  try {
    productFiles = await fs.readdir(productsDir);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  
  for (const file of productFiles) {
    if (file.endsWith('.json')) {
      repoFiles.push(`products/${file}`);
    }
  }

  for (const file of repoFiles) {
    const absolutePath = path.resolve(rootDir, dataDir, file);
    const content = await fs.readFile(absolutePath, 'utf8');
    logicalFiles.set(file, content);
  }

  const payload = await parseLogicalShardFiles(logicalFiles);
  return payload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyRollback('data').then(payload => {
    console.log(`Verified rollback. Shards successfully assembled into payload with version ${payload.version}.`);
  }).catch(err => {
    console.error('Rollback verification failed:', err);
    process.exit(1);
  });
}
