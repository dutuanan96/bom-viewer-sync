import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { BomApplication, coreUtils } from '../src/application.js';
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

test('material rows use only material-owned assets while product assembly models remain separate', () => {
  const context = {
    state: {
      currentSku: 'LGS001',
      drawings: {
        LGS001: {
          'mat001|panel': [{ name: 'legacy-product-panel.pdf' }],
        },
      },
      models3d: {
        LGS001: {
          'mat001|panel': [{ name: 'legacy-product-panel.glb' }],
          assembly: [{ name: 'LGS001-assembly.glb' }],
        },
      },
    },
  };
  const materialWithoutOwnedAssets = {
    mat_code: 'MAT001',
    name_zh: 'Panel',
  };

  assert.deepEqual(bomViewMethods.drawingsFor.call(context, materialWithoutOwnedAssets), []);
  assert.deepEqual(bomViewMethods.models3dFor.call(context, materialWithoutOwnedAssets), []);
  assert.deepEqual(
    bomViewMethods.productModels3d.call(context).map((asset) => asset.name),
    ['LGS001-assembly.glb'],
  );
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

test('Material asset upload controls use i18n and delegated file handling', () => {
  const keys = [
    'uploadAsset',
    'assetPendingUpload',
    'assetFileQueued',
    'invalidAssetFile',
    'assetFileTooLarge',
    'invalidPdfFile',
    'invalidGlbFile',
    'invalidGltfFile',
    'pendingAssetMissing',
    'uploadingAssets',
    'assetUploadFailed',
  ];
  keys.forEach((key) => assert.match(appSource, new RegExp(`${key}:`)));
  assert.match(appSource, /data-action="upload-asset-file"/);
  assert.match(appSource, /data-asset-file-input/);
  assert.match(appSource, /this\.label\('uploadAsset'\)/);
  assert.match(appSource, /this\.handleMaterialAssetFileInput\(input\)/);
  assert.match(appSource, /this\.openMaterialAssetFilePicker\(actionElement\)/);
});

test('direct Material Database page actions do not depend on ambient browser events', () => {
  const app = Object.create(BomApplication.prototype);
  app.state = { materialDbPage: 1 };
  app.renderContent = () => {};

  app.runAction('mdb-go-page', { dataset: { page: '3' } });

  assert.equal(app.state.materialDbPage, 3);
});

test('Admin change preview renders the exact localized payload diff', () => {
  const previous = coreUtils.normalizePayload({
    materialDb: {
      materials: {
        mat_001: {
          id: 'mat_001',
          code: 'MAT-001',
          name: { zh: 'Panel', vi: 'Panel' },
          spec: { zh: '100 mm', vi: '100 mm' },
        },
      },
      bomEntries: [],
    },
  });
  const next = coreUtils.normalizePayload(JSON.parse(JSON.stringify(previous)));
  next.materialDb.materials.mat_001.spec = { zh: '120 mm', vi: '120 mm' };

  const app = new BomApplication({ mode: 'admin', githubData: {}, githubAssetStorage: {} });
  app.state.loadedPayload = previous;
  app.state.payload = next;
  app.state.dirty = true;

  assert.equal(typeof app.changePreviewHtml, 'function');

  app.state.lang = 'zh';
  const zhHtml = app.changePreviewHtml();
  assert.match(zhHtml, /\u53d8\u66f4\u6458\u8981/);
  assert.match(zhHtml, /\u7269\u6599\u5c5e\u6027/);
  assert.match(zhHtml, /MAT-001/);
  assert.match(zhHtml, /\u89c4\u683c\u578b\u53f7/);
  assert.match(zhHtml, /100 mm/);
  assert.match(zhHtml, /120 mm/);

  app.state.lang = 'vi';
  const viHtml = app.changePreviewHtml();
  assert.match(viHtml, /T\u00f3m t\u1eaft thay \u0111\u1ed5i/);
  assert.match(viHtml, /Thu\u1ed9c t\u00ednh v\u1eadt li\u1ec7u/);
  assert.match(viHtml, /Quy c\u00e1ch/);
  assert.match(viHtml, /100 mm/);
  assert.match(viHtml, /120 mm/);
});

test('Admin dirty actions add View Changes once and stay synchronized with dirty state', () => {
  const actions = [];
  const parentElement = {
    querySelector(selector) {
      if (selector !== '[data-action="view-changes"]') return null;
      return actions.find((action) => action.dataset.action === 'view-changes') || null;
    },
  };
  const createAction = (actionName) => ({
    dataset: { action: actionName },
    hidden: false,
    parentElement,
    setAttribute(name, value) {
      if (name === 'data-dirty-action') this.dataset.dirtyAction = value;
    },
    insertAdjacentHTML(position, html) {
      assert.equal(position, 'afterend');
      assert.match(html, /data-action="view-changes"/);
      const previewAction = createAction('view-changes');
      previewAction.dataset.dirtyAction = '';
      actions.splice(actions.indexOf(this) + 1, 0, previewAction);
    },
  });
  actions.push(createAction('save'), createAction('discard'));

  const app = new BomApplication({ mode: 'admin', githubData: {}, githubAssetStorage: {} });
  app.queryAll = (selector) => {
    if (selector === '[data-action="save"]') return actions.filter((action) => action.dataset.action === 'save');
    if (selector === '[data-action="discard"]') return actions.filter((action) => action.dataset.action === 'discard');
    if (selector === '[data-dirty-action]') return actions.filter((action) => 'dirtyAction' in action.dataset);
    return [];
  };

  assert.equal(typeof app.syncDirtyVisibility, 'function');

  app.state.dirty = false;
  app.syncDirtyVisibility();
  assert.deepEqual(actions.map((action) => action.dataset.action), ['save', 'view-changes', 'discard']);
  assert.equal(actions.every((action) => action.hidden), true);

  app.state.dirty = true;
  app.syncDirtyVisibility();
  assert.equal(actions.filter((action) => action.dataset.action === 'view-changes').length, 1);
  assert.equal(actions.every((action) => !action.hidden), true);
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
  const renderStructureDetail = methodSource('renderStructureDetail');

  assert.match(bindStructureDetailControls, /this\.markDirty\(\)/);
  assert.doesNotMatch(bindStructureDetailControls, /this\.state\.dirty = true;\s*this\.renderContent\(\)/);
  assert.match(renderStructureDetail, /scopeLabel\(entry, this\.label\('sharedScope'\)\)/);
});

test('BOM revision selector uses product revision state and historical snapshots are read-only', () => {
  const payload = coreUtils.normalizePayload({
    bom: {
      P1: { code: 'P1', revision: 'V4.1', colors: ['black'], color_info: { black: { materials: [] } } },
    },
    materialDb: {
      version: 1,
      materials: { current: { id: 'current', code: 'CURRENT' } },
      bomEntries: [
        { id: 'current-entry', parentType: 'product', productCode: 'P1', color: 'black', materialId: 'current', qty: '2' },
      ],
    },
    productRevisions: {
      P1: {
        currentRevision: 'V4.1',
        revisions: [{
          revision: 'V4',
          createdAt: '2026-07-13T00:00:00.000Z',
          changeReason: 'Previous release',
          snapshot: {
            product: { code: 'P1', revision: 'V4', colors: ['black'], color_info: { black: { materials: [] } } },
            materialDb: {
              version: 1,
              materials: { previous: { id: 'previous', code: 'PREVIOUS' } },
              bomEntries: [
                { id: 'previous-entry', parentType: 'product', productCode: 'P1', color: 'black', materialId: 'previous', qty: '1' },
              ],
            },
          },
        }],
      },
    },
  });
  const app = Object.create(BomApplication.prototype);
  app.mode = 'admin';
  app.state = {
    payload,
    bom: payload.bom,
    currentSku: 'P1',
    currentColor: 'black',
    selectedRevision: 'V4',
  };
  app.label = (key) => key;

  assert.equal(app.selectedProductRevision(), 'V4');
  assert.equal(app.isHistoricalRevision(), true);
  assert.equal(app.canEditProductRevision(), false);
  assert.equal(app.bomRows()[0].qty, '1');
  const revisionSelector = app.revisionSelectorHtml();
  assert.match(revisionSelector, /data-product-revision/);
  assert.match(revisionSelector, /V4\.1 · draftStatus · nonCurrentStatus/);
  assert.match(revisionSelector, /V4 · releasedStatus · effectiveStatus/);
  const revisionBadges = app.revisionStatusBadgesHtml?.(app.selectedProductRevisionInfo()) || '';
  assert.match(revisionBadges, /releasedStatus/);
  assert.match(revisionBadges, /effectiveStatus/);

  const rowHtml = methodSource('rowHtml');
  const headerActionsHtml = methodSource('headerActionsHtml');
  const contentHeaderHtml = methodSource('contentHeaderHtml');
  const productCatalogRowHtml = methodSource('productCatalogRowHtml');
  const getSpuVersion = methodSource('getSpuVersion');
  const bindEditing = methodSource('bindEditing');
  assert.match(rowHtml, /this\.canEditProductRevision\(\)/);
  assert.match(headerActionsHtml, /this\.canEditProductRevision\(\)/);
  assert.doesNotMatch(contentHeaderHtml, />RELEASED</);
  assert.match(contentHeaderHtml, /revisionTransitionHtml/);
  assert.match(contentHeaderHtml, /revisionStatusBadgesHtml/);
  assert.match(productCatalogRowHtml, /effectiveRevision/);
  assert.doesNotMatch(getSpuVersion, /manuals/);
  assert.match(bindEditing, /data-product-revision/);
  assert.match(appSource, /data-action="create-product-revision"/);
});

test('admin creates the next live revision from the current product snapshot', () => {
  const payload = coreUtils.normalizePayload({
    bom: {
      P1: { code: 'P1', colors: ['black'], color_info: { black: { size: '100mm', materials: [] } } },
    },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });
  const app = Object.create(BomApplication.prototype);
  app.mode = 'admin';
  app.state = {
    payload,
    bom: payload.bom,
    currentSku: 'P1',
    currentColor: 'black',
    selectedRevision: 'V1',
    selectedMaterialId: '',
    selectedEntryId: '',
    editMode: false,
    dirty: false,
  };
  app.label = (key) => key;
  let revisionFields = [];
  app.openPdmPrompt = (title, fields, onConfirm) => {
    revisionFields = fields;
    onConfirm({
      currentRevision: 'V4',
      revision: 'V4.1',
      changeReason: 'Reduce height by 10mm',
    });
  };
  app.markDirty = () => { app.state.dirty = true; };
  app.renderAll = () => {};
  app.setStatus = () => {};

  app.createProductRevisionFromPrompt();
  app.state.payload.bom.P1.color_info.black.size = '90mm';

  assert.equal(app.state.payload.productRevisions.P1.currentRevision, 'V4.1');
  assert.equal(app.state.payload.productRevisions.P1.revisions[0].revision, 'V4');
  assert.equal(app.state.payload.productRevisions.P1.revisions[0].snapshot.product.color_info.black.size, '100mm');
  assert.equal(revisionFields.find((field) => field.key === 'changeReason')?.required, true);
  assert.equal(app.state.selectedRevision, 'V4.1');
  assert.equal(app.state.dirty, true);
});

test('released current revision is read-only but can start a new revision', () => {
  const payload = coreUtils.normalizePayload({
    bom: { P1: { code: 'P1', colors: [], color_info: {} } },
    manuals: { P1: [{ name: 'P1-S-A4-manual-V3.pdf' }] },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });
  const app = Object.create(BomApplication.prototype);
  app.mode = 'admin';
  app.state = {
    payload,
    currentSku: 'P1',
    selectedRevision: 'V3',
    dirty: false,
  };

  assert.equal(app.canEditProductRevision(), false);
  assert.equal(app.canCreateProductRevision?.(), true);
  assert.match(methodSource('bomActionsHtml'), /canCreateProductRevision/);
});

test('admin releases only the clean latest draft revision with a required reason', () => {
  const payload = coreUtils.normalizePayload({
    bom: {
      P1: { code: 'P1', colors: ['black'], color_info: { black: { materials: [] } } },
    },
    manuals: { P1: [{ name: 'P1-S-A4-manual-V3.pdf' }] },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
  });
  const app = Object.create(BomApplication.prototype);
  app.mode = 'admin';
  app.state = {
    payload,
    bom: payload.bom,
    currentSku: 'P1',
    currentColor: 'black',
    selectedRevision: 'V3',
    selectedMaterialId: '',
    selectedEntryId: '',
    editMode: false,
    dirty: false,
  };
  app.label = (key) => key;
  app.markDirty = () => { app.state.dirty = true; };
  app.renderAll = () => {};
  let status = null;
  app.setStatus = (message, state) => { status = { message, state }; };

  app.createProductRevisionFromPrompt = BomApplication.prototype.createProductRevisionFromPrompt;
  app.openPdmPrompt = (title, fields, onConfirm) => {
    onConfirm({ currentRevision: 'V3', revision: 'V3.1', changeReason: 'Reduce height by 10mm' });
  };
  app.createProductRevisionFromPrompt();
  app.state.dirty = false;

  assert.equal(app.canReleaseProductRevision?.(), true);
  app.mode = 'viewer';
  assert.equal(app.canReleaseProductRevision?.(), false);
  app.mode = 'admin';
  app.state.selectedRevision = 'V3';
  assert.equal(app.canReleaseProductRevision?.(), false);
  app.state.selectedRevision = 'V3.1';
  app.state.dirty = true;
  assert.equal(app.canReleaseProductRevision?.(), false);
  app.state.dirty = false;

  let releaseFields = [];
  app.openPdmPrompt = (title, fields, onConfirm) => {
    releaseFields = fields;
    onConfirm({ releaseReason: 'Approved for production' });
  };
  app.releaseProductRevisionFromPrompt?.();

  const [current, previous] = app.productRevisionOptions();
  assert.equal(releaseFields.find((field) => field.key === 'releaseReason')?.required, true);
  assert.equal(current.revision, 'V3.1');
  assert.equal(current.workflowState, 'released');
  assert.equal(current.effective, true);
  assert.equal(previous.revision, 'V3');
  assert.equal(previous.effective, false);
  assert.equal(app.state.dirty, true);
  assert.deepEqual(status, { message: 'revisionReleased', state: 'dirty' });
});

test('release command reports unsaved changes without opening the prompt', () => {
  const payload = coreUtils.normalizePayload({
    bom: { P1: { code: 'P1', revision: 'V3.1', colors: [], color_info: {} } },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
    productRevisions: {
      P1: {
        currentRevision: 'V3.1',
        effectiveRevision: 'V3',
        currentRevisionInfo: { sourceRevision: 'V3', workflowState: 'draft' },
        revisions: [{
          revision: 'V3',
          workflowState: 'released',
          snapshot: {
            product: { code: 'P1', revision: 'V3', colors: [], color_info: {} },
            materialDb: { version: 1, materials: {}, bomEntries: [] },
          },
        }],
      },
    },
  });
  const app = Object.create(BomApplication.prototype);
  app.mode = 'admin';
  app.state = { payload, currentSku: 'P1', selectedRevision: 'V3.1', dirty: true };
  app.label = (key) => key;
  let opened = false;
  app.openPdmPrompt = () => { opened = true; };
  let status = null;
  app.setStatus = (message, state) => { status = { message, state }; };

  app.releaseProductRevisionFromPrompt?.();

  assert.equal(opened, false);
  assert.deepEqual(status, { message: 'revisionReleaseDirtyBlocked', state: 'error' });
});
