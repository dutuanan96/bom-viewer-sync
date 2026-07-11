# Modular Source and Single-File Viewer Design

## Decision

Split the current monolithic runtime into a small set of ES modules and use `esbuild` during development to produce deployable artifacts. Keep `viewer.html` as a generated, self-contained HTML file with the application JavaScript and CSS inlined. Keep PDM data and linked assets remote, as they are today.

This is a structural refactor only. The first migration must not change user-visible behavior, data shape, GitHub synchronization, notification semantics, or the intentional removal of the BOM inspector.

## Goals

- Make the source easier to navigate, review, test, and extend.
- Concentrate related behavior in deep modules with small interfaces.
- Preserve one-file Viewer distribution for users on other machines.
- Generate Admin and Viewer from the same source so their shared behavior cannot drift.
- Make stale generated artifacts detectable before commit.

## Non-Goals

- Do not migrate to React, Vue, or another UI framework.
- Do not redesign the UI or add product features.
- Do not embed `data.js`, product images, drawings, or 3D models in `viewer.html`.
- Do not make previously distributed Viewer files self-update their embedded program code.
- Do not change the GitHub repository, branch, data path, or authentication model.

## Alternatives Considered

### Keep `app-core.js` monolithic

Reordering methods and adding comments would be low risk, but it would leave data normalization, GitHub I/O, notifications, rendering, and editing coupled inside one large class. It does not meet the maintainability goal.

### Split source and bundle with `esbuild`

This is the selected approach. ES modules provide explicit dependencies during development, while `esbuild` emits a classic browser bundle that can be inlined into a local `file:///` Viewer. The build dependency is development-only and is not required by Viewer users.

### Migrate to a UI framework

A framework could impose more structure, but it would increase migration risk and change too much of the working vanilla JavaScript system. It is unnecessary for this refactor.

## Source Layout

```text
src/
  shell.html
  styles/
    app.css
  domain/
    bom.js
    materials.js
    relationships.js
  infrastructure/
    github-data.js
    assets.js
  features/
    notifications.js
  ui/
    catalog-view.js
    bom-view.js
    material-view.js
    structure-view.js
    shared-view.js
  application.js
  admin-entry.js
  viewer-entry.js
scripts/
  build.mjs
```

The exact extraction order may combine files when a proposed module would only pass calls through. The target is a small number of deep modules, not one file per function.

## Module Responsibilities and Interfaces

### Domain modules

Domain modules own pure BOM, material, and parent-child transformations. They accept plain data and return results without reading the DOM, network, storage, or global variables. Their exported interfaces cover normalization, queries, updates, and derived rows required by the application.

### GitHub data adapter

`infrastructure/github-data.js` owns repository configuration normalization, Contents API URLs, UTF-8 base64 conversion, `data.js` parsing and serialization, cloud reads, SHA-aware writes, and fallback behavior. Its interface exposes load and save operations without exposing HTTP details to the application.

The save implementation must continue to fetch the current remote payload and SHA before diffing and writing. It must not fall back to a stale locally loaded baseline.

### Asset module

`infrastructure/assets.js` owns asset-key matching, Google Drive URL handling, and display URL resolution for images, drawings, and 3D models. UI modules receive resolved asset descriptions and do not duplicate provider-specific URL logic.

### Notification module

`features/notifications.js` owns payload diff descriptions, notification normalization, append behavior, unread calculations, and localized notification presentation data. Opening the bell continues to update local read state without deleting GitHub-backed events.

### UI modules

UI modules render their respective views and translate user events into application actions. They do not fetch or persist data directly. Shared HTML escaping, localized labels, modal helpers, and common table fragments live in `shared-view.js` only when multiple views genuinely reuse them.

### Application module

`application.js` owns runtime state, navigation, orchestration, refresh scheduling, and Admin-versus-Viewer capabilities. It receives domain functions and infrastructure adapters rather than constructing hidden alternatives internally. `admin-entry.js` and `viewer-entry.js` remain minimal bootstraps.

## Build Outputs

One command, `npm run build`, must:

1. Bundle `admin-entry.js` and `viewer-entry.js` separately with `esbuild` in browser-compatible IIFE format; both bundles are generated from the same shared modules.
2. Generate `app-admin.js`, `styles.css`, and `admin.html` for Admin. `app-admin.js` is the complete Admin program bundle and replaces the old `app-core.js` plus bootstrap-script chain after migration.
3. Generate `viewer.html` from `src/shell.html` and inline the complete Viewer bundle plus application CSS.
4. Preserve external runtime URLs that are intentionally remote, including GitHub/Drive data and current CDN dependencies.
5. Stamp generated artifacts with a build version or source hash for diagnostics.
6. Omit inline source maps from distributable files.

Generated files remain committed because the GitHub repository directly serves the static application. `admin.html`, `app-admin.js`, `styles.css`, and `viewer.html` must not be edited manually. The legacy `app-core.js` and `app-viewer.js` artifacts are removed only after the migration passes the full verification set.

## Data Flow

```text
GitHub data.js / Drive assets
            |
            v
infrastructure adapters
            |
            v
     application state
            |
            v
       UI modules

source modules + CSS
            |
            v
        npm run build
          /       \
         v         v
 Admin artifacts  single-file viewer.html
```

Remote data changes remain visible when an existing Viewer is reopened or refreshed. Program, styling, or shell changes require a newly built `viewer.html`; this is acceptable because no Viewer has been distributed yet and future program releases can replace the file deliberately.

## Error Handling

- Network and persistence errors are caught at infrastructure adapter boundaries and converted to stable application errors.
- The application decides how to display localized errors and status; infrastructure modules do not manipulate the DOM.
- GitHub raw fallback behavior remains available only after the cache-busted Contents API read fails.
- Build failures must exit non-zero and must not leave partially updated generated artifacts presented as current.

## Migration Strategy

Migrate incrementally while preserving the existing generated runtime as the behavioral reference:

1. Establish the build pipeline and artifact-freshness check.
2. Extract pure domain utilities and move their tests to the module interfaces.
3. Extract GitHub data and notification behavior with focused tests.
4. Extract asset resolution.
5. Extract UI views in small vertical slices.
6. Reduce the application class to state and orchestration.
7. Remove the legacy monolithic source only after generated Admin and Viewer pass the full verification set.

Each extraction must replace the old implementation rather than layer a second implementation over it.

## Verification

- Preserve all existing material editor, restructure, and data-integrity tests.
- Add focused tests for each extracted module through its exported interface.
- Run JavaScript syntax checks on generated browser artifacts.
- Build twice and confirm deterministic output when inputs are unchanged.
- Run an artifact-freshness check that fails when committed output differs from a clean rebuild.
- Smoke-test Viewer and Admin separately, including GitHub data load, BOM behavior, Material Database, parent-child structure, notifications, drawings, and 3D models.
- Confirm `viewer.html` opens from `file:///` on a clean machine profile with network access.
- Confirm no token, source map, or local absolute path appears in generated artifacts.

## Success Criteria

- Maintainers edit focused source modules rather than the generated monolith.
- `npm run build` regenerates all code-dependent Admin and Viewer artifacts.
- The final Viewer remains a single HTML file and does not require Node.js or installed packages at runtime.
- Data and linked assets continue to load from GitHub and Drive.
- Existing behavior and data audits remain unchanged.
- A clean rebuild produces no uncommitted diff.
