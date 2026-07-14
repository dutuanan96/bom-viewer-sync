# Atomic Sharded Writer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested GitHub Git Data API writer that publishes multiple JSON shard changes through one fast-forward commit without enabling the production sharded save flow.

**Architecture:** The writer reads the current branch ref and commit tree, creates immutable blobs for changed files, creates one tree and one commit, then advances the branch ref with `force: false`. It validates an optional expected HEAD before creating objects and translates concurrent ref movement into a stable conflict error. The application remains on the existing `data.js` save path in this PR.

**Tech Stack:** Browser-compatible JavaScript, GitHub REST Git Database endpoints, Node test runner.

## Global Constraints

- Do not modify, overwrite, or copy `data.js`.
- Do not wire this writer into `src/application.js` in this PR.
- Do not create remote data commits during tests or verification.
- Preserve current revision/effectivity and Material Draft boundaries by leaving runtime orchestration unchanged.
- Code, variables, comments, and errors use English; no new UI text.
- Do not update `outputs/` or Desktop artifacts.

---

### Task 1: Atomic Git object writer

**Files:**
- Create: `src/infrastructure/github-git-data.js`
- Create: `tests/github-git-data.test.mjs`

**Interfaces:**
- Produces: `createGithubGitDataWriter({ config, fetchImpl })`
- Produces: `GithubDataConflictError`
- Writer method: `writeFiles({ token, files, message, expectedHeadSha })`
- `files` is an object whose values are UTF-8 strings for writes or `null` for deletions.

- [x] **Step 1: Write the failing happy-path test**

Assert the request sequence: read branch ref, read current commit, create one blob per changed file, create a tree with `base_tree`, create one commit with the original HEAD as its only parent, and update the branch ref with `{ force: false }`. Assert the returned `{ previousHeadSha, commitSha }`.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/github-git-data.test.mjs`

Expected: failure because `src/infrastructure/github-git-data.js` does not exist.

- [x] **Step 3: Implement the minimal writer**

Use `Accept: application/vnd.github+json`, `Authorization: Bearer <token>`, `Content-Type: application/json`, and API version `2022-11-28`. Create blobs with `{ content, encoding: "utf-8" }`, tree entries with mode `100644` and type `blob`, a commit whose parent is the observed HEAD, and a non-force ref update.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/github-git-data.test.mjs`

Expected: the happy-path test passes.

### Task 2: Concurrency, deletion, and validation contracts

**Files:**
- Modify: `tests/github-git-data.test.mjs`
- Modify: `src/infrastructure/github-git-data.js`

**Interfaces:**
- `GithubDataConflictError.code` is `GITHUB_DATA_CONFLICT`.
- The writer accepts deletion entries as `null` and emits a tree entry with `sha: null` without creating a blob.

- [x] **Step 1: Write failing edge-case tests**

Cover unsafe paths, empty writes, non-string content, expected-HEAD mismatch before blob creation, deletion entries, and `409`/`422` ref-update conflicts. Verify non-conflict GitHub errors preserve status and endpoint context.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/github-git-data.test.mjs`

Expected: new edge-case tests fail for missing validation and conflict mapping.

- [x] **Step 3: Implement only the required validation and error mapping**

Reject absolute paths, backslashes, empty segments, `.`/`..` segments, empty file sets, and non-string/non-null values before network mutation. Compare `expectedHeadSha` immediately after reading the ref. Map ref-update `409` and `422` responses to `GithubDataConflictError`; do not treat blob/tree/commit failures as concurrency conflicts.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/github-git-data.test.mjs`

Expected: all atomic writer tests pass.

### Task 3: Context and completion gates

**Files:**
- Modify: `AI_DEBUG_GUIDE.md`
- Modify: `HANDOVER.md`
- Modify: `PROJECT_CONTEXT.md`
- Modify: `REVIEW_CONTEXT.md`
- Modify: `README_SYNC.md`

- [x] **Step 1: Document the stacked writer boundary**

Record the Git object sequence, optimistic-concurrency behavior, orphan-object caveat, and the fact that runtime still writes `data.js` until a later cutover PR composes shard changes and preserves notification history.

- [x] **Step 2: Run complete verification**

Run:

```powershell
node --test tests/github-git-data.test.mjs
npm run migrate:data
npm run build
npm run check
node --check app-admin.js
git diff --check
git diff -- data.js
```

Expected: every command exits `0`; `git diff -- data.js` is empty.

- [ ] **Step 3: Publish a stacked draft PR**

Review the diff against `codex/github-only-sharding-foundation`, commit with a conventional commit message, push `codex/github-only-sharded-writer`, and open a draft PR whose base is `codex/github-only-sharding-foundation`. Do not merge either PR.
