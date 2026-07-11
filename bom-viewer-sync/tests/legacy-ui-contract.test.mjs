import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rootDir = path.resolve(import.meta.dirname, '..');
const appCore = fs.readFileSync(path.join(rootDir, 'app-core.js'), 'utf8');

function methodSource(name) {
  const match = appCore.match(new RegExp(`\\n    ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, `expected ${name} method`);
  return match[0];
}

test('Material Database rows expose per-material edit action', () => {
  assert.match(appCore, /data-edit-db-material=/);
  assert.match(appCore, /edit-db-material/);
});

test('Material Master editor uses a focused detail form with save and back actions', () => {
  assert.match(appCore, /renderMaterialMasterEditor/);
  assert.match(appCore, /data-material-master-edit=/);
  assert.match(appCore, /data-action="save-material-master"/);
  assert.match(appCore, /data-action="back-material-list"/);
});

test('Material Master edits are scoped to the selected MaterialID record', () => {
  assert.match(appCore, /saveMaterialMaster/);
  assert.match(appCore, /this\.state\.selectedMaterialId/);
  assert.match(appCore, /updateMaterialRecord\(this\.state\.payload, record\.id/);
});
test('Material Master view suppresses the floating selected-material inspector', () => {
  assert.match(appCore, /this\.state\.adminView === 'materials'/);
  assert.match(appCore, /panel\.classList\.toggle\('visible', false\)/);
});

test('BOM view suppresses the redundant floating inspector panel', () => {
  const renderInspector = methodSource('renderInspector');
  const bindActions = methodSource('bindActions');

  assert.match(renderInspector, /this\.state\.adminView === 'bom'/);
  assert.match(renderInspector, /panel\.classList\.toggle\('visible', false\)/);
  assert.match(renderInspector, /panel\.innerHTML = ''/);
  assert.doesNotMatch(renderInspector, /this\.bomInspectorHtml\(\)/);
  assert.doesNotMatch(bindActions, /this\.selectBomEntry\(bomRow\.dataset\.bomEntry\)/);
});

test('Parent-child structure uses per-row edit actions instead of a global edit toolbar', () => {
  const renderStructureView = methodSource('renderStructureView');
  const renderStructureDetail = methodSource('renderStructureDetail');

  assert.match(appCore, /data-edit-structure-parent=/);
  assert.match(appCore, /data-edit-structure-child=/);
  assert.match(appCore, /edit-structure-parent/);
  assert.match(appCore, /edit-structure-child/);
  assert.doesNotMatch(renderStructureView, /genericToolbar/);
  assert.doesNotMatch(renderStructureDetail, /adminActionsHtml\(\)/);
});

test('BOM table uses per-row material actions instead of a global edit toolbar', () => {
  const bomActionsHtml = methodSource('bomActionsHtml');
  const toolbarHtml = methodSource('toolbarHtml');
  const rowHtml = methodSource('rowHtml');

  assert.match(appCore, /data-edit-bom-material=/);
  assert.match(appCore, /bomActionsHtml/);
  assert.match(bomActionsHtml, /this\.label\('materialDatabase'\)/);
  assert.match(rowHtml, /this\.label\('editMaterial'\)/);
  assert.doesNotMatch(toolbarHtml, /adminActionsHtml\(\)/);
  assert.doesNotMatch(rowHtml, /this\.state\.editMode\s*\?/);
});
test('Material Database edit action is explicit and compact', () => {
  assert.match(appCore, /editMaterial: '编辑'/);
  assert.doesNotMatch(appCore, /editMaterial: '编辑物料'/);
  assert.match(appCore, /data-edit-db-material=/);
});

test('Material Database rows do not open Material Master on plain row click', () => {
  assert.match(appCore, /!materialRow\.closest\('\.material-db-view'\)/);
});

test('Material Database headers use localized labels instead of hardcoded Chinese strings', () => {
  const renderMaterialDatabase = methodSource('renderMaterialDatabase');

  assert.match(renderMaterialDatabase, /this\.label\('materialCode'\)/);
  assert.match(renderMaterialDatabase, /this\.label\('materialName'\)/);
  assert.match(renderMaterialDatabase, /this\.label\('specification'\)/);
  assert.match(renderMaterialDatabase, /this\.label\('materialComposition'\)/);
  assert.match(renderMaterialDatabase, /this\.label\('materialColor'\)/);
  assert.match(renderMaterialDatabase, /this\.label\('materialAttribute'\)/);
  assert.doesNotMatch(renderMaterialDatabase, /\\u7269\\u6599\\u7f16\\u7801/);
  assert.doesNotMatch(renderMaterialDatabase, /\\u89c4\\u683c\\u578b\\u53f7/);
});

test('new Material Master draft is not inserted into database before save', () => {
  const addDatabaseMaterial = methodSource('addDatabaseMaterial');

  assert.match(appCore, /materialDraft: null/);
  assert.match(addDatabaseMaterial, /this\.state\.materialDraft = \{/);
  assert.match(appCore, /selectedMaterialRecord\(\)/);
  assert.match(appCore, /isNewMaterialDraft/);
  assert.doesNotMatch(addDatabaseMaterial, /this\.state\.materialDb\.materials\[id\] =/);
  assert.doesNotMatch(addDatabaseMaterial, /this\.markDirty\(\)/);
});

test('Material Master save commits a draft and back discards unsaved draft', () => {
  assert.match(appCore, /if \(this\.state\.materialDraft\?\.id === record\.id\)/);
  assert.match(appCore, /this\.state\.materialDb\.materials\[record\.id\] = clone\(record\)/);
  assert.match(appCore, /backMaterialList\(\) \{[\s\S]*?this\.state\.materialDraft = null/);
});

test('Material Master editor exposes delete material action', () => {
  assert.match(appCore, /deleteMaterial:/);
  assert.match(appCore, /data-action="delete-material-master"/);
  assert.match(appCore, /deleteDatabaseMaterial\(record\.id\)/);
});

test('Material delete protects BOM references and deletes only orphan material records', () => {
  assert.match(appCore, /materialDeleteBlocked:/);
  assert.match(appCore, /if \(usedCount > 0\)/);
  assert.match(appCore, /delete this\.state\.materialDb\.materials\[materialId\]/);
  assert.doesNotMatch(appCore, /deleteDatabaseMaterial\(materialId\) \{[\s\S]*?bomEntries = this\.state\.materialDb\.bomEntries\.filter/);
});
test('silent cloud refresh does not overwrite an active Material Master draft', () => {
  assert.match(appCore, /this\.state\.dirty \|\| this\.state\.materialDraft/);
});

test('Parent-child structure detail edits update dirty status immediately', () => {
  const renderStructureDetail = methodSource('renderStructureDetail');

  assert.match(renderStructureDetail, /this\.markDirty\(\)/);
  assert.doesNotMatch(renderStructureDetail, /this\.state\.dirty = true;\s*this\.renderContent\(\)/);
});

