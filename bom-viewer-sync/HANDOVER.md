# JinTai PDM System Handover

Read `AI_DEBUG_GUIDE.md` before project files.

## Current State

- Canonical checkout: `work/remote-bom-viewer-sync/bom-viewer-sync/`.
- Active branch: `codex/product-bom-revisions`.
- Draft PR: `#1`, mergeable into `main` at the last check.
- Product revision/effectivity implementation is complete on the branch and generated build ID is `1f21d89ccd2a`.
- Repository gate passed 71/71 tests; audit passed with 0 errors and 0 warnings.
- `outputs/` and Desktop runtime files have not been upgraded to the feature build because the PR is not merged.

## Continue This Flow

1. Run `git fetch origin --prune`, inspect `git status --short`, and inspect PR #1 before changing code.
2. Work only in the canonical checkout and edit `src/`, tests, scripts, or context documents. Never hand-edit generated files.
3. Preserve the PDM rule: latest design and effective production revision are separate concepts; exactly one valid revision is effective.
4. Do not modify or copy `data.js` for this feature. `origin/main` currently contains newer data-only commits than the feature branch.
5. Run `npm run check`, `node --check app-admin.js`, `git diff --check`, and verify `git diff -- data.js` is empty before pushing.
6. Keep PR #1 as the integration path. Do not create a second revision PR for the same implementation.

## After PR #1 Is Merged

Only after canonical `main` contains the feature:

```powershell
git fetch origin --prune
git switch main
git pull --ff-only origin main
npm run build
npm run check
```

Then run the outer compatibility/build flow from the outer project root:

```powershell
node work\build_standalone_viewer.mjs
node work\material-master-editor.test.mjs
node work\restructure.test.mjs
node work\audit_data_integrity.mjs
node --check outputs\app-admin.js
```

Verify SHA-256 equality for generated artifacts and context documents, then replace the Desktop shareable `admin.html` and `viewer.html`. Do not copy `data.js` during this code release.

## Environment Caveat

The outer project folder contains an empty `.git` directory, but it is not a valid repository. The real Git repository root is `work/remote-bom-viewer-sync/`. Do not delete or initialize the outer marker without explicit user approval.

## Suggested Skills For The Next AI

- `pdm-workflow` for revision/BOM lifecycle work.
- `systematic-debugging` when behavior or tests regress.
- `i18n-checker` when changing PDM UI text.
- `verification-before-completion` before reporting or publishing.
- `finishing-a-development-branch` after PR approval and merge readiness.
