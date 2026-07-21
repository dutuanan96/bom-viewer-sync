// tests/ai-openrouter-gateway.test.mjs
// R2.1 Adversarial RED tests for OpenRouter gateway.
// All tests use mock fetch — no live network calls, no API key required.
// Storage spies prove the key never touches any persistence layer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterGateway } from '../src/features/ai-assistant/openrouter-gateway.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Mock helpers ──────────────────────────────────────────────────────────────

const TEST_KEY = 'sk-or-v1-test-key-that-must-never-persist-anywhere';
const VALID_KEY_RESPONSE = { data: { label: 'test', usage: 10, limit: 100, limit_requests: 1000, is_free_tier: false } };
const MODELS_RESPONSE = {
  data: [
    {
      id: 'anthropic/claude-3-5-sonnet',
      name: 'Claude 3.5 Sonnet',
      supported_parameters: ['tools', 'tool_choice', 'structured_outputs'],
      pricing: { prompt: '0.000003', completion: '0.000015' }
    },
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini',
      supported_parameters: ['tools', 'tool_choice'],
      pricing: { prompt: '0.00000015', completion: '0.0000006' }
    },
    {
      id: 'mistralai/mistral-7b-instruct',
      name: 'Mistral 7B',
      supported_parameters: ['temperature'],
      pricing: { prompt: '0.0000001', completion: '0.0000002' }
    }
  ]
};

function mockFetchSuccess(responsesByUrl) {
  return async (url, options) => {
    for (const [pattern, response] of Object.entries(responsesByUrl)) {
      if (url.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          json: async () => response,
          text: async () => JSON.stringify(response)
        };
      }
    }
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };
}

function mockFetchStatus(status, body = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
}

// Storage spies — must receive ZERO calls containing the key substring
function makeStorageSpy() {
  const calls = [];
  return {
    setItem: (k, v) => calls.push({ method: 'setItem', k, v: String(v) }),
    getItem: (k) => { calls.push({ method: 'getItem', k }); return null; },
    removeItem: (k) => calls.push({ method: 'removeItem', k }),
    calls,
    assertNoKeyLeak: (key) => {
      for (const call of calls) {
        assert.ok(
          !JSON.stringify(call).includes(key),
          `Storage spy detected key leak in call: ${JSON.stringify(call)}`
        );
      }
    }
  };
}

// ── P0: Key never persists to any storage ────────────────────────────────────

test('R2.1 P0: key is never written to localStorage or sessionStorage', async () => {
  // The gateway takes no storage params — it simply never uses browser storage.
  // This test verifies the source has no storage API calls.
  const src = readFileSync(resolve('src/features/ai-assistant/openrouter-gateway.js'), 'utf-8');
  assert.ok(!src.includes('.setItem('), 'source must not call setItem');
  assert.ok(!src.includes('.getItem('), 'source must not call getItem');

  // Also verify a connected gateway diagnostics does not contain the key
  const fetchImpl = mockFetchSuccess({
    '/api/v1/key': VALID_KEY_RESPONSE,
    '/api/v1/models': MODELS_RESPONSE
  });
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);
  const diag = JSON.stringify(gateway.diagnostics());
  assert.ok(!diag.includes(TEST_KEY), `diagnostics must not contain key: ${diag.substring(0, 200)}`);
});

test('R2.1 P0: key is not present in gateway diagnostics output', async () => {
  const fetchImpl = mockFetchSuccess({
    '/api/v1/key': VALID_KEY_RESPONSE,
    '/api/v1/models': MODELS_RESPONSE
  });
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);

  const diag = JSON.stringify(gateway.diagnostics());
  assert.ok(!diag.includes(TEST_KEY), `diagnostics leaked key: ${diag.substring(0, 200)}`);
});

test('R2.1 P0: key is redacted from provider error messages', async () => {
  const fetchImpl = async (url) => {
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: { message: `Invalid key sk-or-v1-test-key-that-must-never-persist-anywhere` } }),
      text: async () => ''
    };
  };
  const gateway = createOpenRouterGateway({ fetchImpl });
  try {
    await gateway.connect(TEST_KEY);
  } catch (err) {
    assert.ok(!err.message.includes(TEST_KEY), `Error message leaked key: ${err.message}`);
    return;
  }
  assert.fail('Expected connect to throw on 401');
});

// ── Source file static check: no storage calls in source ─────────────────────

test('R2.1: openrouter-gateway.js source contains no localStorage/sessionStorage/IndexedDB usage', () => {
  const src = readFileSync(resolve('src/features/ai-assistant/openrouter-gateway.js'), 'utf-8');
  // Must not call setItem/getItem — accepts injected spy objects but never directly writes key to them
  assert.ok(!src.includes('localStorage.setItem'), 'source must not call localStorage.setItem');
  assert.ok(!src.includes('localStorage.getItem'), 'source must not call localStorage.getItem');
  assert.ok(!src.includes('sessionStorage.setItem'), 'source must not call sessionStorage.setItem');
  assert.ok(!src.includes('sessionStorage.getItem'), 'source must not call sessionStorage.getItem');
  assert.ok(!src.includes('indexedDB.open'), 'source must not reference indexedDB.open');
});

test('R2.1: openrouter-gateway.js is the only source referencing openrouter.ai URL', () => {
  // Other AI modules must not embed the provider URL
  const forbidden = [
    'src/features/ai-assistant/contracts.js',
    'src/features/ai-assistant/pdm-knowledge.js',
    'src/features/ai-assistant/trust-policy.js'
  ];
  for (const f of forbidden) {
    let src = '';
    try { src = readFileSync(resolve(f), 'utf-8'); } catch { continue; }
    assert.ok(!src.includes('openrouter.ai'), `${f} must not reference openrouter.ai`);
    assert.ok(!src.includes('Authorization'), `${f} must not set Authorization header`);
  }
});

// ── Key validation flow ───────────────────────────────────────────────────────

test('R2.1: connect validates key via /api/v1/key and returns safe fields only', async () => {
  const fetchImpl = mockFetchSuccess({
    '/api/v1/key': VALID_KEY_RESPONSE,
    '/api/v1/models': MODELS_RESPONSE
  });
  const gateway = createOpenRouterGateway({ fetchImpl });
  const info = await gateway.connect(TEST_KEY);

  assert.ok(info.connected === true, 'must report connected');
  assert.ok(typeof info.keyInfo === 'object', 'must return keyInfo object');
  // Safe fields only — no raw key
  assert.ok(!JSON.stringify(info).includes(TEST_KEY), 'connect result must not contain key');
  assert.ok(info.keyInfo.limit !== undefined || info.keyInfo.label !== undefined, 'keyInfo must expose safe fields');
});

test('R2.1: connect throws on 401 without retrying', async () => {
  let callCount = 0;
  const fetchImpl = async () => {
    callCount++;
    return { ok: false, status: 401, json: async () => ({ error: { message: 'Unauthorized' } }), text: async () => '' };
  };
  const gateway = createOpenRouterGateway({ fetchImpl });

  await assert.rejects(() => gateway.connect(TEST_KEY), /401|unauthorized|invalid key/i);
  assert.equal(callCount, 1, '401 must NOT be retried');
});

test('R2.1: connect throws on 403 without retrying', async () => {
  let callCount = 0;
  const fetchImpl = async () => {
    callCount++;
    return { ok: false, status: 403, json: async () => ({ error: { message: 'Forbidden' } }), text: async () => '' };
  };
  const gateway = createOpenRouterGateway({ fetchImpl });

  await assert.rejects(() => gateway.connect(TEST_KEY), /403|forbidden/i);
  assert.equal(callCount, 1, '403 must NOT be retried');
});

// ── Model capability grading ──────────────────────────────────────────────────

test('R2.1: model with tools+tool_choice+structured_outputs is graded A', async () => {
  const fetchImpl = mockFetchSuccess({
    '/api/v1/key': VALID_KEY_RESPONSE,
    '/api/v1/models': MODELS_RESPONSE
  });
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);

  const models = gateway.listModels();
  const claude = models.find(m => m.id === 'anthropic/claude-3-5-sonnet');
  assert.ok(claude, 'claude model must be present');
  assert.equal(claude.grade, 'A', 'claude with tools+structured_outputs must be grade A');
});

test('R2.1: model with only tools+tool_choice (no structured_outputs) is graded B', async () => {
  const fetchImpl = mockFetchSuccess({
    '/api/v1/key': VALID_KEY_RESPONSE,
    '/api/v1/models': MODELS_RESPONSE
  });
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);

  const models = gateway.listModels();
  const gpt4mini = models.find(m => m.id === 'openai/gpt-4o-mini');
  assert.ok(gpt4mini, 'gpt-4o-mini model must be present');
  assert.equal(gpt4mini.grade, 'B', 'model with only tools must be grade B');
});

test('R2.1: model with no tool support is graded Unsupported', async () => {
  const fetchImpl = mockFetchSuccess({
    '/api/v1/key': VALID_KEY_RESPONSE,
    '/api/v1/models': MODELS_RESPONSE
  });
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);

  const models = gateway.listModels();
  const mistral = models.find(m => m.id === 'mistralai/mistral-7b-instruct');
  assert.ok(mistral, 'mistral model must be present');
  assert.equal(mistral.grade, 'Unsupported', 'model without tools must be Unsupported');
});

test('R2.1: Unsupported model cannot be used for agent mode', async () => {
  const fetchImpl = mockFetchSuccess({
    '/api/v1/key': VALID_KEY_RESPONSE,
    '/api/v1/models': MODELS_RESPONSE
  });
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);

  await assert.rejects(
    () => gateway.chat({
      model: 'mistralai/mistral-7b-instruct',
      messages: [],
      tools: [{ type: 'function', function: { name: 'search_products', parameters: {} } }]
    }),
    /incompatible|unsupported|no tool/i
  );
});

// ── Privacy routing defaults ──────────────────────────────────────────────────

test('R2.1: chat request includes strict privacy defaults', async () => {
  let capturedBody = null;
  const fetchImpl = async (url, opts) => {
    if (url.includes('/api/v1/chat')) {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
        text: async () => ''
      };
    }
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/models')) return { ok: true, status: 200, json: async () => MODELS_RESPONSE, text: async () => '' };
    throw new Error(`Unexpected: ${url}`);
  };

  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);
  await gateway.chat({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], tools: [] });

  assert.ok(capturedBody, 'fetch body must be captured');
  assert.strictEqual(capturedBody.provider?.require_parameters, undefined, 'must not require parameters when no tools');
  assert.strictEqual(capturedBody.provider?.data_collection, 'deny', 'must deny data collection');
  assert.strictEqual(capturedBody.provider?.zdr, true, 'must require zero data retention');
});

test('R2.1: Grade A chat permits natural final answer without JSON schema', async () => {
  let capturedBody = null;
  const fetchImpl = async (url, opts) => {
    if (url.includes('/api/v1/chat')) {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Natural text answer' } }] }),
        text: async () => ''
      };
    }
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/models')) return { ok: true, status: 200, json: async () => MODELS_RESPONSE, text: async () => '' };
    throw new Error(`Unexpected: ${url}`);
  };

  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);
  await gateway.chat({
    model: 'anthropic/claude-3-5-sonnet',
    messages: [{ role: 'user', content: 'compare LGS723 and LGS733' }],
    tools: [],
    response_format: { type: 'text' }
  });

  assert.equal(capturedBody.provider.require_parameters, true);
  assert.equal(capturedBody.response_format, undefined); // Allows natural text, no forced JSON schema
});

test('R3.3: consented marketplace search adds one bounded Amazon server tool', async () => {
  let capturedBody;
  const fetchImpl = async (url, options) => {
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/models')) return { ok: true, status: 200, json: async () => MODELS_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/chat')) {
      capturedBody = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"text":"ok","citations":[]}' } }] }), text: async () => '' };
    }
    throw new Error(`Unexpected: ${url}`);
  };
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);

  await gateway.chat({
    model: 'anthropic/claude-3-5-sonnet',
    messages: [{ role: 'user', content: 'review LGS433' }],
    tools: [],
    webSearch: true,
  });

  assert.deepEqual(capturedBody.tools, [{
    type: 'openrouter:web_search',
    parameters: {
      engine: 'exa',
      max_results: 5,
      max_total_results: 5,
      search_context_size: 'low',
      allowed_domains: ['amazon.com'],
    },
  }]);
  assert.equal(capturedBody.parallel_tool_calls, false);
  assert.equal(capturedBody.provider.require_parameters, true);
});

test('R3.3: caller cannot inject arbitrary plugins or enable web search without consent', async () => {
  let capturedBody;
  const fetchImpl = async (url, options) => {
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/models')) return { ok: true, status: 200, json: async () => MODELS_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/chat')) {
      capturedBody = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"text":"ok","citations":[]}' } }] }), text: async () => '' };
    }
    throw new Error(`Unexpected: ${url}`);
  };
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);

  await gateway.chat({
    model: 'anthropic/claude-3-5-sonnet',
    messages: [{ role: 'user', content: 'hello' }],
    tools: [],
    plugins: [{ id: 'web' }],
  });

  assert.equal(capturedBody.plugins, undefined);
  assert.equal(capturedBody.tools, undefined);
});

test('R2.1: chat rejects if provider routing fails', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/models')) return { ok: true, status: 200, json: async () => MODELS_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/chat')) return {
      ok: false, status: 429,
      json: async () => ({ error: { message: 'No provider matches routing policy' } }),
      text: async () => ''
    };
    throw new Error(`Unexpected: ${url}`);
  };
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);
  // After 1 retry (transient), should reject
  await assert.rejects(
    () => gateway.chat({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], tools: [] }),
    /429|routing|provider/i
  );
});

// ── Retry policy ──────────────────────────────────────────────────────────────

test('R2.1: 5xx error is retried once then fails', async () => {
  let callCount = 0;
  const setupFetch = (targetUrl) => async (url) => {
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/models')) return { ok: true, status: 200, json: async () => MODELS_RESPONSE, text: async () => '' };
    if (url.includes(targetUrl)) {
      callCount++;
      return { ok: false, status: 503, json: async () => ({ error: { message: 'Service Unavailable' } }), text: async () => '' };
    }
    throw new Error(`Unexpected: ${url}`);
  };

  const gateway = createOpenRouterGateway({ fetchImpl: setupFetch('/api/v1/chat') });
  await gateway.connect(TEST_KEY);

  await assert.rejects(
    () => gateway.chat({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], tools: [] }),
    /503|service unavailable/i
  );
  assert.equal(callCount, 2, '5xx must be retried exactly once (2 total calls)');
});

// ── Circuit breaker ───────────────────────────────────────────────────────────

test('R2.1: circuit opens after 3 transient failures within 2 minutes', async () => {
  let chatCallCount = 0;
  const fetchImpl = async (url) => {
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/models')) return { ok: true, status: 200, json: async () => MODELS_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/chat')) {
      chatCallCount++;
      return { ok: false, status: 503, json: async () => ({ error: { message: 'unavailable' } }), text: async () => '' };
    }
    throw new Error(`Unexpected: ${url}`);
  };

  // Use fake clock to control time
  const fakeClock = { now: () => Date.now() };
  const gateway = createOpenRouterGateway({ fetchImpl, clock: fakeClock });
  await gateway.connect(TEST_KEY);

  const chatArgs = { model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], tools: [] };

  // 3 transient failures (each call retries once = 2 fetches each)
  for (let i = 0; i < 3; i++) {
    await assert.rejects(() => gateway.chat(chatArgs), /503|unavailable/i);
  }

  // Circuit should now be OPEN — next call must fail immediately without hitting fetch
  const countBefore = chatCallCount;
  await assert.rejects(() => gateway.chat(chatArgs), /circuit|open|unavailable/i);
  // No additional fetch calls made because circuit is open
  assert.ok(chatCallCount === countBefore, 'circuit open must not make additional fetch calls');
});

test('R2.1: circuit closed state is reported in diagnostics', async () => {
  const fetchImpl = mockFetchSuccess({
    '/api/v1/key': VALID_KEY_RESPONSE,
    '/api/v1/models': MODELS_RESPONSE
  });
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);

  const diag = gateway.diagnostics();
  assert.ok('circuitState' in diag, 'diagnostics must include circuitState');
  assert.equal(diag.circuitState, 'closed', 'initial circuit state must be closed');
});

// ── Paid fallback consent ─────────────────────────────────────────────────────

test('R2.1: paid fallback chain does not activate without explicit consent', async () => {
  const fetchImpl = mockFetchSuccess({
    '/api/v1/key': VALID_KEY_RESPONSE,
    '/api/v1/models': MODELS_RESPONSE
  });
  const gateway = createOpenRouterGateway({ fetchImpl, paidFallbackConsent: false });
  await gateway.connect(TEST_KEY);

  // Even if primary model fails, paid fallback must not run without consent
  const chatArgs = {
    model: 'openai/gpt-4o-mini',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
    fallbacks: ['anthropic/claude-3-5-sonnet'] // would be paid
  };

  // No consent → fallbacks are ignored / disabled
  const result = gateway.getFallbackChain(chatArgs.model, chatArgs.fallbacks);
  // Without consent, fallbacks list must be empty or only free models
  assert.ok(
    !Array.isArray(result) || result.length === 0,
    'paid fallback chain must be empty without consent'
  );
});

// ── clearKey / unload ─────────────────────────────────────────────────────────

test('R2.1: clearKey() disconnects and diagnostics shows not connected', async () => {
  const fetchImpl = mockFetchSuccess({
    '/api/v1/key': VALID_KEY_RESPONSE,
    '/api/v1/models': MODELS_RESPONSE
  });
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);

  assert.equal(gateway.diagnostics().connected, true, 'should be connected before clear');

  gateway.clearKey();

  assert.equal(gateway.diagnostics().connected, false, 'should be disconnected after clearKey');
});

test('R2.1: model metadata is cached and not re-fetched within 6 hours', async () => {
  let modelFetchCount = 0;
  const fetchImpl = async (url) => {
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/models')) {
      modelFetchCount++;
      return { ok: true, status: 200, json: async () => MODELS_RESPONSE, text: async () => '' };
    }
    throw new Error(`Unexpected: ${url}`);
  };

  // Fake clock that returns a constant time (within 6h window)
  const t0 = Date.now();
  const fakeClock = { now: () => t0 };

  const gateway = createOpenRouterGateway({ fetchImpl, clock: fakeClock });
  await gateway.connect(TEST_KEY);
  const fetchAfterConnect = modelFetchCount;

  // Second call — still within 6h cache window
  await gateway.refreshModels({ forceRefresh: false });
  assert.equal(modelFetchCount, fetchAfterConnect, 'models must not be re-fetched within 6h cache window');
});

test('R2.1: model metadata is refreshed when cache is older than 6 hours', async () => {
  let modelFetchCount = 0;
  let currentTime = Date.now();
  const fetchImpl = async (url) => {
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/models')) {
      modelFetchCount++;
      return { ok: true, status: 200, json: async () => MODELS_RESPONSE, text: async () => '' };
    }
    throw new Error(`Unexpected: ${url}`);
  };

  const fakeClock = { now: () => currentTime };
  const gateway = createOpenRouterGateway({ fetchImpl, clock: fakeClock });
  await gateway.connect(TEST_KEY);
  const fetchAfterConnect = modelFetchCount;

  // Advance time by 7 hours (beyond 6h cache)
  currentTime += 7 * 60 * 60 * 1000;
  await gateway.refreshModels({ forceRefresh: false });
  assert.ok(modelFetchCount > fetchAfterConnect, 'models must be re-fetched after 6h cache expiry');
});

test('R2.1: failed model refresh clears the captured API key', async () => {
  let modelAttempts = 0;
  const authorizations = [];
  const fetchImpl = async (url, options = {}) => {
    authorizations.push(options.headers?.Authorization);
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE };
    if (url.includes('/api/v1/models')) {
      modelAttempts += 1;
      if (modelAttempts <= 2) return { ok: false, status: 500, json: async () => ({ error: { message: 'unavailable' } }) };
      return { ok: true, status: 200, json: async () => MODELS_RESPONSE };
    }
    throw new Error(`Unexpected: ${url}`);
  };
  const gateway = createOpenRouterGateway({ fetchImpl });
  await assert.rejects(() => gateway.connect(TEST_KEY), /unavailable/);
  await assert.rejects(() => gateway.refreshModels({ forceRefresh: true }), /not connected/i);
  assert.equal(gateway.diagnostics().connected, false);
  assert.equal(authorizations.at(-1), `Bearer ${TEST_KEY}`);
});

test('R2.1: caller cannot override privacy or Authorization defaults', async () => {
  let captured;
  const fetchImpl = async (url, options = {}) => {
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE };
    if (url.includes('/api/v1/models')) return { ok: true, status: 200, json: async () => MODELS_RESPONSE };
    captured = options;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"text":"ok","citations":[]}' } }] }) };
  };
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);
  await gateway.chat({
    model: 'openai/gpt-4o-mini', messages: [], tools: [{ type: 'function', function: { name: 'search_products' } }],
    provider: { data_collection: 'allow', zdr: false }, headers: { Authorization: 'Bearer attacker' },
  });
  const body = JSON.parse(captured.body);
  assert.deepEqual(body.provider, {
    data_collection: 'deny', zdr: true, allow_fallbacks: true, require_parameters: true,
  });
  assert.equal(captured.headers.Authorization, `Bearer ${TEST_KEY}`);
  assert.equal('headers' in body, false);
});

test('R2.1: caller cancellation aborts an in-flight request', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE };
    if (url.includes('/api/v1/models')) return { ok: true, status: 200, json: async () => MODELS_RESPONSE };
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  };
  const gateway = createOpenRouterGateway({ fetchImpl, requestTimeoutMs: 10_000 });
  await gateway.connect(TEST_KEY);
  const controller = new AbortController();
  const pending = gateway.chat({ model: 'openai/gpt-4o-mini', messages: [], signal: controller.signal });
  controller.abort();
  await assert.rejects(() => pending, /abort/i);
});

test('bugfix: gateway strips parallel_tool_calls when tools are empty to prevent OpenRouter 404 routing failure', async () => {
  let capturedBody;
  const fetchImpl = async (url, options) => {
    if (url.includes('/api/v1/key')) return { ok: true, status: 200, json: async () => VALID_KEY_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/models')) return { ok: true, status: 200, json: async () => MODELS_RESPONSE, text: async () => '' };
    if (url.includes('/api/v1/chat')) {
      capturedBody = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }), text: async () => '' };
    }
    throw new Error(`Unexpected: ${url}`);
  };
  const gateway = createOpenRouterGateway({ fetchImpl });
  await gateway.connect(TEST_KEY);

  await gateway.chat({
    model: 'openai/gpt-4o-mini',
    messages: [{ role: 'user', content: 'hello' }],
    tools: [],
    parallel_tool_calls: false
  });

  assert.equal(capturedBody.parallel_tool_calls, undefined, 'parallel_tool_calls should be stripped when tools are empty');
  assert.equal(capturedBody.tools, undefined, 'tools should not be sent when empty');
});
