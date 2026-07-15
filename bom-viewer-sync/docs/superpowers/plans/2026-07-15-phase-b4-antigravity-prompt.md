# Prompt for Antigravity IDE — Phase B.4

Copy everything below into Antigravity IDE.

---

Bạn là implementation agent của Phase B.4 cho dự án PDM/BOM Viewer. Hãy code cẩn thận, tối giản, test-first và báo cáo bằng tiếng Việt. Code/comments/identifiers/errors phải dùng English.

## Workspace bắt buộc

Làm việc duy nhất tại:

```text
C:\Users\HP\Documents\Codex\2026-06-30\ew-html-and-add-real-time\work\remote-bom-viewer-sync\.worktrees\codex-sharded-atomic-writer-phase-b3-review-fixes\bom-viewer-sync
```

Branch hiện tại phải là:

```text
codex/phase-b4-staging-migration-plan
```

HEAD ban đầu phải là `39c396e59ff6324afb52d5335866f16411f33ae3`. Nếu branch, HEAD hoặc worktree khác, dừng và báo raw output; không tự chuyển sang một repo/copy khác.

Không chạm worktree canonical đang có thay đổi riêng tại `...\remote-bom-viewer-sync\bom-viewer-sync`.

## Đọc theo thứ tự

1. `AI_DEBUG_GUIDE.md`
2. `HANDOVER.md`
3. `PROJECT_CONTEXT.md`
4. `REVIEW_CONTEXT.md`
5. `README_SYNC.md`
6. `docs/superpowers/specs/2026-07-15-phase-b4-staging-migration-design.md`
7. `docs/superpowers/plans/2026-07-15-phase-b4-staging-migration.md`
8. `AGENTS.md` nếu có

Plan và design ở trên là source of truth cho task này. Thực hiện lần lượt từng task/checkbox; không bỏ qua RED step và không tự đổi architecture. Nếu phát hiện mâu thuẫn kỹ thuật thật sự, dừng tại checkpoint gần nhất, đưa bằng chứng file/line/command và đề xuất thay đổi nhỏ nhất. Không âm thầm improvise.

## Mục tiêu

Implement một CLI Node.js được bảo vệ chặt để:

- đọc `bom-viewer-sync/data.js` từ đúng full SHA của remote `main` bằng Git ref/commit/tree/blob APIs;
- split thành đúng 24 logical shards;
- kiểm tra round-trip và aggregate hash trước mutation;
- tạo một one-time staging branch chưa tồn tại;
- gọi atomic writer Phase B.3 để ghi `bom-viewer-sync/data/...` bằng `force: false`;
- đọc lại 24 remote blobs từ staging commit, reassemble và deep-compare;
- chứng minh `data.js` blob không đổi và `main` không bị update.

## Safety boundary tuyệt đối

Trong lượt này chỉ implement và chạy mock/local tests.

Không được:

- đặt hoặc sử dụng token GitHub thật;
- chạy `migrate:staging` với `--execute` ngoài test mock;
- tạo/xóa/sửa bất kỳ remote branch nào;
- gửi request mạng thật;
- sửa `data.js` hoặc tạo local `data/`;
- wire writer/staging module vào `src/application.js`, Admin hoặc Viewer;
- sửa `outputs/` hoặc Desktop;
- dùng `force: true`, DELETE, retry hoặc rollback tự động;
- commit, push, mở PR hoặc merge;
- tự tuyên bố approved/LGTM.

Nếu environment có `GH_TOKEN`, không đọc/in/log nó trong test. Mock phải dùng token giả `test-token-value`, không dùng chuỗi giống credential thật.

## Kỷ luật thực thi

Trước khi sửa:

```powershell
git status -sb
git rev-parse HEAD
git branch --show-current
npm ci
npm run check
```

Với từng task:

1. Viết focused failing test.
2. Chạy đúng focused test và lưu RED failure có ý nghĩa.
3. Viết implementation nhỏ nhất để pass.
4. Chạy focused test đến GREEN.
5. Chạy relevant regression tests.
6. Xem `git diff --check` và diff đúng file.
7. Chuyển sang task tiếp theo.

Không refactor ngoài scope, không thêm dependency, không hard-code test count vào docs.

## Những contract dễ bị làm sai

- Repo thực nằm trong subdirectory: shard paths phải là `bom-viewer-sync/data/...`, không phải root `data/...`.
- `data.js` khoảng 4.3 MiB: đọc bằng Git blob API, không dựa vào Contents API inline content.
- Aggregate hash dùng logical paths `manifest.json`, `materials.json`, `products/<id>.json` để giữ hash hiện tại.
- Staging branch phải chưa tồn tại; không resume/reuse branch cũ.
- Branch creation là mutation đầu tiên và chỉ xảy ra sau source SHA, count, hash, round-trip đều pass.
- Nếu fail sau branch creation, giữ branch/orphan objects để review; không cleanup tự động.
- Post-write verification phải đọc remote blobs thật trong mock flow, không chỉ tin kết quả trả về từ writer.
- Token phải bị xóa khỏi message, stack và cause ở mọi error path.
- Không có request nào PATCH `main`; chỉ writer được PATCH staging ref với `force: false`.

## Final gate bắt buộc

Chạy fresh và báo exact exit code/output summary:

```powershell
npm run build
npm run check
npm run migrate:dry-run
npm run migrate:dry-run
node --check scripts/migrate-data-staging.mjs
node --check scripts/lib/github-sharded-staging.mjs
node --check scripts/lib/sharded-files.mjs
node --check src/infrastructure/github-git-data.js
node --check app-admin.js
git diff --check
git diff origin/main -- data.js
Test-Path data
rg -n "github-sharded-staging|createGithubGitDataWriter" src admin.html app-admin.js viewer.html
git status --short
git diff --stat origin/main
```

Hai dry-run phải cùng báo:

```text
Virtual files created: 24
Aggregate SHA-256: d5261ad277be1fbe7b391ea2f0995de8b0f96fdb612d73e95ed5853b2903684e
```

`git diff origin/main -- data.js` phải rỗng. `Test-Path data` phải là `False`. Runtime search không được cho thấy staging/writer bị import vào app hoặc generated bundles.

## Cách response cuối — bắt buộc theo thứ tự

1. **Kết quả:** nói rõ đã implement gì và “không có remote staging write nào được thực hiện”.
2. **Files changed:** repo-relative path + trách nhiệm từng file.
3. **TDD evidence:** RED failure đầu tiên có ý nghĩa và GREEN tương ứng.
4. **Verification:** command, exit code, test count thực tế, audit counts, hai dry-run hashes, data diff/hash.
5. **Safety proof:** không DELETE, không `force: true`, không runtime import, không token leak, không network thật.
6. **Diff review:** `git diff --stat`, `git status --short`, xác nhận chỉ file trong plan thay đổi.
7. **Proposed execution command:** đưa PowerShell command hoàn chỉnh nhưng token chỉ là placeholder environment; tuyệt đối không chạy.
8. **Stop point:** yêu cầu independent review và operator approval trước khi remote execution.

Không dùng “should pass”, “có vẻ”, “probably”, “ready” nếu không có fresh evidence. Không giấu test fail. Nếu gate fail, báo fail và nguyên nhân; không tuyên bố hoàn tất.

---
