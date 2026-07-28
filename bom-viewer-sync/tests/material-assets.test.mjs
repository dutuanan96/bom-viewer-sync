import assert from 'node:assert/strict';
import test from 'node:test';
import { updateMaterialRecord } from '../src/domain/materials.js';
import { coreUtils, BomApplication } from '../src/application.js';

function setupApp() {
  const payload = {
    materialDb: {
      materials: {
        'mat-1': {
          id: 'mat-1',
          code: 'MAT-001',
          name: { zh: 'Gốc', vi: 'Original' },
          models3d: [
            {
              path: 'models3d/original.glb',
              previewUrl: 'https://cdn.example.com/original.glb',
              name: 'Original Model',
              sourceUrl: 'original-source'
            }
          ]
        },
        'mat-2': {
          id: 'mat-2',
          code: 'MAT-002',
          name: { zh: 'Khác', vi: 'Other' },
          models3d: []
        }
      },
      bomEntries: []
    }
  };

  const app = new BomApplication({ mode: 'admin', config: { owner: 'test', repo: 'test', branch: 'main' } });
  app.state.payload = payload;
  app.state.materialDb = payload.materialDb;

  app.renderContent = () => {};
  app.renderProductList = () => {};
  app.renderInspector = () => {};
  app.renderFilterBar = () => {};
  app.markDirty = () => {};
  app.query = () => null;

  return { app, payload };
}

function pendingPdfFile() {
  const bytes = new TextEncoder().encode('%PDF-1.4\n');
  return {
    name: 'drawing final.pdf',
    type: 'application/pdf',
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
}

function localGlbFile() {
  const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0, 0, 0, 0]);
  return {
    name: 'replacement.glb',
    type: 'model/gltf-binary',
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
}

function configurePendingDrawingForm(app) {
  app.queryAll = (selector) => {
    if (selector.includes('[data-material-master-edit]')) return [];
    if (selector.includes('#drawings-container')) {
      return [{
        querySelector: (query) => ({
          value: query.includes('name')
            ? (app.state.materialDraft?.drawings?.[0]?.name || '')
            : (app.state.materialDraft?.drawings?.[0]?.url || '')
        })
      }];
    }
    if (selector.includes('#models3d-container')) {
      return [{
        querySelector: (query) => ({
          value: query.includes('name') ? 'Original Model' : 'https://cdn.example.com/original.glb'
        })
      }];
    }
    return [];
  };
}

test('selecting a PDF stages it immediately without a GitHub token or stored material mutation', async () => {
  const { app } = setupApp();
  let uploadCount = 0;
  app.githubAssetStorage = {
    async uploadAsset() {
      uploadCount += 1;
      return {};
    }
  };
  app.openMaterialMasterEditor('mat-1');
  app.state.materialDraft = structuredClone(app.state.materialDb.materials['mat-1']);
  app.state.materialDraft.drawings = [{ name: '', url: '', driveId: 'preserved-drive-id' }];
  configurePendingDrawingForm(app);
  app.setStatus = () => {};
  app.label = (key) => key;

  await app.handleMaterialAssetFileInput({
    dataset: { assetType: 'drawings', assetIndex: '0' },
    files: [pendingPdfFile()],
    value: 'selected'
  });

  const draftAsset = app.state.materialDraft.drawings[0];
  assert.equal(uploadCount, 0);
  assert.equal((app.state.materialDb.materials['mat-1'].drawings || []).length, 0);
  assert.equal(draftAsset.url, '');
  assert.equal(draftAsset.name, 'drawing final.pdf');
  assert.equal(draftAsset.driveId, 'preserved-drive-id');
  assert.match(draftAsset.pendingAssetId, /^assets\/pdfs\/MAT-001_[a-f0-9]{64}_drawing_final\.pdf$/);
  assert.equal(app.state.pendingMaterialAssets[draftAsset.pendingAssetId].bytes instanceof Uint8Array, true);
  assert.equal(app.state.materialAssetFeedback, null);
});

test('invalid local replacement preserves the existing asset and renders inline feedback', async () => {
  const { app } = setupApp();
  let status = null;
  let renderCount = 0;
  app.openMaterialMasterEditor('mat-1');
  app.state.materialDraft = structuredClone(app.state.materialDb.materials['mat-1']);
  app.state.materialDraft.drawings = [{ name: 'Existing', url: 'https://example.com/existing.pdf' }];
  configurePendingDrawingForm(app);
  app.label = (key) => key;
  app.setStatus = (message, state) => { status = { message, state }; };
  app.renderContent = () => { renderCount += 1; };

  await app.handleMaterialAssetFileInput({
    dataset: { assetType: 'drawings', assetIndex: '0' },
    files: [{
      name: 'not-a-pdf.txt',
      type: 'text/plain',
      size: 4,
      async arrayBuffer() {
        return new TextEncoder().encode('text').buffer;
      }
    }],
    value: 'selected'
  });

  assert.equal(app.state.materialDraft.drawings[0].url, 'https://example.com/existing.pdf');
  assert.deepEqual(app.state.materialAssetFeedback, {
    typeKey: 'drawings',
    index: 0,
    message: 'invalidPdfFile',
    state: 'error'
  });
  assert.deepEqual(status, { message: 'invalidPdfFile', state: 'error' });
  assert.equal(renderCount, 1);

  const html = app.materialMasterAssetList('2D', app.state.materialDraft.drawings);
  assert.match(html, /asset-inline-feedback error/);
  assert.match(html, /invalidPdfFile/);
});

test('Save Material commits a pending local reference without uploading', async () => {
  const { app } = setupApp();
  let uploadCount = 0;
  app.githubAssetStorage = {
    async uploadAsset() {
      uploadCount += 1;
      return {};
    }
  };
  app.openMaterialMasterEditor('mat-1');
  app.state.materialDraft = structuredClone(app.state.materialDb.materials['mat-1']);
  app.state.materialDraft.drawings = [{ name: '', url: '', sourceUrl: 'preserved-source' }];
  configurePendingDrawingForm(app);
  app.setStatus = () => {};
  app.label = (key) => key;

  await app.handleMaterialAssetFileInput({
    dataset: { assetType: 'drawings', assetIndex: '0' },
    files: [pendingPdfFile()],
    value: 'selected'
  });
  app.saveMaterialMaster();

  const saved = app.state.materialDb.materials['mat-1'].drawings[0];
  assert.equal(uploadCount, 0);
  assert.equal(saved.url, '');
  assert.equal(saved.sourceUrl, 'preserved-source');
  assert.match(saved.pendingAssetId, /^assets\/pdfs\//);
  assert.equal(app.state.materialDraft, null);
  assert.equal(app.state.pendingMaterialAssets[saved.pendingAssetId].originalName, 'drawing final.pdf');
});

test('Back discards the staged replacement and its pending bytes', async () => {
  const { app } = setupApp();
  let uploadCount = 0;
  app.githubAssetStorage = {
    async uploadAsset() {
      uploadCount += 1;
      return {};
    }
  };
  app.openMaterialMasterEditor('mat-1');
  app.state.materialDraft = structuredClone(app.state.materialDb.materials['mat-1']);
  app.state.materialDraft.drawings = [{ name: '', url: '' }];
  configurePendingDrawingForm(app);
  app.setStatus = () => {};
  app.label = (key) => key;

  await app.handleMaterialAssetFileInput({
    dataset: { assetType: 'drawings', assetIndex: '0' },
    files: [pendingPdfFile()],
    value: 'selected'
  });
  assert.equal(uploadCount, 0);
  assert.equal(Object.keys(app.state.pendingMaterialAssets).length, 1);

  app.backMaterialList();

  assert.equal(app.state.materialDraft, null);
  assert.deepEqual(app.state.pendingMaterialAssets, {});
});

test('selecting a local GLB stages a replacement while preserving the stored model', async () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');
  app.queryAll = (selector) => {
    if (selector.includes('[data-material-master-edit]')) return [];
    if (selector.includes('#models3d-container')) {
      return [{ querySelector: (query) => ({
        value: query.includes('name') ? 'Original Model' : 'https://cdn.example.com/original.glb'
      }) }];
    }
    if (selector.includes('#drawings-container')) return [];
    return [];
  };
  app.setStatus = () => {};

  await app.handleMaterialAssetFileInput({
    dataset: { assetType: 'models3d', assetIndex: '0' },
    files: [localGlbFile()],
    value: 'selected'
  });

  const draftModel = app.state.materialDraft.models3d[0];
  assert.equal(draftModel.url, '');
  assert.match(draftModel.pendingAssetId, /^assets\/models\/MAT-001_[a-f0-9]{64}_replacement\.glb$/);
  assert.equal(app.state.pendingMaterialAssets[draftModel.pendingAssetId].bytes instanceof Uint8Array, true);
  assert.equal(app.state.materialDb.materials['mat-1'].models3d[0].previewUrl, 'https://cdn.example.com/original.glb');
});

test('Material Master renders localized upload controls and a pending filename', () => {
  const { app } = setupApp();
  const pendingId = `assets/pdfs/MAT-001_${'a'.repeat(64)}_drawing.pdf`;
  app.label = (key) => key;
  app.state.pendingMaterialAssets = {
    [pendingId]: { originalName: 'drawing.pdf' }
  };
  app.state.materialDraft = {
    ...app.state.materialDb.materials['mat-1'],
    drawings: [{
      name: 'Drawing',
      url: '',
      path: 'legacy/drawing.pdf',
      pendingAssetId: pendingId
    }]
  };

  const drawingHtml = app.materialMasterAssetList('2D', []);
  const modelHtml = app.materialMasterAssetList('3D', app.state.materialDraft.models3d);

  assert.match(drawingHtml, /data-action="upload-asset-file"/);
  assert.match(drawingHtml, /data-asset-file-input/);
  assert.match(drawingHtml, /accept="\.pdf,application\/pdf"/);
  assert.match(drawingHtml, /asset-pending-upload/);
  assert.match(drawingHtml, /assetPendingUpload/);
  assert.match(drawingHtml, /drawing\.pdf/);
  assert.doesNotMatch(drawingHtml, /legacy\/drawing\.pdf/);
  assert.match(modelHtml, /accept="\.glb,\.gltf,model\/gltf-binary,model\/gltf\+json"/);
  assert.match(drawingHtml, />replaceAsset</);
  assert.match(drawingHtml, /data-action="select-existing-asset"/);
  assert.match(drawingHtml, />selectExistingAsset</);
});

test('Upload action opens only the hidden file input in its asset row', () => {
  const { app } = setupApp();
  let clickCount = 0;
  const input = { click: () => { clickCount += 1; } };
  const button = {
    closest: () => ({ querySelector: (selector) => selector === '[data-asset-file-input]' ? input : null })
  };

  app.openMaterialAssetFilePicker(button);

  assert.equal(clickCount, 1);
});

test('selecting an existing asset replaces only the current Material Draft reference', () => {
  const { app } = setupApp();
  const sharedModel = {
    name: 'Shared Model',
    url: 'https://cdn.example.com/shared.glb',
    previewUrl: 'https://cdn.example.com/shared.glb',
    sourceUrl: 'shared-source'
  };
  app.state.materialDb.materials['mat-2'].models3d = [sharedModel];
  app.openMaterialMasterEditor('mat-1');
  app.queryAll = (selector) => {
    if (selector.includes('[data-material-master-edit]')) return [];
    if (selector.includes('#models3d-container')) {
      return [{ querySelector: (query) => ({
        value: query.includes('name') ? 'Original Model' : 'https://cdn.example.com/original.glb'
      }) }];
    }
    if (selector.includes('#drawings-container')) return [];
    return [];
  };
  app.openMaterialAssetSelector = (typeKey, onSelect) => {
    assert.equal(typeKey, 'models3d');
    onSelect({ material: app.state.materialDb.materials['mat-2'], asset: sharedModel });
  };
  app.setStatus = () => {};

  app.selectExistingMaterialAsset({ dataset: { assetType: 'models3d', assetIndex: '0' } });

  assert.deepEqual(app.state.materialDraft.models3d[0], sharedModel);
  assert.notEqual(app.state.materialDraft.models3d[0], sharedModel);
  assert.equal(app.state.materialDb.materials['mat-1'].models3d[0].url, undefined);
  assert.equal(app.state.materialDb.materials['mat-2'].models3d[0].url, sharedModel.url);
});

test('Add asset does not add a second material asset or lose unsaved fields', () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');

  // Simulate user changing text input
  app.queryAll = (sel) => {
    if (sel.includes('[data-material-master-edit]')) {
      return [
        { dataset: { materialMasterEdit: 'code' }, value: 'MAT-001-DRAFT' },
        { dataset: { materialMasterEdit: 'name', lang: 'vi' }, value: 'Draft Name' }
      ];
    }
    if (sel.includes('#models3d-container')) {
      return [{ querySelector: (q) => ({ value: q.includes('name') ? 'Original Model' : 'https://cdn.example.com/original.glb' }) }];
    }
    if (sel.includes('#drawings-container')) {
      return [];
    }
    return [];
  };

  app.addMaterialAssetRow('models3d');

  assert.equal(app.state.materialDraft.code, 'MAT-001-DRAFT');
  assert.equal(app.state.materialDraft.name.vi, 'Draft Name');
  assert.equal(app.state.materialDraft.models3d.length, 1);
  assert.equal(app.state.materialDraft.models3d[0].url, 'https://cdn.example.com/original.glb');

  // DB remains untouched
  assert.equal(app.state.materialDb.materials['mat-1'].code, 'MAT-001');
  assert.equal(app.state.materialDb.materials['mat-1'].models3d.length, 1);
});

test('Material Master only renders an Add button when that asset type is empty', () => {
  const { app } = setupApp();
  app.label = (key) => key;
  app.state.materialDraft = structuredClone(app.state.materialDb.materials['mat-1']);
  app.state.materialDraft.drawings = [];

  const drawingHtml = app.materialMasterAssetList('2D', app.state.materialDraft.drawings);
  const modelHtml = app.materialMasterAssetList('3D', app.state.materialDraft.models3d);

  assert.match(drawingHtml, /data-action="add-2d-asset"/);
  assert.doesNotMatch(modelHtml, /data-action="add-3d-asset"/);
});

test('Delete asset does not lose unsaved Material Master fields or metadata', () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');

  app.queryAll = (sel) => {
    if (sel.includes('[data-material-master-edit]')) {
      return [
        { dataset: { materialMasterEdit: 'code' }, value: 'MAT-001-DRAFT' },
        { dataset: { materialMasterEdit: 'name', lang: 'vi' }, value: 'Draft Name' }
      ];
    }
    if (sel.includes('#models3d-container')) {
      return [
        { querySelector: (q) => ({ value: q.includes('name') ? 'Edited Model' : 'https://cdn.example.com/edited.glb' }) },
        { querySelector: (q) => ({ value: q.includes('name') ? 'Remove Me' : 'https://cdn.example.com/remove.glb' }) }
      ];
    }
    if (sel.includes('#drawings-container')) return [];
    return [];
  };

  app.deleteMaterialAssetRow({ dataset: { assetType: 'models3d', assetIndex: '1' } });

  assert.equal(app.state.materialDraft.code, 'MAT-001-DRAFT');
  assert.equal(app.state.materialDraft.name.vi, 'Draft Name');
  assert.equal(app.state.materialDraft.models3d.length, 1);
  assert.equal(app.state.materialDraft.models3d[0].url, 'https://cdn.example.com/edited.glb');
  assert.equal(app.state.materialDraft.models3d[0].sourceUrl, 'original-source');
  assert.equal(app.state.materialDb.materials['mat-1'].code, 'MAT-001');
  assert.equal(app.state.materialDb.materials['mat-1'].models3d.length, 1);
});

test('3D draft rerender prefers the edited URL over stale previewUrl metadata', () => {
  const { app } = setupApp();
  app.state.materialDraft = {
    ...app.state.materialDb.materials['mat-1'],
    models3d: [
      {
        ...app.state.materialDb.materials['mat-1'].models3d[0],
        url: 'https://cdn.example.com/edited.glb'
      }
    ]
  };

  const html = app.materialMasterAssetList('3D', app.state.materialDb.materials['mat-1'].models3d);

  assert.match(html, /https:\/\/cdn\.example\.com\/edited\.glb/);
  assert.doesNotMatch(html, /https:\/\/cdn\.example\.com\/original\.glb/);
});

test('Draft of material A doesn\'t leak into material B', () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');

  // Set draft
  app.state.materialDraft = { id: 'mat-1', code: 'DRAFT' };

  // Open B
  app.openMaterialMasterEditor('mat-2');
  assert.equal(app.state.materialDraft, null);
  assert.equal(app.selectedMaterialRecord().code, 'MAT-002');
});

test('Open uses just-typed URL and name', () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');

  app.queryAll = (sel) => {
    if (sel.includes('[data-material-master-edit]')) return [];
    if (sel.includes('#models3d-container')) {
      return [{ querySelector: (q) => ({ value: q.includes('name') ? 'Typed Name' : 'https://cdn.example.com/typed.glb' }) }];
    }
    if (sel.includes('#drawings-container')) return [];
    return [];
  };

  let modalArgs = null;
  app.showModel3dModal = (args, title) => { modalArgs = args; };

  app.openAsset({ dataset: { assetType: 'models3d', assetIndex: '0' } });

  assert.equal(modalArgs.previewUrl, 'https://cdn.example.com/typed.glb');
  assert.equal(modalArgs.name, 'Typed Name');
});

test('Silent refresh is blocked by draft', async () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');
  app.queryAll = (sel) => {
    if (sel.includes('[data-material-master-edit]')) {
      return [{ dataset: { materialMasterEdit: 'code' }, value: 'DRAFT' }];
    }
    if (sel.includes('#models3d-container')) {
      return [{ querySelector: (q) => ({ value: q.includes('name') ? 'Original Model' : 'https://cdn.example.com/original.glb' }) }];
    }
    if (sel.includes('#drawings-container')) return [];
    return [];
  };
  app.syncMaterialMasterFormToDraft();

  app.githubData = { loadPublic: async () => ({}) };
  const loaded = await app.loadCloud({ silent: true });
  assert.equal(loaded, false);
});

test('Back/module switch destroys draft', () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');
  app.state.materialDraft = { id: 'mat-1', code: 'DRAFT' };

  app.backMaterialList();
  assert.equal(app.state.materialDraft, null);

  app.openMaterialMasterEditor('mat-1');
  app.state.materialDraft = { id: 'mat-1', code: 'DRAFT' };
  app.openModuleView('bom');
  assert.equal(app.state.materialDraft, null);
});

test('Save preserves metadata and updates previewUrl', () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');

  app.queryAll = (sel) => {
    if (sel.includes('[data-material-master-edit]')) return [];
    if (sel.includes('#models3d-container')) {
      return [{ querySelector: (q) => ({ value: q.includes('name') ? 'Typed Name' : 'https://cdn.example.com/typed.glb' }) }];
    }
    if (sel.includes('#drawings-container')) return [];
    return [];
  };

  app.setStatus = () => {};
  app.isAdmin = () => true;

  app.saveMaterialMaster();

  const saved = app.state.materialDb.materials['mat-1'].models3d[0];
  assert.equal(saved.url, 'https://cdn.example.com/typed.glb');
  assert.equal(saved.previewUrl, 'https://cdn.example.com/typed.glb');
  assert.equal(saved.name, 'Typed Name');
  assert.equal(saved.sourceUrl, 'original-source'); // Preserved metadata
  assert.equal(app.state.materialDraft, null);
});

test('Invalid URL is blocked', () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');

  app.queryAll = (sel) => {
    if (sel.includes('[data-material-master-edit]')) return [];
    if (sel.includes('#models3d-container')) {
      return [
        { querySelector: (q) => ({ value: q.includes('name') ? 'N1' : 'invalid-url' }) }
      ];
    }
    if (sel.includes('#drawings-container')) return [];
    return [];
  };

  let statusMsg = '';
  let statusState = '';
  app.setStatus = (msg, st) => { statusMsg = msg; statusState = st; };
  app.label = (key) => key;
  app.isAdmin = () => true;

  app.saveMaterialMaster();

  assert.equal(statusState, 'error');
  assert.equal(statusMsg, 'invalid3DUrl');
});

test('Save collapses legacy multiple material assets to the first asset', () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');

  app.queryAll = (sel) => {
    if (sel.includes('[data-material-master-edit]')) return [];
    if (sel.includes('#models3d-container')) {
      return [
        { querySelector: (q) => ({ value: q.includes('name') ? 'N1' : 'https://example.com/valid.glb' }) },
        { querySelector: (q) => ({ value: q.includes('name') ? 'N2' : 'https://example.com/valid.glb' }) }
      ];
    }
    if (sel.includes('#drawings-container')) return [];
    return [];
  };

  let statusMsg = '';
  let statusState = '';
  app.setStatus = (msg, st) => { statusMsg = msg; statusState = st; };
  app.label = (key) => key;

  app.saveMaterialMaster();

  assert.equal(statusState, 'dirty');
  assert.equal(statusMsg, 'saveLocalOnly');
  assert.equal(app.state.materialDb.materials['mat-1'].models3d.length, 1);
  assert.equal(app.state.materialDb.materials['mat-1'].models3d[0].name, 'N1');
});

test('Blank asset URL blocks save and leaves the database unchanged', () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');

  app.queryAll = (sel) => {
    if (sel.includes('[data-material-master-edit]')) return [];
    if (sel.includes('#models3d-container')) {
      return [
        { querySelector: (q) => ({ value: q.includes('name') ? 'Missing URL' : '' }) }
      ];
    }
    if (sel.includes('#drawings-container')) return [];
    return [];
  };

  let statusMsg = '';
  let statusState = '';
  app.setStatus = (msg, st) => { statusMsg = msg; statusState = st; };
  app.label = (key) => key;

  app.saveMaterialMaster();

  assert.equal(statusState, 'error');
  assert.equal(statusMsg, 'invalid3DUrl');
  assert.equal(app.state.materialDb.materials['mat-1'].models3d.length, 1);
  assert.equal(app.state.materialDb.materials['mat-1'].models3d[0].previewUrl, 'https://cdn.example.com/original.glb');
});
