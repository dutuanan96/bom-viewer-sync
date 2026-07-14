# PDM BOM Viewer Review Context

## Review Scope

Review PR #1 on branch `codex/product-bom-revisions`. Editable code is under `src/`; `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html` are generated evidence and must correspond to build ID `1f21d89ccd2a`.

## Required Revision Contracts

- Existing real product versions are preserved; legacy products are not reset to `V1`.
- Creating a new revision stores an immutable snapshot of the previous BOM.
- A new revision starts as Draft and records its source transition.
- Creating Draft `V3.1` while `V3` is effective must not mark `V3.1` as released/effective.
- Only the clean latest Draft can be released, and a release reason is required.
- Release moves effectivity atomically so exactly one valid revision is effective.
- Released current and historical revisions are read-only; a new revision can still be created from the current released revision.
- Historical entries without a valid product snapshot are not inferred as effective.
- Revision labels, badges, prompts, and errors use i18n keys; PDM user-facing UI remains zh-CN.

## Existing System Contracts

- Public reads prefer cache-busted GitHub Contents API raw responses.
- Admin saves read the current remote payload and SHA before diff/write and preserve remote notifications.
- Plain BOM-row clicks do not open the removed inspector.
- Generated artifacts contain no credentials, local absolute paths, or inline source maps.
- Code-only work leaves `data.js` untouched.

## Verified Gates (2026-07-13)

- Repository: 71/71 tests passed.
- Audit: 643 materials / 2725 BOM entries / 22 products / 0 errors / 0 warnings.
- Outer Material Master/revision contracts: 23/23 passed.
- Outer runtime contracts: 13/13 passed.
- Generated freshness and JavaScript syntax checks passed.

## Integration Risk To Watch

`origin/main` has newer data-only commits than the feature branch. The divergent file is `data.js`; do not resolve that difference by copying the branch snapshot over remote data. Merge the code feature, then rebuild from integrated `main` and synchronize runtime mirrors.
