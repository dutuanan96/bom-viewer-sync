# GitHub Release Assets Design

## Goal

Move newly uploaded PDF, GLB, and GLTF binaries out of the BOM data repository and into a dedicated public GitHub repository named `dutuanan96/bom-viewer-assets`. Keep the Viewer standalone and token-free while preserving Material Draft isolation, existing asset metadata, and the explicit Save Material / Save to GitHub boundary.

## Decisions

- The asset repository is public so Viewer downloads do not require a PAT.
- The stable release tag is `assets-v1`.
- The first implementation PR adds and tests only the Release Assets infrastructure adapter. It does not change Material Master UI, application state, `data.js`, or existing upload behavior.
- A real PDF/GLB browser smoke is a go/no-go gate before UI integration. The smoke must verify redirects, CORS, PDF inline behavior, and `<model-viewer>` loading from a standalone Viewer context.
- Upload requests send raw binary bodies. Base64 encoding is not used.
- Requests use `X-GitHub-Api-Version: 2026-03-10`, matching the current official endpoint documentation.
- Existing assets are immutable. The adapter never deletes or overwrites an existing uploaded asset automatically.

## Alternatives Considered

### 1. Public GitHub Release Assets — recommended

This keeps binary files out of the Git tree and preserves the GitHub-only operating model. GitHub returns a stable `browser_download_url`, but browser behavior must be proven because data and binary publication cannot be atomic across repositories.

### 2. Continue using the Contents API and jsDelivr

This matches the existing feature branch and offers convenient PDF delivery, but every binary becomes part of Git history and the repository continues growing. It does not solve the primary storage problem.

### 3. External object storage or a download proxy

This gives better lifecycle, CORS, and transactional control, but adds infrastructure, credentials, deployment, and ongoing operations outside the approved GitHub-only scope.

## Repository Setup

The satellite repository must have an initial default-branch commit before a release tag can be created. Setup will therefore:

1. Create `dutuanan96/bom-viewer-assets` as a public repository with an initial README.
2. Create or locate the published release tagged `assets-v1`.
3. Use `make_latest: "false"` so this storage release is not presented as a product release.
4. Keep the PAT only in the existing Admin token input/local browser storage; never commit or embed it.

Repository creation and the real release smoke are explicit external-state operations. They occur only after this design is approved.

## Infrastructure Adapter

Create `src/infrastructure/github-release.js` with a focused browser-compatible API:

```text
createGithubReleaseAdapter({ config, fetchImpl })
  -> getOrCreateRelease(token)
  -> listAssets({ token, releaseId })
  -> uploadAsset({ token, releaseId, name, contentType, body })
```

The configuration contains `owner`, `repo`, `releaseTag`, and `targetCommitish`. The adapter owns GitHub URLs, headers, JSON parsing, binary upload requests, and stable HTTP error context. It does not own Material Draft state, file-type policy, or payload mutation.

The adapter follows GitHub's documented flow:

```text
GET /repos/{owner}/{repo}/releases/tags/{tag}
  -> 200: reuse release
  -> 404: POST /repos/{owner}/{repo}/releases

POST https://uploads.github.com/repos/{owner}/{repo}/releases/{id}/assets?name={name}
  Content-Type: the asset media type
  Body: raw Blob/File/ArrayBuffer
  -> 201: return id, name, content_type, size, digest, browser_download_url
```

If two clients race to create `assets-v1`, a create-time `422` triggers one release lookup retry. It never creates a second tag.

References:

- [GitHub REST release endpoints](https://docs.github.com/en/rest/releases/releases)
- [GitHub REST release asset endpoints](https://docs.github.com/en/rest/releases/assets)

## Naming And Duplicate Safety

The later application integration will generate names in this form:

```text
<material-code>_<upload-id>_<sanitized-original-name>
```

Only ASCII letters, digits, `.`, `_`, and `-` remain in the generated name. The upload ID is created once when the file enters pending state and remains stable across retry attempts. Because the upload ID is unique to that pending file, an upload-time `422` triggers one asset-list lookup: an exact uploaded-name match is returned as an idempotent retry result; no match or a `starter` match is reported as a conflict requiring review.

This lets a retry recover when the binary upload succeeded but its response was lost, without silently changing the URL or destroying an asset referenced by historical BOM/revision data.

## Later Material Draft Integration

UI/application integration is a separate PR. Its required state flow is:

```text
Select file
  -> validate extension, media signature, and size
  -> store File + upload ID in application-only pending state
  -> update materialDraft only

Save Material
  -> commit the draft locally with its pending upload reference
  -> do not upload and do not mutate remote data

Save to GitHub
  -> clone the outgoing payload
  -> upload only pending assets referenced by that clone
  -> spread the existing asset object and replace URL fields in the clone
  -> save the cloned BOM payload using the current remote baseline
  -> on success, adopt the clone and clear only completed pending uploads
```

Selecting or staging a file must never mutate the stored material record. Uploading also must not occur before Save Material. Existing asset fields such as `path`, `sourceUrl`, `driveId`, `previewUrl`, and unknown metadata remain intact unless the successful upload supplies a deliberate replacement value.

For 3D uploads, the successful saved asset uses `url = browser_download_url` and `previewUrl = url`. A single-file GLTF is supported only when its buffers and textures are embedded or use absolute URLs; GLB remains the preferred portable format.

## Failure And Consistency Model

GitHub cannot atomically update two repositories. If the binary upload succeeds and the subsequent BOM data save fails, the new Release Asset is orphaned but no BOM record references it. The application keeps pending state so the user can retry the data save without losing the draft.

The adapter must expose enough context to distinguish:

- release lookup/create failure;
- authentication or permission failure;
- duplicate filename (`422`) that cannot be recovered by an exact uploaded-name match;
- upstream upload failure (`502`), which can leave a zero-byte `starter` asset;
- malformed success responses without a `browser_download_url`.

Automatic cleanup is intentionally excluded from the first implementation. Deleting assets is unsafe while historical revision metadata may still reference them. A later audit/cleanup tool can list unreferenced assets before any manual deletion.

## Browser Compatibility Gate

Before Material Master is connected to the adapter, upload one small PDF and one small GLB to `assets-v1` and verify in a real browser:

- anonymous `browser_download_url` access;
- final redirect host and response headers;
- PDF iframe/open behavior without forced download;
- GLB loading in `<model-viewer>` without CORS errors;
- standalone Viewer behavior under both localhost and a manual clean-profile `file://` check.

If PDF inline viewing or GLB CORS fails, stop UI integration. Do not add jsDelivr conversion for Release Assets because jsDelivr repository URLs do not represent Release Asset objects. Revisit the storage/delivery approach instead.

## Test Strategy

The infrastructure PR adds `tests/github-release.test.mjs` and uses injected `fetchImpl` responses to cover:

- existing release lookup;
- create-on-404 behavior;
- create-race recovery through a second tag lookup;
- raw binary upload URL, headers, and request body identity;
- URL encoding for release tags and asset names;
- idempotent duplicate recovery and unresolved `422` errors;
- `502` starter-asset warning context;
- malformed success responses;
- no credentials in returned errors or generated artifacts.

The full gate remains:

```powershell
npm run build
npm run check
node --check app-admin.js
git diff --check
git diff -- data.js
```

No browser smoke is required for the adapter-only PR because it is not wired into runtime. The real remote smoke is required immediately after the public repository and release are created, before the UI integration PR begins.

## Out Of Scope

- Sharded BOM runtime cutover.
- Migration or modification of existing PDF/GLB URLs.
- Automatic deletion, replacement, or garbage collection of Release Assets.
- Changes to `data.js`, `outputs/`, or Desktop files.
- Merging PR #2 or PR #3.

## Success Criteria

- The public asset repository and `assets-v1` release can be created without exposing credentials.
- The adapter uploads the original binary bytes and returns validated asset metadata.
- Duplicate and upstream failure modes are explicit and do not delete historical assets.
- The adapter-only PR changes no runtime flow and leaves `data.js` untouched.
- Real PDF and GLB browser smoke passes before any Material Master integration is attempted.
