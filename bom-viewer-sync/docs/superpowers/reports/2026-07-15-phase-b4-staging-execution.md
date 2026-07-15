# Phase B.4 One-Time Staging Execution Report

Date: 2026-07-15
Status: Complete for staging only; runtime read/write cutover is not included

## Result

- Phase B.4 implementation was squash-merged in [PR #11](https://github.com/dutuanan96/bom-viewer-sync/pull/11) as source commit `db11b4af921d0bf4e3d3d9c65b53ed970e0ed5bc`.
- The one-time staging branch is [`codex/phase-b4-shards-20260715T041629Z-db11b4a`](https://github.com/dutuanan96/bom-viewer-sync/tree/codex/phase-b4-shards-20260715T041629Z-db11b4a).
- The staging commit is `227db464e5e9da263159733d9b90ad40c22a6aee`.
- The staging tree contains exactly 24 logical shard blobs under `data/`.
- The verified aggregate SHA-256 is `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`.
- A full read-only reconstruction matched the expected local shard payload (`roundTripEqual: true`).
- The staging commit retained the source `data.js` unchanged, and current `main` still retains the same `data.js` payload.

## Readback Incident And Recovery

The first execution successfully created the staging branch and commit, then the verifier rejected the recursive Git tree because directory entries were returned as `type: "tree"`. The operator did not retry the write and did not delete or recreate the staging branch.

The readback parser was fixed test-first to ignore directory entries while still validating every shard blob path and blob SHA. [PR #12](https://github.com/dutuanan96/bom-viewer-sync/pull/12) squash-merged that hotfix as `49f98f8209ff762c4cc13160faf0d933fc3169f7`. The existing staging branch was then verified through a read-only flow; no second remote mutation was required.

## Safety Boundaries Confirmed

- The one-time staging branch remains preserved for inspection.
- No force update, branch deletion, retry write, or production data mutation was performed.
- `main`, `data.js`, runtime save/load behavior, `outputs/`, and Desktop release files were not cut over to shards.
- `loadForWrite()` and `write()` continue to use `data.js`.
- The staging orchestrator is not wired into application runtime code.

## Verification Evidence

- Focused migration tests: 42 passed, 0 failed.
- Full repository gate: 177 passed, 0 failed.
- Data audit: 646 materials, 2725 BOM entries, 22 products, 1 notification, 0 errors, 0 warnings.
- Repeated dry-run: exactly 24 virtual shards with aggregate SHA-256 `d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e`.
- Remote branch verification: source commit `db11b4a`, staging commit `227db46`, 24 shards, exact aggregate match, exact round-trip reconstruction, and unchanged `data.js`.

## Next Boundary

Any runtime read or write cutover is a separate phase. It requires its own design, independent review, rollback plan, and explicit operator approval. This report does not authorize that cutover or publication of generated artifacts.
