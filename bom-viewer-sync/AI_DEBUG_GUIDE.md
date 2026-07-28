# JinTai PDM AI Debug Guide

Operational debugging guide for the canonical PDM/BOM Viewer repository.
Read this file before changing code. Stable architecture is documented in
`docs/ARCHITECTURE.md`; build and publication are documented in
`docs/RELEASE.md`. Current AI capabilities and extension contracts are
documented in `docs/PDM_AI_MAINTENANCE.md`.

## 1. Start Here

Canonical project:

```text
work/remote-bom-viewer-sync/bom-viewer-sync/
```

Canonical Git root:

```text
work/remote-bom-viewer-sync/
```

Run these commands before making changes:

```powershell
git fetch origin --prune
git status --short --branch --untracked-files=normal
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git diff --ignore-cr-at-eol --name-only HEAD
git log -5 --oneline --decorate
```

Stop if tracked files are dirty or `HEAD` differs from the expected remote
baseline. Do not reset, restore, overwrite, merge, or pull across unknown work.

Repository rules:

- Use PowerShell and Git for Windows only.
- Do not change `core.autocrlf`.
- Use `--ignore-cr-at-eol` when checking semantic Git diffs.
- Code, comments, and identifiers are English.
- PDM user-facing text uses zh-CN through i18n keys.
- Never commit credentials, tokens, or machine-specific paths.

## 2. Source And Artifact Boundaries

Editable source:

- `src/application.js`
- `src/domain/`
- `src/features/`
- `src/infrastructure/`
- `src/ui/`
- `src/shell.html`
- `src/styles/app.css`
- `scripts/`
- `tests/`

Generated artifacts:

- `admin.html`
- `app-admin.js`
- `viewer.html`
- `styles.css`

Never hand-edit generated artifacts. Change their source and run:

```powershell
npm run build
```

Build output is deterministic across LF/CRLF worktrees. Generated freshness
checks normalize line endings before comparison.

Canonical runtime data is the exact 24 shards:

```text
data/manifest.json
data/materials.json
data/products/*.json
```

The tracked `data.js` file is a rollback and migration snapshot. Application
runtime does not read or write it, and there is no `data.js` fallback.

Mirrors are non-canonical:

- Outer `outputs/` is a release mirror.
- Desktop HTML files are shareable copies.
- Mirror files may lag canonical `main`.
- Never copy mirror data into canonical `data/`.
- Never create `outputs/data.js` or `outputs/data/`.

## 3. Runtime Data Flow

Viewer:

```text
viewer.html
  -> resolve configured branch to an exact commit
  -> load cache-busted, commit-pinned shard URLs
  -> require the exact 24 shards
  -> assemble and normalize the payload
  -> render read-only product, BOM, material, and structure views
```

Viewer contains no write credential and performs no data mutation.

Admin load and save:

```text
admin.html + app-admin.js + styles.css
  -> load current ref, tree, and exact shard blobs
  -> assemble the payload and retain expectedHeadSha
  -> edit local application state
  -> upload referenced pending material assets
  -> re-read current remote payload and expectedHeadSha
  -> preserve remote notification history
  -> append the save notification
  -> serialize the exact 24 shards
  -> create blobs, tree, and commit
  -> update the branch ref once with force:false
```

The final diff must use the current remote payload, not the payload that was
loaded when the editing session started.

Product revision rules:

- `currentRevision` is the latest design revision.
- `effectiveRevision` is the single production-effective revision.
- Creating a Draft does not release it or move effectivity.
- Releasing requires a clean latest Draft and a reason.
- Release moves effectivity atomically.
- Released and historical revisions are read-only.

Material asset rules:

- Each `materialId` owns at most one active PDF and one active GLB/GLTF.
- Products sharing the material share those material assets.
- Product assembly models remain separate.
- Save Material changes local state only.
- Save to GitHub is a separate explicit action.
- Pending binary bytes remain in application memory until the cloud save.

## 4. Module Ownership

| Boundary | Responsibility |
|---|---|
| `src/application.js` | Application state, event binding, and orchestration |
| `src/domain/bom.js` | BOM row resolution and navigation indexes |
| `src/domain/materials.js` | Material normalization, lookup, and where-used |
| `src/domain/relationships.js` | Parent-child material relationships |
| `src/domain/revisions.js` | Revision history, snapshots, and effectivity |
| `src/features/notifications.js` | Payload diff and notification events |
| `src/features/material-asset-upload.js` | Pending file validation and resolution |
| `src/infrastructure/github-sharded-data.js` | Exact shard reads and writer delegation |
| `src/infrastructure/github-git-data.js` | Atomic Git Data write sequence |
| `src/infrastructure/github-asset-storage.js` | Create-only binary asset publication |
| `src/ui/` | Rendering and UI interaction only |
| `scripts/build.mjs` | Deterministic generated artifacts |
| `scripts/check-generated.mjs` | Generated freshness verification |
| `scripts/audit-data.mjs` | Canonical data integrity |

Domain modules must not depend on DOM or network behavior. UI modules must not
perform direct GitHub writes.

## 5. Debugging Runbook

1. Reproduce the failure with exact mode, record, action, expected result, and
   actual result.
2. Classify the failure as data, domain, infrastructure, UI, build, or mirror.
3. Write one focused failing test.
4. Run it and capture RED evidence.
5. Change the smallest owning source file.
6. Run the focused test and capture GREEN evidence.
7. Build only when build inputs changed.
8. Run the complete repository gate.
9. Run browser smoke when runtime behavior changed.
10. Compare canonical and mirror hashes only after merge and approved
    publication.

Useful focused commands:

```powershell
node --test tests\domain.test.mjs
node --test tests\application-sharded.test.mjs
node --test tests\github-sharded-data.test.mjs
node --test tests\github-git-data.test.mjs
node --test tests\material-assets.test.mjs
node --test tests\ui-contract.test.mjs
node --test tests\build.test.mjs
```

For local portable acceptance, open Viewer and Admin through the required
`file://` flow in a clean browser profile.

## 6. Required Invariants

1. Viewer is read-only and standalone.
2. Generated artifacts are never manual edit targets.
3. Runtime reads and writes exactly 24 shards.
4. `data.js` is never a runtime source.
5. Admin uses the current remote payload and `expectedHeadSha` before save.
6. The Git ref update is non-force with `force:false`.
7. Remote notification history is preserved.
8. Code-only work does not modify `data.js` or `data/`.
9. Released and historical revision snapshots are immutable.
10. Material draft editing does not mutate stored records before Save Material.
11. Selecting a file does not upload it.
12. Asset upload failure prevents the shard write.
13. A successful binary upload followed by shard failure is reused on retry.
14. Credentials and local absolute paths never enter tracked or generated files.
15. PDM UI text is supplied through i18n keys.
16. Mirrors are not repository truth.
17. AI API keys and chat history are RAM-only and cleared on disconnect or page reload. User-confirmed knowledge memory may use the governed local AI store; secret-like fields and values are rejected. The `sessionStorage` usage under `TOKEN_KEY` in `application.js` is strictly for the Admin GitHub PAT.

## 6.1 AI Assistant Debugging

The AI answer path is deterministic before it is generative:

```text
exact user query
  -> multilingual intent router
  -> strict read-only tool prefetch when intent is deterministic
  -> bounded trusted tool result and RAM-only conversation context
  -> OpenRouter model synthesis
  -> structured answer and citation validation
  -> safe operational trace in Settings
```

For revision questions, confirm that the first provider request contains the
exact query, `get_revision_history`, and the bounded revision result. For
`LGS032`, the canonical regression is latest Draft `V3.1` versus effective
Released `V3`; the assistant must not replace this answer with a list of all
products.

Useful focused commands:

```powershell
node --test tests\ai-intent-router.test.mjs tests\ai-contracts.test.mjs
node --test tests\ai-runtime.test.mjs tests\ai-conversation-session.test.mjs
node --test tests\ai-knowledge.test.mjs tests\ai-safe-trace.test.mjs
node --test tests\ai-evaluation.test.mjs
node scripts\audit-ai-security.mjs
npx playwright test tests\e2e\ai-assistant.spec.mjs
```

Settings trace is deliberately metadata-only: intent, model ID, tool name,
stable status/code, latency, evidence IDs, and numeric usage. It must never
contain the API key, authorization headers, raw prompts, raw tool payloads, or
provider error bodies. Clear Chat and Disconnect must remove retained
conversation context.

Entity-name resolution runs locally before intent routing. Exact canonical IDs,
owner-reviewed company aliases, confirmed marketplace aliases, and confirmed
personal aliases may resolve directly. Fuzzy matching is bounded to three
candidates and auto-resolves read-only questions only at score `>= 0.90` with
margin `>= 0.15`; it never authorizes `submit_proposal`. Choosing a candidate
creates a personal browser candidate, and Settings confirmation is required
before reuse. A confirmed personal mapping can be exported for owner review,
but the runtime never edits `knowledge/entity-aliases.json`.

Focused mapping checks:

```powershell
node --test tests\ai-entity-mapping.test.mjs tests\ai-entity-resolver.test.mjs
node --test tests\ai-intent-router.test.mjs tests\ai-runtime.test.mjs
node --test tests\ai-ui-contract.test.mjs tests\ai-local-store.test.mjs
```

For a live smoke test, enter a newly rotated key directly in Settings. Never
paste a real key into chat, shell commands, files, screenshots, test fixtures,
or trace output. Live OpenRouter results are supplemental evidence and do not
replace deterministic tests.

Admin mutation debugging must start from the exact operation allowlist in
`src/features/ai-assistant/contracts.js`. Follow the matching context guard,
transaction, risk, warning, and verification path in
`src/features/ai-assistant/mutation-engine.js`. The model may propose product,
revision, material, BOM, structure, and asset-reference changes, but it cannot
execute arbitrary code or invoke the final GitHub save. Add new Admin
capabilities by extending the exact schema and deterministic executor, never by
adding a generic browser or code tool.

## 7. Verification And Handoff

Canonical gates:

```powershell
npm run check
npm run audit:data
git diff --check
git diff --ignore-cr-at-eol --name-only origin/main...HEAD
git diff -- data.js data
```

When build inputs changed:

```powershell
npm run build
node --check app-admin.js
npm run check
```

Before reporting completion:

- State the branch and exact commit.
- List changed files.
- Report RED and GREEN evidence.
- Report current gate and audit results.
- Prove `data.js` and `data/` safety.
- State whether push, PR, merge, mirror sync, or Desktop publication occurred.
- Stop before external mutation unless separately approved.
