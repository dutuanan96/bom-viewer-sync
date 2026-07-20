const SUPPORTED_EXTENSIONS = new Set(['json', 'csv', 'txt', 'md']);
const DEFAULT_MAX_BYTES = 256 * 1024;

function byteLength(text) {
  return new TextEncoder().encode(text).byteLength;
}

function contentHash(text) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function extensionOf(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index <= text.length; index += 1) {
    const character = text[index] ?? '\n';
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (quoted) throw new Error('Malformed CSV: unterminated quoted field');
  return rows;
}

export function validateRepositoryReference(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Repository reference must be a valid URL'); }
  if (url.protocol !== 'https:') throw new Error('Repository reference must use HTTPS');
  if (url.hostname !== 'raw.githubusercontent.com') throw new Error('Repository reference is outside the allowlist');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 4) throw new Error('Repository reference must identify owner, repository, revision, and file');
  return url;
}

export function createKnowledgeImporter({ maxBytes = DEFAULT_MAX_BYTES, clock = () => new Date().toISOString() } = {}) {
  const seenHashes = new Set();

  function importFile({ name, text, sourceUrl = null }) {
    const format = extensionOf(name);
    if (!SUPPORTED_EXTENSIONS.has(format)) throw new Error(`Unsupported knowledge file type: ${format || 'none'}`);
    if (typeof text !== 'string') throw new Error('Knowledge file must be decoded text');
    if (text.includes('\0')) throw new Error('Binary knowledge files are not supported');
    if (byteLength(text) > maxBytes) throw new Error(`Knowledge file exceeds size limit of ${maxBytes} bytes`);
    if (sourceUrl) validateRepositoryReference(sourceUrl);

    let parsed = null;
    if (format === 'json') {
      try { parsed = JSON.parse(text); } catch { throw new Error('Malformed JSON knowledge file'); }
    } else if (format === 'csv') {
      parsed = parseCsv(text);
    }

    const hash = contentHash(text);
    if (seenHashes.has(hash)) throw new Error('Duplicate knowledge content');
    seenHashes.add(hash);
    const capturedAt = String(clock());

    return {
      schemaVersion: 1,
      id: `knowledge_${hash.slice(-16)}`,
      status: 'candidate',
      trust: 'untrusted',
      format,
      name: String(name),
      content: text,
      parsed,
      contentHash: hash,
      provenance: {
        sourceType: sourceUrl ? 'repository-reference' : 'local-file',
        sourceRef: sourceUrl || String(name),
        capturedAt,
      },
    };
  }

  return { importFile };
}

const defaultImporter = createKnowledgeImporter();

export function importKnowledge(input) {
  if (!input || typeof input !== 'object') throw new Error('Explicit file input is required');
  return defaultImporter.importFile(input);
}

export { DEFAULT_MAX_BYTES as KNOWLEDGE_IMPORT_MAX_BYTES };
