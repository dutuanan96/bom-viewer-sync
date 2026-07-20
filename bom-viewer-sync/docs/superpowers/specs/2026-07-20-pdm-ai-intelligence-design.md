# PDM AI Intelligence Design

Date: 2026-07-20
Status: Owner approved hybrid mapping concept; written extension awaiting owner review

## Objective

Make the standalone JinTai PDM AI Assistant reliably understand product, BOM, material, revision, comparison, and marketplace questions without adding a backend or weakening the existing security model.

The design adapts useful ideas from `D:\furniture_agent_capstone`—specialist routing, bounded sessions, strict argument schemas, structured comparison, and operational tracing—without importing Google ADK, Python, SQLite, MCP, or stale BOM data.

## Success criteria

1. The exact current user query always reaches the model and is covered by a regression test.
2. A revision-status question containing `LGS032` deterministically selects `get_revision_history`, not an empty `search_products` call.
3. Follow-up questions can use a bounded in-memory conversation history while API keys, full BOM payloads, and unapproved memory remain excluded.
4. BOM comparisons return deterministic common, unique, quantity-difference, and similarity summaries before the model explains them.
5. A local diagnostic trace shows safe operational events—model, intent, tool name, latency, result status, evidence IDs, usage, and fallback reason—without prompts, chain-of-thought, API keys, or raw provider errors.
6. Existing proposal, revision, read-only, privacy, data-integrity, and single-file distribution guarantees remain unchanged.
7. A deterministic route selects one versioned PDM specialist at runtime; specialist metadata is no longer audit-only JSON.
8. Only confirmed, non-stale, scope-relevant memory is injected, with deterministic item and character limits.
9. Ambiguous domain concepts such as metal parts are classified from explicit material evidence first, inferred names second, and unknowns remain visible.
10. Deterministic tool results pass a shape and evidence verifier before they reach the model.
11. Learning remains supervised: the model may create candidates, but only the user can confirm memory or imported knowledge.
12. Different users may call the same product, color, or material by different names; the resolver preserves personal mappings without silently changing company-wide vocabulary.
13. Ambiguous aliases produce ranked candidates and a clarification request; they never silently resolve to a mutation target.

## Options considered

### A. Upgrade the model only

This is the smallest change, but it leaves tool selection probabilistic, does not restore conversation history, and would not have prevented the lost-query defect. Rejected as the primary solution.

### B. Browser-native deterministic orchestration (selected)

Add small JavaScript modules for intent routing, bounded sessions, structured comparison, and safe tracing. Keep one model call path and the current trusted local tools. This gives the best reliability-to-complexity ratio and preserves standalone HTML distribution.

### C. Port the Google ADK multi-agent backend

This offers framework-managed sessions and sub-agents, but requires Python services, persistent deployment, new secrets, and network trust seams. It conflicts with the requirement to send one HTML file. Deferred as an optional future server edition.

## Architecture

### `conversation-session.js`

Interface:

```js
createConversationSession({ maxTurns, maxChars })
session.contextFor(query)
session.record({ userText, assistantText, toolEvents })
session.clear()
```

The module owns bounded conversation state in RAM. It keeps at most eight completed turns and enforces a total character budget. It stores no API key, raw provider response, proposal payload, full BOM, or external review text. Disconnect and Clear Chat erase the session.

### `intent-router.js`

Interface:

```js
routePdmIntent({ query, selection, availableTools })
```

It returns a frozen intent decision:

```json
{
  "intent": "revision_status",
  "entities": { "productIds": ["LGS032"] },
  "preferredTool": "get_revision_history",
  "confidence": "deterministic"
}
```

Initial deterministic intents:

- Product revision/status/history -> `get_revision_history`
- Product BOM/parts/quantity -> `get_bom`
- Two-product comparison -> `compare_boms`
- Material detail -> `get_material`
- Material usage -> `where_used`
- Marketplace/reviews/Amazon -> `get_marketplace_insights`
- Alias/full SKU -> `resolve_sku`
- Product/material discovery -> the corresponding search tool

Exact `LGS\d{3,4}` identifiers take precedence over the current UI selection. If no explicit identifier exists, the selected product may be used only for intents that clearly refer to “this/current product.” Ambiguous inputs remain model-routed and may ask a clarification question.

The router does not execute mutation tools. `submit_proposal` remains model-requested and must pass the existing proposal engine and approval gates.

### Runtime orchestration

The runtime receives `{ query, history, route }`. The current query is included as the final user message and is never read indirectly from a minimized context object.

For deterministic routes, the runtime executes the preferred read-only tool once before the first model call. The model receives the bounded tool result and must explain the user's exact question. For ambiguous routes, the existing bounded tool loop remains available.

If a model attempts an empty discovery search while an exact product identifier and a more specific compatible tool are available, the runtime rejects that call with a structured correction and permits one retry within the existing budget.

### Structured BOM comparison

`compare_boms` will compare canonical BOM rows using material identity, color, quantity, and unit. It must not use translated names as identity and must not collapse duplicate rows through a plain object map.

The result contains bounded arrays and counts:

- common materials;
- only in product A;
- only in product B;
- quantity or unit differences;
- deterministic similarity score;
- source evidence for both product shards.

### Safe operational trace

The runtime returns a bounded `trace` object alongside answer and usage. Events may include:

- `route_selected`;
- `model_requested`;
- `tool_requested`;
- `tool_completed`;
- `fallback_used`;
- `answer_validated`.

Trace values are allowlisted and redacted. User query text, hidden reasoning, provider request bodies, API keys, imported knowledge contents, and raw errors are forbidden. The Settings diagnostic section may display and export this trace locally.

## Tool contracts

All tool schemas use `additionalProperties: false`. Search queries become required and non-empty. Product IDs use the canonical `LGS` pattern. Enums and numeric bounds are declared in both exposed model schemas and local validators so provider-side acceptance cannot bypass local authorization.

Tool descriptions state when not to use the tool. In particular, discovery search must not be used for revision, BOM, or comparison questions with exact product identifiers.

## Prompt and skills

The system prompt remains compact. Domain behavior moves into a versioned skill pack with short specialist instructions for revision, BOM, comparison, material usage, proposal, and marketplace workflows. Skills describe tool order and evidence requirements; they do not contain hardcoded product inventories or mutable business data.

Only the selected skill and shared safety rules are sent for a turn. This avoids the capstone pattern of one large prompt containing every product and every workflow.

### Runtime skill registry

`knowledge/ai/prompt-pack.json` and `knowledge/ai/skills.json` remain the authored source. A browser-native registry loads them through the existing esbuild bundle, validates their schema once at feature startup, and exposes:

```js
createPdmSkillRegistry({ promptPack, skillsPack })
registry.select(route)
registry.promptFor(skill)
```

`select(route)` maps one deterministic intent to one specialist. It returns a frozen object containing the specialist ID, allowed tools, evidence requirement, concise instructions, verification rules, and pack version. Unknown, malformed, or mismatched entries fail closed. Ambiguous turns receive no specialist rather than every specialist.

The registry is guidance, not authorization. `contracts.js` and `trust-policy.js` remain the final tool authorization boundary. A skill cannot grant a tool absent from `ALLOWED_TOOLS`.

## Memory and data ownership

The current governed local memory remains authoritative. Capstone `memory_tool`, ADK in-memory storage, CSV files, and `bom_database.json` are not imported.

The bilingual dictionaries may later enter through the existing knowledge-import flow as untrusted candidates. They require validation and explicit confirmation before use. Active PDM shards remain the only BOM source of truth.

### Scoped confirmed-memory retrieval

The runtime does not ask the model to guess a memory key. Before each turn, a deterministic retriever reads `localStore.listConfirmed({ currentSourceCommit })` and ranks only confirmed, non-stale entries using exact scope first and bounded lexical overlap second:

1. exact selected or routed `productCode`;
2. exact `materialId`;
3. exact specialist intent;
4. explicit memory key mentioned in the query;
5. token overlap for user-confirmed imported knowledge.

The retriever returns at most four entries and 1,600 characters. It never returns candidate, rejected, stale, secret-like, or unrelated records. The prompt marks the block as `TRUSTED_USER_CONFIRMED_MEMORY`; it remains subordinate to canonical shard evidence and cannot authorize mutation.

### Hybrid entity resolution and mapping

`entity-resolver.js` resolves the names people actually use to canonical PDM entities without treating free-form model output as authority:

```js
createEntityResolver({ companyMappings, personalMappings, snapshot })
resolver.resolve({ query, expectedTypes, selection })
resolver.proposeMapping({ phrase, target, evidence })
```

Supported targets are deliberately narrow:

- product: canonical `productCode`;
- product variant: canonical `productCode` plus exact color;
- material: canonical `materialId` plus current material code for display and revalidation.

Resolution order is deterministic:

1. Unicode NFKC normalization, case folding for Latin text, punctuation and whitespace normalization;
2. exact canonical product code, material ID, or confirmed external SKU;
3. exact company mapping from the versioned read-only knowledge pack;
4. exact personal mapping confirmed in the current browser profile;
5. bounded lexical candidate search over canonical product names, colors, material codes, and approved aliases;
6. optional model ranking over the bounded candidates, never over the full unfiltered database.

An exact canonical identifier or collision-free confirmed mapping may resolve automatically. A fuzzy candidate may be used for a read-only answer only when its deterministic score is at least `0.90`, the gap to the second candidate is at least `0.15`, and the answer explicitly states the mapping used. Proposal or mutation targeting always requires an exact canonical identifier, a confirmed mapping, or explicit user confirmation in the current turn.

If two targets share the same normalized alias within one scope, the alias is marked conflicted and cannot auto-resolve. Scores below threshold, insufficient margin, incompatible entity types, unknown colors, and stale targets return a bounded candidate list or clarification request instead of guessing.

#### Personal mappings

The standalone HTML has no authenticated company user account. Therefore “personal” means the current browser profile and local AI store. A personal mapping records:

```json
{
  "mappingType": "entity-alias",
  "scope": "personal",
  "phrase": "con BellaH màu đen",
  "target": { "type": "product-variant", "productCode": "LGS433", "color": "..." },
  "status": "candidate|confirmed|rejected|stale",
  "confidence": 1,
  "provenance": [],
  "sourceCommit": "..."
}
```

Model inference can create only a candidate. The current user must confirm it in Settings before it becomes an exact personal alias. Clearing local AI data or changing browser profile removes personal mappings.

#### Company mappings

Company mappings live in a versioned read-only `knowledge/entity-aliases.json` pack and are bundled into the HTML. The standalone file cannot publish a company mapping by itself. A confirmed personal mapping may be exported as a promotion candidate; an owner reviews collisions, target existence, provenance, and source version before adding it to the company pack and rebuilding the artifact.

This creates a safe learning path:

```text
model inference -> personal candidate -> user confirmation -> personal mapping
                 -> promotion candidate -> owner review -> company mapping pack
```

Mappings never copy or own BOM data. They point to canonical shard entities and become stale when their target disappears or no longer matches the recorded source fingerprint.

### PDM ontology

`pdm-ontology.js` provides deterministic, versioned interpretation for domain terms. Material-family classification uses explicit material fields before names:

- confirmed metal: Q-series steel and explicit iron, steel, stainless-steel, or aluminium values;
- inferred metal: fastener or metal-hardware names with no explicit contradictory material;
- non-metal families: polymer, wood/composite, textile, packaging;
- unknown: insufficient or conflicting evidence.

The classifier returns its evidence and confidence. It never equates the BOM attribute `五金包` with the physical material family `metal`. Comparison results include counts by attribute and material family, including unknowns, so the model cannot silently omit categories.

### Grounding verifier

`grounding-verifier.js` validates deterministic tool output before the first provider call:

```js
verifyGrounding({ route, query, toolCall, toolResult })
```

It verifies the expected product/material identities, required summary fields, bounded arrays, evidence presence, and ontology coverage. It returns frozen answer requirements for the model. Missing or contradictory trusted data fails closed with a stable local error code instead of asking the model to repair the evidence.

### Supervised learning loop

The existing `store_memory` and knowledge-import paths remain the only learning-write surfaces. Every learned item starts as `candidate`, records provenance and scope, appears in Settings for review, and becomes usable only after explicit confirmation. The AI cannot edit its skill pack, source code, canonical shards, or confirmation state. Confirmed source-bound memories become stale when their source commit changes.

## Explicit non-goals

- No Hermes Python runtime, terminal, Git, cron, subagent, MCP, or background process inside the shareable HTML.
- No automatic skill creation or skill-file mutation by the model.
- No automatic confirmation of memory or imported knowledge.
- No embedding/vector database, backend service, or cross-device memory in this release.
- No hidden chain-of-thought storage or display.
- No claim that browser-local personal mappings identify a real employee without an authentication service.
- No automatic promotion from personal mapping to company mapping.

## Error handling

- Missing current query is a programming error and fails before the provider call.
- Missing exact tool arguments returns a clarification request, not a broad search.
- Provider/model failures use localized safe errors and trace only a stable error code.
- Budget exhaustion remains fail-closed.
- Unsupported models remain read-only or emulated according to the existing capability policy.
- No automatic paid fallback or marketplace web request is introduced.

## Test strategy

Implementation follows RED-GREEN TDD with these mandatory cases:

1. `buildContext` and runtime preserve a Chinese Unicode query exactly.
2. The LGS032 draft-status question routes to `get_revision_history` and returns the real current/effective revision distinction.
3. Search tools reject missing or blank queries.
4. Follow-up “why is it non-current?” resolves against bounded prior context.
5. History truncates deterministically and clears on disconnect.
6. Comparison handles duplicate material rows, quantity changes, units, colors, unknown products, and bounded output.
7. Trace excludes a seeded API key, prompts, raw tool payloads, and provider errors.
8. Existing proposal and DOM-injection E2E tests continue to pass.
9. A live OpenRouter smoke test is run only with a newly rotated key and is reported separately from deterministic gates.
10. Runtime selection injects exactly one matching specialist and rejects a skill/tool authorization mismatch.
11. Memory retrieval excludes candidate/stale/unrelated records and stays within four items and 1,600 characters.
12. Metal-part classification distinguishes explicit material evidence, name inference, non-metal, and unknown rows.
13. Grounding verification fails before the provider call for wrong-product, missing-evidence, or malformed comparison results.
14. Confirmed memory can influence a later turn; a newly created candidate cannot.
15. Exact canonical identifiers and collision-free confirmed aliases resolve deterministically across Chinese, Vietnamese, and English phrasing.
16. Conflicted, low-score, low-margin, wrong-type, unknown-color, and stale aliases ask for clarification and expose bounded candidates.
17. A model-proposed mapping remains unusable until the current user confirms it; company promotion remains an export/review/build operation.
18. Proposal targeting cannot use an unconfirmed fuzzy mapping.

## Delivery sequence

1. Fix query propagation and add the exact LGS032 regression.
2. Add deterministic intent routing and strict search contracts.
3. Add bounded conversation session integration.
4. Deepen `compare_boms` with deterministic analysis.
5. Add safe trace and diagnostic UI.
6. Add specialist skill-pack selection and evaluation cases.
7. Rebuild `viewer.html` and `admin.html`, then run the full repository gates.
8. Wire the versioned specialist packs into runtime selection.
9. Add scoped confirmed-memory retrieval and prompt injection.
10. Add ontology-backed BOM semantics and deterministic grounding verification.
11. Extend evaluation and E2E coverage for supervised learning and metal-part follow-ups.
12. Add hybrid product/variant/material resolution, personal confirmation, and company-promotion export.

Each step remains independently testable and reviewable. No data migration, backend deployment, or production release is part of this work.

## Acceptance example

For:

```text
为什么LGS032有状态是草稿呢？
```

the system must extract `LGS032`, choose `get_revision_history`, cite the current shard evidence, and explain the difference between the latest draft revision and the effective released revision. It must not list all 22 products and must not claim that “draft” means the entire product is unpublished.
