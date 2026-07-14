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

  const app = new BomApplication({ mode: 'admin' });
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

function configurePendingDrawingForm(app) {
  app.queryAll = (selector) => {
    if (selector.includes('[data-material-master-edit]')) return [];
    if (selector.includes('#drawings-container')) {
      return [{
        querySelector: (query) => ({ value: query.includes('name') ? '' : '' })
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

test('selecting a PDF stages bytes in the draft without uploading or mutating the database', async () => {
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
  assert.equal(Object.keys(app.state.pendingMaterialAssets).length, 1);
  assert.equal(app.state.pendingMaterialAssets[draftAsset.pendingAssetId].bytes instanceof Uint8Array, true);
});

test('Save Material commits a pending reference locally without uploading', async () => {
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

test('Back discards unreferenced staged bytes with the Material Draft', async () => {
  const { app } = setupApp();
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
  assert.equal(Object.keys(app.state.pendingMaterialAssets).length, 1);

  app.backMaterialList();

  assert.equal(app.state.materialDraft, null);
  assert.deepEqual(app.state.pendingMaterialAssets, {});
});

test('Add asset does not lose unsaved Material Master fields', () => {
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
  assert.equal(app.state.materialDraft.models3d.length, 2);

  // DB remains untouched
  assert.equal(app.state.materialDb.materials['mat-1'].code, 'MAT-001');
  assert.equal(app.state.materialDb.materials['mat-1'].models3d.length, 1);
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

test('Duplicate URL is blocked independently from URL format validation', () => {
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

  assert.equal(statusState, 'error');
  assert.equal(statusMsg, 'duplicateUrl');
});

test('Blank asset URL blocks save and leaves the database unchanged', () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');

  app.queryAll = (sel) => {
    if (sel.includes('[data-material-master-edit]')) return [];
    if (sel.includes('#models3d-container')) {
      return [
        { querySelector: (q) => ({ value: q.includes('name') ? 'Original Model' : 'https://cdn.example.com/original.glb' }) },
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
