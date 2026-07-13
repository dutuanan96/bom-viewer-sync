import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { BomApplication } from '../src/application.js';
import { bomViewMethods } from '../src/ui/bom-view.js';
import { catalogViewMethods } from '../src/ui/catalog-view.js';
import { materialViewMethods } from '../src/ui/material-view.js';
import { sharedViewMethods } from '../src/ui/shared-view.js';
import { structureViewMethods } from '../src/ui/structure-view.js';
import { repoRoot } from './helpers/load-data.mjs';

const sourceFiles = [
  'src/application.js',
  'src/ui/shared-view.js',
  'src/ui/catalog-view.js',
  'src/ui/bom-view.js',
  'src/ui/material-view.js',
  'src/ui/structure-view.js',
];
const appSource = sourceFiles
  .map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8'))
  .join('\n');

function methodSource(name) {
  const functionMatch = appSource.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  const classMethodMatch = appSource.match(new RegExp(`\\n\\s{4}${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\s{4}\\}`));
  const match = functionMatch || classMethodMatch;
  assert.ok(match, `expected ${name} function`);
  return match[0];
}

test('Material Database rows expose per-material edit action', () => {
  assert.match(appSource, /data-edit-db-material=/);
  assert.match(appSource, /edit-db-material/);

  assert.equal(typeof catalogViewMethods.renderProductCatalog, 'function');
  assert.equal(typeof bomViewMethods.renderTable, 'function');
  assert.equal(typeof bomViewMethods.renderInspector, 'function');
  assert.equal(typeof materialViewMethods.renderMaterialDatabase, 'function');
  assert.equal(typeof materialViewMethods.renderMaterialMasterEditor, 'function');
  assert.equal(typeof structureViewMethods.renderStructureView, 'function');
  assert.equal(typeof structureViewMethods.renderStructureDetail, 'function');

  const collections = [
    sharedViewMethods,
    catalogViewMethods,
    bomViewMethods,
    materialViewMethods,
    structureViewMethods,
  ];
  const methodNames = collections.flatMap((collection) => Object.keys(collection));

  assert.equal(new Set(methodNames).size, methodNames.length, 'view method keys must be unique');
  for (const collection of collections) {
    for (const [name, method] of Object.entries(collection)) {
      assert.equal(BomApplication.prototype[name], method, `${name} must be installed on BomApplication.prototype`);
    }
  }
});

test('Material Master editor uses a focused detail form with save and back actions', () => {
  assert.match(appSource, /renderMaterialMasterEditor/);
  assert.match(appSource, /data-material-master-edit=/);
  assert.match(appSource, /data-action="save-material-master"/);
  assert.match(appSource, /data-action="back-material-list"/);
});

test('Material Master edits are scoped to the selected MaterialID record', () => {
  assert.match(appSource, /saveMaterialMaster/);
  assert.match(appSource, /this\.state\.selectedMaterialId/);
  assert.match(appSource, /updateMaterialRecord\(this\.state\.payload, record\.id/);
});

test('Material Master view suppresses the floating selected-material inspector', () => {
  assert.match(appSource, /this\.state\.adminView === 'materials'/);
  assert.match(appSource, /panel\.classList\.toggle\('visible', false\)/);
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

  assert.match(appSource, /data-edit-structure-parent=/);
  assert.match(appSource, /data-edit-structure-child=/);
  assert.match(appSource, /edit-structure-parent/);
  assert.match(appSource, /edit-structure-child/);
  assert.doesNotMatch(renderStructureView, /genericToolbar/);
  assert.doesNotMatch(renderStructureDetail, /adminActionsHtml\(\)/);

  assert.equal(typeof BomApplication.prototype.bindStructureDetailControls, 'function');
  assert.match(renderStructureDetail, /this\.bindStructureDetailControls\(content\)/);
  assert.doesNotMatch(renderStructureDetail, /addEventListener/);
  assert.doesNotMatch(renderStructureDetail, /bomEntries\s*(?:=|\.push|\.filter)/);
  assert.doesNotMatch(renderStructureDetail, /payload\.materialDb/);
  assert.doesNotMatch(renderStructureDetail, /markDirty\(\)/);
});

test('BOM table uses per-row material actions instead of a global edit toolbar', () => {
  const bomActionsHtml = methodSource('bomActionsHtml');
  const toolbarHtml = methodSource('toolbarHtml');
  const rowHtml = methodSource('rowHtml');

  assert.match(appSource, /data-edit-bom-material=/);
  assert.match(appSource, /bomActionsHtml/);
  assert.match(bomActionsHtml, /this\.label\('materialDatabase'\)/);
  assert.match(rowHtml, /this\.label\('editMaterial'\)/);
  assert.doesNotMatch(toolbarHtml, /adminActionsHtml\(\)/);
  assert.doesNotMatch(rowHtml, /this\.state\.editMode\s*\?/);
});

test('Material Database edit action is explicit and compact', () => {
  assert.match(appSource, /editMaterial: '编辑'/);
  assert.doesNotMatch(appSource, /editMaterial: '编辑物料'/);
  assert.match(appSource, /data-edit-db-material=/);
});

test('Material Database rows do not open Material Master on plain row click', () => {
  assert.match(appSource, /!materialRow\.closest\('\.material-db-view'\)/);
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

test('pagination and validation UI use dictionary labels', () => {
  const renderMaterialDatabase = methodSource('renderMaterialDatabase');
  const openPdmPrompt = methodSource('openPdmPrompt');

  assert.match(renderMaterialDatabase, /this\.label\('paginationTotal'\)/);
  assert.match(renderMaterialDatabase, /this\.label\('paginationItems'\)/);
  assert.match(renderMaterialDatabase, /this\.label\('paginationGoTo'\)/);
  assert.match(renderMaterialDatabase, /this\.label\('paginationPage'\)/);
  assert.match(openPdmPrompt, /this\.label\('required'\)/);
});

test('direct Material Database page actions do not depend on ambient browser events', () => {
  const app = Object.create(BomApplication.prototype);
  app.state = { materialDbPage: 1 };
  app.renderContent = () => {};

  app.runAction('mdb-go-page', { dataset: { page: '3' } });

  assert.equal(app.state.materialDbPage, 3);
});

test('new Material Master draft is not inserted into database before save', () => {
  const addDatabaseMaterial = methodSource('addDatabaseMaterial');

  assert.match(appSource, /materialDraft: null/);
  assert.match(addDatabaseMaterial, /this\.state\.materialDraft = \{/);
  assert.match(appSource, /selectedMaterialRecord\(\)/);
  assert.match(appSource, /isNewMaterialDraft/);
  assert.doesNotMatch(addDatabaseMaterial, /this\.state\.materialDb\.materials\[id\] =/);
  assert.doesNotMatch(addDatabaseMaterial, /this\.markDirty\(\)/);
});

test('Material Master save commits a draft and back discards unsaved draft', () => {
  assert.match(appSource, /if \(this\.state\.materialDraft\?\.id === record\.id\)/);
  assert.match(appSource, /this\.state\.materialDb\.materials\[record\.id\] = clone\(record\)/);
  assert.match(appSource, /backMaterialList\(\) \{[\s\S]*?this\.state\.materialDraft = null/);
});

test('Material Master editor exposes delete material action', () => {
  assert.match(appSource, /deleteMaterial:/);
  assert.match(appSource, /data-action="delete-material-master"/);
  assert.match(appSource, /deleteDatabaseMaterial\(record\.id\)/);
});

test('Material delete protects BOM references and deletes only orphan material records', () => {
  assert.match(appSource, /materialDeleteBlocked:/);
  assert.match(appSource, /if \(usedCount > 0\)/);
  assert.match(appSource, /delete this\.state\.materialDb\.materials\[materialId\]/);
  assert.doesNotMatch(appSource, /deleteDatabaseMaterial\(materialId\) \{[\s\S]*?bomEntries = this\.state\.materialDb\.bomEntries\.filter/);
});

test('silent cloud refresh does not overwrite an active Material Master draft', () => {
  assert.match(appSource, /this\.state\.dirty \|\| this\.state\.materialDraft/);
});

test('Parent-child structure detail edits update dirty status immediately', () => {
  const bindStructureDetailControls = methodSource('bindStructureDetailControls');

  assert.match(bindStructureDetailControls, /this\.markDirty\(\)/);
  assert.doesNotMatch(bindStructureDetailControls, /this\.state\.dirty = true;\s*this\.renderContent\(\)/);
});
