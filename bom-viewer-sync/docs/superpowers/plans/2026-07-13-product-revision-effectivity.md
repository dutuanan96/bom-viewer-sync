# Product Revision Effectivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the latest product revision separate from the single production-effective revision, and let an Admin release only the latest clean Draft revision without losing historical BOM snapshots.

**Architecture:** Extend the existing revision registry in `src/domain/revisions.js` with one derived `effectiveRevision` and append-only `effectivityEvents`. Keep transition validation in the domain, expose a small application command for the release prompt, and render lifecycle and effectivity as independent UI attributes. Continue persisting the normalized payload through the existing GitHub save adapter; do not write `data.js` directly.

**Tech Stack:** ES modules, browser JavaScript, Node.js built-in test runner, existing HTML/CSS build pipeline, Playwright browser smoke.

## Global Constraints

- Read `AI_DEBUG_GUIDE.md` before project source files.
- Keep code, comments, variable names, and documentation in English.
- Put every zh-CN or Vietnamese UI string behind the existing i18n dictionaries.
- Modify canonical files in `src/` and tests only; regenerate `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html` with `npm run build`.
- Do not modify `data.js` during code-only work.
- Preserve the current GitHub save behavior that fetches the live remote payload and SHA before PUT.
- Keep scope to Draft -> Released and one effective revision. Historical reactivation and Review/Approved stages remain out of scope.

---

### Task 1: Model one effective revision and release transitions

**Files:**
- Modify: `tests/domain.test.mjs`
- Modify: `src/domain/revisions.js`

- [x] Add imports for the wished-for APIs `effectiveProductRevision` and `releaseProductRevision` in `tests/domain.test.mjs`.
- [x] Add a failing legacy-normalization test proving a manual-derived `V3` is current, released, and effective.
- [x] Add a failing creation test proving creating Draft `V3.1` preserves `V3` as `effectiveRevision`, marks only `V3` effective in `productRevisionOptions`, and initializes `effectivityEvents` without deleting snapshots.
- [x] Run `node --test --test-name-pattern="effective|Draft revision preserves" tests/domain.test.mjs` and confirm RED because effectivity is not implemented.
- [x] Extend registry normalization to preserve `effectivityEvents` and infer exactly one `effectiveRevision` by these compatibility rules: explicit valid revision; released current; nearest released historical revision; source snapshot; current fallback.
- [x] Add `effective` to every result from `productRevisionOptions` and export `effectiveProductRevision`.
- [x] Update `createProductRevision` so it captures the previous effective revision before changing `currentRevision`, and carries effectivity event history forward unchanged.
- [x] Re-run the focused tests and confirm GREEN.
- [x] Add failing tests for `releaseProductRevision(payload, productCode, selectedRevision, { reason, occurredAt, eventId })`: successful Draft release, missing reason, historical selection, and repeated release. Assert rejected transitions leave the registry unchanged.
- [x] Run `node --test --test-name-pattern="release" tests/domain.test.mjs` and confirm RED for the missing release API.
- [x] Implement the minimal atomic release operation with stable errors `PRODUCT_NOT_FOUND`, `RELEASE_REASON_REQUIRED`, `REVISION_NOT_CURRENT`, and `REVISION_NOT_DRAFT`. On success, set current lifecycle to `released`, move `effectiveRevision`, and append one immutable release event.
- [x] Re-run `node --test tests/domain.test.mjs` and confirm GREEN.

### Task 2: Add the Admin release command and separate UI statuses

**Files:**
- Modify: `tests/ui-contract.test.mjs`
- Modify: `src/application.js`
- Modify: `src/ui/catalog-view.js`
- Modify: `src/ui/bom-view.js`
- Modify: `src/styles/app.css`

- [x] Add failing UI contract assertions that revision options include lifecycle and effectivity labels, and the header renders two separate badges.
- [x] Add failing application tests for `canReleaseProductRevision` and `releaseProductRevisionFromPrompt`: Admin + latest Draft + clean payload succeeds; Viewer, historical selection, released current, and dirty payload do not release.
- [x] Assert the release prompt requires a non-empty reason, success calls `markDirty`, and errors map stable domain codes through i18n status keys.
- [x] Run `node --test tests/ui-contract.test.mjs` and confirm RED for the absent release behavior and labels.
- [x] Import `releaseProductRevision` into `src/application.js`; add `canReleaseProductRevision()` and `releaseProductRevisionFromPrompt()` using the existing prompt, render, dirty, and status helpers.
- [x] Bind `data-action="release-product-revision"` in the existing action dispatcher.
- [x] Add zh-CN and Vietnamese i18n keys for Draft, Released, effective, non-current, release action/prompt/reason, success, dirty-blocked, and domain error mappings. Do not hardcode these strings in UI modules.
- [x] Update `revisionSelectorHtml()` so every option reads `revision · lifecycle · effectivity`.
- [x] Replace the single status badge helper with lifecycle and effectivity badges in the product header.
- [x] Show the release button only for Admin viewing the latest Draft revision, and keep historical revisions read-only.
- [x] Update catalog rows to show both latest revision and effective revision so Draft cannot be mistaken for production.
- [x] Add only the CSS classes needed for the new badges/catalog fields, matching existing styles.
- [x] Re-run `node --test tests/ui-contract.test.mjs` and confirm GREEN.

### Task 3: Preserve effectivity metadata through GitHub serialization

**Files:**
- Modify: `tests/github-data.test.mjs`
- Modify only if required by the failing test: `src/infrastructure/github-data.js`

- [x] Extend the existing save regression fixture with `effectiveRevision` and one `effectivityEvents` release record.
- [x] Assert serialized `writeInput.source`, `state.loadedPayload`, and the normalized payload preserve the effective revision and event fields.
- [x] Run `node --test tests/github-data.test.mjs`. If RED, make the smallest normalization/serialization correction in `src/infrastructure/github-data.js`; if GREEN, leave production code unchanged because the adapter already serializes the full normalized registry.
- [x] Re-run `node --test tests/github-data.test.mjs` and confirm GREEN while the live-remote SHA/notification regression still passes.

### Task 4: Regenerate artifacts and verify LGS032 end to end

**Files:**
- Generated by build: `admin.html`
- Generated by build: `app-admin.js`
- Generated by build: `styles.css`
- Generated by build: `viewer.html`
- Temporary smoke script only if needed under `work/`, removed after use.

- [x] Run `npm run build` and regenerate all derived artifacts from canonical source.
- [x] Run `npm run check` and require all tests, data audit, and generated-file checks to pass without warnings.
- [x] Run `node --check app-admin.js` and `git diff --check`.
- [x] Run an Admin browser smoke for LGS032: V3 displays the localized effective label while V3.1 is Draft; release is blocked while dirty; after a clean release with reason, V3.1 displays Released plus the effective label; V3 remains selectable, Released, non-current, and read-only.
- [x] Run a Viewer smoke confirming revision history and both statuses are visible but no release mutation is offered.
- [x] Confirm `git diff -- data.js` is empty.
- [x] Review `git diff --stat` and `git diff` to ensure every changed line supports revision effectivity and no unrelated refactor entered the patch.
- [x] Scan touched source for `TODO`, `TBD`, placeholder text, hardcoded zh-CN/Vietnamese UI text, and inconsistent error keys.

## Success Criteria

- Creating LGS032 V3.1 does not make it effective; V3 stays the only effective revision.
- Releasing clean Draft V3.1 makes it Released and the only effective revision, while V3 remains Released, viewable, and read-only.
- Invalid release attempts are atomic and do not change product revision data.
- Effectivity event history survives normalization and the existing GitHub save flow.
- All automated checks and browser smoke tests pass, generated artifacts match source, and `data.js` is unchanged.
