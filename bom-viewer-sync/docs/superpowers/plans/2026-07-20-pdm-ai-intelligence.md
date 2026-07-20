# PDM AI Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the standalone PDM AI reliably route product, revision, BOM, comparison, material, and marketplace questions while retaining bounded context and producing safe diagnostics.

**Architecture:** Add browser-native deep modules for deterministic intent routing, bounded conversation state, structured BOM comparison, and allowlisted tracing. Keep the existing OpenRouter gateway, trust policy, local PDM tools, proposal approval flow, canonical shards, and single-file build. Execute trusted read-only PDM routes before the first model call; let the model explain grounded results instead of discovering obvious tool choices probabilistically.

**Tech Stack:** ES modules, browser DOM APIs, Node.js built-in test runner, Playwright, existing esbuild single-file build, canonical sharded JSON data.

## Global Constraints

- Source of truth is `data/manifest.json`, `data/materials.json`, and `data/products/*.json`; do not modify `data.js` or canonical shards.
- Preserve standalone `viewer.html` and `admin.html`; add no Python, Google ADK, SQLite, MCP runtime, or new npm dependency.
- API keys remain RAM-only and must never enter history, trace, memory, diagnostics, storage, errors, or test fixtures that resemble a real key.
- PDM mutation remains proposal-only, Admin-only, Draft-only, clean-revision-only, and human-approved.
- User-facing PDM strings use zh-CN/vi i18n keys; source code, identifiers, comments, and tests use English.
- Keep model calls at three and tool calls at six per turn; deterministic prefetch counts as a tool call.
- Do not stage, commit, merge, push, or release from the current dirty `main`; use reviewer checkpoints instead.

---

## File map

- Create `src/features/ai-assistant/intent-router.js`: extract canonical entities and choose one read-only PDM intent.
- Create `src/features/ai-assistant/conversation-session.js`: bounded RAM-only prior-turn context.
- Create `src/features/ai-assistant/safe-trace.js`: allowlisted operational events and redacted export data.
- Create `src/features/ai-assistant/pdm-skill-registry.js`: validate and select one versioned specialist per deterministic route.
- Create `src/features/ai-assistant/scoped-memory.js`: bounded deterministic retrieval of confirmed local memory.
- Create `src/features/ai-assistant/pdm-ontology.js`: evidence-bearing physical material-family classification.
- Create `src/features/ai-assistant/grounding-verifier.js`: fail-closed validation of deterministic tool results.
- Modify `src/features/ai-assistant/trust-policy.js`: preserve the current query in minimized context.
- Modify `src/features/ai-assistant/contracts.js`: enforce exact per-tool argument contracts locally.
- Modify `src/features/ai-assistant/index.js`: expose strict schemas, own conversation state, route turns, and surface trace.
- Modify `src/features/ai-assistant/runtime.js`: accept history/route, execute deterministic prefetch, and return trace.
- Modify `src/features/ai-assistant/pdm-knowledge.js`: structured canonical BOM comparison.
- Modify `src/features/ai-assistant/workspace-view.js`: trace diagnostics without unsafe sinks.
- Modify `src/application.js`: i18n labels only.
- Add or modify focused tests under `tests/`; extend `tests/e2e/ai-assistant.spec.mjs` for the real regression.

### Task 1: Preserve the exact user query

**Files:**
- Modify: `src/features/ai-assistant/trust-policy.js:46-75`
- Modify: `tests/ai-trust-policy.test.mjs`
- Modify: `tests/ai-runtime.test.mjs`

**Interfaces:**
- Consumes: `createTrustPolicy().buildContext({ snapshot, query })`
- Produces: a minimized context whose `query` is the exact bounded Unicode input.

- [ ] **Step 1: Write the failing trust-policy regression**

```js
test('R2.2: buildContext preserves the exact bounded Unicode query', () => {
  const policy = createTrustPolicy();
  const query = '为什么LGS032有状态是草稿呢？';
  const context = policy.buildContext({ snapshot: VALID_SNAPSHOT, query });
  assert.equal(context.query, query);
});
```

- [ ] **Step 2: Write the failing runtime-boundary regression**

Capture the first gateway request and assert:

```js
const userMessage = captured.messages.find(message => message.role === 'user');
assert.equal(userMessage.content, '为什么LGS032有状态是草稿呢？');
```

- [ ] **Step 3: Verify RED**

Run: `node --test tests/ai-trust-policy.test.mjs tests/ai-runtime.test.mjs`

Expected: both new assertions fail because `buildContext()` currently omits `query`.

- [ ] **Step 4: Implement the minimal fix**

Return the already-built safe field instead of reconstructing the object without it:

```js
return {
  ...contextPayload,
  estimatedTokens,
  dataSummary,
  lang: snapshot.lang || 'en',
};
```

- [ ] **Step 5: Verify GREEN and review the focused diff**

Run: `node --test tests/ai-trust-policy.test.mjs tests/ai-runtime.test.mjs`

Expected: all focused tests pass and no full BOM/material/revision payload appears in serialized context.

### Task 2: Add deterministic PDM intent routing

**Files:**
- Create: `src/features/ai-assistant/intent-router.js`
- Create: `tests/ai-intent-router.test.mjs`

**Interfaces:**
- Consumes: `routePdmIntent({ query, selection, availableTools })`
- Produces: frozen `{ intent, entities, preferredTool, confidence }`.

- [ ] **Step 1: Write failing routing tests**

Cover these exact cases:

```js
assert.deepEqual(
  routePdmIntent({
    query: '为什么LGS032有状态是草稿呢？',
    selection: { productCode: 'LGS433' },
    availableTools: ['get_revision_history', 'search_products'],
  }),
  {
    intent: 'revision_status',
    entities: { productIds: ['LGS032'] },
    preferredTool: 'get_revision_history',
    confidence: 'deterministic',
  },
);
```

Also test Vietnamese/English revision questions, two-SKU comparisons, BOM lookup, material usage, Amazon reviews, alias resolution, selected-product references, ambiguous text, lowercase SKU normalization, and unavailable preferred tools.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-intent-router.test.mjs`

Expected: module-not-found failure.

- [ ] **Step 3: Implement the router**

Use these exact public constants and return shape:

```js
const PRODUCT_PATTERN = /\bLGS\d{3,4}\b/gi;

export const PDM_INTENTS = Object.freeze({
  REVISION_STATUS: 'revision_status',
  BOM_LOOKUP: 'bom_lookup',
  BOM_COMPARE: 'bom_compare',
  MATERIAL_DETAIL: 'material_detail',
  MATERIAL_USAGE: 'material_usage',
  MARKETPLACE: 'marketplace',
  SKU_ALIAS: 'sku_alias',
  DISCOVERY: 'discovery',
  AMBIGUOUS: 'ambiguous',
});

export function routePdmIntent({ query, selection = {}, availableTools = [] }) {
  // Normalize bounded text, extract unique uppercase product IDs, match the
  // narrow specialist patterns in priority order, and fail to AMBIGUOUS.
}
```

Pattern groups must recognize Chinese, Vietnamese, and English terms for revision/status/history, compare/difference, BOM/parts/quantity, where-used, Amazon/reviews, and SKU/alias. Explicit product IDs override UI selection. The router never returns `submit_proposal`.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/ai-intent-router.test.mjs`

Expected: all routing cases pass without network or model mocks.

### Task 3: Make model and local tool contracts strict

**Files:**
- Modify: `src/features/ai-assistant/contracts.js`
- Modify: `src/features/ai-assistant/index.js:8-78`
- Modify: `tests/ai-contracts.test.mjs`
- Modify: `tests/ai-feature-tools.test.mjs`

**Interfaces:**
- Consumes: `validateToolCall({ name, arguments })`, `buildAvailableTools(modelInfo)`
- Produces: locally validated arguments matching provider-visible JSON schemas.

- [ ] **Step 1: Write failing contract tests**

```js
assert.throws(
  () => validateToolCall({ name: 'search_products', arguments: {} }),
  /query.*required/i,
);
assert.throws(
  () => validateToolCall({ name: 'search_products', arguments: { query: '   ' } }),
  /query.*empty/i,
);
assert.throws(
  () => validateToolCall({ name: 'get_revision_history', arguments: { productId: '032' } }),
  /productId/i,
);
```

Assert every exposed schema has `additionalProperties: false`, search query `minLength: 1`, and canonical product patterns.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-contracts.test.mjs tests/ai-feature-tools.test.mjs`

Expected: empty discovery calls and incomplete schemas are currently accepted.

- [ ] **Step 3: Implement shared strict rules**

Add one internal rule table in `contracts.js` and validate after the existing generic size checks:

```js
const PRODUCT_ID_PATTERN = /^LGS\d{3,4}$/i;
const REQUIRED_STRING_ARGUMENTS = Object.freeze({
  search_products: ['query'],
  get_product: ['productId'],
  get_bom: ['productId'],
  get_revision_history: ['productId'],
  audit_product_data: ['productId'],
  get_marketplace_insights: ['productId'],
  get_material: ['materialId'],
  where_used: ['materialId'],
  resolve_sku: ['alias'],
  compare_boms: ['productId1', 'productId2'],
});
```

Reject missing, non-string, or blank required strings. Validate every `productId*` against `PRODUCT_ID_PATTERN`. Keep proposal validation unchanged.

Update provider-visible schemas to mirror these constraints exactly.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/ai-contracts.test.mjs tests/ai-feature-tools.test.mjs tests/ai-trust-policy.test.mjs`

Expected: all tests pass and the trust policy still fails closed through `validateToolCall`.

### Task 4: Prefetch deterministic read-only routes

**Files:**
- Modify: `src/features/ai-assistant/runtime.js`
- Modify: `src/features/ai-assistant/index.js`
- Modify: `tests/ai-runtime.test.mjs`

**Interfaces:**
- Consumes: `runTurn({ query, history, route, snapshot, model, availableTools, signal, marketplaceWebEnabled })`
- Produces: one grounded answer whose first model request already contains the deterministic local tool result.

- [ ] **Step 1: Write the failing LGS032 end-to-end runtime test**

Route the exact Chinese question to `get_revision_history`, provide a tool result with current draft `V3.1` and effective released `V3`, and assert:

```js
assert.equal(toolCalls[0].name, 'get_revision_history');
assert.deepEqual(toolCalls[0].arguments, { productId: 'LGS032' });
assert.equal(chatRequests.length, 1);
assert.match(JSON.stringify(chatRequests[0].messages), /V3\.1/);
assert.doesNotMatch(JSON.stringify(chatRequests[0].messages), /22 products/);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-runtime.test.mjs`

Expected: runtime does not accept a route or prefetch a tool.

- [ ] **Step 3: Implement deterministic prefetch**

Before the model loop:

```js
const prefetched = route?.confidence === 'deterministic'
  ? buildPreferredToolCall(route)
  : null;

if (prefetched) {
  budget.recordToolCall(prefetched.name);
  currentTurnUsage.toolCalls += 1;
  const safeCall = trustPolicy.authorizeToolCall(prefetched);
  const result = await runTool(safeCall, snapshot);
  collectEvidence(accumulatedEvidence, result?.evidence);
  messages.push({
    role: 'user',
    content: `TRUSTED_LOCAL_PDM_RESULT\n${JSON.stringify(result)}\nAnswer the original question from this result.`,
  });
}
```

`buildPreferredToolCall` maps only read-only intents. `collectEvidence` accepts one evidence object or a bounded array. `index.js` computes the route from the exact query and passes it to runtime.

- [ ] **Step 4: Verify GREEN and existing model-loop compatibility**

Run: `node --test tests/ai-runtime.test.mjs tests/ai-intent-router.test.mjs tests/ai-knowledge.test.mjs`

Expected: deterministic route uses one tool and one model call; ambiguous tool-loop tests remain green.

### Task 5: Add bounded RAM-only conversation sessions

**Files:**
- Create: `src/features/ai-assistant/conversation-session.js`
- Create: `tests/ai-conversation-session.test.mjs`
- Modify: `src/features/ai-assistant/index.js`
- Modify: `src/features/ai-assistant/runtime.js`
- Modify: `tests/ai-runtime.test.mjs`

**Interfaces:**
- Consumes: `createConversationSession({ maxTurns = 8, maxChars = 12000 })`
- Produces: `contextFor(query)`, `record(turn)`, `clear()`, `diagnostics()`.

- [ ] **Step 1: Write failing session tests**

Assert eight-turn retention, deterministic oldest-first eviction, character-budget eviction, immutable returned messages, omission of empty turns, and full clear. Seed strings named `apiKey`, `authorization`, and `sk-test-secret`; assert they are rejected rather than stored.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-conversation-session.test.mjs`

Expected: module-not-found failure.

- [ ] **Step 3: Implement the deep module**

```js
export function createConversationSession({ maxTurns = 8, maxChars = 12000 } = {}) {
  const turns = [];
  return Object.freeze({
    contextFor(query) { /* return cloned prior user/assistant messages */ },
    record({ userText, assistantText, toolEvents = [] }) { /* validate and evict */ },
    clear() { turns.splice(0); },
    diagnostics() { return { turnCount: turns.length, maxTurns, maxChars }; },
  });
}
```

Do not store raw tool results. Store only allowlisted `{ name, status }` tool events. Use the existing secret-key/value rejection vocabulary from `local-store.js` rather than accepting secret-like text.

- [ ] **Step 4: Integrate and verify follow-ups**

`index.js` requests history before `runTurn`, records only the validated answer after success, and clears on disconnect and Clear Chat. `runtime.js` inserts cloned history between system and current user messages.

Run: `node --test tests/ai-conversation-session.test.mjs tests/ai-runtime.test.mjs`

Expected: “why is it non-current?” receives the prior LGS032 exchange while the latest current query remains last.

### Task 6: Deepen canonical BOM comparison

**Files:**
- Modify: `src/features/ai-assistant/pdm-knowledge.js:42-52,272-287`
- Modify: `tests/ai-knowledge.test.mjs`

**Interfaces:**
- Consumes: `PdmKnowledge.compareBoms({ productId1, color1, productId2, color2 })`
- Produces: bounded structured comparison with two evidence records.

- [ ] **Step 1: Write failing comparison tests**

Create a fixture containing duplicate rows for the same material, a quantity change, a unit change, one unique material per product, and explicit colors. Assert:

```js
assert.equal(result.summary.commonCount, 1);
assert.equal(result.summary.onlyProduct1Count, 1);
assert.equal(result.summary.onlyProduct2Count, 1);
assert.equal(result.summary.quantityOrUnitDifferenceCount, 1);
assert.equal(result.evidence.length, 2);
assert.equal(result.evidence[0].recordId, 'LGS031');
assert.equal(result.evidence[1].recordId, 'LGS032');
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-knowledge.test.mjs`

Expected: current tool returns only two raw row arrays.

- [ ] **Step 3: Implement canonical aggregation**

Add `materialId` to safe BOM row summaries. Aggregate duplicate rows by canonical material ID and level, summing finite numeric quantities without mutating source rows. Compare aggregated maps and return:

```js
{
  product1: { productCode, color, totalRows },
  product2: { productCode, color, totalRows },
  summary: {
    commonCount,
    onlyProduct1Count,
    onlyProduct2Count,
    quantityOrUnitDifferenceCount,
    similarityScore,
  },
  common,
  onlyProduct1,
  onlyProduct2,
  quantityOrUnitDifferences,
  truncated,
  evidence: [product1Evidence, product2Evidence],
}
```

Bound each result array to 100 entries. Similarity is `common / union`, or `1` when both sets are empty.

- [ ] **Step 4: Verify GREEN and canonical integration**

Run: `node --test tests/ai-knowledge.test.mjs`

Expected: fixture and 24-shard integration tests pass without changes under `data/`.

### Task 7: Add safe operational trace and diagnostic UI

**Files:**
- Create: `src/features/ai-assistant/safe-trace.js`
- Create: `tests/ai-safe-trace.test.mjs`
- Modify: `src/features/ai-assistant/runtime.js`
- Modify: `src/features/ai-assistant/index.js`
- Modify: `src/features/ai-assistant/workspace-view.js`
- Modify: `src/application.js`
- Modify: `scripts/audit-ai-security.mjs`

**Interfaces:**
- Consumes: `createSafeTrace({ now })`, `trace.add(type, fields)`, `trace.finish()`
- Produces: a frozen bounded array of allowlisted event objects.

- [ ] **Step 1: Write failing redaction and bounds tests**

Seed a fake key, authorization header, raw prompt, provider error, and oversized value. Assert output contains only event type, timestamp offset, model ID, intent, tool name, stable status/code, latency, evidence IDs, and numeric usage. Assert maximum 32 events and no value over 200 characters.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-safe-trace.test.mjs`

Expected: module-not-found failure.

- [ ] **Step 3: Implement and integrate trace events**

Use a fixed allowlist:

```js
const EVENT_TYPES = new Set([
  'route_selected',
  'model_requested',
  'tool_requested',
  'tool_completed',
  'fallback_used',
  'answer_validated',
]);
```

The runtime returns `{ text, citations, usage, trace }`. `index.js` retains only the most recent trace and calls `settings.updateTrace(trace)`.

- [ ] **Step 4: Add safe Settings rendering**

Create a localized diagnostics section with a summary and copy/export button. Build every node with `createElement` and `textContent`; do not use `innerHTML`. Add zh-CN and Vietnamese labels in `application.js`. Extend the security audit to reject HTML sinks in trace rendering.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/ai-safe-trace.test.mjs tests/ai-runtime.test.mjs && node scripts/audit-ai-security.mjs`

Expected: trace tests pass and the AI security audit reports no findings.

### Task 8: Specialist instructions, real regression E2E, and final gates

**Files:**
- Modify: `knowledge/ai/skills.json`
- Modify: `knowledge/ai/prompt-pack.json`
- Modify: `tests/ai-knowledge.test.mjs`
- Modify: `tests/ai-evaluation.test.mjs`
- Modify: `tests/e2e/ai-assistant.spec.mjs`
- Modify: `AI_DEBUG_GUIDE.md`
- Generated: `viewer.html`, `admin.html`

**Interfaces:**
- Consumes: selected route and strict local tools.
- Produces: versioned specialist guidance and release evidence.

- [ ] **Step 1: Write failing knowledge/evaluation tests**

Require specialist entries for revision, BOM, comparison, material usage, proposal, and marketplace. Each entry names allowed tools, evidence requirement, and a short “do not use” rule. Add deterministic evaluation cases for the LGS032 draft/effective distinction, LGS031-vs-LGS032 comparison, LGS433 alias, and an ambiguous clarification.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-knowledge.test.mjs tests/ai-evaluation.test.mjs`

Expected: new specialist metadata and regression cases are absent.

- [ ] **Step 3: Update versioned packs minimally**

Increase pack versions once. Do not hardcode the 22-product inventory. Keep specialist instructions concise and route-specific; shared safety rules remain in one place.

- [ ] **Step 4: Add the Playwright regression**

Mock OpenRouter only after asserting the first request contains the exact Chinese query and a prefetched `get_revision_history` result for LGS032. Return a grounded Chinese explanation. Assert the UI mentions draft/latest and effective/released revisions and does not list all 22 products. Also verify Clear Chat removes follow-up context.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
node --test tests/ai-trust-policy.test.mjs tests/ai-intent-router.test.mjs tests/ai-contracts.test.mjs tests/ai-feature-tools.test.mjs tests/ai-runtime.test.mjs tests/ai-conversation-session.test.mjs tests/ai-knowledge.test.mjs tests/ai-safe-trace.test.mjs tests/ai-evaluation.test.mjs
```

Expected: zero failures.

- [ ] **Step 6: Build and run the full repository gate**

Run:

```powershell
npm run build
npm run check
npm audit --audit-level=high
git diff --check
git diff --exit-code -- data.js data
```

Expected: build exits 0; all Node and Playwright tests pass; data/runtime/generated/AI audits pass; npm reports zero high vulnerabilities; diff check is clean; canonical data diff is empty.

- [ ] **Step 7: Perform live smoke testing separately**

Use a newly rotated OpenRouter key entered directly in Settings. Verify revision routing, follow-up context, comparison, model/usage trace, marketplace consent, disconnect clearing, and safe provider failure. Do not paste the key into chat, shell commands, files, screenshots, or logs. Report live results separately from deterministic gates.

- [ ] **Step 8: Reviewer checkpoint**

Record branch, exact HEAD, dirty/staged/untracked state, changed-file list, gate outputs, and live-test exclusions. Do not integrate until an independent findings-first review and owner sign-off are complete.

---

## Hermes-inspired supervised intelligence extension

Tasks 9-12 complete the approved browser-native subset of Hermes patterns. They do not add a backend, autonomous writes, terminal access, or self-modifying skills.

### Task 9: Wire one versioned specialist into each deterministic turn

**Files:**
- Create: `src/features/ai-assistant/pdm-skill-registry.js`
- Create: `tests/ai-skill-registry.test.mjs`
- Modify: `knowledge/ai/prompt-pack.json`
- Modify: `src/features/ai-assistant/index.js`
- Modify: `src/features/ai-assistant/runtime.js`
- Modify: `tests/ai-runtime.test.mjs`

**Interfaces:**
- Consumes: `createPdmSkillRegistry({ promptPack, skillsPack })`, the route returned by `routePdmIntent`, and the existing JSON packs.
- Produces: `registry.select(route)` and `registry.promptFor(skill)`; one frozen specialist with no authorization power.

- [ ] **Step 1: Write failing registry tests**

```js
const registry = createPdmSkillRegistry({ promptPack, skillsPack });
const selected = registry.select({ intent: 'bom_compare', confidence: 'deterministic' });
assert.equal(selected.id, 'bom_comparison');
assert.deepEqual(selected.allowedTools, ['compare_boms']);
assert.match(registry.promptFor(selected), /exact materialId/i);
assert.equal(registry.select({ intent: 'ambiguous', confidence: 'ambiguous' }), null);
assert.throws(
  () => createPdmSkillRegistry({
    promptPack: { ...promptPack, specialists: [{ ...promptPack.specialists[0], allowedTools: ['github_write'] }] },
    skillsPack,
  }),
  /unauthorized tool/i,
);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-skill-registry.test.mjs`

Expected: module-not-found failure.

- [ ] **Step 3: Implement the minimal registry**

```js
const INTENT_TO_SPECIALIST = Object.freeze({
  revision_status: 'revision',
  bom_lookup: 'bom_lookup',
  bom_compare: 'bom_comparison',
  material_detail: 'material_usage',
  material_usage: 'material_usage',
  marketplace: 'marketplace',
  sku_alias: 'marketplace',
});

export function createPdmSkillRegistry({ promptPack, skillsPack }) {
  // Validate pack versions, unique specialist IDs, concise instructions,
  // and every allowed tool against skillsPack plus contracts ALLOWED_TOOLS.
  // Return frozen select(route), promptFor(skill), and diagnostics().
}
```

Add short English `instructions` and `verification` arrays to each specialist in `prompt-pack.json`. Increase both runtime pack versions to `1.2.0` once. Do not add product inventory or mutable BOM facts.

- [ ] **Step 4: Integrate without duplicating authorization**

Import the two JSON packs from `index.js` so esbuild inlines them into the standalone artifact. Create the registry once, select after routing, and pass `skill` into `runtime.runTurn`. Append `registry.promptFor(skill)` to the stable PDM workflow block. Do not use the skill to bypass `buildAvailableTools`, `validateToolCall`, or `trustPolicy.authorizeToolCall`.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
node --test tests/ai-skill-registry.test.mjs tests/ai-runtime.test.mjs tests/ai-knowledge.test.mjs tests/ai-feature-tools.test.mjs
npm run build
```

Expected: one matching specialist appears in the captured system prompt; unrelated specialist text does not; build exits 0.

### Task 10: Retrieve confirmed memory by scope instead of model-guessed keys

**Files:**
- Create: `src/features/ai-assistant/scoped-memory.js`
- Create: `tests/ai-scoped-memory.test.mjs`
- Modify: `src/features/ai-assistant/index.js`
- Modify: `src/features/ai-assistant/runtime.js`
- Modify: `tests/ai-runtime.test.mjs`

**Interfaces:**
- Consumes: `selectScopedMemories({ localStore, route, snapshot, query, maxItems, maxChars })`.
- Produces: a frozen array of bounded `{ id, fact, scope, provenance }` records and `formatScopedMemories(records)`.

- [ ] **Step 1: Write failing scope, trust, and bound tests**

Create candidate, confirmed, rejected, stale, exact-product, exact-material, exact-intent, unrelated, and confirmed imported-knowledge fixtures. Assert:

```js
const selected = selectScopedMemories({
  localStore,
  route: { intent: 'bom_compare', entities: { productIds: ['LGS723', 'LGS733'] } },
  snapshot: { sourceMetadata: { commitSha: SOURCE_SHA } },
  query: 'LGS723和LGS733有什么铁件共用？',
});
assert.ok(selected.every(record => record.status === 'confirmed'));
assert.ok(selected.some(record => record.scope.productCode === 'LGS723'));
assert.ok(!selected.some(record => record.scope.productCode === 'LGS433'));
assert.ok(selected.length <= 4);
assert.ok(formatScopedMemories(selected).length <= 1600);
```

Also assert candidate and stale records never appear, secret-like values throw, and returned records cannot mutate store state.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-scoped-memory.test.mjs`

Expected: module-not-found failure.

- [ ] **Step 3: Implement deterministic ranking**

Use only `localStore.listConfirmed({ currentSourceCommit })`. Score exact product/material/intent/key matches before bounded Unicode token overlap. Require at least one scope match or two meaningful query-token overlaps for global imported knowledge. Sort by descending score then stable ID, take four, and truncate the formatted block to 1,600 characters without splitting a record.

- [ ] **Step 4: Inject confirmed memory as subordinate context**

`index.js` selects memory before `runTurn` and passes it as `confirmedMemories`. `runtime.js` adds a clearly delimited `TRUSTED_USER_CONFIRMED_MEMORY` block after the selected skill and before ephemeral query evidence. The block states that canonical local tool results override memory. Remove no existing `store_memory` candidate gate.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
node --test tests/ai-scoped-memory.test.mjs tests/ai-local-store.test.mjs tests/ai-runtime.test.mjs
node scripts/audit-ai-security.mjs
```

Expected: confirmed relevant memory appears; candidate/stale/unrelated memory and seeded secrets do not.

### Task 11: Add evidence-bearing PDM ontology and fail-closed grounding verification

**Files:**
- Create: `src/features/ai-assistant/pdm-ontology.js`
- Create: `src/features/ai-assistant/grounding-verifier.js`
- Create: `tests/ai-pdm-ontology.test.mjs`
- Create: `tests/ai-grounding-verifier.test.mjs`
- Modify: `src/features/ai-assistant/pdm-knowledge.js`
- Modify: `src/features/ai-assistant/runtime.js`
- Modify: `tests/ai-knowledge.test.mjs`
- Modify: `tests/ai-runtime.test.mjs`

**Interfaces:**
- Consumes: `classifyMaterialFamily(row)`, `summarizeMaterialFamilies(rows)`, and `verifyGrounding({ route, query, toolCall, toolResult })`.
- Produces: explicit/inferred/unknown material-family summaries and frozen answer requirements.

- [ ] **Step 1: Write failing ontology tests**

```js
assert.deepEqual(classifyMaterialFamily({ materialZh: 'Q195' }), {
  family: 'metal', confidence: 'explicit', evidence: 'Q195',
});
assert.equal(classifyMaterialFamily({ nameZh: '内六角螺丝', materialZh: '' }).confidence, 'inferred');
assert.equal(classifyMaterialFamily({ nameZh: '布抽条', materialZh: 'PP&GF40' }).family, 'polymer');
assert.equal(classifyMaterialFamily({ nameZh: '侧框', materialZh: '' }).family, 'unknown');
```

Test Chinese, Vietnamese, and English explicit metal values, conflicting fields, bounded summaries, and the rule that `attributeZh: '五金包'` alone does not prove metal.

- [ ] **Step 2: Write failing verifier tests**

For `bom_compare`, assert a correct two-product result returns requirements containing both product IDs, exact identity semantics, category counts, material-family counts, and unknown disclosure. Assert wrong product IDs, missing two-item evidence, unbounded arrays, or missing summary throw an error with code `AI_GROUNDING_INVALID` before any gateway request.

- [ ] **Step 3: Verify RED**

Run: `node --test tests/ai-pdm-ontology.test.mjs tests/ai-grounding-verifier.test.mjs`

Expected: module-not-found failures.

- [ ] **Step 4: Implement ontology and comparison summaries**

Use compact frozen regex tables. Explicit material fields take precedence over inferred names; explicit non-metal values prevent metal inference. Extend `compareBoms` with `summary.commonByMaterialFamily` and bounded row-level `materialFamily` metadata while preserving exact `materialId` identity and all existing arrays.

- [ ] **Step 5: Integrate the verifier before the provider call**

Immediately after deterministic prefetch, call `verifyGrounding`. If valid, append its requirements to the trusted local result message. If invalid, add a safe trace code and throw without calling `gateway.chat`. Keep ambiguous model-selected tool results under existing trust-policy validation.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
node --test tests/ai-pdm-ontology.test.mjs tests/ai-grounding-verifier.test.mjs tests/ai-knowledge.test.mjs tests/ai-runtime.test.mjs
```

Expected: metal, non-metal, inferred, and unknown counts are deterministic; malformed trusted results never reach the provider.

### Task 12: Close the supervised learning and real-user regression loop

**Files:**
- Modify: `tests/ai-evaluation.test.mjs`
- Modify: `scripts/eval-ai.mjs`
- Modify: `tests/e2e/ai-assistant.spec.mjs`
- Modify: `scripts/audit-ai-security.mjs`
- Modify: `AI_DEBUG_GUIDE.md`
- Generated: `viewer.html`, `admin.html`, `app-admin.js`, `styles.css`

**Interfaces:**
- Consumes: the selected specialist, scoped confirmed memories, ontology summaries, grounding requirements, and existing candidate-confirmation UI.
- Produces: regression evidence that learning remains supervised and useful across turns.

- [ ] **Step 1: Add failing deterministic evaluation cases**

Add cases for:

- `LGS723和LGS733有什么铁件共用？` selects `bom_comparison` and returns explicit/inferred/unknown material-family counts;
- the follow-up `左右侧框也算吗？还有哪些未知？` reuses both product IDs;
- a confirmed LGS723 terminology memory appears in context;
- the same candidate before confirmation does not appear;
- unrelated LGS433 memory does not appear;
- malformed comparison evidence fails before a model call.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-evaluation.test.mjs tests/ai-runtime.test.mjs`

Expected: at least the specialist, memory, ontology, and malformed-evidence cases fail before Tasks 9-11 are complete.

- [ ] **Step 3: Extend the Playwright scenario**

Use the existing mocked OpenRouter boundary. In Settings, create and confirm one terminology memory, run the LGS723/LGS733 question and follow-up, and assert captured provider requests contain one selected specialist, bounded confirmed memory, trusted comparison evidence, and no raw Markdown. Create a second candidate and assert it is absent until confirmed. Do not use a real key.

- [ ] **Step 4: Extend security and documentation gates**

The audit must reject runtime inclusion of candidates, stale memory, unauthorized skill tools, prompt-pack mutation surfaces, secret-like memory, and any new HTML sink. Document the scope hierarchy, pack version, four-item/1,600-character limits, candidate approval flow, and why terminal/Git/self-modifying skills remain excluded.

- [ ] **Step 5: Run final verification**

Run:

```powershell
npm run build
npm run test:node
npm run test:e2e
node scripts/audit-ai-security.mjs
npm run audit:data
npm run check:generated
npm audit --audit-level=high
git diff --check
git diff --exit-code -- data.js data
```

Expected: every command exits 0; canonical data diff is empty; no key, candidate memory, stale memory, raw provider payload, or unauthorized tool appears in generated artifacts or diagnostics.

- [ ] **Step 6: Independent reviewer checkpoint**

Review findings-first on the exact dirty-worktree diff. Confirm no commit, merge, push, release, data mutation, backend, terminal, Git tool, autonomous skill write, or automatic memory confirmation occurred.
