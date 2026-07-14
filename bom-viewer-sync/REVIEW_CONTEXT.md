# PDM BOM Viewer Review Context

## Review Scope

PR #1 was squash-merged into `main` on 2026-07-14 as `72debab`; Phase A PR #5 was squash-merged as `de35ea2`. Review Phase B branch `codex/material-asset-upload` against current `origin/main`. Editable code is under `src/`; `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html` are generated evidence and must correspond to build ID `21ca427a7b66`.

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

## Material Asset Contracts

- Material Master uses one draft for normal fields and asset arrays; Add/Delete must preserve unsaved field edits.
- Add/Delete/Open do not mutate the stored record before Save Material, and Back/module/material switches discard the draft.
- Existing 2D/3D metadata remains intact after save. For 3D, edited `url` wins over stale `previewUrl`, and successful save updates `previewUrl`.
- Empty, invalid and duplicate URLs are rejected through i18n errors. Open reads the current input value, not a stale rendered attribute.
- Successful local save clears the draft so later silent refresh is not permanently blocked.
- Selecting a file changes only the draft plus application-memory pending state. Save Material remains local-only and must not call the asset adapter.
- Pending asset rows may have a blank public URL only when their `pendingAssetId` resolves to in-memory bytes; manual URL entry removes the pending reference.
- Existing hidden metadata must survive pending staging and targeted URL resolution. The resolver must not use global/string replacement.

## GitHub Asset Upload Review Gate

Phase A adapter contracts remain unchanged: create-only Contents API requests without an update `sha`, no DELETE path, a 20,000,000-byte maximum, full SHA-256 identity in each path, and jsDelivr URLs pinned to a full Git commit SHA. In Phase B, only Admin may instantiate the adapter; Viewer remains read-only.

- PDF validation requires `.pdf`, `application/pdf` and `%PDF-` signature. GLB requires `.glb` and `glTF` magic. GLTF requires `.gltf`, valid JSON and portable `data:` or absolute HTTPS buffer/image URIs.
- Save to GitHub order must be asset upload, current BOM payload/SHA read, then BOM PUT.
- Asset-upload failure must prevent any BOM write and retain pending bytes.
- BOM-write failure after asset success may leave an immutable orphan, but retry must reuse `pending.resolved` and not upload again.
- Successful BOM write alone may adopt resolved URLs into local state and clear completed pending entries. No serialized output may contain `pendingAssetId` or file bytes.
- Phase B PR #6 received explicit merge approval on 2026-07-14. `data.js`, `outputs/`, and Desktop must remain unchanged until the post-merge `main` gate passes and publication is separately approved.

## Notification Contracts

- Payload diff covers product additions, material additions/deletions/field edits and BOM additions/deletions/quantity changes.
- BOM rows use `childMaterialId || materialId` and real `parentType` values (`product` or `material`).
- Numeric quantity `0` must remain `"0"` in before/after notification text.

## Verified Gates (2026-07-14)

- Repository: 89/89 tests passed.
- Canonical audit: 646 materials / 2725 BOM entries / 22 products / 1 notification / 0 errors / 0 warnings.
- Outer Material Master/revision contracts: 23/23 passed.
- Outer runtime contracts: 13/13 passed.
- Generated freshness and JavaScript syntax checks passed.
- Browser smoke verified 3D draft re-render, blank URL validation, Back discard, live Viewer counts and real GLB rendering.
- Phase B gate passed 115/115 tests. Admin browser smoke verified pending PDF display, blank draft URL, Back discard/restoration, and local-only Save Material; Viewer loaded 22 products and 646 materials. The only browser resource error was the pre-existing missing `favicon.ico`.

## Integration Risk To Watch

Canonical `main` now contains the newer data-only commits and audits at 646 materials/1 notification. Outer `outputs/data.js` intentionally remains the older clean 643-material/6-notification snapshot because runtime publication does not copy data. Never resolve this by copying mirror data over canonical/GitHub data. Browser automation also blocks `file://`; perform one manual clean-profile check before sending `viewer.html` externally.
