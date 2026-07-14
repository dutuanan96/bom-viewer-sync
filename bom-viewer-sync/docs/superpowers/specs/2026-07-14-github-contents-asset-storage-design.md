# GitHub Contents Asset Storage Design

## Goal

Store newly uploaded PDF, GLB, and portable GLTF files outside the BOM data repository while keeping storage and write control GitHub-only and preserving the standalone Viewer. Upload binaries to the public satellite repository `dutuanan96/bom-viewer-assets` through the GitHub Contents API, then use jsDelivr as the stateless public delivery layer and save immutable commit-pinned URLs in BOM asset metadata.

## Approved Constraints

- The satellite repository remains public so Viewer access is anonymous and token-free.
- Every PDF, GLB, or GLTF file is limited to 20 MB (20,000,000 bytes) because jsDelivr does not serve larger GitHub files by default.
- The existing Admin PAT must have Contents write permission for both repositories. It is never embedded, committed, returned in errors, or written to logs.
- Viewer remains a single standalone HTML file.
- Material Draft does not mutate stored material data before Save Material.
- Save Material remains local; Save to GitHub remains the separate remote publication boundary.
- Existing 2D/3D metadata is preserved.
- `data.js`, `outputs/`, and Desktop release files are outside this work.

## Why GitHub Release Assets Were Rejected

The Release Assets adapter proved that raw binary upload works, but the real browser gate failed. GitHub served the PDF as an attachment with `application/octet-stream`, and GLB requests lacked `Access-Control-Allow-Origin`. That adapter remains inactive and must not be connected to Material Master.

The replacement was also tested against existing repository files through commit-pinned jsDelivr URLs. The browser received:

- PDF: `200`, `Content-Type: application/pdf`, no attachment disposition, and `Access-Control-Allow-Origin: *`.
- GLB: `200`, `Content-Type: model/gltf-binary`, no attachment disposition, and `Access-Control-Allow-Origin: *`.

A new live smoke against the satellite repository is still mandatory before any UI integration.

## Alternatives Considered

### 1. Satellite Contents API plus commit-pinned jsDelivr — selected

This keeps the BOM repository free of new binaries, keeps all durable storage and writes on GitHub, provides browser-compatible MIME/CORS behavior, and creates immutable delivery URLs. The satellite Git history will still grow, but that growth is isolated from BOM code and data history.

### 2. GitHub Pages from the satellite repository

This also stays within GitHub, but introduces deployment delay, Pages configuration, a less direct publication lifecycle, and additional cache behavior. It offers no clear benefit for the approved 20 MB files.

### 3. External object storage

Object storage provides better lifecycle and scale, but requires new infrastructure, credentials, and operations outside the approved GitHub-only scope.

## Delivery Architecture

The satellite repository uses these immutable paths:

```text
assets/pdfs/<material-code>_<content-hash>_<safe-original-name>
assets/models/<material-code>_<content-hash>_<safe-original-name>
```

`material-code` and the original name are sanitized to ASCII letters, digits, `.`, `_`, and `-`. `content-hash` is the lowercase SHA-256 digest of the original bytes. The hash makes a retry deterministic and prevents one file selection from silently resolving to different content.

The adapter creates files without a GitHub `sha` field. Therefore the Contents API request is create-only: it never overwrites an existing path. It never issues DELETE requests.

On a successful create, GitHub returns the commit SHA. The public URL is built from the full 40-character commit SHA:

```text
https://cdn.jsdelivr.net/gh/dutuanan96/bom-viewer-assets@<commit-sha>/<path>
```

Commit-pinned URLs are immutable. Branch-based jsDelivr URLs are not stored in BOM metadata.

## Infrastructure Adapter

Add `src/infrastructure/github-asset-storage.js` with a browser-compatible interface:

```text
createGithubAssetStorageAdapter({ config, fetchImpl })
  -> uploadAsset({ token, path, contentType, bytes })
  -> resolveExistingAsset({ token, path, expectedSize, contentHash })
  -> buildCdnUrl({ commitSha, path })
```

Configuration contains `owner`, `repo`, and `branch`. It is separate from the BOM data repository configuration so binary writes cannot accidentally target `bom-viewer-sync`.

The adapter owns:

- GitHub URLs and required headers;
- binary-to-Base64 encoding required by the Contents API;
- the 20 MB transport limit;
- create-only upload requests;
- response validation;
- deterministic conflict recovery;
- commit-pinned jsDelivr URL construction;
- token-safe error context.

The adapter does not own Material Draft state, UI labels, asset row rendering, file signature policy, or BOM payload mutation.

## Upload And Conflict Behavior

The create request targets:

```text
PUT /repos/dutuanan96/bom-viewer-assets/contents/<encoded-path>
```

with:

```json
{
  "message": "Upload BOM asset <path>",
  "content": "<base64>",
  "branch": "main"
}
```

The request intentionally omits `sha` so an existing path cannot be replaced.

If the create succeeds, the adapter validates the returned content path and full commit SHA before returning public metadata.

If GitHub reports an existing path, the adapter performs one exact-path lookup. It reuses the asset only when the path contains the expected full SHA-256 content hash and the stored byte size matches the current file. It then queries the commit history for that exact path and builds the CDN URL from the commit that introduced the immutable file. Any mismatch becomes an explicit conflict. Automatic overwrite, rename, or cleanup is forbidden.

## File Validation Boundary

The adapter-only PR validates transport-level constraints:

- allowed destination prefix;
- allowed media type;
- non-empty byte array;
- maximum 20,000,000 bytes;
- safe encoded path;
- full SHA-256 hash and commit SHA formats.

The later Material Master integration validates user files before staging:

- PDF extension, `application/pdf`, and `%PDF-` signature;
- GLB extension and `glTF` binary magic;
- GLTF extension, valid JSON, and only embedded `data:` or absolute HTTPS buffer/image URIs;
- maximum 20,000,000 bytes for every supported file;
- sanitized non-empty filename and material code.

## Phased Delivery

### Phase A — adapter and live proof

This is the next implementation PR. It adds the adapter, focused tests, and an explicit smoke script. It does not modify `src/application.js`, `src/ui/material-view.js`, Material Draft, runtime asset arrays, or `data.js`.

The smoke script:

1. reads `GH_TOKEN` from the environment without printing it;
2. creates a valid one-page PDF in memory;
3. reads one existing small GLB fixture;
4. uploads both to the satellite repository through the new adapter;
5. prints only public metadata and commit-pinned jsDelivr URLs.

The browser gate then verifies anonymous access, final response headers, PDF inline navigation, cross-origin PDF/GLB fetches, and GLB model loading. If any check fails, Phase B does not start.

### Phase B — Material Master integration

Phase B is a separate design/implementation PR after Phase A passes. Its required application flow is:

```text
Select file
  -> validate file and compute content hash
  -> retain File/bytes in application-only pending state
  -> update only materialDraft

Save Material
  -> commit the draft to local application data
  -> retain a deterministic internal pending reference
  -> do not upload

Save to GitHub
  -> clone the outgoing payload
  -> upload or resolve only referenced pending assets
  -> replace only targeted asset URL fields in the clone
  -> save the BOM payload with the current remote SHA
  -> on complete success, adopt the clone and clear completed pending entries
```

The implementation must not replace placeholder text by serializing and globally editing the whole state. It must traverse the known asset records and replace only matching `url` and, for 3D, `previewUrl` fields.

Existing asset objects are spread before URL updates so fields such as `path`, `sourceUrl`, `driveId`, `previewUrl`, and unknown metadata survive. A failed asset upload leaves the remote BOM unchanged. A successful asset upload followed by a failed BOM save can leave an orphan in the satellite repository; pending state retains the resolved public metadata for an in-session retry.

## Test Strategy

Phase A uses TDD and adds focused coverage for:

- binary Base64 encoding without UTF-8 corruption;
- URL/path encoding;
- create-only Contents API request shape;
- 20,000,000-byte boundary and empty input rejection before network access;
- PDF, GLB, and GLTF media types;
- commit SHA and response-path validation;
- commit-pinned jsDelivr URL generation;
- deterministic existing-path recovery;
- conflict on size/hash/path mismatch;
- no overwrite or DELETE request;
- no credentials in errors or smoke output.

The complete repository gate remains:

```powershell
npm run build
npm run check
node --check app-admin.js
git diff --check
git diff -- data.js
npm audit
```

## External State And Publication

- The existing public repository `dutuanan96/bom-viewer-assets` is reused.
- Existing `assets-v1` Release Assets are left untouched as experiment evidence.
- Smoke files are immutable and may remain as explicit test evidence; no cleanup runs automatically.
- The feature branch is created from current `origin/main`.
- The PR remains draft until browser evidence is recorded.
- No PR is merged and no runtime is published to `outputs/` or Desktop without user approval.

## Success Criteria

- The adapter can create immutable satellite-repository files through the Contents API without exposing credentials.
- Returned URLs use a validated full commit SHA and point to the satellite repository on jsDelivr.
- A retry cannot overwrite an existing binary and can safely recover an exact deterministic upload.
- Real PDF and GLB browser smoke passes with correct MIME types, no forced PDF download, and CORS support.
- Admin, Viewer, Material Draft, asset metadata, `data.js`, `outputs/`, and Desktop files remain unchanged in Phase A.
- Phase B does not begin until Phase A browser evidence passes and the user approves continuation.
