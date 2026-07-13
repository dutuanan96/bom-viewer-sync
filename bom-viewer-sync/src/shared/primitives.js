export function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFKD');
}

export function stableId(prefix, value) {
  const textValue = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < textValue.length; index += 1) {
    hash ^= textValue.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}
