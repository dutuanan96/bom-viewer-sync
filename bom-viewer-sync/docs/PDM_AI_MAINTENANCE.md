# PDM AI Maintenance And Handoff

Current operational context for engineers and AI agents extending the JinTai
PDM assistant. This document describes implemented behavior, not historical
plans.

## Current capability model

The assistant is a browser-native agent with four governed layers:

```text
natural multilingual request
  -> entity resolution and intent routing
  -> deterministic PDM tools and evidence
  -> model synthesis or structured Admin proposal
  -> deterministic validation, review, verification, and local transaction
```

Viewer receives read-only PDM, drawing-analysis, research, and personal-memory
capabilities. Admin receives the same read capabilities plus structured local
proposal operations. Neither runtime gives the model arbitrary code execution
or direct GitHub publication authority.

## Read and analysis capabilities

The tool allowlist is owned by
`src/features/ai-assistant/contracts.js`. It includes:

- product, SKU, BOM, material, where-used, revision, recent-change, schema, and
  help lookup;
- product and revision comparisons;
- global and product-scoped PDM search and analysis;
- single engineering drawing analysis;
- evidence-bound engineering drawing commonality checks;
- governed personal memory;
- Admin-only structured mutation proposals.

Canonical PDM evidence overrides model inference, web information, and
browser-local memory. When evidence is insufficient, the assistant must ask a
focused clarification or return an explicitly unverified result.

## Admin proposal operations

The exact operation allowlist is:

```text
create_product
update_product
create_product_revision
release_product_revision
withdraw_product_revision
create_material
update_material
update_material_field
delete_material
add_bom_item
update_bom_item
update_bom_quantity
replace_bom_item
remove_bom_item
add_material_child
update_material_child_quantity
remove_material_child
delete_material_structure
```

Each operation has exact top-level and payload keys. Unknown operations,
additional fields, invalid IDs, unsafe URLs, stale context, dirty state,
revision violations, used-material deletion, and structure cycles fail closed.

Proposal execution is:

```text
model operations
  -> exact schema validation
  -> Admin/revision/selection context validation
  -> cloned-payload transaction
  -> before/after diff
  -> deterministic graph and domain verification
  -> categorized risk and warnings
  -> Admin selects or removes operations
  -> atomic local apply
  -> existing dirty-state and explicit GitHub save flow
```

High-risk operations include release, withdrawal, destructive BOM replacement
or removal, material deletion, and structure deletion. The model cannot approve
its own proposal.

## Model compatibility

Capability behavior is based on provider metadata, not parameter count:

- Native-tool models use the bounded agent loop.
- Models without native tools receive deterministic local evidence before
  synthesis.
- Mutation-capable turns use exact schemas described in the tool prompt.
- Malformed model operations are rejected without changing state.
- Provider failure returns trusted local facts when available.

When improving a small model, simplify its exact operation examples and
deterministic prefetch before weakening validation.

## Memory and improvement cycle

Personal memory is browser-local, governed, bounded, and subordinate to current
PDM data. Viewer corrections may be exported as untrusted improvement
candidates. Admin can import them, request a second-model review against current
PDM evidence, and approve or reject each candidate. Approved knowledge still
requires repository review before becoming shared company knowledge.

Never copy raw conversation logs, secrets, hidden reasoning, or provider
payloads into memory or knowledge packs.

## Engineering drawings

Drawing analysis converts supported Google Drive view links to direct download
links for the model. Technical conclusions require structured page, view, or
region evidence. Unreadable values stay null; missing tolerance or revision
evidence prevents a confirmed commonality decision.

Material-asset audit additionally requires byte-verifiable sources. Drive URLs
are sufficient for runtime preview but not for offline content hashing. The
canonical drawing archive is intentionally external to this repository.
Provide either:

- `PDM_2D_ROOT` containing the declared `Google Drive > ...` path; or
- a verified source override in `scripts/material-asset-mapping.json`.

Run the full asset audit only when the archive is mounted:

```powershell
$env:PDM_2D_ROOT = '<path to canonical drawing archive>'
npm run audit:material-assets
Remove-Item Env:PDM_2D_ROOT
```

`audit:material-assets` failing with `UNRESOLVED_PDF_SOURCE` when
`PDM_2D_ROOT` is absent indicates a missing external audit input, not a broken
runtime URL. Do not commit downloaded copies of the drawing archive merely to
make this optional audit pass.

## Evaluation

Deterministic regression:

```powershell
npm run test:node
npm run test:e2e
npm run audit:data
npm run audit:runtime-deps
npm run audit:ai
npm run check:generated
```

The bilingual grounded corpus lives in
`knowledge/ai/pdm-eval-corpus.json`. Run it only with an API key supplied through
the environment:

```powershell
$env:OPENROUTER_API_KEY = '<rotated key>'
$env:PDM_EVAL_MODEL = 'xiaomi/mimo-v2.5'
npm run eval:pdm-ai
Remove-Item Env:OPENROUTER_API_KEY
```

Never place a real key in chat, source, fixtures, logs, screenshots, or shell
history intended for publication.

## Required change workflow

1. Reproduce the behavior with a focused test.
2. Modify the smallest owning source boundary.
3. Keep operation schemas exact and provider-independent.
4. Run focused unit tests.
5. Run the full Node and E2E suites.
6. Run `npm run build`.
7. Run generated, data, runtime-dependency, and AI audits.
8. Inspect `git diff --check` and confirm no unintended `data/` change.
9. Publish through a reviewed branch and PR.
10. Merge only after required checks pass.

## Intentional limits

- Selecting local binary files remains a human browser action.
- Final GitHub save remains an explicit Admin action.
- Navigation, copy, export, refresh, settings, and trace controls are UI
  operations rather than canonical data mutations.
- No backend, database, service worker, second provider, or generic browser
  automation authority is required by the current design.
