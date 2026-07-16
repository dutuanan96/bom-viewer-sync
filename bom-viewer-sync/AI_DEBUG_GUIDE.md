# JinTai PDM AI Debug Guide

> Đây là file duy nhất AI mới phải đọc trước khi debug dự án. Các tài liệu context khác chỉ bổ sung lịch sử. Không sửa generated artifacts trực tiếp.

## 1. Định hướng trong 60 giây

### Vị trí và vai trò

- Canonical project root: `work/remote-bom-viewer-sync/bom-viewer-sync/`.
- Editable source-of-truth: `src/`, `scripts/`, `tests/`, `package.json` và các tài liệu trong project root.
- Current integrated branch: `main`; Phase B.5 PR #14 completed the sharded runtime cutover.
- Phase B.6 release acceptance is complete against reviewed `main` commit `d477f884ccc572e3559f78220d0abe9cdcb6cb42`. The verified UAT commit is `e843f276d1cedcfa30615b4177989a4e76170bd1`; do not rerun the one-time UAT flow for ordinary maintenance.
- Generated artifacts: `admin.html`, `app-admin.js`, `styles.css`, `viewer.html`.
- Runtime data: 24 sharded files in `data/`. The tracked `data.js` remains rollback/migration input, not an application runtime read/write target.
- Portable mirror: outer `outputs/`. Đây là nơi nhận artifact đã verify, không phải source-of-truth.
- Phase B.6 publication synchronized the four runtime artifacts plus five context documents to `outputs/`, and the four runtime artifacts to Desktop. Publication mirrors intentionally contain no `data.js` or `data/`.
- Generated build IDs are deterministic hashes of normalized shell, CSS, and bundles. Verify the current ID from generated artifacts instead of documenting a fixed value.
- `viewer.html` là Viewer read-only một file để gửi sang máy khác.
- `admin.html` dùng bundle cục bộ, đọc 24 GitHub shards và ghi chúng bằng atomic Git Data update sau hành động Save to GitHub rõ ràng.

### Ba lệnh đầu tiên

Từ canonical project root:

```powershell
git status --short
npm run check
git log -5 --oneline
```

Nếu `git status` không sạch, coi mọi thay đổi chưa rõ nguồn gốc là của người dùng. Không reset hoặc ghi đè chúng. Nếu `npm run check` đỏ, xác định lỗi có tồn tại trước thay đổi hay không trước khi sửa.

### Source hay artifact?

| Muốn thay đổi | Sửa tại | Sau đó |
|---|---|---|
| Business/domain behavior | `src/domain/` hoặc `src/features/` | Focused test → build → full check |
| GitHub/asset access | `src/infrastructure/` | Adapter test → build → full check |
| UI/render/browser behavior | `src/ui/` và khi cần `src/application.js` | UI test → build → browser smoke |
| Shell/layout/style | `src/shell.html`, `src/styles/app.css` | Build → generated check → smoke |
| Cloud BOM/material data | Admin sharded save flow; `data.js` only for explicit rollback/migration work | Audit all 24 shards; do not mix data mutation with code-only work |
| Generated output | Không sửa tay | Sửa source rồi `npm run build` |

## 2. Bản đồ kiến trúc

### Dependency direction

```text
admin-entry.js / viewer-entry.js
              ↓
       src/application.js
        ↙      ↓       ↘
   src/ui/  src/domain/  src/infrastructure/
               ↓
         src/features/ (shared product behavior)
```

UI và application có thể gọi domain/infrastructure. Domain không được phụ thuộc DOM, UI, network hoặc browser storage. UI không được tự fetch hoặc PUT GitHub; mọi external access đi qua adapter.

### Module ownership

| File/boundary | Trách nhiệm chính | Không đặt vào đây |
|---|---|---|
| `src/application.js` | Application state, event binding, orchestration, cloud load/save | Generated bundle edits, raw page styling |
| `src/domain/bom.js` | Resolve BOM rows, sidebar index, navigation counts | DOM hoặc GitHub access |
| `src/domain/materials.js` | Payload normalization, material database, localization helpers, where-used, updates | UI rendering |
| `src/domain/relationships.js` | Parent-child tree, child grouping, legacy BOM synchronization | Network/storage |
| `src/domain/revisions.js` | Product revision registry, immutable BOM snapshots, current/effective transitions | DOM, prompts hoặc GitHub access |
| `src/features/notifications.js` | Material diff, notification normalization, append event | Notification panel HTML |
| `src/features/material-asset-upload.js` | Selected-file validation and targeted pending-asset resolution in a cloned payload | DOM, GitHub transport or stored-material mutation |
| `src/infrastructure/github-sharded-data.js` | Public 24-shard load, authenticated tree/blob load, exact shard validation, writer delegation | Asset bytes or product/domain decisions |
| `src/infrastructure/github-git-data.js` | Atomic blob/tree/commit creation and non-force ref update | Payload splitting, UI state or asset upload |
| `src/infrastructure/github-data.js` | Shared config normalization, UTF-8/base64 helpers and legacy rollback parsing | Active runtime transport or product/domain decisions |
| `src/infrastructure/github-asset-storage.js` | Satellite binary encoding, create-only upload, conflict recovery, commit-pinned CDN URL | Material Draft or payload mutation |
| `src/infrastructure/assets.js` | Asset matching, Drive/PDF display URLs | BOM mutation |
| `src/ui/catalog-view.js` | Product catalog, sidebar navigation, product image/model presentation | Fetch logic |
| `src/ui/bom-view.js` | BOM header/table/filter/asset actions | GitHub writes |
| `src/ui/material-view.js` | Material Database, filters, pagination, Material Master rendering | Domain persistence rules |
| `src/ui/structure-view.js` | Parent-child list/detail and structure controls | Remote access |
| `src/ui/shared-view.js` | Shared shell, notification rendering, modal/prompt and common helpers | Product-specific domain logic |
| `src/admin-entry.js` | Start application in Admin mode | Business logic |
| `src/viewer-entry.js` | Start application in Viewer mode | Business logic |
| `src/shell.html` | Shared HTML shell | Inline application implementation |
| `src/styles/app.css` | Canonical stylesheet | Generated CSS edits |

### Build và verification ownership

| File | Vai trò |
|---|---|
| `scripts/build.mjs` | Bundle source, inject build hash, stage/commit four artifacts atomically |
| `scripts/check-generated.mjs` | Phát hiện generated artifacts stale |
| `scripts/check-all.mjs` | Repository gate: tests, audit, generated check và syntax |
| `scripts/audit-data.mjs` | Validate material/BOM/data integrity |
| `scripts/audit-material-assets.mjs` | Hash and audit material-owned PDF/GLB references; apply only with the reviewed explicit mapping |
| `tests/domain.test.mjs` | Pure domain behavior và module seams |
| `tests/github-sharded-data.test.mjs` | Public/authenticated shard loading, exact-set validation, writer delegation and token redaction |
| `tests/github-git-data.test.mjs` | Atomic ordering, expected HEAD, response validation, non-force ref update and conflict mapping |
| `tests/application-sharded.test.mjs` | Current remote payload/head usage, notification preservation and asset-before-shard-save ordering |
| `tests/github-asset-storage.test.mjs` | Binary identity, immutable Contents upload, conflict recovery and smoke PDF contract |
| `tests/material-asset-upload.test.mjs` | PDF/GLB/GLTF validation, cloned targeted resolution and retry reuse |
| `tests/assets-notifications.test.mjs` | Asset matching và notification behavior |
| `tests/material-assets.test.mjs` | Material Master draft isolation, asset metadata, URL validation và save/discard behavior |
| `tests/notifications.test.mjs` | Product/material/BOM payload diff events và quantity edge cases |
| `tests/ui-contract.test.mjs` | UI module contracts và browser-event behavior |
| `tests/runtime-contract.test.mjs` | Viewer/Admin runtime and standalone contracts |
| `tests/build.test.mjs` | Deterministic/atomic build behavior |
| `tests/baseline-contract.test.mjs` | Baseline source/data contracts |

## 3. Luồng dữ liệu runtime

### Viewer

```text
viewer.html
  → inline Viewer bundle + inline local CSS
  → create Viewer application
  → resolve the configured branch to an exact Git commit SHA
  → fetch manifest, materials and 22 product shards from commit-pinned raw URLs
  → validate the exact 24-file set, parse, assemble and normalize the payload
  → application state
  → catalog / BOM / materials / structure UI
  → remote Drive PDF, image and GLB URLs when requested
```

Viewer không chứa token và không ghi dữ liệu. Source code/style/shell thay đổi chỉ xuất hiện sau `npm run build` và sau khi phát lại `viewer.html`. BOM, material, notification và linked-asset data trên GitHub/Drive xuất hiện khi Viewer reload.

### Admin load và save

```text
admin.html + app-admin.js + styles.css
  → load the current ref, commit/tree and exact 24 shard blobs
  → assemble/normalize the remote payload and retain expectedHeadSha
  → edit local application state
  → upload referenced pending Material assets into the satellite repository
  → re-read the current remote shard payload and expected HEAD
  → diff current remote materials against local state
  → preserve remote notification history
  → append the new GitHub-save notification
  → split and serialize the exact 24 UTF-8 shards
  → create blobs/tree/commit and PATCH the branch ref once with force:false
```

Điểm quan trọng: save không được diff dựa trên stale local baseline. Remote-only notifications phải được giữ lại trước khi append event mới. Adapter và application save flow phải đọc current remote payload cùng expected HEAD ngay trước atomic non-force ref update.

### Product revision và effectivity

```text
released effective revision (V3)
  → create revision with source metadata
  → latest design becomes Draft (V3.1)
  → V3 remains the single effective revision
  → save the clean Draft
  → release with a required reason
  → V3.1 becomes released + effective; V3 remains historical released
```

`currentRevision` là latest design revision; `effectiveRevision` là revision duy nhất đang dùng trong sản xuất. Không được suy luận Draft mới là released/effective. Snapshot lịch sử hợp lệ là immutable và mọi released/historical view là read-only.

Pending Material assets are the exception to normal URL validation: Save Material may store an internal `pendingAssetId` locally while keeping the public URL blank. The selected bytes stay only in `state.pendingMaterialAssets`. Save to GitHub resolves only referenced pending records in a cloned outgoing payload, uploads binaries first, reads the current shard payload/expected HEAD second, and commits all 24 shards last. Local URLs are adopted and pending bytes are cleared only after the shard write succeeds.

### Notification và Payload Diffing

```text
admin save action
  → get current remote payload (previous) and local state (next)
  → features/notifications.js: describePayloadChanges(previous, next)
  → compare Object.keys(bom) for new products
  → compare materialDb.materials for added/deleted/modified materials
    - LOCALIZED_MATERIAL_FIELDS (name, spec, etc.): check { zh, vi } objects
    - Primitive fields (code): check strings directly
  → compare materialDb.bomEntries cho BOM additions/deletions/qty changes
    - parentType: 'product' (parent = productCode) hoặc 'material' (parent = materialCode)
    - child ID: ưu tiên `childMaterialId`, fallback về `materialId`
  → normalize thành array các thay đổi với giới hạn (ví dụ: 8 thay đổi)
  → append vào list notifications cũ và lưu lên GitHub
```

Hệ thống diffing bắt buộc phải dùng đúng `childMaterialId || materialId` khi trích xuất mã con từ `bomEntries`, và `parentType` lưu trong data là `'product'` chứ không phải `'productRevision'`. Các trường đa ngôn ngữ và nguyên thuỷ (primitive) phải được tách biệt khi so sánh để tránh lỗi ép kiểu (cast error) sang object.

### Material Master và tài sản 2D/3D

Mỗi `materialDb.materials[materialId]` sở hữu tối đa một PDF 2D và một GLB/GLTF
3D. Mọi LGS dùng chung `materialId` phải dùng chung hai asset này; không fallback
về PDF/GLB theo product. Các model lắp ráp toàn sản phẩm vẫn nằm riêng trong
top-level `models3d`.

Khi kiểm tra hoặc chọn canonical asset, bắt đầu từ `materialId` và toàn bộ
`materialDb.bomEntries` đang dùng material đó. Tên folder/file LGS chỉ là bằng
chứng phụ, không phải identity. Audit offline:

```powershell
npm run audit:material-assets -- --pdf-root "D:\1.金汰产品\2D图纸_按LGS分组"
```

Không xóa file vật lý khỏi Drive, thư mục PDF local hoặc Git chỉ vì reference đã
được canonicalize. Chỉ xóa vật lý sau một cleanup audit riêng và viewer
verification.

```text
open Material Master
  → clone toàn bộ material record vào state.materialDraft
  → render text fields + drawings + models3d từ cùng draft
  → Add/Delete/Open chỉ đọc hoặc thay đổi draft
  → Save Material validate toàn bộ URL
  → preserve metadata cũ bằng { ...originalAsset, name, url }
  → models3d: cập nhật previewUrl = url khi save thành công
  → commit draft vào local payload và clear materialDraft
  → người dùng chủ động bấm Save to GitHub ở bước riêng
```

Với 3D, ô editor phải ưu tiên `asset.url` trước `asset.previewUrl`; nếu không URL vừa gõ sẽ bị URL cũ ghi đè sau Add/Delete và re-render. URL trống là lỗi vì giao diện ghi rõ bắt buộc. Back, đổi material hoặc đổi module phải discard draft; silent cloud refresh phải bị chặn khi draft đang active. Asset cũ phải giữ mọi metadata không hiển thị như `path`, `sourceUrl`, `driveId`, `previewUrl` và các field lạ khác.

### Code update khác data update

| Loại thay đổi | Cần build Viewer mới? | Người nhận Viewer cần làm gì? |
|---|---:|---|
| `src/`, shell hoặc CSS | Có | Nhận lại `viewer.html` mới |
| BOM/material/notification trong GitHub data | Không | Reload Viewer |
| PDF/image/GLB URL hoặc remote asset | Không, nếu schema không đổi | Reload hoặc mở lại asset |
| Build script/bundle strategy | Có | Chạy full build/check và phát lại Viewer |

## 4. Ma trận triệu chứng

| Symptom | First owner | First evidence/check |
|---|---|---|
| Viewer có 0 sản phẩm/0 vật liệu | `src/infrastructure/github-sharded-data.js` | Commit resolution, 24 shard responses, console; `tests/github-sharded-data.test.mjs` |
| Dữ liệu stale sau reload | Sharded adapter/cache | Kiểm tra resolved commit SHA và commit-pinned shard URLs |
| Sai BOM row, số lượng hoặc màu | `src/domain/bom.js`, `src/domain/materials.js` | `resolveBomRows()` focused test với SKU/color cụ thể |
| Sai cây hoặc thiếu child | `src/domain/relationships.js` | `buildBomTreeRows()`/`groupMaterialChildRows()` test; kiểm tra entry scope |
| Sai where-used/material shared edit | `src/domain/materials.js` | `materialWhereUsed()` và shared MaterialID test |
| Version cũ biến mất hoặc bị đổi thành V1 | `src/domain/revisions.js` | Revision registry migration và immutable snapshot tests |
| Draft mới tự thành released/effective | `src/domain/revisions.js`, release orchestration | So sánh `currentRevision` với `effectiveRevision`; transition tests |
| Có nhiều revision cùng effective | `src/domain/revisions.js` | Atomic release test và normalized revision registry |
| PDF/Drive không mở | `src/infrastructure/assets.js` | Asset record, Drive ID, preview URL, browser console |
| GLB không mở | Asset index/UI modal | URL tồn tại, model record, external request và console |
| URL 3D vừa sửa quay lại URL cũ sau Add/Delete | `src/ui/material-view.js`, Material draft sync | `asset.url` phải đứng trước `asset.previewUrl`; chạy `tests/material-assets.test.mjs` |
| Save chấp nhận asset URL trống | `src/application.js` asset validation | Blank row phải báo i18n validation error và không mutate database |
| Silent refresh bị chặn mãi sau Save Material | Material draft lifecycle | Save thành công phải clear `state.materialDraft` |
| Ảnh sản phẩm sai | `src/ui/catalog-view.js`, product image index | Product/color selection và resolved URL |
| UI text sai ngôn ngữ | `TEXT` trong `src/application.js`, caller trong `src/ui/` | Tìm hardcoded UI string; `tests/ui-contract.test.mjs` |
| Click UI gây `ReferenceError` | Event binding trong `src/application.js` | Stack trace; contract test cho action tương ứng |
| Notification panel lỗi | `src/features/notifications.js`, `src/ui/shared-view.js` | Notification shape, normalization test, console |
| Save làm mất notification cũ | Admin save orchestration | Remote-only notification regression trong `tests/application-sharded.test.mjs` |
| Admin save 409/422 conflict | Sharded adapter/Git Data writer | `expectedHeadSha` có khớp current ref và ref update có giữ `force:false` không |
| Source đã sửa nhưng Viewer không đổi | Build/mirror state | `npm run check`; đọc `pdm-build`; so sánh hash Viewer |
| `check-generated` báo stale | `scripts/build.mjs` hoặc source/artifact mismatch | Chạy `npm run build`, không sửa artifact bằng tay; LF/CRLF alone must not change output |
| Canonical đúng nhưng `outputs/` sai | Outer mirror | SHA-256 canonical/output; chạy outer build wrapper |
| Plain BOM row mở inspector | UI contract regression | `tests/ui-contract.test.mjs`; panel phải hidden/empty |

## 5. Debug runbook

### Bước 1 — Reproduce bằng evidence

Ghi lại URL/file, mode Viewer/Admin, SKU/material, thao tác, expected/actual, console error và thời điểm dữ liệu. Không sửa trước khi có reproduction ổn định.

### Bước 2 — Phân loại tầng lỗi

- Data: payload/index/record sai dù resolver đúng.
- Domain: cùng input nhưng normalized/result sai.
- Infrastructure: commit resolution, shard fetch/decode, expected HEAD, ref update hoặc asset URL sai.
- UI: state đúng nhưng render/action sai.
- Build: source đúng nhưng artifact stale hoặc bundle lỗi.
- Mirror: canonical đúng nhưng `outputs/` hoặc file được gửi khác hash.

### Bước 3 — Chạy focused test

```powershell
node --test tests\github-sharded-data.test.mjs
node --test tests\github-git-data.test.mjs
node --test tests\application-sharded.test.mjs
node --test tests\domain.test.mjs
node --test tests\assets-notifications.test.mjs
node --test tests\material-assets.test.mjs
node --test tests\notifications.test.mjs
node --test tests\ui-contract.test.mjs
node --test tests\runtime-contract.test.mjs
node --test tests\build.test.mjs
```

Chọn test gần symptom nhất. Với bug, thêm regression test và quan sát test đỏ đúng nguyên nhân trước khi sửa production source.

### Bước 4 — Sửa canonical source

Chỉ thay đổi file owner của behavior. Không refactor ngoài scope. Không sửa `admin.html`, `app-admin.js`, `styles.css` hoặc `viewer.html` bằng tay.

### Bước 5 — Build khi input runtime thay đổi

```powershell
npm run build
```

Docs-only hoặc test-only change không cần build nếu build inputs không đổi. Nếu `check-generated` báo stale sau merge/line-ending change, rebuild tại canonical checkout và cập nhật tài liệu build state nếu tài liệu đang ghi current ID.

### Bước 6 — Chạy full repository gate

```powershell
npm run check
git diff --check
```

Đọc exit code thực của `npm run check`; không nối lệnh theo cách khiến lệnh sau che lỗi trước.

### Bước 7 — Chạy outer compatibility flow

Chỉ chạy sau khi canonical `main` đã chứa thay đổi:

```powershell
node work\build_standalone_viewer.mjs
node work\material-master-editor.test.mjs
node work\restructure.test.mjs
node work\audit_data_integrity.mjs
node --check outputs\app-admin.js
```

### Bước 8 — Browser smoke khi behavior thay đổi

Tối thiểu kiểm tra Viewer load counts, BOM, Material Database, structure, notification, một PDF và một GLB. Với Admin kiểm tra row actions, Material Master, structure editor, token trống và không save trong smoke test.

### Bước 9 — Verify mirror và báo cáo

So sánh SHA-256 của canonical artifacts/docs với outer `outputs/`. Báo rõ command, exit code, test count, audit result, browser evidence, commit và trạng thái push.

## 6. Invariants bắt buộc

1. `viewer.html` luôn là một file shareable read-only; local program và CSS phải inline.
2. Generated artifacts không bao giờ là manual edit target.
3. Public read resolves an exact commit and loads the exact 24 shards from cache-busted commit-pinned raw URLs; there is no `data.js` fallback.
4. Admin write loads the current remote shard payload and expected HEAD immediately before one atomic non-force ref update.
5. Save phải preserve remote notification history trước khi append event mới.
6. Token, credential và machine-specific path không được commit hoặc embed.
7. User-facing zh-CN/vi text phải nằm trong i18n dictionary; domain identifiers không được dùng làm UI translation tùy tiện.
8. Plain BOM-row click không mở inspector đã bị loại bỏ; panel phải hidden và empty.
9. Code-only work không copy hoặc ghi đè `data.js` hay `data/`.
10. UI/domain không được gọi GitHub network/storage trực tiếp.
11. Silent cloud refresh không được ghi đè dirty Admin state hoặc active Material Master draft.
12. Outer `outputs/` chỉ được coi là hợp lệ sau build/test/hash verification.
13. `currentRevision` là latest design; `effectiveRevision` là revision sản xuất duy nhất và hai giá trị có thể khác nhau khi latest design còn Draft.
14. Tạo revision mới không tự release hoặc chuyển effectivity.
15. Release chỉ áp dụng cho clean latest Draft, bắt buộc có reason và phải chuyển effectivity atomically.
16. Released/historical revisions và BOM snapshots của chúng là read-only.
17. Add/Delete/Open asset không được mutate material record thật trước Save Material.
18. Save asset phải preserve metadata không hiển thị; 3D direct URL được đồng bộ vào `previewUrl`.
19. URL 2D/3D trống, sai schema/extension hoặc trùng lặp phải chặn Save bằng i18n error.
20. Save Material là local edit; Save to GitHub vẫn là hành động riêng và phải dùng current remote payload/SHA.
21. Selecting a Material asset must not upload, mutate the stored material, or serialize pending IDs, bytes or blob URLs into any shard.
22. PDF must pass `.pdf`, `application/pdf` and `%PDF-` signature checks; GLB must pass `.glb` and `glTF` magic; GLTF must pass `.gltf`, valid JSON and only `data:` or absolute HTTPS buffer/image URIs.
23. Pending binaries are limited to 20,000,000 bytes and remain application-memory only until Save to GitHub.
24. Save to GitHub ordering is binary upload, current shard payload/HEAD read, then atomic 24-shard commit. Binary failure must prevent the shard write.
25. If binary upload succeeds but the shard write fails, retain the resolved immutable URL so retry does not upload the binary again.

### GitHub Contents Material asset storage

Phase A was merged by PR #5 and Phase B by PR #6. Phase B.1 PR #8 introduced sharded compatibility, Phase B.2 PR #9 proved lossless split/reassembly, and Phase B.3 PR #10 added the hardened atomic writer. Phase B.4 PR #11 created staging branch `codex/phase-b4-shards-20260715T041629Z-db11b4a` at `227db46`; PR #12 fixed recursive-tree readback and the existing branch then passed full verification. Phase B.5 PR #14 activates the sharded adapter and Git Data writer in runtime: public and authenticated reads require the exact 24 shards, while writes create blobs/tree/commit and update the ref once with `force:false`. Tracked `data.js` is rollback/migration input only. Preserve the B.4 staging branch, and use fresh `npm run check` output rather than treating this document's historical counts as current.

## 7. Bẫy thường gặp

### Bell về 0 không có nghĩa mất notification

Notification read timestamp nằm ở local browser state. Click bell có thể clear unread badge trên máy đó; payload notifications vẫn phải còn trong remote data và panel.

### `file://` và browser automation

Viewer được thiết kế để mở bằng `file://`, nhưng browser automation có thể chặn navigation này theo policy. Localhost smoke kiểm tra runtime artifact nhưng không chứng minh toàn bộ CORS/CDN/local-file behavior. Trước khi phân phối, mở thủ công `viewer.html` trên clean browser profile.

### GitHub cache

Không kết luận dữ liệu stale từ một raw URL không pin. Kiểm tra commit SHA được resolve và các cache-busted shard URLs pin đúng commit đó.

### Build output deterministic across line endings

Build normalizes LF/CRLF before hashing and HTML rendering. Identical Git source must produce the same build ID and artifact bytes across worktrees. Nếu hash khác nhau, coi đó là build/source drift và dừng publication; không chấp nhận line endings như lời giải thích.

### Worktree khác canonical

Outer wrappers trỏ canonical main clone. Trước merge, chạy direct commands trong feature worktree. Sau merge, chạy outer wrappers để xác nhận flow thật.

### `npm test` chưa đủ

`npm test` không bao gồm data audit và generated freshness. Completion gate là `npm run check`.

### Build code không đồng bộ docs/data tự động

Build chỉ tạo bốn runtime artifacts. Workflow docs phải mirror riêng. `data.js` và `data/` không được copy trong code-only flow.

### Branch publication boundary

Không chạy outer build wrapper để phát hành code từ feature branch. Chỉ mirror runtime sau khi canonical `main` chứa commit tích hợp và full gate đã pass. PR #1 đã được tích hợp ngày 2026-07-14; với thay đổi tương lai vẫn phải lặp lại đúng boundary này trên một feature branch mới.

## 8. Verification và handoff

### Canonical gate

```powershell
cd work\remote-bom-viewer-sync\bom-viewer-sync
npm run build
npm run check
node --check app-admin.js
git diff --check
```

Chỉ chạy `npm run build` nếu build inputs thay đổi hoặc generated check yêu cầu. Không dùng test count trong guide như một hằng số lâu dài; đọc output hiện tại của `npm run check`.

### Đọc current build ID

```powershell
rg -n "pdm-build" admin.html viewer.html
```

Hai artifact phải có cùng ID. Không copy ID cũ từ handoff hoặc chat.

### Hash mirror

```powershell
$names = 'admin.html','app-admin.js','styles.css','viewer.html','AI_DEBUG_GUIDE.md','PROJECT_CONTEXT.md','HANDOVER.md','REVIEW_CONTEXT.md','README_SYNC.md'
foreach ($name in $names) {
  $canonical = (Get-FileHash -LiteralPath $name -Algorithm SHA256).Hash
  $mirror = (Get-FileHash -LiteralPath (Join-Path '..\..\..\outputs' $name) -Algorithm SHA256).Hash
  [pscustomobject]@{ Name = $name; Match = $canonical -eq $mirror; Hash = $canonical }
}
```

Mọi `Match` phải là `True` đối với các file thuộc scope thay đổi.

### Pre-push safety

```powershell
git status --short
git diff --check
git diff -- data.js data
git log -3 --oneline
```

`git diff -- data.js data` phải rỗng cho documentation/code-only task. Chỉ push khi working tree sạch và user đã cho phép.

### Evidence report template

```text
Scope:
Root cause / intent:
Changed source files:
Focused tests (red → green):
Full gate:
Audit:
Outer wrappers:
Browser smoke:
Canonical/output hashes:
Commit / branch / push:
Known residual risk:
```

Khi handoff, dẫn AI tiếp theo về file này trước. Chỉ yêu cầu đọc `PROJECT_CONTEXT.md` hoặc `HANDOVER.md` khi cần lịch sử quyết định chi tiết.
