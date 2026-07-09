# PDM BOM Viewer - Review Context
# Updated: 2026-07-09

## Quick Start

```bash
cd /mnt/c/Users/HP/Documents/Codex/2026-06-30/ew-html-and-add-real-time
```

## Architecture

- `outputs/admin.html` - Admin mode (full features)
- `outputs/viewer.html` - Viewer mode (built by build script, CSS/JS inlined)
- `outputs/app-core.js` - Core logic (~4,062 lines)
- `outputs/styles.css` - CSS (~3,057 lines)
- `outputs/data.js` - BOM data (3.8MB, loads from GitHub)
- `outputs/app-viewer.js` - Viewer bootstrap
- `outputs/app-admin.js` - Admin bootstrap
- `work/build_standalone_viewer.mjs` - Build script

## Build Script Flow

`work/build_standalone_viewer.mjs` builds viewer.html:

1. Read admin.html
2. Inline CSS (styles.css → `<style>`)
3. Inline JS (app-core.js → `<script>`)
4. Inline viewer bootstrap (app-viewer.js → `<script>`)
5. **DO NOT inline data.js** - data loads from GitHub via `loadCloud()`
6. Replace title/mode badge for viewer mode

```javascript
// Build command
cd work && node build_standalone_viewer.mjs
```

## Data Flow

- `data.js` is the source of truth (in `outputs/`)
- GitHub repo: `dutuanan96/bom-viewer-sync`
- viewer.html loads data from GitHub: `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/main/bom-viewer-sync/data.js`
- admin.html also loads from GitHub via `loadCloud()`
- After editing data.js: push to GitHub, viewer auto-loads new data

## Critical Rules

1. **NEVER modify working code** - only ADD new code
2. **After every change**: rebuild viewer.html, CDP verify both tabs, push to GitHub
3. **CSS `.pdf-frame`**: must use `flex: 1`, NOT `position: absolute` (causes 2D modal to cover screen)
4. **`#pdfModalSubtitle`**: must exist in admin.html HTML (required by `showModel3dModal`)
5. **GitHub cache**: raw.githubusercontent.com caches files, may need `?t=timestamp` for fresh data
6. **Backup before changes**: `cp outputs/data.js outputs/backups/data.js.$(date +%Y%m%d_%H%M%S)`

## Sidebar Navigation

3 modules (图纸/3D removed - redundant with 物料数据库):
1. 产品 BOM (22) - Product catalog
2. 物料数据库 (662) - Material database with 2D/3D
3. 父子项结构 (35) - Parent-child structure (unique parent count)

## Key Code Patterns

- `buildBomTreeRows()` - builds BOM tree with hierarchy
- `filteredRows()` - filters/sorts rows for display
- `rowsForExport()` - exports BOM to Excel (9 columns: 层级, 物料编码, etc.)
- `isRenderableProductEntry()` - allows virtual hardware pack entries
- `showModal()` - opens 2D PDF modal
- `showModel3dModal()` - opens 3D model modal
- `createPdmNavigation()` - creates sidebar nav items
- `loadCloud()` - fetches data from GitHub with cache bust

## Data Model Quick Reference

### 灯带 (LED Strip)
- DDxxxx = LED strip (FPCB material)
- DDxxxxR1 = 自粘灯带固定卡扣 (PP material, 本色 only)
- BH = 黑泊板 (for 复古色/黑色)
- WH = 白色 (for 白色)
- 规格: LED=DC12V SMD5050 xxxmm, 固定卡扣=以实际为准

### 布抽 (Fabric Drawer)
- Body: MDF&纸板&无纺布 (has 2D+3D)
- 底板: MDF&无纺布 (3D only)
- 条: SLHGZY/SLHGZZ codes

### 五金包 (Hardware Pack)
- BH = 复古色/黑色, WH = 白色
- WH pack color_zh must be '白色'

## Known Issues / Watch Out

- `filteredRows()` may show duplicate rows for some products (data issue, not code bug)
- viewer.html loads from GitHub - needs internet connection
- SheetJS free版 has no styling support
- GitHub CDN caches data.js, may show stale data for a few minutes
