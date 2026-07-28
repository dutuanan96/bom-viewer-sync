const DEFAULT_MAX_ITEMS = 4;
const DEFAULT_MAX_CHARS = 1600;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function tokens(value) {
  const text = String(value || '').normalize('NFKC').toLocaleLowerCase('und');
  const result = new Set(text.match(/[\p{L}\p{N}]{2,}/gu) || []);
  for (const run of text.match(/[\p{Script=Han}]{2,}/gu) || []) {
    for (let index = 0; index < run.length - 1; index++) result.add(run.slice(index, index + 2));
  }
  return result;
}

function overlapCount(left, right) {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

function recordLine(record) {
  return `[${record.id}] ${String(record.fact || '').trim()}`;
}

export function formatScopedMemories(records, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  const lines = [];
  let length = 0;
  for (const record of records || []) {
    const line = recordLine(record);
    const extra = line.length + (lines.length ? 1 : 0);
    if (length + extra > maxChars) break;
    lines.push(line);
    length += extra;
  }
  return lines.join('\n');
}

export function selectScopedMemories({
  localStore,
  route = {},
  snapshot = {},
  query = '',
  maxItems = DEFAULT_MAX_ITEMS,
  maxChars = DEFAULT_MAX_CHARS,
} = {}) {
  if (!localStore || typeof localStore.listConfirmed !== 'function') return Object.freeze([]);
  const currentSourceCommit = snapshot.sourceMetadata?.commitSha;
  const records = localStore.listConfirmed({ currentSourceCommit });
  const productIds = new Set(route.entities?.productIds || []);
  const materialIds = new Set(route.entities?.materialIds || []);
  const queryTokens = tokens(query);
  const ranked = [];

  for (const record of records || []) {
    if (record?.status !== 'confirmed' || !String(record.fact || '').trim()) continue;
    const scope = record.scope || {};
    let score = 0;
    let scoped = false;
    if (scope.productCode && productIds.has(scope.productCode)) { score += 100; scoped = true; }
    if (scope.materialId && materialIds.has(scope.materialId)) { score += 90; scoped = true; }
    if (scope.intent && scope.intent === route.intent) { score += 60; scoped = true; }
    if (scope.key && queryTokens.has(String(scope.key).normalize('NFKC').toLocaleLowerCase('und'))) { score += 40; scoped = true; }

    const lexical = overlapCount(queryTokens, tokens(`${scope.key || ''} ${record.fact}`));
    if (!scoped && lexical < 2) continue;
    score += lexical;
    ranked.push({ record, score });
  }

  ranked.sort((a, b) => b.score - a.score || String(a.record.id).localeCompare(String(b.record.id)));
  const selected = [];
  let usedChars = 0;
  for (const item of ranked) {
    if (selected.length >= maxItems) break;
    const safe = clone(item.record);
    const lineLength = recordLine(safe).length + (selected.length ? 1 : 0);
    if (usedChars + lineLength > maxChars) continue;
    selected.push(deepFreeze(safe));
    usedChars += lineLength;
  }
  return Object.freeze(selected);
}
