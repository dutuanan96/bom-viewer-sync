# PDM AI Workflow Evaluation

This document defines the provider-independent evaluation boundary for
multi-turn JinTai PDM workflow interpretation. It evaluates semantic
understanding and deterministic state transitions. It does not grant the model
mutation authority and does not publish data to GitHub.

## Evaluation Boundary

```text
bounded prior workflow state + natural multilingual user turn
  -> model semantic JSON
  -> exact schema validation
  -> deterministic workflow reducer
  -> semantic, evidence, action, authority, and safety scoring
```

The model interprets language. The reducer owns state continuity. Canonical PDM
tools own evidence. The mutation engine remains the only production boundary
for validating an Admin proposal. Viewer remains read-only, Admin remains the
proposal reviewer, and final GitHub save remains a separate explicit action.

## Canonical Artifacts

| Artifact | Responsibility |
|---|---|
| `scripts/build-pdm-workflow-eval-corpus.mjs` | Explicit gold scenario source and deterministic corpus generation |
| `knowledge/ai/pdm-workflow-eval-corpus.json` | Generated provider-independent corpus |
| `scripts/semantic-schema-validator.mjs` | Exact semantic output contract |
| `scripts/eval-workflow-reducer.mjs` | Pure evaluation state transition |
| `scripts/eval-pdm-workflow-scorer.mjs` | Corpus validation and semantic scoring |
| `tests/fixtures/pdm-workflow-eval-dryrun.json` | Positive and adversarial scorer meta-cases |
| `scripts/eval-pdm-workflow.mjs` | Deterministic dry gate and live OpenRouter runner |

## Corpus Quality Gate

Each scenario has:

- a stable `caseId`;
- seven explicit fingerprint dimensions;
- five Vietnamese, Chinese, or mixed-language variants;
- bounded prior state;
- expected semantic delta;
- expected reducer state;
- exact evidence requests;
- exact proposal operation sequence;
- structured safety prohibitions;
- pass criteria and coverage tags.

The semantic fingerprint is:

```text
priorStateFamily
+ taskSet
+ semanticTransition
+ expectedReducerOutcome
+ requiredEvidence
+ authorityState
+ expectedSafetyOutcome
```

Changing wording alone never creates a new scenario. Equivalent wording belongs
in `userVariants`. The generated corpus gate requires 60 distinct fingerprints,
300 variants, at least 20 safety-critical scenarios, and all required behavior
tags.

## Semantic Equivalence

Exact and order-sensitive:

- intent and workflow action;
- task identity, action, and dependent task-update order;
- domain fields and identifiers;
- proposal operation order;
- rejection code;
- reducer state.

Order-insensitive:

- JSON object key order;
- independent evidence requests.

Normalization belongs before model interpretation. It may normalize Unicode,
whitespace, full-width characters, and approved language aliases. It must not
equate zero with missing, `无` with null, a material business code with an
internal `materialId`, product color with material color, or Released with
Draft.

## Deterministic Gates

```powershell
npm run build:workflow-corpus
node scripts/build-pdm-workflow-eval-corpus.mjs --check
node --test tests/ai-workflow-eval-scorer.test.mjs
npm run eval:pdm-workflow -- --dry-run
```

Dry-run is a meta-evaluation. It verifies that valid outputs pass and
intentionally malformed, unsafe, incomplete, or semantically wrong outputs
fail. It never substitutes expected output for a live-model score.

## Live MiMo Baseline

The live runner sends the strict contract, authority state, bounded prior state,
and one natural-language turn to the configured model. Every selected variant
is run three times by default. Raw prompts, provider payloads, user utterances,
hidden reasoning, and credentials are not persisted.

```powershell
$env:OPENROUTER_API_KEY = '<rotated key entered locally>'
$env:PDM_WORKFLOW_EVAL_MODEL = 'xiaomi/mimo-v2.5'
npm run eval:pdm-workflow
Remove-Item Env:OPENROUTER_API_KEY
Remove-Item Env:PDM_WORKFLOW_EVAL_MODEL
```

Optional controls:

```powershell
$env:PDM_WORKFLOW_EVAL_IDS = 'WF-001,WF-002'
$env:PDM_WORKFLOW_EVAL_REPEAT = '3'
$env:PDM_WORKFLOW_EVAL_CONCURRENCY = '2'
```

The process exits non-zero when no case is selected, safety is below 100%,
clear-turn state advancement is below 100%, or overall pass rate is below 95%.
Without a key, the runner prints `READY_FOR_LIVE_BASELINE` and makes no network
request.

## Extending Coverage

For each production failure:

1. Reduce it to the smallest prior state and semantic transition that still
   reproduces the issue.
2. Add wording to an existing scenario when the fingerprint is unchanged.
3. Add a scenario only when state, evidence, authority, action, reducer, or
   safety outcome changes.
4. Add Vietnamese, Chinese, mixed, abbreviated, and normalized variants.
5. Add an adversarial dry fixture when the failure exposes a validator or
   scorer weakness.
6. Never add a production regex or provider-specific parser patch merely to
   make one utterance pass.
