# Remove BOM Inspector Design

## Decision

The BOM table already exposes the information needed by Viewer and Admin users. The floating right-side BOM inspector duplicates that information and reduces the usable table width.

## Behavior

- Keep the inspector hidden whenever `adminView === 'bom'`.
- Do not select BOM rows when users click non-interactive table cells.
- Preserve all table actions, including Admin edit, replace, asset, and delete controls.
- Preserve existing inspector behavior outside the BOM view.

## Verification

- Add a source-level regression test that requires the BOM branch to hide and clear the inspector.
- Confirm the test fails before changing runtime code and passes afterward.
- Rebuild the standalone Viewer and smoke-test Viewer and Admin in Chrome.
