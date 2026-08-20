# 金汰 PDM 智能制造专家知识库 (JinTai PDM Codex Pack)

本目录为独立、可移植的 **金汰 PDM 智能制造与 CAD 几何工程专家系统配置包**。
可直接分发给其他工程师、主管或配置在任何 AI 工具（Codex / Cursor / Antigravity / Claude / ChatGPT）中，实现**一键全自动配置**与即插即用的专家级 PDM 逻辑推理。

---

## 📁 目录文件清单

| 文件名 | 内容说明 | 适用场景 |
| :--- | :--- | :--- |
| **`AUTO_SETUP_PROMPT_ZH.md`** | **🔥 一键全自动配置 Prompt (Auto-Setup Master Prompt)** | **最推荐！** 直接发给 Codex，它会自动建目录、写规则、写技能并完成全量知识学习 |
| **`PROMPT_ZH.md`** | 核心系统提示词 (Master System Prompt - 中文版) | 备份提示词，内容与自动配置 Prompt 一致 |
| **`01_CNC_PIPE_PHYSICS_ZH.md`** | CNC 激光切管机夹料物理计算与防缺料推导 | 供工艺员、采购部门、BOM 制作人员查阅切管数学模型 |
| **`02_CAD_PARAMETRIC_GEOMETRY_ZH.md`** | 2D CAD 图纸尺寸展开公式 (U型框/带灯中框/拼接梁/底脚) | 供技术研发、CAD 制图人员查阅零部件展开与下料标准 |
| **`03_MATERIAL_CATALOG_ONTOLOGY_ZH.md`** | 5大物料分类、27款原材料方管与核心标准五金配件表 | 供 BOM 录入、物料编码与标准化管理查阅 |
| **`04_ECN_AND_REVISION_LIFECYCLE_ZH.md`** | PDM 变更控制标准 SOP 与 Where-Used 共用件安全检查 | 供主管与设计审核人员查阅版本流转规范 |
| **`pdm-manufacturing-rules.md`** | Codex / Cursor 规则文件 (Rule Drop-in) | 可直接放入项目 `.agents/rules/` 或 `.cursorrules` 中 |

---

## 🚀 如何在领导/同事的电脑上【一键全自动配置】

只需 **1 步**：

1. 把本文件夹（`jintai-pdm-codex-pack`）复制到领导电脑的工作区中。
2. 打开领导电脑上的 Codex / Cursor，打开 **`AUTO_SETUP_PROMPT_ZH.md`**，把里面的内容**作为一条消息直接发送给 Codex**。
3. 👉 **Codex 就会完全自主地在领导电脑上创建 `.agents/rules/`、`.agents/skills/` 和 `.cursorrules`，并自动完成全部知识学习与就绪汇报！**
