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

test('Add/Delete asset does not lose unsaved Material Master fields', () => {
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
  app.state.materialDraft = { id: 'mat-1', code: 'DRAFT' };

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
});

test('Invalid URL and duplicate URL blocked', () => {
  const { app } = setupApp();
  app.openMaterialMasterEditor('mat-1');

  app.queryAll = (sel) => {
    if (sel.includes('[data-material-master-edit]')) return [];
    if (sel.includes('#models3d-container')) {
      return [
        { querySelector: (q) => ({ value: q.includes('name') ? 'N1' : 'invalid-url' }) },
        { querySelector: (q) => ({ value: q.includes('name') ? 'N2' : 'https://example.com/valid.glb' }) },
        { querySelector: (q) => ({ value: q.includes('name') ? 'N3' : 'https://example.com/valid.glb' }) }
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
  // First it finds invalid3DUrl, then duplicateUrl
  assert.ok(statusMsg === 'invalid3DUrl' || statusMsg === 'duplicateUrl');
});
