import { assembleShardedPayload, splitPayloadToShards, validateProductId } from './sharded-data.js';

function stringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function assertLogicalFiles(files) {
  if (!(files instanceof Map) || files.size === 0) throw new Error('Logical shard files are required');
  for (const [path, content] of files) {
    validateLogicalShardPath(path);
    if (typeof content !== 'string') throw new Error(`Invalid logical shard content: ${path}`);
  }
}

export function validateLogicalShardPath(path) {
  if (path === 'manifest.json' || path === 'materials.json') return path;
  const match = typeof path === 'string' ? path.match(/^products\/([A-Za-z0-9_-]+)\.json$/) : null;
  if (!match) throw new Error(`Invalid logical shard path: ${path}`);
  validateProductId(match[1]);
  return path;
}

export function assertLogicalShardCount(files) {
  const count = files instanceof Map ? files.size : Number(files);
  if (!Number.isInteger(count) || count < 3) {
    throw new Error(`Expected at least 3 logical shards, got ${count}`);
  }
}

export function buildLogicalShardFiles(payload) {
  const { manifest, materials, products } = splitPayloadToShards(payload);
  const files = new Map([
    ['manifest.json', stringify(manifest)],
    ['materials.json', stringify(materials)],
  ]);
  for (const [id, product] of [...products.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    files.set(`products/${id}.json`, stringify(product));
  }
  return files;
}

export function validateRepositoryShardRoot(shardRoot) {
  if (typeof shardRoot !== 'string' || !shardRoot || shardRoot.includes('\\')) {
    throw new Error('Valid repository shard root is required');
  }
  const segments = shardRoot.split('/');
  if (segments.at(-1) !== 'data'
    || segments.some((segment) => !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/.test(segment))) {
    throw new Error('Valid repository shard root is required');
  }
  return shardRoot;
}

export function toRepositoryShardFiles(files, shardRoot) {
  assertLogicalFiles(files);
  validateRepositoryShardRoot(shardRoot);
  return Object.fromEntries([...files.entries()].map(([path, content]) => [`${shardRoot}/${path}`, content]));
}

export async function parseLogicalShardFiles(files) {
  assertLogicalFiles(files);
  const manifestRaw = files.get('manifest.json');
  const materialsRaw = files.get('materials.json');
  if (!manifestRaw) throw new Error('Missing manifest.json');
  if (!materialsRaw) throw new Error('Missing materials.json');

  const manifest = JSON.parse(manifestRaw);
  const materials = JSON.parse(materialsRaw);

  if (Array.isArray(manifest?.products)) {
    const expectedPaths = new Set(['manifest.json', 'materials.json']);
    for (const id of manifest.products) {
      validateProductId(id);
      expectedPaths.add(`products/${id}.json`);
    }
    for (const path of [...files.keys()].sort()) {
      if (!expectedPaths.has(path)) throw new Error(`Unexpected logical shard: ${path}`);
    }
  }

  return assembleShardedPayload(manifest, materials, async (id) => {
    const content = files.get(`products/${id}.json`);
    if (!content) throw new Error(`Product shard not found: ${id}`);
    return JSON.parse(content);
  });
}
