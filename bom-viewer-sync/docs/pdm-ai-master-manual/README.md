# JinTai PDM Master Knowledge Manual

Welcome to the **JinTai PDM Master Knowledge Manual**. This directory contains the complete, authoritative, and battle-tested domain intelligence for AI Agents (Codex, Antigravity, and engineering copilots) operating on the JinTai PDM ecosystem.

---

## 🎯 Core Principles & Non-Negotiable Invariants

1. **Zero-Shortage Procurement Guarantee**: Every BOM formula and consumption rate is strictly bounded by physical CNC cutting limits. The system will never generate or approve a rate where {\\text{cuts}} \\times L_{\\text{cut}} > L_{\\text{raw}}$.
2. **Universal Parametric Adaptation**: Zero hardcoding. When dimensions, specifications, or raw profile lengths change in the future, the AI automatically computes exact cut lengths, scrap clamping waste, and rates from mathematical first principles.
3. **Single Source of Truth**: The 24 runtime shards under \data/\ are canonical. Identical parts share exact CDN drawing URLs (\drawing-<hash>.pdf\).
4. **Governed AI Proposals**: AI mutations are Admin-only structured local proposals. They never execute arbitrary code and never invoke direct GitHub writes without explicit Admin approval.

---

## 📚 Table of Contents

| Document | Purpose | Key Technical Subjects |
| :--- | :--- | :--- |
| **[01. CNC Pipe Physics & Shortage Prevention](01_CNC_PIPE_PHYSICS_AND_SHORTAGE_PREVENTION.md)** | CNC tube laser cutting kinematics & formula | Clamping waste (\\sim110\\text{mm}$), Foot 41/54/51 math, procurement shortage prevention |
| **[02. CAD Parametric Geometry Rules](02_CAD_PARAMETRIC_GEOMETRY_RULES.md)** | 2D CAD unfolding & geometric deduction rules | U-bend frames, LED middle frames, spliced beams, support frames |
| **[03. Material Catalog & Hardware Ontology](03_MATERIAL_CATALOG_AND_HARDWARE_ONTOLOGY.md)** | Full taxonomy of materials and hardware | 5 material families, raw profiles, weld nuts, end caps, LED plates |
| **[04. ECN & Revision Lifecycle SOP](04_ECN_AND_REVISION_LIFECYCLE_SOP.md)** | Engineering Change Notice & versioning SOP | \currentRevision\ vs \effectiveRevision\, where-used analysis, proposal transactions |

---

## 🤖 How AI Agents Self-Configure with this Knowledge

When a new Codex/Antigravity session starts, the agent automatically reads this directory along with \.agents/skills/jintai-pdm-expert/SKILL.md\ and \.agents/rules/pdm-manufacturing-rules.md\.

This instantly aligns the agent to:
- Act as a Senior Manufacturing Engineer & PDM Systems Architect.
- Automatically calculate cut lengths from CAD dimensions.
- Verify that every BOM row has appropriate clamping tail waste (\\text{mm} \\sim 110\\text{mm}$).
- Prevent any procurement shortage or BOM regression.
