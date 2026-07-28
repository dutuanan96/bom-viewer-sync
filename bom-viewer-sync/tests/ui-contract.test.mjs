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

test('BOM table keeps material master data read-only and gates relationship actions behind edit mode', () => {
  const bomActionsHtml = methodSource('bomActionsHtml');
  const toolbarHtml = methodSource('toolbarHtml');
  const rowHtml = methodSource('rowHtml');
  const partNumberCellHtml = methodSource('partNumberCellHtml');
  const componentNumberCellHtml = methodSource('componentNumberCellHtml');
  const cellHtml = methodSource('cellHtml');
  const drawingCellHtml = methodSource('drawingCellHtml');
  const model3dCellHtml = methodSource('model3dCellHtml');

  assert.match(appSource, /data-edit-bom-material=/);
  assert.match(appSource, /bomActionsHtml/);
  assert.match(bomActionsHtml, /this\.label\('materialDatabase'\)/);
  assert.match(rowHtml, /this\.label\('editBomMaterial'\)/);
  assert.match(rowHtml, /class="bom-row-actions"/);
  assert.doesNotMatch(toolbarHtml, /adminActionsHtml\(\)/);
  assert.match(rowHtml, /this\.canEditProductRevision\(\) && this\.state\.editMode/);
  for (const readOnlyCell of [
    partNumberCellHtml,
    componentNumberCellHtml,
    cellHtml,
    drawingCellHtml,
    model3dCellHtml,
  ]) {
    assert.doesNotMatch(readOnlyCell, /data-edit-field|data-delete-drawing-row|data-delete-model3d-row/);
  }
});

test('BOM toolbar exposes edit first and add material only after edit mode is enabled', () => {
  const context = {
    state: { dirty: false, editMode: false },
    label: (key) => key,
    canCreateProductRevision: () => false,
    canWithdrawProductRevision: () => false,
    canEditProductRevision: () => true,
  };

  const readHtml = bomViewMethods.bomActionsHtml.call(context);
  assert.match(readHtml, /data-action="toggle-edit"/);
  assert.doesNotMatch(readHtml, /data-action="add-bom-row"/);

  context.state.editMode = true;
  const editHtml = bomViewMethods.bomActionsHtml.call(context);
  assert.match(editHtml, /data-action="toggle-edit"/);
  assert.match(editHtml, /data-action="add-bom-row"/);
});

test('Material Database edit action is explicit and compact', () => {
  const app = Object.create(BomApplication.prototype);
  app.state = { lang: 'zh' };

  assert.equal(app.label('editMaterial'), '\u7f16\u8f91');
  assert.equal(app.label('editBomMaterial'), '\u7f16\u8f91\u7269\u6599');
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
    'replaceAsset',
    'selectExistingAsset',
    'selectExisting2D',
    'selectExisting3D',
    'assetUploaded',
    'assetTokenRequired',
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
  assert.match(appSource, /data-action="select-existing-asset"/);
  assert.match(appSource, /data-asset-file-input/);
  assert.match(appSource, /this\.label\('uploadAsset'\)/);
  assert.match(appSource, /this\.handleMaterialAssetFileInput\(input\)/);
  assert.match(appSource, /this\.openMaterialAssetFilePicker\(actionElement\)/);
  assert.match(appSource, /this\.selectExistingMaterialAsset\(actionElement\)/);
  assert.match(appSource, /openMaterialAssetSelector/);
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

test('all Admin toolbar sources own dirty save, View Changes, and discard actions directly', () => {
  const context = {
    state: { adminView: 'bom', editMode: false, selectedParentId: null },
    label: (key) => key,
    canCreateProductRevision: () => false,
    canWithdrawProductRevision: () => false,
    canEditProductRevision: () => false,
  };
  const toolbarSurfaces = [
    bomViewMethods.bomActionsHtml.call(context),
    bomViewMethods.adminActionsHtml.call(context),
    materialViewMethods.materialDbActionsHtml.call(context),
    structureViewMethods.structureActionsHtml.call(context),
  ];

  for (const toolbarHtml of toolbarSurfaces) {
    for (const action of ['save', 'view-changes', 'discard']) {
      assert.match(
        toolbarHtml,
        new RegExp(`<button[^>]*data-dirty-action[^>]*data-action="${action}"[^>]*>`),
      );
    }
    assert.equal(toolbarHtml.match(/data-action="view-changes"/g)?.length, 1);
  }

  assert.doesNotMatch(appSource, /MutationObserver|observeDirtyActions|changePreviewActionHtml/);
});

test('Admin dirty action visibility uses existing toolbar markup only', () => {
  const actions = [{ hidden: false }, { hidden: false }, { hidden: false }];

  const app = new BomApplication({ mode: 'admin', githubData: {}, githubAssetStorage: {} });
  app.queryAll = (selector) => selector === '[data-dirty-action]' ? actions : [];

  assert.equal(typeof app.syncDirtyVisibility, 'function');

  app.state.dirty = false;
  app.syncDirtyVisibility();
  assert.equal(actions.every((action) => action.hidden), true);

  app.state.dirty = true;
  app.syncDirtyVisibility();
  assert.equal(actions.every((action) => !action.hidden), true);
});

test('Admin change preview modal manages focus and its temporary Escape listener', () => {
  let inserted = false;
  let overlayRemoved = 0;
  let closeFocused = 0;
  let triggerFocused = 0;
  const documentListeners = new Map();
  const closeButton = {
    addEventListener() {},
    focus() { closeFocused += 1; },
  };
  const overlay = {
    addEventListener() {},
    querySelector(selector) {
      assert.equal(selector, '[data-close-diff]');
      return closeButton;
    },
    remove() { overlayRemoved += 1; },
  };
  const documentStub = {
    body: {
      insertAdjacentHTML(position) {
        assert.equal(position, 'beforeend');
        inserted = true;
      },
    },
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (documentListeners.get(type) === listener) documentListeners.delete(type);
    },
  };
  const trigger = { focus() { triggerFocused += 1; } };
  const context = {
    query(selector) {
      assert.equal(selector, '#diffModalOverlay');
      return inserted ? overlay : null;
    },
    changePreviewHtml: () => '<div>preview</div>',
  };
  const originalDocument = globalThis.document;

  globalThis.document = documentStub;
  try {
    sharedViewMethods.showDiffModal.call(context, trigger);

    assert.equal(closeFocused, 1);
    assert.equal(typeof documentListeners.get('keydown'), 'function');

    documentListeners.get('keydown')({ key: 'Escape' });

    assert.equal(overlayRemoved, 1);
    assert.equal(documentListeners.has('keydown'), false);
    assert.equal(triggerFocused, 1);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
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

test('unsaved BOM replacements survive navigation across multiple products', async () => {
  assert.doesNotMatch(appSource, /switchProductWithWarning/);
  const payload = coreUtils.normalizePayload({
    bom: {
      P1: { code: 'P1', colors: ['black'], color_info: { black: { materials: [] } } },
      P2: { code: 'P2', colors: ['black'], color_info: { black: { materials: [] } } },
    },
    materialDb: {
      version: 1,
      materials: {
        old1: { id: 'old1', code: 'OLD-1', name: { zh: 'Old 1', vi: 'Old 1' } },
        old2: { id: 'old2', code: 'OLD-2', name: { zh: 'Old 2', vi: 'Old 2' } },
        new1: { id: 'new1', code: 'NEW-1', name: { zh: 'New 1', vi: 'New 1' } },
        new2: { id: 'new2', code: 'NEW-2', name: { zh: 'New 2', vi: 'New 2' } },
      },
      bomEntries: [
        { id: 'entry-p1', parentType: 'product', parentId: 'P1', productCode: 'P1', color: 'black', materialId: 'old1', qty: '1' },
        { id: 'entry-p2', parentType: 'product', parentId: 'P2', productCode: 'P2', color: 'black', materialId: 'old2', qty: '1' },
      ],
    },
    productRevisions: {
      P1: { currentRevision: 'V1.1', currentRevisionInfo: { sourceRevision: 'V1', workflowState: 'draft' }, revisions: [] },
      P2: { currentRevision: 'V2.1', currentRevisionInfo: { sourceRevision: 'V2', workflowState: 'draft' }, revisions: [] },
    },
  });
  const app = Object.create(BomApplication.prototype);
  app.mode = 'admin';
  app.state = {
    payload,
    bom: payload.bom,
    materialDb: payload.materialDb,
    currentSku: 'P1',
    currentColor: 'black',
    selectedRevision: '',
    selectedMaterialId: '',
    selectedEntryId: '',
    materialDraft: null,
    dirty: false,
  };
  app.markDirty = () => { app.state.dirty = true; };
  app.renderProductList = () => {};
  app.renderFilterBar = () => {};
  app.renderContent = () => {};
  app.renderInspector = () => {};
  app.prunePendingMaterialAssets = () => {};
  app._clearSearchBar = () => {};

  let replacementId = 'new1';
  app.openMaterialSelector = (_title, onSelect) => {
    onSelect(app.state.payload.materialDb.materials[replacementId]);
  };

  app.state.lastRows = app.bomRows();
  app.startReplaceBomRow(0);
  app.selectProduct('P2');
  replacementId = 'new2';
  app.state.lastRows = app.bomRows();
  app.startReplaceBomRow(0);
  app.selectProduct('P1');

  assert.equal(app.bomRows()[0]._materialId, 'new1');
  assert.equal(app.bomRows('P2', 'black')[0]._materialId, 'new2');
  assert.equal(app.state.dirty, true);
  assert.equal(app.state.materialDb, app.state.payload.materialDb);

  let cloudLoads = 0;
  app.githubData = { loadPublic: async () => { cloudLoads += 1; return payload; } };
  assert.equal(await app.loadCloud({ silent: true }), false);
  assert.equal(cloudLoads, 0);
});

test('edit row updates only the selected BOM entry and uses the localized title', () => {
  const payload = coreUtils.normalizePayload({
    bom: { P1: { code: 'P1', colors: ['black'], color_info: { black: { materials: [] } } } },
    materialDb: {
      version: 1,
      materials: { mat1: { id: 'mat1', code: 'MAT-1', name: { zh: 'Material', vi: 'Material' } } },
      bomEntries: [{ id: 'entry-p1', parentType: 'product', parentId: 'P1', productCode: 'P1', color: 'black', materialId: 'mat1', comp_code: 'A', qty: '1' }],
    },
    productRevisions: {
      P1: { currentRevision: 'V1.1', currentRevisionInfo: { sourceRevision: 'V1', workflowState: 'draft' }, revisions: [] },
    },
  });
  const app = Object.create(BomApplication.prototype);
  app.mode = 'admin';
  app.state = {
    payload,
    materialDb: payload.materialDb,
    currentSku: 'P1',
    currentColor: 'black',
    selectedRevision: '',
    dirty: false,
  };
  app.state.lastRows = app.bomRows();
  app.label = (key) => key;
  app.markDirty = () => { app.state.dirty = true; };
  app.renderContent = () => {};
  let status = null;
  app.setStatus = (message, type) => { status = { message, type }; };
  let promptTitle = null;
  app.openPdmPrompt = (title, _fields, onConfirm) => {
    promptTitle = title;
    onConfirm({ comp_code: 'B', qty: '3' });
  };

  app.editBomRowFromPrompt(0);

  assert.equal(promptTitle, 'editRow');
  assert.equal(payload.materialDb.bomEntries[0].comp_code, 'B');
  assert.equal(payload.materialDb.bomEntries[0].qty, '3');
  assert.equal(app.state.dirty, true);
  assert.deepEqual(status, { message: 'bomRowUpdated', type: 'dirty' });
});

test('BOM row update boundary rejects material master fields', () => {
  const app = Object.create(BomApplication.prototype);
  const material = { _materialId: 'mat1', _entryId: 'entry1', name: 'Original' };
  app.state = {
    lastRows: [material],
    materialDb: {
      materials: { mat1: { id: 'mat1', name: { zh: 'Original' } } },
      bomEntries: [{ id: 'entry1', materialId: 'mat1', comp_code: 'A', qty: '1' }],
    },
    payload: {},
  };
  let dirty = false;
  app.markDirty = () => { dirty = true; };
  app.renderInspector = () => {};

  app.updateMaterial(0, 'name', 'Changed from BOM');

  assert.equal(app.state.materialDb.materials.mat1.name.zh, 'Original');
  assert.equal(dirty, false);
});

test('admin can withdraw a released product while another draft change is pending', () => {
  const payload = coreUtils.normalizePayload({
    bom: { P2: { code: 'P2', revision: 'V2', colors: [], color_info: {} } },
    materialDb: { version: 1, materials: {}, bomEntries: [] },
    productRevisions: {
      P2: {
        currentRevision: 'V2',
        effectiveRevision: 'V2',
        currentRevisionInfo: { sourceRevision: 'V1', workflowState: 'released' },
        revisions: [{
          revision: 'V1',
          workflowState: 'released',
          snapshot: { product: { code: 'P2', revision: 'V1', colors: [], color_info: {} }, materialDb: { version: 1, materials: {}, bomEntries: [] } },
        }],
        effectivityEvents: [{ id: 'release-v2', action: 'release', revision: 'V2', previousRevision: 'V1' }],
      },
    },
  });
  const app = Object.create(BomApplication.prototype);
  app.mode = 'admin';
  app.state = { payload, currentSku: 'P2', selectedRevision: 'V2', dirty: true };
  app.label = (key) => key;
  app.markDirty = () => { app.state.dirty = true; };
  app.renderAll = () => {};
  app.openPdmPrompt = (_title, _fields, onConfirm) => onConfirm({ withdrawReason: 'Correction required' });
  let status = null;
  app.setStatus = (message, state) => { status = { message, state }; };

  app.withdrawProductRevisionFromPrompt();

  const [current, previous] = app.productRevisionOptions();
  assert.equal(current.workflowState, 'draft');
  assert.equal(current.effective, false);
  assert.equal(previous.revision, 'V1');
  assert.equal(previous.effective, true);
  assert.equal(app.state.dirty, true);
  assert.deepEqual(status, { message: 'revisionWithdrawn', state: 'dirty' });
});
