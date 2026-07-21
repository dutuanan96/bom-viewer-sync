// src/features/ai-assistant/openrouter-gateway.js
// R2.1 — The ONLY module that holds the OpenRouter API key and Authorization header.
//
// SECURITY INVARIANTS (P0):
// - Key is stored ONLY in private closure. Never written to any storage.
// - Key is NEVER included in errors, logs, diagnostics, or exported state.
// - This file is the ONLY one that references openrouter.ai or sets Authorization.
// - No import of github-git-data.js, github-asset-storage.js, or githubData.write.
// - No browser storage APIs are used. Key stays in closure RAM only.
//
// ROUTING DEFAULTS (fail-closed):
// - provider.data_collection = "deny"
// - provider.zdr = true
// - provider.require_parameters = true
// - provider.allow_fallbacks = true
// - parallel_tool_calls = false

const OPENROUTER_BASE = 'https://openrouter.ai';
const MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const CIRCUIT_OPEN_DURATION_MS = 60 * 1000; // 60 seconds
const MAX_RETRIES = 1; // retry once for transient errors

// Removed FINAL_ANSWER_RESPONSE_FORMAT as per Phase 2 design (natural final text)
// Error codes used by this module
export const ERR_INCOMPATIBLE = 'AI_MODEL_INCOMPATIBLE';
export const ERR_CIRCUIT_OPEN = 'AI_CIRCUIT_OPEN';
export const ERR_POLICY = 'AI_POLICY_BLOCKED';
export const ERR_NO_COMPATIBLE_ENDPOINT = 'AI_NO_COMPATIBLE_ENDPOINT';

// Non-retryable HTTP status codes
const NO_RETRY_STATUSES = new Set([400, 401, 403, 404, 422]);

function isTransient(status) {
  return !NO_RETRY_STATUSES.has(status) && (status === 408 || status === 429 || status >= 500);
}

/**
 * Grade a model by its supported_parameters array.
 * A: tools + tool_choice + (structured_outputs or response_format)
 * B: tools + tool_choice
 * Unsupported: anything else
 */
function gradeModel(params) {
  const p = new Set(params || []);
  if (p.has('tools') && p.has('tool_choice') && (p.has('structured_outputs') || p.has('response_format'))) {
    return 'A';
  }
  if (p.has('tools') && p.has('tool_choice')) {
    return 'B';
  }
  return 'Unsupported';
}

/**
 * Redact any substring matching the key from text.
 * Used to sanitize error messages before surfacing them.
 */
function redactKey(text, key) {
  if (!key || !text) return text;
  return String(text).split(key).join('[REDACTED]');
}

/**
 * Create an OpenRouter gateway factory.
 *
 * @param {{ fetchImpl, clock?, paidFallbackConsent? }} opts
 * @returns gateway object
 */
export function createOpenRouterGateway(opts = {}) {
  const {
    fetchImpl = globalThis.fetch,
    clock = { now: () => Date.now() },
    paidFallbackConsent = false,
    requestTimeoutMs = 45_000
  } = opts;

  // ── Private closure state ──────────────────────────────────────────────────
  // _key is NEVER exposed through any public method, diagnostic, or error.
  let _key = null;
  let _connected = false;
  let _keyInfo = null;

  // Model cache
  let _models = [];
  let _modelsCachedAt = 0;

  // Circuit breaker state
  let _circuitState = 'closed'; // 'closed' | 'open'
  let _circuitOpenedAt = 0;
  let _recentFailures = []; // timestamps of transient failures

  // ── Internal fetch wrapper with redaction ──────────────────────────────────

  async function authorizedFetch(path, options = {}) {
    if (!_key) throw new Error('Gateway not connected');

    if (typeof path !== 'string' || !path.startsWith('/api/v1/')) throw new Error('OpenRouter path is not allowlisted');
    const url = `${OPENROUTER_BASE}${path}`;
    const headers = {
      'Authorization': `Bearer ${_key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'file://jintai-pdm-viewer',
      'X-Title': 'JinTai PDM Viewer',
      ...(options.headers || {})
    };

    let lastError;
    let attempts = 0;
    const maxAttempts = options.noRetry ? 1 : MAX_RETRIES + 1;

    while (attempts < maxAttempts) {
      attempts++;
      let response;
      try {
        response = await fetchImpl(url, { ...options, headers });
      } catch (networkErr) {
        if (networkErr?.name === 'AbortError' || options.signal?.aborted) throw networkErr;
        // Network-level error (e.g., timeout) — treat as transient
        lastError = new Error(redactKey(networkErr.message, _key));
        if (attempts >= maxAttempts) throw lastError;
        continue;
      }

      if (response.ok) {
        return response;
      }

      // Non-retryable errors
      if (NO_RETRY_STATUSES.has(response.status)) {
        let msg = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          msg = redactKey(body?.error?.message || msg, _key);
        } catch { /* ignore parse error */ }
        const err = new Error(msg);
        err.status = response.status;
        if (response.status === 401 || response.status === 403) {
          err.code = ERR_POLICY;
        } else if (response.status === 404 || /no endpoints found/i.test(msg) || /no available model provider/i.test(msg) || /requested parameters/i.test(msg)) {
          err.code = ERR_NO_COMPATIBLE_ENDPOINT;
        }
        throw err;
      }

      // Transient — retry up to maxAttempts
      if (isTransient(response.status)) {
        let msg = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          msg = redactKey(body?.error?.message || msg, _key);
        } catch { /* ignore */ }
        lastError = new Error(msg);
        lastError.status = response.status;
        if (attempts >= maxAttempts) throw lastError;
        continue;
      }

      // Unknown status
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }

    throw lastError || new Error('Request failed');
  }

  // ── Circuit breaker ────────────────────────────────────────────────────────

  function recordTransientFailure() {
    const now = clock.now();
    _recentFailures.push(now);
    // Keep only failures within the window
    _recentFailures = _recentFailures.filter(t => now - t < CIRCUIT_WINDOW_MS);
    if (_recentFailures.length > 20) {
      _recentFailures = _recentFailures.slice(-20); // strict cap to prevent memory leak
    }
    if (_recentFailures.length >= CIRCUIT_FAILURE_THRESHOLD) {
      _circuitState = 'open';
      _circuitOpenedAt = now;
    }
  }

  function checkCircuit() {
    if (_circuitState === 'open') {
      const now = clock.now();
      if (now - _circuitOpenedAt >= CIRCUIT_OPEN_DURATION_MS) {
        // Allow one attempt (half-open)
        _circuitState = 'closed';
        _recentFailures = [];
      } else {
        const err = new Error('Circuit breaker open — too many recent failures');
        err.code = ERR_CIRCUIT_OPEN;
        throw err;
      }
    }
  }

  // ── Fetch with circuit breaker ─────────────────────────────────────────────

  async function protectedFetch(path, options) {
    checkCircuit();
    try {
      const result = await authorizedFetch(path, options);
      // Success — reset if in half-open
      return result;
    } catch (err) {
      if (isTransient(err.status) || err.code === ERR_CIRCUIT_OPEN) {
        // Don't double-count circuit errors
        if (err.code !== ERR_CIRCUIT_OPEN) recordTransientFailure();
      }
      throw err;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Connect the gateway with an API key.
   * Validates key via /api/v1/key, loads model registry, clears input field (caller responsibility).
   * Returns safe connection info (no key).
   */
  async function connect(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') throw new Error('API key is required');

    // Store in closure ONLY
    _key = apiKey;
    _connected = false;

    try {
      // Validate key
      const resp = await authorizedFetch('/api/v1/key', { noRetry: true });
      const keyResponse = await resp.json();
      _keyInfo = {
        label: keyResponse?.data?.label,
        usage: keyResponse?.data?.usage,
        limit: keyResponse?.data?.limit,
        limitRequests: keyResponse?.data?.limit_requests,
        isFreeTier: keyResponse?.data?.is_free_tier
      };

      // A connection is valid only when both key validation and registry loading succeed.
      await _refreshModels();
    } catch (err) {
      _key = null;
      _keyInfo = null;
      _models = [];
      _modelsCachedAt = 0;
      throw err;
    }

    _connected = true;

    return {
      connected: true,
      keyInfo: { ..._keyInfo } // copy, no key included
    };
  }

  /**
   * Clear the key and disconnect.
   */
  function clearKey() {
    _key = null;
    _connected = false;
    _keyInfo = null;
  }

  /**
   * Internal model refresh.
   */
  async function _refreshModels() {
    const resp = await authorizedFetch('/api/v1/models?supported_parameters=tools');
    const body = await resp.json();
    _models = (body.data || []).map(m => ({
      id: m.id,
      name: m.name || m.id,
      grade: gradeModel(m.supported_parameters),
      supportedParameters: m.supported_parameters || [],
      pricing: m.pricing || {}
    }));
    _modelsCachedAt = clock.now();
  }

  /**
   * Refresh model list, respecting 6h cache by default.
   */
  async function refreshModels({ forceRefresh = false } = {}) {
    if (!forceRefresh && clock.now() - _modelsCachedAt < MODEL_CACHE_TTL_MS) {
      return; // Cache still valid
    }
    await _refreshModels();
  }

  /**
   * List graded models.
   */
  function listModels() {
    return _models.map(m => ({ ...m }));
  }

  /**
   * Get fallback chain for a model, filtered by paid-fallback consent.
   */
  function getFallbackChain(primaryModelId, fallbacks = []) {
    if (!paidFallbackConsent) {
      // Without consent, no paid fallbacks
      return [];
    }
    return fallbacks.filter(id => id !== primaryModelId);
  }

  /**
   * Send a chat completion request.
   * Enforces privacy routing defaults, parallel_tool_calls=false.
   * Rejects incompatible models for tool use.
   */
  async function chat({
    model,
    messages,
    tools = [],
    maxTokens = 1200,
    signal,
    webSearch = false,
    provider: _provider,
    headers: _headers,
    plugins: _plugins,
    response_format: _responseFormat,
    parallel_tool_calls: _parallel_tool_calls,
    ...rest
  }) {
    if (!_connected || !_key) throw new Error('Gateway not connected');

    // Find model grade
    const modelMeta = _models.find(m => m.id === model);
    if (!modelMeta) {
      const err = new Error(`Model ${model} not found in registry`);
      err.code = ERR_INCOMPATIBLE;
      throw err;
    }

    if (tools.length > 0 && modelMeta.grade === 'Unsupported') {
      const err = new Error(`Model ${model} does not support tool calling (grade: Unsupported)`);
      err.code = ERR_INCOMPATIBLE;
      throw err;
    }
    if (tools.some((tool) => tool?.function?.name === 'submit_proposal') && modelMeta.grade !== 'A') {
      const err = new Error(`Model ${model} must be Grade A to submit proposals`);
      err.code = ERR_INCOMPATIBLE;
      throw err;
    }

    const bodyObj = {
      model,
      messages,
      max_tokens: maxTokens,
      ...rest,
      provider: {
        data_collection: 'deny',
        zdr: true,
        allow_fallbacks: true
      }
    };

    const requestTools = [...tools];
    if (webSearch === true) {
      requestTools.push({
        type: 'openrouter:web_search',
        parameters: {
          engine: 'exa',
          max_results: 5,
          max_total_results: 5,
          search_context_size: 'low',
          allowed_domains: ['amazon.com'],
        },
      });
    }

    if (modelMeta.grade === 'A') {
      // Natural text is allowed, no response_format enforced here.
      bodyObj.provider.require_parameters = true;
    }

    if (requestTools.length > 0) {
      bodyObj.provider.require_parameters = true;
      bodyObj.tools = requestTools;
      bodyObj.tool_choice = 'auto';
      bodyObj.parallel_tool_calls = false;
    }

    const controller = new AbortController();
    const requestSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

    let response;
    try {
      response = await protectedFetch('/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify(bodyObj),
        signal: requestSignal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    return response.json();
  }

  /**
   * Return non-secret diagnostic info.
   * MUST NOT contain the API key or any key substring.
   */
  function diagnostics() {
    return {
      connected: _connected,
      keyInfo: _keyInfo ? { ..._keyInfo } : null,
      modelCount: _models.length,
      modelsCachedAt: _modelsCachedAt,
      circuitState: _circuitState,
      circuitOpenedAt: _circuitOpenedAt,
      recentFailureCount: _recentFailures.length,
      paidFallbackConsent
    };
  }

  return {
    connect,
    clearKey,
    refreshModels,
    listModels,
    getFallbackChain,
    chat,
    diagnostics
  };
}
