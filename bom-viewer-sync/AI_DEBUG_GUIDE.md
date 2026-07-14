# JinTai PDM AI Debug Guide

> Đây là file duy nhất AI mới phải đọc trước khi debug dự án. Các tài liệu context khác chỉ bổ sung lịch sử. Không sửa generated artifacts trực tiếp.

## 1. Định hướng trong 60 giây

### Vị trí và vai trò

- Canonical project root: `work/remote-bom-viewer-sync/bom-viewer-sync/`.
- Editable source-of-truth: `src/`, `scripts/`, `tests/`, `package.json` và các tài liệu trong project root.
- Generated artifacts: `admin.html`, `app-admin.js`, `styles.css`, `viewer.html`.
- Runtime data: `data.js`. Không ghi đè file này trong code-only work.
- Sharding foundation: `src/domain/sharded-data.js`, `src/infrastructure/sharded-data.js`, and `scripts/migrate-data.mjs`. The inactive atomic writer is `src/infrastructure/github-git-data.js`. These modules are not a runtime cutover: `data.js` remains authoritative until compatibility orchestration is reviewed and merged.
- Portable mirror: outer `outputs/`. Đây là nơi nhận artifact đã verify, không phải source-of-truth.
- `viewer.html` là Viewer read-only một file để gửi sang máy khác.
- `admin.html` dùng bundle và data file bên cạnh để chỉnh sửa rồi lưu lên GitHub.

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
| Cloud BOM/material data | Admin flow hoặc `data.js` task riêng | Audit data; không trộn với code-only work |
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
| `src/infrastructure/github-data.js` | Config, GitHub public read, authenticated read/write, serialization | Product/domain decisions |
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
| `tests/domain.test.mjs` | Pure domain behavior và module seams |
| `tests/github-data.test.mjs` | GitHub read/write, current SHA/payload và notification preservation |
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
  → GitHub Contents API raw response with cache bust
  → raw GitHub fallback only when Contents API fails
  → parse + normalize payload
  → application state
  → catalog / BOM / materials / structure UI
  → remote Drive PDF, image and GLB URLs when requested
```

Viewer không chứa token và không ghi dữ liệu. Source code/style/shell thay đổi chỉ xuất hiện sau `npm run build` và sau khi phát lại `viewer.html`. BOM, material, notification và linked-asset data trên GitHub/Drive xuất hiện khi Viewer reload.

### Admin load và save

```text
admin.html + app-admin.js + styles.css + data.js
  → load/normalize remote payload
  → edit local application state
  → read current remote payload and SHA
  → diff current remote materials against local state
  → preserve remote notification history
  → append the new GitHub-save notification
  → serialize UTF-8 data.js source
  → GitHub Contents API PUT with current SHA
```

### Sharding foundation (not active in runtime)

```text
data.js
  -> npm run migrate:data (dry-run by default)
  -> normalize + split in memory
  -> compose again and require exact parity
  -> optional --write --out <preview-directory>
```

The preview schema contains `data/manifest.json`, `data/materials.json`, `data/indexes/where-used.json`, `data/notifications.json`, and one `data/products/<ProductCode>.json` per product. Do not point Viewer/Admin at these files yet. The inactive writer publishes changed paths through `GET ref -> GET commit -> POST blobs -> POST tree -> POST commit -> PATCH ref` with `force: false`. It rejects a stale expected HEAD before object creation and maps a concurrent `409`/`422` ref update to `GITHUB_DATA_CONFLICT`. A failed final ref update can leave unreachable Git objects, but it does not partially publish shard files. A future cutover must still preserve current remote notifications, compose the complete changed-shard set, and keep `data.js` fallback during the compatibility window.

Điểm quan trọng: save không được diff dựa trên stale local baseline. Remote-only notifications phải được giữ lại trước khi append event mới. Đây là lý do adapter và application save flow phải đọc current remote payload and SHA ngay trước PUT.

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
| Viewer có 0 sản phẩm/0 vật liệu | `src/infrastructure/github-data.js` | Network/console; Contents API response; `tests/github-data.test.mjs` |
| Dữ liệu stale sau reload | GitHub adapter/cache | Kiểm tra cache-bust URL và current Contents API payload |
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
| Save làm mất notification cũ | Admin save orchestration | Remote-only notification regression trong `tests/github-data.test.mjs` |
| Admin save 409/conflict | GitHub adapter/save flow | SHA dùng trong PUT có phải current remote SHA không |
| Source đã sửa nhưng Viewer không đổi | Build/mirror state | `npm run check`; đọc `pdm-build`; so sánh hash Viewer |
| `check-generated` báo stale | `scripts/build.mjs` hoặc line endings | Chạy `npm run build`, không sửa artifact bằng tay |
| Canonical đúng nhưng `outputs/` sai | Outer mirror | SHA-256 canonical/output; chạy outer build wrapper |
| Plain BOM row mở inspector | UI contract regression | `tests/ui-contract.test.mjs`; panel phải hidden/empty |

## 5. Debug runbook

### Bước 1 — Reproduce bằng evidence

Ghi lại URL/file, mode Viewer/Admin, SKU/material, thao tác, expected/actual, console error và thời điểm dữ liệu. Không sửa trước khi có reproduction ổn định.

### Bước 2 — Phân loại tầng lỗi

- Data: payload/index/record sai dù resolver đúng.
- Domain: cùng input nhưng normalized/result sai.
- Infrastructure: fetch, decode, fallback, SHA hoặc asset URL sai.
- UI: state đúng nhưng render/action sai.
- Build: source đúng nhưng artifact stale hoặc bundle lỗi.
- Mirror: canonical đúng nhưng `outputs/` hoặc file được gửi khác hash.

### Bước 3 — Chạy focused test

```powershell
node --test tests\github-data.test.mjs
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
3. Public data read ưu tiên cache-busted GitHub Contents API raw response; raw GitHub chỉ là fallback.
4. Admin write luôn dùng current remote payload and SHA ngay trước PUT.
5. Save phải preserve remote notification history trước khi append event mới.
6. Token, credential và machine-specific path không được commit hoặc embed.
7. User-facing zh-CN/vi text phải nằm trong i18n dictionary; domain identifiers không được dùng làm UI translation tùy tiện.
8. Plain BOM-row click không mở inspector đã bị loại bỏ; panel phải hidden và empty.
9. Code-only work không copy hoặc ghi đè `data.js`.
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

## 7. Bẫy thường gặp

### Bell về 0 không có nghĩa mất notification

Notification read timestamp nằm ở local browser state. Click bell có thể clear unread badge trên máy đó; payload notifications vẫn phải còn trong remote data và panel.

### `file://` và browser automation

Viewer được thiết kế để mở bằng `file://`, nhưng browser automation có thể chặn navigation này theo policy. Localhost smoke kiểm tra runtime artifact nhưng không chứng minh toàn bộ CORS/CDN/local-file behavior. Trước khi phân phối, mở thủ công `viewer.html` trên clean browser profile.

### GitHub cache

Không kết luận dữ liệu stale chỉ từ `raw.githubusercontent.com`. Đọc GitHub Contents API với cache bust và so payload/updated time.

### Build hash phụ thuộc bytes

Line endings khác nhau giữa worktree và canonical checkout có thể làm build hash đổi dù logic giống nhau. Build ở checkout sẽ được dùng để phát hành, chạy generated check, rồi mirror đúng bytes đó.

### Worktree khác canonical

Outer wrappers trỏ canonical main clone. Trước merge, chạy direct commands trong feature worktree. Sau merge, chạy outer wrappers để xác nhận flow thật.

### `npm test` chưa đủ

`npm test` không bao gồm data audit và generated freshness. Completion gate là `npm run check`.

### Build code không đồng bộ docs/data tự động

Build chỉ tạo bốn runtime artifacts. Workflow docs phải mirror riêng. `data.js` không được copy trong code-only flow.

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
git diff -- data.js
git log -3 --oneline
```

`git diff -- data.js` phải rỗng cho documentation/code-only task. Chỉ push khi working tree sạch và user đã cho phép.

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
