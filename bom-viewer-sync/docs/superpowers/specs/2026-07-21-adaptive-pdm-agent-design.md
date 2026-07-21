# Adaptive Standalone PDM Agent Design

Date: 2026-07-21
Status: Owner approved; written specification awaiting final owner review

## Objective

Replace the current rigid AI answer pipeline with a maintainable, browser-native
agent that can converse naturally, use local PDM tools when needed, research the
open web when local evidence is insufficient, learn useful personal context
automatically, and edit an Admin local draft on explicit user request.

The four-file standalone distribution remains the product. No backend service is
required. OpenRouter is the only provider integration in this release.

## Design priority

The primary quality order is:

1. usable for normal work;
2. easy to diagnose and recover;
3. correct about canonical PDM data;
4. safe at irreversible boundaries;
5. extensible without adding runtime services.

Security controls must protect secrets, canonical data, and remote writes. They
must not make greetings, ordinary conversation, read-only lookup, or recoverable
local edits unusable.

## Relationship to the 2026-07-20 design

This design retains the useful deterministic assets from
`2026-07-20-pdm-ai-intelligence-design.md`: canonical entity resolution,
specialist knowledge, bounded tool results, evidence, safe trace, and local PDM
tools. It supersedes these earlier decisions:

- final answers are no longer required to be JSON;
- unsupported native tool calling no longer falls back to an emulated JSON
  action protocol;
- learning is automatic rather than confirmation-gated, while remaining
  subordinate to canonical PDM data;
- open-web research is available by default and selected by the agent when local
  evidence is insufficient;
- an explicit Admin request may apply a validated, undoable mutation to the
  local draft;
- the model participates in natural intent and tool selection instead of every
  turn being controlled by a growing deterministic intent ruleset.

## User-visible behavior

### Standalone Viewer

`viewer.html` supports:

- multilingual natural conversation;
- product, variant, SKU, material, BOM, revision, and comparison questions;
- automatic local PDM tool use;
- open-web research with source links;
- automatic browser-local personal memory;
- explicit separation of PDM facts, web facts, customer opinion, and inference;
- graceful operation when web research or memory is unavailable.

Viewer exposes no mutation tools and remains read-only.

### Standalone Admin

`admin.html` supports every Viewer capability plus validated local draft
mutation. A clear user instruction may update the current editable draft without
a second confirmation dialog. Ambiguous targets or operations require one
clarification before mutation.

The agent never invokes the remote save flow. After local edits, the existing
dirty state, diff, Undo behavior, and `提交更改` user action remain the only path
to GitHub.

## Risk-adaptive turn modes

Each turn uses the least restrictive mode that can answer correctly:

1. **Conversation**: greetings and ordinary interaction use natural text and no
   PDM tool unless the conversation develops into a domain request.
2. **Local PDM read**: canonical questions use one or more read-only tools and
   accumulate evidence before synthesis.
3. **Research**: external or missing knowledge permits open-web research after
   local PDM and local knowledge have been checked.
4. **Clarification**: unresolved product, variant, material, quantity, revision,
   or operation asks a focused question instead of guessing.
5. **Local Admin mutation**: an explicit, sufficiently resolved instruction is
   converted into validated operations and atomically applied to the local
   draft.

The mode is observable in the safe trace. It is not a security label embedded in
the answer format.

## Architecture

### `agent-controller.js`

Owns one bounded turn:

```js
runTurn({ query, history, snapshot, capabilities, availableTools, memories })
```

It builds context, lets the model answer or select tools, executes authorized
calls, records evidence, and repeats until it has a final answer or reaches a
small operational budget. The controller returns natural text, citations,
optional local mutation results, usage, and safe trace.

It does not contain provider HTTP code, DOM rendering, PDM mutation logic, or
memory persistence.

### `openrouter-gateway.js`

Remains the only OpenRouter and Authorization boundary. It owns:

- RAM-only API key handling;
- model discovery and capability metadata;
- request timeout and cancellation;
- provider privacy defaults;
- normalized provider errors;
- native tool and web-research request transport.

It does not validate PDM meaning or force final-answer JSON.

### `pdm-tool-registry.js`

Builds the tools available for the current runtime and state. Viewer receives
read-only tools. Admin receives read-only tools plus local-draft mutation tools
only when the current revision is editable.

Tool schemas keep strict argument validation and `additionalProperties: false`.
This strictness is limited to executable operations, not natural final text.

### `evidence-ledger.js`

Collects evidence produced during one turn and assigns provenance:

- `canonical-pdm`;
- `company-knowledge`;
- `personal-memory`;
- `official-web`;
- `marketplace`;
- `community-web`;
- `agent-inference`.

Canonical PDM evidence always wins conflicts about BOM, material, revision, or
workflow state. Inference is labeled and never converted into canonical fact.

### `research-tool.js`

Open-web research is enabled by default. The tool is available to the agent on
every read-only turn but is invoked only when local PDM, knowledge, and relevant
memory do not adequately answer the question.

Research is not limited to an allowlist. Ranking preference is:

1. official brand, manufacturer, standards, or supplier sources;
2. Amazon and other identified product marketplaces;
3. technical publications;
4. forums, blogs, social media, and review content.

Web content is untrusted data. It cannot authorize tools, mutate data, override
canonical PDM evidence, or write directly to memory. Sources and access dates
remain attached to learned conclusions. Conflicting sources are disclosed.

Initial searches are bounded for latency and cost. The agent may deepen research
when the question requires it. Research failure does not fail the PDM turn.

### `memory-manager.js`

Memory is automatic and browser-local. It does not prompt the user for routine
confirmation.

Memory has three layers:

- RAM-only working memory for the active conversation and task;
- persistent personal learned memory in the governed local AI store;
- canonical PDM knowledge, which is retrieved from current shards and is never
  duplicated into learned memory.

The manager stores distilled useful knowledge, not hidden chain-of-thought or
every generated sentence. Entries include type, scope, source, related canonical
IDs, confidence, creation time, last-use time, expiry, and supersession links.

It may automatically:

- learn personal aliases and terminology;
- remember response and workflow preferences;
- summarize long conversations and completed tasks;
- merge duplicates;
- supersede contradicted or stale conclusions;
- decay unused low-value entries;
- expire temporary task state.

Memory can influence retrieval and explanation but cannot override current PDM
evidence or authorize mutation. Secret-like content, credentials, raw provider
payloads, and hidden reasoning are rejected. Settings provides search, inspect,
lock, delete, clear, export, and import controls without interrupting normal
conversation.

### `mutation-engine.js`

The model proposes structured local operations; the deterministic mutation
engine validates and applies them as one transaction.

Required guarantees:

- Admin runtime only;
- explicit user request in the current turn;
- exact or sufficiently resolved canonical targets;
- editable current Draft only;
- immutable Released and historical revisions;
- all-or-nothing application;
- before/after diff;
- dirty-state integration;
- one-step Undo for the transaction;
- no remote GitHub call.

External web content and automatic memory cannot initiate mutation. If the user
asks to change a Released revision, the agent follows the existing revision
workflow instead of modifying history.

### `safe-trace.js`

Trace answers operational questions without exposing private reasoning:

```text
mode selected
local PDM checked
tool requested/completed
research triggered and why
source count
memory read/write/supersede
local transaction validated/applied/rejected
fallback layer and stable error code
```

Trace excludes API keys, Authorization headers, raw prompts, raw BOM payloads,
raw web pages, hidden chain-of-thought, and raw provider error bodies.

## Model capability behavior

OpenRouter model metadata drives capability adaptation rather than hard failure:

- **Native tools**: use the full multi-step agent loop.
- **No native tools**: perform deterministic local PDM retrieval first and ask
  the model to synthesize natural text from bounded evidence.
- **Web unsupported**: continue with local PDM and disclose that external facts
  could not be verified.
- **Weak or malformed natural output**: accept safe text for non-mutation turns;
  reject malformed executable operations.

There is no emulated JSON action protocol. Settings shows model capabilities and
limitations before use.

## Error handling and graceful degradation

- OpenRouter unavailable: return a localized local PDM result when evidence is
  sufficient; otherwise provide a short localized availability message.
- Web research unavailable: continue without external conclusions.
- Memory unavailable or corrupt: quarantine the bad entry and continue without
  memory.
- Individual read tool failure: try an independent relevant tool or explain the
  missing portion.
- Invalid mutation: change nothing and report the exact field or target that
  needs clarification.
- Budget exhaustion: return accumulated verified evidence rather than a generic
  model-incompatible error.
- Missing i18n entry: fail the localization test and never display an i18n key to
  the user.

Raw HTTP status and provider messages remain diagnostic metadata, not chat text.

## Maintainability constraints

- Do not add a backend, service worker dependency, Python runtime, database,
  MCP host, or second provider.
- Reuse existing PDM tools, proposal validation, entity resolution, knowledge,
  local store, conversation session, and trace where their contracts fit.
- Replace responsibilities in the oversized runtime incrementally; do not
  perform an unrelated rewrite.
- Keep state transitions explicit and testable.
- Keep generated HTML/JavaScript as build output only.
- Preserve exact 24-shard data ownership and all revision invariants.

## Migration strategy

1. Preserve the current production behavior behind focused regression tests.
2. Introduce the agent controller and evidence ledger beside the existing
   runtime.
3. Move natural final-answer handling to the controller and remove emulated
   tools after parity tests pass.
4. Add default-on research as an independent tool with failure isolation.
5. Upgrade governed local memory to automatic lifecycle management.
6. Add Admin local mutation transactions and Undo using the existing proposal
   and dirty-state contracts.
7. Remove obsolete routing and compatibility branches only after E2E coverage
   proves their replacements.

Each step is independently reviewable and releasable. No data migration or
mirror publication is part of implementation.

## Test strategy

Implementation follows RED-GREEN TDD.

Mandatory behavior tests:

1. Chinese, Vietnamese, and English greetings return natural localized text and
   do not call PDM tools unnecessarily.
2. Clear BOM, material, revision, and comparison questions use canonical local
   evidence before synthesis.
3. Ambiguous domain questions allow local search or one focused clarification.
4. Open-web research is available by default, is skipped when local evidence is
   sufficient, and returns linked sources when used.
5. Research failure leaves local PDM answers functional.
6. Native-tool models execute bounded multi-step loops.
7. Non-tool models receive deterministic local evidence and never enter an
   emulated action protocol.
8. Natural final text is accepted without weakening executable tool argument or
   mutation validation.
9. Automatic memory writes useful distilled entries, merges duplicates,
   supersedes contradictions, expires temporary task state, and rejects secrets.
10. Current canonical PDM evidence overrides conflicting memory or web content.
11. Viewer exposes no mutation operation.
12. Admin applies one explicit valid instruction atomically to a local Draft,
    marks dirty, displays a diff, and supports Undo.
13. Ambiguous or invalid mutation changes no local state.
14. Released and historical revisions remain immutable.
15. The agent never invokes `提交更改` or any GitHub write.
16. Trace identifies operational stages without prompts, secrets, raw payloads,
    or hidden reasoning.
17. Provider, web, memory, and individual-tool failures degrade independently.
18. UI never renders untranslated i18n keys or raw provider errors.
19. Existing deterministic PDM, mapping, proposal, security, DOM-injection,
    build, and data-integrity regressions remain green.
20. Browser E2E runs through the portable `file://` flow with mocked OpenRouter;
    a newly rotated real key is used only for a separately reported live smoke.

## Acceptance scenarios

### Natural conversation

`你好` returns a Chinese greeting with no PDM or web request and no JSON-format
error.

### Grounded PDM reasoning

`LGS723 和 LGS733 有哪些铁件共用？` reads both canonical BOMs, states the
product/color/revision scope, distinguishes material identity from names, and
explains common and differing parts with evidence.

### Automatic research

`LGS433 的 Amazon 评论主要抱怨什么？` checks the mapped product, researches
the open web, separates customer opinion from PDM fact, and links the sources.

### Automatic memory

After a user repeatedly calls the black LGS433 variant `con Bellah đen`, the
agent stores a personal alias with provenance and uses it later. If canonical
data invalidates the mapping, the entry is superseded rather than overriding
the shard.

### Admin local mutation

`Trong Draft LGS433 màu đen, đổi vít M6 từ 30 thành 32` resolves the exact BOM
row, validates editability, applies one local transaction, marks the draft dirty,
shows 30 -> 32, and offers Undo. GitHub remains unchanged until the user clicks
`提交更改`.

## Explicit non-goals

- Exact feature parity with Codex, Hermes, or a server-hosted autonomous agent.
- Direct browser automation across authenticated sites from `file://`.
- Automatic GitHub save, commit, push, merge, or release.
- Shared company memory or cross-device synchronization.
- A second provider integration.
- Replacing canonical PDM shards with learned or web data.
- Storing or displaying hidden chain-of-thought.
