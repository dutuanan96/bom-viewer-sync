# AI Debug Guide Design

## Purpose

Create one self-contained `AI_DEBUG_GUIDE.md` that lets a new AI orient itself, locate the responsible module, debug safely, verify a change, and hand the project back without first reading the other context documents.

The guide is for AI coding agents, not Viewer users. It must favor operational facts, module boundaries, commands, invariants, and symptom-driven routing over narrative project history.

## Location And Distribution

- Canonical file: `bom-viewer-sync/AI_DEBUG_GUIDE.md`.
- Mirror the same file to outer `outputs/AI_DEBUG_GUIDE.md` for portable handoff.
- Add a short pointer in `PROJECT_CONTEXT.md` and `HANDOVER.md`, but keep the new guide independently usable.
- Do not embed a fixed build ID. The guide will tell agents how to read the current ID from generated artifacts.

## Document Structure

### 1. Sixty-Second Orientation

State the canonical project root, editable source areas, generated artifacts, runtime modes, and the first commands an AI should run. Explicitly identify `src/`, `scripts/`, `tests/`, `data.js`, generated files, and outer `outputs/`.

### 2. Architecture Map

Describe each boundary and its ownership:

- `src/domain/`: BOM normalization, material records, and parent-child relationships.
- `src/features/`: cross-cutting product behavior such as notifications.
- `src/infrastructure/`: GitHub and linked-asset adapters.
- `src/ui/`: rendering and browser interaction for catalog, BOM, materials, structure, and shared UI.
- `src/application.js`: application state and orchestration.
- Entry points, shell, styles, build scripts, audit scripts, and contract tests.

The map must explain allowed dependency direction and warn against putting network or storage access into UI/domain modules.

### 3. Runtime Data Flows

Document two flows:

- Viewer: standalone HTML startup, GitHub load, normalization, rendering, and remote PDF/GLB/image access.
- Admin: remote load, local editing, current remote payload/SHA read, diff generation, notification preservation, and GitHub write.

Also distinguish code updates from data/asset updates: code requires rebuild and redistribution; remote data appears after reload.

### 4. Symptom Routing Matrix

Map common symptoms to likely owners and first checks, including:

- GitHub data not loading or stale.
- Wrong BOM rows or parent-child expansion.
- Incorrect material data or where-used results.
- Broken drawing, image, PDF, or GLB links.
- UI rendering or language errors.
- Viewer code not updating after source changes.
- Admin save conflicts or lost notifications.
- Generated artifacts or outer mirrors being stale.

### 5. Debug Runbook

Use a fixed evidence-first sequence:

1. Reproduce and record the exact symptom.
2. Identify whether the fault is data, domain, infrastructure, UI, build, or mirror state.
3. Run the nearest focused test.
4. Change only canonical source.
5. Rebuild generated artifacts.
6. Run `npm run check`.
7. Run outer compatibility wrappers when canonical `main` is integrated.
8. Smoke test Viewer/Admin when browser behavior changed.
9. Compare hashes and report evidence.

### 6. Non-Negotiable Invariants

Include at least these constraints:

- `viewer.html` remains one shareable read-only file with local program and CSS inline.
- Generated files are never manual edit targets.
- Public reads prefer cache-busted GitHub Contents API raw responses.
- Admin writes use the current remote payload and SHA.
- Remote notification history is preserved before appending a new save event.
- Tokens and machine-specific paths are never committed or embedded.
- User-facing text stays in the i18n dictionary.
- Plain BOM-row clicks do not open the removed inspector.
- Code-only work does not overwrite `data.js`.

### 7. Known Traps

Explain local unread notification state, browser automation blocking `file://`, GitHub caching, line-ending-dependent build hashes, worktree versus canonical paths, generated freshness checks, and why localhost smoke does not completely replace a manual clean-profile `file://` check before distribution.

### 8. Verification And Handoff

List canonical and outer commands, expected current baseline counts where useful, and a compact evidence report template. Dynamic values such as build IDs must be discovered rather than copied into the guide.

## Writing Rules

- Use English for file names, commands, code identifiers, and technical terminology.
- Write explanatory prose in Vietnamese so it matches the user's working language.
- Keep sections skimmable with tables and short checklists where they improve lookup speed.
- Prefer exact paths and commands over abstract advice.
- Do not duplicate project history or implementation details that do not help debugging.
- Mark generated files and destructive/external actions clearly.

## Verification

Implementation is complete when:

- `AI_DEBUG_GUIDE.md` covers every section above and contains no placeholders.
- Every referenced path and command exists in the canonical checkout.
- The guide contains no secret, token, local absolute path, or fixed build ID.
- `PROJECT_CONTEXT.md` and `HANDOVER.md` link to the guide without becoming required reading.
- The canonical guide and `outputs/AI_DEBUG_GUIDE.md` have matching SHA-256 hashes.
- Existing repository checks still pass.

## GitHub Delivery

After implementation and verification, commit the guide and synchronized context pointers to `main`, push `main` to the configured GitHub remote, and report the commit and repository state. Do not modify or publish `data.js` as part of this documentation-only change.
