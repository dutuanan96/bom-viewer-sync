import assert from 'node:assert/strict';
import test from 'node:test';
import { assetDisplayUrl, driveFileId, findBomAssets, pdfFrameUrl } from '../src/infrastructure/assets.js';
import { appendNotificationEvent, describePayloadChanges } from '../src/features/notifications.js';
import { BomApplication, coreUtils } from '../src/application.js';
import { sharedViewMethods } from '../src/ui/shared-view.js';

const { normalizePayload } = coreUtils;

test('asset matching remains color-neutral and Drive-aware', () => {
  const assets = findBomAssets({ 'abc123bh|panel': [{ name: 'panel.pdf' }] }, {
    mat_code: 'ABC123WH',
    name_zh: 'Panel',
  });
  assert.equal(assets[0].name, 'panel.pdf');
  assert.equal(driveFileId('https://drive.google.com/file/d/file-id/view'), 'file-id');
  assert.equal(pdfFrameUrl('https://drive.google.com/file/d/file-id/view'), 'https://drive.google.com/file/d/file-id/preview');
  assert.equal(pdfFrameUrl('https://example.test/drawing'), 'https://mozilla.github.io/pdf.js/web/viewer.html?file=https%3A%2F%2Fexample.test%2Fdrawing');
  assert.match(assetDisplayUrl({ driveId: 'file-id' }, { protocol: 'file:', hostname: '' }), /thumbnail\?id=file-id/);
});

test('material diffs become persistent GitHub-save notifications', () => {
  const previous = normalizePayload({
    bom: {},
    materialDb: { materials: { m1: { id: 'm1', code: 'M1', name: { zh: 'Old name' } } }, bomEntries: [] },
  });
  const next = structuredClone(previous);
  next.materialDb.materials.m1.name.zh = 'New name';
  const changes = describePayloadChanges(previous, next);
  const updated = appendNotificationEvent(next, {
    id: 'notification-1',
    type: 'github-save',
    actor: 'admin',
    createdAt: '2026-07-11T00:00:00.000Z',
    changes,
  });
  assert.deepEqual(changes.map(({ code, field }) => ({ code, field })), [{ code: 'M1', field: 'name' }]);
  assert.equal(updated.notifications[0].id, 'notification-1');
});

test('notification body renders normalized material changes', () => {
  const app = Object.create(BomApplication.prototype);
  app.state = { lang: 'zh' };

  const body = app.notificationBody({
    type: 'github-save',
    changes: [{ kind: 'material', code: 'M1', field: 'name', before: 'Old', after: 'New' }],
  });

  assert.match(body, /M1/);
  assert.match(body, /Old/);
  assert.match(body, /New/);
});

test('notification body summarizes asset changes without exposing source URLs', () => {
  const app = Object.create(BomApplication.prototype);
  app.state = { lang: 'zh' };

  const body = app.notificationBody({
    type: 'github-save',
    changes: [{
      kind: 'material',
      code: 'M1',
      field: 'drawings',
      before: '',
      after: 'drawing.pdf|https://cdn.example.test/assets/pdfs/a-very-long-file-name',
    }],
  });

  assert.match(body, /M1/);
  assert.doesNotMatch(body, /https:\/\//);
});

test('3D material preview applies a consistent studio material appearance', () => {
  const calls = [];
  let onLoad;
  const modelViewer = {
    hidden: true,
    model: {
      materials: [{
        pbrMetallicRoughness: {
          setBaseColorFactor: (value) => calls.push(['color', value]),
          setMetallicFactor: (value) => calls.push(['metallic', value]),
          setRoughnessFactor: (value) => calls.push(['roughness', value]),
        },
      }],
    },
    addEventListener: (_name, handler) => { onLoad = handler; },
    setAttribute: (name) => { if (name === 'src') onLoad(); },
  };
  const frame = { hidden: false };
  const app = {
    ensureModelViewer: () => modelViewer,
    query: (selector) => ({
      '#pdfFrame': frame,
      '#pdfModalTitle': {},
      '#pdfModalSubtitle': {},
      '#pdfOpenLink': {},
      '#pdfModal': { classList: { add: () => {} } },
    })[selector],
  };

  sharedViewMethods.showModel3dModal.call(app, { url: 'https://example.test/model.glb' }, '3D');

  assert.deepEqual(calls, [
    ['color', [0.48, 0.63, 0.76, 1]],
    ['metallic', 0.58],
    ['roughness', 0.32],
  ]);
});

test('notification body identifies BOM edits and material replacements', () => {
  const app = Object.create(BomApplication.prototype);
  app.state = { lang: 'zh' };

  const body = app.notificationBody({
    type: 'github-save',
    changes: [
      { kind: 'bom_comp_code_changed', code: 'P1', field: 'M1', before: 'A', after: 'B' },
      { kind: 'bom_material_changed', code: 'P1', before: 'M1', after: 'M2' }
    ],
  });

  assert.match(body, /P1/);
  assert.match(body, /A/);
  assert.match(body, /B/);
  assert.match(body, /M1/);
  assert.match(body, /M2/);
});

test('Admin creation flows assign stable IDs and create their records', () => {
  const app = Object.create(BomApplication.prototype);
  const materialDb = {
    materials: {
      parent: { id: 'parent', code: 'PARENT', name: { zh: 'Parent' } },
      child: { id: 'child', code: 'CHILD', name: { zh: 'Child' } },
    },
    bomEntries: [],
  };
  app.mode = 'admin';
  app.state = {
    lang: 'zh',
    selectedParentId: 'parent',
    currentSku: 'P1',
    currentColor: 'black',
    materialDb,
    payload: {
      bom: { P1: { code: 'P1', colors: ['black'], color_info: { black: { materials: [] } } } },
      materialDb,
      productRevisions: {
        P1: {
          currentRevision: 'V1',
          currentRevisionInfo: { workflowState: 'draft' },
          revisions: [],
        },
      },
    },
    adminView: 'bom',
    selectedRevision: 'V1',
    selectedMaterialId: '',
  };
  app.openMaterialSelector = (_title, select) => select(materialDb.materials.child);
  app.openPdmPrompt = (_title, _fields, submit) => submit({ comp_code: 'COMP-1', qty: '2' });
  app.markDirty = () => {};
  app.renderStructureDetail = () => {};
  app.renderProductList = () => {};
  app.renderFilterBar = () => {};
  app.renderContent = () => {};
  app.renderInspector = () => {};

  app.addChildMaterialFromPrompt();
  const childEntry = materialDb.bomEntries.find((entry) => entry.parentType === 'material');
  assert.match(childEntry.id, /^bomc_/);
  assert.equal(childEntry.childMaterialId, 'child');

  app.addBomRowFromPrompt();
  const productEntry = materialDb.bomEntries.find((entry) => entry.parentType === 'product');
  assert.match(productEntry.id, /^bom_/);
  assert.equal(productEntry.materialId, 'child');
  assert.equal(productEntry.comp_code, 'COMP-1');

  app.addDatabaseMaterial();
  assert.match(app.state.materialDraft.id, /^mat_/);
  assert.equal(app.state.selectedMaterialId, app.state.materialDraft.id);
});
