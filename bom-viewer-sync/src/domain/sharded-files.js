import { assembleShardedPayload, splitPayloadToShards } from './sharded-data.js';

function stringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function assertLogicalFiles(files) {
  if (!(files instanceof Map) || files.size === 0) throw new Error('Logical shard files are required');
  for (const [path, content] of files) {
    if (!/^(manifest|materials)\.json$|^products\/[A-Za-z0-9_-]+\.json$/.test(path)) {
      throw new Error(`Invalid logical shard path: ${path}`);
    }
    if (typeof content !== 'string') throw new Error(`Invalid logical shard content: ${path}`);
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

export function toRepositoryShardFiles(files, shardRoot) {
  assertLogicalFiles(files);
  if (typeof shardRoot !== 'string' || (shardRoot !== 'data' && !shardRoot.endsWith('/data'))) {
    throw new Error('Valid repository shard root is required');
  }
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

  return assembleShardedPayload(manifest, materials, async (id) => {
    const content = files.get(`products/${id}.json`);
    if (!content) throw new Error(`Product shard not found: ${id}`);
    return JSON.parse(content);
  });
}
