# 02. CAD Parametric Geometry & Component Unfolding Rules

## 1. Continuous Inverted U-Bend Frames (Khung uốn liền chữ U)

Continuous U-bend frames are bent from a single length of square tube (15x15x0.6T) on CNC rotary draw tube benders.

### Geometry Unfolding Rules:
Given nominal outer dimensions `Height x Width x Depth` (e.g. `647x290x15mm`):
1. **Case A: Bottom Plastic End Caps with M6 Threads (`M6GS1515BH/WH`)**:
   - The plastic plug outer flange adds 3mm at each bottom foot opening.
   - Cut Height of steel tube: `H_cut = H_nominal - 3mm`.
   - Unfolded Raw Cut Length:
     ```
     L_cut = (H_nominal - 3mm) * 2 + W_nominal
     ```
   - *Example*: `647x290x15mm` Side Frame -> `(647 - 3) * 2 + 290 = 1288 + 290 = 1578mm`.
     Using `FG1515064804` (4804mm): 3 cuts = 4734mm, Clamping Waste = 70mm, Rate = `0.333333` (1/3).

2. **Case B: Submerged Round Weld Nuts (`M6YLM139`)**:
   - The nut is welded flush inside the tube end without any outer flange protrusion.
   - Cut Height of steel tube: `H_cut = H_nominal`.
   - Unfolded Raw Cut Length:
     ```
     L_cut = H_nominal * 2 + W_nominal
     ```
   - *Example*: `584x290x15mm` U-Bend Middle Frame (`LGS033`) -> `584 * 2 + 290 = 1458mm`.
     Using `FG1515065900` (5900mm): 4 cuts = 5832mm, Clamping Waste = 68mm, Rate = `0.25` (1/4).

---

## 2. Composite Welded Middle Frames with LED Strip Plate (Khung giữa hàn dán đèn LED)

For TV stand units featuring continuous LED lighting (e.g. `LGS031`, `LGS131`, `LGS231`, `LGS420`, `LGS421`, `LGS043`):
The middle frame cannot use a top U-bend because LED strip tape requires a flat, continuous top surface for adhesive mounting.

### Structural Topology (4 Sub-components):
1. **2 Vertical Posts (前中框 & 后中框)**:
   - `H_cut = H_nominal - 3mm` (Bottom M6 cap deduction).
   - Total steel required per frame = `H_cut * 2`.
   - *Example*: 576mm frame height -> `(576 - 3) * 2 = 1146mm`.
     On `FG1515065814` (5814mm): 5 frames (10 tubes) = 5730mm, Waste = 84mm, Rate = `0.2` (1/5).
2. **1 Bottom Cross Rail (短横梁)**:
   - `W_cut = W_nominal - 2 * 15mm = W_nominal - 30mm`.
   - *Example*: 290mm width -> `290 - 30 = 260mm`.
     On `FG1515065814` (5814mm): 22 bars = 5720mm, Waste = 94mm, Rate = `0.045455` (1/22).
   - *Example*: 335mm width -> `335 - 30 = 305mm`.
     On `FG1515066182` (6182mm): 20 bars = 6100mm, Waste = 82mm, Rate = `0.05` (1/20).
3. **1 Top Flat LED Mounting Plate (左右中框铁片)**:
   - `2601502ZHKTP` (260x15x2mm) for 290mm-wide frames.
   - `3051502ZHKTP` (305x15x2mm) for 335mm-wide frames.
   - Qty: 1 pc per frame.
4. **Hardware**: 2x `M6GS1515BH/WH` bottom caps + 1x `M6LMLM` side pull rivet nut.

---

## 3. Spliced Longitudinal Beams (Thanh ngang ghép nối lồng âm)

To achieve compact flat-pack packaging for wide TV consoles (e.g. `LGS132`, `LGS133`, `LGS232`, `LGS233`, `LGS334`, `LGS434`, `LGS834`):
Long longitudinal rails are divided into two interlocking sections with an internal reinforcement sleeve insert.

### Splicing Invariants:
1. **Outer Main Profile Cut Length**:
   ```
   L_cut = L_nominal_overall - 40mm
   ```
   - The 40mm deduction provides the female socket depth where the male insert mates.
2. **Inner Reinforcement Insert Sleeve**:
   - Fixed Length: **80mm** (Protrudes 40mm past the splice center into the mating tube).
   - Standard 15x15 Profile: `FG132132105190` (13.2x13.2x1Tmm, 5190mm).
     64 cuts * 80mm = 5120mm, Clamping Waste = 70mm, Rate = `0.015625` (1/64).
   - Heavy 30x15 Profile (e.g. LGS834): `FG28136065190` (28x13.6x0.6Tmm, 5190mm).
     64 cuts * 80mm = 5120mm, Clamping Waste = 70mm, Rate = `0.015625` (1/64).

---

## 4. Support Frames (支撑框)

Support frames provide intermediate load-bearing reinforcement for TV consoles.
- Spec format: `[Width] x [Height] x [Depth]mm` (e.g., `335x178x15mm` for `LGS334SZKBH`).
- U-bend Cut Length: `L_cut = Height * 2 + Width = 178 * 2 + 335 = 691mm`.
- Hardware: 4x `LJP16143` (16x14x3mm welded connecting brackets) + 2x `M6YLM139` (welded nuts).
- Raw Tube: `FG1515065598` (5598mm) -> 8 cuts * 691mm = 5528mm, Clamping Waste = **70mm**, Rate = `0.125` (1/8).
