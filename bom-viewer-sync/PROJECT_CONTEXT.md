# BOM Viewer / PDM Handoff - Updated 2026-07-09

## Current Goal
Static BOM/PDM viewer for JinTai furniture. Viewer opens locally as one standalone HTML file, reads embedded BOM data and cloud URLs, shows PDM-style UI with product catalog, BOM table, material database, parent/child relationships, 2D drawings, 3D GLB viewer, and product images.

## Important Paths
- Workspace: `C:\Users\HP\Documents\Codex\2026-06-30\ew-html-and-add-real-time`
- Source/output files: `outputs\admin.html`, `outputs\viewer.html`, `outputs\styles.css`, `outputs\app-core.js`, `outputs\app-admin.js`, `outputs\app-viewer.js`, `outputs\data.js`
- Desktop file used by the user: `C:\Users\HP\Desktop\viewer.html`
- Local GitHub clone: `work\remote-bom-viewer-sync\bom-viewer-sync\`
- GitHub repo folder: `dutuanan96/bom-viewer-sync`, branch `main`, folder `bom-viewer-sync/`
- Raw data URL: `https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/main/bom-viewer-sync/data.js`
- Backups: `outputs\backups\data.js.YYYYMMDD_HHMMSS`

## Current Source Of Truth
Use `outputs/` as the source. After changes, copy to `work/remote-bom-viewer-sync/bom-viewer-sync/` and push.

Last verified: 2026-07-09
- app-core.js: sidebar nav fixed (图纸/3D removed), structure count fixed (35)
- data.js: 灯带 BH/WH split, 布抽 2D added, 布抽材质 fixed, 固定卡扣 separated

## Current UI State
- Sidebar has 3 modules: 产品 BOM (22), 物料数据库 (662), 父子项结构 (35)
- 图纸/3D module removed (redundant with 物料数据库)
- Sidebar brand logo uses Google Drive thumbnail
- Brand text: zh-CN: 金汰家具/PDM系统, vi: Nội thất JinTai/Hệ thống PDM
- Product catalog table lists SPU-level products (22 rows)
- BOM table: 11 columns (层级, 物料编号, 编号, 名称, 规格型号, 材质, 颜色, 属性, 数量, 2D图纸, 3D)

## Data Model Notes

### 灯带 (LED Strip) - CRITICAL
- BH (黑泊板/FPCB) = for 复古色/黑色 products
- WH (白色/FPCB) = for 白色 products
- Code: DDxxxx = LED strip, DDxxxxR1 = 自粘灯带固定卡扣 (fixing clip)
- 固定卡扣: 材质=PP, 颜色=本色 only, 规格=以实际为准
- LED strip: 材质=FPCB, 规格=DC12V SMD5050 xxxmm
- 3D models shared between BH/WH (same model)
- No 2D drawings for灯带

### 布抽 (Fabric Drawer) - CRITICAL
- 布抽 body: 材质=`MDF&纸板&无纺布`, has 2D+3D
- 布抽底板: 材质=`MDF&无纺布`, 3D only (no 2D)
- 布抽条: separate items (SLHGZY/SLHGZZ)
- 2D drawings not color-specific (share between BH/WH)

### 五金包 (Hardware Pack)
- BH (复古色/黑色) vs WH (白色)
- WH pack color_zh must be '白色' (NOT '黑色')

## Verification Checklist
1. `node --check outputs/app-core.js`
2. `node -e "JSON.parse(...)"` for data.js
3. Rebuild: `cd work && node build_standalone_viewer.mjs`
4. Browser verify both admin.html and viewer.html
5. Check sidebar counts, 灯带 BH/WH, 布抽 材质/2D

## Backup Before Changes
```bash
cp outputs/data.js outputs/backups/data.js.$(date +%Y%m%d_%H%M%S)
```

## Do Not Do
- Do not expose or commit GitHub tokens or secrets
- Do not hardcode new user-facing Chinese/Vietnamese text outside i18n dictionaries
- Do not push from the stale clone without syncing from `outputs/` first
- Do not change 灯带 code structure without understanding BH/WH split
- Do not mix 布抽 and 布抽底板 材质 values
