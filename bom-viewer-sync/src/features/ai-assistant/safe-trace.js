const EVENT_TYPES = Object.freeze(new Set([
  'route_selected',
  'model_requested',
  'tool_requested',
  'tool_completed',
  'mapping_clarification',
  'fallback_used',
  'answer_validated'
]));

const STRING_FIELDS = Object.freeze(['modelId', 'intent', 'toolName', 'status', 'code']);
const USAGE_FIELDS = Object.freeze(['modelCalls', 'toolCalls', 'promptTokens', 'completionTokens', 'cost']);
const SECRET_VALUE_PATTERN = /api.?key|authorization|password|secret|credential|\b(?:sk-or-|sk-|ghp_|github_pat_|bearer\s+)[a-z0-9._-]{10,}/i;
const STABLE_VALUE_PATTERN = /^[a-z0-9][a-z0-9._:/-]{0,199}$/i;
const MAX_EVENTS = 32;
const MAX_EVIDENCE_IDS = 5;

function timeValue(now) {
  const value = now();
  return value instanceof Date ? value.getTime() : Number(value);
}

function safeString(value) {
  if (typeof value !== 'string' || !value) return undefined;
  if (SECRET_VALUE_PATTERN.test(value)) return '[redacted]';
  const bounded = value.slice(0, 200);
  return STABLE_VALUE_PATTERN.test(bounded) ? bounded : undefined;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function safeUsage(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return undefined;
  const result = {};
  for (const field of USAGE_FIELDS) {
    const value = safeNumber(usage[field]);
    if (value !== undefined) result[field] = value;
  }
  return Object.keys(result).length > 0 ? Object.freeze(result) : undefined;
}

function safeEvidenceIds(evidenceIds) {
  if (!Array.isArray(evidenceIds)) return undefined;
  const result = evidenceIds
    .slice(0, MAX_EVIDENCE_IDS)
    .map(safeString)
    .filter(value => value && value !== '[redacted]');
  return result.length > 0 ? Object.freeze(result) : undefined;
}

export function createSafeTrace({ now = Date.now } = {}) {
  const startedAt = timeValue(now);
  const events = [];

  function add(type, fields = {}) {
    if (!EVENT_TYPES.has(type)) throw new Error(`Unknown safe trace event type: ${type}`);
    if (events.length >= MAX_EVENTS) return false;

    const event = {
      type,
      offsetMs: Math.max(0, Math.round(timeValue(now) - startedAt))
    };
    for (const field of STRING_FIELDS) {
      const value = safeString(fields[field]);
      if (value !== undefined) event[field] = value;
    }
    const latencyMs = safeNumber(fields.latencyMs);
    if (latencyMs !== undefined) event.latencyMs = latencyMs;
    const evidenceIds = safeEvidenceIds(fields.evidenceIds);
    if (evidenceIds) event.evidenceIds = evidenceIds;
    const usage = safeUsage(fields.usage);
    if (usage) event.usage = usage;

    events.push(Object.freeze(event));
    return true;
  }

  function finish() {
    return Object.freeze([...events]);
  }

  return Object.freeze({ add, finish });
}
