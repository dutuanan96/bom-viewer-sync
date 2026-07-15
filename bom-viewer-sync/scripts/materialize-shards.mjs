import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDataJsPayload } from '../src/infrastructure/github-data.js';
import { buildLogicalShardFiles, toRepositoryShardFiles } from '../src/domain/sharded-files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export async function materializeShards(dataJsPath, outputDir, rootDir = ROOT) {
  const source = await fs.readFile(dataJsPath, 'utf8');
  const payload = parseDataJsPayload(source);
  const logicalFiles = buildLogicalShardFiles(payload);
  const repoFiles = toRepositoryShardFiles(logicalFiles, outputDir);
  
  for (const [filepath, content] of Object.entries(repoFiles)) {
    const absolutePath = path.resolve(rootDir, filepath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, 'utf8');
  }
  
  return Object.keys(repoFiles).length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  materializeShards(path.join(ROOT, 'data.js'), 'data').then(size => {
    console.log(`Materialized ${size} shards to data/`);
  }).catch(err => {
    console.error('Materialization failed:', err);
    process.exit(1);
  });
}
