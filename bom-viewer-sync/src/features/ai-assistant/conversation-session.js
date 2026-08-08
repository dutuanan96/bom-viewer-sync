const SECRET_TEXT_PATTERN = /api.?key|authorization|password|secret|token|credential|\b(?:sk-or-|sk-|ghp_|github_pat_|bearer\s+)[a-z0-9._-]{10,}/i;
const TOOL_EVENT_STATUSES = Object.freeze(new Set(['success', 'error', 'blocked']));
const CONTEXT_KEYS = Object.freeze(new Set(['productIds', 'materialIds', 'revisions', 'searchQuery', 'workflowState']));

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function assertNoSecrets(text, field) {
  if (SECRET_TEXT_PATTERN.test(text)) {
    throw new Error(`Secret or credential is not allowed in ${field}`);
  }
}

function sanitizeToolEvents(toolEvents) {
  if (!Array.isArray(toolEvents)) throw new Error('toolEvents must be an array');
  return toolEvents.map((event, index) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new Error(`Tool event ${index} must be an object`);
    }
    const keys = Object.keys(event);
    if (keys.some(key => key !== 'name' && key !== 'status')) {
      throw new Error(`Tool event ${index} contains a non-allowlisted field`);
    }
    if (typeof event.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(event.name)) {
      throw new Error(`Tool event ${index} has an invalid name`);
    }
    if (!TOOL_EVENT_STATUSES.has(event.status)) {
      throw new Error(`Tool event ${index} has an invalid status`);
    }
    return Object.freeze({ name: event.name, status: event.status });
  });
}

function sanitizeContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return Object.freeze({});
  if (Object.keys(context).some(key => !CONTEXT_KEYS.has(key))) {
    throw new Error('Conversation context contains a non-allowlisted field');
  }
  const limits = { productIds: 2, materialIds: 3, revisions: 4 };
  const result = {};
  for (const key of CONTEXT_KEYS) {
    if (!(key in context)) continue;
    if (key === 'workflowState') {
      const workflow = context[key];
      if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
        throw new Error('Conversation workflow state must be an object');
      }
      const tasks = Array.isArray(workflow.tasks) ? workflow.tasks.slice(0, 20) : [];
      result.workflowState = Object.freeze({
        workflowStatus: String(workflow.workflowStatus || '').slice(0, 80),
        responseLanguage: String(workflow.responseLanguage || '').slice(0, 8),
        tasks: Object.freeze(tasks.map(task => {
          if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('Conversation workflow task must be an object');
          const fields = task.fields && typeof task.fields === 'object' && !Array.isArray(task.fields) ? task.fields : {};
          const safeFields = {};
          for (const [field, value] of Object.entries(fields)) {
            if (typeof value === 'string') {
              assertNoSecrets(value, `workflow field ${field}`);
              safeFields[field] = value.slice(0, 500);
            } else if (typeof value === 'boolean') {
              safeFields[field] = value;
            } else if (Array.isArray(value) && value.length <= 50 && value.every(item => typeof item === 'string' && item.length <= 100)) {
              safeFields[field] = value.map(item => item.trim());
            }
          }
          return Object.freeze({
            id: String(task.id || '').slice(0, 100),
            type: String(task.type || '').slice(0, 100),
            status: String(task.status || '').slice(0, 40),
            pendingAction: task.pendingAction == null ? null : String(task.pendingAction).slice(0, 80),
            fields: Object.freeze(safeFields),
            missingFields: Object.freeze((task.missingFields || []).filter(value => typeof value === 'string').slice(0, 20)),
          });
        })),
      });
      continue;
    }
    if (key === 'searchQuery') {
      if (typeof context[key] !== 'string') throw new Error('Conversation context searchQuery must be a string');
      const value = context[key].trim();
      if (value) result[key] = value.slice(0, 500);
      continue;
    }
    if (!Array.isArray(context[key])) throw new Error(`Conversation context ${key} must be an array`);
    result[key] = Object.freeze([...new Set(context[key]
      .filter(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100)
      .map(value => value.trim()))].slice(0, limits[key]));
  }
  return Object.freeze(result);
}

export function createConversationSession({ maxTurns = 8, maxChars = 12000 } = {}) {
  assertPositiveInteger(maxTurns, 'maxTurns');
  assertPositiveInteger(maxChars, 'maxChars');

  const turns = [];
  let charCount = 0;

  function evictToBudget() {
    while (turns.length > maxTurns || charCount > maxChars) {
      const removed = turns.shift();
      charCount -= removed.charCount;
    }
  }

  function contextFor(query = '') {
    const availableChars = Math.max(0, maxChars - String(query).length);
    const selected = [];
    let selectedChars = 0;

    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (selectedChars + turn.charCount > availableChars) break;
      selected.unshift(turn);
      selectedChars += turn.charCount;
    }

    const messages = selected.flatMap(turn => [
      Object.freeze({ role: 'user', content: turn.userText }),
      Object.freeze({ role: 'assistant', content: turn.assistantText })
    ]);
    return Object.freeze(messages);
  }

  function record({ userText, assistantText, toolEvents = [], context = {} } = {}) {
    if (typeof userText !== 'string' || typeof assistantText !== 'string') return false;
    const normalizedUserText = userText.trim();
    const normalizedAssistantText = assistantText.trim();
    if (!normalizedUserText || !normalizedAssistantText) return false;

    assertNoSecrets(normalizedUserText, 'userText');
    assertNoSecrets(normalizedAssistantText, 'assistantText');
    const safeToolEvents = sanitizeToolEvents(toolEvents);
    const safeContext = sanitizeContext(context);
    const turnCharCount = normalizedUserText.length + normalizedAssistantText.length;

    if (turnCharCount > maxChars) {
      turns.splice(0);
      charCount = 0;
      return false;
    }

    turns.push(Object.freeze({
      userText: normalizedUserText,
      assistantText: normalizedAssistantText,
      toolEvents: Object.freeze(safeToolEvents),
      context: safeContext,
      charCount: turnCharCount
    }));
    charCount += turnCharCount;
    evictToBudget();
    return true;
  }

  function latestContext() {
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const context = turns[index].context;
      if (context && Object.values(context).some(value => (
        value && typeof value === 'object' ? Object.keys(value).length > 0 : value.length > 0
      ))) {
        return sanitizeContext(context);
      }
    }
    return Object.freeze({});
  }

  function clear() {
    turns.splice(0);
    charCount = 0;
  }

  function diagnostics() {
    return Object.freeze({ turnCount: turns.length, charCount, maxTurns, maxChars });
  }

  return Object.freeze({ contextFor, latestContext, record, clear, diagnostics });
}
