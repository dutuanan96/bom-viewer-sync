import assert from 'node:assert/strict';
import test from 'node:test';
import { updateMaterialRecord } from '../src/domain/materials.js';
import { coreUtils, BomApplication } from '../src/application.js';

test('Draft state protects real record and Back discards it', () => {
  const payload = {
    materialDb: {
      materials: {
        'mat-1': {
          id: 'mat-1',
          code: 'MAT-001',
          models3d: [
            {
              path: 'models3d/original.glb',
              previewUrl: 'https://cdn.example.com/original.glb',
              name: 'Original Model'
            }
          ]
        }
      },
      bomEntries: []
    }
  };

  const app = new BomApplication({ mode: 'admin' });
  app.state.payload = payload;
  app.state.materialDb = payload.materialDb;

  app.selectedMaterialRecord = () => app.state.materialDb.materials['mat-1'];

  app.renderContent = () => {};
  app.renderProductList = () => {};
  app.renderInspector = () => {};
  app.renderFilterBar = () => {};
  app.markDirty = () => {};

  app.queryAll = (sel) => {
    if (sel.includes('#models3d-container')) {
      return [{ querySelector: (q) => ({ value: q.includes('name') ? 'Original Model' : 'https://cdn.example.com/original.glb' }) }];
    }
    return [];
  };

  // Fake add asset row
  app.addMaterialAssetRow('models3d');

  // Validate draft is updated but real record is not
  assert.equal(app.state.materialAssetDraft.models3d.length, 2);
  assert.equal(app.state.materialDb.materials['mat-1'].models3d.length, 1);

  // Fake "Back"
  app.backMaterialList();
  assert.equal(app.state.materialAssetDraft, null);
  assert.equal(app.state.selectedMaterialId, '');
});

test('Save material commits draft and updates previewUrl for 3D', () => {
  const payload = {
    materialDb: {
      materials: {
        'mat-2': {
          id: 'mat-2',
          code: 'MAT-002',
          models3d: [
            {
              path: 'models3d/old.glb',
              previewUrl: 'https://cdn.example.com/old.glb',
              name: 'Old Model'
            }
          ]
        }
      },
      bomEntries: []
    }
  };

  const app = new BomApplication({ mode: 'admin' });
  app.state.payload = payload;
  app.state.materialDb = payload.materialDb;
  app.selectedMaterialRecord = () => payload.materialDb.materials['mat-2'];

  app.renderContent = () => {};
  app.renderProductList = () => {};
  app.renderInspector = () => {};
  app.setStatus = () => {};
  app.markDirty = () => {};

  app.queryAll = (sel) => {
    if (sel === '[data-material-master-edit]') return [];
    if (sel === '#drawings-container .material-asset-edit-row') return [];
    if (sel === '#models3d-container .material-asset-edit-row') {
      return [{
        querySelector: (q) => ({ value: q.includes('name') ? 'New Model' : 'https://cdn.example.com/new.glb?q=123' })
      }];
    }
    return [];
  };

  app.syncMaterialMasterFormToDraft();

  app.saveMaterialMaster();

  const record = payload.materialDb.materials['mat-2'];
  assert.equal(record.models3d.length, 1);
  assert.equal(record.models3d[0].name, 'New Model');
  assert.equal(record.models3d[0].previewUrl, 'https://cdn.example.com/new.glb?q=123'); // Updated previewUrl
  assert.equal(record.models3d[0].path, 'models3d/old.glb'); // Path is preserved

  // Draft should be nullified
  assert.equal(app.state.materialAssetDraft, null);
});

test('save Material rejects invalid URLs (native URL parsing)', () => {
  const payload = {
    materialDb: { materials: { 'mat-3': { id: 'mat-3', code: 'MAT-3', drawings: [], models3d: [] } }, bomEntries: [] }
  };
  const app = new BomApplication({ mode: 'admin' });
  app.state.payload = payload;
  app.state.materialDb = payload.materialDb;
  app.selectedMaterialRecord = () => payload.materialDb.materials['mat-3'];

  let statusMsg = '';
  app.setStatus = (msg, type) => { statusMsg = msg; };

  // 1. Invalid 2D URL (bad scheme)
  app.state.materialAssetDraft = { drawings: [], models3d: [] };
  app.queryAll = (sel) => {
    if (sel === '[data-material-master-edit]') return [];
    if (sel === '#drawings-container .material-asset-edit-row') {
      return [{ querySelector: (q) => ({ value: q.includes('name') ? 'D' : 'http://drive.google.com/test' }) }]; // HTTP instead of HTTPS
    }
    return [];
  };
  app.saveMaterialMaster();
  assert.ok(statusMsg.includes(app.label('invalid2DUrl')));

  // 2. Invalid 3D URL (drive is disallowed for 3D)
  app.state.materialAssetDraft = { drawings: [], models3d: [] };
  app.queryAll = (sel) => {
    if (sel === '[data-material-master-edit]') return [];
    if (sel === '#drawings-container .material-asset-edit-row') return [];
    if (sel === '#models3d-container .material-asset-edit-row') {
      return [{ querySelector: (q) => ({ value: q.includes('name') ? 'M' : 'https://drive.google.com/file' }) }];
    }
    return [];
  };
  app.saveMaterialMaster();
  assert.ok(statusMsg.includes(app.label('invalid3DUrl')));
});
