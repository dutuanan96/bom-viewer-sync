# 金汰 PDM 智能制造专家知识库 (JinTai PDM Codex Pack)

本目录为独立、可移植的 **金汰 PDM 智能制造与 CAD 几何工程专家系统配置包**。
可直接分发给其他工程师、主管或配置在任何 AI 工具（Codex / Cursor / Antigravity / Claude / ChatGPT）中，实现即插即用的专家级 PDM 逻辑推理。

---

## 📁 目录文件清单

| 文件名 | 内容说明 | 适用场景 |
| :--- | :--- | :--- |
| **`PROMPT_ZH.md`** | **核心系统提示词 (Master System Prompt - 中文版)** | 直接复制到 AI 的 System Prompt、Custom Instructions 或聊天窗口作为首条指令 |
| **`01_CNC_PIPE_PHYSICS_ZH.md`** | CNC 激光切管机夹料物理计算与防缺料推导 | 供工艺员、采购部门、BOM 制作人员查阅切管数学模型 |
| **`02_CAD_PARAMETRIC_GEOMETRY_ZH.md`** | 2D CAD 图纸尺寸展开公式 (U型框/带灯中框/拼接梁/底脚) | 供技术研发、CAD 制图人员查阅零部件展开与下料标准 |
| **`03_MATERIAL_CATALOG_ONTOLOGY_ZH.md`** | 5大物料分类、27款原材料方管与核心标准五金配件表 | 供 BOM 录入、物料编码与标准化管理查阅 |
| **`04_ECN_AND_REVISION_LIFECYCLE_ZH.md`** | PDM 变更控制标准 SOP 与 Where-Used 共用件安全检查 | 供主管与设计审核人员查阅版本流转规范 |
| **`pdm-manufacturing-rules.md`** | Codex / Cursor 规则文件 (Rule Drop-in) | 可直接放入项目 `.agents/rules/` 或 `.cursorrules` 中 |

---

## 🚀 如何在领导/同事的 Codex / AI 电脑上快速使用

### 方式一：直接作为 System Prompt 使用 (推荐)
1. 打开 Codex 或 AI 交互界面。
2. 将 **`PROMPT_ZH.md`** 中的全部内容复制粘贴到 AI 的 **System Prompt (系统提示词)** 或 **Custom Instructions (自定义指令)** 中。
3. 此时 AI 即刻掌握金汰 PDM 的全部计算法则与物料体系。

### 方式二：放入项目代码库作为 Workspace Rules
1. 将本文件夹复制到项目根目录下。
2. 将 `pdm-manufacturing-rules.md` 放置在 `.agents/rules/` 或 `.cursorrules` 中。
3. Codex / Cursor 在打开该项目时将自动静默加载本专家知识库。
