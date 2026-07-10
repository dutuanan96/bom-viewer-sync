# Remove BOM Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant right-side inspector from the BOM view for Viewer and Admin users.

**Architecture:** Keep the shared inspector component for non-BOM modules. Make the BOM branch in `renderInspector()` explicitly hide and clear the panel, and stop BOM row clicks from selecting entries solely for the removed panel.

**Tech Stack:** Vanilla JavaScript, Node.js source-level tests, standalone HTML build script, Chrome CDP smoke testing.

## Global Constraints

- Preserve Material Database and parent-child structure behavior.
- Preserve Admin table actions.
- Keep all PDM UI text behind existing i18n labels.
- Rebuild `outputs/viewer.html` after editing `outputs/app-core.js`.

---

### Task 1: Remove BOM Inspector Behavior

**Files:**
- Modify: `work/material-master-editor.test.mjs`
- Modify: `outputs/app-core.js`
- Modify (generated): `outputs/viewer.html`

**Interfaces:**
- Consumes: `PdmApp.renderInspector()` and delegated BOM table click handling.
- Produces: A BOM view with no floating inspector while other modules retain their existing inspector behavior.

- [ ] **Step 1: Write the failing test**

Replace the existing BOM inspector assertion with a test requiring `renderInspector()` to hide and clear the panel in BOM view and requiring the content click handler not to call `selectBomEntry()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node work\material-master-editor.test.mjs`

Expected: FAIL because the current BOM branch calls `bomInspectorHtml()` and the click handler selects BOM rows.

- [ ] **Step 3: Write minimal implementation**

Change the BOM branch to:

```js
if (this.state.adminView === 'bom') {
  panel.classList.toggle('visible', false);
  panel.innerHTML = '';
  return;
}
```

Remove the delegated non-control BOM row click that calls `selectBomEntry()`.

- [ ] **Step 4: Rebuild and verify**

Run:

```powershell
node work\build_standalone_viewer.mjs
node --check outputs\app-core.js
node --check outputs\app-admin.js
node --check outputs\app-viewer.js
node work\material-master-editor.test.mjs
node work\restructure.test.mjs
node work\audit_data_integrity.mjs
```

Expected: all syntax checks and tests pass, with zero data integrity errors and warnings.

- [ ] **Step 5: Browser smoke test**

Open Viewer and Admin through Chrome CDP, click a BOM row, and verify `#inspectorPanel` remains hidden and empty. Confirm Material Database and structure navigation still render normally.

- [ ] **Step 6: Sync and commit**

Pull the GitHub clone with rebase, copy the changed runtime and context files, verify the clone, commit with `fix: remove redundant bom inspector`, and push `main` without force.
