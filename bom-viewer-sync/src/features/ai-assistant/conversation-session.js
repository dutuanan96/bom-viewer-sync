const SECRET_TEXT_PATTERN = /api.?key|authorization|password|secret|token|credential|\b(?:sk-or-|sk-|ghp_|github_pat_|bearer\s+)[a-z0-9._-]{10,}/i;
const TOOL_EVENT_STATUSES = Object.freeze(new Set(['success', 'error', 'blocked']));

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

  function record({ userText, assistantText, toolEvents = [] } = {}) {
    if (typeof userText !== 'string' || typeof assistantText !== 'string') return false;
    const normalizedUserText = userText.trim();
    const normalizedAssistantText = assistantText.trim();
    if (!normalizedUserText || !normalizedAssistantText) return false;

    assertNoSecrets(normalizedUserText, 'userText');
    assertNoSecrets(normalizedAssistantText, 'assistantText');
    const safeToolEvents = sanitizeToolEvents(toolEvents);
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
      charCount: turnCharCount
    }));
    charCount += turnCharCount;
    evictToBudget();
    return true;
  }

  function clear() {
    turns.splice(0);
    charCount = 0;
  }

  function diagnostics() {
    return Object.freeze({ turnCount: turns.length, charCount, maxTurns, maxChars });
  }

  return Object.freeze({ contextFor, record, clear, diagnostics });
}
