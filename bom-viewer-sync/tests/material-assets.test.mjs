import assert from 'node:assert/strict';
import test from 'node:test';
import { updateMaterialRecord } from '../src/domain/materials.js';
import { coreUtils, BomApplication } from '../src/application.js';

test('save Material does not lose existing asset metadata', () => {
  const payload = {
    materialDb: {
      materials: {
        'mat-1': {
          id: 'mat-1',
          code: 'MAT-001',
          drawings: [
            {
              url: 'https://drive.google.com/file/d/123/view',
              name: 'Drawing 1',
              previewUrl: 'https://preview.url/1',
              sourceUrl: 'https://source.url/1',
              driveId: '123'
            }
          ],
          models3d: [
            {
              url: 'https://model.com/m.glb',
              name: 'Model 1',
              previewUrl: 'https://preview.url/2',
              sourceUrl: 'https://source.url/2'
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
  
  // mock selectedMaterialRecord
  app.selectedMaterialRecord = () => payload.materialDb.materials['mat-1'];
  app.queryAll = (sel) => {
    if (sel === '[data-material-master-edit]') return [];
    if (sel === '#drawings-container .material-asset-edit-row') {
      return [{
        querySelector: (q) => ({ value: q.includes('name') ? 'Updated Drawing' : 'https://drive.google.com/file/d/123/view' })
      }];
    }
    if (sel === '#models3d-container .material-asset-edit-row') {
      return [{
        querySelector: (q) => ({ value: q.includes('name') ? 'Updated Model' : 'https://model.com/m.glb' })
      }];
    }
    return [];
  };
  
  let markedDirty = false;
  app.markDirty = () => { markedDirty = true; };
  app.renderProductList = () => {};
  app.renderContent = () => {};
  app.renderInspector = () => {};
  app.setStatus = () => {};

  app.saveMaterialMaster();

  const record = payload.materialDb.materials['mat-1'];
  assert.equal(markedDirty, true);
  
  assert.equal(record.drawings.length, 1);
  assert.equal(record.drawings[0].name, 'Updated Drawing');
  assert.equal(record.drawings[0].previewUrl, 'https://preview.url/1');
  assert.equal(record.drawings[0].driveId, '123');

  assert.equal(record.models3d.length, 1);
  assert.equal(record.models3d[0].name, 'Updated Model');
  assert.equal(record.models3d[0].previewUrl, 'https://preview.url/2');
});

test('save Material rejects invalid URLs and duplicate URLs', () => {
  const payload = {
    materialDb: { materials: { 'mat-2': { id: 'mat-2' } }, bomEntries: [] }
  };
  const app = new BomApplication({ mode: 'admin' });
  app.state.payload = payload;
  app.state.materialDb = payload.materialDb;
  app.selectedMaterialRecord = () => payload.materialDb.materials['mat-2'];
  
  let statusMsg = '';
  app.setStatus = (msg, type) => { statusMsg = msg; };
  
  // 1. Invalid 2D URL
  app.queryAll = (sel) => {
    if (sel === '[data-material-master-edit]') return [];
    if (sel === '#drawings-container .material-asset-edit-row') {
      return [{ querySelector: (q) => ({ value: q.includes('name') ? 'D' : 'http://insecure.com' }) }];
    }
    return [];
  };
  app.saveMaterialMaster();
  assert.ok(statusMsg.includes(app.label('invalid2DUrl')));

  // 2. Invalid 3D URL
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

  // 3. Duplicate URLs
  app.queryAll = (sel) => {
    if (sel === '[data-material-master-edit]') return [];
    if (sel === '#models3d-container .material-asset-edit-row') {
      return [
        { querySelector: (q) => ({ value: q.includes('name') ? 'M1' : 'https://model.com/x.glb' }) },
        { querySelector: (q) => ({ value: q.includes('name') ? 'M2' : 'https://model.com/x.glb' }) }
      ];
    }
    return [];
  };
  app.saveMaterialMaster();
  assert.ok(statusMsg.includes(app.label('duplicateUrl')));
});
