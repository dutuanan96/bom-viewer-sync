# 01. CNC Pipe Cutting Physics & Material Shortage Prevention

## 1. Physical Principle of CNC Laser Tube Cutting

In industrial tube processing, automatic CNC laser cutting machines feed raw metal tubes through a motorized rotary chuck. To securely hold and stabilize the tube until the final cut, the machine requires a physical clamping tail segment (tail waste).
- **Minimum Clamping Tail Waste**: Waste_min ≈ 50mm ~ 70mm.
- **Optimal Clamping Tolerance Window**: 50mm <= Waste <= 110mm (Target sweet spot: 70mm ~ 85mm).
- Any cut plan leaving <50mm will fail to clamp properly and cause machine collision or premature tube drop.
- Any cut plan leaving >110mm is suboptimal and incurs unnecessary raw material scrap costs.

---

## 2. Universal Parametric Formulas

Given:
- **L_raw**: Raw tube length in mm (extracted from `spec.zh`, e.g., `长度 6013mm`).
- **L_cut**: Required physical cut length of the part in mm.
- **Waste_min**: Minimum clamping tail waste (70mm default).

### Formula 1: Maximum Achievable Cuts (N_cuts)
```
N_cuts = Math.floor((L_raw - Waste_min) / L_cut)
```

### Formula 2: Sub-BOM Consumption Rate (Rate)
```
Rate = 1 / N_cuts
```

### Formula 3: Actual Scrap Clamping Waste (Waste)
```
Waste = L_raw - (N_cuts * L_cut)
```

---

## 3. Zero-Shortage Procurement Invariant

### The Golden Invariant:
```
N_cuts * L_cut <= L_raw
```

If a BOM entry defines a consumption rate based on a theoretical cut count N_ideal where `N_ideal * L_cut > L_raw`, it is a **CRITICAL DEFECT**.

### Case Study: Foot 41 (41底脚) Discrepancy
- **Part**: `ZJG150641BH` (41.5mm physical cut length).
- **Raw Tube**: `FG1515066013` (6013mm).
- **The Defect (Rate 0.006897 = 1/145)**:
  - Theoretical cuts = 145.
  - Required length = 145 * 41.5mm = 6017.5mm > 6013mm.
  - **Result**: The 145th piece cannot be cut physically. On a 10,000-piece order, purchasing buys 69 raw tubes (10,000 * 0.006897). The factory yields only 69 * 143 = 9,867 pieces, resulting in an **immediate shortage of 133 pieces (1 entire raw tube)**.
- **The Normalized Standard (Rate 0.006993 = 1/143)**:
  - Max cuts = Math.floor((6013 - 70) / 41.5) = 143.
  - Total cut length = 143 * 41.5mm = 5934.5mm.
  - Clamping waste = 6013 - 5934.5 = **78.5mm** (Within optimal range).
  - Purchasing buys 70 tubes (10,000 * 0.006993), yielding 70 * 143 = 10,010 pieces (100% fulfilled + safe surplus).

---

## 4. Standard Feet Benchmark Matrix

| Foot Code | Chinese Name | Cut Length (L_cut) | Raw Pipe Code | Raw Length (L_raw) | Max Cuts (N) | Total Cut | Clamping Waste | Consumption Rate |
| :--- | :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| `ZJG150641BH` / `WH` | 41底脚 | 41.5mm | `FG1515066013` | 6013mm | **143** | 5934.5mm | **78.5mm** | **0.006993** |
| `ZJG15064123BH` / `WH` | 41底脚(23mm螺纹) | 41.5mm | `FG1515066013` | 6013mm | **143** | 5934.5mm | **78.5mm** | **0.006993** |
| `ZJG150654BH` / `WH` | 54底脚 | 54.0mm | `FG1515066013` | 6013mm | **110** | 5940.0mm | **73.0mm** | **0.009091** |
| `ZJG15065423BH` / `WH` | 54底脚(23mm螺纹) | 54.0mm | `FG1515066013` | 6013mm | **110** | 5940.0mm | **73.0mm** | **0.009091** |
| `ZJG150651BH` | 51底脚 | 51.0mm | `FG1515065680` | 5680mm | **110** | 5610.0mm | **70.0mm** | **0.009091** |
