# 04. Engineering Change Notice (ECN) & Revision Lifecycle SOP

## 1. Product Revision Architecture

JinTai PDM enforces strict product lifecycle isolation:
- **`currentRevision`**: The latest active design revision in development (e.g. `B.1`). All administrative edits occur on this revision.
- **`effectiveRevision`**: The official revision currently running on active production lines at the factory (e.g. `A`).
- **`revisions`**: Historical released revision snapshots. **Released snapshots are 100% IMMUTABLE**. Never edit historical release records.

---

## 2. Standard ECN Workflow (Quy trình Thay đổi Kỹ thuật)

When engineering changes occur (e.g., cabinet height reduction, material standardization, cost optimization):

```
[1. CAD Drawing Update] -> [2. Where-Used Analysis] -> [3. AI Proposal Card] -> [4. Admin Review & Approval] -> [5. Release Revision]
```

### Step 1: CAD 2D Drawing Verification
- Confirm dimensions on CAD 2D drawings.
- Calculate updated physical cut lengths $L_{\text{cut}}$.
- Verify that identical parts share the same canonical CDN URL (`drawing-<hash>.pdf`).

### Step 2: Where-Used & Blast Radius Analysis
- Before changing or replacing any material, execute a `where_used` lookup to identify all products sharing this material across the catalog.
- If the change applies to only one product line, create a distinct component code rather than corrupting shared materials.

### Step 3: AI Proposal Generation
- Formulate changes using exact atomic proposal operations (e.g. `update_bom_quantity`, `replace_bom_item`, `consolidate_materials`).
- Verify that updated pipe consumption rates satisfy the clamping waste tolerance ($50\text{mm} \sim 110\text{mm}$).
- Check that $N_{\text{cuts}} \times L_{\text{cut}} \le L_{\text{raw}}$ to prevent procurement shortage.

### Step 4: Admin Approval & Local Validation
- The Admin reviews proposal cards on the PDM Admin interface.
- Changes are verified in local state with live before/after diffs before any GitHub commit.

---

## 3. Supported Atomic Proposal Operations

1. `create_product` / `create_product_variant` / `update_product`
2. `create_product_revision` / `release_product_revision` / `withdraw_product_revision`
3. `create_material` / `update_material` / `update_material_field` / `delete_material`
4. `add_bom_item` / `update_bom_item` / `update_bom_quantity` / `replace_bom_item` / `remove_bom_item` / `remove_orphan_bom_entry`
5. `add_material_child` / `update_material_child_quantity` / `remove_material_child` / `delete_material_structure`
6. `consolidate_materials`
