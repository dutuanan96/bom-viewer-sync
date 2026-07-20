# PDM AI Hybrid Entity Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve each user's Chinese, Vietnamese, English, marketplace, and informal product/material names to canonical PDM entities while keeping learning personal by default and company promotion owner-reviewed.

**Architecture:** Add a deterministic browser-native entity resolver before intent routing. Exact canonical identifiers and confirmed aliases resolve directly; fuzzy candidates use bounded local scoring and strict confidence/margin gates. Personal mappings reuse the governed local AI store, while company mappings remain a versioned read-only knowledge pack bundled into the standalone HTML.

**Tech Stack:** ES modules, browser `localStorage` through `createLocalAiStore`, JSON knowledge packs bundled by esbuild, Node.js built-in test runner, Playwright, existing sharded PDM snapshot.

## Global Constraints

- Source of truth is `data/manifest.json`, `data/materials.json`, and `data/products/*.json`; mappings point to canonical entities and never own or mutate BOM data.
- Preserve standalone `viewer.html` and `admin.html`; add no backend, authentication service, vector database, Python, MCP, or npm dependency.
- “Personal” means the current browser profile. Do not claim identity for an employee or synchronize personal mappings across machines.
- A model-proposed mapping is always `candidate`; only explicit user confirmation makes it usable.
- Company mappings are read-only at runtime. Promotion is export, owner review, knowledge-pack edit, build, and release.
- Proposal targeting requires an exact canonical identifier, a confirmed mapping, or explicit current-turn confirmation. Fuzzy inference alone is read-only.
- API keys, prompts, raw provider payloads, and secret-like values never enter mappings, memory, audit, diagnostics, or fixtures.
- User-facing strings use zh-CN/vi i18n keys. Code, comments, identifiers, and tests use English.
- Do not stage, commit, merge, push, release, or modify canonical data from the current dirty `main`.

---

## File map

- Create `src/features/ai-assistant/entity-resolver.js`: normalization, canonical indexes, exact resolution, bounded fuzzy ranking, conflict and stale handling.
- Create `src/features/ai-assistant/entity-mapping.js`: mapping schema validation, candidate construction, personal confirmed-record adapter, and company-promotion export.
- Create `knowledge/entity-aliases.json`: versioned company mapping pack; initially empty except schema metadata.
- Modify `src/features/ai-assistant/local-store.js`: preserve typed mapping candidate fields and provide governed mapping selectors without weakening memory validation.
- Modify `src/features/ai-assistant/intent-router.js`: accept resolved canonical entities before regex-only extraction.
- Modify `src/features/ai-assistant/index.js`: create resolver per snapshot, resolve before routing, pass disclosed resolution into runtime, and expose mapping UI callbacks.
- Modify `src/features/ai-assistant/runtime.js`: include bounded mapping disclosure and require clarification for unresolved candidates.
- Modify `src/features/ai-assistant/workspace-view.js`: render mapping candidates and personal/company promotion controls with safe DOM APIs.
- Modify `src/application.js`: zh-CN/vi mapping labels and personal candidate creation callback.
- Modify AI tests, evaluation, security audit, and Playwright scenarios.

### Task 1: Define governed entity mappings and a versioned company pack

**Files:**
- Create: `src/features/ai-assistant/entity-mapping.js`
- Create: `knowledge/entity-aliases.json`
- Create: `tests/ai-entity-mapping.test.mjs`
- Modify: `src/features/ai-assistant/local-store.js`
- Modify: `tests/ai-local-store.test.mjs`
- Modify: `scripts/audit-ai-security.mjs`

**Interfaces:**
- Consumes: `validateEntityMapping(input)`, `createMappingCandidate(input)`, `personalMappingsFromStore(localStore, options)`, and `exportCompanyPromotion(record)`.
- Produces: frozen normalized mapping records whose targets are product, product variant, or material only.

- [ ] **Step 1: Write the failing schema tests**

```js
const mapping = validateEntityMapping({
  schemaVersion: 1,
  id: 'mapping_personal_bellah_black',
  mappingType: 'entity-alias',
  scope: 'personal',
  phrase: 'con BellaH màu đen',
  normalizedPhrase: 'con bellah màu đen',
  target: { type: 'product-variant', productCode: 'LGS433', color: '黑色' },
  status: 'confirmed',
  confidence: 1,
  provenance: [{ sourceType: 'user-confirmed', sourceRef: 'settings', capturedAt: NOW }],
  sourceCommit: SOURCE_SHA,
});
assert.equal(mapping.target.productCode, 'LGS433');
assert.throws(() => validateEntityMapping({ ...mapping, target: { type: 'product', productCode: '433' } }), /productCode/i);
assert.throws(() => validateEntityMapping({ ...mapping, scope: 'company', status: 'candidate' }), /company.*confirmed/i);
```

Also reject blank phrases, extra target fields, unsupported target types, confidence outside `0..1`, invalid SHA, missing provenance, secret-like content, and model-proposed records marked confirmed.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-entity-mapping.test.mjs`

Expected: module-not-found failure.

- [ ] **Step 3: Implement the mapping deep module**

```js
export const ENTITY_TYPES = Object.freeze({
  PRODUCT: 'product',
  PRODUCT_VARIANT: 'product-variant',
  MATERIAL: 'material',
});

export function normalizeAlias(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('und')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateEntityMapping(input) {
  // Return a deeply frozen validated clone. Enforce exact allowed fields,
  // target-specific fields, provenance, confidence, status, and secret scan.
}
```

`createMappingCandidate` always overwrites `scope` to `personal`, `status` to `candidate`, and provenance source to `model-proposed` or `user-proposed`. It never accepts a caller-supplied confirmed state.

- [ ] **Step 4: Add the company-pack shell and local-store adapter**

Create:

```json
{
  "schemaVersion": 1,
  "packVersion": "1.0.0",
  "updatedAt": "2026-07-20T00:00:00Z",
  "description": "Owner-reviewed company entity aliases. Canonical shards remain authoritative.",
  "mappings": []
}
```

Extend local candidate records with an optional validated `entityMapping` field. Keep legacy memory migration unchanged. `personalMappingsFromStore` calls `listConfirmed`, validates each typed record, revalidates its source commit, and returns no ordinary prose memories.

- [ ] **Step 5: Implement safe promotion export**

`exportCompanyPromotion(record)` accepts one confirmed personal mapping, removes browser-local IDs and audit fields, sets `scope: 'company'`, preserves provenance, adds `promotedFrom: 'personal'`, and returns JSON text for owner review. It does not modify `knowledge/entity-aliases.json`.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
node --test tests/ai-entity-mapping.test.mjs tests/ai-local-store.test.mjs
node scripts/audit-ai-security.mjs
```

Expected: all mapping lifecycle tests pass; the audit rejects secrets and automatic company writes.

### Task 2: Resolve exact aliases and rank bounded canonical candidates

**Files:**
- Create: `src/features/ai-assistant/entity-resolver.js`
- Create: `tests/ai-entity-resolver.test.mjs`
- Modify: `src/features/ai-assistant/pdm-knowledge.js`
- Modify: `tests/ai-knowledge.test.mjs`

**Interfaces:**
- Consumes: `createEntityResolver({ companyMappings, personalMappings, snapshot, marketplaceAliases })` and `resolver.resolve({ query, expectedTypes, selection })`.
- Produces: frozen `{ status, phrase, target, confidence, margin, source, candidates, requiresConfirmation, disclosure }`.

- [ ] **Step 1: Write failing exact-resolution tests**

Cover canonical `LGS433`, lowercase `lgs433`, exact material ID, exact material code, confirmed marketplace SKU `ULGS433BH02S`, company alias, personal alias, NFKC full-width text, punctuation differences, and Chinese/Vietnamese case-preserving normalization.

```js
const result = resolver.resolve({ query: 'con BellaH màu đen', expectedTypes: ['product-variant'] });
assert.equal(result.status, 'resolved');
assert.equal(result.target.productCode, 'LGS433');
assert.equal(result.source, 'personal-confirmed');
assert.equal(result.requiresConfirmation, false);
```

- [ ] **Step 2: Write failing ambiguity and ranking tests**

Use fixtures with two similar eight-drawer products. Assert auto-resolution requires score `>= 0.90` and margin `>= 0.15`; otherwise return at most three candidates. Assert duplicate normalized aliases in the same scope return `conflicted`, wrong expected entity type returns `unresolved`, and an unknown color cannot become a product variant.

- [ ] **Step 3: Verify RED**

Run: `node --test tests/ai-entity-resolver.test.mjs`

Expected: module-not-found failure.

- [ ] **Step 4: Build canonical indexes from the snapshot**

Index `snapshot.payload.bom` by product code, `name_zh`, `name_vi`, and exact colors. Index `snapshot.payload.materialDb.materials` by material ID, `mat_code`, `name_zh`, and `name_vi`. Store only bounded normalized labels and canonical target references; never copy BOM rows into a mapping.

- [ ] **Step 5: Implement deterministic ranking**

Use token overlap, exact substring, canonical-code prefix, color agreement, and current-selection bonus. Cap the searchable phrase at 500 characters, candidates at three, and indexed labels per entity at eight. Sort by descending score then canonical target ID. Do not call the model inside the resolver.

- [ ] **Step 6: Validate targets and stale mappings**

Exact mappings resolve only when the referenced product/material still exists and product-variant color still exists. Missing targets return `stale`; conflicting exact aliases return `conflicted`. Fuzzy resolution is always `requiresConfirmation: true` when used for a proposal target, regardless of score.

- [ ] **Step 7: Verify GREEN**

Run:

```powershell
node --test tests/ai-entity-resolver.test.mjs tests/ai-knowledge.test.mjs
```

Expected: exact, fuzzy, conflicted, stale, multilingual, and bounded cases all pass without network or model calls.

### Task 3: Integrate entity resolution before intent routing and model calls

**Files:**
- Modify: `src/features/ai-assistant/intent-router.js`
- Modify: `src/features/ai-assistant/index.js`
- Modify: `src/features/ai-assistant/runtime.js`
- Modify: `src/application.js`
- Modify: `tests/ai-intent-router.test.mjs`
- Modify: `tests/ai-runtime.test.mjs`
- Modify: `tests/ai-feature-tools.test.mjs`

**Interfaces:**
- Consumes: `routePdmIntent({ query, history, selection, availableTools, resolvedEntities })` and `runTurn({ ..., entityResolution })`.
- Produces: deterministic routes based on canonical resolved targets plus an explicit mapping disclosure in the provider context and final answer requirements.

- [ ] **Step 1: Write the failing routed-alias tests**

```js
const route = routePdmIntent({
  query: 'BOM con BellaH màu đen có gì?',
  resolvedEntities: [{ type: 'product-variant', productCode: 'LGS433', color: '黑色' }],
  availableTools: ['get_bom'],
});
assert.equal(route.intent, 'bom_lookup');
assert.deepEqual(route.entities.productIds, ['LGS433']);
assert.deepEqual(route.entities.colors, ['黑色']);
```

Assert explicit canonical IDs in the current query override inferred aliases, and conflicted/unresolved results cannot produce a deterministic route.

- [ ] **Step 2: Write the failing runtime disclosure tests**

Capture the first provider request. Assert it contains a bounded block such as `USER_PHRASE_MAPPING: "con BellaH màu đen" -> LGS433 / 黑色`, does not contain the complete personal mapping store, and includes a requirement to disclose the mapping in the answer. Assert an unresolved candidate list returns a local clarification result with zero gateway calls.

- [ ] **Step 3: Verify RED**

Run:

```powershell
node --test tests/ai-intent-router.test.mjs tests/ai-runtime.test.mjs tests/ai-feature-tools.test.mjs
```

Expected: resolver inputs and local clarification behavior are absent.

- [ ] **Step 4: Integrate company and personal inputs**

Import `knowledge/entity-aliases.json` in `index.js` so esbuild bundles it. For each turn, obtain confirmed personal mappings for the current source commit, create the resolver from the current snapshot, resolve before routing, and pass only the selected result to router/runtime. Do not persist the raw query automatically.

- [ ] **Step 5: Fail closed for mutation intent**

Before exposing `submit_proposal`, require the target to be canonical, company-confirmed, personal-confirmed, or confirmed by the user in the current turn. A fuzzy high-score result may ground a read-only answer but must not populate proposal arguments.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
node --test tests/ai-intent-router.test.mjs tests/ai-runtime.test.mjs tests/ai-feature-tools.test.mjs tests/ai-proposal-engine.test.mjs
node scripts/audit-ai-security.mjs
```

Expected: informal names route to canonical read-only tools; unresolved aliases ask; proposals remain fail-closed.

### Task 4: Add personal confirmation, promotion export, E2E, and final gates

**Files:**
- Modify: `src/features/ai-assistant/workspace-view.js`
- Modify: `src/features/ai-assistant/index.js`
- Modify: `src/application.js`
- Modify: `tests/ai-ui-contract.test.mjs`
- Modify: `tests/ai-evaluation.test.mjs`
- Modify: `scripts/eval-ai.mjs`
- Modify: `tests/e2e/ai-assistant.spec.mjs`
- Modify: `scripts/audit-ai-security.mjs`
- Modify: `AI_DEBUG_GUIDE.md`
- Generated: `viewer.html`, `admin.html`, `app-admin.js`, `styles.css`

**Interfaces:**
- Consumes: unresolved/candidate resolver output and existing Settings memory controls.
- Produces: user-confirmed personal mappings, downloadable promotion candidates, and end-to-end evidence.

- [ ] **Step 1: Write failing UI contract tests**

Assert candidate rows render phrase, canonical target, confidence, source, Confirm, Reject, and Export promotion buttons using `createElement` and `textContent`. Assert export is disabled until confirmed. Assert no `innerHTML`, inline event handler, automatic confirmation, or automatic knowledge-pack write is introduced.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-ui-contract.test.mjs`

Expected: mapping-specific controls and labels are absent.

- [ ] **Step 3: Add localized governed controls**

Add zh-CN/vi i18n keys for mapping candidate, personal confirmed, conflicted, stale, confidence, confirm, reject, and company-promotion export. Reuse the existing memory list and transition buttons; render typed mapping details without raw JSON. Export one reviewed promotion JSON through a Blob download only after confirmation.

- [ ] **Step 4: Add deterministic evaluation cases**

Cover:

- `ULGS433BH02S` -> LGS433 exact confirmed marketplace alias;
- `con BellaH màu đen` -> confirmed personal product variant;
- `tủ 8 ngăn màu đen` -> ambiguous candidate list when two products are close;
- Chinese informal names and punctuation normalization;
- alias collision, stale target, unknown color, candidate-before-confirmation, and proposal rejection;
- confirmed personal mapping working on the next turn;
- company promotion export containing no API key, audit log, browser ID, or unrelated memory.

- [ ] **Step 5: Add the Playwright workflow**

With mocked OpenRouter only: ask using an unknown informal name, choose one candidate, confirm personal mapping in Settings, ask again, and assert the canonical product tool runs without clarification. Reload the page and verify the same browser profile retains it. Export promotion JSON and verify no company pack changes. Clear local AI data and verify the alias is forgotten. Do not use a real key.

- [ ] **Step 6: Extend security audit and documentation**

Audit company pack schema, collision handling, candidate-only model writes, proposal target gate, secret rejection, safe DOM rendering, and absence of Git/network/company-pack mutation code. Document personal browser scope, clearing/export behavior, confidence `0.90`, margin `0.15`, three-candidate bound, and owner-reviewed promotion flow.

- [ ] **Step 7: Run final gates**

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

Expected: every command exits 0; generated standalone artifacts include the company mapping pack; canonical data is unchanged; no secret, unconfirmed mapping, automatic company write, unsafe DOM sink, or fuzzy proposal target passes.

- [ ] **Step 8: Reviewer checkpoint**

Record exact HEAD, dirty/staged/untracked state, source/generated changed files, gate output, and excluded live-key testing. Do not commit, merge, push, or release until independent findings-first review and owner sign-off.
