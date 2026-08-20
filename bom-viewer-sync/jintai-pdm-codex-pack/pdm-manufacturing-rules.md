# 金汰 PDM 制造与 CAD 工程规则 (Codex Invariant Rules)

## 1. 采购防缺料铁律
- 切管定额严禁超限：`N_cuts * L_cut <= L_raw`。
- 最大刀数公式：`N_cuts = Math.floor((L_raw - 70) / L_cut)`。
- 定额公式：`Rate = 1 / N_cuts`。
- 尾料残余必须在 `[50mm ~ 110mm]` 范围内。

## 2. 几何展开与构件法则
- 倒 U 型外框有管塞：`L_cut = (Height - 3) * 2 + Width`。
- 倒 U 型外框平齐圆螺母：`L_cut = Height * 2 + Width`。
- 复合带灯中框：2 根立柱 `(Height - 3) * 2` + 1 根底横梁 `Width - 30` + 1 块左右中框铁片 `260/3051502ZHKTP`。
- 拼接横梁：主管身 `L_nominal - 40mm` + 80mm 内衬套 `FG132132105190` (定额 0.015625)。
- 41底脚：41.5mm，定额必须为 `0.006993` (1/143)，严禁错写 1/145。

## 3. 严格数据边界
- `data/` 目录下的 24 个 Shard 分片是唯一真理源。
- 严禁手动修改打包产物 (`admin.html`, `app-admin.js`, `viewer.html`, `styles.css`)，改完源码后执行 `npm run build`。
- 历史已发布版本不可篡改。
- AI 变更提议必须经由管理员审核批准。
