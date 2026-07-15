# Phase B.4 One-Time Staging Migration Design

## Status and authorization

Phase B.3 is merged into `main` at `39c396e59ff6324afb52d5335866f16411f33ae3`. The user authorized Phase B.4 to begin as a separate plan-first change.

This design authorizes implementation and mock-based verification only. It does not authorize Antigravity IDE to create a real GitHub branch or upload shards. Real execution is a later operator checkpoint using an exact reviewed command, source SHA, aggregate hash, and staging branch name.

## Goal

Build a Node.js migration CLI that reads the authoritative `bom-viewer-sync/data.js` from an exact `main` commit, converts it into the existing 24 logical shards, creates a one-time staging branch from that commit, writes all shards through the Phase B.3 atomic writer, and reads the result back from GitHub for full verification.

## Current repository facts

- Repository: `dutuanan96/bom-viewer-sync`.
- Source branch: `main`.
- Source data path: `bom-viewer-sync/data.js`.
- Runtime shard root: `bom-viewer-sync/data`.
- Current payload produces 24 shards: one manifest, one materials shard, and 22 product shards.
- Current logical aggregate SHA-256: `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`.
- `data.js` is about 4.3 MiB, so the migration must use Git blobs rather than assuming the Contents API will return inline content.
- The B.3 writer is inactive and currently accepts only `data/...` paths. B.4 must add a validated `shardRoot` configuration so the real repository paths are `bom-viewer-sync/data/...`.

## Approaches considered

### 1. GitHub API creates the staging branch and the B.3 writer updates it

The script validates the exact source ref, reads the source tree/blob, confirms that the target branch does not exist, creates the staging ref from the source SHA, and calls `createGithubGitDataWriter()`.

Advantages:

- Exercises the actual B.3 writer.
- Binds every mutation to an exact source SHA.
- Eliminates manual branch-base mistakes.
- Supports complete route-aware tests with injected `fetchImpl`.

Cost: the orchestration layer must implement strict ref/tree/blob response validation and post-write readback.

Decision: use this approach.

### 2. Require the operator to create the staging branch first

This reduces code but introduces an unverifiable manual step. A branch can be created from the wrong commit or can be modified before the script starts. Reject this approach.

### 3. Generate files locally and push with git CLI

This is familiar but bypasses the Git Data API writer that Phase B.4 is supposed to validate. It also makes token/error behavior and atomic ref updates harder to test. Reject this approach.

## Architecture

### `src/infrastructure/github-git-data.js`

Extend the existing writer configuration with `shardRoot`, defaulting to `data` for backward compatibility. The root must be a normalized repository-relative path ending in `/data` or exactly `data`. File validation must accept only:

- `<shardRoot>/manifest.json`
- `<shardRoot>/materials.json`
- `<shardRoot>/products/<safe-product-id>.json`

No other writer behavior changes. The writer remains absent from `src/application.js` and all runtime bundles.

### `scripts/lib/sharded-files.mjs`

Own the deterministic logical shard representation used by both dry-run and staging migration:

- `buildLogicalShardFiles(payload)` returns a `Map` with paths relative to the shard root: `manifest.json`, `materials.json`, and `products/<id>.json`.
- `computeShardAggregateHash(files)` preserves the existing length-framed aggregate algorithm and current hash.
- `toRepositoryShardFiles(files, shardRoot)` converts the logical map into the plain object accepted by the B.3 writer.
- `verifyLogicalShardRoundTrip(payload, files)` parses and reassembles the logical shards, normalizes the result, and asserts deep equality.

`scripts/migrate-data-dry-run.mjs` will use this helper so the dry-run and real staging path cannot drift.

### `scripts/lib/github-sharded-staging.mjs`

Own the project-specific GitHub orchestration. It may import the B.3 writer and the logical-shard helper, but nothing under `src/application.js` may import it.

Public interface:

```js
export const STAGING_PROJECT = Object.freeze({
  owner: 'dutuanan96',
  repo: 'bom-viewer-sync',
  sourceBranch: 'main',
  dataJsPath: 'bom-viewer-sync/data.js',
  shardRoot: 'bom-viewer-sync/data',
  stagingBranchPattern: /^codex\/phase-b4-shards-\d{8}T\d{6}Z-[0-9a-f]{7}$/,
  expectedShardCount: 24,
});

parseStagingArgs(argv, env)
  -> { token, expectedSourceSha, expectedAggregateSha256, stagingBranch }

createGithubShardedStagingMigration({ fetchImpl, writerFactory })
  -> { run(input) }

sanitizeMigrationError(error)
  -> { name, code, message, status, endpoint, mutationStage, branchCreated, stagingBranch }
```

`parseStagingArgs()` returns only validated values. `createGithubShardedStagingMigration()` returns an object with `run(input)`. `sanitizeMigrationError()` returns only the listed safe fields and omits undefined fields.

### `scripts/migrate-data-staging.mjs`

A thin executable wrapper. It parses arguments, runs the orchestrator, writes one JSON success object to stdout, writes one sanitized JSON error object to stderr, and sets a non-zero exit code on failure.

### Tests

- Extend `tests/github-git-data.test.mjs` for `shardRoot` behavior.
- Add `tests/sharded-files.test.mjs` for deterministic formatting, exact current hash, repository path mapping, and round-trip equality.
- Add `tests/github-sharded-staging.test.mjs` for CLI validation, API sequencing, mutation boundaries, readback, and error handling.

## Execution contract

The real command must require all of these inputs:

```powershell
$env:GH_TOKEN = '<set locally; never paste into chat or arguments>'
npm run migrate:staging -- `
  --execute `
  --confirm STAGE_24_SHARDS `
  --expected-source-sha 39c396e59ff6324afb52d5335866f16411f33ae3 `
  --expected-aggregate-sha256 d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e `
  --staging-branch codex/phase-b4-shards-20260715T090000Z-39c396e
```

The timestamp above is an example. At execution time the operator must supply a fresh UTC timestamp while preserving the exact pattern and source short SHA suffix.

Without `--execute` and exact confirmation text, the CLI must fail before reading `GH_TOKEN` or calling `fetch`.

## API sequence

All reads before branch creation are non-mutating.

1. `GET /git/ref/heads/main`.
2. Validate exact ref name, object type `commit`, and full SHA equal to `--expected-source-sha`.
3. `GET /git/commits/<source-sha>` and validate the commit/tree response.
4. `GET /git/trees/<source-tree-sha>?recursive=1`; reject `truncated: true` and locate exactly one `bom-viewer-sync/data.js` blob.
5. `GET /git/blobs/<data-js-blob-sha>`; require base64 encoding, decode UTF-8, parse and normalize the payload.
6. Build logical shards, verify deep round-trip equality, require exactly 24 files, and require the computed aggregate hash to equal `--expected-aggregate-sha256`.
7. `GET /git/ref/heads/<encoded-staging-branch>`; only 404 is accepted. Any existing branch or other error stops before mutation.
8. `POST /git/refs` with `{ ref: 'refs/heads/<staging-branch>', sha: '<source-sha>' }`; validate exact ref and SHA. This is the first mutation.
9. Call the B.3 writer with `shardRoot: 'bom-viewer-sync/data'`, all 24 repository paths, `expectedHeadSha: <source-sha>`, and commit message `chore: stage 24 sharded BOM files`.
10. Read the staging ref, commit, and recursive tree at the returned commit SHA.
11. Require all 24 expected shard paths, no unexpected files under `bom-viewer-sync/data`, and unchanged `bom-viewer-sync/data.js` blob SHA.
12. Fetch all 24 shard blobs by SHA, decode them into logical paths, recompute the aggregate hash, reassemble the payload, normalize it, and require deep equality with the source payload.
13. Read `main` again and require it still points to the expected source SHA. This proves the controlled run did not update `main`; an unrelated concurrent main update also makes the verification fail visibly.
14. Emit the verified summary. Never delete the staging branch automatically.

## Success output

```json
{
  "status": "verified",
  "repository": "dutuanan96/bom-viewer-sync",
  "sourceBranch": "main",
  "sourceCommitSha": "<40-hex>",
  "sourceDataBlobSha": "<40-hex>",
  "stagingBranch": "codex/phase-b4-shards-<timestamp>-<short-sha>",
  "stagingCommitSha": "<40-hex>",
  "shardRoot": "bom-viewer-sync/data",
  "shardCount": 24,
  "aggregateSha256": "<64-hex>",
  "dataJsUnchanged": true,
  "roundTripEqual": true,
  "mainUnchanged": true,
  "compareUrl": "https://github.com/dutuanan96/bom-viewer-sync/compare/<source>...<staging>"
}
```

No token, source data, shard contents, or raw error cause may appear in stdout, stderr, thrown error messages, stacks returned to callers, or test snapshots.

## Failure and recovery matrix

| Failure point | Mutation allowed | Required behavior |
|---|---:|---|
| Argument/config validation | None | Exit non-zero with sanitized local validation error |
| Source ref/commit/tree/blob read | None | Exit non-zero; no target-branch request |
| Local split/hash/round-trip | None | Exit non-zero; no target-branch request |
| Target branch already exists | None | Exit non-zero; never reuse or overwrite it |
| Branch creation response malformed | Possible branch | Report `branchCreated` only when confirmed; never guess or delete |
| Writer fails before PATCH | Branch plus possible orphan Git objects | Leave branch intact, report `mutationStage`, never retry automatically |
| Writer PATCH conflicts | Branch plus orphan blobs/tree/commit | Preserve `GithubDataConflictError` classification and leave evidence intact |
| Post-write readback fails | Staging commit exists | Exit non-zero, leave branch for inspection, never call DELETE |
| `main` moves during verification | Staging commit may exist | Exit non-zero with `mainUnchanged: false`; do not roll back |

## Safety invariants

- No request may mutate `main`.
- No request may use `force: true`.
- No DELETE request exists anywhere in this phase.
- The target branch must not exist before execution.
- The target branch must match the one-time Phase B.4 naming pattern.
- The source branch must equal the operator-supplied full SHA before mutation.
- The logical aggregate hash and shard count must match operator-supplied/reviewed expectations before mutation.
- `data.js` must retain the same Git blob SHA on staging.
- All 24 remote shards must be read back from the new commit and reassembled successfully.
- `src/application.js`, Admin save behavior, Viewer behavior, `outputs/`, Desktop files, and production data remain unchanged.

## Non-goals

- No runtime loading or saving cutover.
- No dual-write behavior.
- No production `main` data migration.
- No deletion or cleanup of the staging branch.
- No mirror or Desktop publication.
- No automatic PR creation or merge.
- No actual remote execution by the implementation agent.

## Acceptance criteria

Implementation is ready for independent review when:

- All new tests prove the safety invariants with route-aware mocks.
- Existing B.3 writer tests remain green.
- `npm run migrate:dry-run` produces the same aggregate hash twice.
- `npm run check`, syntax checks, and `git diff --check` pass.
- `git diff origin/main -- data.js` is empty and no `data/` directory is created locally.
- Runtime import search finds no staging or writer module in application/generated bundles.
- Antigravity reports the exact proposed real command but does not run it.
