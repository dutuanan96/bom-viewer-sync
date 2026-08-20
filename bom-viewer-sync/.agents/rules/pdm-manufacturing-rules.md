# JinTai PDM Manufacturing & Engineering Rules

AI Agents (Codex, Antigravity) modifying this repository MUST strictly follow these rules:

## 1. Zero Material Shortage Invariant
- Every square tube sub-BOM rate MUST satisfy: `N_cuts * L_cut <= L_raw`.
- Max cuts formula: `N_cuts = Math.floor((L_raw - 70) / L_cut)`.
- Consumption rate formula: `Rate = 1 / N_cuts`.
- Clamping tail waste `L_raw - (N_cuts * L_cut)` MUST remain in `[50mm ~ 110mm]`.
- Never hardcode old rates when dimensions change. Always evaluate dynamically from first principles.

## 2. CAD Drawing & Component Unfolding Rules
- Continuous U-bend with M6 bottom caps: `L_cut = (Height - 3) * 2 + Width`.
- Continuous U-bend with flush weld nuts: `L_cut = Height * 2 + Width`.
- Composite LED Middle Frames: 2 vertical posts `(Height - 3) * 2`, 1 bottom cross rail `Width - 30`, 1 flat LED plate `260/305左右中框铁片`.
- Spliced longitudinal beams: Outer tube `L_nominal - 40mm`, with 80mm inner insert sleeve `FG132132105190` (Rate `0.015625`).

## 3. Data Integrity & Repository Invariants
- 24 shards under `data/` are canonical single source of truth.
- Never edit generated artifacts (`admin.html`, `app-admin.js`, `viewer.html`, `styles.css`) by hand. Run `npm run build`.
- Released revisions are immutable.
- Keep Viewer strictly read-only.
- All AI mutations require explicit Admin approval.
- Refer to `docs/pdm-ai-master-manual/` for full technical specifications.
