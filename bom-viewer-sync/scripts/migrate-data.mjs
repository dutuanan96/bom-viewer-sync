import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composePayloadFromShards, shardFiles, splitPayloadIntoShards } from '../src/domain/sharded-data.js';
import { normalizePayload, parseDataJsPayload } from '../src/infrastructure/github-data.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArguments(argv) {
  const options = {
    source: path.join(projectRoot, 'data.js'),
    output: '',
    write: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--write') {
      options.write = true;
    } else if (argument === '--source') {
      options.source = path.resolve(argv[index + 1] || '');
      index += 1;
    } else if (argument === '--out') {
      options.output = path.resolve(argv[index + 1] || '');
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.write && !options.output) throw new Error('--out is required with --write');
  return options;
}

function datasetVersion(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function assertParity(source, recomposed) {
  if (JSON.stringify(source) !== JSON.stringify(recomposed)) {
    throw new Error('Sharded payload parity validation failed');
  }
}

async function writeFiles(outputRoot, files) {
  const root = path.resolve(outputRoot);
  await Promise.all(Object.entries(files).map(async ([relativePath, value]) => {
    const target = path.resolve(root, relativePath);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe shard path: ${relativePath}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const sourceText = await readFile(options.source, 'utf8');
  const payload = normalizePayload(parseDataJsPayload(sourceText));
  const version = datasetVersion(payload);
  const shards = splitPayloadIntoShards(payload, { datasetVersion: version });
  const files = shardFiles(shards);
  assertParity(payload, composePayloadFromShards(shards));
  if (options.write) await writeFiles(options.output, files);

  process.stdout.write(`${JSON.stringify({
    mode: options.write ? 'write' : 'dry-run',
    datasetVersion: version,
    productCount: Object.keys(payload.bom).length,
    materialCount: Object.keys(payload.materialDb.materials).length,
    bomEntryCount: payload.materialDb.bomEntries.length,
    notificationCount: payload.notifications.length,
    fileCount: Object.keys(files).length,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
