# AI Debug Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one self-contained AI-oriented architecture and debugging runbook, keep it synchronized with handoff pointers, and publish the verified result to GitHub.

**Architecture:** `AI_DEBUG_GUIDE.md` is the single entrypoint for a new AI. A focused Node contract test protects its required sections and portability rules; existing context files only point to it. The canonical guide is mirrored byte-for-byte to outer `outputs/` after repository verification.

**Tech Stack:** Markdown, Node.js built-in test runner, PowerShell, Git.

## Global Constraints

- Canonical project root is `work/remote-bom-viewer-sync/bom-viewer-sync/`.
- Explanatory prose is Vietnamese; paths, commands, identifiers, and technical terms remain English.
- Do not include secrets, tokens, machine-specific absolute paths, or a fixed build ID.
- Do not edit generated `admin.html`, `app-admin.js`, `styles.css`, or `viewer.html` for this documentation-only change.
- Do not modify or publish `data.js` as part of this change.
- Push only after all repository, mirror, and Git status checks pass.

---

### Task 1: Create The Self-Contained AI Debug Guide

**Files:**
- Create: `bom-viewer-sync/AI_DEBUG_GUIDE.md`
- Create: `bom-viewer-sync/tests/ai-debug-guide.test.mjs`

**Interfaces:**
- Consumes: current module boundaries, scripts, tests, generated artifacts, and outer compatibility wrappers.
- Produces: one portable guide whose required headings and safety rules are enforced by `tests/ai-debug-guide.test.mjs`.

- [ ] **Step 1: Write the failing contract test**

Create `tests/ai-debug-guide.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const guide = readFileSync(new URL('../AI_DEBUG_GUIDE.md', import.meta.url), 'utf8');

test('AI debug guide is self-contained, portable, and operational', () => {
  const requiredHeadings = [
    '## 1. Định hướng trong 60 giây',
    '## 2. Bản đồ kiến trúc',
    '## 3. Luồng dữ liệu runtime',
    '## 4. Ma trận triệu chứng',
    '## 5. Debug runbook',
    '## 6. Invariants bắt buộc',
    '## 7. Bẫy thường gặp',
    '## 8. Verification và handoff',
  ];

  for (const heading of requiredHeadings) assert.match(guide, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const path of ['src/domain/', 'src/features/', 'src/infrastructure/', 'src/ui/', 'src/application.js']) {
    assert.match(guide, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(guide, /npm run build/);
  assert.match(guide, /npm run check/);
  assert.match(guide, /work\\build_standalone_viewer\.mjs/);
  assert.match(guide, /GitHub Contents API/);
  assert.match(guide, /current remote payload and SHA/);
  assert.match(guide, /notification history/);
  assert.match(guide, /file:\/\//);
  assert.doesNotMatch(guide, /[A-Z]:\\Users\\/i);
  assert.doesNotMatch(guide, /pdm-build[^\n]*[0-9a-f]{12}/i);
  assert.doesNotMatch(guide, /TBD|TODO|PLACEHOLDER/);
});
```

- [ ] **Step 2: Run the test and verify the missing-guide failure**

Run:

```powershell
node --test tests\ai-debug-guide.test.mjs
```

Expected: FAIL with `ENOENT` for `AI_DEBUG_GUIDE.md`.

- [ ] **Step 3: Write the guide**

Create `AI_DEBUG_GUIDE.md` with these exact top-level sections and operational content:

```markdown
# JinTai PDM AI Debug Guide

> Đây là file duy nhất AI mới phải đọc trước khi debug. Không sửa generated artifacts trực tiếp.

## 1. Định hướng trong 60 giây

- Canonical root: `work/remote-bom-viewer-sync/bom-viewer-sync/`.
- Editable: `src/`, `scripts/`, `tests/`, project docs and config.
- Generated: `admin.html`, `app-admin.js`, `styles.css`, `viewer.html`.
- Runtime data: `data.js`; không ghi đè trong code-only work.
- Portable mirror: outer `outputs/`; không phải source-of-truth.
- Bắt đầu bằng `git status --short`, `npm run check`, rồi đọc module gần triệu chứng nhất.

## 2. Bản đồ kiến trúc

| Boundary | Trách nhiệm | Không được chứa |
|---|---|---|
| `src/domain/` | BOM, materials, relationships và pure queries | DOM, network, storage |
| `src/features/` | Notification diff/normalization | UI rendering |
| `src/infrastructure/` | GitHub và linked assets | Product UI policy |
| `src/ui/` | Render và browser interaction | GitHub fetch/write trực tiếp |
| `src/application.js` | State và orchestration | Generated bundle edits |

Liệt kê ownership của từng module, entry point, shell, styles, build/audit/check scripts và test files. Dependency flow là entry/application → UI/domain/features/infrastructure; domain không phụ thuộc UI.

## 3. Luồng dữ liệu runtime

Viewer: standalone HTML → GitHub Contents API raw có cache bust → normalize payload → application state → UI → Drive/PDF/GLB/image links.

Admin: load remote → edit local state → load current remote payload and SHA → diff material fields → preserve remote notification history → append save event → serialize → GitHub Contents API PUT.

Code/style/shell change cần build và phát lại Viewer. Data/asset change xuất hiện sau reload.

## 4. Ma trận triệu chứng

Tạo bảng `Symptom | First owner | First evidence` cho data stale, wrong BOM, wrong relationships, material/where-used, PDF/GLB/image, i18n/UI, notification, Admin save conflict, stale generated output và stale outer mirror.

## 5. Debug runbook

1. Reproduce chính xác và lưu error/console/state.
2. Phân loại data/domain/infrastructure/UI/build/mirror.
3. Chạy focused test gần nhất.
4. Chỉ sửa canonical source.
5. Chạy `npm run build` khi build input thay đổi.
6. Chạy `npm run check`.
7. Sau khi tích hợp canonical `main`, chạy outer wrappers.
8. Smoke Viewer/Admin nếu browser behavior thay đổi.
9. So sánh SHA-256 và báo cáo evidence.

## 6. Invariants bắt buộc

Ghi rõ Viewer một file read-only; generated files không sửa tay; public read dùng GitHub Contents API trước raw fallback; Admin dùng current remote payload and SHA; preserve remote notification history; không commit token/path máy; UI text qua i18n; plain BOM row không mở inspector; code-only work không ghi `data.js`.

## 7. Bẫy thường gặp

Giải thích local unread state, `file://` automation policy, localhost limitation, GitHub cache, line-ending build hash, worktree/canonical mismatch, stale generated checks và code update khác data update.

## 8. Verification và handoff

Bao gồm canonical commands, outer wrappers `work\build_standalone_viewer.mjs`, `work\material-master-editor.test.mjs`, `work\restructure.test.mjs`, `work\audit_data_integrity.mjs`, cách đọc current `pdm-build`, cách hash mirror và mẫu evidence report.
```

Expand each abbreviated instruction into concise operational prose and tables. Do not add project history or duplicate the design spec.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
node --test tests\ai-debug-guide.test.mjs
```

Expected: 1 test, 1 pass, 0 fail.

- [ ] **Step 5: Self-review the guide**

Run:

```powershell
rg -n "TBD|TODO|PLACEHOLDER|[A-Z]:\\Users\\|pdm-build.*[0-9a-f]{12}" AI_DEBUG_GUIDE.md
git diff --check
```

Expected: `rg` returns no matches and `git diff --check` exits 0.

- [ ] **Step 6: Commit the guide and contract**

```powershell
git add AI_DEBUG_GUIDE.md tests\ai-debug-guide.test.mjs
git commit -m "docs: add AI debug guide"
```

---

### Task 2: Link, Mirror, Verify, And Publish

**Files:**
- Modify: `bom-viewer-sync/PROJECT_CONTEXT.md`
- Modify: `bom-viewer-sync/HANDOVER.md`
- Create mirror: outer `outputs/AI_DEBUG_GUIDE.md`

**Interfaces:**
- Consumes: canonical `AI_DEBUG_GUIDE.md` from Task 1.
- Produces: discoverable context pointers, byte-identical portable mirror, verified `main`, and pushed GitHub state.

- [ ] **Step 1: Add independent-entry pointers and update baselines**

Add near the top of both context files:

```markdown
AI debugging entrypoint: read `AI_DEBUG_GUIDE.md` first. It is self-contained; the remaining context files provide history and handoff detail only.
```

Update the repository test baseline from 55 to 56 and keep Material Master at 18/18, runtime at 13/13, and audit at 643 materials / 2725 entries / 22 products / 0 errors / 0 warnings.

- [ ] **Step 2: Run the complete repository gate**

```powershell
npm run check
```

Expected: 56 tests pass, audit reports 0 errors and 0 warnings, generated check passes.

- [ ] **Step 3: Mirror the guide and context documents**

From the canonical project root:

```powershell
Copy-Item -LiteralPath 'AI_DEBUG_GUIDE.md','PROJECT_CONTEXT.md','HANDOVER.md','REVIEW_CONTEXT.md','README_SYNC.md' -Destination '..\..\..\outputs' -Force
```

Then compare SHA-256 for `AI_DEBUG_GUIDE.md`, `PROJECT_CONTEXT.md`, `HANDOVER.md`, `REVIEW_CONTEXT.md`, and `README_SYNC.md`; every pair must match.

- [ ] **Step 4: Run outer compatibility gates**

From workspace root:

```powershell
node work\build_standalone_viewer.mjs
node work\material-master-editor.test.mjs
node work\restructure.test.mjs
node work\audit_data_integrity.mjs
node --check outputs\app-admin.js
```

Expected: Material Master 18/18, runtime 13/13, audit 0/0, and syntax exit 0.

- [ ] **Step 5: Verify documentation-only scope and commit**

```powershell
git status --short
git diff --check
git diff --name-only HEAD~1
git diff -- data.js
```

Expected: only guide/test/context changes; `git diff -- data.js` is empty.

```powershell
git add PROJECT_CONTEXT.md HANDOVER.md
git commit -m "docs: link AI debug guide"
```

- [ ] **Step 6: Verify clean state and push `main`**

```powershell
git status --porcelain
git log -3 --oneline
git push origin main
```

Expected: clean status before push and successful update of `origin/main` to the local documentation commits.

- [ ] **Step 7: Report delivery evidence**

Report the pushed commit SHA, GitHub branch, 56/56 tests, audit result, wrapper results, guide mirror hash, and the local/GitHub guide path. Mention that no `data.js` change was included.
