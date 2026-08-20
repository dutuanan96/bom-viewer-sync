---
name: jintai-pdm-expert
description: JinTai PDM Manufacturing, CAD Geometry, and CNC Tube Cutting Domain Expert. Use when auditing BOMs, calculating pipe consumption rates, evaluating ECN proposals, and boding CAD dimensions.
---

# JinTai PDM Manufacturing & Engineering Skill

This skill provides step-by-step procedures for manufacturing calculations, CAD boding, and BOM audits in JinTai PDM.

## Quick Reference Docs
- [01. CNC Pipe Physics](file:///docs/pdm-ai-master-manual/01_CNC_PIPE_PHYSICS_AND_SHORTAGE_PREVENTION.md)
- [02. CAD Geometry Rules](file:///docs/pdm-ai-master-manual/02_CAD_PARAMETRIC_GEOMETRY_RULES.md)
- [03. Material Catalog](file:///docs/pdm-ai-master-manual/03_MATERIAL_CATALOG_AND_HARDWARE_ONTOLOGY.md)
- [04. ECN Lifecycle SOP](file:///docs/pdm-ai-master-manual/04_ECN_AND_REVISION_LIFECYCLE_SOP.md)

## Workflow 1: Calculating Pipe Consumption Rate for Any New Component
1. Extract physical cut length `L_cut` from CAD 2D drawing or specification.
   - For U-bend frame with M6 bottom caps: `L_cut = (Height - 3) * 2 + Width`.
   - For U-bend frame with flush weld nuts: `L_cut = Height * 2 + Width`.
   - For spliced beam: `L_cut = L_overall - 40mm`.
   - For foot: `L_cut` = exact physical tube length (e.g. 41.5mm, 54.0mm, 51.0mm).
2. Look up the raw pipe length `L_raw` from the raw material code (e.g. `FG1515066013` = 6013mm).
3. Compute max cuts: `N_cuts = Math.floor((L_raw - 70) / L_cut)`.
4. Compute consumption rate: `Rate = 1 / N_cuts` (rounded to 6 decimal places).
5. Verify clamping tail waste: `Waste = L_raw - (N_cuts * L_cut)`. Confirm `50mm <= Waste <= 110mm`.
6. Confirm zero shortage: Confirm `N_cuts * L_cut <= L_raw`.

## Workflow 2: Auditing Sub-BOMs & Detecting Shortage Risks
1. Scan Level 2 BOM entries where child material is a raw tube (`FG*`).
2. Compute `Total Cut = cuts * L_cut`.
3. If `Total Cut > L_raw`, flag as **CRITICAL MATERIAL SHORTAGE DEFECT** and compute corrected rate `1 / Math.floor((L_raw - 70) / L_cut)`.
4. Check that all required hardware (caps, weld nuts, rivet nuts, inserts) are present in the sub-BOM.
